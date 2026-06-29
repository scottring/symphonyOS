// src/components/schedule/RescheduleGrid.tsx
//
// The shared 2-column icon grid for picking a relative reschedule target — the
// same look as the SchedulePopover quick-date grid, reused so reschedule UIs are
// consistent. Relative tiles call onPick(when); the "Pick date…" tile reveals a
// native date+time entry and calls onPickDate(date, isAllDay) for a precise slot.

import { useState } from 'react'
import { Sun, Moon, Sunrise, CalendarDays, CalendarRange, Calendar, CalendarClock, Hourglass, CalendarPlus } from 'lucide-react'
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

  if (picking && onPickDate) {
    return <SpecificDatePicker onSubmit={(date, isAllDay) => onPickDate(date, isAllDay)} onBack={() => setPicking(false)} />
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
            onClick={(e) => { e.stopPropagation(); onPick(when) }}
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
