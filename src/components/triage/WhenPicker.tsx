import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface WhenPickerProps {
  value?: Date
  isAllDay?: boolean
  onChange: (date: Date | undefined, isAllDay: boolean) => void
}

type Step = 'day' | 'time' | 'date-input' | 'time-input'

export function WhenPicker({ value, isAllDay: _isAllDay, onChange }: WhenPickerProps) {
  void _isAllDay // Reserved for future visual indicator
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('day')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
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
        setStep('day')
        setSelectedDate(null)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reset step when opening
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on popover open is valid
      setStep('day')
      setSelectedDate(null)
    }
  }, [isOpen])

  const getBaseDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const handleDaySelect = (date: Date) => {
    setSelectedDate(date)
    setStep('time')
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 0, 0, 0)
      setSelectedDate(newDate)
      setStep('time')
    }
  }

  const handleTimeSelect = (hour: number | 'all-day') => {
    if (!selectedDate) return

    const finalDate = new Date(selectedDate)
    if (hour === 'all-day') {
      finalDate.setHours(0, 0, 0, 0)
      onChange(finalDate, true)
    } else {
      finalDate.setHours(hour, 0, 0, 0)
      onChange(finalDate, false)
    }
    setIsOpen(false)
    setStep('day')
    setSelectedDate(null)
  }

  const handleTimeInputChange = (timeString: string) => {
    if (!selectedDate || !timeString) return
    const [hours, minutes] = timeString.split(':').map(Number)
    const finalDate = new Date(selectedDate)
    finalDate.setHours(hours, minutes, 0, 0)
    onChange(finalDate, false)
    setIsOpen(false)
    setStep('day')
    setSelectedDate(null)
  }

  const handleClear = () => {
    onChange(undefined, false)
    setIsOpen(false)
    setStep('day')
    setSelectedDate(null)
  }

  const hasValue = value !== undefined

  const formatSelectedDateLabel = () => {
    if (!selectedDate) return ''
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (selectedDate.getTime() === today.getTime()) return 'Today'
    if (selectedDate.getTime() === tomorrow.getTime()) return 'Tomorrow'
    return selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${
          hasValue
            ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
        }`}
        aria-label="Set date"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
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
          {/* Step 1: Pick the day */}
          {step === 'day' && (
            <div className="space-y-1">
              <button
                onClick={() => handleDaySelect(getBaseDate(0))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Today
              </button>
              <button
                onClick={() => handleDaySelect(getBaseDate(1))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleDaySelect(getBaseDate(7))}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Next Week
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setStep('date-input')}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Pick date...
              </button>
              {hasValue && (
                <>
                  <div className="border-t border-neutral-100 my-1" />
                  <button
                    onClick={handleClear}
                    className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Date input */}
          {step === 'date-input' && (
            <div className="space-y-2">
              <button
                onClick={() => setStep('day')}
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
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Step 2: Pick the time */}
          {step === 'time' && (
            <div className="space-y-1">
              <button
                onClick={() => setStep('day')}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 mb-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {formatSelectedDateLabel()}
              </button>
              <button
                onClick={() => handleTimeSelect('all-day')}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                All Day
              </button>
              <button
                onClick={() => handleTimeSelect(9)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Morning <span className="text-neutral-400">(9a)</span>
              </button>
              <button
                onClick={() => handleTimeSelect(13)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Afternoon <span className="text-neutral-400">(1p)</span>
              </button>
              <button
                onClick={() => handleTimeSelect(18)}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Evening <span className="text-neutral-400">(6p)</span>
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setStep('time-input')}
                className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Pick time...
              </button>
            </div>
          )}

          {/* Time input */}
          {step === 'time-input' && (
            <div className="space-y-2">
              <button
                onClick={() => setStep('time')}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {formatSelectedDateLabel()}
              </button>
              <input
                type="time"
                autoFocus
                onChange={(e) => handleTimeInputChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
