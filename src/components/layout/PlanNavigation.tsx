import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft, ChevronDown, Check } from 'lucide-react'
import { periodBounds } from '@/lib/planning/periodPage'
import { readSeasons } from '@/lib/cadence/seasons'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { PlanningSheet } from '@/components/reference/PlanningSheet'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { DesktopCenterContext } from '@/components/layout/DesktopNavigation'
import { railEntries } from '@/lib/planning/horizonNumerals'
import { readCadenceConfig } from '@/lib/cadence/config'

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

const RAIL_ORDER = ['year', 'season', 'month', 'week', 'today'] as const

/** Desktop: "2026 Year — 09–11 Fall — 09 September — 40 Week — 28 Today". */
function HorizonRail({ period }: { period?: typeof PERIODS[number] }) {
  const { search } = useLocation()
  // The rail wears the period being SHOWN, big to small — October's page
  // says "10 October" and its week, not the clock's September. Today is
  // always today.
  const params = new URLSearchParams(search)
  const start = params.get('start') ?? (period === 'week' ? params.get('date') : null)
  const valid = !!start && /^\d{4}-\d{2}-\d{2}$/.test(start) && (period === 'month' || period === 'season' || period === 'week' || period === 'year')
  const shown = valid ? (() => { const [y, m, d] = start!.split('-').map(Number); return { period: period as 'year' | 'season' | 'month' | 'week', start: new Date(y, m - 1, d) } })() : null
  const steps = railEntries(new Date(), shown, readSeasons(), readCadenceConfig().weekStartsOn)
  return <nav aria-label="Planning period" className="horizon-rail">
    {RAIL_ORDER.map((value, k) => <span key={value} className="horizon-rail-step">
      {k > 0 && <span className="horizon-rail-join" aria-hidden="true" />}
      <NavLink to={steps[value].to} aria-current={period === value ? 'page' : undefined} className={period === value ? 'is-current' : ''}
        aria-label={HORIZON_NAMES[value]} title={`${HORIZON_NAMES[value]} · ${steps[value].label}`}>
        <span className="horizon-rail-n">{steps[value].n}</span><span className="horizon-rail-l">{steps[value].label}</span>
      </NavLink>
    </span>)}
  </nav>
}

/** Page tools are deliberately outside primary destination navigation. */
export function PlanNavigation({ mobile = false, paused = false, mobileControlsRef }: {
  mobile?: boolean; paused?: boolean
  /** Phone only: the slot MobilePlanControls portals into. */
  mobileControlsRef?: (node: HTMLDivElement | null) => void
}) {
  const { pathname } = useLocation()
  const period = planPeriodForPath(pathname)
  const references = useReferenceLists()
  const pinned = !!references?.pins.some(pin => pin.kind === 'today')
  const [sheetPath, setSheetPath] = useState<string | null>(null)
  // No ◎ Goals control (Scott, 2026-09-28: "unnecessary") — the Year,
  // Season and Month pages are where goals are read.
  const sheetOpen = sheetPath === pathname
  // Horizon pages own their Shelves launcher in the date masthead.
  const onToday = pathname === '/' || pathname === '/today' || pathname.startsWith('/tasks-new')
  const broaderPeriod = ['month', 'season', 'year'].includes(period ?? '')
  const showChooser = !period && !onToday && !mobile
  // The kept-pins note ("Lists return when you close the side panel") is
  // still said on Today, even though its chooser button lives on the page.
  const pausedNote = !mobile && paused && !!references && references.pins.length > 0
  // The rail pins to the top once the row above scrolls away (2026-09-29):
  // it is the main navigation. A marker just above it says when it is
  // pinned — the hairline appears then, and the footer's scene steps down.
  const center = useContext(DesktopCenterContext)
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (mobile || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [mobile])
  useEffect(() => {
    document.documentElement.classList.toggle('rail-stuck', stuck)
    return () => document.documentElement.classList.remove('rail-stuck')
  }, [stuck])
  if (!mobile && center) {
    // Desktop in the Shell: the rail sits in the centre of the top bar — one
    // row, ☰ · rail · you (Scott, 2026-09-30); the bar pins as a whole. What
    // this row still carries (Shelves off the planner, the paused note)
    // keeps a slim row of its own, only when there is some.
    return <><div ref={sentinel} className="plan-rail-sentinel" aria-hidden="true" />
      {createPortal(<HorizonRail period={period} />, center)}
      {(showChooser || pausedNote) && references && <div className="plan-page-tools is-rail-extras">
        <div className="task-chooser-control">
          {showChooser && <button type="button" aria-label={pinned ? 'Close shelves' : 'Shelves'} aria-pressed={pinned}
            onClick={() => pinned ? references.unpin('today') : references.pin('today')}>
            <PanelLeft size={15} aria-hidden="true" />Shelves
          </button>}
          {pausedNote && <span>Lists return when you close the side panel.</span>}
        </div>
      </div>}
    </>
  }
  if (!mobile) {
    // Desktop: the horizon rail IS the main navigation (Scott, 2026-09-28 —
    // "Planner" is gone from the row above). Centred on every page; a page
    // that is no horizon simply has none marked.
    return <><div ref={sentinel} className="plan-rail-sentinel" aria-hidden="true" />
    <div className={`plan-page-tools is-rail${stuck ? ' is-stuck' : ''}`} data-period={period}>
      <div className="plan-rail-side" />
      <HorizonRail period={period} />
      <div className="plan-rail-side is-right">
        {/* No week-range picker here (Scott, 2026-09-28: "I don't understand
            what it is") — the Week heading's own menu offers the same ranges. */}
        {(showChooser || pausedNote) && references && <div className="task-chooser-control">
          {showChooser && <button type="button" aria-label={pinned ? 'Close shelves' : 'Shelves'} aria-pressed={pinned}
            onClick={() => pinned ? references.unpin('today') : references.pin('today')}>
            <PanelLeft size={15} aria-hidden="true" />Shelves
          </button>}
          {pausedNote && <span>Lists return when you close the side panel.</span>}
        </div>}
      </div>
    </div></>
  }
  if (!period && !showChooser && !pausedNote) return null
  return <div className="plan-page-tools" data-period={period}>
    {period && <div className="plan-period-controls">
      <HorizonSwitcher period={period} />
    </div>}
    {(showChooser || pausedNote) && references && <div className="task-chooser-control">
      {showChooser && <button type="button" aria-label={pinned && !mobile ? 'Close shelves' : 'Shelves'}
        aria-pressed={mobile ? sheetOpen : pinned}
        onClick={() => mobile ? setSheetPath(sheetOpen ? null : pathname) : pinned ? references.unpin('today') : references.pin('today')}>
        <PanelLeft size={15} aria-hidden="true" />Shelves
      </button>}
      {pausedNote && <span>Lists return when you close the side panel.</span>}
    </div>}
    {/* Phone: the life-area lens rides on this row (Today folds it into
        its Filters control instead). */}
    {period && mobile && period !== 'today' && <DomainSwitcher />}
    {period && mobile && <div ref={mobileControlsRef} className="plan-mobile-controls" />}
    {mobile && showChooser && <PlanningSheet open={sheetOpen} onClose={() => setSheetPath(null)} periodShelves={broaderPeriod} />}
  </div>
}
