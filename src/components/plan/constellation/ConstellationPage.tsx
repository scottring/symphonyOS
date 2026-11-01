// src/components/plan/constellation/ConstellationPage.tsx
//
// Year, Season and Month: one page shape for each (mockup approved
// 2026-10-13, after the Week redesign). The period's goals are one plain list,
// drawn one way. The top bar names the horizon (Today · Week · Month · Season
// · Year), so the page carries no horizon tabs of its own.
//
// The list, calm pass (Scott approved the mockup 2026-10-18): it never runs
// off the page — a compact card of 8, then "+N more" (PlanOrderList). Lines
// order by drag, and the order is the priority: month and season lines write
// the task's one sortOrder (the same order as Today and the Week), year goals
// goals.sort_order, each with Undo. The level above sits in the strip on the
// left (AboveStrip, Scott's wireframe 2026-10-25): drag a goal onto a line to
// put it under, onto the list (or "→ Oct") to write under it. Year's strip is
// last year's open goals; Month and Year add a Routines tab at their pace.
//
// Levels connect by looking, not linking (Scott, 2026-07-08 and 2026-10-13):
// a link is made while writing (an optional "For" pick) or from the goal's
// panel. A linked goal says what it is for and what is already under it one
// horizon down; an unlinked goal says nothing.
//
// Talk-first (spec 2026-10-14, "The pages"): a list to look at, with a few
// quick triage verbs on each open row (Scott, 2026-10-16), one word per move
// as in planning (reviewed design, 2026-10-20): This week (October on Season)
// · Done · Later ▾ (Next month · Someday) · Back to Fall (Off October when
// nothing above holds it) on a month or season goal, Fall · Done · Later ▾
// (Next year) · Let go on a year goal. Each row tags where it stands one horizon down ("This week · 2",
// "Thu", "October"); nothing there, no tag. Tapping a month or season goal opens its task panel
// (which holds every verb — horizonPanel.tsx), and a year goal opens in place
// with Done and Let go. Done goals fold into one line. The bar's walk becomes
// "Plan November" while that talk is due (planSchedule.ts), and a pending
// change card is drawn dashed on the list (planPreview.ts).
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
// Planning (?plan=1, spec 2026-11-01) is a guided session on this same page
// (GuidedPeriod): the steps rail where the strip stands, the period's list
// beside it, each step's body drawn from the page's own writers. It replaced
// the Looking back → Choose swap and the "Plan this season with me" walk.

import { PageHelpContext, usePageHelp } from '@/components/explain/PageHelp'
import { PageMenu, type PageMenuChoice } from '@/components/plan/PageMenu'
import { usePlanPagePrefs } from '@/hooks/usePlanPagePrefs'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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
import { periodBounds, selectPeriodTasks, isCurrentPeriod } from '@/lib/planning/periodPage'
import { talkFor, listIsEmpty, isPutOff, readDismissals } from '@/lib/planning/planSchedule'
import { committedTo } from '@/lib/placement/model'
import { localYmd, parseLocalYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import type { TaskContext } from '@/types/task'
import { useAddArea } from '../v2/AddArea'
import { planNodes, type PlanNode } from './model'
import { moveUnderPatch } from './connections'
import { planPreview, type PeriodSpan } from './planPreview'
import { isDone, periodRange } from '@/components/canvas/plan/planGroups'
import { PlanItemRow, type RowVerb } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { readinessOf, type ReadinessLookup } from '@/lib/prep/readiness'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { compareSortOrder, nextTaskSortOrder, reorderTasksToIndex, type OrderWrite } from '@/lib/today/taskOrdering'
import { PlanOrderList, type RowOrder } from './PlanOrderList'
import { useLifeAreas } from '@/hooks/useLifeAreas'
import { groupByArea } from '@/lib/guide/byArea'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { aboveOf, periodMoves } from './horizonPanel'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EXPLAIN_MESSAGE } from '@/lib/explain/pageGuides'
import { monthToken, usePlanningSession, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { showToast } from '@/hooks/useToast'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { nextSeasonStart, seasonLabel, seasonToken } from '@/lib/cadence/seasons'
import { REVIEW_WINDOW_DAYS, alsoDoneIn, movedOn, reviewTarget, taskReviewState, weekPhrase, yearGoalReviewState } from '@/lib/planning/periodReview'
import type { ReviewState } from '@/lib/planning/periodReview'
import { ChoosePlan, type ChooseItemView, type ChooseLineView, type ChooseVerb } from '@/components/plan/choose/ChoosePlan'
import { buildChooseTree, countsLine, plannedFor, type ChooseLine, type ChooseNode, type LooseItem } from '@/lib/planning/chooseFromAbove'
import { liveCommitments, openCommitment } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import type { Task } from '@/types/task'
import { placementOf } from '@/lib/planning/placement'
import { deleteQuestion, restoreDeleted } from '@/lib/planning/restoreDeleted'
import { useRoutines } from '@/hooks/useRoutines'
import { TypedAdd } from '@/components/canvas/strip/TypedAdd'
import type { HorizonLanding, HorizonParse } from '@/lib/planning/horizonInput'
import { AboveStrip, type AboveGoal, type StripRoutine } from './AboveStrip'
import { GuidedPeriod, type PeriodSessionTools } from '@/components/plan/guided/GuidedPeriod'
import { reportItem, reportLine } from '@/components/plan/guided/reporting'
import { FreshStart } from '@/components/plan/guided/month/FreshStart'
import { PeriodLookBack } from '@/components/plan/guided/month/PeriodLookBack'
import { ReadAbove } from '@/components/plan/guided/month/ReadAbove'
import { NextWeeks } from '@/components/plan/guided/month/NextWeeks'
import { UpkeepFun } from '@/components/plan/guided/month/UpkeepFun'
import { FromYear } from '@/components/plan/guided/season/FromYear'
import { SeasonCalendar } from '@/components/plan/guided/season/SeasonCalendar'
import { SeasonEnergy, SeasonIdealWeek, SeasonWildCards } from '@/components/plan/guided/season/SeasonNotes'
import { IdealWeekSection } from '@/components/guide/IdealWeekSection'
import { YearVisionSection, hasVision } from '@/components/guide/YearVisionSection'
import { YearLandscapeSection, hasLandscape } from '@/components/guide/YearLandscapeSection'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { YearVision } from '@/components/plan/guided/year/Vision'
import { YearLandscape } from '@/components/plan/guided/year/Landscape'
import { BrainDump } from '@/components/plan/guided/year/BrainDump'
import { YearRefine } from '@/components/plan/guided/year/Refine'
import { ShareBook } from '@/components/plan/guided/year/ShareBook'
import { AreasEditor } from '@/components/guide/AreasEditor'
import { useAuth } from '@/hooks/useAuth'
import type { ReviewNotes } from '@/hooks/usePeriodReview'
import { isAboveDrag, ABOVE_MIME } from './aboveDrag'

const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const SESSION_HORIZONS: readonly SessionHorizon[] = ['annual', 'seasonal', 'monthly']
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
const KEEP_VIEW = () => {}
/** "an October goal", "a Fall goal". */
const aOrAn = (word: string) => /^[aeiou8]/i.test(word) ? 'an' : 'a'

type Composer = { kind: 'add' } | { kind: 'edit'; key: string } | { kind: 'piece'; key: string }

/** One line the period before left, with the verbs that answer it. */
interface ReviewVerb { label: string; run: () => Promise<boolean>; menu?: ReviewVerb[]; confirm?: string }
/** Later ▾'s first choice: the next period of the row's own kind. */
const LATER_WORD = { season: 'Next season', month: 'Next month' } as const
const toRowVerb = (v: ReviewVerb): RowVerb => ({
  label: v.label, onSelect: () => { void v.run() },
  ...(v.menu ? { menu: v.menu.map(toRowVerb) } : {}), ...(v.confirm ? { confirm: v.confirm } : {}),
})
interface ReviewLine { key: string; title: string; state: ReviewState; note?: string; verbs: ReviewVerb[] }

/** A goal of the level above, with what this period already holds under it (the card beside the list). */
interface PlanParent {
  key: string
  title: string
  children: string[]
  onAdd: (title: string) => Promise<boolean>
}

function Inner() {
  const selection = useSelectionOptional()
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, deleteGoal } = useGoalsContext()
  // `tasks` is what the page draws, so its own `updateTaskOrders` (optimistic)
  // moves a dropped line at once — never another hook instance's.
  const { tasks, loading, error, addTask, updateTask, refetch, deleteTask, toggleTask, pushTask, setBucket, updateTasksBulk, keepForward, dropCommitment, updateTaskOrders } = useSupabaseTasks()
  // Someday asks for a domain first on an Unsorted item, as every triage does.
  const gated = useGatedTaskActions({ updateTask, pushTask, setBucket, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
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
  const { user } = useAuth()
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
  const year = anchor.getFullYear()
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
  // The season's notes, for its everyday page (the ideal week). Read only off
  // a session: while one runs it holds the notes, and leaving it reads them
  // afresh.
  const seasonNotes = usePlanningNotes('seasonal', level === 1 && !planning ? sessionToken : '')
  // The year's notes, for its everyday page (the vision and the landscape),
  // read the same way.
  const yearNotes = usePlanningNotes('annual', level === 0 && !planning ? sessionToken : '')
  // "Edit" on one of them: the year's session, opened on that step (only on a
  // year not yet over, as ?plan=1 itself).
  const editStep = (step: string) => {
    if (!plannable) return undefined
    const q = new URLSearchParams(params)
    q.delete('review'); q.delete('focus'); q.set('plan', '1'); q.set('step', step)
    return `${pathname}?${q.toString()}`
  }
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
    visible.filter((t) => committedTo(t, 'week', week, { isCurrent: thisWeek }) !== undefined),
  ])

  // Show done and the level above: this viewer's choices, shared with the
  // ⋯ menu and remembered on this device (usePlanPagePrefs).
  const prefs = usePlanPagePrefs()
  const showDone = prefs.done
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  // Marked planned in this sitting (the period's key): the way on is the next
  // horizon down.
  const [markedKey, setMarkedKey] = useState<string | null>(null)
  // The optional "For" pick while writing a new goal (a node key, or none).
  const [forKey, setForKey] = useState('')
  // A link just made: the goal's "For" line lights up.
  const [linked, setLinked] = useState<string | null>(null)
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
    if (!linked) return
    const t = setTimeout(() => setLinked(null), 1800)
    return () => clearTimeout(t)
  }, [linked])

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
  const movedLabel = (node: PlanNode): string | null => {
    if (node.goal) return goals.some((g) => g.year === node.goal!.year + 1 && g.carriedFrom === node.id && g.status !== 'archived') ? `Moved to ${node.goal.year + 1}` : null
    if (!node.task || node.level === 0 || node.level > 2) return null
    const lvl = PERIODS[node.level] as 'season' | 'month', b = LEVEL_BOUNDS[node.level]
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

  const contextFor = (parent: PlanNode | null): TaskContext | undefined =>
    (parent ? (parent.goal ? parent.goal.context : parent.task?.context) : area.area) ?? undefined

  // A goal new to a year goes last there: above that year's highest order, so a
  // list already ordered by drag doesn't take it in second.
  const lastInYear = (y: number) => nextTaskSortOrder(goals.filter((g) => g.year === y))

  /** The one create path: period and lineage in a single insert. */
  const createItem = async (lvl: number, title: string, parent: PlanNode | null, id: string, context: TaskContext | undefined, extra?: { isFun?: boolean }): Promise<boolean> => {
    if (lvl === 0) return !!await addGoal(null, title, context, { year, id, sortOrder: lastInYear(year) })
    return !!await addTask(title, undefined, undefined, undefined, {
      id, ...extra,
      bucket: lvl === 1 ? 'quarter' : lvl === 2 ? 'month' : 'week',
      ...(lvl === 1 ? { seasonStart: seasonB.start } : lvl === 2 ? { monthStart: monthB.start } : { weekStart: week }),
      context,
      ...(parent ? lvl === 1 ? { goalId: parent.id } : { sourceId: parent.id, goalId: parent.task?.goalId } : {}),
    })
  }
  const runCreate = (lvl: number, title: string, parent: PlanNode | null, label: string, id: string = crypto.randomUUID(), extra?: { isFun?: boolean }): Promise<boolean> => {
    const context = contextFor(parent)
    const attempt = (): Promise<boolean> => act(label, () => createItem(lvl, title, parent, id, context, extra), {
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

  const moveUnder = (node: PlanNode, parent: PlanNode | null): Promise<boolean> => {
    const patch = moveUnderPatch(allNodes, node, parent)
    if (!patch) return Promise.resolve(false)
    const label = parent ? `Move “${node.title}” under “${parent.title}”` : `Unlink “${node.title}”`
    return act(label, () => updateTask(node.id, patch.after), {
      ids: [node.id],
      undo: async () => (await updateTask(node.id, patch.before)) !== false,
      retry: () => { void moveUnder(node, parent) },
    }).then((ok) => {
      if (ok && parent) { setLinked(node.key); pageWrote() }
      return ok
    })
  }

  const keepProposal = async (p: CanvasProposal) => {
    const parent = level > 0 ? allNodes.find((n) => n.level === level - 1 && n.id === p.parentId) ?? null : null
    // A suggested link moves the existing item; it never makes a copy.
    const existing = p.itemId ? allNodes.find((n) => n.level === level && n.id === p.itemId) : undefined
    if (p.itemId && (!existing || !parent)) { activity.setProposalState(p.key, 'failed'); return }
    if (existing && parent && existing.parent === parent.key) { activity.removeProposal(p.key); return }
    activity.setProposalState(p.key, 'saving')
    const ok = existing ? await moveUnder(existing, parent) : await runCreate(level, p.title, parent, `Keep “${p.title}”`)
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

  // The row as it was, for Undo: its list of periods (planPlacement's stated list).
  const restoreOf = (t: Task) => {
    const before = liveCommitments({ commitments: bootstrapCommitments(t) })
    return async () => (await updateTask(t.id, { commitments: before })) !== false
  }
  // Someday, with the way back: where it was and its periods (2026-10-25: it
  // saved with no Undo).
  const somedayOf = (t: Task): ReviewVerb => {
    const before = { ...placementOf(t), commitments: liveCommitments({ commitments: bootstrapCommitments(t) }) }
    return { label: 'Someday', run: () => act(`${describeTriageWhen('someday')}: “${t.title}”`, () => applyTriageWhen('someday', t.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! }),
      { ids: [t.id], undo: async () => (await updateTask(t.id, before)) !== false }) }
  }
  // Delete, asked once, with Undo: the same row back, and its pieces.
  const deleteOf = (t: Task): ReviewVerb => ({ label: 'Delete', confirm: deleteQuestion(t),
    run: () => act(`Delete “${t.title}”`, async () => { await deleteTask(t.id); return true }, { ids: [t.id], undo: () => restoreDeleted(addTask, t) }) })

  // Quick triage on an open row (Scott, 2026-10-13, again 2026-10-16), one
  // word per move as in planning (reviewed design, 2026-10-20). A year goal
  // is a goals row: Fall (a Fall goal for it, the step down, while it has
  // none), Done, Later ▾ (Next year: a copy there that remembers it; goals
  // have no Someday), and Let go (it archives; nothing is deleted), which
  // asks once — nothing sits above a year to go back to. A month or season goal is a task committed to this period:
  // This week (October, on Season) where it isn't yet, Done, Later ▾ (the
  // next period, or Someday), and Back to Fall — or Off October when nothing
  // above holds it. The row is on this page's list by construction, so the
  // moves need no other check. Planning's cards use the same verbs, less the
  // step down (`onPage`).
  const verbsFor = (node: PlanNode, opts: { onPage?: boolean } = {}): ReviewVerb[] => {
    if (isDone(node) || movedLabel(node)) return []
    if (!node.task) {
      const hasSeason = allNodes.some((n) => n.level === 1 && n.parent === node.key && isOpen(n))
      const down: ReviewVerb | null = opts.onPage && isCurrentPeriod(seasonB, now) && !hasSeason
        ? { label: seasonWord, run: () => runCreate(1, node.title, node, `${seasonWord}: “${node.title}”`) }
        : null
      return [
        ...(down ? [down] : []),
        { label: 'Done', run: () => setGoalStatus(node, 'completed', `Complete “${node.title}”`) },
        { label: 'Later', run: async () => true, menu: [{ label: 'Next year', run: () => carryGoal(node) }] },
        { label: 'Let go', confirm: 'Off every list?', run: () => setGoalStatus(node, 'archived', `Let go of “${node.title}”`) },
      ]
    }
    const task = node.task
    const lvl = PERIODS[level] as 'season' | 'month'
    const toggle = async () => (await toggleTask(task.id)) !== false
    const above = aboveOf(task, lvl, !!node.parent, lvl === 'month' ? seasonWord : String(year), seasonB.start)
    const [carry, off] = periodMoves(task, lvl, bounds, seasons, { updateTask, keepForward, dropCommitment }, activity.run, above)
    // One horizon down, while it is under way: this week from Month, this month from Season.
    const down: ReviewVerb | null = !opts.onPage ? null
      : lvl === 'month' ? (thisWeek && committedTo(task, 'week', week, { isCurrent: true }) === undefined
        ? { label: 'This week', run: () => act(`This week: “${task.title}”`, async () => !!(await keepForward(task.id, { weekStart: week })), { ids: [task.id], undo: restoreOf(task) }) }
        : null)
        : isCurrentPeriod(monthB, now) && committedTo(task, 'month', monthB.start, { isCurrent: true, seasons }) === undefined
          ? { label: monthWord, run: () => act(`${monthWord}: “${task.title}”`, async () => !!(await keepForward(task.id, { monthStart: monthB.start })), { ids: [task.id], undo: restoreOf(task) }) }
          : null
    return [
      ...(down ? [down] : []),
      { label: 'Done', run: () => act(`Complete “${node.title}”`, toggle, { ids: [node.id], undo: toggle }) },
      { label: 'Later', run: async () => true, menu: [{ label: LATER_WORD[lvl], run: carry.onClick }, somedayOf(task)] },
      { label: off.label, run: off.onClick },
      ...(opts.onPage ? [deleteOf(task)] : []),
    ]
  }
  const quickFor = (node: PlanNode): RowVerb[] => verbsFor(node, { onPage: true }).map(toRowVerb)

  // ---- Proposals for this horizon -----------------------------------------
  const inPeriod = (ymd?: string) => {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return true
    const d = parseLocalYmd(ymd)
    return d >= bounds.start && d < bounds.end
  }
  // A suggested link names the item by its own title, never the model's wording.
  const proposals = activity.proposals.filter((p) => p.level === level && inPeriod(p.periodStart)).map((p) => {
    const existing = p.itemId ? allNodes.find((n) => n.level === level && n.id === p.itemId) : undefined
    return existing ? { ...p, title: existing.title } : p
  })
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


  // A goal above dragged over the list: the line it would go over, or '' for the list itself.
  const [linkOver, setLinkOver] = useState<string | null>(null)
  useEffect(() => {
    const el = linkOver ? mainRef.current?.querySelector(`[data-plan-key="${linkOver.replace(/["\\]/g, '\\$&')}"]`) : null
    el?.classList.add('is-link-over')
    return () => { el?.classList.remove('is-link-over') }
  }, [linkOver])
  // The routines at this page's pace: monthly on Month, yearly on Year (none
  // run by the season), each with when it falls in the period.
  const periodStartMs = bounds.start.getTime(), periodEndMs = bounds.end.getTime()
  const stripRoutines = useMemo<StripRoutine[] | null>(() => {
    if (level === 1) return null
    const want = level === 2 ? 'monthly' : 'yearly'
    const found = new Map<string, { title: string; dates: Date[] }>()
    const start = new Date(periodStartMs)
    for (let d = start; d.getTime() < periodEndMs; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      for (const r of getRoutinesForDate(d)) {
        if (r.recurrence_pattern?.type !== want || !matchesLayers(r.context ?? null, layers)) continue
        const f = found.get(r.id) ?? { title: r.name, dates: [] }
        f.dates.push(d); found.set(r.id, f)
      }
    }
    const fmt = (d: Date) => d.toLocaleDateString('en-US', level === 2 ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
    return [...found].sort((a, b) => a[1].dates[0].getTime() - b[1].dates[0].getTime())
      .map(([id, f]) => ({ id, title: f.title, when: f.dates.map(fmt).join(' · '), onOpen: () => selection?.setSelection({ kind: 'routine', id }) }))
  }, [level, periodStartMs, periodEndMs, getRoutinesForDate, layers, selection])

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

  // ---- The level above, in the strip on the left ----------------------------
  const above = level > 0 ? inOrder(allNodes.filter((n) => n.level === level - 1 && isOpen(n))) : []
  const aboveWord = level === 2 ? seasonWord : String(year)

  // ---- The period's goals: open first, done folded into one line -----------
  const levelNodes = allNodes.filter((n) => n.level === level)
  const openNodes = inOrder(levelNodes.filter(isOpen))
  const doneNodes = levelNodes.filter(isDone)
  const movedNodes = levelNodes.filter((n) => !isDone(n) && !!movedLabel(n))
  const listed = showDone ? [...openNodes, ...movedNodes, ...doneNodes] : openNodes
  // With life areas, the lines gather under their area's name ("No area" last).
  // A year goal's areaId is '' when it has none; areas the viewer cannot see
  // are not in lifeAreas, so their lines fall under "No area".
  const nodeArea = (n: PlanNode) => n.goal ? n.goal.areaId : n.task?.areaId
  const areaGroups = lifeAreas.length ? groupByArea(listed.map((n) => ({ n, areaId: nodeArea(n) })), lifeAreas) : null
  const items = areaGroups ? areaGroups.flatMap((g) => g.items.map((x) => x.n)) : listed
  const areaNameOf = new Map(lifeAreas.map((a) => [a.id, a.name]))
  // Grouped by area id (two areas may share a name); an area the viewer cannot see is '' (No area).
  const groupOf = areaGroups ? (n: PlanNode) => { const id = nodeArea(n) ?? ''; return areaNameOf.has(id) ? id : '' } : undefined
  // "No area" alone says nothing: no heading unless an area is in play.
  const onlyNoArea = !!areaGroups && areaGroups.every((g) => g.area === null)
  const headingOf = groupOf && !onlyNoArea ? (n: PlanNode) => areaNameOf.get(groupOf(n)) ?? 'No area' : undefined
  // "5 done, 1 moved on · Taxes, Picnic…": what is no longer open, in one line.
  const folded = [...doneNodes, ...movedNodes]
  const doneLine = `${[doneNodes.length ? `${doneNodes.length} done` : '', movedNodes.length ? `${movedNodes.length} moved on` : ''].filter(Boolean).join(', ')} · ${folded.slice(0, 2).map((n) => n.title).join(', ')}${folded.length > 2 ? '…' : ''}`

  // ---- A pending change card, drawn dashed (planPreview.ts) -----------------
  const span = (b: { start: Date; end: Date; label: string }): PeriodSpan => ({ start: localYmd(b.start), end: localYmd(b.end), label: periodWordOf(b) })
  const nextB = periodBounds(PERIODS[level], bounds.next, seasons)
  const nextWord = periodWordOf(nextB)
  const preview = planPreview({ set: activity.changeSet ?? null, level: PERIODS[level], shown: span(bounds), next: span(nextB), ids: new Set(levelNodes.map((n) => n.id)) })
  // The coming list, beside this one, while the card adds to it.
  const nextTitles = preview.next.length === 0 ? [] : level === 0
    ? goalsOf(year + 1).map((g) => g.name)
    : selectPeriodTasks(visible, PERIODS[level] as 'season' | 'month', nextB.start, isCurrentPeriod(nextB, now), lens.scopeId, seasons).map((t) => t.title)
  const previewRow = (r: { key: string; title: string; note: string; parentTitle?: string }) =>
    <li key={`preview:${r.key}`} className="plan-item plan-preview-row is-preview is-proposed">
      <div className="canvas-item"><span className="canvas-item-title plan-item-title">{r.title}</span></div>
      <span className="wc-proposed-note plan-preview-note">{r.note}</span>
      {r.parentTitle && <p className="plan-item-parent"><span className="plan-item-parent-kind">For</span> {r.parentTitle}</p>}
    </li>

  const parentOf = (node: PlanNode) => node.parent ? allNodes.find((n) => n.key === node.parent) : undefined
  // What is already under a goal one horizon down: its open lines there, and
  // its own steps put on that period.
  const belowOf = (node: PlanNode): Task[] => {
    const linked = allNodes.filter((n) => n.parent === node.key && n.level === level + 1 && isOpen(n)).flatMap((n) => (n.task ? [n.task] : []))
    if (level === 0) return linked
    // A line's own steps written as subtasks never become plan nodes; one put
    // on the period below counts here too (spec 2026-10-19).
    if (!node.task?.subtasks?.length) return linked
    const below = level === 2
      ? { level: 'week' as const, periodStart: week, prevStart: new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7), isCurrent: thisWeek }
      : { level: 'month' as const, periodStart: monthB.start, prevStart: monthB.prev, isCurrent: isCurrentPeriod(monthB, now) }
    const ids = new Set(linked.map((t) => t.id))
    const steps = node.task.subtasks.filter((st) => {
      if (ids.has(st.id)) return false
      const k = plannedFor(st, { ...below, hereWord: '', lastWord: '', aboveWord: '' }).kind
      return k === 'here' || k === 'day' || k === 'missed'
    })
    return [...linked, ...steps]
  }
  // Where a goal stands one horizon down, as one tag (reviewed design,
  // 2026-10-20): Month "This week", "This week · 2", or the day when its one
  // thing has one ("Thu"); Season "October", "October · 2"; Year "Fall · 3".
  // Nothing there, no tag.
  const weekEnd = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7)
  const belowFor = (node: PlanNode) => {
    const below = belowOf(node)
    if (!below.length) return undefined
    const word = level === 2 ? (thisWeek ? 'This week' : `Week of ${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
      : level === 1 ? monthWord : seasonWord
    const day = level === 2 && below.length === 1 ? below[0].scheduledFor : undefined
    const tag = day && day >= week && day < weekEnd ? day.toLocaleDateString('en-US', { weekday: 'short' })
      : below.length > 1 ? `${word} · ${below.length}` : word
    return { tag, titles: below.map((t) => t.title) }
  }

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

  // ---- A month goal's pieces (Scott, 2026-10-25) ----------------------------
  // "+ Piece" writes a smaller step under an October goal (a subtask, on
  // October); each piece triages like any row — This week, Done, Later ▾ —
  // and a date in the words puts it straight on that day. Each list keeps to
  // its own horizon: a piece sent to a week or given a day leaves October's
  // list and shows as its goal's tag ("This week · 2"), as on the week.
  const stepVerbs = (st: Task): RowVerb[] => {
    const toggle = async () => (await toggleTask(st.id)) !== false
    const onWeek = committedTo(st, 'week', week, { isCurrent: thisWeek }) !== undefined
    const [carry] = periodMoves(st, 'month', bounds, seasons, { updateTask, keepForward, dropCommitment }, activity.run, aboveOf(st, 'month', false, seasonWord, seasonB.start))
    return [
      ...(thisWeek && !onWeek && !st.scheduledFor ? [{ label: 'This week', run: () => act(`This week: “${st.title}”`, async () => !!(await keepForward(st.id, { weekStart: week })), { ids: [st.id], undo: restoreOf(st) }) }] : []),
      { label: 'Done', run: () => act(`Complete “${st.title}”`, toggle, { ids: [st.id], undo: toggle }) },
      { label: 'Later', run: async () => true, menu: [{ label: LATER_WORD.month, run: carry.onClick }, somedayOf(st)] },
      deleteOf(st),
    ].map(toRowVerb)
  }
  const addPiece = (parent: Task) => async (parse: HorizonParse, landing: HorizonLanding) => {
    const id = crypto.randomUUID()
    const people = parse.people
    const dated = landing.kind === 'day'
    const at = dated ? (parse.hasTime && parse.date ? parse.date : new Date(landing.date.getFullYear(), landing.date.getMonth(), landing.date.getDate())) : undefined
    const ok = await act(`Add a piece under “${parent.title}”`, async () => !!(await addTask(parse.title, parse.quick.contactId, parse.quick.projectId, at, {
      id, parentTaskId: parent.id, goalId: parent.goalId, context: parse.quick.context ?? parent.context,
      assignedTo: people[0] ?? meId ?? undefined, assignedToAll: people.length > 1 ? people : undefined, location: parse.location,
      ...(at ? { isAllDay: !parse.hasTime } : { bucket: 'month' as const, monthStart: monthB.start }),
    })), { ids: [id], undo: async () => { await deleteTask(id) } })
    if (ok) setComposer(null)
    return ok
  }
  const piecesOf = (node: PlanNode) => {
    if (level !== 2 || !node.task || !isOpen(node)) return undefined
    const onMonth = (st: Task) => !st.scheduledFor && committedTo(st, 'week', week, { isCurrent: thisWeek }) === undefined
    const steps = (node.task.subtasks ?? []).filter((st) => st.completed ? showDone : onMonth(st))
    const adding = composer?.kind === 'piece' && composer.key === node.key
    return <>
      {steps.length > 0 && <ul className="plan-pieces" aria-label={`Pieces of ${node.title}`}>
        {steps.map((st) => <PlanItemRow key={st.id} node={{ key: `piece:${st.id}`, id: st.id, title: st.title, level: 2, parent: node.key, task: st }}
          done={!!st.completed} saved={false} onOpen={() => selection?.setSelection({ kind: 'task', id: st.id })}
          quick={st.completed ? undefined : stepVerbs(st)} />)}
      </ul>}
      {adding
        ? <TypedAdd label={`Add a piece of “${node.title}”`} fieldLabel={`New piece of ${node.title}`}
          period={{ start: bounds.start, end: new Date(bounds.end.getTime() - 1) }} periodWord={periodWord}
          placeholder="e.g. Call the two therapists on the list by Friday"
          onSave={addPiece(node.task)} onCancel={() => setComposer(null)} />
        : <button type="button" className="canvas-link plan-piece-add" aria-label={`Add a piece of ${node.title}`} onClick={() => setComposer({ kind: 'piece', key: node.key })}>+ Piece</button>}
    </>
  }

  const renderItem = (node: PlanNode, order?: RowOrder) => {
    const scheduled = node.task?.scheduledFor
    const editing = composer?.kind === 'edit' && composer.key === node.key
    const parent = parentOf(node)
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
      parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
      below={belowFor(node)}
      linked={linked === node.key}
      done={isDone(node)} movedTo={movedLabel(node) ?? undefined} saved={savedKey === node.key}
      onOpen={onOpen} expanded={expanded === node.key} more={more} quick={quickFor(node)}
      editing={editing}
      onSaveEdit={async (text) => { const ok = await rename(node, text); if (ok) setComposer(null); return ok }}
      onCancelEdit={() => setComposer(null)}
      preview={preview.marks.get(node.id)}
      readiness={node.task ? readinessOf(node.task, prepLookup) : undefined}
      children={piecesOf(node)}
      meta={scheduled ? `Scheduled ${scheduled.toLocaleDateString()}${!node.task?.isAllDay ? ` · ${scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : null}
      {...order} />
  }

  // ---- Writing a goal: one quiet line, with an optional "For" -------------
  const aGoal = `${aOrAn(periodWord)} ${periodWord} goal`
  const adding = composer?.kind === 'add'
  const forParent = above.find((n) => n.key === forKey) ?? null
  const closeAdd = () => { setComposer(null); setForKey('') }
  // A date in the words puts it on that day (where the week and the day hold
  // it); without one it is a goal of this period, as before.
  const addTyped = async (parse: HorizonParse, landing: HorizonLanding) => {
    if (landing.kind === 'period') return addHere(parse.title)
    const id = crypto.randomUUID()
    const d = landing.date
    const at = parse.hasTime && parse.date ? parse.date : new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const people = parse.people
    const ok = await act(`Add “${parse.title}” to ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      async () => !!(await addTask(parse.title, parse.quick.contactId, parse.quick.projectId, at, {
        id, isAllDay: !parse.hasTime, assignedTo: people[0] ?? meId ?? undefined, assignedToAll: people.length > 1 ? people : undefined,
        location: parse.location, context: parse.quick.context ?? contextFor(forParent),
      })), { ids: [id], undo: async () => { await deleteTask(id) } })
    if (ok) closeAdd()
    return ok
  }
  const addHere = async (text: string) => {
    const id = crypto.randomUUID()
    const ok = await runCreate(level, text, forParent, `Add “${text}”${forParent ? ` for “${forParent.title}”` : ''}`, id)
    if (ok) { reveal.current = `${level}:${id}`; closeAdd() }
    return ok
  }
  const forPicker = level > 0 && above.length > 0 && <label className="plan-for">
    <span>For</span>
    <select value={forKey} onChange={(e) => setForKey(e.target.value)} aria-label={`For ${aOrAn(aboveWord)} ${aboveWord} goal (optional)`}>
      <option value="">Nothing above it</option>
      {above.map((n) => <option key={n.key} value={n.key}>{n.title}</option>)}
    </select>
  </label>

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
  const carryLines: ReviewLine[] = !planning ? [] : level === 0
    ? goalsOf(year - 1).filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open').map((g) => {
      const node: PlanNode = { key: `0:${g.id}`, id: g.id, title: g.name, level: 0, parent: null, goal: g }
      return { key: node.key, title: g.name, state: 'open' as const, verbs: [
        { label: String(year), run: () => carryGoal(node, year, `Bring “${g.name}” into ${year}`) },
        { label: 'Done', run: () => setGoalStatus(node, 'completed', `Complete “${g.name}”`) },
        { label: 'Let go', run: () => setGoalStatus(node, 'archived', `Let go of “${g.name}”`) },
      ] }
    })
    : (() => {
      const lvl = PERIODS[level] as 'season' | 'month'
      const prevCurrent = isCurrentPeriod(prevB, now)
      return selectPeriodTasks(visible, lvl, prevB.start, prevCurrent, lens.scopeId, seasons).flatMap((t): ReviewLine[] => {
        if (taskReviewState(t, lvl, prevB.start, { isCurrent: prevCurrent, seasons }) !== 'open') return []
        // The period's own moves, aimed from the one before: carry it here,
        // later, or off that period — Back to Fall, or Off September when
        // nothing above holds it (it was mislabeled "Let go").
        const above = aboveOf(t, lvl, lvl === 'month' ? !!t.sourceId : !!t.goalId, lvl === 'month' ? seasonWord : String(year), seasonB.start)
        const [carry, off] = periodMoves(t, lvl, prevB, seasons, { updateTask, keepForward, dropCommitment }, activity.run, above)
        const toggle = async () => (await toggleTask(t.id)) !== false
        const later = () => act(`Move “${t.title}” to ${nextWord}`, async () => !!(await keepForward(t.id, lvl === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next }, prevB.start)), { ids: [t.id], undo: restoreOf(t) })
        return [{ key: t.id, title: t.title, state: 'open', verbs: [
          { label: periodWord, run: carry.onClick },
          { label: 'Done', run: () => act(`Complete “${t.title}”`, toggle, { ids: [t.id], undo: toggle }) },
          { label: 'Later', run: async () => true, menu: [{ label: LATER_WORD[lvl], run: later }, somedayOf(t)] },
          { label: off.label, run: off.onClick },
        ] }]
      })
    })()
  // The card beside the list: a goal marked "in October" when this period has
  // an open line under it (the same children the plan flow reads).
  const planParents: PlanParent[] = above.map((n) => ({
    key: n.key, title: n.title,
    children: levelNodes.filter((c) => c.parent === n.key && isOpen(c)).map((c) => c.title),
    onAdd: (title: string) => runCreate(level, title, n, `Add “${title}” for “${n.title}”`),
  }))
  // ---- The strip on the left (Scott's wireframe, 2026-10-25) ----------------
  // The level above, to draw from: drag a goal onto a line to put the line
  // under it, onto the list (or "→ Oct") to write something new under it. On
  // Year it is last year's open goals, carried in by drag or "→ 2026".
  const shortWord = level === 2 ? monthWord.slice(0, 3) : periodWord
  const openAdd = (key: string) => { setForKey(key); setComposer({ kind: 'add' }) }
  const lastYearOpen = level === 0 ? goalsOf(year - 1).filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open') : []
  const lastYearNode = (g: (typeof lastYearOpen)[number]): PlanNode => ({ key: `0:${g.id}`, id: g.id, title: g.name, level: 0, parent: null, goal: g })
  const carryIn = (g: (typeof lastYearOpen)[number]) => { void carryGoal(lastYearNode(g), year, `Bring “${g.name}” into ${year}`) }
  const stripGoals: AboveGoal[] = level > 0
    ? planParents.map((p) => ({
      key: p.key, title: p.title, here: p.children.length > 0,
      meta: p.children.length ? `${p.children.length} on ${periodWord}` : `Nothing on ${periodWord}`,
      goLabel: `→ ${shortWord}`, goAria: `Add to ${periodWord} under ${p.title}`, onGo: () => openAdd(p.key),
    }))
    : lastYearOpen.map((g) => ({
      key: `0:${g.id}`, title: g.name, here: false, meta: `Open from ${year - 1}`,
      goLabel: `→ ${year}`, goAria: `Bring ${g.name} into ${year}`, onGo: () => carryIn(g),
    }))
  const listDrop = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!isAboveDrag(e.dataTransfer)) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'link'
      const row = level > 0 ? (e.target as Element).closest<HTMLElement>('[data-plan-key]') : null
      const key = row && levelNodes.some((n) => n.key === row.dataset.planKey && n.task) ? row.dataset.planKey! : ''
      if (linkOver !== key) setLinkOver(key)
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLinkOver(null) },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!isAboveDrag(e.dataTransfer)) return
      e.preventDefault(); e.stopPropagation()
      const from = e.dataTransfer.getData(ABOVE_MIME), over = linkOver
      setLinkOver(null)
      if (level === 0) { const g = lastYearOpen.find((x) => `0:${x.id}` === from); if (g) carryIn(g); return }
      const parent = above.find((n) => n.key === from)
      if (!parent) return
      const node = over ? levelNodes.find((n) => n.key === over) : undefined
      if (node) { if (node.parent !== parent.key) void moveUnder(node, parent); return }
      openAdd(parent.key)
    },
  }
  // ---- Planning: Choose from the level above (spec 2026-10-19) ---------------
  // The lines of the level above (Fall's for October, 2026's goals for Fall),
  // each with its steps and what each is planned for; then this period's lines
  // under no line, and what the period before left open. "{Period}" adds this
  // period to the same row, which keeps the one above; "Back to {above}" ends
  // this period's commitment and leaves the rest. Year has no level above.
  // Back to Fall: ends this period's commitment (from `from`) and leaves the
  // rest. A row the season never held is put on it first, so it lands under
  // its line. Choose's "Not in October" and the look back's "Back to Fall".
  const backToAbove = (t: Task, lvl: 'season' | 'month', from: Date) => act(`Back to ${aboveWord}: “${t.title}”`, async () => {
    if (lvl === 'month' && !openCommitment({ commitments: bootstrapCommitments(t) }, 'season') && !(await keepForward(t.id, { seasonStart: seasonB.start }))) return false
    return dropCommitment(t.id, lvl, from)
  }, { ids: [t.id], undo: restoreOf(t) })
  const choose = (() => {
    if (!planning) return null
    const lvl = PERIODS[level] as 'year' | 'season' | 'month'
    const startKey = lvl === 'month' ? 'monthStart' : 'seasonStart'
    const toggleOf = (t: Task) => async () => (await toggleTask(t.id)) !== false
    const done = (t: Task): ChooseVerb => ({ label: 'Done', quiet: true, role: 'done', run: () => act(`Complete “${t.title}”`, toggleOf(t), { ids: [t.id], undo: toggleOf(t) }) })
    const reopen = (t: Task): ChooseVerb => ({ label: 'Reopen', quiet: true, role: 'reopen', run: () => act(`Reopen “${t.title}”`, toggleOf(t), { ids: [t.id], undo: toggleOf(t) }) })
    const bringHere = (t: Task, from?: Date): ChooseVerb => ({
      label: periodWord[0].toUpperCase() + periodWord.slice(1), role: 'here',
      run: () => act(`${periodWord}: “${t.title}”`, async () => !!(await keepForward(t.id, { [startKey]: bounds.start }, from)), { ids: [t.id], undo: restoreOf(t) }),
    })
    const backUp = (t: Task, from: Date): ChooseVerb => ({
      label: `Back to ${aboveWord}`, quiet: true, role: 'back', run: () => backToAbove(t, lvl as 'season' | 'month', from),
    })
    // A smaller step under a step: this period's row, made for it.
    const addUnder = (parent: Task) => (title: string) => {
      const id = crypto.randomUUID()
      return act(`Add a step under “${parent.title}”`, async () => !!(await addTask(title, undefined, undefined, undefined, {
        id, bucket: lvl === 'month' ? 'month' : 'quarter', [startKey]: bounds.start,
        sourceId: parent.id, goalId: parent.goalId, context: parent.context,
      })), { ids: [id], undo: async () => { await deleteTask(id) } })
    }
    const stepVerbs = (n: { task: Task; planned: ChooseNode['planned'] }): ChooseVerb[] => {
      switch (n.planned.kind) {
        case 'done': return [reopen(n.task)]
        case 'above': return [bringHere(n.task), done(n.task), reopen(n.task)]
        case 'last': return [bringHere(n.task, prevB.start), backUp(n.task, prevB.start), done(n.task), reopen(n.task)]
        default: return [backUp(n.task, bounds.start), done(n.task), reopen(n.task)]
      }
    }
    const node = (n: ChooseNode): ChooseItemView => ({
      key: n.task.id, title: n.task.title, planned: n.planned, note: n.fromLast ? `From ${prevWord}, not done` : undefined,
      verbs: stepVerbs(n), children: n.children.map(node),
      onBreakDown: n.planned.kind === 'above' || n.planned.kind === 'last' ? addUnder(n.task) : undefined,
    })
    // Year goals are goals rows, not tasks: each stands in as a line whose
    // steps are the season items made for it.
    const goalLine = (g: NonNullable<PlanNode['goal']>): Task => ({
      id: g.id, title: g.name, completed: g.status === 'completed', createdAt: new Date(0), updatedAt: new Date(0), sortOrder: g.sortOrder ?? null,
      subtasks: visible.filter((t) => t.goalId === g.id && !t.sourceId && !t.goalTaskId && !t.parentTaskId),
    } as Task)
    const lineTasks: Task[] = level === 2 ? above.flatMap((n) => (n.task ? [n.task] : []))
      : level === 1 ? above.flatMap((n) => (n.goal ? [goalLine(n.goal)] : [])) : []
    const tree = lvl === 'year' ? null : buildChooseTree({
      lines: lineTasks, pool: visible, level: lvl, periodStart: bounds.start, prevStart: prevB.start, isCurrent: current,
      hereWord: periodWord, lastWord: prevWord, aboveWord, aboveStart: level === 2 ? seasonB.start : undefined,
    })
    const nodeOf = (id: string) => levelNodes.find((n) => n.id === id)
    const lineView = (l: ChooseLine): ChooseLineView => {
      const parentNode = above.find((n) => n.id === l.task.id) ?? null
      return {
        key: l.task.id, title: l.task.title, planned: l.planned, note: l.fromLast ? `from ${prevWord}` : undefined,
        counts: countsLine(l.counts, `in ${periodWord}`, aboveWord, prevWord),
        // A year goal is planned through its season items, never placed itself.
        verbs: level === 2 ? stepVerbs(l) : [], steps: l.steps.map(node),
        onAddStep: (title: string) => runCreate(level, title, parentNode, `Add “${title}” for “${l.task.title}”`),
      }
    }
    const looseView = (it: LooseItem): ChooseItemView => {
      const n = nodeOf(it.task.id)
      const verbs: ChooseVerb[] = n ? verbsFor(n).map((v) => ({ label: v.label, run: v.run, menu: v.menu, role: v.label === 'Done' ? 'done' as const : 'other' as const })) : [done(it.task)]
      return { key: it.task.id, title: it.task.title, planned: it.planned, verbs, children: [] }
    }
    // What the period before left open and the tree did not already hold.
    const placed = new Set<string>()
    for (const l of tree?.lines ?? []) {
      placed.add(l.task.id)
      const walk = (ns: ChooseNode[]) => { for (const x of ns) { placed.add(x.task.id); walk(x.children) } }
      walk(l.steps)
    }
    const carried: ChooseItemView[] = carryLines.filter((c) => !placed.has(c.key) && !placed.has(c.key.replace(/^0:/, ''))).map((c) => ({
      key: c.key, title: c.title, planned: { kind: 'last', label: prevWord }, note: `From ${prevWord}, not done`,
      verbs: c.verbs.map((v, i) => ({ label: v.label, run: v.run, menu: v.menu, role: i === 0 ? 'here' as const : v.label === 'Done' ? 'done' as const : 'other' as const })), children: [],
    }))
    const carriedIds = new Set(carried.map((c) => c.key))
    const hereLoose: ChooseItemView[] = tree
      ? tree.loose.filter((x) => x.source === 'here' && !carriedIds.has(x.task.id)).map(looseView)
      : openNodes.map((n) => ({ key: n.key, title: n.title, planned: { kind: 'here' as const, label: periodWord }, verbs: verbsFor(n).map((v) => ({ label: v.label, run: v.run, menu: v.menu, role: v.label === 'Done' ? 'done' as const : 'other' as const })), children: [] }))
    return {
      lines: (tree?.lines ?? []).map(lineView),
      doneLines: (tree?.doneLines ?? []).map(lineView),
      loose: [...carried, ...hereLoose],
      /** The period before's lines still open (Looking back's count). */
      carriedCount: carryLines.length,
    }
  })()
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
  // The look back's open lines, each with the level's calls. Month: carry
  // into this month, back to the season, drop (to Someday), or done. Season:
  // Carry into this season, Table (to Someday), Let go (off that season; a
  // year goal it was for stays on the year), or done. Year: Carry (the
  // strip's "→ 2026", a copy that remembers it), Someday, Let go (archived),
  // or done.
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
  // Brain dump: a year goal in a life area (its space the area's), or in none
  // (the space the page adds in).
  const addYearGoal = (title: string, areaId: string | null): Promise<boolean> => {
    const lifeArea = areaId ? lifeAreas.find((a) => a.id === areaId) : undefined
    const context = lifeArea ? lifeArea.context ?? 'personal' : contextFor(null)
    const id = crypto.randomUUID()
    return act(`Add “${title}” to ${year}`, async () => !!(await addGoal(areaId, title, context, { year, id, sortOrder: lastInYear(year) })),
      { ids: [id], undo: async () => { await deleteGoal(id) } })
  }
  // Share: a Work or Personal year goal moved to Family (who sees it follows
  // the space, as updateGoal derives it).
  const shareGoal = (node: PlanNode): Promise<boolean> => {
    const before = node.goal!.context ?? null
    return act(`Share “${node.title}” with the family`, () => updateGoal(node.id, { context: 'family' }),
      { ids: [node.id], undo: async () => (await updateGoal(node.id, { context: before })) !== false })
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
  // Let go of a season goal the season before left open: only that season's
  // commitment ends. The goal it was for is a goals row and stays on the year.
  const letGoOf = (t: Task) => act(`Let go: “${t.title}”`, () => dropCommitment(t.id, 'season', prevB.start), { ids: [t.id], undo: restoreOf(t) })
  const doneOf = (t: Task) => act(`Complete “${t.title}”`, toggleOf(t), { ids: [t.id], undo: toggleOf(t) })
  const lookBackBody = (t: PeriodSessionTools) => {
    if (!planning) return null
    const common = { prevLabel: prevWord, review: prevReview, draft: t.lookDraft, onDraft: t.setLookDraft, done: prevDone, outOf: prevAll, alsoDone: prevAlso }
    if (level === 0) {
      const open = goalsOf(year - 1).filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open')
        .map((g) => ({ id: g.id, title: g.name, node: { key: `0:${g.id}`, id: g.id, title: g.name, level: 0, parent: null, goal: g } as PlanNode }))
      return <PeriodLookBack {...common} open={open} labels={{ drop: 'Let go' }} verbs={{
        carry: (l) => carryGoal(l.node, year, `Bring “${l.title}” into ${year}`),
        table: (l) => goalToSomeday(l.node),
        drop: (l) => setGoalStatus(l.node, 'archived', `Let go of “${l.title}”`),
        done: (l) => setGoalStatus(l.node, 'completed', `Complete “${l.title}”`),
      }} />
    }
    const lvl = PERIODS[level] as 'season' | 'month'
    const open = prevTasks.filter((x) => taskReviewState(x, lvl, prevB.start, { isCurrent: isCurrentPeriod(prevB, now), seasons }) === 'open')
    const moves = (x: Task) => periodMoves(x, lvl, prevB, seasons, { updateTask, keepForward, dropCommitment }, activity.run,
      aboveOf(x, lvl, lvl === 'month' ? !!x.sourceId : !!x.goalId, lvl === 'month' ? seasonWord : String(year), seasonB.start))
    const carry = (x: Task) => moves(x)[0].onClick()
    return lvl === 'month'
      ? <PeriodLookBack {...common} open={open} upLabel={`Back to ${seasonWord}`}
          verbs={{ carry, up: (x) => backToAbove(x, 'month', prevB.start), drop: (x) => somedayOf(x).run(), done: doneOf }} />
      : <PeriodLookBack {...common} open={open} labels={{ table: 'Table', drop: 'Let go' }}
          verbs={{ carry, table: (x) => somedayOf(x).run(), drop: (x) => letGoOf(x), done: doneOf }} />
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
    if (ok) setMarkedKey(periodKey)
    return ok
  }
  // The level above's lines gathered by life area, as the page's own list is
  // (the No area group last; no headings when no area is in play).
  const aboveArea = (key: string) => { const n = above.find((x) => x.id === key); return n ? nodeArea(n) ?? '' : '' }
  const chooseGroups = (lines: ChooseLineView[]) => {
    if (!lifeAreas.length) return { lines, groupOf: undefined }
    const groups = groupByArea(lines.map((l) => ({ l, areaId: aboveArea(l.key) })), lifeAreas)
    if (groups.every((g) => g.area === null)) return { lines, groupOf: undefined }
    const head = new Map(groups.flatMap((g) => g.items.map((x) => [x.l.key, { key: g.area?.id ?? '', heading: g.area?.name ?? 'No area' }] as const)))
    return { lines: groups.flatMap((g) => g.items.map((x) => x.l)), groupOf: (l: ChooseLineView) => head.get(l.key)! }
  }
  // The choosing body: Choose from the level above, compact, every verb the
  // session's (a save marks the period planned).
  const chooseBody = (t: PeriodSessionTools) => {
    if (!choose) return null
    const grouped = chooseGroups(choose.lines.map((l) => reportLine(l, t.report)))
    return <div className="gw-body gw-choose">
      <ChoosePlan compact hereWord={periodWord} aboveWord={level > 0 ? aboveWord : undefined} kicker="" view="all" onViewChange={KEEP_VIEW}
        lines={grouped.lines} groupOf={grouped.groupOf} doneLines={choose.doneLines.map((l) => reportLine(l, t.report))}
        loose={choose.loose.map((x) => reportItem(x, t.report))}
        onAddLoose={t.report((title: string) => runCreate(level, title, null, `Add “${title}”`))} />
    </div>
  }
  // Season, choose from the year: each year goal with what the season holds
  // under it, and Someday. Bringing one in is a write, not choosing: only the
  // goals by area mark the season planned (the session checks the step).
  const fromYearBody = () => {
    if (!planning || level !== 1) return null
    const yearGoals = above.filter((n) => n.goal).map((n) => ({
      id: n.id, title: n.title, node: n, here: levelNodes.filter((c) => c.parent === n.key && isOpen(c)).map((c) => c.title),
    }))
    const someday = visible.filter((t) => t.bucket === 'someday' && !t.completed && !t.parentTaskId).map((t) => ({ id: t.id, title: t.title, task: t }))
    return <FromYear yearWord={String(year)} seasonWord={periodWord} goals={yearGoals} someday={someday}
      onPick={(g) => runCreate(1, g.title, g.node, `${periodWord}: “${g.title}”`)}
      onBring={({ task }) => {
        const before = { ...placementOf(task), commitments: liveCommitments({ commitments: bootstrapCommitments(task) }) }
        return act(`${periodWord}: “${task.title}”`, async () => !!(await keepForward(task.id, { seasonStart: bounds.start })),
          { ids: [task.id], undo: async () => (await updateTask(task.id, before)) !== false })
      }} />
  }
  // The season's goals, for the ideal week: its blocks name them (any goal
  // of the season), and a new block can be for an open one.
  const seasonGoals = level === 1 ? levelNodes.map((n) => ({ id: n.id, title: n.title })) : []
  const openSeasonGoals = level === 1 ? openNodes.map((n) => ({ id: n.id, title: n.title })) : []
  // The year's open goals, for the brain dump, refine and share steps.
  const yearOpen = level === 0 ? openNodes.filter((n) => n.goal) : []
  const sessionBodies = (t: PeriodSessionTools) => level === 2 ? {
    'fresh-start': <FreshStart monthWord={periodWord} value={t.notes.scenery} patch={t.patch} />,
    'look-back': lookBackBody(t),
    'read-season': choose && <ReadAbove aboveWord={seasonWord} lines={choose.lines} doneLines={choose.doneLines} />,
    'next-weeks': <NextWeeks start={planWeek} weeks={5} />,
    'by-area': chooseBody(t),
    'upkeep-fun': <UpkeepFun monthWord={periodWord} routines={stripRoutines}
      fun={openNodes.filter((n) => n.task?.isFun).map((n) => ({ id: n.id, title: n.title }))}
      onAddFun={(title) => runCreate(2, title, null, `Add “${title}” for fun`, undefined, { isFun: true })} />,
  } : level === 1 ? {
    'look-back': lookBackBody(t),
    'from-year': fromYearBody(),
    calendar: <SeasonCalendar date={bounds.start} seasons={seasons} />,
    energy: <SeasonEnergy value={t.notes.energy} patch={t.patch} />,
    'by-area': chooseBody(t),
    'ideal-week': <SeasonIdealWeek value={t.notes.idealWeek} goals={openSeasonGoals} patch={t.patch} />,
    'wild-cards': <SeasonWildCards value={t.notes.wildCards} patch={t.patch} />,
  } : {
    'look-back': lookBackBody(t),
    vision: <YearVision yearWord={periodWord} value={t.notes.vision} patch={t.patch} />,
    landscape: <YearLandscape value={t.notes.landscape} patch={t.patch} />,
    areas: <div className="gw-body"><AreasEditor areas={lifeAreas} onAdd={addArea} onRename={renameArea} onSetContext={setAreaContext} onRemove={removeArea} /></div>,
    // The choosing step: every add goes through the session's report, so
    // the first that saves marks the year planned.
    'brain-dump': <BrainDump yearWord={periodWord}
      // An area shows under the space filter, as the page's goals do, or
      // when a goal on the list is in it: a goal never falls to "No area"
      // while its area is one the viewer can see.
      areas={lifeAreas.filter((a) => matchesLayers(a.context ?? 'personal', layers) || yearOpen.some((n) => n.goal!.areaId === a.id)).map((a) => ({ id: a.id, name: a.name }))}
      goals={yearOpen.map((n) => ({ id: n.id, title: n.title, areaId: n.goal!.areaId || null }))}
      onAdd={t.report(addYearGoal)} />,
    // Keep both is kept in the year's notes, so a pair set aside stays so.
    refine: <YearRefine goals={yearOpen.map((n) => ({ id: n.id, title: n.title, node: n }))} value={t.notes.keptPairs} patch={t.patch}
      onLetGo={(g) => setGoalStatus(g.node, 'archived', `Let go of “${g.title}”`)} onSomeday={(g) => goalToSomeday(g.node)} />,
    'share-book': <ShareBook seasonWord={nextSeasonWord} onShare={(g) => shareGoal(g.node)} onBook={bookSeason}
      goals={yearOpen.flatMap((n) => {
        const g = n.goal!
        // Scott's own: a partner's goal is theirs to share. A goal just
        // added has no owner on it yet, and is his.
        if ((g.context !== 'work' && g.context !== 'personal') || (g.userId && g.userId !== user?.id)) return []
        return [{ id: n.id, title: n.title, context: g.context, node: n }]
      })} />,
  }

  // ---- The header (calm pass, 2026-10-18) ------------------------------------
  // One button at most, and only the one that's due (reviewed design,
  // 2026-10-20), the same rule on every horizon. Not planned yet: "Plan
  // October", which opens on Looking back at September — so a review missed
  // in September's last days is never lost. Planned, under way: no button.
  // The last days (REVIEW_WINDOW_DAYS: a month's last 3, a season's or year's
  // last 7) and after, until reviewed: "Review October", the same walk —
  // Looking back at October, then plan November. Reviewed: no button. Year is
  // reference: "Plan 2027" is due only in its planning window (talkFor, Jan
  // 1–14). Everything not due waits in ⋯ — planning again, planning the next
  // period early, a review never done; nothing while a flow is open.
  type Offer = { id: string; label: string; due: boolean; run: () => void }
  const inFlow = reviewing || planning
  // Held until the reviews and the plan records have loaded, so the button
  // doesn't flicker from one offer to another.
  const settled = !review.loading && !prevReview.loading && !planSession.loading && !nextPlanSession.loading
  // A record that failed to load reads as unplanned, so planning stays offered.
  const thisPlanned = !planSession.error && !!planSession.saved
  const nextPlanned = !nextPlanSession.error && !!nextPlanSession.saved
  const yearWindow = level === 0 && !!talk && localYmd(talk.start) === localYmd(bounds.start)
  const offers: Offer[] = inFlow || !settled ? [] : [
    ...(target === 'this' && !review.error && !review.reviewed
      ? [{ id: 'review', label: `Review ${periodWord}`, due: true, run: () => setReviewing(true) }] : []),
    ...(target === 'previous' && !prevReview.error && !prevReview.reviewed
      ? [{ id: 'review', label: `Review ${prevWord}`, due: false, run: () => setReviewing(true, bounds.prev) }] : []),
    ...(plannable ? [{
      id: 'plan', label: thisPlanned ? `Plan ${periodWord} again` : `Plan ${periodWord}`,
      due: !thisPlanned && target !== 'this' && (level !== 0 || yearWindow), run: () => setMode('plan'),
    }] : []),
    ...(!nextPlanned ? [{ id: 'plan-next', label: target === 'this' ? `Plan ${nextWord}` : `Plan ${nextWord} early`, due: false, run: () => setMode('plan', bounds.next) }] : []),
  ]
  const primary = offers.find((o) => o.due) ?? null
  // One quiet fact line, one count on every horizon (reviewed design): done
  // out of everything that was on the period — done, moved on or still open —
  // as Looking back counts it: Month "28 of 46 done", Season "Sep 22 – Dec 20
  // · 4 of 21 done", Year "1 of 5 goals done"; a bar; then when it was planned.
  const onPeriod = levelNodes.length
  const doneWord = level === 0 ? `${onPeriod === 1 ? 'goal' : 'goals'} done` : 'done'
  const countText = `${doneNodes.length} of ${onPeriod} ${doneWord}`
  const plannedOn = !planSession.loading && !planSession.error && planSession.saved
    ? `planned ${planSession.saved.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null
  const facts = !inFlow && dataReady && !error && !goalsError
    ? <p className="wk-facts plan-facts" data-explain="period-facts" data-explain-label={`${periodWord} at a glance`}>
      {level === 1 && <>{periodRange(bounds.start, bounds.end)}{(onPeriod > 0 || plannedOn) && ' · '}</>}
      {onPeriod > 0 && <>
        <span className="wk-facts-count"><b>{doneNodes.length}</b> of {onPeriod} {doneWord}</span>
        <span className="wk-facts-bar" role="img" aria-label={countText}><span style={{ width: `${Math.round(doneNodes.length / onPeriod * 1000) / 10}%` }} /></span>
      </>}
      {plannedOn && <>{onPeriod > 0 && ' · '}<b className="wk-facts-reviewed">{plannedOn}</b></>}
    </p>
    : null
  const menuChoices: PageMenuChoice[] = [
    ...(dataReady ? offers.filter((o) => o !== primary).map((o) => ({ id: o.id, label: o.label, onSelect: o.run })) : []),
    ...(!current ? [{ id: 'back', label: `Back to this ${PERIODS[level]}`, onSelect: () => setStart(null) }] : []),
    ...(inFlow ? [] : [
      { id: 'done', label: 'Show done', checked: showDone, onSelect: () => prefs.set('done', !showDone) },
      { id: 'intro', label: 'Start with a goal · guided introduction', onSelect: () => navigate('/getting-started?journey=goals') },
    ]),
  ]
  const help = shellHelp ?? (() => openAssistant({ message: EXPLAIN_MESSAGE, autoSend: true, stayOnPage: true }))
  const menuLabel = `${PERIODS[level][0].toUpperCase()}${PERIODS[level].slice(1)} options`

  // The period's list: the page itself, beside the strip every day and beside
  // the steps rail while planning.
  const pageBody = (
    <div className={`hs-main plan-horizon-body${preview.next.length ? ' has-next' : ''}`}>
    <section className={`plan-list plan-card${linkOver === '' ? ' is-link-over' : ''}`} {...listDrop} data-explain="list" data-explain-label={`Every ${periodWord} goal`}>
      <PlanOrderList key={`${level}:${localYmd(bounds.start)}`} label={`${periodWord} goals`} items={items} headingOf={headingOf} groupOf={groupOf}
        keyOf={(n) => n.key} titleOf={(n) => n.title}
        // Only an open line orders; done and moved-on lines keep their place.
        orderIdOf={(n) => isOpen(n) ? n.id : null}
        pinnedOf={(n) => n.key === savedKey || preview.marks.has(n.id)}
        renderRow={renderItem} onReorder={reorderLine}
        tail={<>
          {preview.here.map(previewRow)}
          {proposals.map((p) => {
            const parent = level > 0 ? allNodes.find((n) => n.level === level - 1 && n.id === p.parentId) : undefined
            return <ProposalRow key={p.key} proposal={p} parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
              onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />
          })}
        </>} />
      {openNodes.length === 0 && preview.here.length === 0 && proposals.length === 0 && !adding && <p className="plan-empty">Nothing{folded.length ? ' open' : ''} for {periodWord} yet.</p>}
      {folded.length > 0 && <button type="button" className="plan-done-fold" aria-expanded={showDone} onClick={() => prefs.set('done', !showDone)}>
        <span className="plan-done-fold-text">{doneLine}</span>
        <span className="canvas-link plan-done-fold-go">{showDone ? 'Hide' : 'Show'}</span>
      </button>}
      {adding && <TypedAdd label={forParent ? `Add to ${periodWord}, under “${forParent.title}”` : `Add to ${periodWord}`}
        fieldLabel={`New ${periodWord} goal`}
        period={{ start: bounds.start, end: new Date(bounds.end.getTime() - 1) }} periodWord={periodWord}
        placeholder={`Say it how you’d say it, e.g. ${level === 2 ? 'Find a therapist for K' : level === 1 ? 'Get the yard ready for spring' : 'A real local circle of friends'}`}
        // A goal for something above takes its life area from it.
        extra={<>{forPicker}{!forParent && area.picker}</>}
        onSave={addTyped} onCancel={closeAdd} />}
      <footer className="plan-list-foot">
        {!adding && <button type="button" className="canvas-link plan-add" aria-label={`Add ${aGoal}`} disabled={!dataReady}
          onClick={() => setComposer({ kind: 'add' })}>+ Add to {periodWord}</button>}
        {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all</button>}
        {openNodes.length > 0 && <Link to={onward.to} className="plan-next" data-explain="next" data-explain-label={onward.label.replace(' →', '')}>{onward.label}</Link>}
      </footer>
    </section>
    {/* The season's ideal week, made in its session (read-only here). */}
    {level === 1 && !planning && !!seasonNotes.notes.idealWeek?.blocks.length && <div className="plan-card plan-ideal-week">
      <IdealWeekSection value={seasonNotes.notes.idealWeek} goals={seasonGoals} />
    </div>}
    {/* The year's vision and landscape, made in its session (read-only here). */}
    {level === 0 && !planning && hasVision(yearNotes.notes.vision) && <div className="plan-card plan-year-vision">
      <YearVisionSection value={yearNotes.notes.vision} yearWord={periodWord} editTo={editStep('vision')} />
    </div>}
    {level === 0 && !planning && hasLandscape(yearNotes.notes.landscape) && <div className="plan-card plan-year-landscape">
      <YearLandscapeSection value={yearNotes.notes.landscape} editTo={editStep('landscape')} />
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
          <h1>{periodTitle}</h1>
          <button type="button" className="plan-step" onClick={() => setStart(bounds.next)} aria-label={`Next ${PERIODS[level]}`}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        {/* The review and the plan say where the period stands in their own
            words: the fact line steps aside while one is open. */}
        {facts}
      </div>
      <div className="plan-head-tools">
        {primary && <button type="button" className="pv2-btn wk-plan plan-primary" disabled={!dataReady} onClick={primary.run}
          data-explain="plan-primary" data-explain-label={primary.label}>{primary.label}</button>}
        {/* Without the docked bar (phones), ⋯ offers the talk that is due. */}
        <PageHelpContext.Provider value={help}>
          <PageMenu label={menuLabel} choices={menuChoices}
            talk={walkInBar || !dueTalk ? undefined : () => openAssistant({ message: dueTalk.message, autoSend: true })} />
        </PageHelpContext.Provider>
      </div>
    </header>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : !dataReady ? null
      // Reviewing a period is the first card of planning the one after it
      // (spec 2026-10-19): Review October opens Plan November on Looking back.
      : reviewing ? <Navigate replace to={`${pathname}?${(() => { const q = new URLSearchParams(params); q.delete('review'); q.delete('focus'); q.set('plan', '1'); q.set('step', 'look-back'); q.set('start', localYmd(bounds.next)); return q.toString() })()}`} />
      // Planning: the guided session on this page, the rail where the strip
      // stands and the period's list beside it.
      : planning ? <GuidedPeriod key={periodKey} level={PERIODS[level]} token={sessionToken} periodLabel={periodWord}
          page={pageBody} bodies={sessionBodies} onFinish={closePeriod} onLeave={() => setMode(null)}
          onPlanned={() => planSession.reload()} listenPageWrites={listenPageWrites}
          plannedAt={!planSession.error ? planSession.saved?.at : undefined}
          aboveLines={above.map((n) => ({ id: n.id, title: n.title }))}
          areas={lifeAreas.map((x) => ({ id: x.id, name: x.name, context: x.context }))} />
      : <>
        {/* Just planned here: the way on is the next horizon down. */}
        {justMarked && <div className="pv2-saved plan-planned-next" role="note">
          <span className="pv2-saved-text"><b>{periodWord[0].toUpperCase() + periodWord.slice(1)} is planned.</b></span>
          <button type="button" className="pv2-btn wk-plan" onClick={planNext.onClick}>{planNext.label}</button>
        </div>}
        <div className="hs-layout plan-with-strip">
        <AboveStrip key={`${level}:${localYmd(bounds.start)}`} id={PERIODS[level]}
          aboveLabel={level === 2 ? seasonWord : level === 1 ? String(year) : String(year - 1)}
          goals={stripGoals}
          empty={level === 0 ? `Nothing left open from ${year - 1}.` : level === 2 ? `No ${seasonWord} goals yet.` : `No ${year} goals yet.`}
          hint={level === 0 ? `Drag one onto ${year}, or press → ${year}.` : `Drag one onto ${aOrAn(periodWord)} ${periodWord} goal to put it under, or onto the list to add under it.`}
          addLabel={level > 0 ? `+ Add ${aOrAn(aboveWord)} ${aboveWord} goal` : undefined}
          onAddGoal={level > 0 ? (t) => runCreate(level - 1, t, null, `Add “${t}” to ${aboveWord}`) : undefined}
          routines={stripRoutines}
          routinesEmpty={level === 2 ? 'No monthly routines.' : 'No yearly routines yet.'}
          routinesNote={level === 2 ? 'Weekly routines are on the Week; every-day ones on Today.' : 'Monthly routines are on each month.'} />
        {pageBody}
        </div>
      </>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
