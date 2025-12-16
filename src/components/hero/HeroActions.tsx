import { useState } from 'react'
import { Check, MoreHorizontal, SkipForward, ArrowRightToLine } from 'lucide-react'
import { TriageMenu } from '@/components/triage'

interface HeroActionsProps {
  onComplete: () => void
  onDefer: (date: Date) => void
  onMore: () => void
  onSkip: () => void
  onArchive: () => void
  onDelete: () => void
  /** Current scheduled date for time preservation */
  currentScheduledFor?: Date
  /** Whether current task is all-day */
  currentIsAllDay?: boolean
}

/**
 * HeroActions - Action buttons for Hero Mode
 *
 * Beautiful, tactile buttons for completing, deferring,
 * and viewing more details about the current task.
 * Uses TriageMenu for standardized defer/archive/delete options.
 */
export function HeroActions({
  onComplete,
  onDefer,
  onMore,
  onSkip,
  onArchive,
  onDelete,
  currentScheduledFor,
  currentIsAllDay,
}: HeroActionsProps) {
  const [showTriageMenu, setShowTriageMenu] = useState(false)

  const handleSchedule = (date: Date) => {
    onDefer(date)
  }

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

        {/* Defer button - opens TriageMenu */}
        <TriageMenu
          currentScheduledFor={currentScheduledFor}
          currentIsAllDay={currentIsAllDay}
          onSchedule={handleSchedule}
          onArchive={onArchive}
          onDelete={onDelete}
          onOpenChange={setShowTriageMenu}
          trigger={
            <div
              className={`hero-action-button flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all cursor-pointer ${
                showTriageMenu
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              }`}
              aria-label="Defer to later"
            >
              <ArrowRightToLine className="w-6 h-6" />
              <span className="text-xs font-medium mt-0.5">Defer</span>
            </div>
          }
        />

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
