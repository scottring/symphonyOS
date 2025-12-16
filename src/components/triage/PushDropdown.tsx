import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine } from 'lucide-react'

interface PushDropdownProps {
  onPush: (date: Date) => void
  size?: 'sm' | 'md'
  showTodayOption?: boolean
}

export function PushDropdown({ onPush, size = 'md', showTodayOption = false }: PushDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
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

  const getToday = () => {
    const date = new Date()
    date.setHours(9, 0, 0, 0) // Default to 9am
    return date
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

  const getTomorrow = () => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
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
    saturday.setHours(9, 0, 0, 0) // Default to 9am
    return saturday
  }

  const getNextSunday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // Days until next Sunday: if today is Sunday (0), go to next Sunday (7 days)
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
    const nextSunday = new Date(today)
    nextSunday.setDate(today.getDate() + daysUntilSunday)
    nextSunday.setHours(9, 0, 0, 0) // Default to 9am
    return nextSunday
  }

  const getOneMonth = () => {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    date.setHours(9, 0, 0, 0) // Default to 9am
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

  const handlePush = (date: Date) => {
    onPush(date)
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 0, 0, 0)
      handlePush(newDate)
    }
  }

  const buttonClasses = size === 'sm'
    ? 'p-1 rounded transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
    : 'p-1.5 rounded-lg transition-colors text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="Push task"
      >
        <ArrowRightToLine className={iconClasses} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]"
          style={{ top: dropdownPosition.top, right: dropdownPosition.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!showDatePicker ? (
            <div className="space-y-1">
              <div className="px-3 py-1 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                {showTodayOption ? 'Reschedule to' : 'Push until'}
              </div>
              {showTodayOption && (
                <button
                  onClick={() => handlePush(getToday())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-primary-700 font-medium"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => handlePush(getHoursFromNow(3))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                In 3 hours
              </button>
              {isBeforeEvening() && (
                <button
                  onClick={() => handlePush(getThisEvening())}
                  className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
                >
                  This evening
                </button>
              )}
              <button
                onClick={() => handlePush(getTomorrow())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handlePush(getThisWeekend())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
              >
                <span>This Weekend</span>
                <span className="text-xs text-neutral-400">{formatThisWeekend()}</span>
              </button>
              <button
                onClick={() => handlePush(getNextSunday())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex justify-between items-center"
              >
                <span>Next Week</span>
                <span className="text-xs text-neutral-400">{formatNextSunday()}</span>
              </button>
              <button
                onClick={() => handlePush(getOneMonth())}
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
