import { useState, useRef, useEffect } from 'react'
import { CalendarRange } from 'lucide-react'
import {
  dateForDayOfWeek, dayLabelFor, formatDateMonthDay, toIsoDate,
  type ActiveDayRange,
} from '@/lib/weekHelpers'

export interface WeekRangePopoverProps {
  weekStart: Date
  activeRange: ActiveDayRange
  onChange: (startsOn: string | null, endsOn: string | null) => void
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Header control for a week's active range: pick the first and last planned
 *  day of the Sunday-anchored week. Week edges (0 / 6) write null so a full
 *  week stores no bounds at all. */
export function WeekRangePopover({ weekStart, activeRange, onChange }: WeekRangePopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const commit = (firstDay: number, lastDay: number) => {
    const clampedLast = Math.max(firstDay, lastDay)
    onChange(
      firstDay === 0 ? null : toIsoDate(dateForDayOfWeek(weekStart, firstDay)),
      clampedLast === 6 ? null : toIsoDate(dateForDayOfWeek(weekStart, clampedLast)),
    )
  }

  const dayOption = (d: number) => `${dayLabelFor(d)} ${formatDateMonthDay(dateForDayOfWeek(weekStart, d))}`

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Edit week days"
        className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
      >
        <CalendarRange className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-40 card p-4 w-64 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">
            Planned days
          </div>
          <label className="block text-[13px] text-neutral-600">
            First day
            <select
              className="input-base mt-1 w-full"
              value={activeRange.firstDay}
              onChange={e => commit(Number(e.target.value), activeRange.lastDay)}
            >
              {ALL_DAYS.map(d => <option key={d} value={d}>{dayOption(d)}</option>)}
            </select>
          </label>
          <label className="block text-[13px] text-neutral-600">
            Last day
            <select
              className="input-base mt-1 w-full"
              value={activeRange.lastDay}
              onChange={e => commit(activeRange.firstDay, Number(e.target.value))}
            >
              {ALL_DAYS.filter(d => d >= activeRange.firstDay).map(d => (
                <option key={d} value={d}>{dayOption(d)}</option>
              ))}
            </select>
          </label>
          {(activeRange.firstDay > 0 || activeRange.lastDay < 6) && (
            <button
              onClick={() => { commit(0, 6); setOpen(false) }}
              className="text-[13px] text-primary-600 hover:underline"
            >
              Reset to full week
            </button>
          )}
        </div>
      )}
    </div>
  )
}
