import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft, Target } from 'lucide-react'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { PlanningSheet } from '@/components/reference/PlanningSheet'
import { GoalsSheet } from '@/components/plan/GoalsSheet'

const PERIODS = ['week', 'month', 'season', 'year'] as const
const STORAGE_KEY = 'symphony-plan-period'
export function planPeriodForPath(path: string) {
  return PERIODS.find(period => path === `/${period}` || path.startsWith(`/${period}/`))
}

/** Persist only the period view, never task content or a stale dated URL. */
export function usePlanDestination() {
  const { pathname } = useLocation()
  const period = planPeriodForPath(pathname)
  useEffect(() => {
    if (period) {
      try { localStorage.setItem(STORAGE_KEY, period) } catch { /* Navigation still works without storage. */ }
    }
  }, [period])
  let saved: string | null = null
  try { saved = localStorage.getItem(STORAGE_KEY) } catch { /* Default to week. */ }
  return `/${period ?? (PERIODS.find(value => value === saved) ?? 'week')}`
}

/** Page tools are deliberately outside primary destination navigation. */
export function PlanNavigation({ mobile = false, paused = false }: { mobile?: boolean; paused?: boolean }) {
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
  // Today draws its ONE chooser control on its "For today" heading (Scott via
  // Codex, 2026-09-22), at every width; Week owns a mobile chooser with its
  // actual viewed date. Elsewhere this row is the door.
  const onToday = pathname === '/' || pathname === '/today' || pathname.startsWith('/tasks-new')
  const broaderPeriod = ['month', 'season', 'year'].includes(period ?? '')
  const showChooser = !onToday && (broaderPeriod || !mobile)
  // The kept-pins note ("Lists return when you close the side panel") is
  // still said on Today, even though its chooser button lives on the page.
  const pausedNote = !mobile && paused && !!references && references.pins.length > 0
  if (!period && !showChooser && !pausedNote) return null
  const range = new URLSearchParams(search).get('range') ?? 'week'
  return <div className="plan-page-tools" data-period={period}>
    {period && <div className="plan-period-controls">
      <nav aria-label="Planning period" className="plan-period-navigation">
        {PERIODS.map(value => <NavLink key={value} to={`/${value}`} aria-current={period === value ? 'page' : undefined}
          className={period === value ? 'is-current' : ''}>{value[0].toUpperCase() + value.slice(1)}</NavLink>)}
      </nav>
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
        <Target size={15} aria-hidden="true" />Goals
      </button>
    </div>}
    {period && <GoalsSheet open={goalsOpen} onClose={() => setGoalsOpen(false)} />}
    {mobile && showChooser && <PlanningSheet open={sheetOpen} onClose={() => setSheetPath(null)} periodShelves={broaderPeriod} />}
  </div>
}
