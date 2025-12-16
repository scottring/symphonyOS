import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { CalendarPlus, ChevronLeft } from 'lucide-react'

// Minimal schedule item for display
export interface ScheduleContextItem {
  id: string
  title: string
  startTime?: Date
  endTime?: Date
  allDay?: boolean
  type: 'task' | 'event' | 'routine'
  completed?: boolean
}

interface SchedulePopoverProps {
  value?: Date
  isAllDay?: boolean
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClear?: () => void
  trigger?: React.ReactNode
  // Schedule context for showing what's on the selected day
  scheduleItems?: ScheduleContextItem[]
  getItemsForDate?: (date: Date) => ScheduleContextItem[]
}

type Step = 'date' | 'time'

// Time presets in 24h format for internal use
const TIME_PRESETS = [
  { label: '9am', hour: 9, description: 'Morning' },
  { label: '12pm', hour: 12, description: 'Noon' },
  { label: '3pm', hour: 15, description: 'Afternoon' },
  { label: '6pm', hour: 18, description: 'Evening' },
]

function formatTimeCompact(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'p' : 'a'
  const displayHour = hours % 12 || 12
  if (minutes === 0) return `${displayHour}${period}`
  return `${displayHour}:${minutes.toString().padStart(2, '0')}${period}`
}

export function SchedulePopover({
  value,
  isAllDay: _isAllDay,
  onSchedule,
  onClear,
  trigger,
  scheduleItems,
  getItemsForDate,
}: SchedulePopoverProps) {
  void _isAllDay // Reserved for visual indicator
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)

  // Determine if we should show the schedule context view
  const hasScheduleContext = !!(scheduleItems || getItemsForDate)

  // Get items for the selected date
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const itemsForSelectedDate = useMemo(() => {
    if (!selectedDate) return []
    if (getItemsForDate) return getItemsForDate(selectedDate)
    if (!scheduleItems) return []

    // Filter scheduleItems to the selected date
    const startOfDay = new Date(selectedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(selectedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return scheduleItems.filter(item => {
      if (item.allDay) {
        // For all-day items, check if they fall on this date
        if (!item.startTime) return false
        const itemDate = new Date(item.startTime)
        itemDate.setHours(0, 0, 0, 0)
        return itemDate.getTime() === startOfDay.getTime()
      }
      if (!item.startTime) return false
      return item.startTime >= startOfDay && item.startTime <= endOfDay
    })
  }, [selectedDate, scheduleItems, getItemsForDate])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setStep('date')
    setSelectedDate(null)
    setShowCustomTime(false)
    setSelectedHour(null)
  }, [])

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
  }, [isOpen, handleClose])

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open
      setStep('date')
      setSelectedDate(null)
      setShowCustomTime(false)
      setSelectedHour(null)
    }
  }, [isOpen])

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

  const handleMinuteSelect = (minute: number) => {
    if (!selectedDate || selectedHour === null) return
    const finalDate = new Date(selectedDate)
    finalDate.setHours(selectedHour, minute, 0, 0)
    onSchedule(finalDate, false)
    handleClose()
  }

  const handleClear = () => {
    onClear?.()
    handleClose()
  }

  // Format hour for display (12-hour format)
  const formatHour = (hour: number): string => {
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    const period = hour >= 12 ? 'pm' : 'am'
    return `${displayHour}${period}`
  }

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
          className="absolute left-0 top-full mt-2 z-50 rounded-xl shadow-xl"
          style={{
            minWidth: '280px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e5e5',
          }}
        >
          {/* Step 1: Pick date */}
          {step === 'date' && (
            <div className="p-3">
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-3 px-1"
                style={{ color: '#666666' }}
              >
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
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 hover:opacity-80"
                    style={{
                      backgroundColor: '#f5f5f4',
                      color: '#1c1917',
                    }}
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
                  <div className="border-t my-2" style={{ borderColor: '#e5e5e5' }} />
                  <button
                    onClick={handleClear}
                    className="w-full px-3 py-2 text-sm text-left rounded-lg transition-colors hover:opacity-80"
                    style={{ color: '#dc2626', backgroundColor: 'transparent' }}
                  >
                    Remove from schedule
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Pick time - time picker is primary, schedule context is informational */}
          {step === 'time' && !showCustomTime && (
            <div className="p-3">
              {/* Back button with selected date */}
              <button
                onClick={() => setStep('date')}
                className="flex items-center gap-1.5 text-sm mb-3 px-1 hover:opacity-70"
                style={{ color: '#525252' }}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="font-medium">{formatSelectedDateLabel()}</span>
              </button>

              {/* All day option */}
              <button
                onClick={() => handleTimeSelect('all-day')}
                className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-80"
                style={{ backgroundColor: '#f5f5f4', color: '#1c1917' }}
              >
                <span className="text-base">🌤️</span>
                <span>All Day</span>
              </button>

              {/* Quick time presets */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.hour}
                    onClick={() => handleTimeSelect(preset.hour)}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium
                      text-neutral-700 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Time picker - primary interface */}
              <button
                onClick={() => setShowCustomTime(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                  text-primary-700 bg-primary-50 hover:bg-primary-100
                  border border-primary-200
                  transition-all duration-150 mb-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pick specific time...</span>
              </button>

              {/* Schedule context - read-only informational display */}
              {hasScheduleContext && itemsForSelectedDate.length > 0 && (
                <div className="border-t border-neutral-100 pt-3 mt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                    Already scheduled
                  </div>
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {itemsForSelectedDate
                      .filter(item => !item.allDay)
                      .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
                      .map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 px-2 py-1 rounded text-xs
                            ${item.completed ? 'opacity-40' : 'opacity-70'}
                            text-neutral-500
                          `}
                        >
                          <span className="w-10 text-right font-medium tabular-nums text-neutral-400">
                            {item.startTime ? formatTimeCompact(item.startTime) : '—'}
                          </span>
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.type === 'event' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          )}
                          {item.type === 'routine' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom time picker - Step 1: Select hour */}
          {step === 'time' && showCustomTime && selectedHour === null && (
            <div className="p-3">
              {/* Back button */}
              <button
                onClick={() => setShowCustomTime(false)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="font-medium">{formatSelectedDateLabel()}</span>
              </button>

              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Select hour
              </div>

              {/* Morning hours (6am - 11am) */}
              <div className="mb-2">
                <div className="text-[10px] text-neutral-400 mb-1">Morning</div>
                <div className="grid grid-cols-6 gap-1">
                  {[6, 7, 8, 9, 10, 11].map((hour) => (
                    <button
                      key={hour}
                      onClick={() => setSelectedHour(hour)}
                      className="px-2 py-1.5 rounded text-xs font-medium
                        text-neutral-700 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                        transition-all duration-150"
                    >
                      {formatHour(hour)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Afternoon hours (12pm - 5pm) */}
              <div className="mb-2">
                <div className="text-[10px] text-neutral-400 mb-1">Afternoon</div>
                <div className="grid grid-cols-6 gap-1">
                  {[12, 13, 14, 15, 16, 17].map((hour) => (
                    <button
                      key={hour}
                      onClick={() => setSelectedHour(hour)}
                      className="px-2 py-1.5 rounded text-xs font-medium
                        text-neutral-700 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                        transition-all duration-150"
                    >
                      {formatHour(hour)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Evening hours (6pm - 11pm) */}
              <div>
                <div className="text-[10px] text-neutral-400 mb-1">Evening</div>
                <div className="grid grid-cols-6 gap-1">
                  {[18, 19, 20, 21, 22, 23].map((hour) => (
                    <button
                      key={hour}
                      onClick={() => setSelectedHour(hour)}
                      className="px-2 py-1.5 rounded text-xs font-medium
                        text-neutral-700 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                        transition-all duration-150"
                    >
                      {formatHour(hour)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Custom time picker - Step 2: Select minute */}
          {step === 'time' && showCustomTime && selectedHour !== null && (
            <div className="p-3">
              {/* Back button */}
              <button
                onClick={() => setSelectedHour(null)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="font-medium">Change hour</span>
              </button>

              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                {formatHour(selectedHour)} — select minutes
              </div>

              {/* Minute options */}
              <div className="grid grid-cols-4 gap-2">
                {[0, 15, 30, 45].map((minute) => (
                  <button
                    key={minute}
                    onClick={() => handleMinuteSelect(minute)}
                    className="px-3 py-3 rounded-lg text-sm font-medium
                      text-neutral-700 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150"
                  >
                    {formatHour(selectedHour).replace(/[ap]m/, '')}:{minute.toString().padStart(2, '0')}
                    <span className="text-neutral-400">{selectedHour >= 12 ? 'pm' : 'am'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
