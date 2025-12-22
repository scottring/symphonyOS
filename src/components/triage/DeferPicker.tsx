import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightToLine, Clock, Sunset, Sun, Calendar, CalendarDays, Check } from 'lucide-react'
import {
  getBaseDate,
  getNextWeekend,
  getNextMonday,
  getHoursFromNow,
  getThisEvening,
  isBeforeEvening,
  parseDateInput,
} from '@/lib/dateHelpers'
import { DATE_INPUT_CLASS } from '@/lib/inputStyles'

interface DeferPickerProps {
  deferredUntil?: Date
  deferCount?: number
  onDefer: (date: Date | undefined) => void
}

export function DeferPicker({ deferredUntil, deferCount, onDefer }: DeferPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showDateInput, setShowDateInput] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  // Close on outside click - check both container and dropdown refs
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(target)
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target)

      if (isOutsideContainer && isOutsideDropdown) {
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
      setShowDateInput(false)
    }
  }, [isOpen])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()

      // Estimate dropdown height (approximately 350px for full grid view)
      const estimatedHeight = 350
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      // Position above if not enough space below and more space above
      const shouldPositionAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

      if (shouldPositionAbove) {
        // Position above: use bottom to anchor to viewport bottom
        setDropdownPosition({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.right - 160, // Align right edge (160px is min-width)
        })
      } else {
        // Position below: use top
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.right - 160, // Align right edge (160px is min-width)
        })
      }
    }
  }, [isOpen])

  const handleDefer = (date: Date | undefined) => {
    onDefer(date)
    setIsOpen(false)
    setShowDateInput(false)
  }

  const handleDateInputChange = (dateString: string) => {
    const newDate = parseDateInput(dateString)
    if (newDate) {
      handleDefer(newDate)
    }
  }

  const hasValue = deferredUntil !== undefined
  const showDeferBadge = (deferCount ?? 0) >= 2

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
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

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px] max-h-[90vh] overflow-y-auto"
          style={{
            ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
            left: dropdownPosition.left
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!showDateInput ? (
            <div className="p-1">
              {/* Header */}
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                Defer
              </div>

              {/* Clear deferral - show now */}
              {hasValue && (
                <>
                  <button
                    onClick={() => handleDefer(undefined)}
                    className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-sm font-medium
                      text-primary-600 bg-primary-50 hover:bg-primary-100
                      transition-all duration-150"
                  >
                    <Check className="w-4 h-4" />
                    <span>Show Now</span>
                  </button>
                  <div className="border-t border-neutral-100 mb-3" />
                </>
              )}

              {/* Quick defer options in 2-column grid */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => handleDefer(getHoursFromNow(3))}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Clock className="w-4 h-4" />
                  <span>In 3 hours</span>
                </button>
                {isBeforeEvening() && (
                  <button
                    onClick={() => handleDefer(getThisEvening())}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                      text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150"
                  >
                    <Sunset className="w-4 h-4" />
                    <span>This evening</span>
                  </button>
                )}
                <button
                  onClick={() => handleDefer(getBaseDate(1))}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Sun className="w-4 h-4" />
                  <span>Tomorrow</span>
                </button>
                <button
                  onClick={() => handleDefer(getNextWeekend())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>This Weekend</span>
                </button>
                <button
                  onClick={() => handleDefer(getNextMonday())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Next Week</span>
                </button>
                <button
                  onClick={() => setShowDateInput(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
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
