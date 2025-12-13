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

// Alias for internal use
type ScheduleItem = ScheduleContextItem

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

// Group items by time of day section
type DaySection = 'allday' | 'morning' | 'afternoon' | 'evening'

function getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function groupItemsBySection(items: ScheduleItem[]): Record<DaySection, ScheduleItem[]> {
  const groups: Record<DaySection, ScheduleItem[]> = {
    allday: [],
    morning: [],
    afternoon: [],
    evening: [],
  }

  for (const item of items) {
    if (item.allDay || !item.startTime) {
      groups.allday.push(item)
    } else {
      groups[getTimeOfDay(item.startTime)].push(item)
    }
  }

  // Sort by time within each section
  const sortByTime = (a: ScheduleItem, b: ScheduleItem) =>
    (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0)

  groups.morning.sort(sortByTime)
  groups.afternoon.sort(sortByTime)
  groups.evening.sort(sortByTime)

  return groups
}

function formatTimeCompact(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'p' : 'a'
  const displayHour = hours % 12 || 12
  if (minutes === 0) return `${displayHour}${period}`
  return `${displayHour}:${minutes.toString().padStart(2, '0')}${period}`
}

const SECTION_LABELS: Record<DaySection, string> = {
  allday: 'All Day',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

// Default time slots for each section when no items exist
const SECTION_DEFAULT_TIMES: Record<Exclude<DaySection, 'allday'>, number> = {
  morning: 9,
  afternoon: 14,
  evening: 18,
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

  // Determine if we should show the schedule context view
  const hasScheduleContext = !!(scheduleItems || getItemsForDate)

  // Get items for the selected date
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

  // Group items by section
  const groupedItems = useMemo(() => {
    return groupItemsBySection(itemsForSelectedDate)
  }, [itemsForSelectedDate])

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

          {/* Step 2: Pick time - with schedule context if available */}
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

              {/* Schedule context view - shows day structure with gaps */}
              {hasScheduleContext ? (
                <div className="space-y-3 max-h-[320px] overflow-y-auto">
                  {/* Render each section with items and gaps */}
                  {(['morning', 'afternoon', 'evening'] as const).map((section) => {
                    const sectionItems = groupedItems[section]
                    const hasItems = sectionItems.length > 0
                    const defaultHour = SECTION_DEFAULT_TIMES[section]

                    return (
                      <div key={section}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>
                            {SECTION_LABELS[section]}
                          </span>
                          <div className="flex-1 h-px" style={{ backgroundColor: '#e5e5e5' }} />
                        </div>

                        {hasItems ? (
                          <div className="space-y-1">
                            {sectionItems.map((item, idx) => {
                              const prevItem = idx > 0 ? sectionItems[idx - 1] : null
                              const showGapBefore = prevItem && item.startTime && prevItem.endTime &&
                                (item.startTime.getTime() - (prevItem.endTime?.getTime() || prevItem.startTime!.getTime() + 3600000)) > 1800000 // 30+ min gap

                              return (
                                <div key={item.id}>
                                  {/* Gap slot before this item */}
                                  {showGapBefore && prevItem?.endTime && (
                                    <button
                                      onClick={() => {
                                        const gapTime = new Date(prevItem.endTime!)
                                        handleTimeSelect(gapTime.getHours())
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
                                        text-primary-600 bg-primary-50/50 hover:bg-primary-100
                                        border border-dashed border-primary-200
                                        transition-all duration-150 mb-1"
                                    >
                                      <span className="w-10 text-right font-medium tabular-nums">
                                        {formatTimeCompact(prevItem.endTime)}
                                      </span>
                                      <span className="flex-1 text-left">Schedule here</span>
                                    </button>
                                  )}

                                  {/* Existing item */}
                                  <div
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
                                      ${item.completed ? 'opacity-50' : ''}
                                      bg-neutral-50 text-neutral-600
                                    `}
                                  >
                                    <span className="w-10 text-right font-medium text-neutral-400 tabular-nums">
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
                                </div>
                              )
                            })}

                            {/* Gap slot at end of section */}
                            {sectionItems.length > 0 && (
                              <button
                                onClick={() => {
                                  const lastItem = sectionItems[sectionItems.length - 1]
                                  const endTime = lastItem.endTime || (lastItem.startTime ? new Date(lastItem.startTime.getTime() + 3600000) : null)
                                  if (endTime) {
                                    handleTimeSelect(endTime.getHours())
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
                                  text-primary-600 hover:bg-primary-50
                                  transition-all duration-150"
                              >
                                <span className="w-10 text-right font-medium tabular-nums">
                                  {(() => {
                                    const lastItem = sectionItems[sectionItems.length - 1]
                                    const endTime = lastItem.endTime || (lastItem.startTime ? new Date(lastItem.startTime.getTime() + 3600000) : null)
                                    return endTime ? formatTimeCompact(endTime) : '—'
                                  })()}
                                </span>
                                <span className="flex-1 text-left opacity-60">+ Schedule after</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Empty section - show as available slot */
                          <button
                            onClick={() => handleTimeSelect(defaultHour)}
                            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs
                              text-primary-600 bg-primary-50/30 hover:bg-primary-50
                              border border-dashed border-primary-200/50
                              transition-all duration-150"
                          >
                            <span className="w-10 text-right font-medium tabular-nums">
                              {defaultHour > 12 ? `${defaultHour - 12}p` : `${defaultHour}a`}
                            </span>
                            <span className="flex-1 text-left">Open - schedule here</span>
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Custom time option */}
                  <button
                    onClick={() => setShowCustomTime(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs
                      text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50
                      transition-all duration-150 mt-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Pick exact time...</span>
                  </button>
                </div>
              ) : (
                /* Fallback: Original time presets when no schedule context */
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.hour}
                        onClick={() => handleTimeSelect(preset.hour)}
                        className="
                          flex flex-col items-center px-3 py-2.5 rounded-lg text-sm
                          text-neutral-800 bg-neutral-100 hover:bg-primary-50 hover:text-primary-700
                          transition-all duration-150
                        "
                      >
                        <span className="font-semibold">{preset.label}</span>
                        <span className="text-xs text-neutral-400">{preset.description}</span>
                      </button>
                    ))}
                  </div>

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
                </>
              )}
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
                <ChevronLeft className="w-4 h-4" />
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
