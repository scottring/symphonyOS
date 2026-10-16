// src/lib/canvas/changeCard.ts
//
// The change card (spec 2026-10-14): one list of changes Symphony proposes,
// previewed dashed on the page, applied on one Approve with one Undo. These
// types mirror supabase/functions/symphony-agent/changeSet.ts.

import type { Task } from '@/types/task'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { timingRemoval } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'

export type TaskOpKind = 'place' | 'unplace' | 'add' | 'someday' | 'assign' | 'done' | 'merge' | 'talk'
/** Routine ops (stage 3, spec 2026-10-14-routines-talk-first). skip/move/who
 *  change ONE day's occurrence ("this week only"); change/rest/add change the
 *  routine itself ("from now on"). */
export type RoutineOpKind = 'routine_skip' | 'routine_move' | 'routine_who' | 'routine_change' | 'routine_rest' | 'routine_add'
/** Plan ops (stage 5, Month / Season / Year): goals on those lists. Month and
 *  season goals are tasks committed to a period; year goals are `goals` rows
 *  (itemKind). Done, merge and someday for month/season goals reuse the task
 *  ops above. */
export type PlanOpKind = 'plan_add' | 'plan_carry' | 'plan_let_go' | 'plan_done'
export type ChangeOpKind = TaskOpKind | RoutineOpKind | PlanOpKind
export type PlanLevel = 'year' | 'season' | 'month'

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export interface ChangeOp {
  /** Per-item timing for the proposal-only first-activities introduction. */
  capturePlacement?: 'inbox' | 'week' | 'day'
  captureWeekStart?: string
  key: string
  op: ChangeOpKind
  taskId?: string
  /** The task's or routine's current title (resolved server-side), or the new
   *  task's / routine's name for add and routine_add. */
  title: string
  /** YYYY-MM-DD. For routine_skip/move/who: the occurrence's own day. */
  date?: string
  /** HH:MM, 24-hour. routine_move: the new time; routine_change/add: the routine's time. */
  time?: string
  assignee?: string
  assigneeName?: string
  goalId?: string
  /** The task's (or, for routine_change/rest, the routine's) updated_at when Symphony read it. */
  seen?: string
  /** merge: the duplicate that closes into taskId. */
  fromTaskId?: string
  fromTitle?: string
  fromSeen?: string
  /** talk: what to talk about, or with whom ("with Iris"). */
  note?: string
  routineId?: string
  /** routine_move: YYYY-MM-DD the occurrence moves to. */
  toDate?: string
  /** routine_change: the new name. */
  name?: string
  /** routine_change: true = any time of day (clear the time). */
  clearTime?: boolean
  /** routine_change/add: the weekly days. */
  days?: DayKey[]
  /** routine_change/add: who does it, every week. */
  assignees?: string[]
  assigneeNames?: string[]
  /** routine_add/change: shared Today and Week visibility. */
  showOnTimeline?: boolean
  /** routine_rest: YYYY-MM-DD it wakes; none = rest with no date. */
  until?: string
  /** routine_add: the life area. */
  context?: 'family' | 'personal' | 'work'
  /** plan ops: which list. */
  level?: PlanLevel
  /** plan ops: YYYY-MM-DD start of the period the item is on now (or, for
   *  plan_add, the period it is added to). A year is YYYY-01-01. */
  periodStart?: string
  /** plan ops: the period's name as the card says it ("November", "Fall", "2027"). */
  periodLabel?: string
  /** plan_carry: the period it goes to, and its name. */
  toPeriodStart?: string
  toPeriodLabel?: string
  /** plan_carry: true when the target is the very next period (CARRY), false
   *  when it skips ahead (MOVE … to January). */
  toNext?: boolean
  /** plan ops: the item, a task (month/season goal) or a year goal row. */
  itemId?: string
  itemKind?: 'task' | 'goal'
  /** plan_add / plan_carry: the parent goal it serves (season item for a month
   *  goal, year goal for a season goal), and its title. */
  parentId?: string
  parentTitle?: string
  /** plan_carry: the new wording, if the person reworded it. */
  newTitle?: string
}

/** Which heading a row sits under on the card. */
export type OpScope = 'task' | 'week' | 'lasting' | 'plan'
export function opScope(op: ChangeOp): OpScope {
  if (op.op.startsWith('plan_')) return 'plan'
  if (op.op === 'routine_skip' || op.op === 'routine_move' || op.op === 'routine_who') return 'week'
  if (op.op.startsWith('routine_')) return 'lasting'
  return 'task'
}
export const SCOPE_HEADING: Record<OpScope, string> = {
  task: 'Tasks',
  week: 'Routines · this week only',
  lasting: 'Routines · from now on',
  plan: 'Goals',
}

/** The card heading a plan op sits under: the list it changes ("November",
 *  "October", "Fall"). A carry is listed under where it lands. */
export function planHeading(op: ChangeOp): string {
  if (op.op === 'plan_carry') return op.toPeriodLabel ?? 'Goals'
  return op.periodLabel ?? 'Goals'
}

export interface ChangeSet {
  key: string
  title: string
  ops: ChangeOp[]
  /** YYYY-MM-DD: the week being planned (read_week's start). An add with no
   *  day lands in it. */
  weekStart?: string
}

/** What became of the latest card, told to the next turn: Symphony's history
 *  holds only the words, so without this it re-proposes changes already saved
 *  (or ones the person dismissed). */
export interface ChangeCardNote {
  /** Complete proposal-only onboarding state, preserved through corrections. */
  draft?: ChangeSet
  state: 'pending' | 'approved' | 'dismissed'
  title: string
  ops: { op: ChangeOpKind; title: string; where: string; taskId?: string; date?: string; time?: string }[]
  /** ISO time the card reached this state. */
  at: string
}

export function changeCardNote(set: ChangeSet, state: ChangeCardNote['state'], now = new Date()): ChangeCardNote {
  return { state, title: set.title, ops: set.ops.map((op) => ({ op: op.op, title: op.title, where: opRow(op, now).where, ...(op.taskId ? {taskId:op.taskId} : {}), ...(op.date ? {date:op.date} : {}), ...(op.time ? {time:op.time} : {}) })), at: now.toISOString() }
}

/** Tasks with their steps (and Today-group members) laid out flat. The app
 *  holds steps inside their parent's `subtasks`; Symphony reads them as
 *  ordinary tasks, so a set may name one. */
export function withSteps(tasks: readonly Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...(t.subtasks ?? [])])
}

/** The local moment an op names: its date at its time, or at midnight. */
export function opWhen(op: ChangeOp): Date | undefined {
  if (!op.date) return undefined
  const [y, m, d] = op.date.split('-').map(Number)
  const [h, min] = op.time ? op.time.split(':').map(Number) : [0, 0]
  return new Date(y, m - 1, d, h, min)
}

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}`
}

function ymdDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayName(ymd: string, today: Date): string {
  return ymd === localYmd(today) ? 'Today' : ymdDate(ymd).toLocaleDateString('en-US', { weekday: 'short' })
}

/** "Thu 15": an occurrence's day, with its date so "this week only" reads true. */
function dayAndDate(ymd: string): string {
  const d = ymdDate(ymd)
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
}

function dayWords(op: ChangeOp, today: Date): string {
  const day = dayName(op.date!, today)
  return op.time ? `${day} ${clock(op.time)}` : day
}

const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_SHORT: Record<DayKey, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

/** "Every day", "Mon–Thu", "Tue, Thu", "Sat". */
export function daysWords(days: readonly DayKey[]): string {
  const set = new Set(days)
  const sorted = DAY_ORDER.filter((d) => set.has(d))
  if (sorted.length === 7) return 'Every day'
  if (!sorted.length) return 'No day yet'
  const idx = sorted.map((d) => DAY_ORDER.indexOf(d))
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (run && sorted.length >= 3) return `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`
  return sorted.map((d) => DAY_SHORT[d]).join(', ')
}

const names = (list?: string[]) => (list?.length ? list.join(', ') : 'no one')

export type RowKind = 'MOVE' | 'ADD' | 'LATER' | 'WHO' | 'DONE' | 'MERGE' | 'TALK' | 'SKIP' | 'TIME' | 'DAYS' | 'NAME' | 'CHANGE' | 'REST' | 'NEW' | 'CARRY' | 'LET GO' | 'MET'

/** One card row: what kind of change, to what, and where it lands. */
export function opRow(op: ChangeOp, today: Date): { kind: RowKind; title: string; where: string } {
  switch (op.op) {
    case 'place': return { kind: 'MOVE', title: op.title, where: `→ ${dayWords(op, today)}` }
    case 'unplace': return { kind: 'MOVE', title: op.title, where: '→ No day yet' }
    case 'add': return { kind: 'ADD', title: op.title, where: op.date ? dayWords(op, today) : 'No day yet' }
    case 'someday': return { kind: 'LATER', title: op.title, where: '→ Someday' }
    case 'assign': return { kind: 'WHO', title: op.title, where: `→ ${op.assigneeName ?? 'someone'}` }
    case 'done': return { kind: 'DONE', title: op.title, where: '→ Done' }
    case 'merge': return { kind: 'MERGE', title: `${op.fromTitle ?? 'Another task'} + ${op.title}`, where: '→ one, notes kept' }
    case 'talk': return { kind: 'TALK', title: op.title, where: op.note ? `→ Talk about, ${op.note}` : '→ Talk about' }
    case 'routine_skip': return { kind: 'SKIP', title: op.title, where: `${dayAndDate(op.date!)} only` }
    case 'routine_move': {
      const to = dayAndDate(op.toDate!)
      return { kind: 'MOVE', title: op.title, where: `→ ${op.time ? `${to} ${clock(op.time)}` : to} · ${dayAndDate(op.date!)} only` }
    }
    case 'routine_who': return { kind: 'WHO', title: op.title, where: `→ ${op.assigneeName ?? 'someone'}, ${dayAndDate(op.date!)} only` }
    case 'routine_change': {
      const parts: string[] = []
      const kinds: RowKind[] = []
      if (op.days) { parts.push(daysWords(op.days)); kinds.push('DAYS') }
      if (op.time) { parts.push(clock(op.time)); kinds.push('TIME') }
      if (op.clearTime) { parts.push('any time'); kinds.push('TIME') }
      if (op.assignees) { parts.push(names(op.assigneeNames)); kinds.push('WHO') }
      if (op.showOnTimeline !== undefined) { parts.push(op.showOnTimeline ? 'Show in Today and Week' : 'Hidden from Today and Week · Kept in Routines'); kinds.push('CHANGE') }
      if (op.name) kinds.push('NAME')
      const kind: RowKind = new Set(kinds).size === 1 ? kinds[0] : 'CHANGE'
      const title = op.name ? `${op.title} → ${op.name}` : op.title
      return { kind, title, where: parts.length ? `→ ${parts.join(' ')}` : '' }
    }
    case 'routine_rest': return { kind: 'REST', title: op.title, where: op.until ? `→ until ${ymdDate(op.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '→ resting' }
    case 'plan_add': return { kind: 'NEW', title: op.title, where: `→ ${op.periodLabel ?? 'the list'}${op.parentTitle ? `, for ${op.parentTitle}` : ''}` }
    case 'plan_carry': {
      const to = op.toPeriodLabel ?? 'next'
      return { kind: op.toNext === false ? 'MOVE' : 'CARRY', title: op.title, where: op.newTitle ? `→ ${to}, as “${op.newTitle}”` : `→ ${to}` }
    }
    case 'plan_let_go': return { kind: 'LET GO', title: op.title, where: '→ Let go' }
    case 'plan_done': return op.level === 'year' ? { kind: 'MET', title: op.title, where: '→ Met' } : { kind: 'DONE', title: op.title, where: '→ Done' }
    case 'routine_add': {
      const when = [op.days ? daysWords(op.days) : null, op.time ? clock(op.time) : null,
        op.showOnTimeline === undefined ? null : op.showOnTimeline ? '· Show in Today and Week' : '· Hidden from Today and Week · Kept in Routines'].filter(Boolean).join(' ')
      return { kind: 'NEW', title: op.title, where: when ? `→ ${when}` : '' }
    }
  }
}

/** The write for a task op, and what it changes, for Undo. The same writes
 *  Week's own gestures send (drop on a day, back to still to place, Someday). */
export function opWrite(op: ChangeOp, task: Task): { updates: Partial<Task>; previous: Partial<Task> } {
  const before = (updates: Partial<Task>) => ({
    updates,
    previous: Object.fromEntries(Object.keys(updates).map((k) => [k, task[k as keyof Task]])) as Partial<Task>,
  })
  switch (op.op) {
    case 'place': {
      const when = opWhen(op)!
      return before(op.time
        ? { scheduledFor: when, isAllDay: false, bucket: 'timed' }
        : lineDropUpdates(task, { kind: 'day', at: when }))
    }
    case 'unplace': return timingRemoval(task, 'day')
    case 'someday': return before({ bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    case 'assign': return before({ assignedTo: op.assignee, assignedToAll: op.assignee ? [op.assignee] : [] })
    case 'talk': {
      // Off its day and onto the talk-about list (here and on the wall).
      const off = task.scheduledFor ? timingRemoval(task, 'day') : { updates: {}, previous: {} }
      const flag: Partial<Task> = { needsDiscussion: true, ...(op.note ? { discussionNote: op.note } : {}) }
      return {
        updates: { ...off.updates, ...flag },
        previous: { ...off.previous, needsDiscussion: task.needsDiscussion ?? false, ...(op.note ? { discussionNote: task.discussionNote } : {}) },
      }
    }
    default: throw new Error(`${op.op} is not a plain task write`)
  }
}
