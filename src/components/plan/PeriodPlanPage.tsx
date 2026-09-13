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
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useRoutines } from '@/hooks/useRoutines'
import { routinePatterns } from '@/lib/planning/routinePatterns'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { placementFate, placedWhere } from '@/lib/planning/lineage'
import { parseLocalYmd } from '@/lib/cadence/config'
import { formatShortDate } from '@/lib/dateHelpers'
import {
  periodBounds, isCurrentPeriod, selectPeriodTasks, selectDatedInPeriod, actionsFor, railLevel, lowerLevel, planningPeriod,
  type PlanLevel, type RowAction,
} from '@/lib/planning/periodPage'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { PlanRow, rowIsDone, type PlanRowModel } from './PlanRow'
import { PlanRail } from './PlanRail'
import { readOpen, readFoldPref, writeOpen } from './foldState'

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

/** The first line of a note, as one quiet line of intent. Notes render
 *  markdown: a HEADING is structure rather than intent ("## Why" is a label
 *  for the sentence under it), so headings are skipped and the first real
 *  line wins. Bullet and number markers come off the line they lead.
 *  Anything long is left for the row's own page. */
function firstLine(notes: string | undefined): string | undefined {
  if (!notes) return undefined
  for (const raw of notes.split(/\r?\n/)) {
    const bare = raw.replace(/<[^>]*>/g, '').trim()
    if (!bare || /^#{1,6}\s/.test(bare)) continue
    const line = bare.replace(/^\s*([-*+]|\d+\.)\s*/, '').trim()
    if (line) return line.length > 120 ? `${line.slice(0, 119)}…` : line
  }
  return undefined
}

function taskRow(t: Task, all: readonly Task[]): PlanRowModel {
  return {
    id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFate(t, all), kind: 'task',
    placed: placedWhere(t, all),
    subtitle: t.isGoal ? firstLine(t.notes) : undefined,
  }
}
function goalRow(g: Goal): PlanRowModel {
  return {
    id: g.id, title: g.name, isGoal: true, fate: g.status === 'completed' ? 'done' : 'open', kind: 'goal',
    subtitle: g.strategy?.trim() || firstLine(g.notes),
  }
}

function PeriodPlanPageInner({ level }: { level: PlanLevel }) {
  const navigate = useNavigate()
  const { tasks, loading, toggleTask, deleteTask, updateTask, updateTasksBulk, addTask, setGoal, pushTask, keepForward } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const { activeRoutines } = useRoutines()
  const { goals, areas, addGoal, updateGoal, deleteGoal, addArea } = useGoalsContext()

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
      return goals.filter((g) => g.year === year && matchesLayers(g.context, layers)).map(goalRow)
    }
    const list = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons).map((t) => taskRow(t, tasks))
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
    return planningPeriod({
      level: above, today, seasons,
      countFor: (s) => (above === 'season' ? selectPeriodTasks(layered, 'season', s, isCurrentPeriod(periodBounds('season', s, seasons), today), meId, seasons).length : 0),
    }).start
  }, [above, today, seasons, layered, meId])
  const railRows = useMemo<PlanRowModel[]>(() => {
    if (above === 'season') {
      // The fold can look ahead to a season that ISN'T actually current
      // (near a boundary) — asking the pool question there would pull in
      // every legacy NULL-seasonStart row regardless of which season it
      // opened on (the exact trap periodPlacement.ts warns about).
      const aboveIsCurrent = isCurrentPeriod(periodBounds('season', aboveStart, seasons), today)
      return selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons).map((t) => taskRow(t, tasks))
    }
    if (above === 'year') {
      return goals.filter((g) => g.year === aboveStart.getFullYear() && matchesLayers(g.context, layers)).map(goalRow)
    }
    return []
  }, [above, layered, aboveStart, seasons, today, meId, tasks, goals, layers])
  const railBounds = useMemo(() => (above ? periodBounds(above, aboveStart, seasons) : null), [above, aboveStart, seasons])

  // ── Verbs ────────────────────────────────────────────────────────────────
  const open = useCallback((row: PlanRowModel) => {
    navigate(row.kind === 'goal' ? `/goals/${row.id}` : `/task/${row.id}`)
  }, [navigate])

  const act = useCallback(async (action: RowAction, row: PlanRowModel) => {
    if (row.kind === 'goal') {
      const g = goals.find((x) => x.id === row.id)
      if (!g) return
      if (action === 'complete') await updateGoal(g.id, { status: g.status === 'completed' ? 'active' : 'completed' })
      else if (action === 'drop') await deleteGoal(g.id)
      else if (action === 'keep') {
        const kept = await addGoal(g.areaId, g.name, g.context ?? undefined)
        if (kept) await updateGoal(kept.id, { year: bounds.next.getFullYear() })
      }
      return
    }
    if (action === 'complete') await toggleTask(row.id)
    else if (action === 'drop') await deleteTask(row.id)
    else if (action === 'someday') await gated.updateTask(row.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (action === 'make-goal') await setGoal(row.id, true)
    else if (action === 'make-task') await setGoal(row.id, false)
    else if (action === 'keep') {
      await keepForward(row.id, level === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next })
    }
    // Taking a row down a rung COPIES it (isDescent): the period's list keeps
    // the row, marked with where the work went, so the look-back still sees
    // the whole plan. That is the whole point of the placement model.
    else if (action === 'to-lower') {
      const lower = lowerLevel(level)
      if (lower) await gated.pushTask(row.id, lower)
    }
    else if (action === 'today') {
      await gated.pushTask(row.id, new Date())
    }
  }, [goals, updateGoal, deleteGoal, addGoal, bounds.next, toggleTask, deleteTask, gated, setGoal, keepForward, level])

  // The rail's one verb: copy an open season task down into this month.
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

  // Goals and tasks are different promises and get their own lists — one
  // list with an icon on some rows didn't say which was which.
  const goalRows = useMemo(() => rows.filter((r) => r.isGoal), [rows])
  // Finished work leaves the working list and waits behind a fold. On a PAST
  // period the fold opens by default: a look-back is precisely about what got
  // done (Scott, 2026-09-13).
  const openTaskRows = useMemo(() => rows.filter((r) => !r.isGoal && !rowIsDone(r.fate)), [rows])
  const doneTaskRows = useMemo(() => rows.filter((r) => !r.isGoal && rowIsDone(r.fate)), [rows])
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

  return (
    <div className={`${PAGE_COLUMN_WIDE} py-6`}>
      {/* The same masthead card Today and Week wear: the period in the
          eyebrow, the page name as the title, the look-back cue on the quiet
          line when the period has ended. */}
      <MastheadCard
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

      {/* The plan on the left, what you consult while writing it on the
          right — the calendar included. Reference sits WITH reference instead
          of interrupting the list (Scott, 2026-09-13). One column on a phone. */}
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
                  onClick={() => setAddingGoal((v) => !v)}
                  className="mt-1.5 shrink-0 text-[13px] text-neutral-500 transition-colors hover:text-primary-700"
                >
                  + Add a goal
                </button>
              )}
            </div>
            <div className="mt-2 rounded-xl border border-primary-100 border-l-[3px] border-l-primary-500 bg-primary-50/40 px-3 py-2.5 shadow-sm">
              {goalRows.length === 0 ? (
                <p className="px-2 py-2 text-sm text-neutral-400">
                  {isPast ? `Nothing was on this ${noun}'s goals.` : `No goals for this ${noun} yet.`}
                </p>
              ) : (
                <ul>
                  {goalRows.map((row) => (
                    <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onAction={(a, r) => { void act(a, r) }}
                      lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
                  ))}
                </ul>
              )}
              {!isPast && addingGoal && (
                <form
                  className="mt-1 flex items-center gap-2 px-2"
                  onSubmit={(e) => { e.preventDefault(); const t = goalDraft; setGoalDraft(''); void addRow(t, true) }}
                >
                  <Target className="h-4 w-4 shrink-0 text-amber-600" />
                  <input
                    autoFocus
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
              <div className="mt-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
                {openTaskRows.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-neutral-400">
                    {doneTaskRows.length > 0
                      ? `Everything on this ${noun}'s list is done.`
                      : isPast ? `Nothing was on this ${noun}'s list.` : `Nothing on this ${noun}'s list yet.`}
                  </p>
                ) : (
                  <ul>
                    {visibleTaskRows.map((row) => (
                      <PlanRow key={row.id} row={row} onOpen={open} onOpenPlaced={openPlaced} onAction={(a, r) => { void act(a, r) }}
                        lowerLabel={lowerLabelText}
                        actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast, level })} />
                    ))}
                  </ul>
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
                    <ul className="mt-1 rounded-xl border border-neutral-200 bg-white px-3 py-1 shadow-sm">
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
              <section aria-label={routinesHeading} className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
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
              <section aria-label="On the calendar" className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
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
