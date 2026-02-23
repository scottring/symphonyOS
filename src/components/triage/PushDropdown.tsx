import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine, Clock, Sunset, Sun, Calendar, CalendarDays } from 'lucide-react'
import {
  getHoursFromNow,
  getThisEvening,
  getNextWeekend,
  getWeekendAfterNext,
  isBeforeEvening,
  parseDateInput,
} from '@/lib/dateHelpers'
import { DATE_INPUT_CLASS } from '@/lib/inputStyles'

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

  // Calculate dropdown position when opening (flip upward if near bottom)
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const estimatedHeight = 320 // approximate dropdown height
      const spaceBelow = window.innerHeight - rect.bottom - 4
      const flipUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight

      setDropdownPosition({
        top: flipUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4,
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
    date.setHours(0, 0, 0, 0)
    return date
  }

  const getTomorrow = () => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const getNextWeek = () => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const handlePush = (date: Date) => {
    onPush(date)
    setIsOpen(false)
    setShowDatePicker(false)
  }

  const handleDateInputChange = (dateString: string) => {
    const newDate = parseDateInput(dateString)
    if (newDate) {
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
            <div className="p-1">
              {/* Header */}
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                {showTodayOption ? 'Reschedule to' : 'Push until'}
              </div>

              {/* Today option if needed */}
              {showTodayOption && (
                <>
                  <button
                    onClick={() => handlePush(getToday())}
                    className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-sm font-medium
                      text-primary-600 bg-primary-50 hover:bg-primary-100
                      transition-all duration-150"
                  >
                    <Sun className="w-4 h-4" />
                    <span>Today</span>
                  </button>
                  <div className="border-t border-neutral-100 mb-3" />
                </>
              )}

              {/* Quick push options in 2-column grid */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => handlePush(getHoursFromNow(3))}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <Clock className="w-4 h-4" />
                  <span>In 3 hours</span>
                </button>
                {isBeforeEvening() && (
                  <button
                    onClick={() => handlePush(getThisEvening())}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                      text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                      transition-all duration-150"
                  >
                    <Sunset className="w-4 h-4" />
                    <span>This evening</span>
                  </button>
                )}
                <button
                  onClick={() => handlePush(getTomorrow())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <Sun className="w-4 h-4" />
                  <span>Tomorrow</span>
                </button>
                <button
                  onClick={() => handlePush(getNextWeekend())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>This Weekend</span>
                </button>
                <button
                  onClick={() => handlePush(getWeekendAfterNext())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Next Weekend</span>
                </button>
                <button
                  onClick={() => handlePush(getNextWeek())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Next Week</span>
                </button>
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-amber-50 hover:text-amber-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Pick date...</span>
                </button>
              </div>
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
                className={`w-full ${DATE_INPUT_CLASS}`}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
