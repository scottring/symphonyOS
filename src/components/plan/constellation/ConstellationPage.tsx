// src/components/plan/constellation/ConstellationPage.tsx
//
// Year, Season and Month: one page shape for each (mockup approved
// 2026-10-13, after the Week redesign). The period's goals are one plain list,
// drawn one way; the level above folds into one line that opens in place, the
// way Week's "Still to place" does. The top bar names the horizon (Today ·
// Week · Month · Season · Year), so the page carries no horizon tabs of its own.
//
// Levels connect by looking, not linking (Scott, 2026-07-08 and 2026-10-13):
// a link is made while writing (an optional "For" pick) or from the goal's
// panel. A linked goal says what it is for and what is already under it one
// horizon down; an unlinked goal says nothing.
//
// Talk-first (spec 2026-10-14, "The pages"): a list to look at, with a few
// quick triage verbs on each open row (Scott, 2026-10-16): Done · Move to
// {next} · Someday · Remove from {period} on a month or season goal, Done ·
// Archive on a year goal. Tapping a month or season goal opens its task panel
// (which holds every verb — horizonPanel.tsx), and a year goal opens in place
// with Done and Archive. Done goals fold into one line. The bar's walk becomes
// "Plan November" while that talk is due (planSchedule.ts), and a pending
// change card is drawn dashed on the list (planPreview.ts).
//
// The header, calm pass (Scott approved the mockup 2026-10-18, as on Week):
// "‹ October 2026 ›", one quiet fact line, one primary button that changes
// with the moment (the review that is due, else planning the period), and a
// ⋯ menu (PageMenu) for everything else.
//
// URL: `horizon` (0 Year, 1 Season, 2 Month; 3 hands over to Week), `start`
// (any date in the period) and `focus` (an item a conversation just saved).
// Every manual write goes through the canvas activity, so it reports saving /
// saved / didn't save, with Undo when the previous fields can be restored.

import { PageHelpContext, usePageHelp } from '@/components/explain/PageHelp'
import { PageMenu, type PageMenuChoice } from '@/components/plan/PageMenu'
import { usePlanPagePrefs } from '@/hooks/usePlanPagePrefs'
import { useEffect, useRef, useState } from 'react'
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
import { PlanItemRow } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { readinessOf, type ReadinessLookup } from '@/lib/prep/readiness'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { periodMoves } from './horizonPanel'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EXPLAIN_MESSAGE } from '@/lib/explain/pageGuides'
import { useAuth } from '@/hooks/useAuth'
import { monthToken, usePlanningSession, yearToken, type SessionHorizon } from '@/hooks/usePlanningSession'
import { showToast } from '@/hooks/useToast'
import { usePeriodReview } from '@/hooks/usePeriodReview'
import { seasonToken } from '@/lib/cadence/seasons'
import { REVIEW_WINDOW_DAYS, movedOn, reviewTarget, taskReviewState, weekPhrase, yearGoalReviewState } from '@/lib/planning/periodReview'
import { PeriodReview, type ReviewLine, type ReviewVerb } from '@/components/plan/review/PeriodReview'
import { PeriodPlan, type PlanParent } from '@/components/plan/review/PeriodPlan'

const TERMS = ['year goal', 'season goal', 'month goal', 'week task'] as const
const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const SESSION_HORIZONS: readonly SessionHorizon[] = ['annual', 'seasonal', 'monthly']
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
/** "an October goal", "a Fall goal". */
const aOrAn = (word: string) => /^[aeiou8]/i.test(word) ? 'an' : 'a'

type Composer = { kind: 'add' } | { kind: 'edit'; key: string }

function Inner() {
  const selection = useSelectionOptional()
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, deleteGoal } = useGoalsContext()
  const { tasks, loading, error, addTask, updateTask, refetch, deleteTask, toggleTask, pushTask, setBucket, updateTasksBulk, keepForward, dropCommitment } = useSupabaseTasks()
  // Someday asks for a domain first on an Unsorted item, as every triage does.
  const gated = useGatedTaskActions({ updateTask, pushTask, setBucket, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const activity = useCanvasActivity()
  const { openAssistant } = useAssistantLauncher()
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember, members } = useFamilyMembers(), { seasons } = useHouseholdSeasons()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const area = useAddArea()
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
  const week = weekStartAnchor(anchor, weekStartsOn)
  const now = new Date()
  const thisWeek = localYmd(week) === localYmd(weekStartAnchor(now, weekStartsOn))
  const periodTitle = bounds.label
  const current = isCurrentPeriod(bounds, now)
  const year = anchor.getFullYear()
  const periodWord = level === 0 ? String(year) : periodWordOf(bounds)
  const seasonWord = periodWordOf(seasonB), monthWord = periodWordOf(monthB)
  // The review by hand of the period on screen (PeriodReview): open with ?review=1.
  const reviewing = params.get('review') === '1'
  // Planning by hand (PeriodPlan): open with ?plan=1, on a period not yet over.
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
  // reads it. The plan flow (PeriodPlan) says it; the header shows when.
  const planSession = usePlanningSession(SESSION_HORIZONS[level], sessionToken)
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
  // The optional "For" pick while writing a new goal (a node key, or none).
  const [forKey, setForKey] = useState('')
  const aboveOpen = !prefs.hideAbove
  const toggleAbove = () => prefs.set('hideAbove', aboveOpen)
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

  // ---- Writes ---------------------------------------------------------------
  type Opts = { ids?: string[]; undo?: () => Promise<boolean | void>; retry?: () => void }
  const act = (label: string, command: () => Promise<unknown>, opts?: Opts) =>
    activity.run(label, async () => {
      const result = await command()
      if (result === false) return false
      void refetch()
      return true
    }, opts)

  const contextFor = (parent: PlanNode | null): TaskContext | undefined =>
    (parent ? (parent.goal ? parent.goal.context : parent.task?.context) : area.area) ?? undefined

  /** The one create path: period and lineage in a single insert. */
  const createItem = async (lvl: number, title: string, parent: PlanNode | null, id: string, context: TaskContext | undefined): Promise<boolean> => {
    if (lvl === 0) return !!await addGoal(null, title, context, { year, id })
    return !!await addTask(title, undefined, undefined, undefined, {
      id,
      bucket: lvl === 1 ? 'quarter' : lvl === 2 ? 'month' : 'week',
      ...(lvl === 1 ? { seasonStart: seasonB.start } : lvl === 2 ? { monthStart: monthB.start } : { weekStart: week }),
      context,
      ...(parent ? lvl === 1 ? { goalId: parent.id } : { sourceId: parent.id, goalId: parent.task?.goalId } : {}),
    })
  }
  const runCreate = (lvl: number, title: string, parent: PlanNode | null, label: string, id: string = crypto.randomUUID()): Promise<boolean> => {
    const context = contextFor(parent)
    const attempt = (): Promise<boolean> => act(label, () => createItem(lvl, title, parent, id, context), {
      ids: [id],
      undo: async () => { if (lvl === 0) await deleteGoal(id); else await deleteTask(id) },
      retry: () => { void attempt() },
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
      if (ok && parent) setLinked(node.key)
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
      id, year: to, carriedFrom: g.id, notes: g.notes ?? null, strategy: g.strategy ?? null,
      ...(g.assignedToAll ? { assignedToAll: g.assignedToAll } : {}),
    }).then((made) => !!made), { ids: [id], undo: async () => { await deleteGoal(id) } })
  }

  // Quick triage on an open row (Scott, 2026-10-13, again 2026-10-16). A year
  // goal is a goals row: Done or Archive (Archive is its let-go; nothing is
  // deleted). A month or season goal is a task committed to this period: Done,
  // Move to the next period, Someday, or Remove from this one. The row is on
  // this page's list by construction, so Move and Remove need no other check.
  // The same verbs answer each open line in the review by hand (PeriodReview),
  // where a year goal can also move on to next year.
  const verbsFor = (node: PlanNode, opts: { carryYear?: boolean } = {}): ReviewVerb[] => {
    if (isDone(node) || movedLabel(node)) return []
    if (!node.task) return [
      { label: 'Done', run: () => setGoalStatus(node, 'completed', `Complete “${node.title}”`) },
      ...(opts.carryYear ? [{ label: `Move to ${year + 1}`, run: () => carryGoal(node) }] : []),
      { label: 'Archive', run: () => setGoalStatus(node, 'archived', `Archive “${node.title}”`) },
    ]
    const task = node.task
    const toggle = async () => (await toggleTask(task.id)) !== false
    const [carry, remove] = periodMoves(task, PERIODS[level] as 'season' | 'month', bounds, seasons, { updateTask, keepForward, dropCommitment }, activity.run)
    return [
      { label: 'Done', run: () => act(`Complete “${node.title}”`, toggle, { ids: [node.id], undo: toggle }) },
      { label: carry.label, run: carry.onClick },
      { label: 'Someday', run: () => act(`${describeTriageWhen('someday')}: “${node.title}”`, () => applyTriageWhen('someday', task.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! }), { ids: [node.id] }) },
      { label: remove.label, run: remove.onClick },
    ]
  }
  const quickFor = (node: PlanNode): { label: string; onSelect: () => void }[] =>
    verbsFor(node).map((v) => ({ label: v.label, onSelect: () => { void v.run() } }))

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

  const term = TERMS[level]
  const parentTerm = level > 0 ? TERMS[level - 1] : null
  // On schedule (planSchedule.ts): while this horizon's talk is due — its
  // window is open, the coming list is empty, it isn't put off — the walk is
  // that talk ("Plan November"), on this period's page or the coming one's.
  const talk = talkFor(PERIODS[level], now, seasons)
  const talkDue = !!talk && dataReady && (current || localYmd(bounds.start) === localYmd(talk.start))
    && listIsEmpty(talk, { tasks, goals, meId, seasons, today: now }) && !isPutOff(talk, now, readDismissals())
  // The plan holds their ideas: the walk asks and structures, never supplies
  // (Scott, 2026-10-11 — "pushy in terms of its own ideas").
  const walkLabel = talk && talkDue ? talk.label : current ? `Plan this ${PERIODS[level]} with me` : `Plan ${periodTitle} with me`
  const walkMessage = talk && talkDue ? talk.message : level === 0
    ? `Let's plan ${periodTitle}, one year goal at a time. Ask me what I want; use my words and don't suggest goals of your own.`
    : `Let's plan ${periodTitle} across my ${parentTerm}s, one at a time. Ask me what I want under each; use my words and don't suggest ${term}s of your own.`
  // The walk rides in the docked bar where there is one (desktop).
  const walkInBar = useConversationWalk(requested === 3 ? null : { label: walkLabel, message: walkMessage })

  if (requested === 3) return <Navigate replace to={`/week?view=alongside&date=${localYmd(anchor)}&start=${localYmd(week)}`} />

  // Readiness reads only rows this reader already has, under the same filters.
  const visibleById = new Map(visible.map((t) => [t.id, t]))
  const goalsById = new Map(allNodes.filter((n) => n.goal).map((n) => [n.id, n.goal!]))
  const prepLookup: ReadinessLookup = { task: (id) => visibleById.get(id), goal: (id) => goalsById.get(id) }

  // ---- The level above, folded into one line ------------------------------
  const above = level > 0 ? allNodes.filter((n) => n.level === level - 1 && isOpen(n)) : []
  const aboveTitles = level > 0 ? above.map((n) => n.title) : goalsOf(year - 1).filter((g) => g.status !== 'completed').map((g) => g.name)
  const aboveWord = level === 2 ? seasonWord : String(year)
  // The toggle names the list it opens ("Show Fall list"), and once open it
  // sits on the list itself (Scott, 2026-10-16).
  const aboveListWord = level === 2 ? seasonWord : level === 1 ? String(year) : String(year - 1)
  const showAbove = `Show ${aboveListWord} list`, hideAbove = `Hide ${aboveListWord} list`
  const aboveTitle = level === 2 ? `${seasonWord} goals` : level === 1 ? `${year} goals` : `${year - 1} goals`
  const aboveWhat = level === 2 ? `the season ${periodWord} serves` : level === 1 ? `the year ${periodWord} serves` : 'last year, for reference'
  const aboveNone = level === 2 ? `No ${seasonWord} goals yet.` : level === 1 ? `No ${year} goals yet.` : `Nothing was written for ${year - 1}.`

  // ---- The period's goals: open first, done folded into one line -----------
  const levelNodes = allNodes.filter((n) => n.level === level)
  const openNodes = levelNodes.filter(isOpen)
  const doneNodes = levelNodes.filter(isDone)
  const movedNodes = levelNodes.filter((n) => !isDone(n) && !!movedLabel(n))
  const items = showDone ? [...openNodes, ...movedNodes, ...doneNodes] : openNodes
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
  // What is already under a goal one horizon down, by name — never a count.
  const belowLabel = level === 2 ? (thisWeek ? 'This week' : `Week of ${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    : level === 1 ? monthWord : seasonWord
  const belowOf = (node: PlanNode) => allNodes.filter((n) => n.parent === node.key && n.level === level + 1 && isOpen(n)).map((n) => n.title)

  // ---- The review by hand (Scott, 2026-10-17) ---------------------------------
  const setMode = (mode: 'review' | 'plan' | null, start?: Date) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    p.delete('review'); p.delete('plan')
    if (mode) p.set(mode, '1')
    if (start) p.set('start', localYmd(start))
    p.delete('focus')
    return p
  })
  const setReviewing = (on: boolean, start?: Date) => setMode(on ? 'review' : null, start)
  const nextYearGoals = level === 0 ? goals.filter((g) => g.year === year + 1) : []
  const reviewLines: ReviewLine[] = levelNodes.flatMap((n) => {
    const state = n.goal ? yearGoalReviewState(n.goal, nextYearGoals)
      : n.task ? taskReviewState(n.task, PERIODS[level] as 'season' | 'month', bounds.start, { isCurrent: current, seasons }) : undefined
    if (!state) return []
    const parent = parentOf(n)
    return [{ key: n.key, title: n.title, state, note: parent ? `For ${parent.title}` : undefined, verbs: state === 'open' ? verbsFor(n, { carryYear: true }) : [] }]
  })
  const byWhom = (authorId: string) => authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === authorId)?.name ?? 'your household'

  const renderItem = (node: PlanNode) => {
    const scheduled = node.task?.scheduledFor
    const editing = composer?.kind === 'edit' && composer.key === node.key
    const parent = parentOf(node)
    const status = node.goal?.status ?? 'active'
    // A year goal opens in place with Done (or Reopen), Archive and its wording.
    const more = node.goal ? [
      status === 'completed'
        ? { label: 'Reopen', onSelect: () => setGoalStatus(node, 'active', `Reopen “${node.title}”`) }
        : { label: 'Done', onSelect: () => setGoalStatus(node, 'completed', `Complete “${node.title}”`) },
      { label: 'Archive', onSelect: () => setGoalStatus(node, 'archived', `Archive “${node.title}”`) },
      { label: 'Edit wording', onSelect: () => setComposer({ kind: 'edit', key: node.key }) },
    ] : undefined
    // A month or season goal is a task: its panel holds every verb.
    const onOpen = node.goal
      ? () => setExpanded((k) => k === node.key ? null : node.key)
      : () => selection?.setSelection({ kind: 'task', id: node.id })
    return <PlanItemRow key={node.key} node={node}
      parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
      below={{ label: belowLabel, titles: belowOf(node) }}
      linked={linked === node.key}
      done={isDone(node)} movedTo={movedLabel(node) ?? undefined} saved={savedKey === node.key}
      onOpen={onOpen} expanded={expanded === node.key} more={more} quick={quickFor(node)}
      editing={editing}
      onSaveEdit={async (text) => { const ok = await rename(node, text); if (ok) setComposer(null); return ok }}
      onCancelEdit={() => setComposer(null)}
      preview={preview.marks.get(node.id)}
      readiness={node.task ? readinessOf(node.task, prepLookup) : undefined}
      meta={scheduled ? `Scheduled ${scheduled.toLocaleDateString()}${!node.task?.isAllDay ? ` · ${scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : null} />
  }

  // ---- Writing a goal: one quiet line, with an optional "For" -------------
  const aGoal = `${aOrAn(periodWord)} ${periodWord} goal`
  const adding = composer?.kind === 'add'
  const forParent = above.find((n) => n.key === forKey) ?? null
  const closeAdd = () => { setComposer(null); setForKey('') }
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
    ? { to: `/week?view=alongside&date=${localYmd(anchor)}`, label: thisWeek ? 'Go to this week →' : 'Go to that week →' }
    : level === 1
      ? { to: `/month?view=constellation&horizon=2${keepStart}`, label: `Go to ${monthWord} →` }
      : { to: `/season?view=constellation&horizon=1${keepStart}`, label: `Go to ${seasonWord} →` }

  // ---- Planning by hand (PeriodPlan, Scott 2026-10-17) -------------------------
  // The talk's steps without the talk: what the period before left open, what
  // this one does for each goal above, anything else — then "I'm happy with".
  const prevB = periodBounds(PERIODS[level], bounds.prev, seasons)
  const prevWord = level === 0 ? String(year - 1) : periodWordOf(prevB)
  const thisYearGoals = level === 0 ? goals.filter((g) => g.year === year) : []
  const carryLines: ReviewLine[] = !planning ? [] : level === 0
    ? goalsOf(year - 1).filter((g) => yearGoalReviewState(g, thisYearGoals) === 'open').map((g) => {
      const node: PlanNode = { key: `0:${g.id}`, id: g.id, title: g.name, level: 0, parent: null, goal: g }
      return { key: node.key, title: g.name, state: 'open' as const, verbs: [
        { label: `Bring into ${year}`, run: () => carryGoal(node, year, `Bring “${g.name}” into ${year}`) },
        { label: 'Done', run: () => setGoalStatus(node, 'completed', `Complete “${g.name}”`) },
        { label: 'Let go', run: () => setGoalStatus(node, 'archived', `Archive “${g.name}”`) },
      ] }
    })
    : (() => {
      const lvl = PERIODS[level] as 'season' | 'month'
      const prevCurrent = isCurrentPeriod(prevB, now)
      return selectPeriodTasks(visible, lvl, prevB.start, prevCurrent, lens.scopeId, seasons).flatMap((t): ReviewLine[] => {
        if (taskReviewState(t, lvl, prevB.start, { isCurrent: prevCurrent, seasons }) !== 'open') return []
        // The period's own moves, aimed from the one before: carry it here, or drop it there.
        const [carry, remove] = periodMoves(t, lvl, prevB, seasons, { updateTask, keepForward, dropCommitment }, activity.run)
        const toggle = async () => (await toggleTask(t.id)) !== false
        return [{ key: t.id, title: t.title, state: 'open', verbs: [
          { label: `Bring into ${periodWord}`, run: carry.onClick },
          { label: 'Done', run: () => act(`Complete “${t.title}”`, toggle, { ids: [t.id], undo: toggle }) },
          { label: 'Someday', run: () => act(`${describeTriageWhen('someday')}: “${t.title}”`, () => applyTriageWhen('someday', t.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket! }), { ids: [t.id] }) },
          { label: 'Let go', run: remove.onClick },
        ] }]
      })
    })()
  const planParents: PlanParent[] = above.map((n) => ({
    key: n.key, title: n.title,
    children: levelNodes.filter((c) => c.parent === n.key && isOpen(c)).map((c) => c.title),
    onAdd: (title: string) => runCreate(level, title, n, `Add “${title}” for “${n.title}”`),
  }))
  // Planned, the next horizon down is next: Year → Season → Month → Week.
  // This month's next week is this one; a coming month's, its first.
  const planWeek = weekStartAnchor(current ? now : bounds.start, weekStartsOn)
  const planNext = level === 2
    ? { label: `Plan ${weekPhrase(planWeek)} →`, onClick: () => navigate(`/week?view=alongside&date=${localYmd(planWeek)}&start=${localYmd(planWeek)}&plan=1`) }
    : level === 1
      ? { label: `Plan ${monthWord} →`, onClick: () => navigate(`/month?view=constellation&horizon=2${keepStart}&plan=1`) }
      : { label: `Plan ${seasonWord} →`, onClick: () => navigate(`/season?view=constellation&horizon=1${keepStart}&plan=1`) }

  // ---- The header (calm pass, 2026-10-18) ------------------------------------
  // One primary button that changes with the moment (fix round 1 rulings):
  // the review that is due (the period before's while under way, its own in
  // its last days); else planning — this period until it is planned, then the
  // next one. Year is reference: its primary is only the review that is due,
  // or "Plan 2027" inside next year's planning window (talkFor, from Dec 25).
  // Whatever isn't the button waits in ⋯; neither while a flow is open.
  type Offer = { label: string; due: boolean; run: () => void }
  const inFlow = reviewing || planning
  // Held until the reviews and the plan record have loaded, so the button
  // doesn't flicker from one offer to another.
  const settled = !review.loading && !prevReview.loading && !planSession.loading
  const reviewOffer: Offer | null = inFlow ? null
    : target === 'this' ? { label: `Review ${periodWord}`, due: !review.loading && !review.error && !review.reviewed, run: () => setReviewing(true) }
      : target === 'previous' && !prevReview.loading && !prevReview.error && !prevReview.reviewed
        ? { label: `Review ${prevWord}`, due: true, run: () => setReviewing(true, bounds.prev) }
        : null
  const planThis: Offer = { label: `Plan ${periodWord}`, due: level !== 0, run: () => setMode('plan') }
  const planNextOffer: Offer = { label: `Plan ${nextWord}`, due: level !== 0, run: () => setMode('plan', bounds.next) }
  const yearTalk = level === 0 && talk
    ? localYmd(talk.start) === localYmd(bounds.next) ? { ...planNextOffer, due: true }
      : localYmd(talk.start) === localYmd(bounds.start) ? { ...planThis, due: true } : null
    : null
  const planOffer: Offer | null = inFlow ? null
    : yearTalk ?? (!plannable ? null : !planSession.error && planSession.saved ? planNextOffer : planThis)
  const primary = !settled ? null : reviewOffer?.due ? reviewOffer : planOffer?.due ? planOffer : null
  // One quiet fact line: Month "19 open · 26 done", Season "Sep 22 – Dec 20 ·
  // 21 goals · 4 done", Year "5 goals"; then when it was planned.
  const goalCount = (n: number) => `${n} goal${n === 1 ? '' : 's'}`
  const factParts = level === 2 ? [`${openNodes.length} open`, `${doneNodes.length} done`]
    : level === 1 ? [periodRange(bounds.start, bounds.end), goalCount(openNodes.length), `${doneNodes.length} done`]
      : [goalCount(openNodes.length)]
  const plannedOn = !planSession.loading && !planSession.error && planSession.saved
    ? `planned ${planSession.saved.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null
  const facts = !inFlow && dataReady && !error && !goalsError
    ? <p className="wk-facts plan-facts" data-explain="period-facts" data-explain-label={`${periodWord} at a glance`}>
      {factParts.join(' · ')}{plannedOn && <> · <b className="wk-facts-reviewed">{plannedOn}</b></>}
    </p>
    : null
  const menuChoices: PageMenuChoice[] = [
    ...[reviewOffer, planOffer].filter((o): o is Offer => !!o && o !== primary && dataReady && settled)
      .map((o) => ({ id: o === planOffer ? 'plan' : 'review', label: o.label, onSelect: o.run })),
    ...(!current ? [{ id: 'back', label: `Back to this ${PERIODS[level]}`, onSelect: () => setStart(null) }] : []),
    ...(inFlow ? [] : [
      { id: 'done', label: 'Show done', checked: showDone, onSelect: () => prefs.set('done', !showDone) },
      { id: 'above', label: `${aboveOpen ? 'Hide' : 'Show'} the ${aboveListWord} list`, onSelect: toggleAbove },
      { id: 'intro', label: 'Start with a goal · guided introduction', onSelect: () => navigate('/getting-started?journey=goals') },
    ]),
  ]
  const help = shellHelp ?? (() => openAssistant({ message: EXPLAIN_MESSAGE, autoSend: true, stayOnPage: true }))
  const menuLabel = `${PERIODS[level][0].toUpperCase()}${PERIODS[level].slice(1)} options`

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
        {/* Without the docked bar (phones), ⋯ offers the talk itself. */}
        <PageHelpContext.Provider value={help}>
          <PageMenu label={menuLabel} choices={menuChoices}
            talk={walkInBar ? undefined : () => openAssistant({ message: walkMessage, autoSend: true })} />
        </PageHelpContext.Provider>
      </div>
    </header>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : !dataReady ? null
      : reviewing ? <PeriodReview key={`${level}:${localYmd(bounds.start)}`} periodWord={periodWord} lines={reviewLines} loading={review.loading}
          reviewed={review.reviewed} mine={review.mine} byWhom={byWhom} onFinish={review.finish}
          // Reviewed, the next step is planning what comes after.
          next={{ label: `Plan ${nextWord} →`, onClick: () => setMode('plan', bounds.next) }}
          onClose={() => setReviewing(false)} />
      : planning ? <PeriodPlan key={`${level}:${localYmd(bounds.start)}`} periodWord={periodWord} itemWord={aGoal}
          loading={planSession.loading} carry={{ fromWord: prevWord, lines: carryLines }}
          parents={level > 0 ? { word: aboveWord, goals: planParents } : undefined}
          current={openNodes.map((n) => n.title)}
          onAdd={(title) => runCreate(level, title, null, `Add “${title}”`)}
          planned={planSession.saved ? { at: planSession.saved.at, by: byWhom(planSession.saved.authorId) } : null}
          onMark={markPlanned} next={planNext} onClose={() => setMode(null)} />
      : <>
        {/* Wide screens: open, the panel beside the list carries the title
            and its own Hide, so this line steps aside (canvas-plan.css). */}
        <div className={`plan-above${aboveOpen ? ' is-open' : ''}`} data-explain="above" data-explain-label={`${aboveTitle}, ${aboveWhat}`}>
          <button type="button" className="plan-above-line" aria-expanded={aboveOpen} aria-controls="plan-above-panel" onClick={toggleAbove}>
            <span className="plan-above-title">{aboveTitle}</span>
            <span className="plan-above-what">{aboveWhat}</span>
            <span className="canvas-link plan-above-go">{aboveOpen ? hideAbove : showAbove}</span>
          </button>
        </div>

        <div className={`plan-horizon-body${aboveOpen ? ' has-above' : ''}${preview.next.length ? ' has-next' : ''}`}>
        {/* Open, the level above sits beside the list and stays in view while
            the list scrolls (Scott, 2026-10-13); narrow screens show it above. */}
        {aboveOpen && <aside id="plan-above-panel" className="plan-above-panel" aria-label={aboveTitle}>
          <div className="plan-above-panel-head">
            <p className="plan-above-panel-title">{aboveTitle}</p>
            <button type="button" className="canvas-link plan-above-hide" aria-expanded aria-controls="plan-above-panel" onClick={toggleAbove}>{hideAbove}</button>
          </div>
          {aboveTitles.length > 0
            ? <ul className="plan-above-list" aria-label={aboveTitle}>{aboveTitles.map((t, i) => <li key={`${i}:${t}`}>{t}</li>)}</ul>
            : <p className="plan-above-none">{aboveNone}</p>}
        </aside>}
        <section className="plan-list" data-explain="list" data-explain-label={`Every ${periodWord} goal`}>
          <ul className="plan-items plan-goal-list" aria-label={`${periodWord} goals`}>
            {items.map(renderItem)}
            {preview.here.map(previewRow)}
            {proposals.map((p) => {
              const parent = level > 0 ? allNodes.find((n) => n.level === level - 1 && n.id === p.parentId) : undefined
              return <ProposalRow key={p.key} proposal={p} parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
                onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />
            })}
          </ul>
          {openNodes.length === 0 && preview.here.length === 0 && proposals.length === 0 && !adding && <p className="plan-empty">Nothing{folded.length ? ' open' : ''} for {periodWord} yet.</p>}
          {folded.length > 0 && <button type="button" className="plan-done-fold" aria-expanded={showDone} onClick={() => prefs.set('done', !showDone)}>
            <span className="plan-done-fold-text">{doneLine}</span>
            <span className="canvas-link plan-done-fold-go">{showDone ? 'Hide' : 'Show'}</span>
          </button>}
          {adding && <InlineComposer label={`New ${periodWord} goal`} saveLabel="Add"
            // A goal for something above takes its life area from it.
            extra={<>{forPicker}{!forParent && area.picker}</>}
            onSave={addHere} onCancel={closeAdd} />}
          <footer className="plan-list-foot">
            {!adding && <button type="button" className="canvas-link plan-add" aria-label={`Add ${aGoal}`} disabled={!dataReady}
              onClick={() => setComposer({ kind: 'add' })}>+ Add {aGoal}</button>}
            {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all</button>}
            {openNodes.length > 0 && <Link to={onward.to} className="plan-next" data-explain="next" data-explain-label={onward.label.replace(' →', '')}>{onward.label}</Link>}
          </footer>
        </section>
        {preview.next.length > 0 && <section className="plan-list plan-next-list" aria-label={`${nextWord}, proposed`}>
          <p className="plan-next-list-title">{nextWord}</p>
          <ul className="plan-items plan-goal-list" aria-label={`${nextWord} goals`}>
            {nextTitles.map((t, i) => <li key={`${i}:${t}`} className="plan-item"><div className="canvas-item"><span className="canvas-item-title plan-item-title">{t}</span></div></li>)}
            {preview.next.map(previewRow)}
          </ul>
        </section>}
        </div>
      </>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
