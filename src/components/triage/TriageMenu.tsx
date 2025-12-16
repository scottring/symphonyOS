import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine, Archive, Trash2 } from 'lucide-react'

interface TriageMenuProps {
  /** Current scheduled date/time for time preservation */
  currentScheduledFor?: Date
  /** Whether the current task is all-day */
  currentIsAllDay?: boolean
  /** Called when user selects a date */
  onSchedule: (date: Date, isAllDay: boolean) => void
  /** Called when user selects Archive */
  onArchive: () => void
  /** Called when user selects Delete */
  onDelete: () => void
  /** Button size */
  size?: 'sm' | 'md'
  /** Custom trigger content (replaces default icon button) */
  trigger?: React.ReactNode
  /** Called when menu opens/closes */
  onOpenChange?: (open: boolean) => void
}

/**
 * TriageMenu - Unified scheduling/deferral menu
 *
 * Consolidates all defer/schedule/archive/delete actions into one menu.
 * Options:
 * - Tomorrow
 * - Next Week (Sunday)
 * - 2 weeks
 * - 1 month
 * - Pick date...
 * - Archive
 * - Delete
 *
 * Time preservation: If the task has a scheduled time, that time is preserved
 * when deferring to a new date. Otherwise defaults to 9am.
 */
export function TriageMenu({
  currentScheduledFor,
  currentIsAllDay = true,
  onSchedule,
  onArchive,
  onDelete,
  size = 'md',
  trigger,
  onOpenChange,
}: TriageMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number | 'auto'; right: number | 'auto' }>({ top: 0, left: 0, right: 'auto' })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = 180
      const viewportWidth = window.innerWidth

      // Check if dropdown would overflow right edge
      const wouldOverflowRight = rect.left + dropdownWidth > viewportWidth - 16

      setDropdownPosition({
        top: rect.bottom + 4,
        left: wouldOverflowRight ? 'auto' : rect.left,
        right: wouldOverflowRight ? viewportWidth - rect.right : 'auto',
      })
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const clickedButton = buttonRef.current?.contains(target)
      const clickedDropdown = dropdownRef.current?.contains(target)

      if (!clickedButton && !clickedDropdown) {
        setIsOpen(false)
        setShowDatePicker(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Get the time to preserve (from current scheduled time, or default to 9am)
  const getPreservedTime = () => {
    if (currentScheduledFor && !currentIsAllDay) {
      return {
        hours: currentScheduledFor.getHours(),
        minutes: currentScheduledFor.getMinutes(),
      }
    }
    // Default to 9am for all-day or unscheduled tasks
    return { hours: 9, minutes: 0 }
  }

  // Date calculation helpers
  const getTomorrow = () => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    const time = getPreservedTime()
    date.setHours(time.hours, time.minutes, 0, 0)
    return date
  }

  const getThisWeekend = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Days until Saturday: if today is Saturday (6), return today; if Sunday (0), return next Saturday (6 days)
    const daysUntilSaturday = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? 6 : 6 - dayOfWeek
    const saturday = new Date(today)
    saturday.setDate(today.getDate() + daysUntilSaturday)
    const time = getPreservedTime()
    saturday.setHours(time.hours, time.minutes, 0, 0)
    return saturday
  }

  const getNextSunday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Days until next Sunday: if today is Sunday (0), go to next Sunday (7 days)
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
    const nextSunday = new Date(today)
    nextSunday.setDate(today.getDate() + daysUntilSunday)
    const time = getPreservedTime()
    nextSunday.setHours(time.hours, time.minutes, 0, 0)
    return nextSunday
  }

  const getTwoWeeks = () => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    const time = getPreservedTime()
    date.setHours(time.hours, time.minutes, 0, 0)
    return date
  }

  const getOneMonth = () => {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    const time = getPreservedTime()
    date.setHours(time.hours, time.minutes, 0, 0)
    return date
  }

  const handleSchedule = (date: Date) => {
    onSchedule(date, currentIsAllDay ?? true)
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const time = getPreservedTime()
      const newDate = new Date(year, month - 1, day, time.hours, time.minutes, 0)
      handleSchedule(newDate)
    }
  }

  const handleArchive = () => {
    onArchive()
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const handleDelete = () => {
    onDelete()
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const buttonClasses =
    size === 'sm'
      ? 'p-1 rounded transition-colors text-neutral-400 hover:text-amber-600 hover:bg-amber-50'
      : 'p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-amber-600 hover:bg-amber-50'
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

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

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={trigger ? '' : buttonClasses}
        aria-label="Triage task"
      >
        {trigger ?? <ArrowRightToLine className={iconClasses} />}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[180px]"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left === 'auto' ? undefined : dropdownPosition.left,
              right: dropdownPosition.right === 'auto' ? undefined : dropdownPosition.right,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {!showDatePicker ? (
              <div className="space-y-1">
                {/* Date options */}
                <button
                  onClick={() => handleSchedule(getTomorrow())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  Tomorrow
                </button>
                <button
                  onClick={() => handleSchedule(getThisWeekend())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
                >
                  <span>This Weekend</span>
                  <span className="text-xs text-neutral-400">{formatThisWeekend()}</span>
                </button>
                <button
                  onClick={() => handleSchedule(getNextSunday())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
                >
                  <span>Next Week</span>
                  <span className="text-xs text-neutral-400">{formatNextSunday()}</span>
                </button>
                <button
                  onClick={() => handleSchedule(getTwoWeeks())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  2 weeks
                </button>
                <button
                  onClick={() => handleSchedule(getOneMonth())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  1 month
                </button>
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  Pick date...
                </button>

                {/* Archive & Delete */}
                <div className="border-t border-neutral-100 my-1" />
                <button
                  onClick={handleArchive}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-neutral-100 text-neutral-600 flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDatePicker(false)}
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
          </div>,
          document.body
        )}
    </div>
  )
}
