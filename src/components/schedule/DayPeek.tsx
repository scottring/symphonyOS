import { ChevronLeft } from 'lucide-react'
import type { DayLoad } from '@/lib/today/dayLoad'
import { DayLoadBar } from './DayLoadBar'

/** Beyond this the all-day list stops being a glance and becomes a page. */
const MAX_ALL_DAY = 3

function clock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  load: DayLoad
  onBack: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
}

/**
 * One day's agenda, shown where you decide which day to use.
 *
 * "Which day has room" was previously unanswerable at the point of choice — you
 * picked a day, then found out.
 */
export function DayPeek({ load, onBack, onSchedule }: Props) {
  const allDay = load.items.filter((i) => i.start === null)
  const timed = load.items.filter((i) => i.start !== null)
  const hours = Math.round((load.bookedMinutes / 60) * 10) / 10

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Schedule for"
        className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Schedule for
      </button>

      <div className="px-1">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500">
          {load.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
          <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
            {hours}h booked
            {load.allDayCount > 0 && ` · ${load.allDayCount} all-day`}
          </span>
        </div>
        <DayLoadBar load={load} />
      </div>

      <div className="max-h-64 space-y-1 overflow-auto px-1">
        {allDay.slice(0, MAX_ALL_DAY).map((i) => (
          <div key={i.id} className="flex gap-2 text-[13px]">
            <span className="w-16 shrink-0 text-neutral-400">all-day</span>
            <span className="truncate text-neutral-700">{i.title}</span>
          </div>
        ))}
        {allDay.length > MAX_ALL_DAY && (
          <div className="pl-[4.5rem] text-[13px] text-neutral-400">
            … {allDay.length - MAX_ALL_DAY} more
          </div>
        )}

        {timed.map((i) => (
          <div key={i.id} className="flex gap-2 text-[13px]">
            <span className="w-16 shrink-0 tabular-nums text-neutral-400">{clock(i.start!)}</span>
            <span className="truncate text-neutral-700">{i.title}</span>
          </div>
        ))}

        {load.openSlots.map((slot) => (
          <button
            key={slot.start.toISOString()}
            type="button"
            onClick={() => onSchedule(slot.start, false)}
            aria-label={`open ${clock(slot.start)} to ${clock(slot.end)} — put it here`}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary-300 px-2 py-1.5 text-[13px] text-primary-700 hover:bg-primary-50"
          >
            <span className="flex-1 text-left">
              open {clock(slot.start)} – {clock(slot.end)}
            </span>
            <span className="text-[11px]">+ here</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSchedule(load.date, true)}
        className="w-full rounded-lg bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-700"
      >
        Put it here · all day
      </button>
    </div>
  )
}
