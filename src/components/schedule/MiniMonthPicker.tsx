import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react'
import { buildMonthGrid } from '@/lib/monthGrid'

interface MiniMonthPickerProps {
  /** Currently-viewed day — its month opens first and it renders filled. */
  selected: Date
  /** Day to mark as "today". Injectable for tests; defaults to now. */
  today?: Date
  onSelect: (d: Date) => void
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function MiniMonthPicker({ selected, today = new Date(), onSelect }: MiniMonthPickerProps) {
  const [anchor, setAnchor] = useState({ year: selected.getFullYear(), month: selected.getMonth() })

  const monthLabel = new Date(anchor.year, anchor.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const cells = buildMonthGrid(anchor.year, anchor.month)

  const step = (delta: number) => {
    const d = new Date(anchor.year, anchor.month + delta, 1)
    setAnchor({ year: d.getFullYear(), month: d.getMonth() })
  }

  return (
    <div className="w-[248px] rounded-2xl bg-bg-elevated shadow-elevated p-3.5 pb-2.5">
      {/* Month steppers */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => step(-1)}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-display text-lg text-neutral-800 leading-none">{monthLabel}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => step(1)}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DOW.map((d, i) => (
          <span key={i} className="text-center text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell) => {
          const isSelected = sameDay(cell.date, selected)
          const isToday = sameDay(cell.date, today)
          const label = cell.date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              {...(isToday ? { 'aria-current': 'date' as const } : {})}
              onClick={() => onSelect(new Date(cell.date))}
              className={[
                'aspect-square flex items-center justify-center text-[13px] rounded-lg tabular-nums transition-colors',
                isSelected
                  ? 'bg-primary-500 text-white font-bold'
                  : isToday
                    ? 'font-bold text-neutral-800 ring-[1.5px] ring-inset ring-primary-300 hover:bg-neutral-100'
                    : cell.inMonth
                      ? 'text-neutral-700 hover:bg-neutral-100'
                      : 'text-neutral-300 hover:bg-neutral-100',
              ].join(' ')}
            >
              {cell.date.getDate()}
            </button>
          )
        })}
      </div>

      {/* Today footer */}
      <div className="mt-2 pt-2.5 border-t border-neutral-200 flex justify-center">
        <button
          type="button"
          onClick={() => onSelect(new Date(today))}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          Today
        </button>
      </div>
    </div>
  )
}
