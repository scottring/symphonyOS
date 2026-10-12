// src/components/plan/constellation/ConstellationPage.tsx
//
// Plan: Year, Season and Month, one working horizon at a time. Each item sits
// under its parent one horizon up, named once in the group's header; items
// with no parent sit in Unlinked, last. The Week level lives on the Week page.
//
// URL: `horizon` (0 Year, 1 Season, 2 Month; 3 hands over to Week), `start`
// (any date in the period) and `focus` (a group to narrow to, or an item a
// conversation just saved). Every manual write goes through the canvas
// activity, so it reports saving / saved / didn't save, with Undo when the
// previous fields can be restored.

import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import { Link, Navigate, useLocation, useSearchParams, type SetURLSearchParams } from 'react-router-dom'
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
import { connectionPair, eligibleParents, moveUnderPatch } from './connections'
import { horizonGroups, calmGroups, focusedGroupKeys, childCount, isDone, periodRange, UNLINKED, INTENTIONS, type PlanGroup } from '@/components/canvas/plan/planGroups'
import { PlanItemRow } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { readinessOf, type ReadinessLookup } from '@/lib/prep/readiness'
import { ChevronLeft, ChevronRight, PanelLeftOpen } from 'lucide-react'
import { UpstreamDrawer, useUpstreamDrawer } from './UpstreamDrawer'
import { useColumnsFitWindow } from '@/hooks/useColumnsFitWindow'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'

const TERMS = ['year goal', 'season goal', 'month goal', 'week task'] as const
const HORIZONS = ['Year', 'Season', 'Month'] as const
const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }

/** The element that scrolls the page, so Show all can return to where you were:
 * the board itself while it scrolls on its own beside the drawer. */
function scrollHost(el: HTMLElement | null): HTMLElement | null {
  const board = el?.querySelector<HTMLElement>('.plan-body.is-colscroll > .plan-board')
  if (board && getComputedStyle(board).overflowY === 'auto') return board
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return document.scrollingElement as HTMLElement | null
}

/** Show all: drop the focus and return to where the page was scrolled. */
function releaseFocus(setParams: SetURLSearchParams, main: RefObject<HTMLElement | null>, memo: RefObject<number | null>) {
  setParams((prev) => { const p = new URLSearchParams(prev); p.delete('focus'); return p }, { replace: true })
  const top = memo.current
  memo.current = null
  if (top !== null) requestAnimationFrame(() => scrollHost(main.current)?.scrollTo({ top }))
}

type Composer = { kind: 'add'; group: string; parent: PlanNode | null } | { kind: 'edit'; key: string }

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
  const periodTitle = bounds.label
  const current = isCurrentPeriod(bounds, now)
  const periodWord = level === 0 ? bounds.label : bounds.label.replace(/\s\d{4}$/, '')

  // ---- What is planned (already filtered for privacy, area and people) ----
  const lens = planPeopleLens(people, getCurrentUserMember()?.id ?? null)
  const visible = filterTasksForLayers(tasks, layers).filter(lens.keep)
  const allNodes = planNodes(goals.filter((g) => g.year === anchor.getFullYear() && g.status !== 'archived' && matchesLayers(g.context, layers) && lens.keep(g)), [
    selectPeriodTasks(visible, 'season', seasonB.start, isCurrentPeriod(seasonB, now), lens.scopeId, seasons),
    selectPeriodTasks(visible, 'month', monthB.start, isCurrentPeriod(monthB, now), lens.scopeId, seasons),
    visible.filter((t) => committedTo(t, 'week', week, { isCurrent: localYmd(week) === localYmd(weekStartAnchor(now, weekStartsOn)) }) !== undefined),
  ])

  const [showDone, setShowDone] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [showFiled, setShowFiled] = useState(false)
  const drawerUi = useUpstreamDrawer()
  const mainRef = useRef<HTMLElement>(null)
  const scrollMemo = useRef<number | null>(null)

  const focus = params.get('focus')
  const { groups, doneCount } = horizonGroups(allNodes, level, showDone)
  const focused = focusedGroupKeys(groups, allNodes, level, focus)
  const savedKey = focus && allNodes.some((n) => n.key === focus && n.level === level) ? focus : null
  const isFocusing = !!focused

  // ---- Navigation within Plan --------------------------------------------
  const setHorizon = (i: number, focusKey?: string) => setParams((prev) => {
    const p = new URLSearchParams(prev); p.set('view', 'constellation'); p.set('horizon', String(i))
    // From this year (or this season…), Season and Month mean the current
    // ones — not the season holding a remembered Jan 1, which is last year's.
    if (current) p.delete('start')
    if (focusKey) p.set('focus', focusKey); else p.delete('focus')
    return p
  })
  const setStart = (d: Date | null) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (d) p.set('start', localYmd(d)); else p.delete('start')
    p.delete('focus')
    return p
  })
  const focusGroup = (key: string) => {
    if (!isFocusing) scrollMemo.current = scrollHost(mainRef.current)?.scrollTop ?? null
    setParams((prev) => { const p = new URLSearchParams(prev); p.set('focus', key); return p }, { replace: true })
  }
  const clearFocus = () => releaseFocus(setParams, mainRef, scrollMemo)

  useEffect(() => {
    if (!isFocusing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[role="menu"],dialog[open]')) return
      releaseFocus(setParams, mainRef, scrollMemo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFocusing, setParams])

  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('symphony-plan-updated', refresh)
    return () => window.removeEventListener('symphony-plan-updated', refresh)
  }, [refetch])

  // A conversation's saved item: bring it into view in its group.
  const dataReady = !loading && !goalsLoading
  useEffect(() => {
    if (!savedKey || !dataReady) return
    mainRef.current?.querySelector(`[data-plan-key="${savedKey}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [savedKey, dataReady])

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
    if (lvl === 0) return !!await addGoal(null, title, context, { year: anchor.getFullYear(), id })
    return !!await addTask(title, undefined, undefined, undefined, {
      id,
      bucket: lvl === 1 ? 'quarter' : lvl === 2 ? 'month' : 'week',
      ...(lvl === 1 ? { seasonStart: seasonB.start } : lvl === 2 ? { monthStart: monthB.start } : { weekStart: week }),
      context,
      ...(parent ? lvl === 1 ? { goalId: parent.id } : { sourceId: parent.id, goalId: parent.task?.goalId } : {}),
    })
  }
  const runCreate = (lvl: number, title: string, parent: PlanNode | null, label: string): Promise<boolean> => {
    const id = crypto.randomUUID(), context = contextFor(parent)
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
  const proposalGroup = (p: CanvasProposal) => {
    if (level === 0) return INTENTIONS
    const key = allNodes.find((n) => n.level === level - 1 && n.id === p.parentId)?.key
    return key && groups.some((g) => g.key === key) ? key : UNLINKED
  }
  const keepAll = async () => { for (const p of proposals.filter((x) => x.state !== 'saving')) await keepProposal(p) }

  // ---- Drag an item onto a group header (desktop shortcut for Move under…) -
  const dragNode = dragKey ? allNodes.find((n) => n.key === dragKey) : undefined
  const canDropOn = (parent: PlanNode) => !!dragNode && parent.key !== dragNode.parent && !!connectionPair(allNodes, dragNode.key, parent.key)
  const canDrop = (g: PlanGroup) => !!dragNode && (g.kind === 'unlinked' ? !!dragNode.parent : g.kind === 'parent' && !!g.parent && canDropOn(g.parent))
  const dropProps = (g: PlanGroup) => level === 0 ? {} : {
    onDragOver: (e: DragEvent) => { if (canDrop(g)) { e.preventDefault(); if (dropKey !== g.key) setDropKey(g.key) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropKey((k) => k === g.key ? null : k) },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (dragNode && canDrop(g)) moveUnder(dragNode, g.parent); setDragKey(null); setDropKey(null) },
  }

  const term = TERMS[level]
  const parentTerm = level > 0 ? TERMS[level - 1] : null
  const walkLabel = current ? `Plan this ${PERIODS[level]} with me` : `Plan ${periodTitle} with me`
  // The plan holds their ideas: the walk asks and structures, never supplies
  // (Scott, 2026-10-11 — "pushy in terms of its own ideas").
  const walkMessage = level === 0
    ? `Let's plan ${periodTitle}, one year goal at a time. Ask me what I want; use my words and don't suggest goals of your own.`
    : `Let's plan ${periodTitle} across my ${parentTerm}s, one at a time. Ask me what I want under each; use my words and don't suggest ${term}s of your own.`
  // The walk rides in the docked bar where there is one (desktop).
  // With the drawer beside it, the drawer and the board each scroll on their
  // own to the landscape (Scott, 2026-10-11), as Week and Month's columns do.
  const drawerShown = level > 0 && drawerUi.shown && dataReady && !error && !goalsError
  const bodyRef = useColumnsFitWindow(drawerShown)
  const walkInBar = useConversationWalk(requested === 3 ? null : { label: walkLabel, message: walkMessage })

  if (requested === 3) return <Navigate replace to={`/week?view=alongside&date=${localYmd(anchor)}&start=${localYmd(week)}`} />

  const hasItems = groups.some((g) => g.items.length > 0)
  // Below Year and outside a focus: what holds something first, empties folded.
  const pending = new Set(proposals.map(proposalGroup))
  const calm = level > 0 && !focused && hasItems ? calmGroups(groups, pending) : null
  const weekHref = `/week?view=alongside&date=${localYmd(anchor)}`

  const seasonWord = periodWordOf(seasonB)
  const parentName = level === 1 ? 'year goal' : `${seasonWord.toLowerCase()} goal`
  const hasParents = groups.some((g) => g.kind === 'parent')
  const groupTitle = (g: PlanGroup) => g.kind === 'unlinked' ? (hasParents ? `Not under a ${parentName}` : `${periodWord} goals`) : g.kind === 'intentions' ? `Year goals` : g.parent!.title
  const addLabel = (g: PlanGroup) => g.kind === 'unlinked' ? (hasParents ? `Add a ${term} not under a ${parentName}` : `Add a ${term}`) : g.kind === 'intentions' ? `Add a ${term}` : `Add a ${term} under ${g.parent!.title}`

  // Readiness reads only rows this reader already has, under the same filters.
  // The drawer lists every open parent, even those folded for holding nothing.
  const upstream = level > 0 ? allNodes.filter((n) => n.level === level - 1 && !isDone(n)) : []
  const drawerTitle = level === 1 ? 'Year goals' : `${seasonWord} goals`
  const drawer = drawerShown
    ? <UpstreamDrawer title={drawerTitle} childTerm={term} parents={upstream}
        countOf={(n) => childCount(allNodes, n)} dragging={!!dragNode}
        canDropOn={canDropOn}
        onDrop={(parent) => { if (dragNode) void moveUnder(dragNode, parent); setDragKey(null); setDropKey(null) }}
        onPick={(parent) => focusGroup(parent.key)} pickLabel={(parent) => `Show ${term}s under ${parent.title}`}
        onClose={() => drawerUi.setOpen(false)}
        empty={<>No {parentName}s for {level === 1 ? anchor.getFullYear() : seasonWord} yet. <button type="button" className="canvas-link" onClick={() => setHorizon(level - 1)}>Add {parentName}s</button></>} />
    : null
  // With the drawer open the board leads with what is not filed yet (Scott,
  // 2026-10-11); what is filed folds to one line, and empty parents are in
  // the drawer. A group showing suggestions stays open.
  const pile = calm && drawer ? {
    lead: [...groups.filter((g) => g.kind === 'unlinked'), ...calm.shown.filter((g) => g.kind === 'parent' && pending.has(g.key))],
    filed: calm.shown.filter((g) => g.kind === 'parent' && !pending.has(g.key)),
  } : null
  const filedCount = pile ? pile.filed.reduce((n, g) => n + g.items.length, 0) : 0

  const visibleById = new Map(visible.map((t) => [t.id, t]))
  const goalsById = new Map(allNodes.filter((n) => n.goal).map((n) => [n.id, n.goal!]))
  const prepLookup: ReadinessLookup = { task: (id) => visibleById.get(id), goal: (id) => goalsById.get(id) }

  const renderItem = (node: PlanNode) => {
    const canMove = level > 0 && !!node.task && !allNodes.some((n) => n.level === level - 1 && n.id === node.id)
    const moveParents = canMove ? eligibleParents(allNodes, node).filter((p) => !isDone(p) || p.key === node.parent) : []
    const scheduled = node.task?.scheduledFor
    const more: { label: string; onSelect: () => void }[] = []
    if (node.task && selection) more.push({ label: 'Open details', onSelect: () => selection.setSelection({ kind: 'task', id: node.id }) })
    if (level < 2) more.push({ label: `See its ${TERMS[level + 1]}s →`, onSelect: () => setHorizon(level + 1, node.key) })
    const editing = composer?.kind === 'edit' && composer.key === node.key
    return <PlanItemRow key={node.key} node={node}
      count={childCount(allNodes, node)} childTerm={TERMS[level + 1] ?? null}
      done={isDone(node)} saved={savedKey === node.key}
      expanded={expanded === node.key} onToggle={() => setExpanded((k) => k === node.key ? null : node.key)}
      editing={editing} onEdit={() => setComposer({ kind: 'edit', key: node.key })}
      onSaveEdit={async (text) => { const ok = await rename(node, text); if (ok) setComposer(null); return ok }}
      onCancelEdit={() => setComposer(null)}
      move={canMove ? { parents: moveParents, parentTerm: parentTerm!, onPick: (p) => moveUnder(node, p) } : undefined}
      actions={(verbs) => actionsFor(node, verbs)} more={more}
      readiness={node.task ? readinessOf(node.task, prepLookup) : undefined}
      onPrepare={node.task && selection ? () => selection.setSelection({ kind: 'task', id: node.id }) : undefined}
      meta={scheduled ? `Scheduled ${scheduled.toLocaleDateString()}${!node.task?.isAllDay ? ` · ${scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}` : null}
      onDragStart={canMove ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.key); setDragKey(node.key) } : undefined}
      onDragEnd={() => { setDragKey(null); setDropKey(null) }} />
  }

  const renderGroup = (g: PlanGroup) => {
    const title = groupTitle(g)
    const isFocused = !!focused?.has(g.key)
    const groupProposals = proposals.filter((p) => proposalGroup(p) === g.key)
    if (focused && !isFocused) {
      return <li key={g.key} className="plan-group-slot">
        <button type="button" className="canvas-group is-quiet plan-group-folded" aria-label={`Focus on ${title}`} onClick={() => focusGroup(g.key)}>
          <span className="canvas-group-title">{title}</span>
          <span className="canvas-item-meta">{g.items.length}</span>
        </button>
      </li>
    }
    const adding = composer?.kind === 'add' && composer.group === g.key
    const empty = g.items.length === 0 && groupProposals.length === 0
    return <li key={g.key} className="plan-group-slot">
      <section className={`canvas-group plan-group${g.kind === 'unlinked' ? ' is-unlinked' : ''}${dropKey === g.key ? ' is-drop' : ''}${dragNode && canDrop(g) ? ' is-drop-ok' : ''}`}
        aria-label={g.kind === 'parent' ? `Under ${title}` : title} data-group-key={g.key} {...dropProps(g)}>
        {g.crumb && <p className="plan-group-crumb">{g.crumb}</p>}
        <header className="canvas-group-head">
          {g.kind === 'intentions'
            ? <h2 className="canvas-group-title">{title}</h2>
            : <h2 className="canvas-group-title"><button type="button" className="plan-group-focus" aria-pressed={isFocused} aria-label={`Focus on ${title}`}
                onClick={() => isFocused ? clearFocus() : focusGroup(g.key)}>{title}</button></h2>}
          {g.items.length > 0 && <span className="canvas-item-meta" aria-label={`${g.items.length} ${term}${g.items.length === 1 ? '' : 's'}`}>{g.items.length}</span>}
        </header>
        <ul className="plan-items">
          {g.items.map(renderItem)}
          {groupProposals.map((p) => <ProposalRow key={p.key} proposal={p} onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />)}
        </ul>
        {empty && !adding && <p className="plan-empty">{g.kind !== 'unlinked' ? `Nothing for ${periodWord} yet.`
          : !hasParents ? <>No {parentName}s for {level === 1 ? anchor.getFullYear() : seasonWord} yet. Add {term}s here on their own, or <button type="button" className="canvas-link" onClick={() => setHorizon(level - 1)}>add {parentName}s first</button>.</>
          : hasItems ? `Everything for ${periodWord} is under a ${parentName}.`
          : `${term[0].toUpperCase()}${term.slice(1)}s that aren’t under a ${parentName} go here.`}</p>}
        {g.kind === 'unlinked' && g.items.length > 0 && groups.some((x) => x.kind === 'parent') && <button type="button" className="canvas-link plan-suggest-links"
          onClick={() => openAssistant({ message: `Which ${parentName} does each of my items under no ${parentName} for ${periodTitle} belong under? Suggest links; don't link anything until I keep them.`, autoSend: true })}>Suggest where these go</button>}
        {adding
          ? <InlineComposer label={`New ${term}${g.parent ? ` under ${g.parent.title}` : ''}`} saveLabel="Add"
              // An item with no parent takes its life area from here; one
              // under a parent takes its parent's.
              extra={g.parent ? undefined : area.picker}
              onSave={async (text) => {
                const ok = await runCreate(level, text, g.parent, `Add “${text}”${g.parent ? ` under “${g.parent.title}”` : ''}`)
                if (ok) setComposer(null)
                return ok
              }}
              onCancel={() => setComposer(null)} />
          : <button type="button" className="canvas-link plan-add" aria-label={addLabel(g)} disabled={!dataReady}
              onClick={() => setComposer({ kind: 'add', group: g.key, parent: g.parent })}>+ Add</button>}
      </section>
    </li>
  }

  // The approved Season board (2026-10-10): the horizon switch, then the
  // period by name with its dates. No numeral; the bar at the foot holds
  // the walk on desktop.
  const stepper = <nav className="plan-stepper" aria-label="Planning horizon">
    {HORIZONS.map((h, i) => <button key={h} type="button" aria-current={i === level ? 'step' : undefined} onClick={() => setHorizon(i)}>{h}</button>)}
    <Link to={weekHref} className="plan-stepper-week">Week →</Link>
  </nav>
  const walk = <button type="button" className="plan-walk" onClick={() => openAssistant({ message: walkMessage, autoSend: true })}>{walkLabel}</button>
  return <main ref={mainRef} className={`plan-canvas ${PAGE_PLANNING}`} data-horizon={level}>
    <header className="plan-head">
      <div className="plan-head-row">{stepper}{!walkInBar && walk}</div>
      <div className="plan-period">
        <button type="button" className="plan-step" onClick={() => setStart(bounds.prev)} aria-label={`Previous ${PERIODS[level]}`}><ChevronLeft size={18} aria-hidden="true" /></button>
        <h1>{periodTitle}</h1>
        <button type="button" className="plan-step" onClick={() => setStart(bounds.next)} aria-label={`Next ${PERIODS[level]}`}><ChevronRight size={18} aria-hidden="true" /></button>
        <span className="plan-period-range">{periodRange(bounds.start, bounds.end)}</span>
        {!current && <button type="button" className="period-return canvas-link" onClick={() => setStart(null)}>Back to this {PERIODS[level]}</button>}
      </div>
    </header>
    <div className="plan-toolbar">
      {level > 0 && drawerUi.available && !drawerUi.open && <button type="button" className="canvas-link plan-drawer-open" aria-expanded={false} onClick={() => drawerUi.setOpen(true)}>
        <PanelLeftOpen size={15} aria-hidden="true" /> Show {drawerTitle.toLowerCase()}
      </button>}
      {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all ({proposals.length})</button>}
      {(doneCount > 0 || showDone) && <button type="button" className="canvas-link" aria-pressed={showDone} onClick={() => setShowDone((s) => !s)}>
        {showDone ? `Hide done (${doneCount})` : `Show done (${doneCount})`}
      </button>}
    </div>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : <div ref={bodyRef} className={`plan-body${drawer ? ' has-drawer is-colscroll' : ''}`}>{drawer}<div className="plan-board">
        {focused && <div className="plan-focus-bar">
          <span role="status">Showing {focused.size} of {groups.length} groups</span>
          <button type="button" className="canvas-link" onClick={clearFocus}>Show all · Esc</button>
        </div>}
        <ul className={`plan-groups${focused ? ' is-focused' : ''}${level === 0 ? ' is-year' : ''}`} aria-label={`${HORIZONS[level]} plan`}>
          {(pile ? pile.lead : calm ? calm.shown : groups).map(renderGroup)}
        </ul>
        {pile && pile.filed.length > 0 && <>
          <button type="button" className="canvas-group is-quiet plan-empty-fold" aria-expanded={showFiled} aria-controls="plan-filed-goals" onClick={() => setShowFiled((v) => !v)}>
            <b>{filedCount} {term}{filedCount === 1 ? '' : 's'} filed under {pile.filed.length} {parentName}{pile.filed.length === 1 ? '' : 's'}</b>
            {!showFiled && <span className="plan-empty-fold-names">{pile.filed.slice(0, 4).map(groupTitle).join(' · ')}{pile.filed.length > 4 ? ` · and ${pile.filed.length - 4} more` : ''}</span>}
            <span className="canvas-link">{showFiled ? 'Hide' : 'Show'}</span>
          </button>
          {showFiled && <ul id="plan-filed-goals" className="plan-groups" aria-label={`Filed under ${parentName}s`}>{pile.filed.map(renderGroup)}</ul>}
        </>}
        {calm && !pile && calm.empty.length > 0 && <>
          <button type="button" className="canvas-group is-quiet plan-empty-fold" aria-expanded={showEmpty} aria-controls="plan-empty-goals" onClick={() => setShowEmpty((v) => !v)}>
            <b>{calm.empty.length} {parentName}{calm.empty.length === 1 ? '' : 's'} with nothing in {periodWord}</b>
            {!showEmpty && <span className="plan-empty-fold-names">{calm.empty.slice(0, 4).map(groupTitle).join(' · ')}{calm.empty.length > 4 ? ` · and ${calm.empty.length - 4} more` : ''}</span>}
            <span className="canvas-link">{showEmpty ? 'Hide' : 'Show'}</span>
          </button>
          {showEmpty && <ul id="plan-empty-goals" className="plan-groups" aria-label={`${parentName}s with nothing in ${periodWord}`}>{calm.empty.map(renderGroup)}</ul>}
        </>}
        <footer className="plan-foot">
          {hasItems && (level < 2
            ? <button type="button" className="plan-next" onClick={() => setHorizon(level + 1)}>Next: {HORIZONS[level + 1]} →</button>
            : <Link to={weekHref} className="plan-next">Next: Week →</Link>)}
        </footer>
      </div></div>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
