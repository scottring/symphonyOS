// src/components/plan/constellation/ConstellationPage.tsx
//
// Year, Season and Month: one page shape for each (mockup approved
// 2026-10-13, after the Week redesign). The period's goals are one plain list,
// drawn one way; the level above folds into one line that opens in place, the
// way Week's "Still to place" does. The top bar names the horizon (Today ·
// Week · Month · Season · Year), so the page carries no horizon tabs of its own.
//
// Levels connect by looking, not linking (Scott, 2026-07-08 and 2026-10-13):
// a link is made only while writing (an optional "For" pick) or from a goal's
// ⋯ menu. A linked goal says what it is for and what is already under it one
// horizon down; an unlinked goal says nothing. No counts.
//
// URL: `horizon` (0 Year, 1 Season, 2 Month; 3 hands over to Week), `start`
// (any date in the period) and `focus` (an item a conversation just saved).
// Every manual write goes through the canvas activity, so it reports saving /
// saved / didn't save, with Undo when the previous fields can be restored.

import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { TaskFateMenu } from '@/components/schedule/TaskFateMenu'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
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
import { committedTo } from '@/lib/placement/model'
import { localYmd, parseLocalYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import type { TaskContext } from '@/types/task'
import { useAddArea } from '../v2/AddArea'
import { planNodes, type PlanNode } from './model'
import { eligibleParents, moveUnderPatch } from './connections'
import { isDone, periodRange } from '@/components/canvas/plan/planGroups'
import { PlanItemRow } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { readinessOf, type ReadinessLookup } from '@/lib/prep/readiness'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EXPLAIN_LABEL, EXPLAIN_MESSAGE } from '@/lib/explain/pageGuides'

const TERMS = ['year goal', 'season goal', 'month goal', 'week task'] as const
const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
/** "an October goal", "a Fall goal". */
const aOrAn = (word: string) => /^[aeiou8]/i.test(word) ? 'an' : 'a'

type Composer = { kind: 'add' } | { kind: 'edit'; key: string }

// Whether the level above is open beside the list: one viewer's preference
// (the page works the same without it).
const ABOVE_OPEN_KEY = 'symphony.plan.aboveOpen'
function readAboveOpen(): boolean {
  try { return localStorage.getItem(ABOVE_OPEN_KEY) === '1' } catch { return false }
}
function writeAboveOpen(open: boolean) {
  try { localStorage.setItem(ABOVE_OPEN_KEY, open ? '1' : '0') } catch { /* private window */ }
}

function Inner() {
  const selection = useSelectionOptional()
  const { goals, loading: goalsLoading, error: goalsError, addGoal, updateGoal, deleteGoal } = useGoalsContext()
  const { tasks, loading, error, addTask, updateTask, refetch, pushTask, setBucket, updateTasksBulk, toggleTask, deleteTask, keepForward, dropCommitment } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, setBucket, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const activity = useCanvasActivity()
  const { openAssistant } = useAssistantLauncher()
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember } = useFamilyMembers(), { seasons } = useHouseholdSeasons()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const area = useAddArea()

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

  // ---- What is planned (already filtered for privacy, area and people) ----
  const lens = planPeopleLens(people, getCurrentUserMember()?.id ?? null)
  const visible = filterTasksForLayers(tasks, layers).filter(lens.keep)
  const goalsOf = (y: number) => goals.filter((g) => g.year === y && g.status !== 'archived' && matchesLayers(g.context, layers) && lens.keep(g))
  const allNodes = planNodes(goalsOf(year), [
    selectPeriodTasks(visible, 'season', seasonB.start, isCurrentPeriod(seasonB, now), lens.scopeId, seasons),
    selectPeriodTasks(visible, 'month', monthB.start, isCurrentPeriod(monthB, now), lens.scopeId, seasons),
    visible.filter((t) => committedTo(t, 'week', week, { isCurrent: thisWeek }) !== undefined),
  ])

  const [showDone, setShowDone] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  // The optional "For" pick while writing a new goal (a node key, or none).
  const [forKey, setForKey] = useState('')
  const [aboveOpen, setAboveOpen] = useState(readAboveOpen)
  const toggleAbove = () => setAboveOpen((open) => { writeAboveOpen(!open); return !open })
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

  const actionsFor = (node: PlanNode, rowVerbs: { label: string; onSelect: () => void }[] = []) => {
    const task = node.task
    const label = `Actions for ${node.title}`
    if (!task) {
      const status = node.goal?.status ?? 'active'
      const setStatus = (next: 'active' | 'completed' | 'archived', what: string) =>
        void act(what, () => updateGoal(node.id, { status: next }), { ids: [node.id], undo: async () => (await updateGoal(node.id, { status })) !== false })
      return <TaskFateMenu label={label} showWhen={false} onPickWhen={() => {}}
        extras={[
          ...rowVerbs,
          status === 'completed'
            ? { label: 'Reopen goal', onSelect: () => setStatus('active', `Reopen “${node.title}”`) }
            : { label: 'Complete goal', onSelect: () => setStatus('completed', `Complete “${node.title}”`) },
          { label: 'Archive goal', onSelect: () => setStatus('archived', `Archive “${node.title}”`) },
          // The row's quick Delete, here too for touch (no hover there).
          { label: 'Delete goal', onSelect: () => { if (window.confirm(`Delete “${node.title}”? Season goals written for it stay, on their own.`)) void act(`Delete “${node.title}”`, async () => { await deleteGoal(node.id) }) } },
        ]} />
    }
    const period = node.level === 1 ? 'season' : node.level === 2 ? 'month' : 'week'
    const start = node.level === 1 ? seasonB.start : node.level === 2 ? monthB.start : week
    const nextWeek = new Date(week); nextWeek.setDate(nextWeek.getDate() + 7)
    const next = node.level === 1 ? { seasonStart: seasonB.next } : node.level === 2 ? { monthStart: monthB.next } : { weekStart: nextWeek }
    const toggle = async () => (await toggleTask(node.id)) !== false
    return <TaskFateMenu label={label}
      onOpen={selection ? () => selection.setSelection({ kind: 'task', id: node.id }) : undefined}
      onPickWhen={(when) => void act(`${describeTriageWhen(when)}: “${node.title}”`, () => applyTriageWhen(when, node.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket!, onFocus: (id, day) => gated.updateTask(id, { plannedOn: day }) }), { ids: [node.id] })}
      onPickDate={(date, isAllDay) => void act(`Schedule “${node.title}”`, () => gated.setBucket!(node.id, 'timed', date, isAllDay), { ids: [node.id] })}
      onComplete={!task.completed ? () => void act(`Complete “${node.title}”`, toggle, { ids: [node.id], undo: toggle }) : undefined}
      onDelete={() => { if (window.confirm(`Delete “${node.title}”? This removes the item from all its planning periods.`)) void act(`Delete “${node.title}”`, async () => { await deleteTask(node.id) }) }}
      extras={[
        ...rowVerbs,
        ...(task.completed ? [{ label: 'Reopen', onSelect: () => void act(`Reopen “${node.title}”`, toggle, { ids: [node.id], undo: toggle }) }] : []),
        { label: `Carry to next ${period}`, onSelect: () => void act(`Carry “${node.title}” to next ${period}`, async () => !!await keepForward(node.id, next, start), { ids: [node.id] }) },
        { label: `Remove from this ${period}`, onSelect: () => void act(`Remove “${node.title}” from this ${period}`, () => dropCommitment(node.id, period, start)) },
      ]} />
  }

  // One-tap triage on each open row (Scott, 2026-10-13): Done, Someday,
  // Delete — the same writes as the ⋯ menu's. A year goal is a goals row with
  // no Someday, so it offers Done and Delete; deleting it leaves its season
  // goals in place, unlinked (tasks.goal_id ON DELETE SET NULL).
  const quickFor = (node: PlanNode): { label: string; onSelect: () => void }[] => {
    if (isDone(node)) return []
    if (!node.task) {
      const status = node.goal?.status ?? 'active'
      return [
        { label: 'Done', onSelect: () => void act(`Complete “${node.title}”`, () => updateGoal(node.id, { status: 'completed' }), { ids: [node.id], undo: async () => (await updateGoal(node.id, { status })) !== false }) },
        { label: 'Delete', onSelect: () => { if (window.confirm(`Delete “${node.title}”? Season goals written for it stay, on their own.`)) void act(`Delete “${node.title}”`, async () => { await deleteGoal(node.id) }) } },
      ]
    }
    const toggle = async () => (await toggleTask(node.id)) !== false
    return [
      { label: 'Done', onSelect: () => void act(`Complete “${node.title}”`, toggle, { ids: [node.id], undo: toggle }) },
      { label: 'Someday', onSelect: () => void act(`${describeTriageWhen('someday')}: “${node.title}”`, () => applyTriageWhen('someday', node.id, { onPushTask: gated.pushTask, onSetBucket: gated.setBucket!, onFocus: (id, day) => gated.updateTask(id, { plannedOn: day }) }), { ids: [node.id] }) },
      { label: 'Delete', onSelect: () => { if (window.confirm(`Delete “${node.title}”? This removes the item from all its planning periods.`)) void act(`Delete “${node.title}”`, async () => { await deleteTask(node.id) }) } },
    ]
  }

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
  const walkLabel = current ? `Plan this ${PERIODS[level]} with me` : `Plan ${periodTitle} with me`
  // The plan holds their ideas: the walk asks and structures, never supplies
  // (Scott, 2026-10-11 — "pushy in terms of its own ideas").
  const walkMessage = level === 0
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
  const above = level > 0 ? allNodes.filter((n) => n.level === level - 1 && !isDone(n)) : []
  const aboveTitles = level > 0 ? above.map((n) => n.title) : goalsOf(year - 1).filter((g) => g.status !== 'completed').map((g) => g.name)
  const aboveWord = level === 2 ? seasonWord : String(year)
  const aboveTitle = level === 2 ? `${seasonWord} goals` : level === 1 ? `${year} goals` : `${year - 1} goals`
  const aboveWhat = level === 2 ? `the season ${periodWord} serves` : level === 1 ? `the year ${periodWord} serves` : 'last year, for reference'
  const aboveNone = level === 2 ? `No ${seasonWord} goals yet.` : level === 1 ? `No ${year} goals yet.` : `Nothing was written for ${year - 1}.`

  // ---- The period's goals ---------------------------------------------------
  const items = allNodes.filter((n) => n.level === level && (showDone || !isDone(n)))
  const hasDone = allNodes.some((n) => n.level === level && isDone(n))
  const parentOf = (node: PlanNode) => node.parent ? allNodes.find((n) => n.key === node.parent) : undefined
  // What is already under a goal one horizon down, by name — never a count.
  const belowLabel = level === 2 ? (thisWeek ? 'This week' : `Week of ${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    : level === 1 ? monthWord : seasonWord
  const belowOf = (node: PlanNode) => allNodes.filter((n) => n.parent === node.key && n.level === level + 1 && !isDone(n)).map((n) => n.title)

  const renderItem = (node: PlanNode) => {
    const canMove = level > 0 && !!node.task && !allNodes.some((n) => n.level === level - 1 && n.id === node.id)
    const moveParents = canMove ? eligibleParents(allNodes, node).filter((p) => !isDone(p) || p.key === node.parent) : []
    const scheduled = node.task?.scheduledFor
    const more: { label: string; onSelect: () => void }[] = []
    if (node.task && selection) more.push({ label: 'Open details', onSelect: () => selection.setSelection({ kind: 'task', id: node.id }) })
    const editing = composer?.kind === 'edit' && composer.key === node.key
    const parent = parentOf(node)
    return <PlanItemRow key={node.key} node={node}
      parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
      below={{ label: belowLabel, titles: belowOf(node) }}
      quick={quickFor(node)}
      linked={linked === node.key}
      count={0} childTerm={null}
      done={isDone(node)} saved={savedKey === node.key}
      expanded={expanded === node.key} onToggle={() => setExpanded((k) => k === node.key ? null : node.key)}
      editing={editing} onEdit={() => setComposer({ kind: 'edit', key: node.key })}
      onSaveEdit={async (text) => { const ok = await rename(node, text); if (ok) setComposer(null); return ok }}
      onCancelEdit={() => setComposer(null)}
      move={canMove ? { parents: moveParents, parentTerm: parentTerm!, onPick: (p) => moveUnder(node, p) } : undefined}
      actions={(verbs) => actionsFor(node, verbs)} more={more}
      readiness={node.task ? readinessOf(node.task, prepLookup) : undefined}
      onPrepare={node.task && selection ? () => selection.setSelection({ kind: 'task', id: node.id }) : undefined}
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

  const walk = <button type="button" className="plan-walk" onClick={() => openAssistant({ message: walkMessage, autoSend: true })}>{walkLabel}</button>

  return <main ref={mainRef} className={`plan-canvas plan-horizon ${PAGE_PLANNING}`} data-horizon={level}>
    <header className="plan-head">
      {/* Without the docked bar (phones) the page offers both itself. */}
      {!walkInBar && <div className="plan-head-row">{walk}<button type="button" className="plan-walk" onClick={() => openAssistant({ message: EXPLAIN_MESSAGE, autoSend: true, stayOnPage: true })}>{EXPLAIN_LABEL}</button></div>}
      <div className="plan-period" data-explain="period" data-explain-label={`${periodTitle}, ${periodRange(bounds.start, bounds.end)}`}>
        <button type="button" className="plan-step" onClick={() => setStart(bounds.prev)} aria-label={`Previous ${PERIODS[level]}`}><ChevronLeft size={18} aria-hidden="true" /></button>
        <h1>{periodTitle}</h1>
        <button type="button" className="plan-step" onClick={() => setStart(bounds.next)} aria-label={`Next ${PERIODS[level]}`}><ChevronRight size={18} aria-hidden="true" /></button>
        <span className="plan-period-range">{periodRange(bounds.start, bounds.end)}</span>
        {!current && <button type="button" className="period-return canvas-link" onClick={() => setStart(null)}>Back to this {PERIODS[level]}</button>}
      </div>
    </header>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : !dataReady ? null
      : <>
        <div className="plan-above" data-explain="above" data-explain-label={`${aboveTitle}, ${aboveWhat}`}>
          <button type="button" className="plan-above-line" aria-expanded={aboveOpen} aria-controls="plan-above-panel" onClick={toggleAbove}>
            <span className="plan-above-title">{aboveTitle}</span>
            <span className="plan-above-what">{aboveWhat}</span>
            <span className="canvas-link plan-above-go">{aboveOpen ? 'Hide' : 'Show'}</span>
          </button>
        </div>

        <div className={`plan-horizon-body${aboveOpen ? ' has-above' : ''}`}>
        {/* Open, the level above sits beside the list and stays in view while
            the list scrolls (Scott, 2026-10-13); narrow screens show it above. */}
        {aboveOpen && <aside id="plan-above-panel" className="plan-above-panel" aria-label={aboveTitle}>
          <p className="plan-above-panel-title">{aboveTitle}</p>
          {aboveTitles.length > 0
            ? <ul className="plan-above-list" aria-label={aboveTitle}>{aboveTitles.map((t, i) => <li key={`${i}:${t}`}>{t}</li>)}</ul>
            : <p className="plan-above-none">{aboveNone}</p>}
        </aside>}
        <section className="plan-list" data-explain="list" data-explain-label={`Every ${periodWord} goal`}>
          <ul className="plan-items plan-goal-list" aria-label={`${periodWord} goals`}>
            {items.map(renderItem)}
            {proposals.map((p) => {
              const parent = level > 0 ? allNodes.find((n) => n.level === level - 1 && n.id === p.parentId) : undefined
              return <ProposalRow key={p.key} proposal={p} parentLabel={parent ? { kind: 'For', title: parent.title } : undefined}
                onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />
            })}
          </ul>
          {items.length === 0 && proposals.length === 0 && !adding && <p className="plan-empty">Nothing for {periodWord} yet.</p>}
          {adding && <InlineComposer label={`New ${periodWord} goal`} saveLabel="Add"
            // A goal for something above takes its life area from it.
            extra={<>{forPicker}{!forParent && area.picker}</>}
            onSave={addHere} onCancel={closeAdd} />}
          <footer className="plan-list-foot">
            {!adding && <button type="button" className="canvas-link plan-add" aria-label={`Add ${aGoal}`} disabled={!dataReady}
              onClick={() => setComposer({ kind: 'add' })}>+ Add {aGoal}</button>}
            {(hasDone || showDone) && <button type="button" className="canvas-link" aria-pressed={showDone} onClick={() => setShowDone((s) => !s)}>{showDone ? 'Hide done' : 'Show done'}</button>}
            {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all</button>}
            {items.length > 0 && <Link to={onward.to} className="plan-next" data-explain="next" data-explain-label={onward.label.replace(' →', '')}>{onward.label}</Link>}
          </footer>
        </section>
        </div>
      </>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
