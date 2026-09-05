import { useState } from 'react'
import { RoutinesToggle } from './RoutinesToggle'
import { buildRange, presetRange, MAX_RANGE_DAYS, type RangePreset } from '@/lib/planning/dateRange'

interface PlanningHeaderProps {
  dateRange: Date[]
  onClose: () => void
  onAddDay: () => void
  onRemoveDay: () => void
  /** The whole span the grid should lay out, start through end. A named
   *  range is a VIEW of the calendar, so it arrives complete rather than as a
   *  start the host has to guess a length for. */
  onRangeChange: (range: Date[]) => void
  /** Whether this surface can actually be closed. Gates BOTH close
   *  affordances — the X and the Done button. They are one concept: an
   *  embedded host passes `onClose={() => {}}`, and a primary-styled "Done"
   *  wired to a no-op is a dead control that teaches people not to trust the
   *  screen. */
  showClose?: boolean
  hideRoutines?: boolean
  onToggleRoutines?: () => void
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'three', label: '3 days' },
  { value: 'week', label: 'Week' },
]

export function PlanningHeader({
  dateRange,
  onClose,
  onAddDay,
  onRemoveDay,
  onRangeChange,
  showClose = true,
  hideRoutines = false,
  onToggleRoutines,
}: PlanningHeaderProps) {
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Format the date range for display
  const formatDateRange = () => {
    const start = dateRange[0]
    const end = dateRange[dateRange.length - 1]

    const formatOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }

    if (dateRange.length === 1) {
      return start.toLocaleDateString('en-US', formatOptions)
    }

    // If same month, show: Mon Dec 7 - Sun Dec 13
    // If different months, show full dates
    return `${start.toLocaleDateString('en-US', formatOptions)} – ${end.toLocaleDateString('en-US', formatOptions)}`
  }

  const start = dateRange[0]
  const end = dateRange[dateRange.length - 1]

  // A new start slides the whole range along: you are moving the same
  // three-day weekend, not resetting to one day.
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const nextStart = new Date(e.target.value + 'T00:00:00')
    const length = dateRange.length
    const nextEnd = new Date(nextStart)
    nextEnd.setDate(nextEnd.getDate() + length - 1)
    onRangeChange(buildRange(nextStart, nextEnd))
    setShowDatePicker(false)
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    onRangeChange(buildRange(start, new Date(e.target.value + 'T00:00:00')))
    setShowDatePicker(false)
  }

  const handlePreset = (preset: RangePreset) => {
    onRangeChange(presetRange(preset, new Date()))
    setShowDatePicker(false)
  }

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-bg-elevated">
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Left side: Close button (optional) and title */}
        <div className="flex items-center gap-4">
          {showClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              aria-label="Close planning session"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          <div>
            <h1 className="font-display text-xl font-semibold text-neutral-900">
              Plan Your Time
            </h1>
            <p className="text-sm text-neutral-500">
              Drag tasks to schedule them
            </p>
          </div>
        </div>

        {/* Center: Date range display and navigation */}
        <div className="flex items-center gap-2">
          {/* Remove day button */}
          {dateRange.length > 1 && (
            <button
              onClick={onRemoveDay}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Remove day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Date range button */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              <span>{formatDateRange()}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Date picker dropdown */}
            {showDatePicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 w-96 bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
                  {/* The ranges worth one click. A long weekend or a school
                      break is a view of the calendar, named here rather than
                      saved somewhere else. */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {PRESETS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handlePreset(value)}
                        className="px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-neutral-700 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label htmlFor="planning-range-start" className="block text-xs font-medium text-neutral-500 mb-1">
                        Start
                      </label>
                      <input
                        id="planning-range-start"
                        type="date"
                        value={formatInputDate(start)}
                        onChange={handleStartChange}
                        className="input-base w-full"
                        autoFocus
                      />
                    </div>
                    <span className="pb-2.5 text-neutral-400">–</span>
                    <div className="flex-1 min-w-0">
                      <label htmlFor="planning-range-end" className="block text-xs font-medium text-neutral-500 mb-1">
                        End
                      </label>
                      <input
                        id="planning-range-end"
                        type="date"
                        value={formatInputDate(end)}
                        min={formatInputDate(start)}
                        onChange={handleEndChange}
                        className="input-base w-full"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-neutral-400">
                    Up to {MAX_RANGE_DAYS} days.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Add day button */}
          {dateRange.length < 7 && (
            <button
              onClick={onAddDay}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Add day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Right side: routine toggle + Done (Done only where closing means
            something — see showClose). */}
        <div className="flex items-center gap-2">
          {onToggleRoutines && (
            <RoutinesToggle hidden={hideRoutines} onToggle={onToggleRoutines} />
          )}
          {showClose && (
            <button
              onClick={onClose}
              className="btn-primary px-6 py-2"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper to format date for input[type="date"]
function formatInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
