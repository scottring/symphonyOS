// List | Grid on the Week's header (Scott, 2026-11-07): the list is the
// Week, a sheet like every other horizon's; the grid of days is the optional
// view. Each device remembers the choice. While the week is being planned the
// switch steps aside: planning always uses the list. The phone has its own
// day-by-day page, so it shows no switch.
import { useWeekLayout } from '@/hooks/useWeekViewPrefs'
import './weekList.css'

export function WeekLayoutSwitch() {
  const [layout, setLayout] = useWeekLayout()
  return (
    <div className="wk-layout" role="group" aria-label="Show the week as">
      {(['list', 'grid'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={layout === v} onClick={() => setLayout(v)}>
          {v === 'list' ? 'List' : 'Grid'}
        </button>
      ))}
    </div>
  )
}
