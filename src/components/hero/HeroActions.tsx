import { useState, useCallback, useRef, useEffect } from 'react'
import { Check, ArrowRightToLine, MoreHorizontal, SkipForward, Calendar, CalendarDays } from 'lucide-react'

interface HeroActionsProps {
  onComplete: () => void
  onDefer: (date: Date) => void
  onMore: () => void
  onSkip: () => void
}

/**
 * HeroActions - Action buttons for Hero Mode
 *
 * Beautiful, tactile buttons for completing, deferring,
 * and viewing more details about the current task.
 * Uses standard triage icons (ArrowRightToLine for defer).
 */
export function HeroActions({
  onComplete,
  onDefer,
  onMore,
  onSkip,
}: HeroActionsProps) {
  const [showDeferOptions, setShowDeferOptions] = useState(false)
  const [showDateInput, setShowDateInput] = useState(false)
  const deferRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deferRef.current && !deferRef.current.contains(event.target as Node)) {
        setShowDeferOptions(false)
        setShowDateInput(false)
      }
    }
    if (showDeferOptions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDeferOptions])

  // Date helpers (matching DeferPicker)
  const getBaseDate = useCallback((daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(9, 0, 0, 0)
    return date
  }, [])

  const getNextMonday = useCallback(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + daysUntilMonday)
    nextMonday.setHours(9, 0, 0, 0)
    return nextMonday
  }, [])

  const handleDeferClick = useCallback(() => {
    setShowDeferOptions(!showDeferOptions)
    setShowDateInput(false)
  }, [showDeferOptions])

  const handleDeferOption = useCallback((date: Date) => {
    setShowDeferOptions(false)
    setShowDateInput(false)
    onDefer(date)
  }, [onDefer])

  const handleDateInputChange = useCallback((dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 9, 0, 0)
      handleDeferOption(newDate)
    }
  }, [handleDeferOption])

  return (
    <div className="relative">
      {/* Main action buttons */}
      <div className="flex items-center justify-center gap-4">
        {/* Skip button (smaller, subtle) */}
        <button
          onClick={onSkip}
          className="hero-action-button flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-600 transition-all"
          aria-label="Skip this task"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Done button (primary, large) */}
        <button
          onClick={onComplete}
          className="hero-action-button flex flex-col items-center justify-center w-20 h-20 rounded-3xl bg-primary-500 text-white hover:bg-primary-600 transition-all shadow-primary"
          aria-label="Mark task as done"
        >
          <Check className="w-8 h-8" strokeWidth={2.5} />
          <span className="text-xs font-medium mt-1">Done</span>
        </button>

        {/* Defer button - using standard ArrowRightToLine icon */}
        <div ref={deferRef} className="relative">
          <button
            onClick={handleDeferClick}
            className={`hero-action-button flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${
              showDeferOptions
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
            }`}
            aria-label="Defer to later"
          >
            <ArrowRightToLine className="w-6 h-6" />
            <span className="text-xs font-medium mt-0.5">Defer</span>
          </button>

          {/* Defer options popover */}
          {showDeferOptions && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-20 bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden min-w-[180px] animate-fade-in-up">
              {!showDateInput ? (
                <div className="p-2">
                  {/* Header */}
                  <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider px-3 pt-1 pb-2">
                    Defer
                  </div>
                  <button
                    onClick={() => handleDeferOption(getBaseDate(1))}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                  >
                    <Calendar className="w-4 h-4 text-amber-500" />
                    Tomorrow
                  </button>
                  <button
                    onClick={() => handleDeferOption(getNextMonday())}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                  >
                    <CalendarDays className="w-4 h-4 text-amber-500" />
                    Next Week
                  </button>
                  <div className="border-t border-neutral-100 my-1" />
                  <button
                    onClick={() => setShowDateInput(true)}
                    className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                  >
                    Pick date...
                  </button>
                </div>
              ) : (
                <div className="p-3 space-y-2">
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
                               focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* More button (smaller, subtle) */}
        <button
          onClick={onMore}
          className="hero-action-button flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-600 transition-all"
          aria-label="View task details"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

export default HeroActions
