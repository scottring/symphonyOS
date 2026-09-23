import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft, Target, ChevronDown, Check } from 'lucide-react'
import { periodBounds } from '@/lib/planning/periodPage'
import { readSeasons } from '@/lib/cadence/seasons'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { PlanningSheet } from '@/components/reference/PlanningSheet'
import { GoalsSheet } from '@/components/plan/GoalsSheet'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'

/** Phone: a page's own header controls (filters, ⋯) join the horizon-tab row
 *  instead of adding rows above the date. Falls back to inline rendering. */
export const MobilePlanControlsContext = createContext<HTMLElement | null>(null)
export function MobilePlanControls({ children }: { children: ReactNode }) {
  const host = useContext(MobilePlanControlsContext)
  return host ? createPortal(children, host) : <>{children}</>
}

const PERIODS = ['today', 'week', 'month', 'season', 'year'] as const
export function planPeriodForPath(path: string) {
  if (path === '/' || path.startsWith('/tasks-new')) return 'today'
  return PERIODS.find(period => path === `/${period}` || path.startsWith(`/${period}/`))
}

/**
 * Where the `Planner` entry in the primary navigation points.
 *
 * On a planner page it points at the page you are on, so the entry reads as
 * "you are here" rather than sending you somewhere else. From anywhere else —
 * Routines, Inbox, a detail route — it points at Today.
 *
 * It used to fall back to the last horizon you visited, remembered in
 * localStorage. That made Today cost two clicks for the rest of the session
 * once you had opened Month or Season (walk finding S1-11: "it should be VERY
 * easy to get back tro the today page"). Today is the page the whole app exists
 * to make right; it is never more than one click away now, and the horizon tabs
 * sit on the page for everything else.
 */
export function usePlanDestination() {
  const { pathname } = useLocation()
  return `/${planPeriodForPath(pathname) ?? 'today'}`
}

const HORIZON_NAMES: Record<typeof PERIODS[number], string> = {
  today: 'Today', week: 'Week', month: 'Month', season: 'Season', year: 'Year',
}

function horizonSubtitle(period: typeof PERIODS[number], now: Date): string {
  if (period === 'today') return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (period === 'week') return "This week's list and days"
  if (period === 'year') return 'Goals for the year'
  try { return periodBounds(period, now, readSeasons()).label } catch { return '' }
}

/** Phone: one horizon at a time, switched from a compact title menu rather
 *  than a row of five tabs (native PlannerView; mockup review 2026-09-23). */
function HorizonSwitcher({ period }: { period: typeof PERIODS[number] }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const now = new Date()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return <div className="horizon-switcher">
    <button type="button" className="horizon-switcher-title" aria-haspopup="menu" aria-expanded={open}
      aria-label={`${HORIZON_NAMES[period]}. Switch horizon`} onClick={() => setOpen(o => !o)}>
      {HORIZON_NAMES[period]}<ChevronDown aria-hidden="true" />
    </button>
    {open && <>
      <button type="button" className="horizon-switcher-scrim" aria-label="Close" onClick={() => setOpen(false)} />
      <div role="menu" aria-label="Planning horizon" className="horizon-switcher-menu">
        {PERIODS.map(value => <button key={value} type="button" role="menuitemradio" aria-checked={period === value}
          onClick={() => { setOpen(false); navigate(`/${value}`) }}>
          <span><strong>{HORIZON_NAMES[value]}</strong><small>{horizonSubtitle(value, now)}</small></span>
          {period === value && <Check aria-hidden="true" />}
        </button>)}
      </div>
    </>}
  </div>
}

/** Page tools are deliberately outside primary destination navigation. */
export function PlanNavigation({ mobile = false, paused = false, mobileControlsRef }: {
  mobile?: boolean; paused?: boolean
  /** Phone only: the slot MobilePlanControls portals into. */
  mobileControlsRef?: (node: HTMLDivElement | null) => void
}) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const period = planPeriodForPath(pathname)
  const references = useReferenceLists()
  const pinned = !!references?.pins.some(pin => pin.kind === 'today')
  const [sheetPath, setSheetPath] = useState<string | null>(null)
  // The ◎ Goals reference opens the same sheet at every width (ruling: one
  // component; a desktop pinned panel is a follow-up).
  const [goalsOpen, setGoalsOpen] = useState(false)
  const sheetOpen = sheetPath === pathname
  // Horizon pages own their Shelves launcher in the date masthead.
  const onToday = pathname === '/' || pathname === '/today' || pathname.startsWith('/tasks-new')
  const broaderPeriod = ['month', 'season', 'year'].includes(period ?? '')
  const showChooser = !period && !onToday && !mobile
  // The kept-pins note ("Lists return when you close the side panel") is
  // still said on Today, even though its chooser button lives on the page.
  const pausedNote = !mobile && paused && !!references && references.pins.length > 0
  if (!period && !showChooser && !pausedNote) return null
  const range = new URLSearchParams(search).get('range') ?? 'today'
  return <div className="plan-page-tools" data-period={period}>
    {period && <div className="plan-period-controls">
      {mobile ? <HorizonSwitcher period={period} /> : <nav aria-label="Planning period" className="plan-period-navigation">
        {PERIODS.map(value => <NavLink key={value} to={`/${value}`} aria-current={period === value ? 'page' : undefined}
          className={period === value ? 'is-current' : ''}>{value[0].toUpperCase() + value.slice(1)}</NavLink>)}
      </nav>}
      {period === 'week' && <label className="plan-range-control"><span className="sr-only">Range</span>
        <select aria-label="Week range" value={['week', 'weekend', 'three', 'custom'].includes(range) ? range : 'week'}
          onChange={event => navigate(event.target.value === 'week' ? '/week' : `/week?range=${event.target.value}`)}>
          <option value="week">Full week</option><option value="weekend">Weekend</option>
          <option value="three">3 days</option><option value="custom">Custom range…</option>
        </select>
      </label>}
    </div>}
    {(showChooser || pausedNote) && references && <div className="task-chooser-control">
      {showChooser && <button type="button" aria-label={pinned && !mobile ? 'Close shelves' : 'Shelves'}
        aria-pressed={mobile ? sheetOpen : pinned}
        onClick={() => mobile ? setSheetPath(sheetOpen ? null : pathname) : pinned ? references.unpin('today') : references.pin('today')}>
        <PanelLeft size={15} aria-hidden="true" />Shelves
      </button>}
      {pausedNote && <span>Lists return when you close the side panel.</span>}
    </div>}
    {period && <div className="goals-reference-control">
      <button type="button" aria-label="Goals" aria-expanded={goalsOpen} onClick={() => setGoalsOpen(open => !open)}>
        <Target size={15} aria-hidden="true" /><span className="goals-reference-label">Goals</span>
      </button>
    </div>}
    {/* Phone: the life-area lens rides on this row (Today folds it into
        its Filters control instead). */}
    {period && mobile && period !== 'today' && <DomainSwitcher />}
    {period && mobile && <div ref={mobileControlsRef} className="plan-mobile-controls" />}
    {period && <GoalsSheet open={goalsOpen} onClose={() => setGoalsOpen(false)} />}
    {mobile && showChooser && <PlanningSheet open={sheetOpen} onClose={() => setSheetPath(null)} periodShelves={broaderPeriod} />}
  </div>
}
