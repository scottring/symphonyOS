import { useState, useRef, useEffect, useCallback } from 'react'
import { CalendarPlus } from 'lucide-react'

interface SchedulePopoverProps {
  value?: Date
  isAllDay?: boolean
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClear?: () => void
  trigger?: React.ReactNode
}

type Step = 'date' | 'time'

// Time presets in 24h format for internal use
const TIME_PRESETS = [
  { label: '9am', hour: 9, description: 'Morning' },
  { label: '12pm', hour: 12, description: 'Noon' },
  { label: '3pm', hour: 15, description: 'Afternoon' },
  { label: '6pm', hour: 18, description: 'Evening' },
]

// Generate 5-minute increment options
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 6; hour <= 22; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const h = hour.toString().padStart(2, '0')
      const m = minute.toString().padStart(2, '0')
      const value = `${h}:${m}`
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
      const period = hour >= 12 ? 'pm' : 'am'
      const label = minute === 0
        ? `${displayHour}${period}`
        : `${displayHour}:${m.padStart(2, '0')}${period}`
      options.push({ value, label })
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

export function SchedulePopover({
  value,
  isAllDay: _isAllDay,
  onSchedule,
  onClear,
  trigger,
}: SchedulePopoverProps) {
  void _isAllDay // Reserved for visual indicator
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customTimeSearch, setCustomTimeSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const customTimeInputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep('date')
      setSelectedDate(null)
      setShowCustomTime(false)
      setCustomTimeSearch('')
    }
  }, [isOpen])

  // Focus custom time input when shown
  useEffect(() => {
    if (showCustomTime && customTimeInputRef.current) {
      customTimeInputRef.current.focus()
    }
  }, [showCustomTime])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setStep('date')
    setSelectedDate(null)
    setShowCustomTime(false)
    setCustomTimeSearch('')
  }, [])

  const getBaseDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    date.setHours(0, 0, 0, 0)
    return date
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

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setStep('time')
  }

  const handleDateInputChange = (dateString: string) => {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number)
      const newDate = new Date(year, month - 1, day, 0, 0, 0)
      handleDateSelect(newDate)
    }
  }

  const handleTimeSelect = (hour: number | 'all-day') => {
    if (!selectedDate) return

    const finalDate = new Date(selectedDate)
    if (hour === 'all-day') {
      finalDate.setHours(0, 0, 0, 0)
      onSchedule(finalDate, true)
    } else {
      finalDate.setHours(hour, 0, 0, 0)
      onSchedule(finalDate, false)
    }
    handleClose()
  }

  const handleCustomTimeSelect = (timeValue: string) => {
    if (!selectedDate || !timeValue) return
    const [hours, minutes] = timeValue.split(':').map(Number)
    const finalDate = new Date(selectedDate)
    finalDate.setHours(hours, minutes, 0, 0)
    onSchedule(finalDate, false)
    handleClose()
  }

  const handleClear = () => {
    onClear?.()
    handleClose()
  }

  // Filter time options based on search
  const filteredTimeOptions = TIME_OPTIONS.filter(opt =>
    opt.label.toLowerCase().includes(customTimeSearch.toLowerCase()) ||
    opt.value.includes(customTimeSearch)
  )

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

  const hasValue = value !== undefined

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            p-1.5 rounded-lg
            transition-all duration-200
            ${hasValue
              ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
            }
          `}
          title="Schedule"
          aria-label="Schedule"
        >
          <CalendarPlus className="w-4 h-4" />
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 z-50 animate-fade-in-scale"
          style={{
            background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(44 50% 99%) 100%)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid hsl(38 25% 88%)',
            boxShadow: '0 4px 20px hsl(32 20% 20% / 0.12), 0 0 0 1px hsl(38 25% 88% / 0.5)',
            minWidth: '280px',
          }}
        >
          {/* Step 1: Pick date */}
          {step === 'date' && (
            <div className="p-3">
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                Schedule
              </div>

              {/* Quick date options */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Today', date: getBaseDate(0), icon: '☀️' },
                  { label: 'Tomorrow', date: getBaseDate(1), icon: '🌅' },
                  { label: 'Next Week', date: getNextMonday(), icon: '📅' },
                  { label: 'Pick date...', date: null, icon: '🗓️' },
                ].map((option) => (
                  <button
                    key={option.label}
                    onClick={() => {
                      if (option.date) {
                        handleDateSelect(option.date)
                      } else {
                        // Show date picker
                        const input = document.getElementById('schedule-date-input') as HTMLInputElement
                        input?.showPicker?.()
                        input?.focus()
                      }
                    }}
                    className="
                      flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                      text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150
                    "
                  >
                    <span className="text-base">{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>

              {/* Hidden date input */}
              <input
                id="schedule-date-input"
                type="date"
                className="sr-only"
                onChange={(e) => handleDateInputChange(e.target.value)}
              />

              {/* Clear option if value exists */}
              {hasValue && onClear && (
                <>
                  <div className="border-t border-neutral-100 my-2" />
                  <button
                    onClick={handleClear}
                    className="w-full px-3 py-2 text-sm text-left rounded-lg text-danger-500 hover:bg-danger-50 transition-colors"
                  >
                    Remove from schedule
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Pick time */}
          {step === 'time' && !showCustomTime && (
            <div className="p-3">
              {/* Back button with selected date */}
              <button
                onClick={() => setStep('date')}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">{formatSelectedDateLabel()}</span>
              </button>

              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                What time?
              </div>

              {/* All day option */}
              <button
                onClick={() => handleTimeSelect('all-day')}
                className="
                  w-full flex items-center gap-2 px-3 py-2.5 mb-2 rounded-lg text-sm font-medium
                  text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                  transition-all duration-150
                "
              >
                <span className="text-base">🌤️</span>
                <span>All Day</span>
              </button>

              {/* Time presets */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.hour}
                    onClick={() => handleTimeSelect(preset.hour)}
                    className="
                      flex flex-col items-center px-3 py-2.5 rounded-lg text-sm
                      text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150
                    "
                  >
                    <span className="font-semibold">{preset.label}</span>
                    <span className="text-xs text-neutral-400">{preset.description}</span>
                  </button>
                ))}
              </div>

              {/* Custom time button */}
              <button
                onClick={() => setShowCustomTime(true)}
                className="
                  w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                  text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50
                  transition-all duration-150
                "
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pick exact time...</span>
              </button>
            </div>
          )}

          {/* Custom time picker */}
          {step === 'time' && showCustomTime && (
            <div className="p-3">
              {/* Back button */}
              <button
                onClick={() => setShowCustomTime(false)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">{formatSelectedDateLabel()}</span>
              </button>

              {/* Search/type-ahead input */}
              <div className="relative mb-2">
                <input
                  ref={customTimeInputRef}
                  type="text"
                  value={customTimeSearch}
                  onChange={(e) => setCustomTimeSearch(e.target.value)}
                  placeholder="Type time (e.g., 2:30pm)"
                  className="
                    w-full px-3 py-2 rounded-lg text-sm
                    border border-neutral-200 bg-white
                    focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                    transition-all duration-150
                  "
                />
              </div>

              {/* Time options list */}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-100">
                {filteredTimeOptions.slice(0, 20).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleCustomTimeSelect(option.value)}
                    className="
                      w-full px-3 py-2 text-sm text-left
                      text-neutral-700 hover:bg-primary-50 hover:text-primary-700
                      transition-colors first:rounded-t-lg last:rounded-b-lg
                    "
                  >
                    {option.label}
                  </button>
                ))}
                {filteredTimeOptions.length === 0 && (
                  <div className="px-3 py-4 text-sm text-neutral-400 text-center">
                    No matching times
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
