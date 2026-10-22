import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as app from '../../../src/lib/choices/price'
import { applyChangeSet, type ApplyDeps } from '../../../src/lib/canvas/applyChangeSet'
import type { ChangeSet as AppChangeSet } from '../../../src/lib/canvas/changeCard'
import type { ChoiceDetail } from '../../../src/lib/choices/db'
import type { ChoiceWriters } from '../../../src/lib/choices/applyDeps'
import type { Choice, ChoiceOption } from '../../../src/types/choice'
import * as mirror from './choicePrice'
import {
  choiceSetFromInput, loadChoiceRefs, PROPOSE_CHOICE_CHANGES_TOOL, READ_CHOICES_TOOL, readChoices, resolveChoiceRefs, type ChoiceRefs,
} from './choices'
import type { ChangeSet } from './changeSet'

const G = '0b8e7c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d'
const Y = '4f1c2a9e-7b3d-4c11-9a0e-2f6b8d1e3c55'
const C = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const C2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e'
const MZ = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const HB = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'
const CH = '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80'
const RB = '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091'
const CT = '6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102'
const SEEN = '2026-10-20T14:00:00.123456+00:00'

const parse = (ops: Record<string, unknown>[], title?: string) => {
  const r = choiceSetFromInput({ ...(title ? { title } : {}), ops }, 'k')
  if ('error' in r) throw new Error(r.error)
  return r.set
}
const refused = (ops: Record<string, unknown>[]) => {
  const r = choiceSetFromInput({ ops }, 'k')
  return 'error' in r ? r.error : null
}

const WORK = [
  { id: 'main', label: 'Main bath', description: 'Gut it. Walk-in shower.' },
  { id: 'hall', label: 'Hall bath' },
  { id: 'kids', label: "Kids' bath" },
]
const COLUMNS = [
  { id: 'start', label: 'Earliest start', kind: 'date' as const },
  { id: 'ins', label: 'Insured', kind: 'yesno' as const },
  { id: 'quote', label: 'Quote', kind: 'money' as const },
]
const REFS: ChoiceRefs = {
  choices: [{
    id: C, title: 'Contractor', updated_at: SEEN, goal_title: 'Redo the bathrooms', goal_task_id: G, goal_id: null,
    columns: COLUMNS, work: WORK, options: [{ id: MZ, name: 'Martinez Tile & Bath' }, { id: CH, name: 'Chesapeake Renovations' }],
  }],
  goals: [{ id: G, title: 'Redo the bathrooms', kind: 'task' }, { id: Y, title: 'A calmer house', kind: 'goal' }],
}

describe('choiceSetFromInput', () => {
  it('parses each op kind and refuses bad amounts, dates and statuses', () => {
    const set = parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'option_add', choice_id: C, name: 'Rob (Dave\'s cousin)', phone: '410-555-0119' },
      { op: 'option_status', choice_id: C, option_id: MZ, status: 'heard_back' },
      { op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Earliest start', value: '2026-11-17' },
      { op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Main bath', 'Hall bath'], amount: 27000.5, note: 'excludes fixtures' },
      { op: 'column_add', choice_id: C, column_label: 'Warranty', kind: 'text' },
      { op: 'work_set', choice_id: C, work_labels: ["Kids' bath"], description: 'Tile and fixtures only' },
      { op: 'choice_choose', choice_id: C, option_id: MZ, note: 'Earliest start' },
      { op: 'choice_reopen', choice_id: C },
      { op: 'follow_up', choice_id: C, option_name: 'Rob (Dave\'s cousin)', date: '2026-10-23' },
    ], '10 changes')
    expect(set.key).toBe('k')
    expect(set.title).toBe('10 changes')
    expect(set.ops.map((o) => [o.key, o.op])).toEqual([
      ['k:0', 'choice_add'], ['k:1', 'option_add'], ['k:2', 'option_status'], ['k:3', 'option_set'], ['k:4', 'price_line'],
      ['k:5', 'column_add'], ['k:6', 'work_set'], ['k:7', 'choice_choose'], ['k:8', 'choice_reopen'], ['k:9', 'follow_up'],
    ])
    expect(set.ops[0]).toMatchObject({ choiceTitle: 'Contractor', goalId: G })
    expect(set.ops[1]).toMatchObject({ choiceId: C, optionName: "Rob (Dave's cousin)", phone: '410-555-0119' })
    expect(set.ops[2]).toMatchObject({ optionId: MZ, status: 'heard_back' })
    expect(set.ops[3]).toMatchObject({ columnLabel: 'Earliest start', value: '2026-11-17' })
    expect(set.ops[4]).toMatchObject({ workLabels: ['Main bath', 'Hall bath'], amountCents: 2700050, note: 'excludes fixtures' })
    expect(set.ops[5]).toMatchObject({ columnLabel: 'Warranty', columnKind: 'text' })
    expect(set.ops[6]).toMatchObject({ workLabels: ["Kids' bath"], description: 'Tile and fixtures only' })
    expect(set.ops[7]).toMatchObject({ optionId: MZ, note: 'Earliest start' })
    expect(set.ops[9]).toMatchObject({ optionName: "Rob (Dave's cousin)", date: '2026-10-23' })

    expect(refused([])).toBeTruthy()
    expect(refused([{ op: 'delete_choice', choice_id: C }])).toMatch(/unknown op/)
    expect(refused(Array.from({ length: 41 }, () => ({ op: 'choice_reopen', choice_id: C })))).toMatch(/at most 40/)
    for (const amount of [-1, Number.NaN, Infinity, '27000', undefined]) {
      expect(refused([{ op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Main bath'], amount }])).toMatch(/amount/)
    }
    expect(refused([{ op: 'follow_up', choice_id: C, option_id: MZ, date: '2026-02-30' }])).toMatch(/date/)
    expect(refused([{ op: 'follow_up', choice_id: C, option_id: MZ, date: 'Thursday' }])).toMatch(/date/)
    expect(refused([{ op: 'follow_up', choice_id: C, option_id: MZ }])).toMatch(/date/)
    expect(refused([{ op: 'option_status', choice_id: C, option_id: MZ, status: 'best' }])).toMatch(/status/)
    expect(refused([{ op: 'option_status', choice_id: C, option_id: MZ, status: 'Heard back' }])).toMatch(/status/)
    expect(refused([{ op: 'column_add', choice_id: C, column_label: 'Warranty', kind: 'number' }])).toMatch(/kind/)
    expect(refused([{ op: 'option_status', option_id: MZ, status: 'contacted' }])).toMatch(/choice_id or choice_title/)
    expect(refused([{ op: 'option_status', choice_id: C, status: 'contacted' }])).toMatch(/option_id or option_name/)
    expect(refused([{ op: 'choice_add', choice_title: 'Contractor' }])).toMatch(/goal_id/)
  })
})

describe('resolveChoiceRefs', () => {
  it('resolves same-card references by title and label', () => {
    const set = parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'option_add', choice_title: 'Contractor', name: 'Martinez', phone: '410-555-0142' },
      { op: 'column_add', choice_title: 'Contractor', column_label: 'Warranty', kind: 'text' },
      { op: 'option_set', choice_title: 'Contractor', option_name: 'Martinez', column_label: 'warranty', value: '2 years' },
      { op: 'work_set', choice_title: 'Contractor', work_labels: ['Main bath'], description: 'Gut it' },
      { op: 'price_line', choice_title: 'Contractor', option_name: 'Martinez', work_labels: ['main bath'], amount: 18400 },
    ])
    const r = resolveChoiceRefs(set, { choices: [], goals: REFS.goals })
    if ('error' in r) throw new Error(r.error)
    const [add, opt, col, val, work, price] = r.set.ops
    expect(add).toMatchObject({ goalTaskId: G, goalTitle: 'Redo the bathrooms', choiceTitle: 'Contractor', title: 'Contractor' })
    expect(add.goalId).toBeUndefined()
    expect(opt).toMatchObject({ choiceKey: 'k:0', optionName: 'Martinez', phone: '410-555-0142', goalTitle: 'Redo the bathrooms', choiceTitle: 'Contractor' })
    expect(opt.choiceId).toBeUndefined()
    expect(col.columnId).toMatch(/^[0-9a-f-]{36}$/)
    expect(val).toMatchObject({ choiceKey: 'k:0', optionKey: 'k:1', columnId: col.columnId, columnLabel: 'Warranty', columnKind: 'text', value: '2 years' })
    expect(work.workIds).toHaveLength(1)
    expect(work).toMatchObject({ workLabels: ['Main bath'], description: 'Gut it' })
    expect(price).toMatchObject({ optionKey: 'k:1', workIds: work.workIds, workLabels: ['Main bath'], amountCents: 1840000 })
  })

  it('resolves existing choices, options, columns and pieces, and stamps what was read', () => {
    const set = parse([
      { op: 'option_status', choice_id: C, option_name: 'chesapeake renovations', status: 'heard_back' },
      { op: 'price_line', choice_id: C, option_id: CH, work_labels: ['hall bath', 'Main bath', 'Main bath'], amount: 27000 },
      { op: 'option_set', choice_id: C, option_id: CH, column_label: 'earliest START', value: '2026-12-01' },
      { op: 'option_set', choice_id: C, option_id: CH, column_label: 'Insured', value: 'yes' },
      { op: 'option_set', choice_id: C, option_id: CH, column_label: 'Quote', value: '$19,750' },
      { op: 'work_set', choice_id: C, work_labels: ['main bath'] },
      { op: 'work_set', choice_id: C, work_labels: ['Hall bath'], description: 'Tile only' },
      { op: 'choice_add', goal_id: Y, choice_title: 'Camp' },
    ])
    const r = resolveChoiceRefs(set, REFS)
    if ('error' in r) throw new Error(r.error)
    const ops = r.set.ops
    for (const o of ops.slice(0, 7)) expect(o).toMatchObject({ choiceId: C, choiceTitle: 'Contractor', goalTitle: 'Redo the bathrooms', seen: SEEN })
    expect(ops[0]).toMatchObject({ optionId: CH, optionName: 'Chesapeake Renovations', title: 'Chesapeake Renovations' })
    expect(ops[0].optionKey).toBeUndefined()
    // Work-list order, deduped, labels as the choice has them.
    expect(ops[1]).toMatchObject({ workIds: ['main', 'hall'], workLabels: ['Main bath', 'Hall bath'], amountCents: 2700000 })
    expect(ops[2]).toMatchObject({ columnId: 'start', columnLabel: 'Earliest start', columnKind: 'date', value: '2026-12-01' })
    expect(ops[3]).toMatchObject({ columnId: 'ins', value: true })
    expect(ops[4]).toMatchObject({ columnId: 'quote', value: 1975000 })
    // A piece already there keeps its id and its description unless one is given.
    expect(ops[5]).toMatchObject({ workIds: ['main'], workLabels: ['Main bath'], description: 'Gut it. Walk-in shower.' })
    expect(ops[6]).toMatchObject({ workIds: ['hall'], workLabels: ['Hall bath'], description: 'Tile only' })
    expect(ops[7]).toMatchObject({ goalId: Y, goalTitle: 'A calmer house', choiceTitle: 'Camp' })
    expect(ops[7].goalTaskId).toBeUndefined()
  })

  it('refuses a choice the person cannot see', () => {
    const r = resolveChoiceRefs(parse([{ op: 'choice_reopen', choice_id: C2 }]), REFS)
    expect(r).toEqual({ error: expect.stringContaining('symphony_read_choices') })
    const goal = resolveChoiceRefs(parse([{ op: 'choice_add', goal_id: C2, choice_title: 'Camp' }]), REFS)
    expect(goal).toEqual({ error: expect.stringContaining('symphony_read_plan') })
    const title = resolveChoiceRefs(parse([{ op: 'choice_reopen', choice_title: 'Contractor' }]), REFS)
    expect(title).toEqual({ error: 'No choice "Contractor" in this list or on the goal. Read the choices again (symphony_read_choices) and use their ids.' })
    // An option of another choice, or one not added yet, is not this choice's.
    expect('error' in resolveChoiceRefs(parse([{ op: 'option_status', choice_id: C, option_id: RB, status: 'contacted' }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([
      { op: 'option_status', choice_id: C, option_name: 'Rob', status: 'contacted' },
      { op: 'option_add', choice_id: C, name: 'Rob' },
    ]), REFS)).toBe(true)
  })

  it('refuses a value that does not fit the column', () => {
    const r = resolveChoiceRefs(parse([{ op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Quote', value: 'about twenty grand' }]), REFS)
    expect(r).toEqual({ error: '"about twenty grand" is not a money for Quote' })
    expect('error' in resolveChoiceRefs(parse([{ op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Quote', value: '19.5k' }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([{ op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Insured', value: 'maybe' }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([{ op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Earliest start', value: 'Dec 1' }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([{ op: 'option_set', choice_id: C, option_id: MZ, column_label: 'Warranty', value: '2 years' }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([{ op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Basement'], amount: 100 }]), REFS)).toBe(true)
    // A choice with pieces of work: a price says which it covers.
    expect('error' in resolveChoiceRefs(parse([{ op: 'price_line', choice_id: C, option_id: MZ, amount: 100 }]), REFS)).toBe(true)
    expect('error' in resolveChoiceRefs(parse([{ op: 'column_add', choice_id: C, column_label: 'insured', kind: 'yesno' }]), REFS)).toBe(true)
  })

  it('the app applies what Symphony resolves', async () => {
    const set = parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'column_add', choice_title: 'Contractor', column_label: 'Warranty', kind: 'text' },
      { op: 'work_set', choice_title: 'Contractor', work_labels: ['Main bath'] },
      { op: 'option_add', choice_title: 'Contractor', name: 'Martinez', phone: '410-555-0142' },
      { op: 'price_line', choice_title: 'Contractor', option_name: 'Martinez', work_labels: ['Main bath'], amount: 18400 },
      { op: 'option_set', choice_title: 'Contractor', option_name: 'Martinez', column_label: 'Warranty', value: '5 years' },
      { op: 'follow_up', choice_title: 'Contractor', option_name: 'Martinez', date: '2026-10-23' },
    ], 'A new choice')
    const r = resolveChoiceRefs(set, { choices: [], goals: REFS.goals })
    if ('error' in r) throw new Error(r.error)
    const at = new Date(SEEN)
    const store = new Map<string, ChoiceDetail>()
    let n = 0
    const choice = (id: string, x: Partial<Choice>): Choice => ({ id, userId: 'u', goal: { kind: 'task', id: G }, title: '', status: 'open', decidedWork: [], columns: [], work: [], selectedWork: [], sortOrder: 0, createdAt: at, updatedAt: at, ...x })
    const option = (id: string, choiceId: string, name: string): ChoiceOption => ({ id, choiceId, userId: 'u', name, status: 'considering', statusChangedAt: at, values: {}, sortOrder: 0, updatedAt: at })
    const w: ChoiceWriters = {
      loadChoice: vi.fn(async (id: string) => store.get(id) ?? null),
      createChoice: vi.fn(async (goal, title) => { const c = choice(`ch${++n}`, { goal, title }); store.set(c.id, { choice: c, goalTitle: 'Redo the bathrooms', goalContext: 'family', goalScope: 'compound', options: [], lines: [], followUps: [], contacts: new Map() }); return c }),
      deleteChoice: vi.fn(async () => true),
      updateChoice: vi.fn(async () => true),
      addOption: vi.fn(async (choiceId, input) => option(`opt${++n}`, choiceId, input.name)),
      deleteOption: vi.fn(async () => true),
      updateOption: vi.fn(async () => true),
      addPriceLine: vi.fn(async (optionId, input) => ({ id: `line${++n}`, optionId, workIds: input.workIds, amountCents: input.amountCents, sortOrder: 0 })),
      deletePriceLine: vi.fn(async () => true),
      addContact: vi.fn(async () => `contact${++n}`),
      deleteContact: vi.fn(async () => true),
      createFollowUp: vi.fn(async () => `task${++n}`),
      deleteTask: vi.fn(async () => true),
      chooseOption: vi.fn(async () => true),
      reopenChoice: vi.fn(async () => true),
    }
    const deps: ApplyDeps = {
      managedRecovery: true, tasks: [], updateTask: vi.fn(async () => true), addTask: vi.fn(async () => 'x'), deleteTask: vi.fn(async () => {}),
      weekStart: new Date(2026, 9, 18), choiceWriters: w,
    }
    const applied = await applyChangeSet(r.set as unknown as AppChangeSet, deps)
    expect(applied).toMatchObject({ ok: true })
    const col = r.set.ops[1].columnId!
    const piece = r.set.ops[2].workIds![0]
    expect(w.updateChoice).toHaveBeenNthCalledWith(1, 'ch1', { columns: [{ id: col, label: 'Warranty', kind: 'text' }] })
    expect(w.addPriceLine).toHaveBeenCalledWith(expect.any(String), { workIds: [piece], amountCents: 1840000 })
    expect(w.updateOption).toHaveBeenCalledWith(expect.any(String), { values: { [col]: '5 years' } })
    expect(w.createFollowUp).toHaveBeenCalled()
  })
})

describe('choicePrice mirrors the app', () => {
  it('price mirror matches the app', () => {
    let n = 0
    const line = (workIds: string[], amountCents: number) => ({ id: `l${n++}`, optionId: 'o', workIds, amountCents, sortOrder: n })
    const work = WORK.map(({ id, label }) => ({ id, label }))
    const quotes = [
      [line(['main'], 1840000), line(['hall'], 980000), line(['kids'], 720000)],
      [line(['main'], 2290000), line(['main', 'hall', 'kids'], 4450000)],
      [line(['main'], 1975000), line(['main', 'hall'], 2700000)],
      [line(['main'], 1840000), line(['hall'], 980000), line(['kids'], 720000), line(['main', 'hall'], 2500000)],
      [line(['main'], 1840000), line(['gone'], 100)],
    ]
    const selections = [['main'], ['hall'], ['main', 'hall'], ['main', 'kids'], ['main', 'hall', 'kids'], []]
    for (const lines of quotes) {
      for (const sel of selections) expect(mirror.priceFor(lines, sel, work)).toEqual(app.priceFor(lines, sel, work))
    }
    const flat = [line([], 120000)]
    expect(mirror.priceFor(flat, [], [])).toEqual(app.priceFor(flat, [], []))
    expect(mirror.priceFor([], [], [])).toBeNull()
    for (const ids of [['main', 'hall'], ['main', 'hall', 'kids'], ['kids', 'main'], ['main'], []]) {
      expect(mirror.workLabel(ids, work)).toBe(app.workLabel(ids, work))
    }
    expect(mirror.workLabel(['main', 'hall'], work.slice(0, 2))).toBe(app.workLabel(['main', 'hall'], work.slice(0, 2)))
    for (const c of [1840000, 1840050, 0, 5, 123456789]) expect(mirror.formatCents(c)).toBe(app.formatCents(c))
  })
})

// A read-only fake of the person's RLS client: eq / in / neq filters, ordered
// as stored. Rows absent here are rows RLS hides.
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
  const reads: string[] = []
  return {
    reads,
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q = {
        select: (cols?: string) => { reads.push(`${table}:${cols ?? '*'}`); return q },
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q },
        neq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] !== v); return q },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q },
        order: () => q,
        limit: (k: number) => { rows = rows.slice(0, k); return q },
        then: (ok: (v: { data: Row[]; error: null }) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
      }
      return q
    },
  }
}

const OPT = (id: string, name: string, status: string, x: Row = {}) => ({
  id, choice_id: C, user_id: 'u', name, contact_id: null, status, status_changed_at: SEEN, values: {}, notes: null, sort_order: 0, created_at: SEEN, updated_at: SEEN, ...x,
})
const LINE = (option_id: string, work_ids: string[], amount_cents: number, x: Row = {}) => ({
  id: `${option_id}-${work_ids.join('-')}`, option_id, user_id: 'u', work_ids, amount_cents, note: null, sort_order: 0, created_at: SEEN, updated_at: SEEN, ...x,
})
const MOCKUP: Record<string, Row[]> = {
  choices: [{
    id: C, user_id: 'u', goal_task_id: G, goal_id: null, title: 'Contractor', status: 'open', chosen_option_id: null, decided_at: null,
    decided_note: null, decided_work: [], decided_amount_cents: null, columns: COLUMNS, work: WORK, selected_work: ['main', 'hall'],
    sort_order: 0, created_at: SEEN, updated_at: SEEN,
  }, {
    id: C2, user_id: 'u', goal_task_id: null, goal_id: Y, title: 'Camp', status: 'decided', chosen_option_id: null, decided_at: SEEN,
    decided_note: null, decided_work: [], decided_amount_cents: null, columns: [], work: [], selected_work: [], sort_order: 0, created_at: SEEN, updated_at: SEEN,
  }],
  choice_options: [
    OPT(MZ, 'Martinez Tile & Bath', 'heard_back', { contact_id: CT, values: { start: '2026-11-17', ins: true } }),
    OPT(HB, 'Harbor Bath Remodeling', 'heard_back', { values: { start: '2027-01-05', ins: true } }),
    OPT(CH, 'Chesapeake Renovations', 'heard_back', { values: { start: '2026-12-01', quote: 1975000 } }),
    OPT(RB, "Rob (Dave's cousin)", 'contacted', { status_changed_at: '2026-10-16T15:00:00+00:00' }),
  ],
  choice_price_lines: [
    LINE(MZ, ['main'], 1840000), LINE(MZ, ['hall'], 980000), LINE(MZ, ['kids'], 720000),
    LINE(HB, ['main'], 2290000), LINE(HB, ['main', 'hall', 'kids'], 4450000),
    LINE(CH, ['main'], 1975000), LINE(CH, ['main', 'hall'], 2700000, { note: 'one price' }),
  ],
  contacts: [{ id: CT, name: 'Luis Martinez', phone: '410-555-0142' }],
  tasks: [
    { id: G, title: 'Redo the bathrooms', is_goal: true },
    { id: 'f1', choice_option_id: RB, title: 'Follow up with Rob', scheduled_for: '2026-10-23T04:00:00+00:00', completed: false, waiting_since: '2026-10-16T15:00:00+00:00', created_at: SEEN },
  ],
  goals: [{ id: Y, name: 'A calmer house' }],
}

describe('readChoices', () => {
  it('readChoices reports price for the selection and for all work', async () => {
    const out = JSON.parse(await readChoices(fakeDb(MOCKUP), {}))
    expect(out.choices).toHaveLength(1)
    const [c] = out.choices
    expect(c).toMatchObject({
      id: C, title: 'Contractor', goal: { title: 'Redo the bathrooms', id: G }, status: 'open',
      work: [{ label: 'Main bath', description: 'Gut it. Walk-in shower.' }, { label: 'Hall bath' }, { label: "Kids' bath" }],
      selected_work: ['Main bath', 'Hall bath'],
      columns: [{ label: 'Earliest start', kind: 'date' }, { label: 'Insured', kind: 'yesno' }, { label: 'Quote', kind: 'money' }],
    })
    const by = Object.fromEntries(c.options.map((o: { name: string }) => [o.name, o]))
    expect(by['Martinez Tile & Bath']).toMatchObject({
      id: MZ, status: 'heard_back', contact: { name: 'Luis Martinez', phone: '410-555-0142' },
      values: { 'Earliest start': '2026-11-17', Insured: 'Yes' },
      price_for_selected: '$28,200', price_for_all_work: '$35,400',
      priced: [{ work: 'Main bath', amount: '$18,400' }, { work: 'Hall bath', amount: '$9,800' }, { work: "Kids' bath", amount: '$7,200' }],
    })
    expect(by['Harbor Bath Remodeling']).toMatchObject({ price_for_selected: null, price_for_all_work: '$44,500' })
    expect(by['Harbor Bath Remodeling'].priced).toEqual([{ work: 'Main bath', amount: '$22,900' }, { work: 'All three', amount: '$44,500' }])
    expect(by['Chesapeake Renovations']).toMatchObject({
      price_for_selected: '$27,000', price_for_all_work: null, values: { Quote: '$19,750' },
      priced: [{ work: 'Main bath', amount: '$19,750' }, { work: 'Main bath + Hall bath', amount: '$27,000', note: 'one price' }],
    })
    expect(by["Rob (Dave's cousin)"]).toMatchObject({ status: 'contacted', price_for_selected: null, price_for_all_work: null, waiting_since: '2026-10-16', follow_up: '2026-10-23' })
    expect(by['Martinez Tile & Bath'].waiting_since).toBeNull()
    // Facts only: nothing ranks, sorts by price or marks one.
    expect(JSON.stringify(out)).not.toMatch(/best|recommend|cheapest|rank/i)
  })

  it('reads one goal or one choice, decided ones too', async () => {
    const goal = JSON.parse(await readChoices(fakeDb(MOCKUP), { goal_id: Y }))
    expect(goal.choices.map((c: { title: string }) => c.title)).toEqual(['Camp'])
    expect(goal.choices[0]).toMatchObject({ goal: { title: 'A calmer house', id: Y }, status: 'decided', options: [] })
    const one = JSON.parse(await readChoices(fakeDb(MOCKUP), { choice_id: C }))
    expect(one.choices.map((c: { id: string }) => c.id)).toEqual([C])
    await expect(readChoices(fakeDb(MOCKUP), { choice_id: 'nope' })).rejects.toThrow(/choice_id/)
  })

  it('loadChoiceRefs reads only what the person can see', async () => {
    const db = fakeDb(MOCKUP)
    const refs = await loadChoiceRefs(db, [C, C2, '7a8b9c0d-1e2f-4a3b-8c5d-6e7f80910213'], [G, Y, '8b9c0d1e-2f3a-4b4c-9d6e-7f8091021324'])
    expect(refs.choices.map((c) => [c.id, c.goal_title])).toEqual([[C, 'Redo the bathrooms'], [C2, 'A calmer house']])
    expect(refs.choices[0]).toMatchObject({ updated_at: SEEN, goal_task_id: G, goal_id: null, columns: COLUMNS, work: WORK })
    expect(refs.choices[0].options.map((o) => o.name)).toEqual(['Martinez Tile & Bath', 'Harbor Bath Remodeling', 'Chesapeake Renovations', "Rob (Dave's cousin)"])
    expect(refs.goals).toEqual(expect.arrayContaining([{ id: G, title: 'Redo the bathrooms', kind: 'task' }, { id: Y, title: 'A calmer house', kind: 'goal' }]))
    expect(refs.goals).toHaveLength(2)
    // A task that is not a goal is not a goal a choice can go under.
    const plain = await loadChoiceRefs(fakeDb({ ...MOCKUP, tasks: [{ id: G, title: 'Call the plumber', is_goal: false }] }), [], [G])
    expect(plain.goals).toEqual([])
  })
})

describe('tools and prompt', () => {
  it('names the tools and keeps choice ops off symphony_propose_changes', async () => {
    expect(READ_CHOICES_TOOL.name).toBe('symphony_read_choices')
    expect(PROPOSE_CHOICE_CHANGES_TOOL.name).toBe('symphony_propose_choice_changes')
    const { OP_KINDS } = await import('./changeSet')
    expect(OP_KINDS).not.toContain('choice_add')
    const kinds = (PROPOSE_CHOICE_CHANGES_TOOL.input_schema as { properties: { ops: { items: { properties: { op: { enum: string[] } } } } } }).properties.ops.items.properties.op.enum
    expect(kinds).toEqual(['choice_add', 'option_add', 'option_status', 'option_set', 'price_line', 'column_add', 'work_set', 'choice_choose', 'choice_reopen', 'follow_up'])
    const set: ChangeSet = parse([{ op: 'choice_reopen', choice_id: C }])
    expect(set.ops[0].op).toBe('choice_reopen')
  })

  it('the system prompt forbids ranking choices', () => {
    const src = readFileSync('supabase/functions/symphony-agent/index.ts', 'utf8')
    expect(src).toContain('Never rank options')
    expect(src).toContain('propose every change to them with symphony_propose_choice_changes')
    expect(src).toMatch(/TOOLS = \[[\s\S]*READ_CHOICES_TOOL,[\s\S]*PROPOSE_CHOICE_CHANGES_TOOL,/)
    expect(src).toContain("case 'symphony_read_choices'")
    expect(src).toContain('block.name === PROPOSE_CHOICE_CHANGES_TOOL.name')
  })
})

describe('surfaces', () => {
  it('the wall and onboarding are never offered the choice tools', async () => {
    const { toolAllowed, toolsForSurface } = await import('./wallMode')
    const tools = [READ_CHOICES_TOOL, PROPOSE_CHOICE_CHANGES_TOOL]
    const names = tools.map((t) => t.name)
    for (const surface of ['wall', 'onboarding', 'onboarding_activity'] as const) {
      expect(toolsForSurface(tools, surface).map((t) => t.name)).not.toEqual(expect.arrayContaining([names[0]]))
      expect(toolsForSurface(tools, surface).map((t) => t.name)).not.toEqual(expect.arrayContaining([names[1]]))
      for (const name of names) expect(toolAllowed(name, surface)).toBe(false)
    }
    expect(toolsForSurface(tools, null)).toEqual(tools)
  })
})

describe('review fixes', () => {
  const NEW_REFS: ChoiceRefs = { choices: [], goals: REFS.goals }

  it('option_add links an existing contact the person can see, and makes no new one', async () => {
    const set = parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'option_add', choice_title: 'Contractor', name: 'Luis Martinez', contact_id: CT, phone: '410-555-0142' },
    ])
    expect(set.ops[1]).toMatchObject({ contactId: CT })
    expect(set.ops[1].phone).toBeUndefined()
    expect(refused([{ op: 'option_add', choice_id: C, name: 'Luis', contact_id: 'luis' }])).toMatch(/contact_id/)

    // Absent from the person's contacts: refused, pointing at symphony_list_contacts.
    const hidden = resolveChoiceRefs(set, NEW_REFS)
    expect(hidden).toEqual({ error: expect.stringContaining('symphony_list_contacts') })
    const r = resolveChoiceRefs(set, { ...NEW_REFS, contacts: [{ id: CT, name: 'Luis Martinez' }] })
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[1]).toMatchObject({ contactId: CT, optionName: 'Luis Martinez' })

    // loadChoiceRefs reads the named contacts through the RLS client.
    const refs = await loadChoiceRefs(fakeDb(MOCKUP), [], [G], [CT, '9c0d1e2f-3a4b-4c5d-8e7f-809102132435'])
    expect(refs.contacts).toEqual([{ id: CT, name: 'Luis Martinez' }])

    // The app links it: addOption gets the contact, addContact is never called.
    const at = new Date(SEEN)
    const c: Choice = { id: 'ch1', userId: 'u', goal: { kind: 'task', id: G }, title: 'Contractor', status: 'open', decidedWork: [], columns: [], work: [], selectedWork: [], sortOrder: 0, createdAt: at, updatedAt: at }
    const detail: ChoiceDetail = { choice: c, goalTitle: 'Redo the bathrooms', goalContext: 'family', goalScope: 'compound', options: [], lines: [], followUps: [], contacts: new Map() }
    const addContact = vi.fn(async () => 'contact-new')
    const addOption = vi.fn(async (choiceId: string, input: { name: string; contactId?: string }): Promise<ChoiceOption> => ({ id: 'opt1', choiceId, userId: 'u', name: input.name, contactId: input.contactId, status: 'considering', statusChangedAt: at, values: {}, sortOrder: 0, updatedAt: at }))
    const w = {
      loadChoice: vi.fn(async () => detail), createChoice: vi.fn(async () => c), deleteChoice: vi.fn(async () => true), updateChoice: vi.fn(async () => true),
      addOption, deleteOption: vi.fn(async () => true), updateOption: vi.fn(async () => true), addPriceLine: vi.fn(async () => null), deletePriceLine: vi.fn(async () => true),
      addContact, deleteContact: vi.fn(async () => true), createFollowUp: vi.fn(async () => null), deleteTask: vi.fn(async () => true),
      chooseOption: vi.fn(async () => true), reopenChoice: vi.fn(async () => true),
    } as ChoiceWriters
    const applied = await applyChangeSet(r.set as unknown as AppChangeSet, {
      managedRecovery: true, tasks: [], updateTask: vi.fn(async () => true), addTask: vi.fn(async () => 'x'), deleteTask: vi.fn(async () => {}),
      weekStart: new Date(2026, 9, 18), choiceWriters: w,
    })
    expect(applied).toMatchObject({ ok: true })
    expect(addOption).toHaveBeenCalledWith('ch1', { name: 'Luis Martinez', contactId: CT })
    expect(addContact).not.toHaveBeenCalled()
  })

  it('same-card choice titles and option names match in any case', () => {
    const r = resolveChoiceRefs(parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'option_add', choice_title: 'contractor ', name: 'Martinez' },
      { op: 'option_status', choice_title: 'CONTRACTOR', option_name: 'martinez', status: 'contacted' },
    ]), NEW_REFS)
    if ('error' in r) throw new Error(r.error)
    expect(r.set.ops[1]).toMatchObject({ choiceKey: 'k:0', choiceTitle: 'Contractor' })
    expect(r.set.ops[2]).toMatchObject({ choiceKey: 'k:0', optionKey: 'k:1', optionName: 'Martinez' })
    const twice = resolveChoiceRefs(parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Contractor' },
      { op: 'choice_add', goal_id: G, choice_title: 'contractor' },
    ]), NEW_REFS)
    expect(twice).toEqual({ error: expect.stringMatching(/Two new choices/) })
  })

  it('caps amounts at a billion dollars, in safe integer cents', () => {
    const price = (amount: unknown) => [{ op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Main bath'], amount }]
    expect(parse(price(1_000_000_000)).ops[0].amountCents).toBe(100_000_000_000)
    expect(refused(price(1_000_000_000.01))).toMatch(/amount/)
    expect(refused(price(Number.MAX_SAFE_INTEGER))).toMatch(/amount/)
    expect(refused(price(1e300))).toMatch(/amount/)
  })

  it('an explicit null on an unused optional field is not given', () => {
    const set = parse([
      { op: 'option_add', choice_id: C, name: 'Rob', phone: null, contact_id: null, status: null, date: null, amount: null, note: null, description: null },
      { op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Main bath'], amount: 100, note: null, date: null, status: null },
      { op: 'work_set', choice_id: C, work_labels: ['Hall bath'], description: null },
      { op: 'choice_choose', choice_id: C, option_id: MZ, note: null },
    ])
    expect(set.ops[0].phone).toBeUndefined()
    expect(set.ops[0].contactId).toBeUndefined()
    expect(set.ops[1].note).toBeUndefined()
    expect(set.ops[2].description).toBeUndefined()
    // Still required where the op needs it.
    expect(refused([{ op: 'option_status', choice_id: C, option_id: MZ, status: null }])).toMatch(/status/)
    expect(refused([{ op: 'follow_up', choice_id: C, option_id: MZ, date: null }])).toMatch(/date/)
    expect(refused([{ op: 'price_line', choice_id: C, option_id: MZ, work_labels: ['Main bath'], amount: null }])).toMatch(/amount/)
  })
})

describe('final review fixes', () => {
  it('refuses choosing an option the same card adds to an existing choice (its Undo would fail)', () => {
    const r = resolveChoiceRefs(parse([
      { op: 'option_add', choice_id: C, name: 'Rob' },
      { op: 'choice_choose', choice_id: C, option_name: 'rob', note: 'Cheapest call-back' },
    ]), REFS)
    expect(r).toEqual({ error: expect.stringMatching(/"Rob" is added in this same list.*second card/) })
    // Adding it alone is fine, and so is choosing an option the choice already has.
    expect('set' in resolveChoiceRefs(parse([{ op: 'option_add', choice_id: C, name: 'Rob' }]), REFS)).toBe(true)
    expect('set' in resolveChoiceRefs(parse([
      { op: 'option_add', choice_id: C, name: 'Rob' },
      { op: 'choice_choose', choice_id: C, option_id: MZ },
    ]), REFS)).toBe(true)
    // A choice the same card creates is new as a whole: choosing its new option is fine.
    const made = resolveChoiceRefs(parse([
      { op: 'choice_add', goal_id: G, choice_title: 'Tile shop' },
      { op: 'option_add', choice_title: 'Tile shop', name: 'Shop' },
      { op: 'choice_choose', choice_title: 'Tile shop', option_name: 'Shop' },
    ]), REFS)
    if ('error' in made) throw new Error(made.error)
    expect(made.set.ops[2]).toMatchObject({ choiceKey: 'k:0', optionKey: 'k:1' })
  })

  it('option_status never sets chosen: it points to choice_choose', () => {
    expect(refused([{ op: 'option_status', choice_id: C, option_id: MZ, status: 'chosen' }])).toMatch(/cannot set chosen.*choice_choose/)
    const status = PROPOSE_CHOICE_CHANGES_TOOL.input_schema.properties.ops.items.properties.status
    expect(status.enum).not.toContain('chosen')
    // Resolve refuses it too (a set built some other way).
    const set: ChangeSet = { key: 'k', title: 'x', ops: [{ key: 'k:0', op: 'option_status', title: '', choiceId: C, optionId: MZ, status: 'chosen' }] }
    expect(resolveChoiceRefs(set, REFS)).toEqual({ error: expect.stringMatching(/^Martinez Tile & Bath: option_status cannot set chosen/) })
  })

  it('waiting_since is a Contacted option\'s fact, even with an open follow-up', async () => {
    const db = fakeDb({
      ...MOCKUP,
      tasks: [...MOCKUP.tasks, { id: 'f2', choice_option_id: MZ, title: 'Follow up with Martinez', scheduled_for: '2026-10-20T04:00:00+00:00', completed: false, waiting_since: '2026-10-10T15:00:00+00:00', created_at: SEEN }],
    })
    const [c] = JSON.parse(await readChoices(db, {})).choices
    const by = Object.fromEntries(c.options.map((o: { name: string }) => [o.name, o]))
    expect(by['Martinez Tile & Bath']).toMatchObject({ status: 'heard_back', waiting_since: null, follow_up: '2026-10-20' })
    expect(by["Rob (Dave's cousin)"].waiting_since).toBe('2026-10-16')
  })
})
