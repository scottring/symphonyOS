import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskContext } from '@/types/task'
import {
  dbChoiceToChoice, dbOptionToOption, dbLineToLine,
  type Choice, type ChoiceOption, type PriceLine, type FollowUp, type GoalRef, type OptionStatus,
  type DbChoice, type DbChoiceOption, type DbPriceLine, type ColumnKind, type CellValue,
} from '@/types/choice'
import { priceFor } from './price'

export type Db = Pick<SupabaseClient, 'from'>

export interface ChoiceDetail {
  choice: Choice
  goalTitle: string
  goalContext: TaskContext | null
  goalScope: string
  options: ChoiceOption[]
  lines: PriceLine[]
  followUps: FollowUp[]
  contacts: Map<string, { name: string; phone?: string }>
}
export interface ChoiceRow { choice: Choice; options: ChoiceOption[]; followUps: FollowUp[] }

interface DbFollowUpTask {
  id: string
  choice_option_id: string
  title: string
  scheduled_for: string | null
  completed: boolean
  waiting_since: string | null
}

function mapFollowUp(t: DbFollowUpTask): FollowUp {
  return {
    taskId: t.id,
    optionId: t.choice_option_id,
    title: t.title,
    scheduledFor: t.scheduled_for ? new Date(t.scheduled_for) : undefined,
    completed: !!t.completed,
    waitingSince: t.waiting_since ? new Date(t.waiting_since) : undefined,
  }
}

async function fetchOptions(db: Db, choiceIds: string[]): Promise<ChoiceOption[] | null> {
  if (choiceIds.length === 0) return []
  const { data, error } = await db.from('choice_options').select('*').in('choice_id', choiceIds)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (error || !data) return null
  return (data as DbChoiceOption[]).map(dbOptionToOption)
}

async function fetchFollowUps(db: Db, optionIds: string[]): Promise<FollowUp[] | null> {
  if (optionIds.length === 0) return []
  const { data, error } = await db.from('tasks')
    .select('id, choice_option_id, title, scheduled_for, completed, waiting_since')
    .in('choice_option_id', optionIds).order('created_at', { ascending: false })
  if (error || !data) return null
  return (data as DbFollowUpTask[]).map(mapFollowUp)
}

async function assemble(db: Db, choices: Choice[]): Promise<ChoiceRow[] | null> {
  const options = await fetchOptions(db, choices.map((c) => c.id))
  if (!options) return null
  const followUps = await fetchFollowUps(db, options.map((o) => o.id))
  if (!followUps) return null
  return choices.map((choice) => {
    const opts = options.filter((o) => o.choiceId === choice.id)
    const ids = new Set(opts.map((o) => o.id))
    return { choice, options: opts, followUps: followUps.filter((f) => ids.has(f.optionId)) }
  })
}

/** null = a read failed (not the same as no choices). */
export async function listChoicesForGoal(db: Db, goal: GoalRef): Promise<ChoiceRow[] | null> {
  const { data, error } = await db.from('choices').select('*')
    .eq(goal.kind === 'task' ? 'goal_task_id' : 'goal_id', goal.id)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (error || !data) return null
  return assemble(db, (data as DbChoice[]).map(dbChoiceToChoice))
}

export async function listOpenChoices(db: Db): Promise<ChoiceRow[] | null> {
  const { data, error } = await db.from('choices').select('*').eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error || !data) return null
  return assemble(db, (data as DbChoice[]).map(dbChoiceToChoice))
}

export async function loadChoice(db: Db, id: string): Promise<ChoiceDetail | null> {
  const { data, error } = await db.from('choices').select('*').eq('id', id).single()
  if (error || !data) return null
  const choice = dbChoiceToChoice(data as DbChoice)

  const goalRes = choice.goal.kind === 'task'
    ? await db.from('tasks').select('title, context, scope').eq('id', choice.goal.id).single()
    : await db.from('goals').select('name, context, scope').eq('id', choice.goal.id).single()
  if (goalRes.error || !goalRes.data) return null
  const g = goalRes.data as { title?: string; name?: string; context: string | null; scope: string | null }

  const options = await fetchOptions(db, [id])
  if (!options) return null
  const optionIds = options.map((o) => o.id)
  let lines: PriceLine[] = []
  if (optionIds.length > 0) {
    const res = await db.from('choice_price_lines').select('*').in('option_id', optionIds)
      .order('sort_order', { ascending: true })
    if (res.error || !res.data) return null
    lines = (res.data as DbPriceLine[]).map(dbLineToLine)
  }
  const followUps = await fetchFollowUps(db, optionIds)
  if (!followUps) return null

  const contacts = new Map<string, { name: string; phone?: string }>()
  const contactIds = [...new Set(options.map((o) => o.contactId).filter((c): c is string => !!c))]
  if (contactIds.length > 0) {
    const res = await db.from('contacts').select('id, name, phone').in('id', contactIds)
    if (res.error || !res.data) return null
    for (const c of res.data as { id: string; name: string; phone: string | null }[]) {
      contacts.set(c.id, { name: c.name, phone: c.phone ?? undefined })
    }
  }

  return {
    choice,
    goalTitle: g.title ?? g.name ?? '',
    goalContext: (g.context as TaskContext | null) ?? null,
    goalScope: g.scope || 'individual',
    options, lines, followUps, contacts,
  }
}

export async function createChoice(db: Db, userId: string, goal: GoalRef, title: string): Promise<Choice | null> {
  const row = { user_id: userId, [goal.kind === 'task' ? 'goal_task_id' : 'goal_id']: goal.id, title }
  const { data, error } = await db.from('choices').insert(row).select().single()
  if (error || !data) return null
  return dbChoiceToChoice(data as DbChoice)
}

export async function updateChoice(
  db: Db, id: string,
  patch: Partial<Pick<DbChoice, 'title' | 'columns' | 'work' | 'selected_work' | 'status' | 'chosen_option_id' | 'decided_at' | 'decided_note' | 'decided_work' | 'decided_amount_cents'>>,
): Promise<boolean> {
  const { error } = await db.from('choices').update(patch).eq('id', id)
  return !error
}

export async function deleteChoice(db: Db, id: string): Promise<boolean> {
  const { error } = await db.from('choices').delete().eq('id', id)
  return !error
}

export async function addOption(
  db: Db, userId: string, choiceId: string,
  input: { name: string; contactId?: string; status?: OptionStatus },
): Promise<ChoiceOption | null> {
  const row: Record<string, unknown> = { user_id: userId, choice_id: choiceId, name: input.name }
  if (input.contactId) row.contact_id = input.contactId
  if (input.status) row.status = input.status
  const { data, error } = await db.from('choice_options').insert(row).select().single()
  if (error || !data) return null
  return dbOptionToOption(data as DbChoiceOption)
}

export async function updateOption(
  db: Db, id: string,
  patch: Partial<Pick<DbChoiceOption, 'name' | 'contact_id' | 'status' | 'values' | 'notes'>>,
): Promise<boolean> {
  const payload: Record<string, unknown> = { ...patch }
  if (patch.status !== undefined) payload.status_changed_at = new Date().toISOString()
  const { error } = await db.from('choice_options').update(payload).eq('id', id)
  return !error
}

export async function deleteOption(db: Db, id: string): Promise<boolean> {
  const { error } = await db.from('choice_options').delete().eq('id', id)
  return !error
}

export async function addPriceLine(
  db: Db, userId: string, optionId: string,
  input: { workIds: string[]; amountCents: number; note?: string },
): Promise<PriceLine | null> {
  const row: Record<string, unknown> = {
    user_id: userId, option_id: optionId, work_ids: input.workIds, amount_cents: input.amountCents,
  }
  if (input.note) row.note = input.note
  const { data, error } = await db.from('choice_price_lines').insert(row).select().single()
  if (error || !data) return null
  return dbLineToLine(data as DbPriceLine)
}

export async function updatePriceLine(
  db: Db, id: string,
  patch: Partial<Pick<DbPriceLine, 'work_ids' | 'amount_cents' | 'note'>>,
): Promise<boolean> {
  const { error } = await db.from('choice_price_lines').update(patch).eq('id', id)
  return !error
}

export async function deletePriceLine(db: Db, id: string): Promise<boolean> {
  const { error } = await db.from('choice_price_lines').delete().eq('id', id)
  return !error
}

export async function createFollowUp(
  db: Db, userId: string,
  detail: Pick<ChoiceDetail, 'choice' | 'goalContext' | 'goalScope'>,
  option: ChoiceOption, on: Date,
): Promise<string | null> {
  const day = new Date(on.getFullYear(), on.getMonth(), on.getDate())
  const goal = detail.choice.goal
  const row: Record<string, unknown> = {
    title: `Follow up with ${option.name}`,
    user_id: userId,
    scheduled_for: day.toISOString(),
    is_all_day: true,
    bucket: 'timed',
    is_waiting: true,
    waiting_since: new Date().toISOString(),
    waiting_for: option.name,
    contact_id: option.contactId ?? null,
    choice_option_id: option.id,
    context: detail.goalContext,
    scope: detail.goalScope || 'individual',
  }
  if (goal.kind === 'task') row.goal_task_id = goal.id
  else row.goal_id = goal.id
  const { data, error } = await db.from('tasks').insert(row).select('id').single()
  if (error || !data) return null
  return (data as { id: string }).id
}

/** Deletes a follow-up task. RLS turns a forbidden DELETE into zero rows with
 *  no error, so only a returned row counts as deleted. */
export async function deleteFollowUp(db: Db, taskId: string): Promise<boolean> {
  const { data, error } = await db.from('tasks').delete().eq('id', taskId).select('id')
  return !error && ((data ?? []) as { id: string }[]).some((r) => r.id === taskId)
}

export async function chooseOption(
  db: Db, detail: ChoiceDetail, optionId: string, note: string | null, now: Date,
): Promise<boolean> {
  const { choice } = detail
  const option = detail.options.find((o) => o.id === optionId)
  if (!option) return false
  const optionLines = detail.lines.filter((l) => l.optionId === optionId)
  const amount = priceFor(optionLines, choice.selectedWork, choice.work)?.totalCents ?? null

  const first = await db.from('choice_options')
    .update({ status: 'chosen', status_changed_at: now.toISOString() }).eq('id', optionId)
  if (first.error) return false
  const second = await db.from('choices').update({
    status: 'decided',
    chosen_option_id: optionId,
    decided_at: now.toISOString(),
    decided_note: note,
    decided_work: choice.selectedWork,
    decided_amount_cents: amount,
  }).eq('id', choice.id)
  if (second.error) {
    await db.from('choice_options')
      .update({ status: option.status, status_changed_at: option.statusChangedAt.toISOString() }).eq('id', optionId)
    return false
  }
  return true
}

export async function reopenChoice(db: Db, detail: ChoiceDetail): Promise<boolean> {
  const { choice } = detail
  if (choice.chosenOptionId) {
    const first = await db.from('choice_options')
      .update({ status: 'heard_back', status_changed_at: new Date().toISOString() })
      .eq('id', choice.chosenOptionId)
    if (first.error) return false
  }
  const second = await db.from('choices').update({
    status: 'open', chosen_option_id: null, decided_at: null, decided_note: null,
    decided_work: [], decided_amount_cents: null,
  }).eq('id', choice.id)
  return !second.error
}

/** Typed cell input. undefined = not valid for that kind; null = cleared. */
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
