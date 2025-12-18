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
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })

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
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 160, // Align right edge (160px is min-width)
      })
    }
  }, [isOpen])

  const getBaseDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const getNextWeekend = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    // If today is Sunday (0), go to next Saturday (6 days)
    // Otherwise, calculate days until next Saturday
    const daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek
    const nextSaturday = new Date(today)
    nextSaturday.setDate(today.getDate() + daysUntilSaturday)
    nextSaturday.setHours(0, 0, 0, 0)
    return nextSaturday
  }

  const getNextMonday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + daysUntilMonday)
    nextMonday.setHours(0, 0, 0, 0)
    return nextMonday
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

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[160px]"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
        >
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
                onClick={() => handleDefer(getBaseDate(1))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleDefer(getNextWeekend())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                This Weekend
              </button>
              <button
                onClick={() => handleDefer(getNextMonday())}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Next Week
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setShowDateInput(true)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
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
