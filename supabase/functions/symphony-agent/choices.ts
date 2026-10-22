// Choices in chat (spec 2026-10-22-choices, "Chat"). Symphony reads a goal's
// choices (options, their prices and values, who is waiting) and PROPOSES
// changes to them on the change card; nothing here writes. The page applies
// the card on Save (src/lib/canvas/applyChangeSet.ts), whose well-formed
// checks the resolved sets below must pass.
//
// Facts only: the read reports what is recorded and the arithmetic on each
// option's own lines. Nothing ranks, scores or marks an option.

import type { CellValue, ChangeOp, ChangeSet, ChoiceColumn, ChoiceOpKind, ColumnKind, OptionStatus } from './changeSet.ts'
import { formatCents, liveLines, orderLines, priceFor, workLabel, type PriceLine, type WorkPiece } from './choicePrice.ts'
import { realDate } from './readPlan.ts'
import { local } from './readWeek.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
type Read<T> = { data: T[] | null; error: { message?: string } | null }
const rows = <T>(r: Read<T>, what: string): T[] => {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message ?? 'unknown error'}`)
  return r.data ?? []
}

export const CHOICE_OP_KINDS: readonly ChoiceOpKind[] = ['choice_add', 'option_add', 'option_status', 'option_set', 'price_line', 'column_add', 'work_set', 'choice_choose', 'choice_reopen', 'follow_up']
const KINDS = new Set<string>(CHOICE_OP_KINDS)
/** Ops that act on one option (applyChangeSet's OPTION_LEVEL). */
const OPTION_LEVEL = new Set<ChoiceOpKind>(['option_status', 'option_set', 'price_line', 'choice_choose', 'follow_up'])
export const OPTION_STATUSES: readonly OptionStatus[] = ['considering', 'contacted', 'heard_back', 'ruled_out', 'chosen']
/** option_status sets these; Chosen comes only with deciding the choice (choice_choose). */
const SETTABLE_STATUSES: readonly OptionStatus[] = OPTION_STATUSES.filter((s) => s !== 'chosen')
const CHOSEN_BY_CHOOSING = (at: string) => `${at}: option_status cannot set chosen. Use choice_choose for the option instead; it marks the option Chosen and decides the choice.`
const STATUS_LABEL: Record<OptionStatus, string> = { considering: 'Considering', contacted: 'Contacted', heard_back: 'Heard back', ruled_out: 'Ruled out', chosen: 'Chosen' }
const COLUMN_KINDS: readonly ColumnKind[] = ['text', 'money', 'date', 'yesno']
const MAX_OPS = 40
const MAX_NAME = 200
const MAX_NOTE = 300
const MAX_TEXT = 1000
const MAX_CHOICES = 50
const MAX_AMOUNT = 1_000_000_000
/** Optional fields where an explicit null means "not given". */
const NULL_IS_ABSENT = ['status', 'date', 'amount', 'phone', 'note', 'description', 'contact_id'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const text = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const fold = (a: string) => a.trim().toLowerCase()

/** Typed cell input, as src/lib/choices/db.ts parseCell reads it.
 *  undefined = not valid for that kind; null = cleared. */
export function parseCell(kind: ColumnKind, raw: string): CellValue | undefined {
  const s = raw.trim()
  if (s === '') return null
  switch (kind) {
    case 'text':
      return s
    case 'money': {
      const n = s.replace(/^\$/, '').replace(/,/g, '')
      if (!/^\d+(\.\d{1,2})?$/.test(n)) return undefined
      return Math.round(parseFloat(n) * 100)
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return undefined
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : undefined
    }
    case 'yesno': {
      const v = s.toLowerCase()
      if (v === 'yes' || v === 'y' || v === 'true') return true
      if (v === 'no' || v === 'n' || v === 'false') return false
      return undefined
    }
  }
}

// ── Tools ───────────────────────────────────────────────────────────

export const READ_CHOICES_TOOL = {
  name: 'symphony_read_choices' as const,
  description: 'Read the choices on goals: options being compared (contractors, schools, camps), with each option\'s status, contact, values by column, priced lines, and the price for the selected work and for all the work (null when its lines do not cover exactly that work), who is waiting since when, and follow-up dates. With no input: every open choice the person can see. goal_id: the choices on that goal (a month or season goal task id, or a year goal id, from symphony_read_plan), decided ones too. choice_id: that one choice. Use it before answering a question about a choice and before proposing changes to one.',
  input_schema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string', description: 'Optional: a goal id; its choices, open and decided' },
      choice_id: { type: 'string', description: 'Optional: one choice id' },
    },
  },
}

export const PROPOSE_CHOICE_CHANGES_TOOL = {
  name: 'symphony_propose_choice_changes' as const,
  description: 'Propose ONE list of changes to choices (options compared on a goal), shown as a change card in chat. Nothing is saved until the person saves it. Every change to a choice goes here, even a single one; never on symphony_propose_changes. Name an existing choice by choice_id and an existing option by option_id (from symphony_read_choices); name one added earlier in this same list by its choice_title or option_name. Ops: choice_add (goal_id from symphony_read_plan, choice_title), option_add (name; contact_id when the person names someone already in their contacts, found with symphony_list_contacts, else an optional phone), option_status (status; never chosen: choosing is choice_choose), option_set (column_label, value as the person said it: money like "$19,750", a date YYYY-MM-DD, yes or no, or text; an empty value clears it), price_line (work_labels: the pieces of work this one price covers, together; amount in dollars; optional note), column_add (column_label, kind), work_set (work_labels: [one piece], optional description; an existing piece gets the new description), choice_choose (the option chosen, optional note: the reason in their words), choice_reopen, follow_up (the option, date YYYY-MM-DD). Use the person\'s words; never add a column, value or price they did not give. Each call replaces the card: send the whole list so far.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short heading, e.g. "Chesapeake\'s quote"' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: [...CHOICE_OP_KINDS] },
            goal_id: { type: 'string', description: 'choice_add: the goal it goes under, a month or season goal task id or a year goal id, from symphony_read_plan' },
            choice_id: { type: 'string', description: 'An existing choice id (from symphony_read_choices)' },
            choice_title: { type: 'string', description: 'choice_add: the new choice\'s title (e.g. "Contractor"). Other ops: the title of a choice_add earlier in this list' },
            option_id: { type: 'string', description: 'An existing option id (from symphony_read_choices)' },
            option_name: { type: 'string', description: 'The name of an option_add earlier in this list (or an existing option\'s exact name)' },
            name: { type: 'string', description: 'option_add: the option\'s name, e.g. "Martinez Tile & Bath"' },
            contact_id: { type: 'string', description: 'option_add, optional: an existing contact (from symphony_list_contacts) to link. Prefer it whenever the person names someone already in their contacts; phone is then ignored' },
            phone: { type: 'string', description: 'option_add, optional, for someone not in contacts: a phone number; saved as a new contact' },
            status: { type: 'string', enum: [...SETTABLE_STATUSES], description: 'option_status: considering, contacted, heard_back or ruled_out (to choose an option, use choice_choose)' },
            column_label: { type: 'string', description: 'option_set: an existing column or one added earlier in this list; column_add: the new column\'s label' },
            kind: { type: 'string', enum: [...COLUMN_KINDS], description: 'column_add: text, money, date or yesno' },
            value: { type: 'string', description: 'option_set: the value, read by the column\'s kind' },
            work_labels: { type: 'array', items: { type: 'string' }, description: 'price_line: the pieces of work one price covers; work_set: [the piece]' },
            description: { type: 'string', description: 'work_set: what the piece of work is, in the person\'s words' },
            amount: { type: 'number', description: 'price_line: dollars, e.g. 19750 or 18400.50 (at most 1,000,000,000)' },
            note: { type: 'string', description: 'price_line: e.g. "excludes fixtures"; choice_choose: the reason, in their words' },
            date: { type: 'string', description: 'follow_up: YYYY-MM-DD' },
          },
          required: ['op'],
        },
      },
    },
    required: ['ops'],
  },
}

// ── symphony_read_choices ───────────────────────────────────────────

type ChoiceRow = {
  id: string; title: string; status: 'open' | 'decided'; goal_task_id: string | null; goal_id: string | null
  chosen_option_id: string | null; decided_at: string | null; decided_note: string | null; decided_work: string[] | null
  decided_amount_cents: number | string | null; columns: ChoiceColumn[] | null; work: WorkPiece[] | null; selected_work: string[] | null
  updated_at: string
}
type OptionRow = { id: string; choice_id: string; name: string; contact_id: string | null; status: OptionStatus; status_changed_at: string; values: Record<string, CellValue> | null; notes: string | null }
type LineRow = { id: string; option_id: string; work_ids: string[] | null; amount_cents: number | string; note: string | null; sort_order: number }
type FollowUpRow = { id: string; choice_option_id: string; scheduled_for: string | null; completed: boolean; waiting_since: string | null }

const CHOICE_COLS = 'id, title, status, goal_task_id, goal_id, chosen_option_id, decided_at, decided_note, decided_work, decided_amount_cents, columns, work, selected_work, updated_at'

/** A value as the comparison shows it. */
function cellText(kind: ColumnKind, value: CellValue): string | null {
  if (value == null || value === '') return null
  if (kind === 'money' && typeof value === 'number') return formatCents(value)
  if (kind === 'yesno' && typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

const priced = (lines: readonly PriceLine[], work: readonly WorkPiece[]) =>
  lines.map((l) => {
    const label = workLabel(l.workIds, work)
    return { ...(label ? { work: label } : {}), amount: formatCents(l.amountCents), ...(l.note ? { note: l.note } : {}) }
  })

/** Goal titles: month and season goals are tasks (is_goal), year goals are goals rows. */
async function goalTitles(db: Db, taskIds: string[], goalIds: string[]): Promise<{ id: string; title: string; kind: 'task' | 'goal' }[]> {
  const [t, g] = await Promise.all([
    taskIds.length ? db.from('tasks').select('id, title').in('id', taskIds).eq('is_goal', true) : { data: [], error: null },
    goalIds.length ? db.from('goals').select('id, name').in('id', goalIds) : { data: [], error: null },
  ])
  return [
    ...rows<{ id: string; title: string }>(t, 'goals').map((r) => ({ id: r.id, title: r.title, kind: 'task' as const })),
    ...rows<{ id: string; name: string }>(g, 'year goals').map((r) => ({ id: r.id, title: r.name, kind: 'goal' as const })),
  ]
}

/** symphony_read_choices, through the person's RLS client: a choice they
 *  cannot see is simply absent. JSON text. */
export async function readChoices(db: Db, input: { goal_id?: unknown; choice_id?: unknown }): Promise<string> {
  let found: ChoiceRow[]
  if (input.choice_id !== undefined && input.choice_id !== null) {
    if (!isId(input.choice_id)) throw new Error('choice_id must be a choice id from symphony_read_choices')
    found = rows(await db.from('choices').select(CHOICE_COLS).eq('id', input.choice_id), 'the choice')
  } else if (input.goal_id !== undefined && input.goal_id !== null) {
    if (!isId(input.goal_id)) throw new Error('goal_id must be a goal id from symphony_read_plan')
    const [a, b] = await Promise.all([
      db.from('choices').select(CHOICE_COLS).eq('goal_task_id', input.goal_id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(MAX_CHOICES),
      db.from('choices').select(CHOICE_COLS).eq('goal_id', input.goal_id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(MAX_CHOICES),
    ])
    found = [...rows<ChoiceRow>(a, 'the choices'), ...rows<ChoiceRow>(b, 'the choices')]
  } else {
    found = rows(await db.from('choices').select(CHOICE_COLS).eq('status', 'open').order('created_at', { ascending: true }).limit(MAX_CHOICES), 'the choices')
  }
  if (!found.length) return JSON.stringify({ choices: [], note: 'No choices here that this person can see.' })

  const choiceIds = found.map((c) => c.id)
  const options = rows<OptionRow>(await db.from('choice_options').select('id, choice_id, name, contact_id, status, status_changed_at, values, notes')
    .in('choice_id', choiceIds).order('sort_order', { ascending: true }).order('created_at', { ascending: true }), 'the options')
  const optionIds = options.map((o) => o.id)
  const contactIds = [...new Set(options.map((o) => o.contact_id).filter((c): c is string => !!c))]
  const [linesRead, followRead, contactsRead, goals] = await Promise.all([
    optionIds.length ? db.from('choice_price_lines').select('id, option_id, work_ids, amount_cents, note, sort_order').in('option_id', optionIds).order('sort_order', { ascending: true }) : { data: [], error: null },
    optionIds.length ? db.from('tasks').select('id, choice_option_id, scheduled_for, completed, waiting_since').in('choice_option_id', optionIds).order('created_at', { ascending: false }) : { data: [], error: null },
    contactIds.length ? db.from('contacts').select('id, name, phone').in('id', contactIds) : { data: [], error: null },
    goalTitles(db, [...new Set(found.flatMap((c) => (c.goal_task_id ? [c.goal_task_id] : [])))], [...new Set(found.flatMap((c) => (c.goal_id ? [c.goal_id] : [])))]),
  ])
  const lines = rows<LineRow>(linesRead, 'the prices').map((l): PriceLine & { optionId: string } => ({
    id: l.id, optionId: l.option_id, workIds: l.work_ids ?? [], amountCents: Number(l.amount_cents), ...(l.note ? { note: l.note } : {}), sortOrder: l.sort_order,
  }))
  const followUps = rows<FollowUpRow>(followRead, 'the follow-ups')
  const contacts = new Map(rows<{ id: string; name: string; phone: string | null }>(contactsRead, 'the contacts').map((c) => [c.id, c]))
  const goalTitle = new Map(goals.map((g) => [g.id, g.title]))
  const day = (iso: string | null) => (iso ? local(iso).date : null)

  const choices = found.map((c) => {
    const columns = c.columns ?? []
    const work = c.work ?? []
    const selected = c.selected_work ?? []
    const goalRef = (c.goal_task_id ?? c.goal_id)!
    const opts = options.filter((o) => o.choice_id === c.id).map((o) => {
      const own = lines.filter((l) => l.optionId === o.id)
      const shown = work.length === 0 ? own : orderLines(liveLines(own, work), work)
      const forSelected = priceFor(own, selected, work)
      const forAll = priceFor(own, work.map((w) => w.id), work)
      // The newest open follow-up (the page's waiting fact).
      const follow = followUps.find((f) => f.choice_option_id === o.id && !f.completed)
      const contact = o.contact_id ? contacts.get(o.contact_id) : undefined
      const values: Record<string, string> = {}
      for (const col of columns) {
        const v = cellText(col.kind, (o.values ?? {})[col.id] ?? null)
        if (v !== null) values[col.label] = v
      }
      return {
        id: o.id,
        name: o.name,
        status: o.status,
        status_label: STATUS_LABEL[o.status] ?? o.status,
        status_since: day(o.status_changed_at),
        ...(contact ? { contact: { name: contact.name, ...(contact.phone ? { phone: contact.phone } : {}) } } : {}),
        values,
        priced: priced(shown, work),
        price_for_selected: forSelected ? formatCents(forSelected.totalCents) : null,
        ...(forSelected ? { selected_adds_up: priced(forSelected.lines, work) } : {}),
        price_for_all_work: forAll ? formatCents(forAll.totalCents) : null,
        ...(forAll ? { all_work_adds_up: priced(forAll.lines, work) } : {}),
        // Waiting is a Contacted option's fact (the page's "N waiting").
        waiting_since: o.status === 'contacted' ? day(follow?.waiting_since ?? o.status_changed_at) : null,
        follow_up: day(follow?.scheduled_for ?? null),
        ...(o.notes ? { notes: o.notes } : {}),
      }
    })
    const chosen = c.chosen_option_id ? options.find((o) => o.id === c.chosen_option_id) : undefined
    return {
      id: c.id,
      title: c.title,
      goal: { title: goalTitle.get(goalRef) ?? '', id: goalRef },
      status: c.status,
      work: work.map((w) => ({ label: w.label, ...(w.description ? { description: w.description } : {}) })),
      selected_work: work.filter((w) => selected.includes(w.id)).map((w) => w.label),
      columns: columns.map((col) => ({ label: col.label, kind: col.kind })),
      options: opts,
      ...(c.status === 'decided' ? {
        decided: {
          option: chosen?.name ?? null,
          on: day(c.decided_at),
          work: workLabel(c.decided_work ?? [], work) || null,
          amount: c.decided_amount_cents == null ? null : formatCents(Number(c.decided_amount_cents)),
          ...(c.decided_note ? { note: c.decided_note } : {}),
        },
      } : {}),
    }
  })
  return JSON.stringify({ choices })
}

// ── symphony_propose_choice_changes ─────────────────────────────────

/** The model's call, checked and shaped. References by title, name or label
 *  are kept as given here (choiceTitle, optionName, columnLabel, workLabels,
 *  a raw string value) and resolved by resolveChoiceRefs. */
export function choiceSetFromInput(input: Record<string, unknown>, key: string): { set: ChangeSet } | { error: string } {
  const raw = Array.isArray(input.ops) ? input.ops : null
  if (!raw || !raw.length) return { error: 'Provide at least one op' }
  if (raw.length > MAX_OPS) return { error: `Propose at most ${MAX_OPS} changes at a time` }
  const ops: ChangeOp[] = []
  for (let i = 0; i < raw.length; i++) {
    const at = `Op ${i + 1}`
    const given = raw[i] as Record<string, unknown> | null
    if (!given || typeof given !== 'object') return { error: `${at} is not an object` }
    const o: Record<string, unknown> = { ...given }
    for (const k of NULL_IS_ABSENT) if (o[k] === null) delete o[k]
    if (typeof o.op !== 'string' || !KINDS.has(o.op)) return { error: `${at}: unknown op "${String(o.op)}" (use ${CHOICE_OP_KINDS.slice(0, -1).join(', ')} or ${CHOICE_OP_KINDS[CHOICE_OP_KINDS.length - 1]})` }
    const op = o.op as ChoiceOpKind
    const base: ChangeOp = { key: `${key}:${i}`, op, title: '' }

    // Checked whatever the op, so a bad one is never silently dropped.
    if (o.status !== undefined && (typeof o.status !== 'string' || !(OPTION_STATUSES as readonly string[]).includes(o.status))) {
      return { error: `${at}: status must be one of ${OPTION_STATUSES.join(', ')}` }
    }
    if (o.date !== undefined && !realDate(o.date)) return { error: `${at}: date must be a real YYYY-MM-DD date` }
    if (o.amount !== undefined && (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount < 0 || o.amount > MAX_AMOUNT || !Number.isSafeInteger(Math.round(o.amount * 100)))) {
      return { error: `${at}: amount must be a number of dollars, 0 to ${MAX_AMOUNT.toLocaleString('en-US')} (e.g. 19750)` }
    }
    if (o.contact_id !== undefined && !isId(o.contact_id)) return { error: `${at}: contact_id must be a contact id from symphony_list_contacts` }

    if (op === 'choice_add') {
      if (!isId(o.goal_id)) return { error: `${at}: choice_add needs goal_id, a goal id from symphony_read_plan` }
      const title = text(o.choice_title, MAX_NAME)
      if (!title) return { error: `${at}: choice_add needs choice_title, e.g. "Contractor"` }
      base.goalId = o.goal_id
      base.choiceTitle = title
      base.title = title
      ops.push(base)
      continue
    }

    if (isId(o.choice_id)) base.choiceId = o.choice_id
    else if (text(o.choice_title, MAX_NAME)) base.choiceTitle = text(o.choice_title, MAX_NAME)
    else return { error: `${at}: name the choice with choice_id or choice_title` }

    if (OPTION_LEVEL.has(op)) {
      if (isId(o.option_id)) base.optionId = o.option_id
      else if (text(o.option_name, MAX_NAME)) base.optionName = text(o.option_name, MAX_NAME)
      else return { error: `${at}: name the option with option_id or option_name` }
    }

    switch (op) {
      case 'option_add': {
        const name = text(o.name, MAX_NAME)
        if (!name) return { error: `${at}: option_add needs a name` }
        base.optionName = name
        // An existing contact is linked; a phone makes a new one only without it.
        if (isId(o.contact_id)) base.contactId = o.contact_id
        else {
          const phone = text(o.phone, 40)
          if (phone) base.phone = phone
        }
        break
      }
      case 'option_status':
        if (o.status === undefined) return { error: `${at}: option_status needs a status (${SETTABLE_STATUSES.join(', ')})` }
        if (o.status === 'chosen') return { error: CHOSEN_BY_CHOOSING(at) }
        base.status = o.status as OptionStatus
        break
      case 'option_set': {
        const label = text(o.column_label, MAX_NAME)
        if (!label) return { error: `${at}: option_set needs column_label` }
        if (o.value === undefined || o.value === null || !['string', 'number', 'boolean'].includes(typeof o.value)) return { error: `${at}: option_set needs a value (an empty string clears it)` }
        base.columnLabel = label
        base.value = String(o.value).slice(0, MAX_TEXT)
        break
      }
      case 'price_line': {
        if (o.amount === undefined) return { error: `${at}: price_line needs an amount in dollars` }
        base.amountCents = Math.round((o.amount as number) * 100)
        if (o.work_labels !== undefined && (!Array.isArray(o.work_labels) || !o.work_labels.every((l) => typeof l === 'string' && l.trim()))) {
          return { error: `${at}: work_labels must be a list of pieces of work` }
        }
        base.workLabels = ((o.work_labels as string[] | undefined) ?? []).map((l) => l.trim().slice(0, MAX_NAME))
        const note = text(o.note, MAX_NOTE)
        if (note) base.note = note
        break
      }
      case 'column_add': {
        const label = text(o.column_label, MAX_NAME)
        if (!label) return { error: `${at}: column_add needs column_label` }
        if (typeof o.kind !== 'string' || !(COLUMN_KINDS as readonly string[]).includes(o.kind)) return { error: `${at}: kind must be one of ${COLUMN_KINDS.join(', ')}` }
        base.columnLabel = label
        base.columnKind = o.kind as ColumnKind
        break
      }
      case 'work_set': {
        const labels = Array.isArray(o.work_labels) ? o.work_labels : []
        const label = labels.length === 1 ? text(labels[0], MAX_NAME) : ''
        if (!label) return { error: `${at}: work_set needs work_labels with exactly one piece of work` }
        base.workLabels = [label]
        const description = text(o.description, MAX_TEXT)
        if (description) base.description = description
        break
      }
      case 'choice_choose': {
        const note = text(o.note, MAX_NOTE)
        if (note) base.note = note
        break
      }
      case 'follow_up':
        if (o.date === undefined) return { error: `${at}: follow_up needs a date (YYYY-MM-DD)` }
        base.date = o.date as string
        break
    }
    ops.push(base)
  }
  const title = text(input.title, 120) || (ops.length === 1 ? '1 change' : `${ops.length} changes`)
  return { set: { key, title, ops } }
}

export type ChoiceRefs = {
  choices: { id: string; title: string; updated_at: string; goal_title: string; goal_task_id: string | null; goal_id: string | null; columns: ChoiceColumn[]; work: WorkPiece[]; options: { id: string; name: string }[] }[]
  goals: { id: string; title: string; kind: 'task' | 'goal' }[]
  /** The contacts option_add ops link (contact_id), as the person can see them. */
  contacts?: { id: string; name: string }[]
}

/** What resolving a choice card needs: the choices it names (with their
 *  options, columns and work) and the goals a choice_add names. Through the
 *  person's RLS client: what they cannot see is simply absent. Throws when a
 *  read fails. */
export async function loadChoiceRefs(db: Db, choiceIds: string[], goalIds: string[], contactIds: string[] = []): Promise<ChoiceRefs> {
  const ids = [...new Set(choiceIds.filter(isId))]
  const found = ids.length
    ? rows<ChoiceRow>(await db.from('choices').select('id, title, updated_at, goal_task_id, goal_id, columns, work').in('id', ids), 'the choices')
    : []
  const options = found.length
    ? rows<{ id: string; choice_id: string; name: string }>(await db.from('choice_options').select('id, choice_id, name').in('choice_id', found.map((c) => c.id))
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }), 'the options')
    : []
  const wanted = [...new Set(goalIds.filter(isId))]
  const goals = await goalTitles(db,
    [...new Set([...wanted, ...found.flatMap((c) => (c.goal_task_id ? [c.goal_task_id] : []))])],
    [...new Set([...wanted, ...found.flatMap((c) => (c.goal_id ? [c.goal_id] : []))])])
  const title = new Map(goals.map((g) => [g.id, g.title]))
  const linked = [...new Set(contactIds.filter(isId))]
  const contacts = linked.length
    ? rows<{ id: string; name: string }>(await db.from('contacts').select('id, name').in('id', linked), 'the contacts').map((c) => ({ id: c.id, name: c.name }))
    : []
  return {
    choices: found.map((c) => ({
      id: c.id, title: c.title, updated_at: c.updated_at,
      goal_title: title.get((c.goal_task_id ?? c.goal_id)!) ?? '',
      goal_task_id: c.goal_task_id, goal_id: c.goal_id,
      columns: c.columns ?? [], work: c.work ?? [],
      options: options.filter((o) => o.choice_id === c.id).map((o) => ({ id: o.id, name: o.name })),
    })),
    goals,
    contacts,
  }
}

/** A choice as this card builds it up: existing columns, work and options
 *  plus the ones added earlier in the set. */
type Running = {
  ref: { choiceId: string; seen: string } | { choiceKey: string }
  title: string
  goalTitle: string
  columns: ChoiceColumn[]
  work: WorkPiece[]
  existing: { id: string; name: string }[]
  added: { key: string; name: string }[]
}

const readAgain = 'Read the choices again (symphony_read_choices) and use their ids.'

/** Names, labels and ids checked against what the person can see and what
 *  this set adds before it, then filled in as the page applies them. */
export function resolveChoiceRefs(set: ChangeSet, refs: ChoiceRefs): { set: ChangeSet } | { error: string } {
  const goals = new Map(refs.goals.map((g) => [g.id, g]))
  const known = new Map(refs.choices.map((c) => [c.id, c]))
  const contacts = new Set((refs.contacts ?? []).map((c) => c.id))
  const running = new Map<string, Running>()
  const newByTitle = new Map<string, Running>()
  const ops: ChangeOp[] = []

  for (const op of set.ops) {
    const next: ChangeOp = { ...op }
    if (op.op === 'choice_add') {
      const goal = goals.get(op.goalId!)
      if (!goal) return { error: `No goal ${op.goalId} that this person can see. Read the plan (symphony_read_plan) and use its ids.` }
      const title = op.choiceTitle!
      if (newByTitle.has(fold(title))) return { error: `Two new choices are titled "${title}". Give each its own title.` }
      delete next.goalId
      if (goal.kind === 'task') next.goalTaskId = goal.id
      else next.goalId = goal.id
      next.goalTitle = goal.title
      const r: Running = { ref: { choiceKey: op.key }, title, goalTitle: goal.title, columns: [], work: [], existing: [], added: [] }
      running.set(op.key, r)
      newByTitle.set(fold(title), r)
      ops.push(next)
      continue
    }

    // The choice: an existing one by id, or a choice_add earlier in the set by title.
    let c: Running | undefined
    if (op.choiceId) {
      c = running.get(op.choiceId)
      if (!c) {
        const k = known.get(op.choiceId)
        if (!k) return { error: `No choice ${op.choiceId} that this person can see. ${readAgain}` }
        c = { ref: { choiceId: k.id, seen: k.updated_at }, title: k.title, goalTitle: k.goal_title, columns: [...k.columns], work: [...k.work], existing: k.options, added: [] }
        running.set(k.id, c)
      }
    } else {
      c = newByTitle.get(fold(op.choiceTitle!))
      if (!c) return { error: `No choice "${op.choiceTitle}" in this list or on the goal. ${readAgain}` }
    }
    delete next.choiceId
    delete next.choiceKey
    if ('choiceId' in c.ref) { next.choiceId = c.ref.choiceId; next.seen = c.ref.seen } else next.choiceKey = c.ref.choiceKey
    next.choiceTitle = c.title
    next.goalTitle = c.goalTitle
    next.title = c.title

    // The option: an existing one by id, an option_add earlier in the set by
    // name, or an existing one by its exact name (any case).
    if (OPTION_LEVEL.has(op.op as ChoiceOpKind)) {
      delete next.optionId
      delete next.optionKey
      if (op.optionId) {
        const o = c.existing.find((x) => x.id === op.optionId)
        if (!o) return { error: `No option ${op.optionId} on ${c.title}. ${readAgain}` }
        next.optionId = o.id
        next.optionName = o.name
      } else {
        const name = op.optionName!
        const added = c.added.find((x) => same(x.name, name))
        const o = added ? undefined : c.existing.find((x) => same(x.name, name))
        if (added) {
          // On an existing choice, the journal's Undo cannot take back a
          // decision that points at an option the same card adds.
          if (op.op === 'choice_choose' && 'choiceId' in c.ref) {
            return { error: `"${added.name}" is added in this same list, so choosing it here could not be undone. Propose adding it without choice_choose; once that card is saved, choose it in a second card.` }
          }
          next.optionKey = added.key; next.optionName = added.name
        }
        else if (o) { next.optionId = o.id; next.optionName = o.name }
        else return { error: `No option "${name}" in this list or on ${c.title}. ${readAgain}` }
      }
      next.title = next.optionName!
    }

    switch (op.op) {
      case 'option_status':
        if (op.status === 'chosen') return { error: CHOSEN_BY_CHOOSING(next.optionName ?? 'This change') }
        break
      case 'option_add':
        if (op.contactId && !contacts.has(op.contactId)) {
          return { error: `No contact ${op.contactId} that this person can see. List the contacts again (symphony_list_contacts) and use their ids.` }
        }
        c.added.push({ key: op.key, name: op.optionName! })
        next.title = op.optionName!
        break
      case 'column_add': {
        const label = op.columnLabel!
        if (c.columns.some((x) => same(x.label, label))) return { error: `${c.title} already has a column "${label}". Set values in it with option_set.` }
        next.columnId = crypto.randomUUID()
        c.columns.push({ id: next.columnId, label, kind: op.columnKind! })
        next.title = label
        break
      }
      case 'option_set': {
        const col = c.columns.find((x) => same(x.label, op.columnLabel!))
        if (!col) return { error: `No column "${op.columnLabel}" on ${c.title}. Add it first with column_add.` }
        const value = parseCell(col.kind, String(op.value ?? ''))
        if (value === undefined) return { error: `"${op.value}" is not a ${col.kind} for ${col.label}` }
        next.columnId = col.id
        next.columnLabel = col.label
        next.columnKind = col.kind
        next.value = value
        break
      }
      case 'work_set': {
        const label = op.workLabels![0]
        const piece = c.work.find((x) => same(x.label, label))
        if (piece) {
          // The page replaces the piece whole: keep its description unless a new one is given.
          const description = op.description ?? piece.description
          next.workIds = [piece.id]
          next.workLabels = [piece.label]
          if (description) next.description = description
          const updated: WorkPiece = { id: piece.id, label: piece.label, ...(description ? { description } : {}) }
          c.work = c.work.map((x) => (x.id === piece.id ? updated : x))
        } else {
          const id = crypto.randomUUID()
          next.workIds = [id]
          c.work.push({ id, label, ...(op.description ? { description: op.description } : {}) })
        }
        next.title = next.workLabels![0]
        break
      }
      case 'price_line': {
        const labels = op.workLabels ?? []
        if (c.work.length && !labels.length) {
          return { error: `${c.title} has pieces of work (${c.work.map((w) => w.label).join(', ')}): say which this price covers with work_labels.` }
        }
        const ids = new Set<string>()
        for (const label of labels) {
          const piece = c.work.find((x) => same(x.label, label))
          if (!piece) return { error: `No piece of work "${label}" on ${c.title}. Add it first with work_set.` }
          ids.add(piece.id)
        }
        const pieces = c.work.filter((w) => ids.has(w.id))
        next.workIds = pieces.map((w) => w.id)
        next.workLabels = pieces.map((w) => w.label)
        break
      }
    }
    ops.push(next)
  }
  return { set: { ...set, ops } }
}
