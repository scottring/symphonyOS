import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, CalendarCheck } from 'lucide-react'
import { MiniMonthPicker } from './MiniMonthPicker'

interface DayNavClusterProps {
  viewedDate: Date
  onDateChange: (d: Date) => void
  /** "Today" reference; injectable for tests, defaults to now. */
  today?: Date
}

function shift(d: Date, days: number): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + days)
  return n
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * The Today masthead's date control: a weekday eyebrow over a large date
 * headline, flanked by prev/next day carets. The date opens a month picker for
 * jumping to any day; a "Today" chip appears only when viewing another day.
 */
export function DayNavCluster({ viewedDate, onDateChange, today = new Date() }: DayNavClusterProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const weekdayLong = viewedDate.toLocaleDateString('en-US', { weekday: 'long' })
  const weekdayShort = viewedDate.toLocaleDateString('en-US', { weekday: 'short' })
  const dateLong = viewedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const dateShort = viewedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const isToday = sameDay(viewedDate, today)

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const handlePick = (d: Date) => {
    onDateChange(d)
    setPickerOpen(false)
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-600 mb-1 text-center md:text-left">
        <span className="md:hidden">{weekdayShort}</span>
        <span className="hidden md:inline">{weekdayLong}</span>
      </div>

      <div className="flex items-center gap-2 md:gap-3 min-w-0 justify-center md:justify-start">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => onDateChange(shift(viewedDate, -1))}
          className="p-1 rounded-lg text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
          className="group flex items-center gap-2 min-w-0 rounded-lg px-1 -mx-1 hover:bg-neutral-100/70 transition-colors"
        >
          <h1 className="font-display text-3xl md:text-[38px] leading-none text-neutral-900 min-w-0 truncate">
            <span className="md:hidden">{dateShort}</span>
            <span className="hidden md:inline">{dateLong}</span>
          </h1>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-neutral-300 group-hover:text-neutral-500 transition-all ${pickerOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <button
          type="button"
          aria-label="Next day"
          onClick={() => onDateChange(shift(viewedDate, 1))}
          className="p-1 rounded-lg text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {!isToday && (
          <button
            type="button"
            aria-label="Go to today"
            onClick={() => onDateChange(new Date(today))}
            className="ml-1 shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-[12.5px] font-semibold text-primary-600 hover:bg-primary-100 transition-colors"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Today
          </button>
        )}
      </div>

      {pickerOpen && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 top-full mt-2 z-30"
        >
          <MiniMonthPicker selected={viewedDate} today={today} onSelect={handlePick} />
        </div>
      )}
    </div>
  )
}
