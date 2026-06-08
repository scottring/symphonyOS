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

const tileClass =
  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ' +
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
      {WHENS.map(({ when, label, Icon }) => (
        <button
          key={when}
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); onPick(when) }}
          className={tileClass}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
      {onPickDate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPicking(true) }}
          className={`${tileClass} col-span-2`}
        >
          <CalendarPlus className="w-4 h-4 shrink-0" />
          <span className="truncate">Pick date &amp; time…</span>
        </button>
      )}
    </div>
  )
}
