import type { DayLoad } from '@/lib/today/dayLoad'

const SEGMENTS = 8

/**
 * Bands drawn from the primary ramp. A full day is a fact, not an error — so
 * nothing here turns red.
 */
function bandClass(ratio: number): string {
  if (ratio > 0.6) return 'bg-primary-600'
  if (ratio > 0.25) return 'bg-primary-400'
  return 'bg-primary-200'
}

interface Props {
  load: DayLoad
  /** When set, the bar is tappable and opens the day peek. */
  onPeek?: () => void
}

/** How full a day already is: hours booked as a meter, all-day items as a count. */
export function DayLoadBar({ load, onPeek }: Props) {
  const ratio = load.windowMinutes > 0 ? load.bookedMinutes / load.windowMinutes : 0
  const filled = Math.round(ratio * SEGMENTS)
  const pct = Math.round(ratio * 100)

  return (
    <button
      type="button"
      onClick={onPeek}
      disabled={!onPeek}
      aria-label={`${pct}% booked — see the day`}
      className="mt-1 flex w-full items-center gap-1.5 disabled:cursor-default"
    >
      {/* role="progressbar" belongs on the meter, not on the button — putting it
          on the button would erase the button's own semantics. */}
      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="flex flex-1 gap-0.5"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < filled ? bandClass(ratio) : 'bg-neutral-200'}`}
          />
        ))}
      </span>
      {load.allDayCount > 0 && (
        <span className="text-[11px] tabular-nums text-neutral-400">+{load.allDayCount}</span>
      )}
      {!load.eventsAvailable && (
        <span className="text-[10px] text-neutral-400">events unavailable</span>
      )}
    </button>
  )
}
