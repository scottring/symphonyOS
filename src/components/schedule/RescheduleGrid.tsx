// src/components/schedule/RescheduleGrid.tsx
//
// The shared 2-column icon grid for picking a relative reschedule target — the
// same look as the SchedulePopover quick-date grid, reused so reschedule UIs are
// consistent. Relative tiles call onPick(when); the "Pick date…" tile reveals a
// native date+time entry and calls onPickDate(date, isAllDay) for a precise slot.

import { useState } from 'react'
import { Sun, Moon, Sunrise, CalendarDays, CalendarRange, Calendar, CalendarClock, Hourglass, CalendarPlus, ChevronLeft } from 'lucide-react'
import type { TriageWhen } from './TriageWhenMenu'
import { SpecificDatePicker } from './SpecificDatePicker'
import { getBaseDate, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers'

const WHENS: { when: TriageWhen; label: string; Icon: typeof Sun }[] = [
  { when: 'today', label: 'Today', Icon: Sun },
  { when: 'tonight', label: 'Tonight', Icon: Moon },
  { when: 'tomorrow', label: 'Tomorrow', Icon: Sunrise },
  { when: 'this-weekend', label: 'This weekend', Icon: CalendarDays },
  { when: 'next-weekend', label: 'Next weekend', Icon: CalendarRange },
  { when: 'next-week', label: 'Next week', Icon: Calendar },
  { when: 'this-month', label: 'This month', Icon: CalendarClock },
  { when: 'someday', label: 'Someday', Icon: Hourglass },
]

// Concrete date each dated `when` resolves to — MUST mirror applyTriageWhen in
// lib/triage/applyWhen.ts so the tile never promises a date the action won't
// honor. Surfacing it kills the "which Saturday is 'next weekend'?" ambiguity at
// the point of choice. Pool whens (this-week/this-month/someday) have no
// specific date and show label only.
const WHEN_DATE: Partial<Record<TriageWhen, () => Date>> = {
  tomorrow: () => getBaseDate(1),
  'this-weekend': getNextWeekend,
  'next-weekend': getWeekendAfterNext,
  'next-week': getNextMonday,
}

/** Compact tile date, e.g. "Sat Jul 4" — weekday included so weekends read clearly. */
function tileDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Quick times for the "Today" step — low-friction chips; the native input covers the rest. */
const TODAY_TIMES: { label: string; hour: number }[] = [
  { label: '9 AM', hour: 9 },
  { label: '12 PM', hour: 12 },
  { label: '3 PM', hour: 15 },
  { label: '5 PM', hour: 17 },
  { label: '7 PM', hour: 19 },
  { label: '9 PM', hour: 21 },
]

const tileClass =
  'flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap ' +
  'text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150'

interface Props {
  onPick: (when: TriageWhen) => void
  /** When provided, adds a "Pick date…" tile for a specific date/time. */
  onPickDate?: (date: Date, isAllDay: boolean) => void
}

export function RescheduleGrid({ onPick, onPickDate }: Props) {
  const [picking, setPicking] = useState(false)
  const [pickingToday, setPickingToday] = useState(false)

  if (picking && onPickDate) {
    return <SpecificDatePicker onSubmit={(date, isAllDay) => onPickDate(date, isAllDay)} onBack={() => setPicking(false)} />
  }

  // "Today" fans out to a time step (when the host wired onPickDate) so a task can
  // land at a specific hour today, not only all-day. All-day stays one tap away
  // via the prominent button, preserving the fast path.
  if (pickingToday && onPickDate) {
    const base = getBaseDate(0)
    const at = (hour: number, minute = 0) => {
      const d = getBaseDate(0)
      d.setHours(hour, minute, 0, 0)
      onPickDate(d, false)
    }
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPickingToday(false) }}
          className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Reschedule to
        </button>
        <div className="px-1 text-[11px] uppercase tracking-wider text-neutral-400">Today · {tileDate(base)}</div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPickDate(base, true) }}
          className={`${tileClass} w-full justify-center`}
        >
          All day
        </button>
        <div className="grid grid-cols-3 gap-2">
          {TODAY_TIMES.map(({ label, hour }) => (
            <button
              key={hour}
              type="button"
              onClick={(e) => { e.stopPropagation(); at(hour) }}
              className={`${tileClass} justify-center`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="time"
          aria-label="Other time today"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const [hh, mm] = v.split(':').map(Number)
            at(hh, mm)
          }}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {WHENS.map(({ when, label, Icon }) => {
        const dateFn = WHEN_DATE[when]
        const sub = dateFn ? tileDate(dateFn()) : null
        return (
          <button
            key={when}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              // Today opens the time step when the host can take a specific time;
              // otherwise it stays an instant all-day pick.
              if (when === 'today' && onPickDate) setPickingToday(true)
              else onPick(when)
            }}
            className={tileClass}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex flex-col leading-tight min-w-0">
              <span>{label}</span>
              {sub && <span className="text-[11px] font-normal text-neutral-400">{sub}</span>}
            </span>
          </button>
        )
      })}
      {onPickDate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPicking(true) }}
          className={`${tileClass} col-span-2`}
        >
          <CalendarPlus className="w-4 h-4 shrink-0" />
          <span>Pick date &amp; time…</span>
        </button>
      )}
    </div>
  )
}
