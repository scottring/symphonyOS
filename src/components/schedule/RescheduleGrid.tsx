// src/components/schedule/RescheduleGrid.tsx
//
// The shared 2-column icon grid for picking a relative reschedule target — the
// same look as the SchedulePopover quick-date grid, reused so reschedule UIs are
// consistent. Relative tiles call onPick(when); the "Pick date…" tile reveals a
// native date+time entry and calls onPickDate(date, isAllDay) for a precise slot.

import { useState } from 'react'
import { Sun, Moon, Sunrise, CalendarDays, CalendarRange, Calendar, CalendarClock, Hourglass, CalendarPlus, ChevronLeft } from 'lucide-react'
import type { TriageWhen } from './TriageWhenMenu'

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
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')

  const submitDate = () => {
    if (!dateStr) return
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    let isAllDay = true
    if (timeStr) {
      const [hh, mm] = timeStr.split(':').map(Number)
      date.setHours(hh, mm, 0, 0)
      isAllDay = false
    } else {
      date.setHours(0, 0, 0, 0)
    }
    onPickDate?.(date, isAllDay)
  }

  if (picking) {
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPicking(false) }}
          className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Pick a date
        </button>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <input
          type="time"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          placeholder="Optional time"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); submitDate() }}
          disabled={!dateStr}
          className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            dateStr ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
          }`}
        >
          {timeStr ? 'Set date & time' : 'Set date (all day)'}
        </button>
      </div>
    )
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
