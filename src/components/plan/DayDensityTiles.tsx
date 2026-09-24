// src/components/plan/DayDensityTiles.tsx
//
// Days to choose from, in the visual language Scott approved on the
// RescheduleGrid: two columns of rounded tiles, an icon and a label, the
// actual date underneath, and a small segmented bar showing how much is
// already on that day.
//
// The bar counts THINGS — events, tasks and routine occurrences — relative to
// the busiest day being offered. It is not the RescheduleGrid's load bar,
// which fills by hours booked against a waking window; printing counts under
// that bar would have labelled hours as items (see lib/planning/dayDensity).
//
// The days are the caller's: on /week they are the seven days of the week in
// VIEW, so choosing from a November row offers November days rather than
// silently jumping to today.
import { CalendarDays } from 'lucide-react'
import { DENSITY_SEGMENTS, densityDescription, densityCountLabel, type DayDensity } from '@/lib/planning/dayDensity'

export interface DayChoice {
  /** The day itself — what gets written. */
  date: Date
  /** "Mon", "Today" — the tile's first line. */
  label: string
  /** "Nov 9" — the tile's second line, always a real date. */
  dateLabel: string
  density: DayDensity
  /** The day the task is already on. */
  current?: boolean
}

function Bar({ density, level }: { density: DayDensity; level: number }) {
  if (!density.known) {
    return (
      <span className="mt-1 flex items-center gap-1" aria-hidden="true">
        <span className="flex flex-1 gap-0.5">
          {Array.from({ length: DENSITY_SEGMENTS }, (_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full border border-dashed border-neutral-300" />
          ))}
        </span>
      </span>
    )
  }
  return (
    <span className="mt-1 flex items-center gap-1.5" aria-hidden="true">
      <span className="flex flex-1 gap-0.5">
        {Array.from({ length: DENSITY_SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < level
              ? (level > DENSITY_SEGMENTS * 0.66 ? 'bg-primary-600' : level > DENSITY_SEGMENTS * 0.33 ? 'bg-primary-400' : 'bg-primary-200')
              : 'bg-neutral-200'}`}
          />
        ))}
      </span>
      {density.total > 0 && (
        <span className="text-[10px] tabular-nums text-neutral-400">{density.total}</span>
      )}
    </span>
  )
}

export function DayDensityTiles({ days, level, onPick, heading }: {
  days: readonly DayChoice[]
  level: (d: DayDensity) => number
  onPick: (date: Date) => void
  /** "A day in Nov 8 – 14" — says which days these are, so nobody has to guess. */
  heading: string
}) {
  return (
    <div className="px-2 pb-1">
      <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400" aria-hidden="true">
        {heading}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {days.map((day) => (
          <button
            key={day.dateLabel}
            type="button"
            role="menuitemradio"
            aria-checked={!!day.current}
            // The counts are spoken, never the fill: a bar has no meaning a
            // screen reader can use, and "60%" would be a claim about hours.
            aria-label={`Plan for ${densityDescription(day.density, `${day.label}, ${day.dateLabel}`)}`}
            onClick={() => onPick(day.date)}
            className={`flex flex-col rounded-lg px-2 py-1.5 text-left transition-colors ${
              day.current
                ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                : 'bg-neutral-50 text-neutral-700 hover:bg-primary-50 hover:text-primary-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate text-[13px] font-medium">{day.label}</span>
            </span>
            <span className="pl-5 text-[11px] text-neutral-400">{day.dateLabel}</span>
            <span className="pl-5"><Bar density={day.density} level={level(day.density)} /></span>
            {/* The same answer in words, for anyone who cannot read a bar. */}
            <span className="sr-only">{densityCountLabel(day.density)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
