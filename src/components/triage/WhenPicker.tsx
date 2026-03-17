import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getBaseDate, parseDateInput, parseTimeInput, formatDateLabel } from '@/lib/dateHelpers'
import { DATE_INPUT_CLASS, TIME_INPUT_CLASS } from '@/lib/inputStyles'
import type { TaskBucket } from '@/types/task'

interface WhenPickerProps {
  bucket?: TaskBucket
  value?: Date
  isAllDay?: boolean
  onChange: (bucket: TaskBucket, date?: Date, isAllDay?: boolean) => void
}

type Step = 'bucket' | 'date-input' | 'time'| 'time-input'

export function WhenPicker({ bucket, value, isAllDay: _isAllDay, onChange }: WhenPickerProps) {
  void _isAllDay
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('bucket')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; right: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const estimatedHeight = 250
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const shouldPositionAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

      if (shouldPositionAbove) {
        setDropdownPosition({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right })
      } else {
        setDropdownPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
      }
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false)
        setStep('bucket')
        setSelectedDate(null)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setStep('bucket')
      setSelectedDate(null)
    }
  }, [isOpen])

  const handleBucketSelect = (newBucket: TaskBucket, date?: Date) => {
    if (newBucket === 'timed' && date) {
      setSelectedDate(date)
      setStep('time')
      return
    }
    onChange(newBucket, date)
    setIsOpen(false)
  }

  const handleDateInputChange = (dateString: string) => {
    const newDate = parseDateInput(dateString)
    if (newDate) {
      setSelectedDate(newDate)
      setStep('time')
    }
  }

  const handleTimeSelect = (hour: number | 'all-day') => {
    if (!selectedDate) return
    const finalDate = new Date(selectedDate)
    if (hour === 'all-day') {
      finalDate.setHours(0, 0, 0, 0)
      onChange('timed', finalDate, true)
    } else {
      finalDate.setHours(hour, 0, 0, 0)
      onChange('timed', finalDate, false)
    }
    setIsOpen(false)
    setStep('bucket')
    setSelectedDate(null)
  }

  const handleTimeInputChange = (timeString: string) => {
    if (!selectedDate) return
    const finalDate = parseTimeInput(timeString, selectedDate)
    if (finalDate) {
      onChange('timed', finalDate, false)
      setIsOpen(false)
      setStep('bucket')
      setSelectedDate(null)
    }
  }

  const handleClear = () => {
    onChange('inbox')
    setIsOpen(false)
    setStep('bucket')
  }

  const hasValue = bucket && bucket !== 'inbox'

  const formatSelectedDateLabel = () => {
    if (!selectedDate) return ''
    return formatDateLabel(selectedDate)
  }

  // Icon color based on bucket
  const iconColor = hasValue
    ? bucket === 'timed'
      ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
      : bucket === 'week'
        ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
        : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
    : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-lg transition-colors ${iconColor}`}
        aria-label="Set when"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[180px] max-h-[90vh] overflow-y-auto"
          style={{
            ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
            right: dropdownPosition.right
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Step 1: Pick bucket */}
          {step === 'bucket' && (
            <div className="space-y-1">
              <button
                onClick={() => handleBucketSelect('timed', getBaseDate(0))}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700 font-medium"
              >
                Today
              </button>
              <button
                onClick={() => handleBucketSelect('timed', getBaseDate(1))}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Tomorrow
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => handleBucketSelect('week')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-blue-50 text-neutral-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                This Week
              </button>
              <button
                onClick={() => handleBucketSelect('month')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-amber-50 text-neutral-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                This Month
              </button>
              <button
                onClick={() => handleBucketSelect('quarter')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-purple-50 text-neutral-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                This Quarter
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setStep('date-input')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Pick date...
              </button>
              {hasValue && (
                <>
                  <div className="border-t border-neutral-100 my-1" />
                  <button
                    onClick={handleClear}
                    className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
                  >
                    Back to Inbox
                  </button>
                </>
              )}
            </div>
          )}

          {/* Date input */}
          {step === 'date-input' && (
            <div className="space-y-2">
              <button
                onClick={() => setStep('bucket')}
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
                className={`w-full ${DATE_INPUT_CLASS}`}
              />
            </div>
          )}

          {/* Step 2: Pick the time */}
          {step === 'time' && (
            <div className="space-y-1">
              <button
                onClick={() => setStep('bucket')}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 mb-2"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {formatSelectedDateLabel()}
              </button>
              <button
                onClick={() => handleTimeSelect('all-day')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                All Day
              </button>
              <button
                onClick={() => handleTimeSelect(9)}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Morning <span className="text-neutral-400">(9a)</span>
              </button>
              <button
                onClick={() => handleTimeSelect(13)}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Afternoon <span className="text-neutral-400">(1p)</span>
              </button>
              <button
                onClick={() => handleTimeSelect(18)}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Evening <span className="text-neutral-400">(6p)</span>
              </button>
              <div className="border-t border-neutral-100 my-1" />
              <button
                onClick={() => setStep('time-input')}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
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
                step="300"
                autoFocus
                onChange={(e) => handleTimeInputChange(e.target.value)}
                className={`w-full ${TIME_INPUT_CLASS}`}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
