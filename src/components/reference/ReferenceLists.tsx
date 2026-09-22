import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Pin, X } from 'lucide-react'
import { useReferenceLists, REFERENCE_KINDS, type ReferenceKind, type ReferencePin } from './ReferenceListsContext'
import { DayPlanPanel, panelActionsFor, planningSubtitle } from './DayPlanPanel'
import { useDayPlan } from '@/hooks/useDayPlan'
import { readViewedWeek, onViewedWeekChange } from '@/lib/viewedWeekSignal'
import { usePlanActions } from '@/hooks/usePlanActions'
import { planDropHandlers } from '@/lib/planning/planDrag'
import { pinIsOnPage } from './periodsOnPage'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { selectHorizonPool } from '@/lib/today/horizons'
import { weekListTasks } from '@/lib/planning/weekList'
import { doableBy } from '@/lib/planning/poolViews'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { weekStartAnchor, readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { placementFate } from '@/lib/planning/lineage'
import { TriageRow, applyTriageVerdict, type Verdict } from '@/components/schedule/TriageRow'
import type { Task } from '@/types/task'

const KIND_LABEL: Record<ReferenceKind, string> = { today: 'Planning', week: 'Week', month: 'Month' }

export function ReferenceListControls({ paused = false }: { paused?: boolean }) {
  const ref = useReferenceLists()
  const { pathname } = useLocation()
  if (!ref) return null
  return <div className="reference-controls flex flex-wrap items-center gap-2 px-5 py-3 text-[13px] text-neutral-500">
    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
    <span>Reference</span>
    {REFERENCE_KINDS.map(kind => {
      const pinned = ref.pins.some(p => p.kind === kind)
      // This page is already showing that list, so the pin has no panel to
      // draw here. It is kept, and says so, rather than reading as broken.
      const onPage = pinned && pinIsOnPage(pathname, kind)
      return <button key={kind} type="button" aria-pressed={pinned}
        aria-label={`${pinned ? 'Unpin' : 'Pin'} ${kind === 'today' ? 'Planning' : `${kind} list`}`}
        onClick={() => pinned ? ref.unpin(kind) : ref.pin(kind)}
        className={`rounded px-3 py-1 ${pinned ? 'bg-primary-50 text-primary-800' : 'hover:bg-neutral-100'}`}>
        {KIND_LABEL[kind]}{onPage ? ' · on this page' : pinned ? ' · pinned' : ''}
      </button>
    })}
    {paused && ref.pins.length > 0 && <span className="text-xs text-neutral-500">Lists return when you close the side panel.</span>}
  </div>
}

export function ReferenceListsDock() {
  const ref = useReferenceLists()
  const { pathname } = useLocation()
  // A pin whose period this page already shows is skipped, not unpinned: the
  // page holds the period's whole record (completed and placed rows and all),
  // and a pooled copy beside it would be both redundant and less complete.
  // Today's plan first (it is about now), then the week, then the month.
  const showing = useMemo(
    () => (ref?.pins ?? [])
      .filter(pin => !pinIsOnPage(pathname, pin.kind))
      .sort((a, b) => REFERENCE_KINDS.indexOf(a.kind) - REFERENCE_KINDS.indexOf(b.kind)),
    [ref?.pins, pathname])
  if (!showing.length) return null
  return <aside aria-label="Pinned reference lists" className="reference-dock">
    {showing.map(pin => pin.kind === 'today'
      ? <TodayPlanList key="today" onClose={() => ref!.unpin('today')} />
      : <ReferenceList key={`${pin.kind}:${pin.date}`} pin={pin} onClose={() => ref!.unpin(pin.kind)} />)}
  </aside>
}

function ReferenceList({ pin, onClose }: { pin: ReferencePin; onClose: () => void }) {
  const { tasks, loading, error: loadError, updateTask, updateTasksBulk, pushTask, toggleTask } = useSupabaseTasks()
  const { layers } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const me = getCurrentUserMember()?.id
  const raw = useMemo(() => ({ updateTask, updateTasksBulk, pushTask }), [updateTask, updateTasksBulk, pushTask])
  const findTask = useCallback((id: string) => tasks.find(t => t.id === id), [tasks])
  const gated = useGatedTaskActions(raw, findTask)
  const visible = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const date = new Date(pin.date)
  const week = weekStartAnchor(date, readCadenceConfig().weekStartsOn)
  // The week list reads the same definition the week page and the week
  // session do (`weekListTasks`) so a row picked for today (bucket: 'timed',
  // a week commitment record) stays on this pin instead of vanishing the
  // moment it's placed — the old `selectHorizonPool` pool question was
  // bucket==='week' only, which dropped it. Completed rows are still
  // dropped here: this panel is a pin, not the week page's whole record.
  const pool = pin.kind === 'week'
    ? weekListTasks(visible, week, me ?? null).filter(t => !t.completed)
    : selectHorizonPool(visible, pin.kind,
      (assignedTo, assignedToAll) => !me || doableBy({ assignedTo: assignedTo ?? undefined, assignedToAll: assignedToAll ? [...assignedToAll] : undefined }, me),
      week, monthStartOf(date))
  const label = pin.kind === 'week' ? 'Week list' : 'Month list'
  const period = pin.kind === 'month'
    ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `Week of ${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Record<string, Verdict>>({})
  async function act(task: Task, verdict: Verdict) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (verdict === 'completed') await toggleTask(task.id)
      else {
        const written = await applyTriageVerdict(task, verdict, {
          viewedDate: new Date(), onUpdateTask: gated.updateTask, onPushTask: gated.pushTask,
        })
        if (!written) return
      }
      setResolved(prev => ({ ...prev, [task.id]: verdict }))
    } catch { setError('Could not save that change. Please try again.') }
    finally { setBusy(false) }
  }
  // A task dragged out of the Today pin commits to this period's list — no
  // day or time invented.
  const planActions = usePlanActions()
  const [dropOver, setDropOver] = useState(false)
  const kind = pin.kind as 'week' | 'month'
  const dropProps = planDropHandlers((payload) => {
    void planActions.drop(payload, { type: 'period', period: kind })
  }, setDropOver)
  return <section aria-label={`${label}: ${period}`} {...dropProps}
    className={`reference-list${dropOver ? ' reference-list-drop' : ''}`}>
    <header className="flex items-start justify-between gap-3 border-b border-neutral-300 pb-4">
      <div><h2 className="font-display text-[22px] leading-tight text-neutral-900">{label}</h2><p className="mt-1 text-[13px] text-neutral-500">{period}</p></div>
      <button type="button" onClick={onClose} aria-label={`Unpin ${pin.kind} list`} className="p-2 text-neutral-500 hover:bg-neutral-100 rounded"><X className="w-4 h-4" /></button>
    </header>
    {error && <p role="alert" className="py-3 text-sm text-danger-600">{error}</p>}
    {loading ? <p className="py-5 text-[15px] text-neutral-500">Loading list…</p> : loadError ? <p role="alert" className="py-5 text-[15px] text-danger-600">Could not load this list.</p> : pool.length === 0 ? <p className="py-5 text-[15px] text-neutral-500">Nothing on this list yet.</p> :
      <fieldset disabled={busy} className="min-w-0" aria-busy={busy}>
        <ul className="divide-y divide-neutral-200">{pool.map(task => <TriageRow key={task.id} task={task}
          offer={pin.kind === 'week' ? ['today'] : ['week', 'today']}
          lead={pin.kind === 'week' ? 'today' : 'week'}
          placed={pin.kind === 'month' ? placementFate(task, visible) : undefined}
          verdict={resolved[task.id]} canDelete={false}
          onVerdict={(t, v) => void act(t, v)} onComplete={t => void act(t, 'completed')} />)}</ul>
      </fieldset>}
  </section>
}

/**
 * The Planning panel's contents, wherever it is drawn (the dock beside a
 * page, or the sheet on a phone): the day's plan for the actual current day,
 * planning into whichever week a week page is showing.
 */
export function PlanningPanelHost({ draggable = true, header }: {
  draggable?: boolean
  /** Drawn above the panel with the same day and week the panel plans —
   *  ONE subscription to the viewed-week signal, not one per header. */
  header?: (day: Date, viewedWeek: Date | null) => ReactNode
}) {
  // Always the real current day — the pin's stored date is only when it was
  // pinned. Keyed on the calendar day so it rolls over at midnight.
  const todayKey = localYmd(new Date())
  const day = useMemo(() => { const [y, m, d] = todayKey.split('-').map(Number); return new Date(y, m - 1, d) }, [todayKey])
  // A week page beside the panel announces the week it is showing, so the
  // list is the same list that page is planning into.
  const [viewedWeek, setViewedWeek] = useState<Date | null>(() => readViewedWeek())
  useEffect(() => {
    // Re-read on subscribe: a page that published before this listener
    // existed (both mounting from a stored pin) would otherwise be missed.
    setViewedWeek(readViewedWeek())
    return onViewedWeekChange(setViewedWeek)
  }, [])
  const { plan, loading, error } = useDayPlan(day, viewedWeek)
  const planActions = usePlanActions()
  const navigate = useNavigate()
  // Changing a routine's repeating schedule is its own explicit action, on
  // the routine's page — never a side effect of placing it.
  const actions = useMemo(() => panelActionsFor(day, planActions, { changeRoutineRule: () => navigate('/routines') }), [day, planActions, navigate])
  const body = error ? <p role="alert" className="py-5 text-[15px] text-danger-600">Could not load the plan.</p>
    : loading || !plan ? <p className="py-5 text-[15px] text-neutral-500">Loading…</p>
    : <DayPlanPanel plan={plan} day={day} actions={actions} weekPage={viewedWeek} draggable={draggable} />
  return <>{header?.(day, viewedWeek)}{body}</>
}

/** The Planning pin: one panel, named for what it does, for whichever day or
 *  week is on screen. */
function TodayPlanList({ onClose }: { onClose: () => void }) {
  return <section aria-label="Choose tasks" className="reference-list">
    <PlanningPanelHost header={(day, viewedWeek) => (
      <header className="flex items-start justify-between gap-3 border-b border-neutral-300 pb-4">
        <div>
          {/* Beside a day the panel picks for today (Scott via Codex,
              2026-09-22); beside a week page it plans that week. */}
          <h2 className="font-display text-[22px] leading-tight text-neutral-900">{viewedWeek ? 'Choose tasks' : 'Choose for today'}</h2>
          <p className="mt-1 text-[13px] text-neutral-500">{planningSubtitle(day, viewedWeek)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close task chooser" className="p-2 text-neutral-500 hover:bg-neutral-100 rounded"><X className="w-4 h-4" /></button>
      </header>
    )} />
  </section>
}
