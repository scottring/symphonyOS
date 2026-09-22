import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { PlanningSheet } from '@/components/reference/PlanningSheet'

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
  const sheetOpen = sheetPath === pathname
  // Today and Week already own mobile choosers with their actual viewed date.
  const showChooser = !mobile || (period && period !== 'week')
  if (!period && !showChooser) return null
  const range = new URLSearchParams(search).get('range') ?? 'week'
  return <div className="plan-page-tools">
    {period && <div className="plan-period-controls">
      <nav aria-label="Planning period" className="plan-period-navigation">
        {PERIODS.map(value => <NavLink key={value} to={`/${value}`} aria-current={period === value ? 'page' : undefined}
          className={period === value ? 'is-current' : ''}>{value[0].toUpperCase() + value.slice(1)}</NavLink>)}
      </nav>
      {period === 'week' && <label className="plan-range-control">Range
        <select aria-label="Week range" value={['week', 'weekend', 'three', 'custom'].includes(range) ? range : 'week'}
          onChange={event => navigate(event.target.value === 'week' ? '/week' : `/week?range=${event.target.value}`)}>
          <option value="week">Full week</option><option value="weekend">Weekend</option>
          <option value="three">3 days</option><option value="custom">Custom range…</option>
        </select>
      </label>}
    </div>}
    {showChooser && references && <div className="task-chooser-control">
      <button type="button" aria-label={pinned && !mobile ? 'Close task chooser' : 'Choose tasks'}
        aria-pressed={mobile ? sheetOpen : pinned}
        onClick={() => mobile ? setSheetPath(sheetOpen ? null : pathname) : pinned ? references.unpin('today') : references.pin('today')}>
        <PanelLeft size={15} aria-hidden="true" />Choose tasks
      </button>
      {paused && references.pins.length > 0 && <span>Lists return when you close the side panel.</span>}
    </div>}
    {mobile && showChooser && <PlanningSheet open={sheetOpen} onClose={() => setSheetPath(null)} />}
  </div>
}
