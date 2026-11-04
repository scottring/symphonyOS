// src/components/plan/constellation/ConstellationPage.tsx
//
// Year, Season and Month: one page shape for each (mockup approved
// 2026-10-13, after the Week redesign). The period's goals are one plain list,
// drawn one way. The top bar names the horizon (Today · Week · Month · Season
// · Year), so the page carries no horizon tabs of its own.
//
// Paper-style horizons (Scott, 2026-11-04): each page is a sheet, its list
// written in its own words. Lines order by drag, and the order is the
// priority: month and season lines write the task's one sortOrder (the same
// order as Today and the Week), year goals goals.sort_order, each with Undo.
// The list shows whole; done goals fold into one line. At its end, the next
// ruled line ("Write a November goal") writes a plain item of this period.
//
// The level above lies folded at the sheet's left edge (PaperFold), for
// reading only (AboveSheet): Fall beside November, the year beside Fall, last
// year's open goals beside the year. This period's calendar lies folded at
// its right edge (CalendarSheet, Task 5c): November's weeks, Fall's fixed
// dates by month, the year's 12 months. Both open, the page is a planner
// spread: Fall | November | November's calendar. The year's sheet leads with
// its landscape when one is written. Nothing on these pages says what an item
// is for or what is under it, and rows carry no verbs: tapping a month or
// season goal opens its task panel (horizonPanel.tsx), and a year goal opens
// in place with Done, Let go and Edit wording. The routines at the page's
// pace sit on the calendar sheet with their dates (no strip: the spread
// centers on the page). The bar's walk becomes "Plan November" while
// that talk is due (planSchedule.ts), and a pending change card is drawn
// dashed on the list (planPreview.ts).
//
// The header, calm pass (Scott approved the mockup 2026-10-18, as on Week):
// "‹ October 2026 ›", one quiet fact line ("28 of 46 done", a bar, "planned
// Oct 2"), at most one button — only the one that's due (reviewed design,
// 2026-10-20) — and a ⋯ menu (PageMenu) for everything else.
//
// URL: `horizon` (0 Year, 1 Season, 2 Month; 3 hands over to Week), `start`
// (any date in the period) and `focus` (an item a conversation just saved).
// Every manual write goes through the canvas activity, so it reports saving /
// saved / didn't save, with Undo when the previous fields can be restored.
//
// Planning (?plan=1) is a few tooltips on this same page (Scott, 2026-11-04):
// the plan chip in the header ("Plan November") starts the session
// (GuidedPeriod), each step is one tooltip pointing at the real thing on the
// page (GuideCoach), and each step drives this sheet's folds through
// PaperFold's `drive`: the look back turns the sheet above to the period
// before with its choices, the reading steps open the level above, the
// calendar steps this period's calendar, the writing steps the write line.
// Done planning stamps the sheet and the header line says when.
//
// Every step's editor has a permanent, quiet home on this page (Task 2,
// 2026-11-04), where its tooltip points: Month's Fresh start in ⋯ and its
// fun lines on the write line; Season's Energy chip in the header, its ideal
// week and wild cards under the sheet, and Someday on the year's sheet while
// choosing from the year; Year's vision, landscape and life areas under the
// sheet, the overlapping pairs on its list while refining, and the booking in
// the Share and book tooltip. A section's step opens its editor; Edit does too.

import { PageHelpContext, usePageHelp } from '@/components/explain/PageHelp'
import { PageMenu, type PageMenuChoice } from '@/components/plan/PageMenu'
import { usePlanPagePrefs } from '@/hooks/usePlanPagePrefs'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useCanvasActivity, type CanvasProposal } from '@/contexts/CanvasActivityContext'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { periodBounds, selectPeriodTasks, isCurrentPeriod, isUndatedLegacyDone } from '@/lib/planning/periodPage'
import { monthGridWeeks } from '@/lib/planning/monthGrid'
import { talkFor, listIsEmpty, isPutOff, readDismissals } from '@/lib/planning/planSchedule'
import { committedTo } from '@/lib/placement/model'
import { localYmd, parseLocalYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import type { TaskContext } from '@/types/task'
import { useAddArea } from '../v2/AddArea'
import { planNodes, type PlanNode } from './model'
import { planPreview, type PeriodSpan } from './planPreview'
import { isDone, periodRange } from '@/components/canvas/plan/planGroups'
import { PlanItemRow } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { readinessOf, type ReadinessLookup } from '@/lib/prep/readiness'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { describeTriageWhen } from '@/lib/triage/applyWhen'
import { compareSortOrder, nextTaskSortOrder, reorderTasksToIndex, type OrderWrite } from '@/lib/today/taskOrdering'
import { PlanOrderList, type RowOrder } from './PlanOrderList'
import { useLifeAreas } from '@/hooks/useLifeAreas'
import { groupByArea } from '@/lib/guide/byArea'
import { periodMoves } from './horizonPanel'
import { isLetGo } from '@/lib/planning/letGo'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EXPLAIN_MESSAGE } from '@/lib/explain/pageGuides'
import { monthToken, usePlanningSession, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { showToast } from '@/hooks/useToast'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { nextSeasonStart, seasonLabel, seasonToken } from '@/lib/cadence/seasons'
import { REVIEW_WINDOW_DAYS, alsoDoneIn, movedOn, reviewTarget, taskReviewState, weekPhrase, yearGoalReviewState } from '@/lib/planning/periodReview'
import { liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import type { Task } from '@/types/task'
import { placementOf } from '@/lib/planning/placement'
import { useRoutines } from '@/hooks/useRoutines'
import { PaperFold, rememberFolded } from '@/components/plan/fold/PaperFold'
import { AboveSheet, LookSheet } from '@/components/plan/fold/AboveSheet'
import { CalendarSheet, MonthGrid, CalendarRoutines, type CalendarRoutine } from '@/components/plan/fold/CalendarSheet'
import { WriteLine } from '@/components/plan/fold/WriteLine'
import type { HorizonLanding, HorizonParse } from '@/lib/planning/horizonInput'
import { GuidedPeriod, type PeriodSessionTools, type SessionFold } from '@/components/plan/guided/GuidedPeriod'
import { PlanChip, PlannedStamp, type CoachAsk } from '@/components/guide/GuideCoach'
import { ENERGY_CHOICES, isEnergyLevel, withEnergy, type EnergyNote } from '@/lib/guide/energy'
import { PageSection } from '@/components/plan/fold/PageSection'
import { WILD_CARDS } from '@/lib/guide/wildCards'
import { PeriodSummaryLine } from '@/components/guide/PeriodSummaryLine'
import { FreshStart } from '@/components/plan/guided/month/FreshStart'
import { PeriodLookBack } from '@/components/plan/guided/month/PeriodLookBack'
import { NextWeeks } from '@/components/plan/guided/month/NextWeeks'
import { MonthsCalendar, SeasonCalendar } from '@/components/plan/guided/season/SeasonCalendar'
import { SeasonIdealWeek, SeasonWildCards } from '@/components/plan/guided/season/SeasonNotes'
import { IdealWeekSection } from '@/components/guide/IdealWeekSection'
import { YearVisionSection, hasVision } from '@/components/guide/YearVisionSection'
import { YearLandscapeSection, hasLandscape } from '@/components/guide/YearLandscapeSection'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { YearVision } from '@/components/plan/guided/year/Vision'
import { YearLandscape } from '@/components/plan/guided/year/Landscape'
import { YearRefine } from '@/components/plan/guided/year/Refine'
import { AreasEditor } from '@/components/guide/AreasEditor'
import type { ReviewNotes } from '@/hooks/usePeriodReview'

const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const SESSION_HORIZONS: readonly SessionHorizon[] = ['annual', 'seasonal', 'monthly']
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
/** "an October goal", "a Fall goal": the write line's "Write a November goal". */
const aOrAn = (word: string) => /^[aeiou8]/i.test(word) ? 'an' : 'a'

/** A year goal's wording, edited in place. */
type Composer = { kind: 'edit'; key: string }


function Inner() {
  const selection = useSelectionOptional()
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, deleteGoal } = useGoalsContext()
  // `tasks` is what the page draws, so its own `updateTaskOrders` (optimistic)
  // moves a dropped line at once — never another hook instance's.
  const { tasks, loading, error, addTask, updateTask, refetch, deleteTask, toggleTask, keepForward, dropCommitment, updateTaskOrders } = useSupabaseTasks()
  const activity = useCanvasActivity()
  const updateGoalRef = useRef(updateGoal)
  useEffect(() => { updateGoalRef.current = updateGoal }, [updateGoal])
  const { openAssistant } = useAssistantLauncher()
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember } = useFamilyMembers(), { seasons } = useHouseholdSeasons()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const area = useAddArea()
  const { areas: lifeAreas, add: addArea, rename: renameArea, setContext: setAreaContext, remove: removeArea } = useLifeAreas()
  const { getRoutinesForDate } = useRoutines()
  // The shell's "How this page works", or the page's own ask where it offers none.
  const shellHelp = usePageHelp()

  // ---- Where we are -------------------------------------------------------
  const raw = params.get('start')
  const parsed = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalYmd(raw) : new Date()
  const anchor = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const horizonParam = params.get('horizon')
  const requested = horizonParam !== null && /^[0-3]$/.test(horizonParam) ? Number(horizonParam) : null
  const level = requested !== null && requested < 3 ? requested : (ROUTE_LEVEL[pathname] ?? 2)
  const weekStartsOn = readCadenceConfig().weekStartsOn
  const yearB = periodBounds('year', anchor, seasons), seasonB = periodBounds('season', anchor, seasons), monthB = periodBounds('month', anchor, seasons)
  const bounds = [yearB, seasonB, monthB][level]
  const now = new Date()
  // The week a Month page looks down into: this week while the month is
  // current, whatever day `start` names (it was the week of Oct 1 when the
  // URL said start=2026-10-01); another month's first week.
  const week = weekStartAnchor(isCurrentPeriod(monthB, now) ? now : monthB.start, weekStartsOn)
  const thisWeek = localYmd(week) === localYmd(weekStartAnchor(now, weekStartsOn))
  const periodTitle = bounds.label
  const current = isCurrentPeriod(bounds, now)
  // The year a page reads its year goals from. A season reads the year its
  // own name carries ("Winter 2026", seasonLabel: the year it starts in), so
  // Winter from Dec 1 and from Jan 15 read the same goals (walk 2026-11-02:
  // which year depended on the way in).
  const year = level === 1 ? seasonB.start.getFullYear() : anchor.getFullYear()
  const periodWord = level === 0 ? String(year) : periodWordOf(bounds)
  const seasonWord = periodWordOf(seasonB), monthWord = periodWordOf(monthB)
  // The review by hand of the period on screen (PeriodReview): open with ?review=1.
  const reviewing = params.get('review') === '1'
  // Planning (Choose from the level above, spec 2026-10-19): open with ?plan=1,
  // on a period not yet over.
  // A period already over is reviewed, not planned.
  const plannable = bounds.end > now
  const planning = !reviewing && params.get('plan') === '1' && plannable
  const sessionToken = level === 0 ? yearToken(year) : level === 1 ? seasonToken(bounds.start, seasons) : monthToken(bounds.start)
  const review = usePeriodReview(SESSION_HORIZONS[level], sessionToken)
  // Under way, the review on offer is the period before's, until it is done
  // (Scott, 2026-10-17); its own opens in its last days (reviewTarget).
  const prevToken = level === 0 ? yearToken(year - 1) : level === 1 ? seasonToken(bounds.prev, seasons) : monthToken(bounds.prev)
  const prevReview = usePeriodReview(SESSION_HORIZONS[level], prevToken)
  const target = reviewTarget(bounds, now, REVIEW_WINDOW_DAYS[PERIODS[level]])
  // "I'm happy with October" (Scott, 2026-10-17): planned is a thing you
  // say, as on Week — not a list that merely has lines. Home's checklist
  // reads it. The plan flow (Choose) says it; the header shows when.
  const planSession = usePlanningSession(SESSION_HORIZONS[level], sessionToken)
  // The next period's record: "Plan {next}" is offered only while it is unplanned.
  const nextToken = level === 0 ? yearToken(year + 1) : level === 1 ? seasonToken(bounds.next, seasons) : monthToken(bounds.next)
  const nextPlanSession = usePlanningSession(SESSION_HORIZONS[level], nextToken)
  // The season's notes, for its everyday page (the ideal week, the energy on
  // the summary line). The summary line stays through a session (fix round
  // 1), so these are read then too; a session writes through its own copy,
  // and marking planned or leaving reads them afresh.
  const seasonNotes = usePlanningNotes('seasonal', level === 1 ? sessionToken : '')
  // The period's own planning notes (the summary line's planned day).
  const periodNotes = usePlanningNotes(SESSION_HORIZONS[level], sessionToken)
  // The year's notes, for its everyday page (the vision, the landscape and
  // the refine step's kept pairs), read the same way.
  const yearNotes = usePlanningNotes('annual', level === 0 ? sessionToken : '')
  const markPlanned = async (): Promise<boolean> => {
    const mine = planSession.mine
    const ok = await planSession.save({ wentWell: mine?.wentWell ?? '', didnt: mine?.didnt ?? '', ...(mine?.focus ? { focus: mine.focus } : {}) })
    if (!ok) showToast('Couldn’t save that — try again.', 'error', 5000)
    return ok
  }

  // ---- What is planned (already filtered for privacy, area and people) ----
  const meId = getCurrentUserMember()?.id ?? null
  const lens = planPeopleLens(people, meId)
  const visible = filterTasksForLayers(tasks, layers).filter(lens.keep)
  const goalsOf = (y: number) => goals.filter((g) => g.year === y && g.status !== 'archived' && matchesLayers(g.context, layers) && lens.keep(g))
  const allNodes = planNodes(goalsOf(year), [
    selectPeriodTasks(visible, 'season', seasonB.start, isCurrentPeriod(seasonB, now), lens.scopeId, seasons),
    selectPeriodTasks(visible, 'month', monthB.start, isCurrentPeriod(monthB, now), lens.scopeId, seasons),
    visible.filter((t) => !isUndatedLegacyDone(t) && committedTo(t, 'week', week, { isCurrent: thisWeek }) !== undefined),
  ])

  // Show done and the level above: this viewer's choices, shared with the
  // ⋯ menu and remembered on this device (usePlanPagePrefs).
  const prefs = usePlanPagePrefs()
  const showDone = prefs.done
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  // Month's Fresh start, opened from ⋯.
  const [freshOpen, setFreshOpen] = useState(false)
  // The life area a session's writing step writes in (by area, brain dump).
  const [writeAreaId, setWriteAreaId] = useState<string | null>(null)
  // Marked planned in this sitting (the period's key): the way on is the next
  // horizon down.
  const [markedKey, setMarkedKey] = useState<string | null>(null)
  // When Done planning stamped it, for the stamp's date.
  const [justMarkedAt, setJustMarkedAt] = useState(() => new Date())
  const mainRef = useRef<HTMLElement>(null)
  // A goal just added, to bring into view once it arrives.
  const reveal = useRef<string | null>(null)

  const focus = params.get('focus')
  const savedKey = focus && allNodes.some((n) => n.key === focus && n.level === level) ? focus : null

  const setStart = (d: Date | null) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (d) p.set('start', localYmd(d)); else p.delete('start')
    p.delete('focus')
    return p
  })

  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('symphony-plan-updated', refresh)
    return () => window.removeEventListener('symphony-plan-updated', refresh)
  }, [refetch])

  // A conversation's saved item: bring it into view.
  const dataReady = !loading && !goalsLoading
  useEffect(() => {
    if (!savedKey || !dataReady) return
    mainRef.current?.querySelector(`[data-plan-key="${savedKey}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [savedKey, dataReady])

  useEffect(() => {
    if (!reveal.current) return
    const row = mainRef.current?.querySelector(`.plan-goal-list [data-plan-key="${reveal.current}"]`)
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    reveal.current = null
  }, [tasks, goals, composer])

  // A line moved on to a later period stays on this list as the record, but
  // it is not open here: "Moved to November", no verbs, folded with the done.
  const LEVEL_BOUNDS = [yearB, seasonB, monthB]
  // A line of another period's list (the look back's) is read against that
  // period's bounds (`b`).
  const movedLabel = (node: PlanNode, b: ReturnType<typeof periodBounds> = LEVEL_BOUNDS[node.level]): string | null => {
    if (node.goal) return goals.some((g) => g.year === node.goal!.year + 1 && g.carriedFrom === node.id && g.status !== 'archived') ? `Moved to ${node.goal.year + 1}` : null
    if (!node.task || node.level === 0 || node.level > 2) return null
    const lvl = PERIODS[node.level] as 'season' | 'month'
    const moved = movedOn(node.task, lvl, b.start, { isCurrent: isCurrentPeriod(b, now), seasons })
    if (!moved) return null
    return `Moved to ${periodWordOf(periodBounds(lvl, moved.to ?? b.next, seasons))}`
  }
  const isOpen = (n: PlanNode) => !isDone(n) && !movedLabel(n)

  // Writes saved on the page itself that place a line on this period (a new
  // line, one put under a goal above): a running session hears of them, as
  // the Week's canvas writes are heard.
  const pageWriteListeners = useRef(new Set<() => void>())
  const listenPageWrites = useCallback((listener: () => void) => {
    pageWriteListeners.current.add(listener)
    return () => { pageWriteListeners.current.delete(listener) }
  }, [])
  const pageWrote = () => { for (const l of [...pageWriteListeners.current]) l() }

  // ---- Writes ---------------------------------------------------------------
  type Opts = { ids?: string[]; undo?: () => Promise<boolean | void>; retry?: () => void; failureState?: 'failed' | 'partial'; failureSummary?: string }
  const act = (label: string, command: () => Promise<unknown>, opts?: Opts) =>
    activity.run(label, async () => {
      const result = await command()
      if (result === false) return false
      void refetch()
      return true
    }, opts)

  // The space a new line is written in: the one chosen at the end of the
  // write line, or, with a life area picked (a session's by-area step), that
  // area's own space (a legacy area with none is Personal).
  type WriteArea = { id: string; context: TaskContext | null }
  const contextFor = (lifeArea?: WriteArea | null): TaskContext | undefined =>
    lifeArea ? lifeArea.context ?? 'personal' : area.area ?? undefined

  // A goal new to a year goes last there: above that year's highest order, so a
  // list already ordered by drag doesn't take it in second.
  const lastInYear = (y: number) => nextTaskSortOrder(goals.filter((g) => g.year === y))

  /** The one create path: a plain item of the period (paper-style horizons,
   *  2026-11-04: in its own words, tied to nothing), in a life area when one
   *  is picked. */
  const createItem = async (lvl: number, title: string, id: string, context: TaskContext | undefined, extra?: { isFun?: boolean; areaId?: string }): Promise<boolean> => {
    if (lvl === 0) return !!await addGoal(extra?.areaId ?? null, title, context, { year, id, sortOrder: lastInYear(year) })
    return !!await addTask(title, undefined, undefined, undefined, {
      id, ...extra,
      bucket: lvl === 1 ? 'quarter' : lvl === 2 ? 'month' : 'week',
      ...(lvl === 1 ? { seasonStart: seasonB.start } : lvl === 2 ? { monthStart: monthB.start } : { weekStart: week }),
      context,
    })
  }
  const runCreate = (lvl: number, title: string, label: string, id: string = crypto.randomUUID(), extra?: { isFun?: boolean; lifeArea?: WriteArea | null }): Promise<boolean> => {
    const context = contextFor(extra?.lifeArea)
    const fields = { ...(extra?.isFun ? { isFun: true } : {}), ...(extra?.lifeArea ? { areaId: extra.lifeArea.id } : {}) }
    const attempt = (): Promise<boolean> => act(label, () => createItem(lvl, title, id, context, fields), {
      ids: [id],
      undo: async () => { if (lvl === 0) await deleteGoal(id); else await deleteTask(id) },
      retry: () => { void attempt() },
    }).then((ok) => {
      // A new line on this period is a placement a running session counts.
      if (ok && lvl === level) pageWrote()
      return ok
    })
    return attempt()
  }

  const rename = (node: PlanNode, title: string): Promise<boolean> => {
    const before = node.title
    if (title === before) return Promise.resolve(true)
    const write = (t: string) => node.goal ? updateGoal(node.id, { name: t }) : updateTask(node.id, { title: t })
    return act(`Rename “${before}” to “${title}”`, () => write(title), { ids: [node.id], undo: async () => (await write(before)) !== false })
  }

  // A guide's suggestion kept on the page is a plain item of this period
  // (paper-style horizons, 2026-11-04): no parent, so no goalId or sourceId.
  const keepProposal = async (p: CanvasProposal) => {
    activity.setProposalState(p.key, 'saving')
    const ok = await runCreate(level, p.title, `Keep “${p.title}”`)
    if (ok) activity.removeProposal(p.key)
    else activity.setProposalState(p.key, 'failed')
  }

  // A year goal is a goals row: it opens in place with its own few verbs.
  const setGoalStatus = (node: PlanNode, next: 'active' | 'completed' | 'archived', what: string): Promise<boolean> => {
    const status = node.goal?.status ?? 'active'
    return act(what, () => updateGoal(node.id, { status: next }), { ids: [node.id], undo: async () => (await updateGoal(node.id, { status })) !== false })
  }
  // A year goal carried on is a copy in next year that remembers it (the
  // change card's plan_carry); the original stays as this year's record.
  const carryGoal = (node: PlanNode, to: number = year + 1, label = `Move “${node.title}” to ${to}`): Promise<boolean> => {
    const g = node.goal!
    const id = crypto.randomUUID()
    return act(label, () => addGoal(g.areaId || null, g.name, g.context ?? undefined, {
      id, year: to, carriedFrom: g.id, notes: g.notes ?? null, strategy: g.strategy ?? null, sortOrder: lastInYear(to),
      ...(g.assignedToAll ? { assignedToAll: g.assignedToAll } : {}),
    }).then((made) => !!made), { ids: [id], undo: async () => { await deleteGoal(id) } })
  }

  // ---- Proposals for this horizon -----------------------------------------
  const inPeriod = (ymd?: string) => {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return true
    const d = parseLocalYmd(ymd)
    return d >= bounds.start && d < bounds.end
  }
  // A suggestion that only links an existing item under one above is a tie,
  // so these pages don't show it (paper-style horizons, 2026-11-04).
  const proposals = activity.proposals.filter((p) => p.level === level && !p.itemId && inPeriod(p.periodStart))
  const keepAll = async () => { for (const p of proposals.filter((x) => x.state !== 'saving')) await keepProposal(p) }

  // On schedule (planSchedule.ts): while this horizon's talk is due — its
  // window is open, the coming list is empty, it isn't put off — the bar
  // offers that talk ("Plan November"), on this period's page or the coming
  // one's. Otherwise nothing: planning is the guided session (the Plan
  // button), which replaced the "Plan this season with me" walk.
  const talk = talkFor(PERIODS[level], now, seasons)
  const talkDue = !!talk && dataReady && (current || localYmd(bounds.start) === localYmd(talk.start))
    && listIsEmpty(talk, { tasks, goals, meId, seasons, today: now }) && !isPutOff(talk, now, readDismissals())
  const dueTalk = talk && talkDue && !planning && requested !== 3 ? talk : null
  // The talk rides in the docked bar where there is one (desktop).
  const walkInBar = useConversationWalk(dueTalk ? { label: dueTalk.label, message: dueTalk.message } : null)

  // The routines at this page's pace, each with the days it falls on in the
  // period: monthly on Month, quarterly on Season, yearly on Year. They sit
  // on the calendar sheet (CalendarRoutines; spec 2026-11-04: routines are
  // dated commitments), where the Routines strip used to float.
  const periodStartMs = bounds.start.getTime(), periodEndMs = bounds.end.getTime()
  const periodRoutines = useMemo<CalendarRoutine[]>(() => {
    const want = level === 2 ? 'monthly' : level === 1 ? 'quarterly' : 'yearly'
    const found = new Map<string, { title: string; dates: Date[] }>()
    const start = new Date(periodStartMs)
    for (let d = start; d.getTime() < periodEndMs; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      for (const r of getRoutinesForDate(d)) {
        if (r.recurrence_pattern?.type !== want || !matchesLayers(r.context ?? null, layers)) continue
        const f = found.get(r.id) ?? { title: r.name, dates: [] }
        f.dates.push(d); found.set(r.id, f)
      }
    }
    return [...found].sort((a, b) => a[1].dates[0].getTime() - b[1].dates[0].getTime())
      .map(([id, f]) => ({ id, title: f.title, dates: f.dates }))
  }, [level, periodStartMs, periodEndMs, getRoutinesForDate, layers])

  if (requested === 3) return <Navigate replace to={`/week?view=alongside&date=${localYmd(anchor)}&start=${localYmd(weekStartAnchor(anchor, weekStartsOn))}`} />

  // Readiness reads only rows this reader already has, under the same filters.
  const visibleById = new Map(visible.map((t) => [t.id, t]))
  const goalsById = new Map(allNodes.filter((n) => n.goal).map((n) => [n.id, n.goal!]))
  const prepLookup: ReadinessLookup = { task: (id) => visibleById.get(id), goal: (id) => goalsById.get(id) }

  // ---- The order: by drag, nulls last, then as they came --------------------
  // A month or season line orders by its task's sortOrder, a year goal by
  // goals.sort_order; a never-ordered line keeps the list's own order after.
  const orderOf = (n: PlanNode) => n.goal ? n.goal.sortOrder : n.task?.sortOrder
  const inOrder = (nodes: PlanNode[]) => [...nodes].sort((a, b) => compareSortOrder(orderOf(a), orderOf(b)))

  // ---- The level above (folded beside the sheet; planning reads it too) -----
  const above = level > 0 ? inOrder(allNodes.filter((n) => n.level === level - 1 && isOpen(n))) : []

  // ---- The period's goals: open first, done folded into one line -----------
  // With life areas, the lines gather under their area's name ("No area" last).
  // A year goal's areaId is '' when it has none; areas the viewer cannot see
  // are not in lifeAreas, so their lines fall under "No area".
  const nodeArea = (n: PlanNode) => n.goal ? n.goal.areaId : n.task?.areaId
  const areaNameOf = new Map(lifeAreas.map((a) => [a.id, a.name]))
  // One list drawn one way: this period's, and the look back's (the period before).
  // A period's done is what was done in it: a line finished before the period
  // began (it only carries a later commitment) is "done earlier", and a line
  // let go never counts. The header's count and the fold read the same lists.
  const shapeList = (all: PlanNode[], movedOf: (n: PlanNode) => string | null, b: { start: Date }) => {
    // Let go is off the list; so is an undated legacy completion (no
    // completed_at, day, stamp or commitment: its time is unknown).
    const nodes = all.filter((n) => !n.task?.dismissedAt && !(n.task && isUndatedLegacyDone(n.task)))
    const earlier = (n: PlanNode) => isDone(n) && !!n.task?.completedAt && n.task.completedAt < b.start
    const open = (n: PlanNode) => !isDone(n) && !movedOf(n)
    const openNodes = inOrder(nodes.filter(open))
    const doneNodes = nodes.filter((n) => isDone(n) && !earlier(n))
    const earlierNodes = nodes.filter(earlier)
    const movedNodes = nodes.filter((n) => !isDone(n) && !!movedOf(n))
    const listed = showDone ? [...openNodes, ...movedNodes, ...doneNodes, ...earlierNodes] : openNodes
    const areaGroups = lifeAreas.length ? groupByArea(listed.map((n) => ({ n, areaId: nodeArea(n) })), lifeAreas) : null
    const items = areaGroups ? areaGroups.flatMap((g) => g.items.map((x) => x.n)) : listed
    // Grouped by area id (two areas may share a name); an area the viewer cannot see is '' (No area).
    const groupOf = areaGroups ? (n: PlanNode) => { const id = nodeArea(n) ?? ''; return areaNameOf.has(id) ? id : '' } : undefined
    // "No area" alone says nothing: no heading unless an area is in play.
    const onlyNoArea = !!areaGroups && areaGroups.every((g) => g.area === null)
    const headingOf = groupOf && !onlyNoArea ? (n: PlanNode) => areaNameOf.get(groupOf(n)) ?? 'No area' : undefined
    // "5 done, 1 moved on · Taxes, Picnic…": what is no longer open, in one line.
    const folded = [...doneNodes, ...movedNodes, ...earlierNodes]
    const doneLine = `${[doneNodes.length ? `${doneNodes.length} done` : '', earlierNodes.length ? `${earlierNodes.length} done earlier` : '', movedNodes.length ? `${movedNodes.length} moved on` : ''].filter(Boolean).join(', ')} · ${folded.slice(0, 2).map((n) => n.title).join(', ')}${folded.length > 2 ? '…' : ''}`
    return { openNodes, doneNodes, movedNodes, earlierNodes, items, groupOf, headingOf, folded, doneLine }
  }
  const levelNodes = allNodes.filter((n) => n.level === level)
  const { openNodes, doneNodes, items, groupOf, headingOf, folded, doneLine } = shapeList(levelNodes, (n) => movedLabel(n), bounds)

  // ---- A pending change card, drawn dashed (planPreview.ts) -----------------
  const span = (b: { start: Date; end: Date; label: string }): PeriodSpan => ({ start: localYmd(b.start), end: localYmd(b.end), label: periodWordOf(b) })
  const nextB = periodBounds(PERIODS[level], bounds.next, seasons)
  const nextWord = periodWordOf(nextB)
  const preview = planPreview({ set: activity.changeSet ?? null, level: PERIODS[level], shown: span(bounds), next: span(nextB), ids: new Set(levelNodes.map((n) => n.id)) })
  // The coming list, beside this one, while the card adds to it.
  const nextTitles = preview.next.length === 0 ? [] : level === 0
    ? goalsOf(year + 1).map((g) => g.name)
    : selectPeriodTasks(visible, PERIODS[level] as 'season' | 'month', nextB.start, isCurrentPeriod(nextB, now), lens.scopeId, seasons).map((t) => t.title)
  const previewRow = (r: { key: string; title: string; note: string }) =>
    <li key={`preview:${r.key}`} className="plan-item plan-preview-row is-preview is-proposed">
      <div className="canvas-item"><span className="canvas-item-title plan-item-title">{r.title}</span></div>
      <span className="wc-proposed-note plan-preview-note">{r.note}</span>
    </li>


  // ---- The review by hand (Scott, 2026-10-17) ---------------------------------
  const setMode = (mode: 'review' | 'plan' | null, start?: Date) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.delete('review'); p.delete('plan'); p.delete('step')
    if (mode) p.set(mode, '1')
    if (start) p.set('start', localYmd(start))
    p.delete('focus')
    return p
  })
  const setReviewing = (on: boolean, start?: Date) => setMode(on ? 'review' : null, start)

  // ---- Drag to order (calm pass, 2026-10-18) ---------------------------------
  // The gap a line was dropped in, as Week's day order does: usually one
  // write; Undo writes back every order it changed.
  // Year goals write one at a time, quietly (a refusal never reads as the
  // page failing to load); one refused rolls back those already written and
  // says so, as the task path does, so a renumber is never left half-done.
  // The latest writer, so an Undo pressed later rolls back to the goals as
  // they are then, not as they were at the drop.
  const writeGoalOrders = async (writes: readonly { id: string; sortOrder: number }[], was: ReadonlyMap<string, number | null>): Promise<boolean> => {
    const write = (id: string, sortOrder: number) => updateGoalRef.current(id, { sortOrder }, { quiet: true })
    const written: string[] = []
    for (const w of writes) {
      if ((await write(w.id, w.sortOrder)) === false) {
        for (const id of written.reverse()) await write(id, was.get(id) ?? 0)
        showToast('Couldn’t save the new order', 'warning')
        return false
      }
      written.push(w.id)
    }
    return true
  }
  const reorderLine = (id: string, orderedIds: string[], toIndex: number) => {
    const node = openNodes.find((n) => n.id === id)
    if (!node) return
    const was = new Map(openNodes.map((n) => [n.id, orderOf(n) ?? null]))
    const writes: OrderWrite[] = reorderTasksToIndex(orderedIds, id, toIndex, was)
    if (writes.length === 0) return
    const up = toIndex < orderedIds.indexOf(id)
    const label = `Move “${node.title}” ${up ? 'up' : 'down'}`
    const opts = { ids: writes.map((w) => w.id) }
    if (node.goal) {
      const before = writes.map((w) => ({ id: w.id, sortOrder: was.get(w.id) ?? 0 }))
      const after = new Map(writes.map((w) => [w.id, w.sortOrder]))
      void activity.run(label, () => writeGoalOrders(writes, was), { ...opts, undo: async () => writeGoalOrders(before, after) })
    } else {
      const before = writes.map((w) => ({ id: w.id, sortOrder: was.get(w.id) ?? null }))
      void activity.run(label, () => updateTaskOrders(writes), { ...opts, undo: async () => updateTaskOrders(before) })
    }
  }

  const renderItem = (node: PlanNode, order?: RowOrder) => {
    const scheduled = node.task?.scheduledFor
    const editing = composer?.kind === 'edit' && composer.key === node.key
    const status = node.goal?.status ?? 'active'
    // A year goal opens in place with Done (or Reopen), Let go and its wording.
    const more = node.goal ? [
      status === 'completed'
        ? { label: 'Reopen', onSelect: () => setGoalStatus(node, 'active', `Reopen “${node.title}”`) }
        : { label: 'Done', onSelect: () => setGoalStatus(node, 'completed', `Complete “${node.title}”`) },
      { label: 'Let go', onSelect: () => setGoalStatus(node, 'archived', `Let go of “${node.title}”`) },
      { label: 'Edit wording', onSelect: () => setComposer({ kind: 'edit', key: node.key }) },
    ] : undefined
    // A month or season goal is a task: its panel holds every verb.
    const onOpen = node.goal
      ? () => setExpanded((k) => k === node.key ? null : node.key)
      : () => selection?.setSelection({ kind: 'task', id: node.id })
    return <PlanItemRow key={node.key} node={node}
      done={isDone(node)} movedTo={movedLabel(node) ?? undefined} saved={savedKey === node.key}
      onOpen={onOpen} expanded={expanded === node.key} more={more}
      editing={editing}
      onSaveEdit={async (text) => { const ok = await rename(node, text); if (ok) setComposer(null); return ok }}
      onCancelEdit={() => setComposer(null)}
      preview={preview.marks.get(node.id)}
      readiness={node.task ? readinessOf(node.task, prepLookup) : undefined}
      meta={scheduled ? `Scheduled ${scheduled.toLocaleDateString()}${!node.task?.isAllDay ? ` · ${scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : null}
      {...order} />
  }

  // ---- Writing a goal: the next ruled line, a plain item of this period ------
  // (paper-style horizons, 2026-11-04): no parent, no "For", in the space
  // chosen at the end of the line. A date in the words puts it on that day
  // (where the week and the day hold it), as the old add box did; writing
  // straight to a day moves nothing between lists.
  const writeLabel = `Write ${aOrAn(periodWord)} ${periodWord} goal`
  const addHere = async (text: string, lifeArea?: WriteArea | null, isFun?: boolean) => {
    const id = crypto.randomUUID()
    const ok = await runCreate(level, text, isFun ? `Add “${text}” for fun` : `Add “${text}”`, id, { lifeArea, isFun })
    if (ok) reveal.current = `${level}:${id}`
    return ok
  }
  // In a session's writing step (by area, brain dump) the line is written in
  // the life area picked beside it (`lifeArea`). A dated line goes to its
  // day, which is a placement the session counts too.
  // Month's Maintenance and fun: the line written then is marked fun.
  const writeLineIn = (lifeArea: WriteArea | null, isFun = false) => async (parse: HorizonParse, landing: HorizonLanding): Promise<boolean> => {
    if (landing.kind === 'period') return addHere(parse.title, lifeArea, isFun)
    const id = crypto.randomUUID()
    const d = landing.date
    const at = parse.hasTime && parse.date ? parse.date : new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const people = parse.people
    const ok = await act(`Add “${parse.title}” to ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      async () => !!(await addTask(parse.title, parse.quick.contactId, parse.quick.projectId, at, {
        id, isAllDay: !parse.hasTime, assignedTo: people[0] ?? meId ?? undefined, assignedToAll: people.length > 1 ? people : undefined,
        location: parse.location, context: parse.quick.context ?? contextFor(lifeArea), ...(lifeArea ? { areaId: lifeArea.id } : {}), ...(isFun ? { isFun: true } : {}),
      })), { ids: [id], undo: async () => { await deleteTask(id) } })
    if (ok) pageWrote()
    return ok
  }

  // One onward step: the next horizon down, for the period on screen.
  const keepStart = current ? '' : `&start=${localYmd(anchor)}`
  const onward = level === 2
    ? { to: `/week?view=alongside&date=${localYmd(thisWeek ? now : week)}`, label: thisWeek ? 'Go to this week →' : 'Go to that week →' }
    : level === 1
      ? { to: `/month?view=constellation&horizon=2${keepStart}`, label: `Go to ${monthWord} →` }
      : { to: `/season?view=constellation&horizon=1${keepStart}`, label: `Go to ${seasonWord} →` }

  // ---- What the period before left open (the review's verbs, aimed forward) ----
  // The talk's steps without the talk: what the period before left open, what
  // this one does for each goal above, anything else — then "I'm happy with".
  const prevB = periodBounds(PERIODS[level], bounds.prev, seasons)
  const prevWord = level === 0 ? String(year - 1) : periodWordOf(prevB)
  const thisYearGoals = level === 0 ? goals.filter((g) => g.year === year) : []
  // ---- The sheet above, folded beside this one (paper-style, 2026-11-04) -----
  // For reading: its open lines by title, how many are done, and the foot
  // line. Month reads its season, Season the year, Year last year's open goals
  // (carrying one in is the Year session's Look back).
  const lastYear = level === 0 ? goalsOf(year - 1) : []
  const lastYearOpen = lastYear.filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open')
  const aboveSheet = level === 0
    ? {
      kicker: 'Last year', title: String(year - 1),
      rows: lastYearOpen.map((g) => ({ id: g.id, title: g.name })),
      doneCount: lastYear.filter((g) => yearGoalReviewState(g, thisYearGoals) === 'done').length,
      empty: `Nothing left open from ${year - 1}.`,
    }
    : {
      kicker: level === 2 ? `Season · ${periodRange(seasonB.start, seasonB.end)}` : 'Year',
      title: level === 2 ? seasonB.label : String(year),
      rows: above.map((n) => ({ id: n.id, title: n.title })),
      doneCount: allNodes.filter((n) => n.level === level - 1 && isDone(n)).length,
      empty: level === 2 ? `No ${seasonWord} goals yet.` : `No ${year} goals yet.`,
    }
  // Planned, the next horizon down is next: Year → Season → Month → Week.
  // This month's next week is this one; a coming month's, its first.
  const planWeek = weekStartAnchor(current ? now : bounds.start, weekStartsOn)
  const planNext = level === 2
    ? { label: `Plan ${weekPhrase(planWeek)} →`, onClick: () => navigate(`/week?view=alongside&date=${localYmd(planWeek)}&start=${localYmd(planWeek)}&plan=1`) }
    : level === 1
      ? { label: `Plan ${monthWord} →`, onClick: () => navigate(`/month?view=constellation&horizon=2${keepStart}&plan=1`) }
      : { label: `Plan ${seasonWord} →`, onClick: () => navigate(`/season?view=constellation&horizon=1${keepStart}&plan=1`) }
  // Looking back (the period before's review, now the session's look back):
  // its count, what was said, and the save.
  const periodKey = `${level}:${localYmd(bounds.start)}`
  const justMarked = markedKey === periodKey
  // Everything that was on the period before (done, moved on or open), for "8 of 12 done".
  const prevGoals = planning && level === 0 ? goalsOf(year - 1) : []
  const prevTasks = planning && level > 0
    ? selectPeriodTasks(visible, PERIODS[level] as 'season' | 'month', prevB.start, isCurrentPeriod(prevB, now), lens.scopeId, seasons)
    : []
  const prevAll = prevGoals.length + prevTasks.length
  const prevListed = new Set(prevTasks.map((t) => t.id))
  const prevAlso = planning && level > 0 ? alsoDoneIn(visible, prevB.start, prevB.end, (t) => prevListed.has(t.id)) : []
  const prevDone = prevGoals.filter((g) => g.status === 'completed').length
    + prevTasks.filter((t) => taskReviewState(t, PERIODS[level] as 'season' | 'month', prevB.start, { isCurrent: isCurrentPeriod(prevB, now), seasons }) === 'done').length

  // ---- The guided session (spec 2026-11-01) ------------------------------------
  // The look back's open lines, each with the same four calls on every level
  // (Scott, 2026-11-04): Done · To {this period} · Someday (not now) · Let go
  // (not ever). Month and Season: To and Someday act on the period before's
  // commitment only, Let go takes the item off every list (periodMoves). Year:
  // To 2027 is a copy in that year that remembers it, Someday puts its words
  // on Someday, Let go archives it. Nothing goes back up to the level above.
  const toggleOf = (t: Task) => async () => (await toggleTask(t.id)) !== false
  // A year goal to Someday: goals have no Someday of their own, so its words
  // go on the Someday list (a task, with its space, area and notes; a task
  // has no strategy, which stays on the archived goal) and the goal is put
  // away (archived, never deleted). Undo takes both back, and says so when
  // the Someday line would not go; a goal that could not be put away takes
  // its Someday line back too, and the receipt says when that line stayed
  // (the options are read once the command has run).
  const goalToSomeday = (node: PlanNode): Promise<boolean> => {
    const g = node.goal!
    const id = crypto.randomUUID()
    const status = g.status
    const opts: Opts = { ids: [id, g.id], undo: async () => (await deleteTask(id)) && (await updateGoal(g.id, { status })) !== false }
    return act(`${describeTriageWhen('someday')}: “${g.name}”`, async () => {
      if (!(await addTask(g.name, undefined, undefined, undefined, { id, bucket: 'someday', context: g.context ?? null, ...(g.areaId ? { areaId: g.areaId } : {}), ...(g.notes ? { notes: g.notes } : {}) }))) return false
      if ((await updateGoal(g.id, { status: 'archived' })) === false) {
        if (!(await deleteTask(id))) Object.assign(opts, { failureState: 'partial', failureSummary: `Didn’t put “${g.name}” away. Its line is still on Someday.` })
        return false
      }
      return true
    }, opts)
  }
  // Book the first season session: a personal, all-day "Plan {Season}" on
  // the day picked, for the next season to start.
  const nextSeasonWord = periodWordOf({ label: seasonLabel(nextSeasonStart(now, seasons), seasons) })
  const bookSeason = (day: Date): Promise<boolean> => {
    const id = crypto.randomUUID(), title = `Plan ${nextSeasonWord}`
    return act(`Add “${title}” to ${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      async () => !!(await addTask(title, undefined, undefined, day, { id, isAllDay: true, context: 'personal', assignedTo: meId ?? undefined })),
      { ids: [id], undo: async () => { await deleteTask(id) } })
  }
  const doneOf = (t: Task) => act(`Complete “${t.title}”`, toggleOf(t), { ids: [t.id], undo: toggleOf(t) })
  const lookBackBody = (t: PeriodSessionTools) => {
    if (!planning) return null
    const common = { prevLabel: prevWord, review: prevReview, draft: t.lookDraft, onDraft: t.setLookDraft, done: prevDone, outOf: prevAll, alsoDone: prevAlso }
    if (level === 0) {
      const open = goalsOf(year - 1).filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open')
        .map((g) => ({ id: g.id, title: g.name, node: { key: `0:${g.id}`, id: g.id, title: g.name, level: 0, parent: null, goal: g } as PlanNode }))
      return <PeriodLookBack {...common} open={open} toLabel={`To ${year}`} verbs={{
        done: (l) => setGoalStatus(l.node, 'completed', `Complete “${l.title}”`),
        to: (l) => carryGoal(l.node, year, `Bring “${l.title}” into ${year}`),
        someday: (l) => goalToSomeday(l.node),
        letGo: (l) => setGoalStatus(l.node, 'archived', `Let go of “${l.title}”`),
      }} />
    }
    const lvl = PERIODS[level] as 'season' | 'month'
    const open = prevTasks.filter((x) => taskReviewState(x, lvl, prevB.start, { isCurrent: isCurrentPeriod(prevB, now), seasons }) === 'open')
    const moves = (x: Task) => periodMoves(x, lvl, prevB, seasons, { updateTask, keepForward, dropCommitment }, activity.run)
    return <PeriodLookBack {...common} open={open} toLabel={`To ${periodWord}`} verbs={{
      done: doneOf,
      to: (x) => moves(x)[0].onClick(),
      someday: (x) => moves(x)[1].onClick(),
      letGo: (x) => moves(x)[2].onClick(),
    }} />
  }
  // Done planning, as the Week's: the period before is recorded reviewed
  // (with the look back's notes as typed — Done is an explicit tap — or what
  // was already said), unless it already is and nothing new was typed. Then
  // the period is marked planned — the closing write; one that fails keeps
  // the session open. Then the way on is the next horizon down (planNext),
  // offered on the page.
  const closePeriod = async (draft: ReviewNotes | null): Promise<boolean> => {
    const saved = prevReview.mine ?? { wentWell: '', didnt: '' }
    const notes = draft ? { wentWell: draft.wentWell.trim(), didnt: draft.didnt.trim() } : saved
    const changed = notes.wentWell !== saved.wentWell || notes.didnt !== saved.didnt
    if ((!prevReview.reviewed || changed) && !(await prevReview.finish(notes).catch(() => false))) {
      showToast(`Couldn’t mark ${prevWord} reviewed — try again.`, 'error', 5000)
    }
    const ok = await markPlanned()
    if (ok) { setMarkedKey(periodKey); setJustMarkedAt(new Date()); periodNotes.reload(); rememberFolded(PERIODS[level]) }
    return ok
  }
  // Season, choose from the year (Task 2): the year's goals on the sheet
  // beside Fall, for reading, and while the step is on, Someday under them:
  // each line with "To Fall" (a holding list, not a horizon; a session-only
  // choice, as the look back's). Nothing is picked from the year: the season
  // is written in its own words. Bringing one in is a write, not choosing:
  // only the goals by area mark the season planned.
  const somedayRows = () => {
    // Someday is "not now"; what was let go is "not ever" and is not offered.
    const someday = visible.filter((t) => t.bucket === 'someday' && !t.completed && !t.parentTaskId && !isLetGo(t))
    const bring = (task: Task) => {
      const before = { ...placementOf(task), commitments: liveCommitments({ commitments: bootstrapCommitments(task) }) }
      return act(`${periodWord}: “${task.title}”`, async () => !!(await keepForward(task.id, { seasonStart: bounds.start })),
        { ids: [task.id], undo: async () => (await updateTask(task.id, before)) !== false })
    }
    return <>
      <h3 className="above-sheet-sub">Someday</h3>
      {someday.length === 0 ? <p className="above-sheet-empty">Nothing on Someday.</p>
        : <ul className="above-sheet-list" aria-label="Someday">
          {someday.map((t) => <li key={t.id} className="above-sheet-row">
            <span className="above-sheet-row-title">{t.title}</span>
            <button type="button" className="canvas-link above-sheet-to" aria-label={`To ${periodWord}: ${t.title}`}
              onClick={() => { void bring(t) }}>To {periodWord}</button>
          </li>)}
        </ul>}
    </>
  }
  // The season's goals, for the ideal week: its blocks name them (any goal
  // of the season), and a new block can be for an open one.
  const seasonGoals = level === 1 ? levelNodes.map((n) => ({ id: n.id, title: n.title })) : []
  const openSeasonGoals = level === 1 ? openNodes.map((n) => ({ id: n.id, title: n.title })) : []
  // The year's open goals, for the refine and share steps.
  const yearOpen = level === 0 ? openNodes.filter((n) => n.goal) : []
  // A step that captures one small fact asks it in its tooltip (Task 4,
  // Scott 2026-11-04).
  // Share and book (Year): sharing is each goal's own space (its panel); the
  // step's tooltip asks the booking date of the first session of the next
  // season. A tap opens a day to book, the next season's first unless changed
  // (fix round 1: booking keeps a date); "Book it" books that day, with Undo.
  // Energy check (Season): Low · Medium · High, the season's energy note,
  // once its notes are read; the header line says it after.
  const seasonStarts = nextSeasonStart(now, seasons)
  const seasonEnergy = seasonNotes.notes.energy
  const patchSeasonNotes = seasonNotes.patch
  const sessionAsks: Partial<Record<string, CoachAsk>> = level === 1 ? (seasonNotes.loading || seasonNotes.error ? {} : {
    energy: {
      kind: 'choice', label: 'Energy', choices: ENERGY_CHOICES, value: seasonEnergy?.level,
      pick: (v) => isEnergyLevel(v) ? patchSeasonNotes({ energy: withEnergy(seasonEnergy, v) }) : Promise.resolve(false),
    },
  }) : level === 0 ? {
    'share-book': {
      kind: 'book',
      label: `Book the first ${nextSeasonWord} session`,
      date: { label: `First ${nextSeasonWord} session`, initial: new Date(seasonStarts.getFullYear(), seasonStarts.getMonth(), seasonStarts.getDate()) },
      done: (day) => `Booked: Plan ${nextSeasonWord}${day ? `, ${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}`,
      run: (day) => day ? bookSeason(day) : Promise.resolve(false),
    },
  } : {}

  // ---- The header (calm pass, 2026-10-18) ------------------------------------
  // Planning this period is the plan chip ("Plan October"; while a session
  // runs, "Planning October · 2 of 6" with ✕), on every period that can still
  // be planned (planning as tooltips, 2026-11-04). Besides it, one button at
  // most, only when due (reviewed design, 2026-10-20): the last days
  // (REVIEW_WINDOW_DAYS: a month's last 3, a season's or year's last 7) and
  // after, until reviewed, "Review October" — Looking back at October, then
  // plan November. Everything else waits in ⋯ — planning the next period
  // early, a review never done; nothing while a flow is open.
  type Offer = { id: string; label: string; due: boolean; run: () => void }
  const inFlow = reviewing || planning
  // Held until the reviews and the plan records have loaded, so the button
  // doesn't flicker from one offer to another.
  const settled = !review.loading && !prevReview.loading && !planSession.loading && !nextPlanSession.loading
  // A record that failed to load reads as unplanned, so planning stays offered.
  const nextPlanned = !nextPlanSession.error && !!nextPlanSession.saved
  const offers: Offer[] = inFlow || !settled ? [] : [
    ...(target === 'this' && !review.error && !review.reviewed
      ? [{ id: 'review', label: `Review ${periodWord}`, due: true, run: () => setReviewing(true) }] : []),
    ...(target === 'previous' && !prevReview.error && !prevReview.reviewed
      ? [{ id: 'review', label: `Review ${prevWord}`, due: false, run: () => setReviewing(true, bounds.prev) }] : []),
    ...(!nextPlanned ? [{ id: 'plan-next', label: target === 'this' ? `Plan ${nextWord}` : `Plan ${nextWord} early`, due: false, run: () => setMode('plan', bounds.next) }] : []),
  ]
  const primary = offers.find((o) => o.due) ?? null
  // One quiet fact line, one count on every horizon (reviewed design): done
  // out of everything that was on the period — done, moved on or still open —
  // as Looking back counts it: Month "28 of 46 done", Season "Sep 22 – Dec 20
  // · 4 of 21 done", Year "1 of 5 goals done"; a bar. When it was planned is
  // the summary line's, under it (PeriodSummaryLine).
  // Out of what was on the period and still is: open or done in it. Moved on,
  // done before it began and let go are not in the total.
  const onPeriod = openNodes.length + doneNodes.length
  const doneWord = level === 0 ? `${onPeriod === 1 ? 'goal' : 'goals'} done` : 'done'
  const countText = `${doneNodes.length} of ${onPeriod} ${doneWord}`
  // The fact line and the summary line stay through a planning session (the
  // page never changes shape); a review on its way to the session hides them.
  const facts = !reviewing && dataReady && !error && !goalsError
    ? <p className="wk-facts plan-facts" data-explain="period-facts" data-explain-label={`${periodWord} at a glance`}>
      {level === 1 && <>{periodRange(bounds.start, bounds.end)}{onPeriod > 0 && ' · '}</>}
      {onPeriod > 0 && <>
        <span className="wk-facts-count"><b>{doneNodes.length}</b> of {onPeriod} {doneWord}</span>
        <span className="wk-facts-bar" role="img" aria-label={countText}><span style={{ width: `${Math.round(doneNodes.length / onPeriod * 1000) / 10}%` }} /></span>
      </>}
    </p>
    : null
  // What this period's planning left, in one quiet line (Task 6's words):
  // "Planned Wed, Nov 4 · Last month’s review", and the season's energy.
  const plannedAt = periodNotes.notes.guide?.plannedAt
    ?? (!planSession.loading && !planSession.error ? planSession.saved?.at.toISOString() : undefined)
  const summary = !reviewing && dataReady && !error && !goalsError
    ? <PeriodSummaryLine level={PERIODS[level]} plannedAt={plannedAt} reviewed={!prevReview.error && !!prevReview.reviewed}
      // Season's energy, asked in its Energy step's tooltip (Task 4): said
      // here, and a tap changes it. Keyed by the period: a menu left open
      // never carries to the next season.
      key={`summary:${sessionToken}`}
      {...(level === 1 && !seasonNotes.loading && !seasonNotes.error ? { energy: seasonEnergy, onEnergy: (energy: EnergyNote | undefined) => patchSeasonNotes({ energy }) } : {})} />
    : null
  const menuChoices: PageMenuChoice[] = [
    ...(dataReady ? offers.filter((o) => o !== primary).map((o) => ({ id: o.id, label: o.label, onSelect: o.run })) : []),
    // Month's Fresh start lives here, every day (its step points at ⋯).
    ...(level === 2 ? [{ id: 'fresh-start', label: 'Fresh start', onSelect: () => setFreshOpen(true) }] : []),
    ...(!current ? [{ id: 'back', label: `Back to this ${PERIODS[level]}`, onSelect: () => setStart(null) }] : []),
    ...(inFlow ? [] : [
      { id: 'done', label: 'Show done', checked: showDone, onSelect: () => prefs.set('done', !showDone) },
      { id: 'intro', label: 'Start with a goal · guided introduction', onSelect: () => navigate('/getting-started?journey=goals') },
    ]),
  ]
  const help = shellHelp ?? (() => openAssistant({ message: EXPLAIN_MESSAGE, autoSend: true, stayOnPage: true }))
  const menuLabel = `${PERIODS[level][0].toUpperCase()}${PERIODS[level].slice(1)} options`

  // The period's sheet: its list, then the next ruled line to write on. It
  // lies beside the level above, folded at its left edge, and its calendar,
  // folded at its right (PaperFold). In a session each step drives the
  // folds; Done planning stamps it.
  const footer = proposals.length > 0 || openNodes.length > 0
  // This period's calendar, folded at the sheet's right edge, for reading
  // (Task 5c). It reuses the sessions' read-only steps: Month the month at a
  // glance over its weeks from its first (four to six, the grid's rows), Season its fixed dates by month,
  // Year its 12 months of exact-date events.
  const calendarSheet = level === 2
    ? <CalendarSheet kicker="What’s already claimed" title={periodWord}>
      <MonthGrid month={bounds.start} weekStartsOn={weekStartsOn} />
      <NextWeeks start={weekStartAnchor(bounds.start, weekStartsOn)} weeks={monthGridWeeks(bounds.start, weekStartsOn).length} />
      <CalendarRoutines word="month" routines={periodRoutines} />
    </CalendarSheet>
    : level === 1
      ? <CalendarSheet kicker={`Fixed dates · ${periodRange(bounds.start, bounds.end)}`} title={periodWord}>
        <SeasonCalendar date={bounds.start} seasons={seasons} />
        {/* A season runs few routines of its own: the section only when it has some. */}
        {periodRoutines.length > 0 && <CalendarRoutines word="season" routines={periodRoutines} />}
      </CalendarSheet>
      : <CalendarSheet kicker="The 12 months" title={periodWord}>
        {/* The year's landscape, as written in its session (read-only, no
            Edit here), then its dates: the months gone by in one row, four
            dates a month at most. */}
        {hasLandscape(yearNotes.notes.landscape) && <YearLandscapeSection value={yearNotes.notes.landscape} />}
        <MonthsCalendar start={bounds.start} end={bounds.end} allMonths perMonth={4} label={`${periodWord}, month by month`} over={`${periodWord} is over.`} />
        <CalendarRoutines word="year" routines={periodRoutines} />
      </CalendarSheet>
  // The life areas in view (the space filter; a legacy area with no space is
  // Personal): the guide's, and the writing step's chips.
  const areasInView = lifeAreas.filter((x) => matchesLayers(x.context ?? 'personal', layers))
  // The season's wild cards turned on, by name ("Money · Travel").
  const wildCards = WILD_CARDS.filter((c) => seasonNotes.notes.wildCards?.includes(c.id)).map((c) => c.label)
  // A period's notes are written to only once they have been read (fix
  // round 1): while they load a section shows its heading alone and offers
  // no editor; a read that failed says so, faintly, and offers none.
  type NotesRead = { loading: boolean; error: string | null }
  const notesReady = (n: NotesRead) => !n.loading && !n.error
  const gated = (n: NotesRead, empty: string | null, editor: ReactNode) => n.error
    ? { empty: 'Couldn’t load.', editor: undefined }
    : n.loading ? { empty: null, editor: undefined } : { empty, editor }
  const sheetFor = (fold?: SessionFold) => {
    // A writing step (by area, brain dump) writes area by area: the areas as
    // chips beside the line, the new line in the one picked.
    const byArea = !!fold?.write && areasInView.length > 0
    const picked = byArea ? areasInView.find((a) => a.id === writeAreaId) ?? null : null
    // Month's Maintenance and fun: the line asks for something fun.
    const fun = level === 2 && fold?.stepId === 'upkeep-fun'
    // Year's Refine: the overlapping pairs on the list, with their calls
    // (session-only). Keep both is kept in the year's notes, so a pair set
    // aside stays so.
    const refine = level === 0 && fold?.stepId === 'refine' && notesReady(yearNotes) && <div className="sheet-refine" role="region" aria-label="May overlap">
      <YearRefine goals={yearOpen.map((n) => ({ id: n.id, title: n.title, node: n }))} value={yearNotes.notes.keptPairs} patch={yearNotes.patch}
        onLetGo={(g) => setGoalStatus(g.node, 'archived', `Let go of “${g.title}”`)} onSomeday={(g) => goalToSomeday(g.node)} />
    </div>
    const areaChips = byArea && <div className="sheet-areas" role="radiogroup" aria-label="Life area">
      {areasInView.map((a) => <button key={a.id} type="button" role="radio" aria-checked={picked?.id === a.id}
        className={`sheet-area${picked?.id === a.id ? ' is-on' : ''}`} onClick={() => setWriteAreaId(picked?.id === a.id ? null : a.id)}>{a.name}</button>)}
    </div>
    return (
    <section className="plan-list plan-sheet" data-explain="list" data-explain-label={`Every ${periodWord} goal`}>
      {justMarked && !planning && <PlannedStamp at={justMarkedAt} />}
      <PlanOrderList key={`${level}:${localYmd(bounds.start)}`} label={`${periodWord} goals`} items={items} headingOf={headingOf} groupOf={groupOf}
        keyOf={(n) => n.key} titleOf={(n) => n.title}
        // Only an open line orders; done and moved-on lines keep their place.
        orderIdOf={(n) => isOpen(n) ? n.id : null}
        renderRow={renderItem} onReorder={reorderLine}
        tail={<>
          {preview.here.map(previewRow)}
          {proposals.map((p) => <ProposalRow key={p.key} proposal={p}
            onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />)}
        </>} />
      {refine}
      {openNodes.length === 0 && preview.here.length === 0 && proposals.length === 0 && <p className="plan-empty">Nothing{folded.length ? ' open' : ''} for {periodWord} yet.</p>}
      {areaChips}
      <WriteLine placeholder={fun ? `Something fun for ${periodWord}` : picked ? `${writeLabel} for ${picked.name}` : writeLabel} period={{ start: bounds.start, end: new Date(bounds.end.getTime() - 1) }} periodWord={periodWord}
        onWrite={writeLineIn(picked ? { id: picked.id, context: picked.context ?? null } : null, fun)} extra={picked ? null : area.picker} />
      {folded.length > 0 && <button type="button" className="plan-done-fold" aria-expanded={showDone} onClick={() => prefs.set('done', !showDone)}>
        <span className="plan-done-fold-text">{doneLine}</span>
        <span className="canvas-link plan-done-fold-go">{showDone ? 'Hide' : 'Show'}</span>
      </button>}
      {footer && <footer className="plan-list-foot">
        {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all</button>}
        {openNodes.length > 0 && <Link to={onward.to} className="plan-next" data-explain="next" data-explain-label={onward.label.replace(' →', '')}>{onward.label}</Link>}
      </footer>}
    </section>
    )
  }
  // The sheet with its two folds. In a session the step drives them (`fold`):
  // the look back turns the sheet above to the period before, with its
  // choices; otherwise they are the reader's, as they left them.
  const pageBody = (fold?: SessionFold) => (
    <div className={`plan-horizon-body is-sheet${preview.next.length ? ' has-next' : ''}`}>
    <div className="plan-sheet-spread">
      <PaperFold horizon={PERIODS[level]} edgeLabel={fold?.look ? prevB.label : aboveSheet.title} edgeCount={fold?.look ? undefined : aboveSheet.rows.length}
        frontLabel={fold?.look ? `${prevB.label}, looking back` : undefined}
        above={fold?.look ? <LookSheet title={prevWord}>{fold.look}</LookSheet>
          : <AboveSheet {...aboveSheet} foot={`For reading. Write ${periodWord} in its own words.`}>
            {level === 1 && fold?.stepId === 'from-year' && somedayRows()}
          </AboveSheet>}
        calendar={calendarSheet} calendarLabel={`${periodWord} calendar`} drive={fold?.drive}>
        {sheetFor(fold)}
      </PaperFold>
    </div>
    {/* Each planning step's home on the page (Task 2): quiet sections under
        the sheet, there every day; the step that asks for one opens it. */}
    {/* Keyed by the period, so an editor left open, or a chip's tap, never
        carries to the next one (fix round 1). */}
    {level === 1 && <div className="plan-sections" key={`sections:${sessionToken}`}>
      <PageSection title="Ideal week" anchor="ideal-week" open={fold?.stepId === 'ideal-week' && notesReady(seasonNotes)}
        {...gated(seasonNotes, seasonNotes.notes.idealWeek?.blocks.length ? null : `No ideal week for ${periodWord} yet.`,
          <SeasonIdealWeek value={seasonNotes.notes.idealWeek} goals={openSeasonGoals} patch={seasonNotes.patch} />)}>
        {notesReady(seasonNotes) && seasonNotes.notes.idealWeek && <IdealWeekSection headless value={seasonNotes.notes.idealWeek} goals={seasonGoals} />}
      </PageSection>
      <PageSection title="Wild cards" anchor="wild-cards" open={fold?.stepId === 'wild-cards' && notesReady(seasonNotes)}
        {...gated(seasonNotes, wildCards.length ? null : `No wild cards for ${periodWord} yet.`,
          <SeasonWildCards value={seasonNotes.notes.wildCards} patch={seasonNotes.patch} />)}>
        {notesReady(seasonNotes) && <p className="page-section-line">{wildCards.join(' · ')}</p>}
      </PageSection>
    </div>}
    {level === 0 && <div className="plan-sections" key={`sections:${sessionToken}`}>
      <PageSection title="Vision" anchor="vision" open={fold?.stepId === 'vision' && notesReady(yearNotes)}
        {...gated(yearNotes, hasVision(yearNotes.notes.vision) ? null : `No vision for ${periodWord} yet.`,
          <YearVision yearWord={periodWord} value={yearNotes.notes.vision} patch={yearNotes.patch} />)}>
        {notesReady(yearNotes) && <YearVisionSection headless value={yearNotes.notes.vision} yearWord={periodWord} />}
      </PageSection>
      <PageSection title="Landscape" anchor="landscape" open={fold?.stepId === 'landscape' && notesReady(yearNotes)}
        {...gated(yearNotes, hasLandscape(yearNotes.notes.landscape) ? null : 'No months mapped yet.',
          <YearLandscape value={yearNotes.notes.landscape} patch={yearNotes.patch} />)}>
        {notesReady(yearNotes) && <YearLandscapeSection headless value={yearNotes.notes.landscape} />}
      </PageSection>
      <PageSection title="Life areas" anchor="areas" open={fold?.stepId === 'areas'}
        empty={areasInView.length ? null : 'No life areas yet.'}
        editor={<div className="gw-body"><AreasEditor areas={lifeAreas} onAdd={addArea} onRename={renameArea} onSetContext={setAreaContext} onRemove={removeArea} /></div>}>
        <p className="page-section-line">{areasInView.map((x) => x.name).join(' · ')}</p>
      </PageSection>
    </div>}
    {preview.next.length > 0 && <section className="plan-list plan-next-list" aria-label={`${nextWord}, proposed`}>
      <p className="plan-next-list-title">{nextWord}</p>
      <ul className="plan-items plan-goal-list" aria-label={`${nextWord} goals`}>
        {nextTitles.map((t, i) => <li key={`${i}:${t}`} className="plan-item"><div className="canvas-item"><span className="canvas-item-title plan-item-title">{t}</span></div></li>)}
        {preview.next.map(previewRow)}
      </ul>
    </section>}
    </div>
  )

  return <main ref={mainRef} className={`plan-canvas plan-horizon ${PAGE_PLANNING}`} data-horizon={level}>
    <header className="plan-head">
      <div className="plan-head-main">
        <div className="plan-period" data-explain="period" data-explain-label={`${periodTitle}, ${periodRange(bounds.start, bounds.end)}`}>
          <button type="button" className="plan-step" onClick={() => setStart(bounds.prev)} aria-label={`Previous ${PERIODS[level]}`}><ChevronLeft size={18} aria-hidden="true" /></button>
          <h1 data-guide-anchor="title">{periodTitle}</h1>
          <button type="button" className="plan-step" onClick={() => setStart(bounds.next)} aria-label={`Next ${PERIODS[level]}`}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        {/* The review and the plan say where the period stands in their own
            words: the fact line steps aside while one is open. */}
        {facts}
        {summary}
      </div>
      <div className="plan-head-tools">
        {plannable && !reviewing && <PlanChip level={PERIODS[level]} word={periodWord} onStart={() => setMode('plan')} disabled={!dataReady} />}
        {primary && <button type="button" className="pv2-btn wk-plan plan-primary" disabled={!dataReady} onClick={primary.run}
          data-explain="plan-primary" data-explain-label={primary.label}>{primary.label}</button>}
        {/* Without the docked bar (phones), ⋯ offers the talk that is due. */}
        <PageHelpContext.Provider value={help}>
          <PageMenu label={menuLabel} choices={menuChoices} anchor={level === 2 ? 'menu' : undefined}
            talk={walkInBar || !dueTalk ? undefined : () => openAssistant({ message: dueTalk.message, autoSend: true })} />
        </PageHelpContext.Provider>
      </div>
    </header>
    {freshOpen && level === 2 && <div className="plan-fresh" role="region" aria-label="Fresh start">
      <div className="page-section-head">
        <h3 className="page-section-title">Fresh start · {periodWord}</h3>
        <button type="button" className="canvas-link page-section-edit" onClick={() => setFreshOpen(false)}>Close</button>
      </div>
      {periodNotes.error ? <p className="page-section-empty">Couldn’t load.</p>
        : !periodNotes.loading && <FreshStart monthWord={periodWord} value={periodNotes.notes.scenery} patch={periodNotes.patch} />}
    </div>}

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : !dataReady ? null
      // Reviewing a period is the first card of planning the one after it
      // (spec 2026-10-19): Review October opens Plan November on Looking back.
      : reviewing ? <Navigate replace to={`${pathname}?${(() => { const q = new URLSearchParams(params); q.delete('review'); q.delete('focus'); q.set('plan', '1'); q.set('step', 'look-back'); q.set('start', localYmd(bounds.next)); return q.toString() })()}`} />
      // Planning: this same page, one tooltip per step, each step driving
      // the sheet's folds.
      : planning ? <GuidedPeriod key={periodKey} level={PERIODS[level]} token={sessionToken} periodLabel={periodWord}
          page={pageBody} look={lookBackBody} asks={sessionAsks} onFinish={closePeriod}
          onLeave={() => { setMode(null); periodNotes.reload(); seasonNotes.reload() }}
          onPlanned={() => { planSession.reload(); periodNotes.reload() }} listenPageWrites={listenPageWrites}
          aboveLines={above.map((n) => ({ id: n.id, title: n.title }))}
          // Only the areas the space filter shows (a legacy area with no
          // space is Personal): the guide never hears of one out of view.
          areas={areasInView.map((x) => ({ id: x.id, name: x.name, context: x.context }))} />
      : <>
        {/* Just planned here: the way on is the next horizon down. */}
        {justMarked && <div className="pv2-saved plan-planned-next" role="note">
          <span className="pv2-saved-text"><b>{periodWord[0].toUpperCase() + periodWord.slice(1)} is planned.</b></span>
          <button type="button" className="pv2-btn wk-plan" onClick={planNext.onClick}>{planNext.label}</button>
        </div>}
        {/* The spread alone, centered: Month's and Year's routines are on
            the calendar sheet, not in a strip beside it. */}
        {pageBody()}
      </>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
