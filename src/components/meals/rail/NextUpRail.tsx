import { Calendar } from 'lucide-react'

export interface NextUpEvent {
  id: string
  dayLabel: string  // "Tomorrow" / "Friday" / "May 24"
  title: string
}

interface NextUpRailProps {
  events: NextUpEvent[]
  /** Open the full calendar view. */
  onViewCalendar: () => void
}

/**
 * Right-rail "Next up" panel. Surfaces upcoming family-calendar events that
 * affect meal-planning context (early releases, trips, sports, etc.). The
 * caller selects + formats events; this component just renders.
 *
 * Hides entirely when no events are passed — empty isn't useful, the
 * scratchpad/below panels carry their weight.
 */
export function NextUpRail({ events, onViewCalendar }: NextUpRailProps) {
  if (events.length === 0) return null

  return (
    <section
      aria-labelledby="rail-next-up"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-next-up"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Next up
      </h2>

      <ul className="space-y-2.5">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-800 truncate leading-tight">{e.title}</p>
              <p className="text-[11px] text-neutral-500 leading-tight">{e.dayLabel}</p>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onViewCalendar}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        View calendar
      </button>
    </section>
  )
}
