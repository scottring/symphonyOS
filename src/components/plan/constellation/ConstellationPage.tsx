// src/components/plan/constellation/ConstellationPage.tsx
//
// Plan: Year, Season and Month, one working horizon at a time. Each item sits
// under its parent one horizon up, named once in the group's header. Season
// and Month read in two labelled parts: what is under a parent (one card per
// parent), then what is not (Scott, 2026-10-12: the parents are named once,
// on their cards, not again in a column beside them). The Week level lives on
// the Week page.
//
// Month answers one question (Scott, 2026-10-12): "What do I want to
// accomplish this month?" Every month goal stays in one complete collection,
// linked or not; the season's goals sit beside it as a hideable source.
// Selecting a season goal highlights its month goals there (never filters
// them away), and linking names the parent on the goal itself.
//
// URL: `horizon` (0 Year, 1 Season, 2 Month; 3 hands over to Week), `start`
// (any date in the period) and `focus` (a group to narrow to, or an item a
// conversation just saved). Every manual write goes through the canvas
// activity, so it reports saving / saved / didn't save, with Undo when the
// previous fields can be restored.

import { useEffect, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { PAGE_PLANNING } from '@/components/layout/pageLayout'
import { EXPLAIN_LABEL, EXPLAIN_MESSAGE } from '@/lib/explain/pageGuides'
import { useColumnsFitWindow } from '@/hooks/useColumnsFitWindow'

const TERMS = ['year goal', 'season goal', 'month goal', 'week task'] as const
const HORIZONS = ['Year', 'Season', 'Month'] as const
const periodWordOf = (b: { label: string }) => b.label.replace(/\s\d{4}$/, '')
const PERIODS = ['year', 'season', 'month'] as const
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
/** "an October goal", "a November goal". */
const aOrAn = (word: string) => /^[aeiou]/i.test(word) ? 'an' : 'a'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Month: whether the season's goals show beside the month (one viewer's
// preference; the page works the same without it).
const SOURCE_SHOWN_KEY = 'symphony.month.seasonGoalsShown'
function readSourceShown(): boolean {
  try { return localStorage.getItem(SOURCE_SHOWN_KEY) !== '0' } catch { return true }
}
function writeSourceShown(shown: boolean) {
  try { localStorage.setItem(SOURCE_SHOWN_KEY, shown ? '1' : '0') } catch { /* private window */ }
}

// ---- Season board: flag (Season agent's region) --------------------------
/** Season uses the collection-and-source board Month introduced. */
const SEASON_BOARD = false
// ---- end Season flag ------------------------------------------------------
// ---- Year board: flag (Year agent's region) --------------------------------
/** Year uses the collection-and-source board Month introduced. */
const YEAR_BOARD = false
// ---- end Year flag --------------------------------------------------------

/** The element that scrolls the page, so Show all can return to where you were. */
function scrollHost(el: HTMLElement | null): HTMLElement | null {
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
  const [sourceShown, setSourceShown] = useState(readSourceShown)
  // A link just made: the goal's parent label and the container light up.
  const [linked, setLinked] = useState<{ child: string; parent: string } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  // A goal just added on Month, to bring into view once it arrives.
  const reveal = useRef<string | null>(null)
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

  useEffect(() => {
    if (!linked) return
    const t = setTimeout(() => setLinked(null), 1800)
    return () => clearTimeout(t)
  }, [linked])

  useEffect(() => {
    if (!reveal.current) return
    const row = mainRef.current?.querySelector(`.plan-month-list [data-plan-key="${reveal.current}"]`)
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    reveal.current = null
  }, [tasks, composer])

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
      if (ok && parent && node.level > 0) setLinked({ child: node.key, parent: parent.key })
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
  const walkInBar = useConversationWalk(requested === 3 ? null : { label: walkLabel, message: walkMessage })
  // Month's two columns each scroll on their own down to the landscape.
  const monthLayout = level === 2
  // The collection-and-source board (Month, 2026-10-12), which Season and
  // Year adopt behind their flags. Month-only behaviour stays on monthLayout.
  const boardLayout = monthLayout || (level === 1 && SEASON_BOARD) || (level === 0 && YEAR_BOARD)
  const monthBoardRef = useColumnsFitWindow(boardLayout && dataReady && !error && !goalsError)

  // ---- Season hooks (Season agent's region: hooks only, before the return) -
  // ---- end Season hooks ------------------------------------------------------
  // ---- Year hooks (Year agent's region: hooks only, before the return) -----
  // ---- end Year hooks --------------------------------------------------------

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
  // Two labelled parts below Year, once something is planned and nothing is
  // focused: the cards under a parent, then what is under none.
  const sectioned = !!calm && hasParents
  // Empty parents open while an item is dragged, so they can take it too.
  const emptyOpen = showEmpty || !!dragNode
  const visibleById = new Map(visible.map((t) => [t.id, t]))
  const goalsById = new Map(allNodes.filter((n) => n.goal).map((n) => [n.id, n.goal!]))
  const prepLookup: ReadinessLookup = { task: (id) => visibleById.get(id), goal: (id) => goalsById.get(id) }

  // Month: the season goals selected (by the focus param) light up their
  // month goals in the collection; nothing is folded or filtered away.
  const selected = boardLayout ? focused : null
  const parentOf = (node: PlanNode) => node.parent ? allNodes.find((n) => n.key === node.parent) : undefined
  // The parent one horizon up, named quietly on a linked goal.
  const parentLabelOf = (parent: PlanNode | undefined) => parent
    ? { kind: level === 1 ? `${anchor.getFullYear()} goal` : `${seasonWord} goal`, title: parent.title } : undefined

  const renderItem = (node: PlanNode) => {
    const canMove = level > 0 && !!node.task && !allNodes.some((n) => n.level === level - 1 && n.id === node.id)
    const moveParents = canMove ? eligibleParents(allNodes, node).filter((p) => !isDone(p) || p.key === node.parent) : []
    const scheduled = node.task?.scheduledFor
    const more: { label: string; onSelect: () => void }[] = []
    if (node.task && selection) more.push({ label: 'Open details', onSelect: () => selection.setSelection({ kind: 'task', id: node.id }) })
    if (level < 2) more.push({ label: `See its ${TERMS[level + 1]}s →`, onSelect: () => setHorizon(level + 1, node.key) })
    const editing = composer?.kind === 'edit' && composer.key === node.key
    return <PlanItemRow key={node.key} node={node}
      parentLabel={boardLayout && level > 0 ? parentLabelOf(parentOf(node)) : undefined}
      related={!!selected?.has(node.parent ?? UNLINKED)}
      linked={linked?.child === node.key}
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
    // In its own labelled part, the loose group's heading would say it twice.
    const headless = sectioned && g.kind === 'unlinked'
    return <li key={g.key} className="plan-group-slot">
      <section className={`canvas-group plan-group${g.kind === 'unlinked' ? ' is-unlinked' : ''}${dropKey === g.key ? ' is-drop' : ''}${dragNode && canDrop(g) ? ' is-drop-ok' : ''}`}
        aria-label={g.kind === 'parent' ? `Under ${title}` : title} data-group-key={g.key} {...dropProps(g)}>
        {g.crumb && <p className="plan-group-crumb">{g.crumb}</p>}
        {!headless && <header className="canvas-group-head">
          {g.kind === 'intentions'
            ? <h2 className="canvas-group-title">{title}</h2>
            : <h2 className="canvas-group-title"><button type="button" className="plan-group-focus" aria-pressed={isFocused} aria-label={`Focus on ${title}`}
                onClick={() => isFocused ? clearFocus() : focusGroup(g.key)}>{title}</button></h2>}
        </header>}
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
  const stepper = <nav className="plan-stepper" aria-label="Planning horizon" data-explain="horizons" data-explain-label="Year, Season, Month, Week">
    {HORIZONS.map((h, i) => <button key={h} type="button" aria-current={i === level ? 'step' : undefined} onClick={() => setHorizon(i)}>{h}</button>)}
    <Link to={weekHref} className="plan-stepper-week">Week →</Link>
  </nav>
  const walk = <button type="button" className="plan-walk" onClick={() => openAssistant({ message: walkMessage, autoSend: true })}>{walkLabel}</button>

  // ---- Month: the complete collection, with the season beside it ----------
  const monthGoal = `${aOrAn(periodWord)} ${periodWord} goal`
  const monthItems = allNodes.filter((n) => n.level === 2 && (showDone || !isDone(n)))
  const sources = groups.filter((g) => g.kind === 'parent')
  const selectSource = (key: string) => selected?.size === 1 && selected.has(key)
    ? clearFocus()
    : setParams((prev) => { const p = new URLSearchParams(prev); p.set('focus', key); return p }, { replace: true })
  const toggleSource = () => setSourceShown((shown) => { writeSourceShown(!shown); return !shown })
  const addMonthGoal = async (text: string, parent: PlanNode | null) => {
    const id = crypto.randomUUID()
    const ok = await runCreate(2, text, parent, `Add “${text}”${parent ? ` under “${parent.title}”` : ''}`, id)
    if (ok) { reveal.current = `2:${id}`; setComposer(null) }
    return ok
  }
  const selectedSources = selected ? sources.filter((g) => selected.has(g.key)) : []
  const selectedCount = selected ? monthItems.filter((n) => selected.has(n.parent ?? UNLINKED)).length : 0

  const renderSource = (g: PlanGroup) => {
    const parent = g.parent!
    const isSelected = !!selected?.has(g.key)
    const adding = composer?.kind === 'add' && composer.group === g.key
    const open = childCount(allNodes, parent)
    return <li key={g.key} className="plan-group-slot">
      <section className={`canvas-group plan-group plan-source${isSelected ? ' is-selected' : ''}${linked?.parent === g.key ? ' is-linked' : ''}${dropKey === g.key ? ' is-drop' : ''}${dragNode && canDrop(g) ? ' is-drop-ok' : ''}`}
        aria-label={`Under ${parent.title}`} data-group-key={g.key} {...dropProps(g)}>
        {g.crumb && <p className="plan-group-crumb" title={g.crumb}>{g.crumb}</p>}
        <header className="canvas-group-head">
          <h3 className="canvas-group-title"><button type="button" className="plan-group-focus" aria-pressed={isSelected}
            onClick={() => selectSource(g.key)}>{parent.title}</button></h3>
          {isDone(parent) && <span className="canvas-tag plan-tag-done">Done</span>}
        </header>
        <p className="plan-source-count">{open > 0 ? plural(open, `${periodWord} goal`) : `Nothing for ${periodWord} yet`}</p>
        {isSelected && g.items.length > 0 && <ul className="plan-source-preview" aria-label={`${periodWord} goals under ${parent.title}`}>
          {g.items.map((n) => <li key={n.key} className={isDone(n) ? 'is-done' : undefined}>{n.title}</li>)}
        </ul>}
        {adding
          ? <InlineComposer label={`New ${periodWord} goal under ${parent.title}`} saveLabel="Add"
              onSave={(text) => addMonthGoal(text, parent)} onCancel={() => setComposer(null)} />
          : <button type="button" className="canvas-link plan-add" aria-label={`Add ${monthGoal} under ${parent.title}`} disabled={!dataReady}
              onClick={() => { if (!isSelected) selectSource(g.key); setComposer({ kind: 'add', group: g.key, parent }) }}>+ Add {monthGoal}</button>}
      </section>
    </li>
  }

  const addingLoose = composer?.kind === 'add' && composer.group === UNLINKED
  const monthBoard = <div ref={monthBoardRef} className={`plan-month-board${sourceShown ? '' : ' is-source-hidden'}`}>
    {/* The month first: it is what the page is for, and what a phone shows
        first. Wide screens put the season on its left (canvas-plan.css). */}
    <section className="plan-month-goals" aria-labelledby="plan-month-question" data-explain="month" data-explain-label={`Every ${periodWord} goal`}>
      <div className="plan-month-intro">
        <h2 id="plan-month-question">What do you want to accomplish in {periodWord}?</h2>
        <p>Build your month from your {seasonWord} goals, and add anything else that matters.</p>
      </div>
      {selectedSources.length > 0 && <div className="plan-month-selection">
        <span role="status">{selectedCount > 0 ? `Highlighting ${plural(selectedCount, `${periodWord} goal`)}` : `No ${periodWord} goals yet`} for {selectedSources.length === 1 ? selectedSources[0].parent!.title : `${selectedSources.length} ${seasonWord} goals`}</span>
        <button type="button" className="canvas-link" onClick={clearFocus}>Clear · Esc</button>
      </div>}
      <ul className={`plan-items plan-month-list${selected ? ' has-selection' : ''}`} aria-label={`${periodWord} goals`}>
        {monthItems.map(renderItem)}
        {proposals.map((p) => {
          const parent = allNodes.find((n) => n.level === 1 && n.id === p.parentId)
          return <ProposalRow key={p.key} proposal={p} parentLabel={parentLabelOf(parent)} onKeep={() => { void keepProposal(p) }} onLeave={() => activity.removeProposal(p.key)} />
        })}
      </ul>
      {monthItems.length === 0 && proposals.length === 0 && !addingLoose && <p className="plan-empty">
        {sources.length > 0 ? `Nothing for ${periodWord} yet. Add one from a ${seasonWord} goal, or one of its own below.` : `Nothing for ${periodWord} yet.`}
      </p>}
      {sources.length > 0 && monthItems.some((n) => !n.parent && !isDone(n)) && <button type="button" className="canvas-link plan-suggest-links"
        onClick={() => openAssistant({ message: `Which ${parentName} does each of my items under no ${parentName} for ${periodTitle} belong under? Suggest links; don't link anything until I keep them.`, autoSend: true })}>Suggest {seasonWord} goals for the ones on their own</button>}
      {addingLoose
        ? <InlineComposer label={`New ${periodWord} goal`} saveLabel="Add" extra={area.picker}
            onSave={(text) => addMonthGoal(text, null)} onCancel={() => setComposer(null)} />
        : <button type="button" className="canvas-link plan-add" aria-label={`Add ${monthGoal} of its own`} disabled={!dataReady}
            onClick={() => setComposer({ kind: 'add', group: UNLINKED, parent: null })}>+ Add {monthGoal}</button>}
      {monthItems.length > 0 && <footer className="plan-month-next">
        <Link to={weekHref} className="plan-next" data-explain="next" data-explain-label="Plan a week from these goals">Plan a week from these goals →</Link>
        <span>Week turns them into tasks with days.</span>
      </footer>}
    </section>
    {/* Hidden, not removed: an unfinished goal typed in a container survives. */}
    <section id="plan-month-source" className="plan-month-source" hidden={!sourceShown} aria-labelledby="plan-month-source-title"
      data-explain="source" data-explain-label={`${seasonWord} goals, the source for ${periodWord}`}>
      <div className="plan-section-head">
        <h2 id="plan-month-source-title">{seasonWord} goals</h2>
        <p>Select one to see its {periodWord} goals, or add one from it.</p>
      </div>
      {sources.length > 0
        ? <ul className="plan-groups plan-source-grid" aria-label={`${seasonWord} goals`}>{sources.map(renderSource)}</ul>
        : <p className="plan-empty">No {seasonWord} goals yet. <button type="button" className="canvas-link" onClick={() => setHorizon(1)}>Add {seasonWord} goals</button></p>}
    </section>
  </div>

  // ---- Season board (Season agent's region: render) -------------------------
  const seasonBoard: ReactNode = null
  const seasonToolbar: ReactNode = null
  // ---- end Season board ------------------------------------------------------
  // ---- Year board (Year agent's region: render) -----------------------------
  const yearBoard: ReactNode = null
  const yearToolbar: ReactNode = null
  // ---- end Year board --------------------------------------------------------

  return <main ref={mainRef} className={`plan-canvas ${PAGE_PLANNING}${boardLayout ? ' plan-month' : ''}`} data-horizon={level}>
    <header className="plan-head">
      {/* Without the docked bar (phones) the page offers both itself. */}
      <div className="plan-head-row">{stepper}{!walkInBar && walk}{!walkInBar && <button type="button" className="plan-walk" onClick={() => openAssistant({ message: EXPLAIN_MESSAGE, autoSend: true, stayOnPage: true })}>{EXPLAIN_LABEL}</button>}</div>
      <div className="plan-period" data-explain="period" data-explain-label={`${periodTitle}, ${periodRange(bounds.start, bounds.end)}`}>
        <button type="button" className="plan-step" onClick={() => setStart(bounds.prev)} aria-label={`Previous ${PERIODS[level]}`}><ChevronLeft size={18} aria-hidden="true" /></button>
        <h1>{periodTitle}</h1>
        <button type="button" className="plan-step" onClick={() => setStart(bounds.next)} aria-label={`Next ${PERIODS[level]}`}><ChevronRight size={18} aria-hidden="true" /></button>
        <span className="plan-period-range">{periodRange(bounds.start, bounds.end)}</span>
        {!current && <button type="button" className="period-return canvas-link" onClick={() => setStart(null)}>Back to this {PERIODS[level]}</button>}
      </div>
    </header>
    <div className="plan-toolbar">
      {monthLayout && dataReady && <button type="button" className="canvas-link plan-source-toggle" aria-expanded={sourceShown} aria-controls="plan-month-source"
        onClick={toggleSource}>{sourceShown ? `Hide ${seasonWord} goals` : `Show ${seasonWord} goals`}</button>}
      {level === 1 && SEASON_BOARD && seasonToolbar}
      {level === 0 && YEAR_BOARD && yearToolbar}
      {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all ({proposals.length})</button>}
      {(doneCount > 0 || showDone) && <button type="button" className="canvas-link" aria-pressed={showDone} onClick={() => setShowDone((s) => !s)}>
        {showDone ? `Hide done (${doneCount})` : `Show done (${doneCount})`}
      </button>}
    </div>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : !dataReady ? null
      : monthLayout ? monthBoard
      : level === 1 && SEASON_BOARD ? seasonBoard
      : level === 0 && YEAR_BOARD ? yearBoard
      : <div className="plan-body"><div className="plan-board">
        {focused && <div className="plan-focus-bar">
          <span role="status">Showing {focused.size} of {groups.length} groups</span>
          <button type="button" className="canvas-link" onClick={clearFocus}>Show all · Esc</button>
        </div>}
        <div className={sectioned ? 'plan-section' : undefined} {...(sectioned ? { 'data-explain': 'under', 'data-explain-label': `Under a ${parentName}: one card per ${parentName}` } : {})}>
        {sectioned && <div className="plan-section-head">
          <h2 id="plan-under">Under a {parentName}</h2>
          <p>Each card is one of your {level === 1 ? `${anchor.getFullYear()} year goals` : `${parentName}s`}.</p>
        </div>}
        <ul className={`plan-groups${focused ? ' is-focused' : ''}${level === 0 ? ' is-year' : ''}`} aria-label={`${HORIZONS[level]} plan`} data-explain-label={sectioned ? `The cards, one per ${parentName}` : undefined}>
          {(calm ? sectioned ? calm.shown.filter((g) => g.kind === 'parent') : calm.shown : groups).map(renderGroup)}
        </ul>
        {calm && calm.empty.length > 0 && <>
          <button type="button" className="canvas-group is-quiet plan-empty-fold" data-explain="folded" data-explain-label={`${calm.empty.length} ${parentName}${calm.empty.length === 1 ? '' : 's'} with nothing in ${periodWord}`} aria-expanded={emptyOpen} aria-controls="plan-empty-goals" onClick={() => setShowEmpty((v) => !v)}>
            <b>{calm.empty.length} {parentName}{calm.empty.length === 1 ? '' : 's'} with nothing in {periodWord}</b>
            {!emptyOpen && <span className="plan-empty-fold-names">{calm.empty.slice(0, 4).map(groupTitle).join(' · ')}{calm.empty.length > 4 ? ` · and ${calm.empty.length - 4} more` : ''}</span>}
            <span className="canvas-link">{emptyOpen ? 'Hide' : 'Show'}</span>
          </button>
          {emptyOpen && <ul id="plan-empty-goals" className="plan-groups" aria-label={`${parentName}s with nothing in ${periodWord}`}>{calm.empty.map(renderGroup)}</ul>}
        </>}
        </div>
        {sectioned && <div className="plan-section is-loose" data-explain="loose" data-explain-label={`Not under a ${parentName}`}>
          <div className="plan-section-head">
            <h2>Not under a {parentName}</h2>
            <p>Fine to leave here. To put one under a {parentName}, drag it onto a card above or use Move under.</p>
          </div>
          <ul className="plan-groups is-loose" aria-label={`Not under a ${parentName}`}>
            {calm!.shown.filter((g) => g.kind === 'unlinked').map(renderGroup)}
          </ul>
        </div>}
        <footer className="plan-foot">
          {hasItems && (level < 2
            ? <button type="button" className="plan-next" data-explain="next" data-explain-label={`Next: ${HORIZONS[level + 1]}`} onClick={() => setHorizon(level + 1)}>Next: {HORIZONS[level + 1]} →</button>
            : <Link to={weekHref} className="plan-next" data-explain="next" data-explain-label="Next: Week">Next: Week →</Link>)}
        </footer>
      </div></div>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
