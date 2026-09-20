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
import { localYmd } from '@/lib/cadence/config'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { isTimelineObligation, type ResolveRoutineCtx } from '@/lib/routineUtils'

export type DayPlanGroup = 'scheduled' | 'available' | 'week' | 'month'

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
}

export interface DayPlan {
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
}

export function routineResolveCtx(input: Pick<DayPlanInput, 'viewedDate' | 'selectedAssignee' | 'hideRoutines' | 'layers' | 'dateInstances'>): ResolveRoutineCtx {
  return {
    date: input.viewedDate,
    member: input.selectedAssignee,
    prefs: { hideRoutines: input.hideRoutines, layers: input.layers },
    deferredInto: deferredInRoutineIds(input.dateInstances, input.viewedDate),
  }
}

const isOn = (d: Date | undefined | null, ymd: string) => !!d && localYmd(new Date(d)) === ymd

/**
 * This week's list, as rows. The ONE definition of "on this week's list":
 * the Today pin and /week's own column both call this, so the two surfaces
 * cannot disagree about which rows belong to a week (Scott, 2026-09-19).
 * `ymd` is the day "Planned today" is judged against.
 */
export function weekListEntries(tasks: Task[], match: Match, weekStart: Date, ymd: string): DayPlanEntry[] {
  return selectHorizonPool(tasks, 'week', match, weekStart).map((t) => ({
    key: `task:${t.id}`, kind: 'task' as const, id: t.id, title: t.title, completed: t.completed,
    planned: isOn(t.plannedOn, ymd), group: 'week' as const, task: t,
  }))
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
  for (const t of onDay) {
    if (!t.isAllDay) continue // a time is a commitment the main list keeps
    const planned = isOn(t.plannedOn, ymd)
    if (!planned) offMainTaskIds.add(t.id)
    scheduled.push({ key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed, planned, group: 'scheduled', task: t })
  }

  const plannedExtraTasks = flatten(input.tasks).filter((t) =>
    isOn(t.plannedOn, ymd) && !onDayIds.has(t.id) && match(t.assignedTo, t.assignedToAll))

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
  const listEntry = (group: 'week' | 'month') => (t: Task): DayPlanEntry => ({
    key: `task:${t.id}`, kind: 'task', id: t.id, title: t.title, completed: t.completed,
    planned: isOn(t.plannedOn, ymd), group, task: t,
  })
  const week = weekListEntries(input.tasks, match, input.weekStart, ymd)
  const month = selectHorizonPool(input.tasks, 'month', match, undefined, monthStartOf(input.viewedDate)).map(listEntry('month'))

  const outstanding = (e: DayPlanEntry) => !e.completed && !e.planned
  return {
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
