import { useState, useCallback } from 'react'
import { Check, ArrowRight, MoreHorizontal, SkipForward, Calendar, Sun, CalendarDays } from 'lucide-react'

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
 */
export function HeroActions({
  onComplete,
  onDefer,
  onMore,
  onSkip,
}: HeroActionsProps) {
  const [showDeferOptions, setShowDeferOptions] = useState(false)

  // Date helpers
  const getTodayLater = useCallback(() => {
    const later = new Date()
    later.setHours(later.getHours() + 2)
    later.setMinutes(0, 0, 0)
    return later
  }, [])

  const getTomorrow = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    return tomorrow
  }, [])

  const getNextWeek = useCallback(() => {
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    nextWeek.setHours(9, 0, 0, 0)
    return nextWeek
  }, [])

  const handleDeferClick = useCallback(() => {
    setShowDeferOptions(!showDeferOptions)
  }, [showDeferOptions])

  const handleDeferOption = useCallback((date: Date) => {
    setShowDeferOptions(false)
    onDefer(date)
  }, [onDefer])

  return (
    <div className="relative">
      {/* Defer options popover */}
      {showDeferOptions && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDeferOptions(false)}
          />

          {/* Options */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-20 bg-white rounded-2xl shadow-xl border border-neutral-100 overflow-hidden min-w-[200px] animate-fade-in-up">
            <button
              onClick={() => handleDeferOption(getTodayLater())}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
            >
              <Sun className="w-5 h-5 text-amber-500" />
              <div>
                <div className="font-medium text-neutral-800">Later today</div>
                <div className="text-xs text-neutral-400">In 2 hours</div>
              </div>
            </button>
            <button
              onClick={() => handleDeferOption(getTomorrow())}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left border-t border-neutral-50"
            >
              <Calendar className="w-5 h-5 text-primary-500" />
              <div>
                <div className="font-medium text-neutral-800">Tomorrow</div>
                <div className="text-xs text-neutral-400">9:00 AM</div>
              </div>
            </button>
            <button
              onClick={() => handleDeferOption(getNextWeek())}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left border-t border-neutral-50"
            >
              <CalendarDays className="w-5 h-5 text-neutral-500" />
              <div>
                <div className="font-medium text-neutral-800">Next week</div>
                <div className="text-xs text-neutral-400">Same day, 9:00 AM</div>
              </div>
            </button>
          </div>
        </>
      )}

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

        {/* Later button */}
        <button
          onClick={handleDeferClick}
          className={`hero-action-button flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${
            showDeferOptions
              ? 'bg-accent-500 text-white'
              : 'bg-accent-100 text-accent-600 hover:bg-accent-200'
          }`}
          aria-label="Defer to later"
        >
          <ArrowRight className="w-6 h-6" />
          <span className="text-xs font-medium mt-0.5">Later</span>
        </button>

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
