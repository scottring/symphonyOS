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

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Target, ChevronDown, ChevronRight, Repeat, ArrowUpRight } from 'lucide-react'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { makePlanActions } from '@/lib/planning/planActions'
import { planDropHandlers } from '@/lib/planning/planDrag'
import { showToast } from '@/hooks/useToast'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useRoutines } from '@/hooks/useRoutines'
import { routinePatterns } from '@/lib/planning/routinePatterns'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { placementFateOf, lowerPlacement } from '@/lib/placement/model'
import { splitGoalRows } from '@/lib/planning/goalSteps'
import { parseLocalYmd } from '@/lib/cadence/config'
import { monthToken, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { seasonToken } from '@/lib/cadence/seasons'
import { usePlanSessionHost } from '@/hooks/usePlanSessionHost'
import { useAuth } from '@/hooks/useAuth'
import { lookBackRows, isEmptyDraft, goalsWithHiddenSteps, goalAsRow, yearLookBack, type SessionDraft } from '@/lib/planning/session'
import type { DomainId } from '@/lib/domains'
import { formatShortDate } from '@/lib/dateHelpers'
import {
  periodBounds, isCurrentPeriod, selectPeriodTasks, selectDatedInPeriod, actionsFor, railLevel, lowerLevel, planningPeriod, offerableFromAbove,
  type PlanLevel, type RowAction,
} from '@/lib/planning/periodPage'
import { firstNoteLine } from '@/lib/planning/goalsReference'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { PlanRow, rowIsDone, type PlanRowModel } from './PlanRow'
import { PlanRail } from './PlanRail'
import { readOpen, readFoldPref, writeOpen } from './foldState'
import { PlanSession } from './PlanSession'
import { PlanNextLine } from './PlanNextLine'

/** How many tasks a period's list shows before it asks. A long plan is still
 *  a plan, but a page that opens with twenty rows is a page you scroll rather
 *  than read (Scott, 2026-09-13). Same number the review drawer paces itself
 *  by, deliberately. */
const TASK_PREVIEW_CAP = 5

const TITLE: Record<PlanLevel, string> = { month: 'This Month', season: 'This Season', year: 'This Year' }
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
function taskRow(t: Task, level: PlanLevel, periodStart: Date): PlanRowModel {
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
  }
}
function goalRow(g: Goal): PlanRowModel {
  return {
    id: g.id, title: g.name, isGoal: true, fate: g.status === 'completed' ? 'done' : 'open', kind: 'goal',
    subtitle: g.strategy?.trim() || firstNoteLine(g.notes),
  }
}

function PeriodPlanPageInner({ level }: { level: PlanLevel }) {
  const navigate = useNavigate()
  const { tasks, loading, toggleTask, deleteTask, updateTask, updateTasksBulk, addTask, setGoal, pushTask, keepForward, dropCommitment, completeTask } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const { activeRoutines } = useRoutines()
  const { goals, areas, addGoal, updateGoal, addArea } = useGoalsContext()

  const [searchParams] = useSearchParams()
  const startParam = searchParams.get('start')
  const explicitStart = useMemo(() => (startParam ? parseLocalYmd(startParam) : null), [startParam])

  const today = useMemo(() => new Date(), [])
  const [anchor, setAnchor] = useState<Date>(() => (explicitStart ? periodBounds(level, explicitStart, seasons).start : today))
  const [lookingAhead, setLookingAhead] = useState(false)
  // Once the user has navigated (prev/next/"Back to this…") — or an explicit
  // start was given — the initial-period computation below must never
  // override where they are.
  const anchorSettledRef = useRef(!!explicitStart)

  const bounds = useMemo(() => periodBounds(level, anchor, seasons), [level, anchor, seasons])
  const isCurrent = isCurrentPeriod(bounds, today)
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
    const result = planningPeriod({
      level, today, seasons,
      countFor: (s) => selectPeriodTasks(layered, level as 'month' | 'season', s, isCurrentPeriod(periodBounds(level, s, seasons), today), meId, seasons).length,
    })
    setAnchor(result.start)
    setLookingAhead(result.lookingAhead)
  }, [tasks.length, loading, seasonsLoading, level, today, seasons, layered, meId])

  const goTo = useCallback((d: Date) => {
    anchorSettledRef.current = true
    setLookingAhead(false)
    setAnchor(d)
  }, [])

  // ── The list ─────────────────────────────────────────────────────────────
  const rows = useMemo<PlanRowModel[]>(() => {
    if (level === 'year') {
      const year = bounds.start.getFullYear()
      return goals.filter((g) => g.year === year && g.status !== 'archived' && matchesLayers(g.context, layers)).map(goalRow)
    }
    const list = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons).map((t) => taskRow(t, level, bounds.start))
    // Goals first — a goal is what the period is for — then tasks, each in
    // the order they were written.
    return [...list.filter((r) => r.isGoal), ...list.filter((r) => !r.isGoal)]
  }, [level, goals, layers, layered, bounds.start, isCurrent, meId, tasks, seasons])

  // ── On the calendar: timed items landing inside this period. The list
  //    above answers a POOL question (bucket === level); this answers a DATE
  //    question, so a dated item never goes missing just because it lives on
  //    a different bucket (demo run 2026-09-06). Month and season only — a
  //    year list is goals, with no dates to show. ─────────────────────────
  const dated = useMemo(() => (level === 'year' ? [] : selectDatedInPeriod(layered, bounds)), [level, layered, bounds])

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
    return planningPeriod({
      level: above, today, seasons,
      countFor: (s) => (above === 'season' ? selectPeriodTasks(layered, 'season', s, isCurrentPeriod(periodBounds('season', s, seasons), today), meId, seasons).length : 0),
    }).start
  }, [above, today, seasons, layered, meId, bounds.start])
  const railRows = useMemo<PlanRowModel[]>(() => {
    if (above === 'season') {
      // The fold can look ahead to a season that ISN'T actually current
      // (near a boundary) — asking the pool question there would pull in
      // every legacy NULL-seasonStart row regardless of which season it
      // opened on (the exact trap periodPlacement.ts warns about).
      const aboveIsCurrent = isCurrentPeriod(periodBounds('season', aboveStart, seasons), today)
      return selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons).map((t) => taskRow(t, 'season', aboveStart))
    }
    if (above === 'year') {
      return goals.filter((g) => g.year === aboveStart.getFullYear() && g.status !== 'archived' && matchesLayers(g.context, layers)).map(goalRow)
    }
    return []
  }, [above, layered, aboveStart, seasons, today, meId, tasks, goals, layers])
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

  const open = useCallback((row: PlanRowModel) => {
    navigate(row.kind === 'goal' ? `/goals/${row.id}` : `/task/${row.id}`)
  }, [navigate])

  const act = useCallback(async (action: RowAction, row: PlanRowModel) => {
    if (row.kind === 'goal') {
      const g = goals.find((x) => x.id === row.id)
      if (!g) return
      if (action === 'complete') await updateGoal(g.id, { status: g.status === 'completed' ? 'active' : 'completed' })
      // Drop lets a goal GO, it does not erase the year it was held in: the
      // year's session and its look-back still need the record (Task 4).
      else if (action === 'drop') await updateGoal(g.id, { status: 'archived' })
      else if (action === 'keep') {
        const kept = await addGoal(g.areaId, g.name, g.context ?? undefined)
        if (kept) await updateGoal(kept.id, { year: bounds.next.getFullYear() })
      }
      return
    }
    if (action === 'complete') await toggleTask(row.id)
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
      if (lower) await gated.pushTask(row.id, lower)
    }
    else if (action === 'today') {
      // The Today command (S4): dated today, all-day, and chosen for my
      // focus. The month or season commitment stays — a date never erases the
      // broader commitment.
      await planActions.chooseTaskDay(row.id, new Date())
    }
    else if (action === 'under-goal') setPickingGoalFor(row.id)
  }, [goals, updateGoal, addGoal, bounds.next, bounds.start, isPast, toggleTask, deleteTask, dropCommitment, gated, setGoal, keepForward, level, planActions])

  // The rail's one verb: take an open season task into this month — the same
  // row gains a month commitment; the season keeps it, marked "→ September".
  const pullDown = useCallback((row: PlanRowModel) => {
    void gated.pushTask(row.id, 'month')
  }, [gated])

  // The calendar is a view you OPEN, not the thing that greets you: the page
  // answers "what do we want from this month?" first (Scott, 2026-09-13: the
  // calendar came first and pushed the plan below it).
  const calendarKey = `symphony-plan-calendar-${level}`
  const [calendarOpen, setCalendarOpen] = useState(() => readOpen(calendarKey))
  const toggleCalendar = useCallback(() => {
    setCalendarOpen((v) => { writeOpen(calendarKey, !v); return !v })
  }, [calendarKey])

  // ── Routines this period ─────────────────────────────────────────────────
  // PATTERNS, not occurrences: what already takes up time, so the plan is
  // written against real capacity. No checkboxes — an occurrence is ticked on
  // Week or Today, and the pattern itself is edited in Routines (Scott,
  // 2026-09-13). Eligibility runs the one resolver, date-agnostically: a
  // month is not a day, so rung 2 must not filter by one date's recurrence.
  const patterns = useMemo(
    () => (level === 'year' ? [] : routinePatterns(activeRoutines, layers)),
    [activeRoutines, layers, level],
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
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())
  const toggleGoal = useCallback((row: PlanRowModel) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.add(row.id)
      return next
    })
  }, [])

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

  const [pickingGoalFor, setPickingGoalFor] = useState<string | null>(null)
  const fileUnderGoal = useCallback(async (taskId: string, goalId: string) => {
    setPickingGoalFor(null)
    await gated.updateTask(taskId, { goalTaskId: goalId })
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
      ...taskRow(g, level, bounds.start),
      steps: (split.stepsByGoal.get(g.id) ?? []).map((st) => taskRow(st, level, bounds.start)),
    }))
  }, [split, rows, tasks])
  // An empty period opens with the question already asked. The first real
  // walkthrough (Scott, 2026-09-20) stalled on a blank /year: a grey "No goals
  // for this year yet." and a 13px "+ Add a goal" off to the right read as
  // "nothing to do here". The composer IS the empty state.
  const goalComposerOpen = !isPast && (addingGoal || goalRows.length === 0)

  const looseRows = useMemo(
    () => (split ? split.loose.map((t) => taskRow(t, level, bounds.start)) : rows.filter((r) => !r.isGoal)),
    [split, rows, tasks],
  )
  // Finished work leaves the working list and waits behind a fold. On a PAST
  // period the fold opens by default: a look-back is precisely about what got
  // done (Scott, 2026-09-13).
  const openTaskRows = useMemo(() => looseRows.filter((r) => !rowIsDone(r.fate)), [looseRows])
  const doneTaskRows = useMemo(() => looseRows.filter((r) => rowIsDone(r.fate)), [looseRows])
  const lowerLabelText = lowerLevel(level) === 'week' ? 'this week' : 'this month'
  const visibleTaskRows = showAll ? openTaskRows : openTaskRows.slice(0, TASK_PREVIEW_CAP)
  // Gated on the LIST being long, not on rows being hidden right now —
  // otherwise expanding removes the only way back to five.
  const overCap = openTaskRows.length > TASK_PREVIEW_CAP
  const hiddenTaskCount = openTaskRows.length - visibleTaskRows.length

  const openPlaced = useCallback((taskId: string) => { navigate(`/task/${taskId}`) }, [navigate])

  const noun = NOUN[level]
  const shortLabel = level === 'month'
    ? bounds.start.toLocaleDateString('en-US', { month: 'long' })
    : bounds.label
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
  // The year's "current" list is this year's live goals, as rows.
  const currentPeriodTasks = useMemo(
    () => (isYearSession
      ? goals.filter((g) => g.year === periodYear && g.status === 'active' && matchesLayers(g.context, layers)).map(goalAsRow)
      : selectPeriodTasks(layered, placeLevel, bounds.start, isCurrent, meId, seasons).filter((t) => !t.completed)),
    [isYearSession, goals, periodYear, layers, layered, placeLevel, bounds.start, isCurrent, meId, seasons],
  )
  const aboveIsCurrent = useMemo(() => isCurrentPeriod(periodBounds('season', aboveStart, seasons), today), [aboveStart, seasons, today])
  const aboveTasks = useMemo(() => (above === 'season'
    ? selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons).filter((t) => !t.completed)
    : []), [above, layered, aboveStart, seasons, aboveIsCurrent, meId])
  // Only season work still OPEN on that season is offered down; a row already
  // carried on (or dropped) is reference, as the goals beside it are.
  const aboveItems = useMemo(
    () => offerableFromAbove(aboveTasks, 'season', aboveStart, aboveIsCurrent, seasons),
    [aboveTasks, aboveStart, aboveIsCurrent, seasons],
  )
  // A season's rail is the YEAR: goals to write beside, never tasks to take
  // down (the year plans in goals alone).
  const aboveGoalItems = useMemo(() => (above === 'year'
    ? goals.filter((g) => g.year === aboveStart.getFullYear() && g.status !== 'archived' && matchesLayers(g.context, layers)).map(goalAsRow)
    : aboveTasks.filter((t) => t.isGoal)), [above, goals, aboveStart, layers, aboveTasks])
  // The year has nothing above it: no rail, and no label for one.
  const aboveLabel = isYearSession ? '' : isSeasonSession ? String(aboveStart.getFullYear()) : 'the season'

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
    addTask: (title: string, o: { id: string; periodStart: Date; day?: Date; isGoal?: boolean; goalTaskId?: string; context: DomainId | null }) =>
      addTask(title, undefined, undefined, undefined, isSeasonSession
        ? { id: o.id, bucket: 'quarter' as const, seasonStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context }
        : { id: o.id, bucket: 'month' as const, monthStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context }),
    contextOf: (id: string) => tasks.find((t) => t.id === id)?.context ?? null,
    // Everything a tick does (subtasks, waiting/discussion, a linked list item), and reports whether it wrote.
    complete: (id: string) => completeTask(id),
    someday: (id: string) => gated.updateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }),
    drop: (id: string, prevStart: Date) => dropCommitment(id, placeLevel, prevStart),
    // The SESSION's month — pushTask(id, 'month') would target the month
    // containing today, i.e. September while planning October. A season takes
    // nothing down from the year (its rail is goals), so nothing calls this.
    takeInto: (id: string, periodStart: Date) => (isSeasonSession
      ? Promise.resolve(true)
      : gated.updateTask(id, { bucket: 'month', monthStart: periodStart })),
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
    listsLoading: loading || seasonsLoading,
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
  const { user } = useAuth()
  // The year's Keep reads the draft being saved for the id it must re-use;
  // the host owns it, so it arrives here.
  draftRef.current = shownDraft

  return (
    <div {...monthDrop} className={`${PAGE_COLUMN_WIDE} py-6${planDropOver ? ' reference-list-drop' : ''}`}>
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
              <button type="button" onClick={() => goTo(today)}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-600 transition-colors hover:bg-primary-100">
                Back to this {noun}
              </button>
            )}
          />
        )}
        title={periodTitle(level, bounds.label)}
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
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-neutral-200/70 pb-2">
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

      {/* Guided planning: whether this month is planned, and the door into
          the session. Month and season; a past period is a look-back. */}
      {!isPast && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-neutral-500">
            {sessionReadError
              ? <>Couldn&rsquo;t check whether {shortLabel} is planned. <button type="button" onClick={reloadSession} className="font-semibold text-primary-700 hover:underline">Try again</button></>
              : savedSession
                ? <span className="font-semibold text-sage-600">Planned {savedSession.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                : 'Not planned yet'}
          </p>
          <span className="flex-1" />
          {!sessionOpen && (
            <button type="button" onClick={startSession} disabled={!sessionReady} aria-busy={sessionLoading || undefined}
              className={`${savedSession
                ? 'rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700'
                : 'rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white'} disabled:opacity-50`}>
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
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 flex flex-col gap-4">
          {/* Goals — what you want from the period. */}
          <section aria-label={`${bounds.label} goals`} className="min-w-0">
            <div className="flex items-start gap-2 px-1">
              <h2 className="min-w-0 flex-1 font-display text-2xl text-neutral-800">{shortLabel} goals</h2>
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
            <div className="mt-2 border-t-2 border-primary-700 pt-1">
              {goalRows.length === 0 ? (
                isPast ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">Nothing was on this {noun}'s goals.</p>
                ) : !savedSession ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">
                    Nothing yet.{' '}
                    <button type="button" onClick={startSession} disabled={!sessionReady}
                      className="font-semibold text-primary-700 hover:underline disabled:opacity-50">
                      Plan {shortLabel} →
                    </button>
                  </p>
                ) : null
              ) : (
                <ul>
                  {goalRows.map((row) => (
                    <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onAction={(a, r) => { void act(a, r) }}
                      lowerLabel={lowerLabelText}
                      expanded={expandedGoals.has(row.id)}
                      onToggleExpand={toggleGoal}
                      onAddStep={isPast ? undefined : (g, t) => { void addStep(g, t) }}
                      stepActionsFor={(st) => actionsFor({ fate: st.fate, isGoal: false, isPast, level })}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
                  ))}
                </ul>
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
            <section aria-label={`${bounds.label} list`} className="min-w-0">
              <h2 className="px-1 font-display text-2xl text-neutral-800">{shortLabel} tasks</h2>
              <div className="mt-2 border-t border-neutral-300 pt-1">
                {openTaskRows.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">
                    {doneTaskRows.length > 0
                      ? `Everything on this ${noun}'s list is done.`
                      : isPast
                        ? `Nothing was on this ${noun}'s list.`
                        : (
                          <>
                            Nothing on this {noun}'s list yet.{!savedSession && (
                              <>
                                {' '}
                                <button type="button" onClick={startSession} disabled={!sessionReady}
                                  className="font-semibold text-primary-700 hover:underline disabled:opacity-50">
                                  Plan {shortLabel} →
                                </button>
                              </>
                            )}
                          </>
                        )}
                  </p>
                ) : (
                  <ul>
                    {visibleTaskRows.map((row) => (
                      <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onAction={(a, r) => { void act(a, r) }}
                        lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level, hasGoals: goalRows.length > 0 })} />
                    ))}
                  </ul>
                )}
                {/* One picker, not one per row. Rendered where the row you are
                    filing lives, so the answer appears next to the question. */}
                {pickingGoalFor && (
                  <div
                    role="dialog"
                    aria-label="Put it under a goal"
                    className="mt-2 rounded-lg border border-neutral-200 bg-bg-elevated p-2 shadow-md"
                  >
                    <p className="px-2 py-1 text-[12px] text-neutral-500">Put it under…</p>
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
                      : `Show all ${openTaskRows.length} — ${hiddenTaskCount} more`}
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
                        <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onAction={(a, r) => { void act(a, r) }}
                          lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* The bigger picture — the rung above, and the dates, both look-only. */}
        {(above || dated.length > 0 || patterns.length > 0) && (
          <aside className="min-w-0 flex flex-col gap-3 lg:pt-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">The bigger picture</p>
            {above && railBounds && (
              <PlanRail
                title={TITLE[above]}
                subtitle={railBounds.label}
                rows={railRows}
                onOpen={open}
                onPullDown={level === 'month' ? pullDown : undefined}
                pullLabel="Add to this month:"
                emptyCopy={`Nothing on this ${NOUN[above]}'s list.`}
                storageKey={`symphony-plan-rail-${level}`}
              />
            )}
            {patterns.length > 0 && (
              <section aria-label={routinesHeading} className="min-w-0 border-t border-neutral-200 pt-2.5">
                <button
                  type="button"
                  onClick={toggleRoutines}
                  aria-expanded={routinesOpen}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  {routinesOpen
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
                  {/* Routines carry no history — there is no record of which
                      patterns were active in August — so only the CURRENT
                      period may claim to be showing its own (review
                      2026-09-13). Elsewhere the heading says what this
                      truthfully is. */}
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{routinesHeading}</h2>
                  <span className="text-xs text-neutral-400">{`· ${patterns.length}`}</span>
                </button>
                {routinesOpen && (
                  <>
                    <ul className="mt-1.5 divide-y divide-neutral-100">
                      {patterns.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/routines/${r.id}`)}
                            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-neutral-50"
                          >
                            <Repeat className="mt-[3px] h-3 w-3 shrink-0 text-neutral-300" />
                            <span className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-700">
                              {r.name}
                              <span className="text-neutral-400"> · {r.cadence}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 px-1.5 text-[11px] leading-snug text-neutral-400">
                      {/* No promise that an occurrence can be ticked: an
                          untimed routine has no occurrence anywhere yet. */}
                      Time already committed. Patterns are changed in Routines.
                    </p>
                  </>
                )}
              </section>
            )}
            {dated.length > 0 && (
              <section aria-label="On the calendar" className="min-w-0 border-t border-neutral-200 pt-2.5">
                <button
                  type="button"
                  onClick={toggleCalendar}
                  aria-expanded={calendarOpen}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  {calendarOpen
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-neutral-400" />}
                  <h2 className="text-xs font-semibold tracking-wide uppercase text-neutral-500">On the calendar</h2>
                  <span className="text-xs text-neutral-400">{`· ${dated.length}`}</span>
                </button>
                {calendarOpen && (
                  <ul className="mt-1.5 divide-y divide-neutral-100">
                    {dated.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/task/${t.id}`)}
                          className="w-full rounded-md px-1.5 py-1 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50"
                        >
                          {formatShortDate(t.scheduledFor!)} · {t.title}
                          {!t.isAllDay && ` · ${t.scheduledFor!.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
      )}
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
