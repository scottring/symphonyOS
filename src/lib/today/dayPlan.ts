/**
 * The day's plan: what Today's main list draws, and what waits in the Today pin.
 *
 * Today used to expand EVERYTHING eligible for the day into its main list — each
 * untimed task dated today and each flexible routine occurrence — so a weekend
 * of weekly chores read as a wall (Scott, 2026-09-19). The main list is now what
 * the day is committed to at a time, plus what was deliberately CHOSEN for it:
 *
 *   main       appointments, anything with a time, pinned-to-timeline routines,
 *              and tasks/occurrences chosen for this day (`planned_on`)
 *   scheduled  untimed tasks DATED today but not chosen — commitments, never
 *              relabelled optional; they wait in the pin, counted on Today
 *   available  untimed routine occurrences for today — a choice
 *   week/month this week's and month's lists — a choice, folded by default
 *
 * Every entry appears ONCE, in its most specific group. A chosen entry stays
 * in its group marked planned (the main list is where it is worked), so the
 * pin never shows it twice as unfinished work.
 *
 * Pure and filter-complete: the same inputs Today's data layer receives —
 * layer-filtered tasks, the assignee lens, the hide-daily preference, the
 * resolveRoutine ladder — so a row the page may not show can never be counted
 * here, and the pin and Today's reopen line agree by construction.
 *
 * Never writes.
 */
import type { Task } from '@/types/task'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { AssigneeFilter } from './types'
import type { Layer } from '@/lib/domains'
import { makeAssigneeFilter } from './assigneeFilter'
import { selectTimed, type Match } from './taskPools'
import { buildRoutineStatusMap, selectVisibleRoutines } from './statusMaps'
import { buildRoutineDayItems } from './grouping'
import { deferredInRoutineIds } from './deferredRoutines'
import { groupRoutineSteps } from './routineCollections'
import { selectHorizonPool } from './horizons'
import { selectCarriedOver } from './taskPools'
import { localYmd } from '@/lib/cadence/config'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { isTimelineObligation, type ResolveRoutineCtx } from '@/lib/routineUtils'
import { isFocused, openCommitment } from '@/lib/placement/model'
import { selectStaleWeekPlacements } from './horizons'
import { isRecentMiss, isMissedPlacement, missedWhen } from '@/lib/week/missedPlacement'
import { routineTemporalLabel } from '@/lib/planning/routineTemporal'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

export type DayPlanGroup = 'carried' | 'scheduled' | 'available' | 'week' | 'month' | 'plan' | 'unfinished'

export interface DayPlanEntry {
  /** Stable React key and drag id: 'task:<id>' or 'routine:<entityId>'. */
  key: string
  kind: 'task' | 'routine'
  /** Task id, or the routine (collection parent) id — the instance entity. */
  id: string
  title: string
  completed: boolean
  /** Chosen for the viewed day — it is on the main list. */
  planned: boolean
  group: DayPlanGroup
  task?: Task
  /** The routine row as the timeline would draw it (collection progress etc.). */
  item?: TimelineItem
  /** A routine with no day of its own yet (the "To plan" list carries the
   *  definition, not an occurrence). */
  routine?: Routine
  /** One small line that explains the row without another category to learn:
   *  "Originally Saturday", "Weekly routine", "September plan". */
  context?: string
}

export interface DayPlan {
  /** Yesterday's (and the day before's) unfinished commitments, inside
   *  Today's grace window and not yet chosen for today. Computed for years
   *  (selectCarriedOver) but drawn nowhere since 2026-09-03; the walkthrough
   *  of 2026-09-20 found Week saying "Didn't happen · 3" while Today said
   *  nothing. Only on the real today. */
  carried: DayPlanEntry[]
  scheduled: DayPlanEntry[]
  available: DayPlanEntry[]
  week: DayPlanEntry[]
  month: DayPlanEntry[]
  /** Outstanding (not done, not chosen) — what Today's reopen line counts. */
  counts: { scheduled: number; available: number }
  /** Task ids the main list must NOT draw (dated today, not chosen). */
  offMainTaskIds: Set<string>
  /** Routine timeline item ids the main list must NOT draw. */
  offMainRoutineItemIds: Set<string>
  /** Chosen tasks that no other main-list pool reaches (week/month/inbox rows,
   *  or dated to another day) — the main list adds these. */
  plannedExtraTasks: Task[]
  /** The week's list (Scott, 2026-09-21): what is waiting to be scheduled in
   *  the week being planned — its undated tasks and routines with no day yet —
   *  each once, with a line of context. Once a row has a day it leaves this
   *  list and appears on that day. Unfinished work from earlier is NOT here. */
  toPlan: DayPlanEntry[]
  /** Unfinished work from earlier — misses inside the 14-day window and week
   *  placements left behind — newest first, shown only on request ("Include
   *  unfinished from earlier"). It never floods the week's list. */
  unfinished: DayPlanEntry[]
  /** Open misses older than the 14-day window: not on the list (Inbox ›
   *  Expired holds them), but the panel says they exist. Count only. */
  olderUnfinished: number
}

export interface DayPlanInput {
  /** Layer-filtered already, exactly as Today receives them. */
  tasks: Task[]
  routines: Routine[]
  /** Instances touching the viewed day (getInstancesForDate). */
  dateInstances: ActionableInstance[]
  viewedDate: Date
  selectedAssignee: AssigneeFilter
  hideRoutines: boolean
  layers: ReadonlySet<Layer>
  weekStart: Date
  /** Whose day this is. Focus is personal (task_focus, one row per person);
   *  without it, any person's choice for the day counts. */
  userId?: string | null
  /** Weekly routines with no day of their own (lib/week/unhomedRoutines) —
   *  the week page's "needs a day" set. They join the To plan list as
   *  definition rows. */
  unhomedRoutines?: Routine[]
  /** "Now" for the unfinished-work window; defaults to the wall clock. */
  now?: Date
}

export function routineResolveCtx(input: Pick<DayPlanInput, 'viewedDate' | 'selectedAssignee' | 'hideRoutines' | 'layers' | 'dateInstances'>): ResolveRoutineCtx {
  return {
    date: input.viewedDate,
    member: input.selectedAssignee,
    prefs: { hideRoutines: input.hideRoutines, layers: input.layers },
    deferredInto: deferredInRoutineIds(input.dateInstances, input.viewedDate),
  }
}

/**
 * This week's list, as rows. The ONE definition of "on this week's list":
 * the Today pin and /week's own column both call this, so the two surfaces
 * cannot disagree about which rows belong to a week (Scott, 2026-09-19).
 * `ymd` is the day "Planned today" is judged against; `userId` is whose
 * choice that is (focus is personal).
 */
export function weekListEntries(tasks: Task[], match: Match, weekStart: Date, ymd: string, userId?: string | null): DayPlanEntry[] {
  return selectHorizonPool(tasks, 'week', match, weekStart).map((t) => ({
    key: `task:${t.id}`, kind: 'task' as const, id: t.id, title: t.title, completed: t.completed,
    planned: isFocused(t, userId, ymd), group: 'week' as const, task: t,
  }))
}

/**
 * The week's list (Scott, 2026-09-21). Two kinds of row answer the same
 * practical question — "what is waiting to be scheduled this week?":
 *
 *   this week    this week's undated tasks — "September plan" when the row
 *                also sits on a month list, otherwise no line at all
 *   routines     flexible occurrences for the day ("Weekly routine") and
 *                weekly routines with no day of their own ("Weekly · no set day")
 *
 * Each action appears once. A row with a day is on that day, not here; a row
 * chosen for the viewed day is on the main list, not here.
 *
 * Unfinished work from earlier used to lead this list, oldest first. On a
 * real account that was 23 rows of what didn't happen above 0 rows of what
 * was intended (2026-09-21): the list said "triage" where it should say
 * "choose". It now has its own list, `unfinishedEntries`, opened on request.
 */
export function toPlanEntries(args: {
  tasks: Task[]
  match: Match
  weekStart: Date
  ymd: string
  userId?: string | null
  /** The day's flexible routine occurrences (selectDayPlan's `available`). */
  available: DayPlanEntry[]
  /** Weekly routines with no day of their own (definition rows). */
  unhomed: Routine[]
  /** The visible routines by id, for the occurrence rows' cadence line. */
  routineById: Map<string, Routine>
}): DayPlanEntry[] {
  const { tasks, match, weekStart, ymd, userId } = args
  const seen = new Set<string>()
  const out: DayPlanEntry[] = []
  const push = (e: DayPlanEntry) => { if (!seen.has(e.key)) { seen.add(e.key); out.push(e) } }
  const chosen = (t: Task) => isFocused(t, userId, ymd)
  const monthName = (t: Task): string | undefined => {
    const m = openCommitment(t, 'month')?.periodStart ?? (t.bucket === 'month' ? t.monthStart : undefined)
    return m ? `${m.toLocaleDateString('en-US', { month: 'long' })} plan` : undefined
  }

  // This week's undated tasks. A row chosen for the day is on the main list,
  // with Unfocus on its own row (Scott, 2026-09-21) — not kept here as a
  // duplicate just to undo the choice.
  for (const t of selectHorizonPool(tasks, 'week', match, weekStart)) {
    if (t.scheduledFor || chosen(t)) continue
    push({
      key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed,
      planned: false, group: 'plan', task: t, context: monthName(t),
    })
  }

  // Routines: the day's flexible occurrences, then routines with no day at all.
  for (const e of args.available) {
    if (e.planned) continue
    const r = args.routineById.get(e.id)
    push({ ...e, group: 'plan', context: r ? routineCadence(r) : 'Routine' })
  }
  for (const r of args.unhomed) {
    push({
      key: `routine:${r.id}`, kind: 'routine', id: r.id, title: r.name, completed: false, planned: false,
      group: 'plan', routine: r, context: `${routineCadence(r)} · no set day`,
    })
  }
  return out
}

/**
 * Unfinished work from earlier, on request: a dated task whose day passed
 * inside the 14-day window (the missed-placement rule) — "Originally Saturday"
 * — or a week placement left behind by an earlier week — "Planned for
 * Sep 6–12". NEWEST first: what slipped on Saturday is more actionable than
 * what slipped two weeks ago. Misses older than the window are not here
 * (Inbox › Expired holds them). A row chosen for the viewed day is on the
 * main list, not here.
 *
 * "Left behind" is judged against the REAL current week, never the week on
 * screen: paging /week forward must not relabel this week's open placements
 * as unfinished (the old shelf anchored on today for the same reason).
 */
export function unfinishedEntries(args: {
  tasks: Task[]
  match: Match
  ymd: string
  userId?: string | null
  now: Date
}): DayPlanEntry[] {
  const { tasks, match, ymd, userId, now } = args
  const chosen = (t: Task) => isFocused(t, userId, ymd)
  const currentWeek = weekStartAnchor(now, readCadenceConfig().weekStartsOn)
  const missed = flatten(tasks)
    .filter((t) => !t.completed && match(t.assignedTo, t.assignedToAll) && !chosen(t) && isRecentMiss(t.scheduledFor, t.completed, now))
  const leftBehind = selectStaleWeekPlacements(tasks, currentWeek, match).filter((t) => !t.scheduledFor && !chosen(t))
  const seen = new Set<string>()
  const when = (t: Task) => (t.scheduledFor ?? t.weekStart ?? t.createdAt).getTime()
  return [...missed, ...leftBehind]
    .filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    .sort((a, b) => when(b) - when(a))
    .map((t) => ({
      key: `task:${t.id}`, kind: 'task' as const, id: t.id, title: t.title, completed: t.completed,
      planned: false, group: 'unfinished' as const, task: t,
      context: t.scheduledFor
        ? `Originally ${missedWhen(t.scheduledFor, now, 'long')}`
        : t.weekStart ? `Planned for ${formatWeekRangeShort(t.weekStart)}` : 'Unfinished',
    }))
}

/** "Daily routine" / "Weekly routine" / "Monthly routine" — the cadence, not the rule. */
function routineCadence(r: Routine): string {
  const t = r.recurrence_pattern?.type
  const word = t === 'daily' ? 'Daily' : t === 'weekly' ? 'Weekly' : t === 'monthly' ? 'Monthly' : t === 'yearly' ? 'Yearly' : null
  return word ? `${word} routine` : `${routineTemporalLabel(r)} routine`
}

/** Tasks and their nested subtasks, flat. */
function flatten(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...(t.subtasks ?? [])])
}

/** The routine (or collection parent) id an item belongs to, and whether it is a collection. */
function routineIdOf(item: TimelineItem): string | null {
  if (item.id.startsWith('routine-collection-')) return item.id.slice('routine-collection-'.length)
  if (item.id.startsWith('routine-')) return item.id.slice('routine-'.length).replace(/#\d+$/, '')
  return null
}

export function selectDayPlan(input: DayPlanInput): DayPlan {
  const ymd = localYmd(input.viewedDate)
  const match = makeAssigneeFilter(input.selectedAssignee)

  // ── Tasks ──────────────────────────────────────────────────────────────
  const onDay = selectTimed(input.tasks, input.viewedDate, match)
  const onDayIds = new Set(onDay.map((t) => t.id))
  const scheduled: DayPlanEntry[] = []
  const offMainTaskIds = new Set<string>()
  const chosen = (t: Task) => isFocused(t, input.userId, ymd)
  // Scott, 2026-09-21: Today shows what you scheduled for today plus what
  // you chose to focus on. Scheduling is sufficient — a dated task is on its
  // day; focus orders and highlights, it never gates visibility. So no task
  // is kept off the main list any more; `scheduled` stays as the record of
  // what is dated today (counts, tests), and `offMainTaskIds` is empty.
  for (const t of onDay) {
    if (!t.isAllDay) continue // a time is a commitment the main list keeps
    const planned = chosen(t)
    scheduled.push({ key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed, planned, group: 'scheduled', task: t })
  }

  const plannedExtraTasks = flatten(input.tasks).filter((t) =>
    chosen(t) && !onDayIds.has(t.id) && match(t.assignedTo, t.assignedToAll))

  // ── Routine occurrences ────────────────────────────────────────────────
  const ctx = routineResolveCtx(input)
  const visible = selectVisibleRoutines(input.routines, ctx)
  const statusMap = buildRoutineStatusMap(input.dateInstances)
  const plannedEntities = new Set(
    input.dateInstances
      .filter((i) => i.entity_type === 'routine' && i.planned_on === ymd)
      .map((i) => i.entity_id),
  )
  // An occurrence moved to another day is not today's at all — neither the
  // main list's nor the pin's.
  const movedAway = new Set(
    input.dateInstances
      .filter((i) => i.entity_type === 'routine' && i.status === 'deferred' && i.deferred_to && i.date === ymd
        && localYmd(new Date(i.deferred_to)) !== ymd)
      .map((i) => i.entity_id),
  )
  const byId = new Map(visible.map((r) => [r.id, r]))
  const available: DayPlanEntry[] = []
  const offMainRoutineItemIds = new Set<string>()
  for (const item of buildRoutineDayItems(visible, input.viewedDate, statusMap)) {
    if (item.startTime) continue // timed: the main list's
    const rid = routineIdOf(item)
    if (!rid || movedAway.has(rid)) continue
    const routine = byId.get(rid)
    // Tracked obligations (PT exercises) are pinned to the timeline on purpose.
    if (routine && isTimelineObligation(routine)) continue
    // A collection whose time lives on its parent row ("Kids bedtime routine,
    // 7pm", steps untimed) is a timed commitment even when no step has a time.
    if (routine?.time_of_day) continue
    const planned = plannedEntities.has(rid)
    if (!planned) offMainRoutineItemIds.add(item.id)
    available.push({
      key: `routine:${rid}`, kind: 'routine', id: rid, title: item.title,
      completed: item.completed, planned, group: 'available', item,
    })
  }

  // ── The week's and month's lists ───────────────────────────────────────
  const listEntry = (group: 'week' | 'month' | 'carried') => (t: Task): DayPlanEntry => ({
    key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed,
    planned: chosen(t), group, task: t,
  })
  const week = weekListEntries(input.tasks, match, input.weekStart, ymd, input.userId)
  const isToday = ymd === localYmd(new Date())
  const carried = selectCarriedOver(input.tasks, isToday, match).filter((t) => !chosen(t)).map(listEntry('carried'))
  const month = selectHorizonPool(input.tasks, 'month', match, undefined, monthStartOf(input.viewedDate)).map(listEntry('month'))

  const now = input.now ?? new Date()
  const toPlan = toPlanEntries({
    tasks: input.tasks, match, weekStart: input.weekStart, ymd, userId: input.userId,
    available, unhomed: input.unhomedRoutines ?? [], routineById: byId,
  })
  const unfinished = unfinishedEntries({ tasks: input.tasks, match, ymd, userId: input.userId, now })
  const olderUnfinished = flatten(input.tasks).filter((t) =>
    !t.completed && match(t.assignedTo, t.assignedToAll) && !chosen(t)
    && isMissedPlacement(t.scheduledFor, t.completed, now) && !isRecentMiss(t.scheduledFor, t.completed, now)).length

  const outstanding = (e: DayPlanEntry) => !e.completed && !e.planned
  return {
    toPlan,
    unfinished,
    olderUnfinished,
    carried,
    scheduled,
    available,
    week,
    month,
    counts: {
      scheduled: scheduled.filter(outstanding).length,
      available: available.filter(outstanding).length,
    },
    offMainTaskIds,
    offMainRoutineItemIds,
    plannedExtraTasks,
  }
}

/**
 * The routines the main list keeps: every visible routine except those whose
 * row went to the pin. A collection leaves with its Steps — they only ever
 * render inside it.
 */
export function routinesForMain(visible: Routine[], offMainRoutineItemIds: Set<string>): Routine[] {
  if (offMainRoutineItemIds.size === 0) return visible
  const off = new Set<string>()
  for (const id of offMainRoutineItemIds) {
    if (id.startsWith('routine-collection-')) off.add(id.slice('routine-collection-'.length))
    else off.add(id.slice('routine-'.length))
  }
  const { collections } = groupRoutineSteps(visible)
  const offSteps = new Set(collections.filter((c) => off.has(c.id)).flatMap((c) => c.steps.map((s) => s.id)))
  return visible.filter((r) => !off.has(r.id) && !offSteps.has(r.id))
}
