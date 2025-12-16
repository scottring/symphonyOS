import { useState, useRef, useEffect } from 'react'
import { ArrowRightToLine } from 'lucide-react'

interface DeferPickerProps {
  deferredUntil?: Date
  deferCount?: number
  onDefer: (date: Date | undefined) => void
}

export function DeferPicker({ deferredUntil, deferCount, onDefer }: DeferPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDateInput, setShowDateInput] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowDateInput(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reset date input when closing
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on close
      setShowDateInput(false)
    }
  }, [isOpen])

  const getBaseDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(9, 0, 0, 0) // Default to 9am
    return date
  }

  const getThisWeekend = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Days until Saturday: if today is Saturday (6), return today; if Sunday (0), return next Saturday (6 days)
    const daysUntilSaturday = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? 6 : 6 - dayOfWeek
    const saturday = new Date(today)
    saturday.setDate(today.getDate() + daysUntilSaturday)
    saturday.setHours(9, 0, 0, 0)
    return saturday
  }

  const getNextSunday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Days until next Sunday: if today is Sunday (0), go to next Sunday (7 days)
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
    const nextSunday = new Date(today)
    nextSunday.setDate(today.getDate() + daysUntilSunday)
    nextSunday.setHours(9, 0, 0, 0)
    return nextSunday
  }

  const getHoursFromNow = (hours: number) => {
    const date = new Date()
    date.setHours(date.getHours() + hours)
    date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
    return date
  }

  const getThisEvening = () => {
    const date = new Date()
    date.setHours(18, 0, 0, 0) // 6pm
    return date
  }

  const isBeforeEvening = () => {
    return new Date().getHours() < 18
  }

  const getOneMonth = () => {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    date.setHours(9, 0, 0, 0)
    return date
  }

  // Format this weekend date for display
  const formatThisWeekend = () => {
    const saturday = getThisWeekend()
    return saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Format next Sunday date for display
  const formatNextSunday = () => {
    const nextSunday = getNextSunday()
    return nextSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleDefer = (date: Date | undefined) => {
    onDefer(date)
    setIsOpen(false)
    setShowDateInput(false)
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 0, 0, 0)
      handleDefer(newDate)
    }
  }

  const hasValue = deferredUntil !== undefined
  const showDeferBadge = (deferCount ?? 0) >= 2

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors flex items-center gap-0.5 ${
          hasValue
            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        title="Defer: I will decide what to do with this later"
        aria-label="Defer item"
      >
        <ArrowRightToLine className="w-4 h-4" />
        {showDeferBadge && (
          <span className="text-xs font-medium">↻{deferCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]">
          {!showDateInput ? (
            <div className="space-y-1">
              {/* Header */}
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider px-3 pt-1 pb-2">
                Defer
              </div>
              {/* Clear deferral - show now */}
              {hasValue && (
                <>
                  <button
                    onClick={() => handleDefer(undefined)}
                    className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-primary-600 font-medium"
                  >
                    Show Now
                  </button>
                  <div className="border-t border-neutral-100 my-1" />
                </>
              )}
              <button
                onClick={() => handleDefer(getHoursFromNow(3))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                In 3 hours
              </button>
              {isBeforeEvening() && (
                <button
                  onClick={() => handleDefer(getThisEvening())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  This evening
                </button>
              )}
              <button
                onClick={() => handleDefer(getBaseDate(1))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleDefer(getThisWeekend())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
              >
                <span>This Weekend</span>
                <span className="text-xs text-neutral-400">{formatThisWeekend()}</span>
              </button>
              <button
                onClick={() => handleDefer(getNextSunday())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
              >
                <span>Next Week</span>
                <span className="text-xs text-neutral-400">{formatNextSunday()}</span>
              </button>
              <button
                onClick={() => handleDefer(getOneMonth())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                1 month
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setShowDateInput(true)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Pick date...
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setShowDateInput(false)}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <input
                type="date"
                autoFocus
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
