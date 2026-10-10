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
import { horizonGroups, focusedGroupKeys, childCount, isDone, periodRange, UNLINKED, INTENTIONS, type PlanGroup } from '@/components/canvas/plan/planGroups'
import { PlanItemRow } from '@/components/canvas/plan/PlanItemRow'
import { ProposalRow } from '@/components/canvas/plan/ProposalRow'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'

const TERMS = ['yearly intention', 'seasonal goal', 'monthly milestone', 'weekly action'] as const
const HORIZONS = ['Year', 'Season', 'Month'] as const
const PERIODS = ['year', 'season', 'month'] as const
const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }

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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composer, setComposer] = useState<Composer | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
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

  const moveUnder = (node: PlanNode, parent: PlanNode | null) => {
    const patch = moveUnderPatch(allNodes, node, parent)
    if (!patch) return
    const label = parent ? `Move “${node.title}” under “${parent.title}”` : `Unlink “${node.title}”`
    void act(label, () => updateTask(node.id, patch.after), {
      ids: [node.id],
      undo: async () => (await updateTask(node.id, patch.before)) !== false,
      retry: () => moveUnder(node, parent),
    })
  }

  const keepProposal = async (p: CanvasProposal) => {
    const parent = level > 0 ? allNodes.find((n) => n.level === level - 1 && n.id === p.parentId) ?? null : null
    activity.setProposalState(p.key, 'saving')
    const ok = await runCreate(level, p.title, parent, `Keep “${p.title}”`)
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
            ? { label: 'Reopen intention', onSelect: () => setStatus('active', `Reopen “${node.title}”`) }
            : { label: 'Complete intention', onSelect: () => setStatus('completed', `Complete “${node.title}”`) },
          { label: 'Archive intention', onSelect: () => setStatus('archived', `Archive “${node.title}”`) },
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
  const proposals = activity.proposals.filter((p) => p.level === level && inPeriod(p.periodStart))
  const proposalGroup = (p: CanvasProposal) => {
    if (level === 0) return INTENTIONS
    const key = allNodes.find((n) => n.level === level - 1 && n.id === p.parentId)?.key
    return key && groups.some((g) => g.key === key) ? key : UNLINKED
  }
  const keepAll = async () => { for (const p of proposals.filter((x) => x.state !== 'saving')) await keepProposal(p) }

  // ---- Drag an item onto a group header (desktop shortcut for Move under…) -
  const dragNode = dragKey ? allNodes.find((n) => n.key === dragKey) : undefined
  const canDrop = (g: PlanGroup) => !!dragNode && (g.kind === 'unlinked'
    ? !!dragNode.parent
    : g.kind === 'parent' && !!g.parent && g.parent.key !== dragNode.parent && !!connectionPair(allNodes, dragNode.key, g.parent.key))
  const dropProps = (g: PlanGroup) => level === 0 ? {} : {
    onDragOver: (e: DragEvent) => { if (canDrop(g)) { e.preventDefault(); if (dropKey !== g.key) setDropKey(g.key) } },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropKey((k) => k === g.key ? null : k) },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (dragNode && canDrop(g)) moveUnder(dragNode, g.parent); setDragKey(null); setDropKey(null) },
  }

  if (requested === 3) return <Navigate replace to={`/week?view=alongside&date=${localYmd(anchor)}&start=${localYmd(week)}`} />

  const term = TERMS[level]
  const parentTerm = level > 0 ? TERMS[level - 1] : null
  const walkMessage = level === 0
    ? `Let's plan ${periodTitle}, one yearly intention at a time. Suggest; don't save anything until I keep it.`
    : `Let's plan ${periodTitle} across all my ${parentTerm}s, one at a time. Suggest ${term}s; don't save anything until I keep them.`
  const hasItems = groups.some((g) => g.items.length > 0)
  const weekHref = `/week?view=alongside&date=${localYmd(anchor)}`
  const current = isCurrentPeriod(bounds, now)

  const groupTitle = (g: PlanGroup) => g.kind === 'unlinked' ? 'Unlinked' : g.kind === 'intentions' ? `Yearly intentions` : g.parent!.title
  const addLabel = (g: PlanGroup) => g.kind === 'unlinked' ? `Add an independent ${term}` : g.kind === 'intentions' ? `Add a ${term}` : `Add a ${term} under ${g.parent!.title}`

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
        {empty && !adding && <p className="plan-empty">{g.kind === 'unlinked' ? `Nothing unlinked for ${periodWord}.` : `Nothing for ${periodWord} yet.`}</p>}
        {adding
          ? <InlineComposer label={`New ${term}${g.parent ? ` under ${g.parent.title}` : ''}`} saveLabel="Add"
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

  return <main ref={mainRef} className="plan-canvas" data-horizon={level}>
    <header className="plan-head">
      <nav className="plan-stepper" aria-label="Planning horizon">
        {HORIZONS.map((h, i) => <button key={h} type="button" aria-current={i === level ? 'step' : undefined} onClick={() => setHorizon(i)}>{h}</button>)}
        <Link to={weekHref} className="plan-stepper-week">Week →</Link>
      </nav>
      <div className="plan-period">
        <button type="button" className="canvas-icon" aria-label={`Previous ${PERIODS[level]}`} onClick={() => setStart(bounds.prev)}>‹</button>
        <h1>
          <span className="plan-period-name">{level === 0 ? periodTitle : periodWord}</span>
          {level > 0 && <span className="plan-period-range"> · {periodRange(bounds.start, bounds.end)}</span>}
        </h1>
        <button type="button" className="canvas-icon" aria-label={`Next ${PERIODS[level]}`} onClick={() => setStart(bounds.next)}>›</button>
        {!current && <button type="button" className="canvas-link" onClick={() => setStart(null)}>This {PERIODS[level]}</button>}
      </div>
      <div className="plan-head-actions">
        <button type="button" className="plan-walk" onClick={() => openAssistant({ message: walkMessage, autoSend: true })}>Plan {periodTitle} with Symphony</button>
        {proposals.length > 0 && <button type="button" className="canvas-link" onClick={() => { void keepAll() }}>Keep all ({proposals.length})</button>}
        {(doneCount > 0 || showDone) && <button type="button" className="canvas-link" aria-pressed={showDone} onClick={() => setShowDone((s) => !s)}>
          {showDone ? `Hide done (${doneCount})` : `Show done (${doneCount})`}
        </button>}
      </div>
    </header>

    {!dataReady && <p className="plan-status" role="status">Loading your plans…</p>}
    {(error || goalsError)
      ? <p className="plan-status" role="alert">Plans could not load. <button type="button" className="canvas-link" onClick={() => { if (goalsError) window.location.reload(); else void refetch() }}>Retry</button></p>
      : <>
        {focused && <div className="plan-focus-bar">
          <span role="status">Showing {focused.size} of {groups.length} groups</span>
          <button type="button" className="canvas-link" onClick={clearFocus}>Show all · Esc</button>
        </div>}
        <ul className={`plan-groups${focused ? ' is-focused' : ''}${level === 0 ? ' is-year' : ''}`} aria-label={`${HORIZONS[level]} plan`}>
          {groups.map(renderGroup)}
        </ul>
        <footer className="plan-foot">
          {hasItems && (level < 2
            ? <button type="button" className="plan-next" onClick={() => setHorizon(level + 1)}>Next: {HORIZONS[level + 1]} →</button>
            : <Link to={weekHref} className="plan-next">Next: Week →</Link>)}
          <span className="plan-area">{area.picker}<span>Life area for new independent entries</span></span>
        </footer>
      </>}
  </main>
}

export function ConstellationPage() { return <GoalsProvider><Inner /></GoalsProvider> }
