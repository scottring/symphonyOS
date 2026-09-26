// src/components/plan/PeriodPlanPage.tsx
//
// One page, three levels. This Month, This Season and This Year are the same
// surface with a different period: the level's own list (tasks and goals, or
// goals alone for the year), the level above folded beneath it to reference
// while you write, and a look-back at the period just ended (Scott, 2026-09-05: "plan
// the year, then the season referencing the year, then the month referencing
// the season… then at the end of each period, review it").
//
// Nothing here is scheduled. A month or season TASK can be copied down (from
// the rail into this page, or from this page onward in a look-back); a goal
// is only ever ticked, kept or dropped.

import { createPortal } from 'react-dom'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Target, ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react'
import { ShelvesButton } from '@/components/reference/ShelvesButton'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { goalListView, hiddenLabel, clearFilterOnEscape } from '@/lib/planning/goalListView'
import { GoalParentLink, GoalStatusControl, parentRungLabel } from './GoalParentLink'
import { expansionKey, readExpanded, writeExpanded } from './goalExpansion'
import { planDropHandlers } from '@/lib/planning/planDrag'
import { showToast } from '@/hooks/useToast'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useRoutines } from '@/hooks/useRoutines'
import { useDayChoices } from '@/hooks/useDayChoices'
import { weeksOfMonth } from '@/lib/planning/monthWeeks'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { formatWeekRange } from '@/lib/dateHelpers'
import { routinePatterns } from '@/lib/planning/routinePatterns'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { placementFateOf, lowerPlacement } from '@/lib/placement/model'
import { splitGoalRows } from '@/lib/planning/goalSteps'
import { parseLocalYmd, localYmd } from '@/lib/cadence/config'
import { monthToken, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { seasonToken } from '@/lib/cadence/seasons'
import { usePlanSessionHost } from '@/hooks/usePlanSessionHost'
import { useAuth } from '@/hooks/useAuth'
import { lookBackRows, isEmptyDraft, goalsWithHiddenSteps, goalAsRow, yearLookBack, type SessionDraft } from '@/lib/planning/session'
import type { DomainId } from '@/lib/domains'
import {
  periodBounds, isCurrentPeriod, selectPeriodTasks, actionsFor, intoMonthChoices, railLevel, lowerLevel, planningPeriod, offerableFromAbove,
  type PlanLevel, type RowAction,
} from '@/lib/planning/periodPage'
import { firstNoteLine } from '@/lib/planning/goalsReference'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { PlanRow, rowIsDone, type PlanRowModel, type SupportRef } from './PlanRow'
import { supportedGoal, goalsSupporting, goalOfTask, seasonGoalsSupporting } from '@/lib/planning/goalSupport'
import { taskTiming, hasTiming, removeDayOutcome, removeAllOutcome } from '@/lib/planning/taskTiming'
import { readOpen, readFoldPref, writeOpen } from './foldState'
import { PlanSession } from './PlanSession'
import { PlanNextLine } from './PlanNextLine'
import { periodCalendarEntries } from '@/lib/planning/periodCalendar'
import { PlanWeekMenu } from './PlanWeekMenu'
import { weekendsTouching, weekendEnd, weekendRangeLabel } from '@/lib/planning/weekend'
import { MultiAssigneeDropdown } from '@/components/family'
import { goalConversion } from '@/lib/planning/goalConversion'
import { makeTaskAGoal } from './MakeGoalControl'
import { NextLevelStrip } from './NextLevelStrip'
import { nextLevelChoices } from '@/lib/planning/nextLevel'
import { PeriodShelves } from './PeriodShelves'
import { useDayLoadEvents, DAY_LOAD_RANGE_DAYS } from '@/hooks/useDayLoadEvents'

/** How many tasks a period's list shows before it asks. A long plan is still
 *  a plan, but a page that opens with twenty rows is a page you scroll rather
 *  than read (Scott, 2026-09-13). Same number the review drawer paces itself
 *  by, deliberately. */
const TASK_PREVIEW_CAP = 5

const NOUN: Record<PlanLevel, string> = { month: 'month', season: 'season', year: 'year' }
/** "September 2026" with the year set back — the period is the page's name,
 *  not a category label like "This Month" (Scott, 2026-09-13). */
function periodTitle(level: PlanLevel, label: string) {
  const parts = label.match(/^(.*?)\s+(\d{4})$/)
  if (level === 'year' || !parts) return label
  return <>{parts[1]} <span className="text-neutral-400">{parts[2]}</span></>
}

/** A row as THIS period's list sees it: its fate and "→ where it went" are
 *  read off the row itself, relative to the level and period being shown
 *  (a September row kept into October says "carried to October" on
 *  September's list and nothing on October's). */
/** The two ends of this goal's support link, as the row draws them. Passed in
 *  rather than looked up inside `taskRow` so the row builder stays pure and
 *  the read rules live in one place (`goalSupport.ts`). */
export interface RowSupport { supports?: SupportRef | null; supportedBy?: SupportRef[] }

export function taskRow(t: Task, level: PlanLevel, periodStart: Date, support?: RowSupport): PlanRowModel {
  const lvl = level === 'season' ? 'season' : 'month'
  const lower = t.completed ? null : lowerPlacement(t, lvl, periodStart)
  return {
    id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFateOf(t, lvl, periodStart), kind: 'task',
    placed: t.completed
      ? { label: 'done', id: t.id, kind: 'done' }
      : lower
        ? { label: lower.label, id: t.id, kind: lower.kind === 'date' ? 'date' : lower.kind === 'week' ? 'week' : 'placed' }
        : null,
    subtitle: t.isGoal ? firstNoteLine(t.notes) : undefined,
    supports: support?.supports ?? null,
    supportedBy: support?.supportedBy,
    // Already normalised by the task mapper: a legacy single assignee reads
    // as a one-person list.
    assigneeIds: t.assignedToAll ?? [],
  }
}
function goalRow(g: Goal, support?: RowSupport): PlanRowModel {
  return {
    id: g.id, title: g.name, isGoal: true, fate: g.status === 'completed' ? 'done' : 'open', kind: 'goal',
    subtitle: g.strategy?.trim() || firstNoteLine(g.notes),
    supportedBy: support?.supportedBy,
    // Undefined until the goals table carries assignees (migration
    // 2026-09-25_goals_assigned_to_all.sql, prepared, not applied): the row
    // then offers no picker rather than one that cannot save.
    assigneeIds: g.assignedToAll,
  }
}

function PeriodPlanPageInner({ level }: { level: PlanLevel }) {
  const references = useReferenceLists()
  const navigate = useNavigate()
  const { tasks, loading, toggleTask, deleteTask, updateTask, updateTasksBulk, addTask, setGoal, pushTask, keepForward, dropCommitment, completeTask } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const { activeRoutines } = useRoutines()
  const { user } = useAuth()
  const { goals, areas, addGoal, updateGoal, addArea, loading: goalsLoading } = useGoalsContext()
  /**
   * Everything this page's lists are made of. The year draws from `goals`,
   * which has its own load — and the page was not consulting it, so /year
   * opened on "0 goals" and an empty list for as long as the goals took to
   * arrive, telling a household with three year goals that it had none (seen
   * live, 2026-09-24). Counted once here so every consumer agrees.
   */
  const listsLoading = loading || seasonsLoading || (level === 'year' && goalsLoading)

  const [searchParams, setSearchParams] = useSearchParams()
  const startParam = searchParams.get('start')
  const explicitStart = useMemo(() => (startParam ? parseLocalYmd(startParam) : null), [startParam])

  const today = useMemo(() => new Date(), [])
  const [anchor, setAnchor] = useState<Date>(() => (explicitStart ? periodBounds(level, explicitStart, seasons).start : today))
  const [lookingAhead, setLookingAhead] = useState(false)
  // Once the user has navigated (prev/next/"Back to this…") — or an explicit
  // start was given — the initial-period computation below must never
  // override where they are.
  const anchorSettledRef = useRef(!!explicitStart)

  /**
   * Keep `anchor` in step with `?start=` after the first mount.
   *
   * `goTo` writes the period into the URL (S2-16), but `anchor` only read
   * `explicitStart` in its initial state. Browser Back and Forward change the
   * URL WITHOUT remounting, so October → November → Back left the URL saying
   * October while the heading and the list still showed November (Codex review
   * of cefcdbcc).
   *
   * Only reacts to a CHANGE in the parameter, never to its value on mount —
   * the first period is chosen by `planningPeriod` below, which may look ahead
   * near the end of a month, and clobbering that here would undo it. A missing
   * parameter is the same question the page answers on a cold open, so it is
   * answered the same way.
   */
  const lastStartParamRef = useRef<string | null>(startParam)
  useEffect(() => {
    if (startParam === lastStartParamRef.current) return
    lastStartParamRef.current = startParam
    anchorSettledRef.current = true
    const next = explicitStart
      ? periodBounds(level, explicitStart, seasons).start
      : planningPeriod({ level, today, seasons }).start
    setAnchor((prev) => (localYmd(prev) === localYmd(next) ? prev : next))
    setLookingAhead(false)
  }, [startParam, explicitStart, level, seasons, today])

  const bounds = useMemo(() => periodBounds(level, anchor, seasons), [level, anchor, seasons])
  const isCurrent = isCurrentPeriod(bounds, today)
  // The month a season row is taken into, NAMED. "Take it into this month"
  // on a future season meant the clock's month — Winter work put in
  // September (the S3-01 / S2-20 class). The season in progress gives the
  // month in progress; any other season, its own first month.
  const lowerMonth = useMemo(() => (level === 'season'
    ? (isCurrent ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1))
    : null), [level, isCurrent, today, bounds.start])
  const isPast = bounds.end <= today
  // Page chrome for the card's corner — only inside an AppShell (tests mount bare).
  const chrome = useAppShellChromeOptional()

  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])

  // The page opens on the period you actually plan for — the current one,
  // unless it's nearly over or already empty while the next one has a list
  // (demo run 2026-09-06). Waits for tasks to load so the count isn't a false
  // zero, AND for the household's seasons to load — settling on a stale
  // localStorage-cached boundary (then having the real one arrive after) put
  // the wrong season in the masthead. Runs once, and never again once the
  // user has navigated.
  useEffect(() => {
    if (anchorSettledRef.current) return
    if (!(tasks.length > 0 || !loading)) return
    if (seasonsLoading) return
    anchorSettledRef.current = true
    if (level === 'year') return
    const result = planningPeriod({ level, today, seasons })
    setAnchor(result.start)
    setLookingAhead(result.lookingAhead)
  }, [tasks.length, loading, seasonsLoading, level, today, seasons, layered, meId])

  /**
   * Page to another period — and put it in the URL.
   *
   * The anchor used to live only in this component's state, so the period you
   * paged to existed nowhere durable: open a task from October's page and come
   * back, and `planningPeriod` ran again and returned you to September (Scott,
   * 2026-09-24: "Back from goal details returns to September instead of
   * October"). `?start=` is already read on mount as `explicitStart`, so
   * writing it makes back, forward and reload all land where you were.
   */
  const goTo = useCallback((d: Date) => {
    anchorSettledRef.current = true
    setLookingAhead(false)
    setAnchor(d)
    const next = new URLSearchParams(searchParams)
    next.set('start', localYmd(periodBounds(level, d, seasons).start))
    setSearchParams(next, { replace: false })
  }, [searchParams, setSearchParams, level, seasons])

  // ── The list ─────────────────────────────────────────────────────────────
  /** Both ends of a goal's support link, read from the layer-filtered list so
   *  a goal the reader may not see cannot leak its title through a child.
   *  A task answers with the goal it is a step of — seen here only when that
   *  goal is not on this page to nest it (a Fall goal's task on October). */
  const supportFor = useCallback((t: Task): RowSupport | undefined => {
    if (t.isGoal !== true) {
      // A step of a goal ON this page is drawn nested under it; naming the
      // goal again beneath the step would only repeat the indent.
      const g = t.goalTaskId ? layered.find((x) => x.id === t.goalTaskId) : undefined
      const start = level === 'month' ? g?.monthStart : level === 'season' ? g?.seasonStart : undefined
      if (start && start.getTime() === bounds.start.getTime()) return undefined
      const of = goalOfTask(t, layered, seasons)
      return of ? { supports: of, supportedBy: [] } : undefined
    }
    return {
      supports: supportedGoal(t, layered, goals, seasons),
      supportedBy: goalsSupporting(t, layered),
    }
  }, [layered, goals, seasons, level, bounds.start])

  const rows = useMemo<PlanRowModel[]>(() => {
    if (level === 'year') {
      const year = bounds.start.getFullYear()
      return goals
        .filter((g) => g.year === year && g.status !== 'archived' && matchesLayers(g.context, layers))
        .map((g) => goalRow(g, { supportedBy: seasonGoalsSupporting(g.id, layered, seasons) }))
    }
    const list = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons)
      .map((t) => taskRow(t, level, bounds.start, supportFor(t)))
    // Goals first — a goal is what the period is for — then tasks, each in
    // the order they were written.
    return [...list.filter((r) => r.isGoal), ...list.filter((r) => !r.isGoal)]
  }, [level, goals, layers, layered, bounds.start, isCurrent, meId, tasks, seasons, supportFor])

  // ── On the calendar: timed items landing inside this period. The list
  //    above answers a POOL question (bucket === level); this answers a DATE
  //    question, so a dated item never goes missing just because it lives on
  //    a different bucket (demo run 2026-09-06). Month and season only — a
  //    year list is goals, with no dates to show. ─────────────────────────
  //    Until 2026-09-23 this read `tasks` only, so a section headed "On the
  //    calendar" contained no calendar: Scott opened Month to see what he was
  //    already committed to and his dentist appointment was simply absent
  //    (S2-14). Events now come in beside the dated tasks.
  const { events: periodEvents, available: eventsAvailable } = useDayLoadEvents(level !== 'year')
  const dated = useMemo(
    () => (level === 'year' ? [] : periodCalendarEntries(layered, periodEvents, bounds.start, bounds.end)),
    [level, layered, periodEvents, bounds.start, bounds.end],
  )
  // The event fetch reaches a fixed window forward from today. Past that, the
  // list is tasks only — say so rather than show a confidently short list.
  const eventsCoverPeriod = useMemo(() => {
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + DAY_LOAD_RANGE_DAYS)
    return bounds.end <= horizon && bounds.start >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }, [today, bounds.start, bounds.end])

  // ── The fold: the level above, read-only. It follows the same "plan for
  //    the period ahead" rule as the page itself — near a season/year
  //    boundary, the fold looks ahead too. ──────────────────────────────────
  const above = railLevel(level)
  const aboveStart = useMemo(() => {
    if (!above) return today
    // The season page's year rail anchors on the year containing the SEASON
    // on screen, not whichever year `planningPeriod` would currently offer —
    // a season starting next January (Fall/Winter crossing the boundary)
    // reads next year's goals, never this year's (Phase 3 final review).
    if (above === 'year') return new Date(bounds.start.getFullYear(), 0, 1)
    return planningPeriod({ level: above, today, seasons }).start
  }, [above, today, seasons, bounds.start])
  const railRows = useMemo<PlanRowModel[]>(() => {
    if (above === 'season') {
      // The fold can look ahead to a season that ISN'T actually current
      // (near a boundary) — asking the pool question there would pull in
      // every legacy NULL-seasonStart row regardless of which season it
      // opened on (the exact trap periodPlacement.ts warns about).
      const aboveIsCurrent = isCurrentPeriod(periodBounds('season', aboveStart, seasons), today)
      return selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons)
        .map((t) => taskRow(t, 'season', aboveStart, supportFor(t)))
    }
    if (above === 'year') {
      return goals
        .filter((g) => g.year === aboveStart.getFullYear() && g.status !== 'archived' && matchesLayers(g.context, layers))
        .map((g) => goalRow(g, { supportedBy: seasonGoalsSupporting(g.id, layered, seasons) }))
    }
    return []
  }, [above, layered, aboveStart, seasons, today, meId, tasks, goals, layers, supportFor])
  const railBounds = useMemo(() => (above ? periodBounds(above, aboveStart, seasons) : null), [above, aboveStart, seasons])

  // ── Verbs ────────────────────────────────────────────────────────────────
  // The same plan writes the Today pin uses: a row dragged out of the pin and
  // dropped on this month's page commits to the month — no day invented.
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => tasks.find((t) => t.id === id),
    updateTask: (id, u) => gated.updateTask(id, u),
    pushTask: (id, target) => gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, gated, setPlanned, rescheduleInstance])
  const [planDropOver, setPlanDropOver] = useState(false)
  const monthDrop = level === 'month'
    ? planDropHandlers((payload) => { void planActions.drop(payload, { type: 'period', period: 'month' }) }, setPlanDropOver)
    : {}

  /** A year goal is a goals-table row and opens on its own page; a month or
   *  season goal is a task and opens in the detail panel — the same split
   *  `open` makes for a row, made once for the other end of a link. */
  const openSupport = useCallback((ref: SupportRef) => {
    navigate(ref.rung === 'year' ? `/goals/${ref.id}` : `/task/${ref.id}`)
  }, [navigate])

  // A TASK opens in the detail pane, as it does on Today and Week, so the
  // period stays under it (S2-10: "page, not pane. why?"). A goal keeps its
  // own page — that is where its steps, its period's Shelves and its support
  // links live (S2-18, S3-14). Outside the shell there is no pane: the page.
  const selection = useSelectionOptional()
  const openTask = useCallback((id: string) => {
    if (selection) selection.setSelection({ kind: 'task', id })
    else navigate(`/task/${id}`)
  }, [selection, navigate])
  const open = useCallback((row: PlanRowModel) => {
    if (row.kind === 'goal') navigate(`/goals/${row.id}`)
    else if (row.isGoal) navigate(`/task/${row.id}`)
    else openTask(row.id)
  }, [navigate, openTask])

  // A goal's circle sits where a task's tick sits, and one stray click closed
  // a whole period's outcome with nothing to say it had (S2-23). Completing a
  // goal now says what it did — and what it did not: its steps are untouched
  // — with Undo, the app's pattern for a reversible write.
  const confirmGoalDone = useCallback((title: string, undo: () => void) => {
    showToast(`Completed the goal “${title}”. Its steps are unchanged.`, 'success', 8000, { label: 'Undo', onClick: undo })
  }, [])

  const act = useCallback(async (action: RowAction, row: PlanRowModel) => {
    if (row.kind === 'goal') {
      const g = goals.find((x) => x.id === row.id)
      if (!g) return
      if (action === 'complete') {
        const finishing = g.status !== 'completed'
        await updateGoal(g.id, { status: finishing ? 'completed' : 'active' })
        if (finishing) confirmGoalDone(row.title, () => { void updateGoal(g.id, { status: 'active' }) })
      }
      // Drop lets a goal GO, it does not erase the year it was held in: the
      // year's session and its look-back still need the record (Task 4).
      else if (action === 'drop') await updateGoal(g.id, { status: 'archived' })
      else if (action === 'keep') {
        const kept = await addGoal(g.areaId, g.name, g.context ?? undefined)
        if (kept) await updateGoal(kept.id, { year: bounds.next.getFullYear() })
      }
      return
    }
    if (action === 'complete') {
      const finishing = row.isGoal && !tasks.find((x) => x.id === row.id)?.completed
      const ok = await toggleTask(row.id)
      if (finishing && ok !== false) confirmGoalDone(row.title, () => { void toggleTask(row.id) })
    }
    else if (action === 'drop') {
      // A past period's Drop ends THAT period's commitment; the task lives on
      // (guided planning spec). In the current period Drop still means
      // "delete this row I just wrote".
      if (isPast && level !== 'year') await dropCommitment(row.id, level === 'month' ? 'month' : 'season', bounds.start)
      else await deleteTask(row.id)
    }
    else if (action === 'someday') await gated.updateTask(row.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (action === 'make-goal') await setGoal(row.id, true)
    else if (action === 'make-task') await setGoal(row.id, false)
    else if (action === 'keep') {
      // Carried FROM this page's period, stated: never inferred from which
      // commitment happens to be open latest (review 2026-09-21).
      await keepForward(row.id, level === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next }, bounds.start)
    }
    // Taking a row down a rung adds the lower commitment to the SAME row:
    // this period's list keeps it, marked with where the work went, so the
    // look-back still sees the whole plan. Nothing is copied.
    else if (action === 'to-lower') {
      const lower = lowerLevel(level)
      // A season names its month (see lowerMonth); updateTask, not pushTask —
      // taking work into a month being planned is not a deferral (S3-01).
      if (lower === 'month' && lowerMonth) await gated.updateTask(row.id, { bucket: 'month', monthStart: lowerMonth })
      else if (lower) await gated.pushTask(row.id, lower)
    }
    else if (action === 'today') {
      // The Today command (S4): dated today, all-day, and chosen for my
      // focus. The month or season commitment stays — a date never erases the
      // broader commitment.
      await planActions.chooseTaskDay(row.id, new Date())
    }
    else if (action === 'under-goal') setPickingGoalFor(row.id)
  }, [goals, updateGoal, addGoal, bounds.next, bounds.start, isPast, toggleTask, deleteTask, dropCommitment, gated, setGoal, keepForward, level, planActions, tasks, confirmGoalDone, lowerMonth])

  /**
   * "Assign people" on a goal or a step: the household picker the rest of the
   * app uses, writing the same fields the same way (Today, Triage and the
   * detail panel all send the list AND its first person, so clearing the list
   * also clears a legacy single assignee). Each row is its own: assigning a
   * goal never assigns its steps. The write goes through the gate, so an
   * untagged row is asked for its area first, as it is everywhere else, and
   * `updateTask` derives the sharing scope from the people chosen.
   * A look-back is read, not written into: no picker on a past period.
   */
  /**
   * "Break into next actions" on a loose task row (nested horizons, Scott and
   * Iris, 2026-09-26). A month or season holds OUTCOMES; the concrete next
   * actions are what go into a week or a day. A broad item — "Make the yard
   * nice enough to sit in" — is not pushed into a week whole: the same row
   * becomes the goal that holds its next actions, stays on this list, and the
   * cursor lands in its next-action box. Explicit and undoable; nothing is
   * reclassified unless someone asks (goalConversion says when it can, task
   * details explain when it cannot). A simple one-step task needs none of
   * this and is planned into a week directly.
   */
  const [composerFocusId, setComposerFocusId] = useState<string | null>(null)
  const clearComposerFocus = useCallback(() => setComposerFocusId(null), [])
  const makeGoalFor = useCallback((row: PlanRowModel) => {
    if (isPast || row.isGoal || row.kind !== 'task' || level === 'year') return undefined
    const t = tasks.find((x) => x.id === row.id)
    if (!t || !goalConversion(t, tasks).ok) return undefined
    return () => {
      const where = level === 'month' ? bounds.start.toLocaleDateString('en-US', { month: 'long' }) : bounds.label
      void makeTaskAGoal(t, setGoal, `“${t.title}” now holds its next actions — it is a goal on ${where}. Add them below.`)
        .then(() => setComposerFocusId(t.id))
    }
  }, [isPast, level, tasks, setGoal, bounds])

  const assignFor = useCallback((row: PlanRowModel) => {
    if (isPast || familyMembers.length === 0 || row.assigneeIds === undefined) return null
    const onSelect = (ids: string[]) => {
      if (row.kind === 'goal') void updateGoal(row.id, { assignedToAll: ids })
      else void gated.updateTask(row.id, { assignedToAll: ids, assignedTo: ids[0] ?? undefined })
    }
    return (
      <MultiAssigneeDropdown
        members={familyMembers}
        selectedIds={[...row.assigneeIds]}
        onSelect={onSelect}
        size="sm"
        label="Assign people"
        triggerLabel={`Assign people to ${row.title}`}
      />
    )
  }, [isPast, familyMembers, updateGoal, gated])

  // The rail's one verb: take an open season task into this month — the same
  // row gains a month commitment; the season keeps it, marked "→ September".
  /**
   * "Add to this month" on a row from the level above — the Shelves rail.
   *
   * Names the month being VIEWED. It used to call `pushTask(id, 'month')`,
   * which sends no stamp, so `planPlacement` filled it from `ctx.now`
   * (`intentions.ts:175`): a Fall task pulled down while October was on screen
   * landed on **September**, the month the clock was in (2026-09-24, S3-01).
   * The session's own `takeInto` (below) always passed the period explicitly;
   * this path had been left behind.
   *
   * `updateTask` rather than `pushTask` for the same reason `takeInto` uses it:
   * taking work into the month you are planning is not a deferral, and should
   * not count against `defer_count`. The season commitment and the goal link
   * are untouched — descending keeps what is above it.
   */
  const pullDown = useCallback((row: PlanRowModel) => {
    void gated.updateTask(row.id, { bucket: 'month', monthStart: bounds.start })
  }, [gated, bounds.start])

  // The calendar is a view you OPEN, not the thing that greets you: the page
  // answers "what do we want from this month?" first (Scott, 2026-09-13: the
  // calendar came first and pushed the plan below it).
  const calendarKey = `symphony-plan-calendar-${level}`
  const [calendarOpen, setCalendarOpen] = useState(() => readOpen(calendarKey))
  const toggleCalendar = useCallback(() => {
    setCalendarOpen((v) => { writeOpen(calendarKey, !v); return !v })
  }, [calendarKey])

  // ── Routines this period ─────────────────────────────────────────────────
  // Broader shelves show relevant slower patterns; Week/Today own occurrences.
  const patterns = useMemo(
    () => routinePatterns(activeRoutines, layers, { level, start: bounds.start, end: bounds.end }),
    [activeRoutines, layers, level, bounds.start, bounds.end],
  )

  // "Recurring commitments" rather than "Routines this month": what the
  // reader needs to know is that this time is already spoken for, and the
  // page carries no routine HISTORY — nothing records which patterns were
  // active in August — so only the current period may imply it is showing
  // its own (review 2026-09-13).
  // Says whose plan this is, because the domain lens and the assignee lens
  // both narrow it and a page that silently hides rows is the complaint that
  // started all of this.
  const lensLabel = soleDomain
    ? `Everyone in ${soleDomain}`
    : layers.size >= 4 ? 'Everyone, every domain' : 'Everyone in selected domains'

  const routinesHeading = isCurrent ? 'Recurring commitments' : 'Current recurring commitments'
  // Hidden finished work stays hidden — across periods and across visits.
  // A look-back starts open, because that is what a look-back is for, but the
  // reader can still close it and it will stay closed.
  // Showing the whole list is a choice that sticks, the same way hiding
  // finished work does.
  const allKey = `symphony-plan-all-${level}`
  const [showAllPref, setShowAllPref] = useState<boolean | null>(() => readFoldPref(allKey))
  const showAll = showAllPref ?? false
  const toggleShowAll = useCallback(() => {
    const next = !showAll
    writeOpen(allKey, next)
    setShowAllPref(next)
  }, [allKey, showAll])

  const doneKey = `symphony-plan-done-${level}`
  const [donePref, setDonePref] = useState<boolean | null>(() => readFoldPref(doneKey))
  // No preference yet → follow the period on screen. A look-back is about
  // what got done; this month's plan is about what is left.
  const doneOpen = donePref ?? isPast
  const toggleDone = useCallback(() => {
    const next = !doneOpen
    writeOpen(doneKey, next)
    setDonePref(next)
  }, [doneKey, doneOpen])
  const routinesKey = `symphony-plan-routines-${level}`
  const [routinesOpen, setRoutinesOpen] = useState(() => readOpen(routinesKey))
  const toggleRoutines = useCallback(() => {
    setRoutinesOpen((v) => { writeOpen(routinesKey, !v); return !v })
  }, [routinesKey])

  // ── Add ──────────────────────────────────────────────────────────────────
  // Two affordances, one writer. The shared input with a "Goal" toggle made
  // you set a mode before typing; a "+" on each list says which list you are
  // writing to (Scott, 2026-09-13).
  const [goalDraft, setGoalDraft] = useState('')
  const [taskDraft, setTaskDraft] = useState('')
  const [addingGoal, setAddingGoal] = useState(false)
  const goalInputRef = useRef<HTMLInputElement>(null)

  const addRow = useCallback(async (title: string, asGoal: boolean) => {
    const t = title.trim()
    if (!t) return
    if (level === 'year') {
      const areaId = areas[0]?.id ?? (await addArea('General'))?.id
      if (!areaId) return
      const g = await addGoal(areaId, t, soleDomain ?? undefined)
      const year = bounds.start.getFullYear()
      if (g && g.year !== year) await updateGoal(g.id, { year })
      return
    }
    await addTask(t, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter',
      monthStart: level === 'month' ? bounds.start : undefined,
      seasonStart: level === 'season' ? bounds.start : undefined,
      isGoal: asGoal,
      context: soleDomain,
    })
  }, [level, areas, addArea, addGoal, soleDomain, bounds.start, updateGoal, addTask])

  // ── Steps under a goal ───────────────────────────────────────────────────
  // Which goals are open is REMEMBERED per period: opening a step, reading it
  // and pressing Back used to collapse every goal the reader had opened
  // (long-list acceptance, Scott 2026-09-24).
  const expansionStore = expansionKey(level, localYmd(bounds.start))
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(() => readExpanded(expansionStore))
  const lastStore = useRef(expansionStore)
  if (lastStore.current !== expansionStore) {
    // Paged to another period: pick up that period's shape, not this one's.
    lastStore.current = expansionStore
    setExpandedGoals(readExpanded(expansionStore))
  }
  const toggleGoal = useCallback((row: PlanRowModel) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.add(row.id)
      writeExpanded(expansionStore, next)
      return next
    })
  }, [expansionStore])

  // ── Long lists ───────────────────────────────────────────────────────────
  /** What the reader typed into the goals filter. Presentation only. */
  const [goalQuery, setGoalQuery] = useState('')
  /** Goals opened out past the reveal bound. */
  const [revealedGoals, setRevealedGoals] = useState<Set<string>>(new Set())
  const showAllSteps = useCallback((row: PlanRowModel) => {
    setRevealedGoals((prev) => new Set(prev).add(row.id))
  }, [])
  /** Completed steps under a goal, outside review. Remembered like any fold. */
  const completedStepsKey = `symphony.plan.showCompletedSteps.${level}`
  const [showCompletedSteps, setShowCompletedSteps] = useState<boolean>(() => readOpen(completedStepsKey))
  const toggleCompletedSteps = useCallback(() => {
    setShowCompletedSteps((v) => { writeOpen(completedStepsKey, !v); return !v })
  }, [completedStepsKey])

  const addStep = useCallback(async (goalRow: PlanRowModel, title: string) => {
    const t = title.trim()
    if (!t) return
    await addTask(t, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter',
      monthStart: level === 'month' ? bounds.start : undefined,
      seasonStart: level === 'season' ? bounds.start : undefined,
      goalTaskId: goalRow.id,
      context: soleDomain,
    })
  }, [level, bounds.start, soleDomain, addTask])

  // "Plan ▾" on a task row: the weeks of the month being VIEWED. The
  // 'to-lower' verb beside it commits to the week containing now, which on
  // October's page could never reach an October week (2026-09-24).
  /**
   * The timing control, and the contextual way to go and look at what was
   * chosen.
   *
   * Every action that belongs to this period gets one — a goal's steps as much
   * as the loose work beside them, on the season page as much as the month
   * (requirement 1). The year has no task steps, so it has nothing to time.
   * The control states the saved answer rather than a verb; the View links
   * beside it use the dates that are actually saved and the URL conventions
   * the app already has (`/week?start=`, `/today?date=`).
   */
  /**
   * Remove a day, or a day and its week — with ONE confirmation that states
   * the result that actually landed, and an Undo that restores the whole
   * gesture (requirement 6). The sentence after the write is the same
   * sentence the menu showed before it, so nothing changes meaning between
   * reading and pressing.
   */
  /** The one name this page gives its period in timing copy. The menu shows a
   *  consequence before the press and the toast repeats it after; reading two
   *  different labels made them disagree ("September" vs "September 2026"). */
  const timingPeriodLabel = level === 'season'
    ? bounds.label
    : bounds.start.toLocaleDateString('en-US', { month: 'long' })

  const removeTiming = useCallback(async (taskId: string, title: string, scope: 'day' | 'all') => {
    const t = tasks.find((x) => x.id === taskId)
    if (!t) return
    const before = taskTiming(t)
    const { updates, previous } = timingRemoval(t, scope)
    if (!(await gated.updateTask(taskId, updates))) return
    const what = scope === 'day'
      ? `Removed ${before.day!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} from “${title}”.`
      : `Removed ${before.day ? 'the day and the week' : 'the week'} from “${title}”.`
    const kept = scope === 'day' ? removeDayOutcome(before, timingPeriodLabel) : removeAllOutcome(before, timingPeriodLabel)
    showToast(`${what} ${kept}`, 'success', 8000, {
      label: 'Undo',
      onClick: () => { void gated.updateTask(taskId, previous) },
    })
  }, [tasks, timingPeriodLabel, gated])

  /**
   * What each day of the period's weeks already holds, counted once for the
   * whole page rather than per row. The window is exactly the weeks the menu
   * offers — `weeksOfMonth` of the period's anchor — so a row's own week is
   * covered whenever the menu could have set it, and a week outside it gets
   * no tiles rather than half of one.
   */
  // Widened to cover every weekend the month touches: a weekend that straddles
  // the month (or week) edge needs both of its days counted, or its bars
  // would be missing exactly where the boundary is.
  const monthWeekends = useMemo(() => (level === 'year' ? [] : weekendsTouching(bounds.start)), [level, bounds.start])
  const timingWindow = useMemo(() => {
    if (level === 'year') return { start: null as Date | null, dayCount: 0 }
    const weeks = weeksOfMonth(bounds.start, readCadenceConfig().weekStartsOn)
    if (!weeks[0]) return { start: null as Date | null, dayCount: 0 }
    const dayMs = 86_400_000
    const weeksEnd = new Date(weeks[0].start.getFullYear(), weeks[0].start.getMonth(), weeks[0].start.getDate() + weeks.length * 7)
    const firstSat = monthWeekends[0]
    const lastSun = monthWeekends.length ? weekendEnd(monthWeekends[monthWeekends.length - 1]) : null
    const start = firstSat && firstSat < weeks[0].start ? firstSat : weeks[0].start
    const endExclusive = lastSun && lastSun >= weeksEnd
      ? new Date(lastSun.getFullYear(), lastSun.getMonth(), lastSun.getDate() + 1) : weeksEnd
    return { start, dayCount: Math.round((endExclusive.getTime() - start.getTime()) / dayMs) }
  }, [level, bounds.start, monthWeekends])
  const dayChoices = useDayChoices({
    windowStart: timingWindow.start, dayCount: timingWindow.dayCount,
    tasks, tasksLoading: loading, userId: user?.id ?? null,
    routines: activeRoutines,
  })

  /** The months a season spans, first to last — what S3-03's chooser offers. */
  // What "Into a month…" offers — the season's months and the one before it
  // (intoMonthChoices).
  const intoMonthOptions = useMemo(() => (level === 'season' ? intoMonthChoices(bounds) : []), [level, bounds])
  /** The confirmation after work goes into a week: where it went, and the
   *  way there — the week is where its days get planned (nested horizons). */
  const plannedInto = useCallback((title: string, weekStart: Date, where: string) => {
    showToast(`Planned “${title}” for ${where}.`, 'success', 6000, {
      label: 'Open week',
      onClick: () => navigate(`/week?start=${localYmd(weekStart)}`),
    })
  }, [navigate])

  const planWeekSlot = useCallback((row: PlanRowModel) => {
    if (level === 'year') return null
    const t = tasks.find((x) => x.id === row.id)
    const timing = t ? taskTiming(t) : undefined
    // The days of the week this row is already committed to, with what each
    // one already holds. A row with no week yet is asking WHICH WEEK, and the
    // menu answers that first; inventing a week's worth of days for it would
    // be a day grid nobody asked for.
    const days = dayChoices.forWeek(t?.weekStart ?? null)
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5">
      <PlanWeekMenu
        size="sm"
        title={row.title}
        periodStart={bounds.start}
        periodLabel={timingPeriodLabel}
        timing={timing}
        currentWeekStart={t?.weekStart ?? null}
        dayChoices={days}
        dayChoicesLabel={t?.weekStart ? `A day in ${formatWeekRange(t.weekStart)}` : undefined}
        onPickWeek={(weekStart) => {
          void (async () => {
            if ((await gated.updateTask(row.id, { bucket: 'week', weekStart, scheduledFor: undefined })) === false) return
            plannedInto(row.title, weekStart, formatWeekRange(weekStart))
          })()
        }}
        onClearWeek={timing && hasTiming(timing) ? () => { void removeTiming(row.id, row.title, 'all') } : undefined}
        onRemoveDay={timing?.day ? () => { void removeTiming(row.id, row.title, 'day') } : undefined}
        onPickDay={(date) => { void planActions.chooseTaskDay(row.id, date) }}
        weekends={monthWeekends.map((saturday) => ({ saturday, days: dayChoices.forDays([saturday, weekendEnd(saturday)]) }))}
        onPickWeekend={t && !t.completed ? (saturday) => {
          void (async () => {
            if (!(await planActions.planTaskWeekend(row.id, saturday))) return
            plannedInto(row.title, weekStartAnchor(saturday, readCadenceConfig().weekStartsOn), `the weekend of ${weekendRangeLabel(saturday)}`)
          })()
        } : undefined}
        onPickWeekendDay={(saturday, day) => { void planActions.planTaskWeekendDay(row.id, saturday, day) }}
      />
      {/* S3-03: a season row can go into ANY of its season's months, named,
          not only the one "Take it into" means. A plain select: reachable by
          touch, keyboard and screen reader alike. */}
      {level === 'season' && !row.isGoal && intoMonthOptions.length > 1 && (
        <select
          aria-label={`Take ${row.title} into a month`}
          value=""
          onChange={(e) => {
            const m = intoMonthOptions.find((o) => localYmd(o.date) === e.target.value)?.date
            if (m) void gated.updateTask(row.id, { bucket: 'month', monthStart: m })
          }}
          className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-600"
        >
          <option value="" disabled>Into a month…</option>
          {intoMonthOptions.map((o) => (
            <option key={localYmd(o.date)} value={localYmd(o.date)}>{o.label}</option>
          ))}
        </select>
      )}
      {timing?.day && (
        <button type="button" onClick={() => navigate(`/today?date=${localYmd(timing.day!)}`)}
          className="shrink-0 whitespace-nowrap text-xs text-primary-700 hover:underline">View day →</button>
      )}
      {!timing?.day && timing?.week && (
        <button type="button" onClick={() => navigate(`/week?start=${localYmd(timing.week!)}`)}
          className="shrink-0 whitespace-nowrap text-xs text-primary-700 hover:underline">View week →</button>
      )}
      </span>
    )
  }, [level, bounds.start, timingPeriodLabel, planActions, tasks, navigate, gated, removeTiming, dayChoices, intoMonthOptions, monthWeekends, plannedInto])

  const [pickingGoalFor, setPickingGoalFor] = useState<string | null>(null)
  const [linkError, setLinkError] = useState(false)
  const fileUnderGoal = useCallback(async (taskId: string, goalId: string) => {
    setLinkError(false)
    if (!(await gated.updateTask(taskId, { goalTaskId: goalId }))) { setLinkError(true); return }
    setPickingGoalFor(null)
    // Open the goal it went into, or the row appears to vanish from the task
    // list with nowhere visible to have gone.
    setExpandedGoals((prev) => new Set(prev).add(goalId))
  }, [gated])

  // Goals and tasks are different promises and get their own lists — one
  // list with an icon on some rows didn't say which was which.
  //
  // A STEP renders once, under its goal, and never also in the task list.
  // selectPeriodTasks still returns it — the look-back and the period's record
  // need the whole list — so the split happens here, via the one module that
  // knows what goal_task_id means.
  const split = useMemo(() => {
    if (level === 'year') return null
    return splitGoalRows(selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons))
  }, [level, layered, bounds.start, isCurrent, meId, seasons])

  const goalRows = useMemo(() => {
    if (!split) return rows.filter((r) => r.isGoal)
    return split.goals.map((g) => ({
      ...taskRow(g, level, bounds.start, supportFor(g)),
      steps: (split.stepsByGoal.get(g.id) ?? []).map((st) => taskRow(st, level, bounds.start)),
    }))
  }, [split, rows, tasks, level, bounds.start, supportFor])
  // An empty period opens with the question already asked. The first real
  // walkthrough (Scott, 2026-09-20) stalled on a blank /year: a grey "No goals
  // for this year yet." and a 13px "+ Add a goal" off to the right read as
  // "nothing to do here". The composer IS the empty state.
  const supportingTaskCount = goalRows.reduce((sum, row) => sum + (row.steps?.filter(step => !rowIsDone(step.fate)).length ?? 0), 0)
  const openGoalRows = useMemo(() => goalRows.filter((r) => !rowIsDone(r.fate)), [goalRows])
  const doneGoalRows = useMemo(() => goalRows.filter((r) => rowIsDone(r.fate)), [goalRows])
  /**
   * What the goals list DRAWS. Presentation only — `goalRows` stays the
   * source for everything that writes, so a filter can never narrow what a
   * save touches.
   */
  const goalView = useMemo(() => goalListView(openGoalRows, [], {
    query: goalQuery,
    showCompleted: showCompletedSteps,
    expanded: expandedGoals,
    revealed: revealedGoals,
  }), [openGoalRows, goalQuery, showCompletedSteps, expandedGoals, revealedGoals])
  const goalsHidden = hiddenLabel(goalView)
  /** Is there any finished step to disclose? A fold with nothing behind it is
   *  noise; a fold that is missing while work IS hidden is a trap. */
  const anyCompletedSteps = useMemo(
    () => openGoalRows.some((r) => (r.steps ?? []).some((st) => rowIsDone(st.fate))),
    [openGoalRows],
  )
  /**
   * Is this list long enough to need a filter?
   *
   * Counting only top-level goals missed the case that needs it most: ONE
   * goal carrying sixty steps is a long list, and had no way to search it
   * (Codex review, 2026-09-24). Count the rows a reader must actually scan.
   */
  const scannableRows = useMemo(
    () => openGoalRows.reduce((n, r) => n + 1 + (r.steps?.length ?? 0), 0),
    [openGoalRows],
  )
  const listIsLong = scannableRows > 8

  const goalComposerOpen = !isPast && (addingGoal || goalRows.length === 0)

  const looseRows = useMemo(
    // With support, as `rows` has it: this rebuild dropped it, so a task
    // serving a Fall goal lost its "Supports" line on October (S3-08).
    () => (split ? split.loose.map((t) => taskRow(t, level, bounds.start, supportFor(t))) : rows.filter((r) => !r.isGoal)),
    [split, rows, tasks, supportFor],
  )
  // Finished work leaves the working list and waits behind a fold. On a PAST
  // period the fold opens by default: a look-back is precisely about what got
  // done (Scott, 2026-09-13).
  const openTaskRows = useMemo(() => looseRows.filter((r) => !rowIsDone(r.fate)), [looseRows])
  const doneTaskRows = useMemo(() => looseRows.filter((r) => rowIsDone(r.fate)), [looseRows])
  const lowerLabelText = lowerLevel(level) === 'week' ? 'this week' : lowerMonth ? lowerMonth.toLocaleDateString('en-US', { month: 'long' }) : 'this month'
  const availableTaskRows = openTaskRows.filter((r) => !r.placed)
  const assignedTaskRows = openTaskRows.filter((r) => !!r.placed)
  const visibleTaskRows = showAll ? availableTaskRows : availableTaskRows.slice(0, TASK_PREVIEW_CAP)
  // Gated on the LIST being long, not on rows being hidden right now —
  // otherwise expanding removes the only way back to five.
  const overCap = availableTaskRows.length > TASK_PREVIEW_CAP
  const hiddenTaskCount = availableTaskRows.length - visibleTaskRows.length

  const openPlaced = useCallback((taskId: string) => {
    if (tasks.find((t) => t.id === taskId)?.isGoal) navigate(`/task/${taskId}`)
    else openTask(taskId)
  }, [tasks, navigate, openTask])

  const noun = NOUN[level]
  const nextLevel = useMemo(
    () => nextLevelChoices(level, bounds, layered, meId, seasons, today),
    [level, bounds, layered, meId, seasons, today],
  )
  const shortLabel = level === 'month'
    ? bounds.start.toLocaleDateString('en-US', { month: 'long' })
    : bounds.label
  /**
   * When this period is empty, whether an adjacent one holds the plan.
   *
   * `/month` opens the month you are IN. With October planned and September
   * empty, that greeted Scott with "0 goals · 0 tasks" and no hint his work
   * was one step away, and he wandered (walk finding S2-07). `planningPeriod`
   * has a silent jump for this case that did not fire here; rather than change
   * tested navigation behaviour, the page now SAYS what is next door and lets
   * the reader choose. If the jump does fire, this line simply never shows.
   */
  const neighbourWithWork = useMemo(() => {
    if (level === 'year' || rows.length > 0) return null
    for (const start of [bounds.next, bounds.prev]) {
      const found = selectPeriodTasks(layered, level as 'month' | 'season', start, false, meId, seasons)
        .filter((t) => !t.completed)
      if (!found.length) continue
      const goalCount = found.filter((t) => t.isGoal).length
      const parts = [
        goalCount ? `${goalCount} goal${goalCount === 1 ? '' : 's'}` : null,
        found.length - goalCount ? `${found.length - goalCount} task${found.length - goalCount === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
      const label = level === 'month'
        ? start.toLocaleDateString('en-US', { month: 'long' })
        : periodBounds(level, start, seasons).label
      return { start, label, summary: parts.join(' and ') }
    }
    return null
  }, [level, rows.length, bounds.next, bounds.prev, layered, meId, seasons])

  // "Review August" says which period the look-back is of; "Last month" made
  // the reader work it out.
  const prevPeriodLabel = level === 'month'
    ? bounds.prev.toLocaleDateString('en-US', { month: 'long' })
    : periodBounds(level, bounds.prev, seasons).label
  const daysUntilStart = useMemo(() => Math.round((bounds.start.getTime() - today.getTime()) / 86_400_000), [bounds.start, today])

  // ── Guided planning (Phase 1: month; Phase 3: the season and the year) ──
  // ONE session block, parameterised by the level.
  const isSeasonSession = level === 'season'
  // The year plans in GOALS: no placed tasks, so no placement level applies —
  // every placeLevel path below is guarded by !isYearSession.
  const isYearSession = level === 'year'
  const placeLevel: 'month' | 'season' = isSeasonSession ? 'season' : 'month'
  const periodYear = bounds.start.getFullYear()
  const token = isYearSession ? yearToken(periodYear) : isSeasonSession ? seasonToken(bounds.start, seasons) : monthToken(bounds.start)
  const horizon: SessionHorizon = isYearSession ? 'annual' : isSeasonSession ? 'seasonal' : 'monthly'
  // Where a finished plan sends you next: the rung below, one page down.
  const nextRung = isYearSession ? 'season' : isSeasonSession ? 'month' : 'week'

  const back = useMemo(() => (isYearSession
    ? yearLookBack(goals, periodYear - 1, layers)
    : lookBackRows(layered, bounds.prev, meId, placeLevel, seasons)), [isYearSession, goals, periodYear, layers, layered, bounds.prev, meId, placeLevel, seasons])
  // Keep carries a goal's steps from the UNFILTERED list (keepForward); the
  // summary says when some of them are not in this view.
  const hiddenStepGoals = useMemo(
    () => (isYearSession ? new Set<string>() : goalsWithHiddenSteps(tasks, back.open, bounds.prev, placeLevel, seasons)),
    [isYearSession, tasks, back.open, bounds.prev, placeLevel, seasons],
  )
  // The year's "current" list is this year's goals, as rows.
  //
  // `status !== 'archived'` rather than `=== 'active'`: a goal FINISHED this
  // year belongs in the year's own review for the same reason a finished
  // month step does — the review is where completed work most needs to be
  // visible, and `goalAsRow` already marks it `completed` so the list draws
  // it struck through. Archived is the one status that was deliberately let
  // go, and it stays out (same rule as `aboveGoalItems` below). This list
  // feeds only the plan session; the page's own goal card is built elsewhere,
  // so nothing else on the year page changes. (Codex, 2026-09-24.)
  const currentPeriodTasks = useMemo(
    () => (isYearSession
      ? goals.filter((g) => g.year === periodYear && g.status !== 'archived' && matchesLayers(g.context, layers)).map(goalAsRow)
      // Completed rows are KEPT. The review is where finished work most needs
      // to be visible — it draws each one struck through and marked — and
      // stripping them here is why "no visible completed song step" survived
      // the display fix (Codex acceptance walk, 2026-09-24). The page's own
      // lists sort open from done themselves.
      : selectPeriodTasks(layered, placeLevel, bounds.start, isCurrent, meId, seasons)),
    [isYearSession, goals, periodYear, layers, layered, placeLevel, bounds.start, isCurrent, meId, seasons],
  )
  const aboveIsCurrent = useMemo(() => isCurrentPeriod(periodBounds('season', aboveStart, seasons), today), [aboveStart, seasons, today])
  const aboveTasks = useMemo(() => (above === 'season'
    ? selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons).filter((t) => !t.completed)
    : []), [above, layered, aboveStart, seasons, aboveIsCurrent, meId])
  // Only season work still OPEN on that season is offered down; a row already
  // carried on (or dropped) is reference, as the goals beside it are.
  // …and never one already on THIS period: descending keeps the season's
  // commitment open, so work taken into October still reads as open Fall
  // work, and the session offered "Add to October" for it again (S3-09).
  const aboveItems = useMemo(() => {
    const here = new Set(currentPeriodTasks.map((t) => t.id))
    return offerableFromAbove(aboveTasks, 'season', aboveStart, aboveIsCurrent, seasons).filter((t) => !here.has(t.id))
  }, [aboveTasks, aboveStart, aboveIsCurrent, seasons, currentPeriodTasks])
  // A season's rail is the YEAR: goals to write beside, never tasks to take
  // down (the year plans in goals alone).
  const aboveGoalItems = useMemo(() => (above === 'year'
    ? goals.filter((g) => g.year === aboveStart.getFullYear() && g.status !== 'archived' && matchesLayers(g.context, layers)).map(goalAsRow)
    : aboveTasks.filter((t) => t.isGoal)), [above, goals, aboveStart, layers, aboveTasks])
  // The year has nothing above it: no rail, and no label for one.
  const aboveLabel = isYearSession ? '' : isSeasonSession ? String(aboveStart.getFullYear()) : 'the season'

  /**
   * The optional link UP, and the goal's own status — one write each, through
   * the fields that already exist. A month goal points at a season goal with
   * `supportsGoalTaskId`; a season goal points at a year goal with `goalId`.
   * Neither touches the goal's id, its steps, its placement or its history.
   */
  const parentChoices = useMemo(() => (level === 'month' || level === 'season')
    // `aboveGoalItems` is the rung above, already filtered by the reader's
    // layers — a goal they may not see is simply not offered.
    ? aboveGoalItems.map((g) => ({ id: g.id, title: g.title }))
    : [], [level, aboveGoalItems])

  /** The goal whose link or status is being written, so its controls can wait. */
  const [pendingGoal, setPendingGoal] = useState<string | null>(null)

  /**
   * Announce a saved link only once it is SAVED.
   *
   * The first version fired the confirmation on the line after
   * `void gated.updateTask(...)` — the same shape as the routine toast and the
   * event drag earlier today, and wrong for the same reason: a refused write
   * would have been announced as a stored relationship (Codex, 2026-09-24).
   */
  const linkParent = useCallback(async (row: PlanRowModel, parentId: string | null) => {
    const field = level === 'season' ? 'goalId' : 'supportsGoalTaskId'
    setPendingGoal(row.id)
    let ok = false
    try {
      ok = (await gated.updateTask(row.id, { [field]: parentId ?? undefined })) !== false
    } catch {
      ok = false
    } finally {
      setPendingGoal(null)
    }
    if (!ok) {
      showToast(parentId
        ? `Couldn’t link “${row.title}”. Nothing changed — try again.`
        : `Couldn’t remove the link on “${row.title}”. Nothing changed — try again.`, 'error', 6000)
      return
    }
    showToast(parentId
      ? `“${row.title}” now supports the goal you chose.`
      : `“${row.title}” no longer supports another goal. Nothing else changed.`, 'success', 5000)
  }, [gated, level])

  const setGoalStatus = useCallback(async (row: PlanRowModel, next: 'active' | 'completed') => {
    // The goal's OWN completion. Its steps are not consulted and not touched.
    setPendingGoal(row.id)
    let ok = false
    try {
      ok = (await gated.updateTask(row.id, { completed: next === 'completed' })) !== false
    } catch {
      ok = false
    } finally {
      setPendingGoal(null)
    }
    if (!ok) {
      showToast(`Couldn’t change the status of “${row.title}”. It is unchanged — try again.`, 'error', 6000)
    }
  }, [gated])

  const goalControlsFor = useCallback((row: PlanRowModel) => {
    if (level === 'year' || isPast) return undefined
    const busy = pendingGoal === row.id
    return (
      <span className="goal-head-controls">
        <GoalParentLink
          goalTitle={row.title}
          rungLabel={parentRungLabel(level === 'season' ? 'season' : 'month')}
          current={row.supports ?? null}
          choices={parentChoices}
          onLink={(id) => { void linkParent(row, id) }}
          onUnlink={() => { void linkParent(row, null) }}
          disabled={busy}
        />
        <GoalStatusControl
          goalTitle={row.title}
          status={rowIsDone(row.fate) ? 'completed' : 'active'}
          onChange={(next) => { void setGoalStatus(row, next) }}
          disabled={busy}
        />
      </span>
    )
  }, [level, isPast, parentChoices, linkParent, setGoalStatus, pendingGoal])


  // ── The year's writers. A year row is a GOAL, so every verb is a goal
  //    write: Keep copies the goal whole into the new year and links it back;
  //    Done and Drop change its status. Nothing is ever deleted — the year
  //    just gone stays readable.
  //
  //    The id a Keep will create with is fixed in the draft BEFORE the save
  //    starts (prepareDraft, below), so a half-failed Save retried lands on
  //    the SAME row rather than a second copy; `addGoal` has no other
  //    idempotent path. The writers only read that id, through a ref, because
  //    the host that owns the draft is constructed below, from these writers.
  const draftRef = useRef<SessionDraft | null>(null)
  const yearWriters = useMemo(() => {
    // prepareDraft has already filled every `keep` verdict's id; the fallback
    // is only for a draft that somehow reached a writer unprepared.
    const keptIdFor = (sourceId: string): string =>
      draftRef.current?.keptIds?.[sourceId] ?? crypto.randomUUID()
    const setStatus = async (id: string, status: 'completed' | 'archived') => {
      try { await updateGoal(id, { status }); return true } catch { return false }
    }
    return {
      keep: async (id: string, periodStart: Date) => {
        const src = goals.find((g) => g.id === id)
        if (!src) return false
        const year = periodStart.getFullYear()
        // A retry finds the goal the first attempt already carried.
        if (goals.find((g) => g.carriedFrom === id && g.year === year)) return true
        // goals RLS shares on scope: a copy that dropped it would turn a shared
        // goal private. An area from a year whose areas are gone is no area.
        const areaId = areas.some((a) => a.id === src.areaId) ? src.areaId : null
        const kept = await addGoal(areaId ?? null, src.name, src.context ?? undefined, {
          id: keptIdFor(id), year, notes: src.notes ?? null, strategy: src.strategy ?? null,
          scope: src.scope, carriedFrom: id,
        })
        return !!kept
      },
      // At the year everything written is a goal — the session offers no task list.
      addTask: async (title: string, o: { id: string; periodStart: Date; context: DomainId | null }) =>
        (await addGoal(null, title, o.context ?? undefined, { id: o.id, year: o.periodStart.getFullYear() }))?.id,
      contextOf: (id: string) => goals.find((g) => g.id === id)?.context ?? null,
      complete: (id: string) => setStatus(id, 'completed'),
      someday: async () => false,                                   // never offered at the year
      drop: (id: string) => setStatus(id, 'archived'),
      takeInto: async () => true,                                   // nothing sits above the year
    }
  }, [goals, areas, addGoal, updateGoal])

  const monthOrSeasonWriters = useMemo(() => ({
    keep: async (id: string, periodStart: Date, prevStart: Date) =>
      !!(await keepForward(id, isSeasonSession ? { seasonStart: periodStart } : { monthStart: periodStart }, prevStart)),
    // Each item's OWN domain, recorded when it was planned — never the one in view now (I4).
    addTask: (title: string, o: { id: string; periodStart: Date; day?: Date; isGoal?: boolean; goalTaskId?: string; aboveGoalId?: string; context: DomainId | null }) => {
      // The goal above, recorded (S3-02). Which column depends on what the
      // rail is made of:
      //   season session — the rail IS the goals table, so the pick is already
      //     a goals-table id: it belongs on goalId.
      //   month session — the rail is the SEASON's goal rows, so the pick is a
      //     task. It goes on supportsGoalTaskId, which keeps WHICH seasonal
      //     goal was chosen; goalId additionally inherits that season goal's
      //     own annual goal so roll-up to the year stays a flat filter.
      // Never goalTaskId: that means "is a step of", and steps are carried
      // along when their goal moves. A goal must not be carried by another.
      const support = o.isGoal && !isSeasonSession ? o.aboveGoalId : undefined
      const goalId = isSeasonSession ? o.aboveGoalId : tasks.find((t) => t.id === o.aboveGoalId)?.goalId
      return addTask(title, undefined, undefined, undefined, isSeasonSession
        ? { id: o.id, bucket: 'quarter' as const, seasonStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, goalId, context: o.context }
        : { id: o.id, bucket: 'month' as const, monthStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, goalId, supportsGoalTaskId: support, context: o.context })
    },
    contextOf: (id: string) => tasks.find((t) => t.id === id)?.context ?? null,
    // Everything a tick does (subtasks, waiting/discussion, a linked list item), and reports whether it wrote.
    complete: (id: string) => completeTask(id),
    someday: (id: string, context?: DomainId) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined, ...(context ? { context } : {}) }),
    drop: (id: string, prevStart: Date) => dropCommitment(id, placeLevel, prevStart),
    // The SESSION's month — pushTask(id, 'month') would target the month
    // containing today, i.e. September while planning October. A season takes
    // nothing down from the year (its rail is goals), so nothing calls this.
    takeInto: (id: string, periodStart: Date, context?: DomainId) => (isSeasonSession
      ? Promise.resolve(true)
      : gated.updateTask(id, { bucket: 'month', monthStart: periodStart, ...(context ? { context } : {}) })),
  }), [keepForward, addTask, tasks, completeTask, gated, dropCommitment, isSeasonSession, placeLevel])
  const sessionWriters = isYearSession ? yearWriters : monthOrSeasonWriters

  // Fix the ids every Keep will create with, once, before the first write: the
  // host persists the result, so a retry after a half-failed Save re-uses them.
  const prepareYearDraft = useCallback((d: SessionDraft): SessionDraft => {
    const kept = { ...(d.keptIds ?? {}) }
    let added = false
    for (const [id, verdict] of Object.entries(d.verdicts)) {
      if (verdict !== 'keep' || kept[id]) continue
      kept[id] = crypto.randomUUID()
      added = true
    }
    return added ? { ...d, keptIds: kept } : d
  }, [])

  const host = usePlanSessionHost({
    enabled: true, level, horizon, token,
    periodStart: bounds.start, prevStart: bounds.prev,
    listsLoading,
    back, current: currentPeriodTasks, above: aboveItems,
    writers: sessionWriters,
    prepareDraft: isYearSession ? prepareYearDraft : undefined,
    isCompleted: (id) => (isYearSession
      ? goals.find((g) => g.id === id)?.status === 'completed'
      : !!tasks.find((t) => t.id === id)?.completed),
  })
  const { saved: savedSession, loading: sessionLoading, error: sessionReadError, reload: reloadSession } = host.session
  const { sessionReady, draft, shownDraft, sessionOpen, savingSession, justSaved, saveError,
    startSession, changeDraft, closeSession, saveDraft, dismissJustSaved } = host
  // The year's Keep reads the draft being saved for the id it must re-use;
  // the host owns it, so it arrives here.
  draftRef.current = shownDraft

  // S2-01: a review has to open with what is already TRUE. The calendar stays
  // folded at rest (Scott, 2026-09-13), but entering a planning session opens
  // Shelves on it — and leaving the session puts both back as they were.
  const openedForSession = useRef<{ pinned: boolean } | null>(null)
  const showCalendar = useCallback(() => {
    const alreadyPinned = !!references?.pins.some((p) => p.kind === 'today')
    if (!alreadyPinned) references?.pin('today')
    setCalendarOpen(true)
    return alreadyPinned
  }, [references])
  const beginSession = useCallback(() => {
    openedForSession.current = { pinned: showCalendar() }
    startSession()
  }, [showCalendar, startSession])
  useEffect(() => {
    if (sessionOpen || !openedForSession.current) return
    if (!openedForSession.current.pinned) references?.unpin('today')
    setCalendarOpen(readOpen(calendarKey))
    openedForSession.current = null
  }, [sessionOpen, references, calendarKey])

  // The Shelves themselves live in `PeriodShelves`, so a goal's own page can
  // render the identical component for its period instead of falling back to
  // today's chooser (2026-09-24). Every value below is what this page already
  // computed; the move added no behaviour.
  const periodShelves = (
    <PeriodShelves
      level={level}
      bounds={bounds}
      above={above}
      railBounds={railBounds}
      railRows={railRows}
      noun={noun}
      patterns={patterns}
      routinesHeading={routinesHeading}
      routinesOpen={routinesOpen}
      toggleRoutines={toggleRoutines}
      dated={dated}
      calendarOpen={calendarOpen}
      toggleCalendar={toggleCalendar}
      eventsAvailable={eventsAvailable}
      eventsCoverPeriod={eventsCoverPeriod}
      onOpen={open}
      onPullDown={level === 'month' ? pullDown : undefined}
      onNavigate={navigate}
      onClose={() => {
        references?.shelvesTarget?.dispatchEvent(new Event('close-period-shelves'))
        references?.unpin('today')
      }}
    />
  )

  return (
    <div {...monthDrop} className={`${PAGE_COLUMN_WIDE} period-plan-page py-6${planDropOver ? ' reference-list-drop' : ''}`}>
      {/* The same open masthead Today wears: the period in the eyebrow, the
          page name as the title, the look-back cue on the quiet line when the
          period has ended. No date numeral — a month is not a day. */}
      <MastheadCard
        variant="page"
        eyebrow={(
          <PeriodNavEyebrow
            label={noun}
            onPrev={() => goTo(bounds.prev)}
            onNext={() => goTo(bounds.next)}
            prevLabel={`Previous ${noun}`}
            nextLabel={`Next ${noun}`}
            trailing={isCurrent ? undefined : (
              <button type="button" onClick={() => goTo(today)} aria-label={`Back to this ${noun}`}
                className="period-return ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-600 transition-colors hover:bg-primary-100">
                {/* Shorter on a phone: the full chip ran under the Shelves
                    button beside the title (390px check, 2026-09-25). */}
                <span className="hidden sm:inline">Back to this {noun}</span>
                <span className="sm:hidden">This {noun}</span>
              </button>
            )}
          />
        )}
        title={periodTitle(level, bounds.label)}
        action={<ShelvesButton periodShelves />}
        subline={isPast
          ? 'Look back: what got done, what didn\'t. Keep what still matters, drop the rest.'
          : lookingAhead
            ? <p className="text-[12px] text-neutral-500">{bounds.label} starts in {daysUntilStart} days · you&rsquo;re looking ahead</p>
            : <p className="text-[12px] text-neutral-500">What matters this {noun}.</p>}
        // The plan pages mount outside TasksApp's chrome context, so the
        // assistant toggle isn't reachable here; the domain lens still is,
        // and this page scopes by it (soleDomain).
        controls={chrome ? <HomeChromeControls className="flex" /> : <DomainSwitcher />}
      />

      {/* Who this page is showing, and the door to the period just ended —
          a quiet line rather than chrome crowded into the eyebrow. */}
      <div className="period-plan-context">
        <p className="text-[12px] text-neutral-500">{lensLabel}</p>
        {isCurrent && (
          <button
            type="button"
            onClick={() => goTo(bounds.prev)}
            className="shrink-0 text-[13px] font-medium text-primary-700 transition-colors hover:underline"
          >
            Review {prevPeriodLabel} <ArrowUpRight className="mb-0.5 inline h-3 w-3" />
          </button>
        )}
      </div>

      {/* The three optional ways in USED to open here, as a large box above
          the plan. They live on their own page now — a planning page should
          open on the plan (Scott, via Codex 2026-09-24). See /start. */}
      {/* Guided planning: whether this month is planned, and the door into
          the session. Month and season; a past period is a look-back. */}
      {!isPast && (
        <div className="period-plan-status">
          <p className="text-[13px] text-neutral-500">
            {sessionReadError
              ? <>Couldn&rsquo;t check whether {shortLabel} is planned. <button type="button" onClick={reloadSession} className="font-semibold text-primary-700 hover:underline">Try again</button></>
              : savedSession
                ? <span className="font-semibold text-sage-600">Planned {savedSession.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                // A count of a list that has not arrived is not a count.
                : listsLoading
                  ? <span className="text-neutral-400">Loading…</span>
                  : `${goalRows.filter((r) => !rowIsDone(r.fate)).length} goals${level === 'year' ? '' : ` · ${openTaskRows.length + supportingTaskCount} tasks`}`}
            {/* S2-15: the body said "0 goals · 0 tasks" while five things
                were already on the calendar, all behind a closed Shelves.
                The count is here; the button opens them. */}
            {dated.length > 0 && (
              <>
                {' · '}
                <button type="button" onClick={() => { showCalendar() }} className="text-neutral-500 underline decoration-dotted underline-offset-2 hover:text-neutral-700">
                  {dated.length} on the calendar
                </button>
              </>
            )}
          </p>
          {/* Never while a session is open: the reader is mid-draft, and this
              link would navigate them out of it. */}
          {neighbourWithWork && !sessionOpen && (
            <button type="button" onClick={() => goTo(neighbourWithWork.start)}
              className="ml-2 text-[13px] text-primary-700 hover:underline">
              {neighbourWithWork.label} has {neighbourWithWork.summary} &rarr;
            </button>
          )}
          <span className="flex-1" />
          {!sessionOpen && (
            <button type="button" onClick={beginSession} disabled={!sessionReady} aria-busy={sessionLoading || undefined}
              className={`${savedSession
                ? 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700'
                : 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-semibold text-primary-700'} disabled:opacity-50`}>
              {savedSession ? 'Review the plan' : draft && !isEmptyDraft(draft) ? `Continue planning ${shortLabel}` : `Plan ${shortLabel}`}
            </button>
          )}
        </div>
      )}
      {justSaved && !sessionOpen && (
        <PlanNextLine
          planned={shortLabel}
          message={`When you’re ready, plan the ${nextRung} with ${shortLabel} beside you.`}
          nextLabel={`the ${nextRung}`}
          to={`/${nextRung}`}
          onDismiss={dismissJustSaved}
        />
      )}

      {sessionOpen && shownDraft ? (
        <PlanSession level={level} aboveLabel={aboveLabel} periodLabel={shortLabel} prevLabel={prevPeriodLabel}
          finished={back.finished} open={back.open} current={currentPeriodTasks}
          above={aboveItems} aboveGoals={aboveGoalItems} hiddenStepGoals={hiddenStepGoals} domainInView={soleDomain ?? null} uid={user?.id ?? null}
          draft={shownDraft} onChange={changeDraft} onClose={closeSession} onSave={saveDraft} saving={savingSession} saveError={saveError} />
      ) : (
      /* The plan on the left, what you consult while writing it on the
          right — the calendar included. Reference sits WITH reference instead
          of interrupting the list (Scott, 2026-09-13). One column on a phone. */
      <div className="period-plan-layout">
        <div className="period-plan-main">
          {/* Goals — what you want from the period. */}
          <section aria-label={`${bounds.label} goals`} className="period-goals-card">
            <div className="flex items-start gap-2 px-1">
              <h2 className="min-w-0 flex-1 font-display text-2xl text-neutral-800">{noun[0].toUpperCase() + noun.slice(1)} goals</h2>
              {!isPast && (
                <button
                  type="button"
                  aria-label={`Add a goal for ${shortLabel}`}
                  onClick={() => { if (goalRows.length === 0) goalInputRef.current?.focus(); else setAddingGoal((v) => !v) }}
                  className="mt-1.5 shrink-0 text-[13px] text-neutral-500 transition-colors hover:text-primary-700"
                >
                  + Add a goal
                </button>
              )}
            </div>
            <p className="period-section-note">{level === 'year'
                ? 'What do you want this year to add up to?'
                : level === 'season'
                  ? 'What deserves attention this season? Add the next actions under each goal.'
                  : 'What progress do you want to make this month? Add the next actions under each goal, then plan them into weeks.'}</p>
            <div className="mt-3">
              {goalRows.length === 0 ? (
                isPast ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">Nothing was on this {noun}'s goals.</p>
                ) : null
              ) : (
                <>
                  {/* A filter and a completed fold, shown only once the list is
                      long enough to need them — on two goals they are clutter. */}
                  {/* The filter earns its place only on a long list. The
                      completed fold appears whenever there is finished work
                      behind it — hiding steps AND the way to see them is how
                      work goes missing. */}
                  {(listIsLong || goalQuery || anyCompletedSteps) && (
                    <div className="period-goals-tools">
                      {(listIsLong || goalQuery) && (
                        <input
                          type="search"
                          value={goalQuery}
                          onChange={(e) => setGoalQuery(e.target.value)}
                          onKeyDown={clearFilterOnEscape(goalQuery, () => setGoalQuery(''))}
                          aria-label={`Filter ${bounds.label} goals and steps`}
                          placeholder="Filter goals and steps…"
                          className="period-goals-filter"
                        />
                      )}
                      {anyCompletedSteps && (
                        <button type="button" onClick={toggleCompletedSteps} className="period-goals-toggle">
                          {showCompletedSteps ? 'Hide completed steps' : 'Show completed steps'}
                        </button>
                      )}
                    </div>
                  )}
                  {/* What the filter is keeping off the screen, said plainly —
                      and that it changes nothing about what Save would write. */}
                  {goalsHidden && (
                    <p role="status" className="period-goals-hidden">
                      {goalsHidden}. Filtering does not change what will be saved.
                    </p>
                  )}
                  {goalView.goals.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-neutral-400">No goal or step matches “{goalQuery}”.</p>
                  ) : (
                  <ul>
                    {goalView.goals.map((g) => (
                      <PlanRow assign={assignFor} makeGoal={makeGoalFor} key={g.row.id} row={g.row} onOpen={open} onOpenPlaced={openPlaced} onOpenSupport={openSupport} onAction={(a, r) => { void act(a, r) }} planWeek={planWeekSlot} timingReachesLower={level === 'month'}
                        lowerLabel={lowerLabelText}
                        expanded={g.expanded}
                        onToggleExpand={toggleGoal}
                        stepsToDraw={g.steps}
                        counts={g.counts}
                        hiddenByReveal={g.hiddenByReveal}
                        onShowAllSteps={showAllSteps}
                        hiddenByFilter={g.hiddenByFilter}
                        goalControls={goalControlsFor(g.row)}
                        focusComposer={composerFocusId === g.row.id} onComposerFocused={clearComposerFocus}
                        onAddStep={isPast ? undefined : (goal, t) => { void addStep(goal, t) }}
                        stepActionsFor={(st) => actionsFor({ fate: st.fate, isGoal: false, isPast, level })}
                          actions={actionsFor({ fate: g.row.fate, isGoal: g.row.isGoal, isPast, level })} />
                    ))}
                  </ul>
                  )}
                </>
              )}
              {doneGoalRows.length > 0 && (
                <details className="period-assigned-fold" key={`goals-${level}-${bounds.start.toISOString()}`} open={isPast || undefined}>
                  <summary>Completed goals · {doneGoalRows.length}</summary>
                  <ul>{doneGoalRows.map((row) => (
                    <PlanRow assign={assignFor} makeGoal={makeGoalFor} key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onOpenSupport={openSupport} planWeek={planWeekSlot} timingReachesLower={level === 'month'}
                      // A finished goal keeps its controls: reopening one is
                      // the whole reason to look at this fold (Codex).
                      goalControls={goalControlsFor(row)}
                      onAction={(a, r) => { void act(a, r) }} lowerLabel={lowerLabelText}
                      expanded={expandedGoals.has(row.id)} onToggleExpand={toggleGoal}
                      stepActionsFor={(st) => actionsFor({ fate: st.fate, isGoal: false, isPast, level })}
                      actions={actionsFor({ fate: row.fate, isGoal: true, isPast, level })} />
                  ))}</ul>
                </details>
              )}
              {goalComposerOpen && (
                <form
                  className="mt-1 flex items-center gap-2 px-2"
                  onSubmit={(e) => { e.preventDefault(); const t = goalDraft; setGoalDraft(''); void addRow(t, true) }}
                >
                  <Target className="h-4 w-4 shrink-0 text-accent-600" />
                  <input
                    ref={goalInputRef}
                    autoFocus={addingGoal}
                    aria-label={`New goal for ${shortLabel}`}
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    placeholder={`What do you want from this ${noun}?`}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                  />
                </form>
              )}
            </div>
          </section>

          {/* Tasks — the concrete things. The year plans in goals alone. */}
          {level !== 'year' && (
            <section aria-label={`${bounds.label} list`} className="period-tasks-card">
              <h2 className="px-1 font-display text-2xl text-neutral-800">{noun[0].toUpperCase() + noun.slice(1)} tasks</h2>
              <p className="period-section-note">{level === 'month'
                ? 'Single actions for the month. Plan each into a week — or break a bigger one into next actions.'
                : 'Work for the season. Plan each into a month — or break a bigger one into next actions.'}</p>
              <div className="mt-3">
                {openTaskRows.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">
                    {supportingTaskCount > 0 ? `${supportingTaskCount} supporting ${supportingTaskCount === 1 ? 'task is' : 'tasks are'} listed under the goals above.` : doneTaskRows.length > 0
                      ? `Everything on this ${noun}'s list is done.`
                      : isPast
                        ? `Nothing was on this ${noun}'s list.`
                        : (
                          <>
                            Nothing on this {noun}'s list yet.{!savedSession && (
                              <>
                                {' '}
                                <button type="button" onClick={beginSession} disabled={!sessionReady}
                                  className="font-semibold text-primary-700 hover:underline disabled:opacity-50">
                                  Plan {shortLabel} →
                                </button>
                              </>
                            )}
                          </>
                        )}
                  </p>
                ) : (
                  <>
                  <h3 className="period-group-label">{level === 'month' ? 'To plan into a week' : 'To plan into a month'} <span>{availableTaskRows.length}</span></h3>
                  {availableTaskRows.length === 0 && <p className="period-section-note">Every open task has a more specific commitment.</p>}
                  <ul>
                    {visibleTaskRows.map((row) => (
                      <PlanRow assign={assignFor} makeGoal={makeGoalFor} key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onOpenSupport={openSupport} onAction={(a, r) => { void act(a, r) }} planWeek={planWeekSlot} timingReachesLower={level === 'month'}
                        lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level, hasGoals: goalRows.length > 0 })} />
                    ))}
                  </ul>
                  </>
                )}
                {/* One picker, not one per row. Rendered where the row you are
                    filing lives, so the answer appears next to the question. */}
                {pickingGoalFor && (
                  <div
                    role="dialog"
                    aria-label="Link to goal"
                    className="mt-2 rounded-lg border border-neutral-200 bg-bg-elevated p-2 shadow-md"
                  >
                    <p className="px-2 py-1 text-[12px] text-neutral-500">Which goal does this task support?</p>
                    {linkError && <p role="alert" className="p-2 text-sm text-red-600">Could not link this task. Try again.</p>}
                    <ul>
                      {goalRows.map((g) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            onClick={() => { void fileUnderGoal(pickingGoalFor, g.id) }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-800 transition-colors hover:bg-white"
                          >
                            <Target className="h-3.5 w-3.5 shrink-0 text-accent-600" />
                            <span className="truncate">{g.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setPickingGoalFor(null)}
                      className="mt-1 px-2 py-1 text-[12px] text-neutral-500 transition-colors hover:text-neutral-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {overCap && (
                  <button
                    type="button"
                    onClick={toggleShowAll}
                    className="mt-1 w-full px-2 py-1 text-left text-[13px] text-neutral-500 transition-colors hover:text-primary-700"
                  >
                    {showAll
                      ? `Show the first ${TASK_PREVIEW_CAP}`
                      : `Show all ${availableTaskRows.length} — ${hiddenTaskCount} more`}
                  </button>
                )}

                {!isPast && (
                  <form
                    className="mt-1 flex items-center gap-2 px-2"
                    onSubmit={(e) => { e.preventDefault(); const t = taskDraft; setTaskDraft(''); void addRow(t, false) }}
                  >
                    <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
                    <input
                      aria-label={`Add to this ${noun}`}
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      placeholder={`Add a task for ${shortLabel}`}
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                    />
                  </form>
                )}
              </div>

              {assignedTaskRows.length > 0 && (
                <details className="period-assigned-fold" key={`${level}-${bounds.start.toISOString()}`}>
                  {/* Where the work went, not "assigned" — that word now means
                      people (Assign people). Still this period's plan. */}
                  <summary>{level === 'month' ? 'Planned into weeks' : 'Planned into months'} · {assignedTaskRows.length}</summary>
                  <p className="period-section-note">Still part of this {noun}’s plan — open {level === 'month' ? 'a week' : 'a month'} below to plan its days.</p>
                  <ul>{assignedTaskRows.map((row) => (
                    <PlanRow assign={assignFor} makeGoal={makeGoalFor} key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onOpenSupport={openSupport} planWeek={planWeekSlot} timingReachesLower={level === 'month'}
                      onAction={(a, r) => { void act(a, r) }} lowerLabel={lowerLabelText}
                      actions={actionsFor({ fate: row.fate, isGoal: false, isPast, level, hasGoals: goalRows.length > 0 })} />
                  ))}</ul>
                </details>
              )}

              {doneTaskRows.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    aria-expanded={doneOpen}
                    onClick={toggleDone}
                    className="flex items-center gap-1.5 px-1 text-[13px] text-neutral-500 transition-colors hover:text-neutral-700"
                  >
                    {doneOpen
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                    Completed this {noun}
                    <span className="tabular-nums text-neutral-400">{doneTaskRows.length}</span>
                  </button>
                  {doneOpen && (
                    <ul className="mt-1 border-t border-neutral-200">
                      {doneTaskRows.map((row) => (
                        <PlanRow assign={assignFor} makeGoal={makeGoalFor} key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onOpenSupport={openSupport} onAction={(a, r) => { void act(a, r) }} planWeek={planWeekSlot} timingReachesLower={level === 'month'}
                          lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {/* The way down: the next rung's periods, what is on each, and where
              to open it — so a month whose work all has weeks ends in a next
              step, not an "Already assigned" fold (nested horizons). */}
          {!isPast && (
            <NextLevelStrip
              heading={level === 'month' ? 'Plan work for a week' : level === 'season' ? 'Plan work for a month' : 'Plan a season'}
              note={level === 'month'
                ? 'Next actions and tasks go into weeks; the goals stay here. Open a week to plan its days.'
                : level === 'season'
                  ? 'Goals stay on the season. Open a month to add their next actions and plan its weeks.'
                  : 'The year holds outcomes. Open a season to set its goals and next actions.'}
              choices={nextLevel}
              onOpen={(c) => navigate(c.href)}
            />
          )}
        </div>

        {/* Outside a shell (tests, previews) the Shelves sit in this column. */}
        {!references ? periodShelves : null}

      </div>
      )}
      {/* Portalled OUTSIDE the session/list switch: opening a planning
          session opens Shelves on the calendar (S2-01), and inside the list
          branch the panel it opened was empty. */}
      {references?.shelvesTarget ? createPortal(periodShelves, references.shelvesTarget) : null}
    </div>
  )
}

/** Mounted at /month, /season and /year. Mounts its own GoalsProvider (the
 *  Shell tree doesn't), the way GoalsApp does. */
export function PeriodPlanPage({ level }: { level: PlanLevel }) {
  return (
    <GoalsProvider>
      <PeriodPlanPageInner level={level} />
    </GoalsProvider>
  )
}
