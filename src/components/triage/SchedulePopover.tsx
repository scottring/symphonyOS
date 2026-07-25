import { useState, useRef, useEffect, useCallback, useMemo, cloneElement, isValidElement } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus, ChevronLeft, Sun, Sunrise, CalendarDays, Calendar, Layers, Hourglass } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import {
  getBaseDate,
  getNextWeekend,
  getWeekendAfterNext,
  getNextMonday,
  parseDateInput,
  formatDateLabel,
  formatShortDate,
} from '@/lib/dateHelpers'

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
  // Skip straight to time selection when editing existing scheduled item
  skipToTime?: boolean
  // Title of task/event being scheduled (for context)
  itemTitle?: string
  // When provided, the picker also offers no-specific-date "horizon" buckets
  // (This Week / Next Month / Someday), unifying scheduling + deferring into one
  // control. Omit to keep a dates-only picker (existing per-row behavior).
  onDefer?: (target: 'week' | 'month' | 'quarter') => void
}

type Step = 'date' | 'time'

// Expanded time presets for quick selection (6am - 10pm in 1-hour increments)
const TIME_PRESETS = [
  { label: '6am', hour: 6 },
  { label: '7am', hour: 7 },
  { label: '8am', hour: 8 },
  { label: '9am', hour: 9 },
  { label: '10am', hour: 10 },
  { label: '11am', hour: 11 },
  { label: '12pm', hour: 12 },
  { label: '1pm', hour: 13 },
  { label: '2pm', hour: 14 },
  { label: '3pm', hour: 15 },
  { label: '4pm', hour: 16 },
  { label: '5pm', hour: 17 },
  { label: '6pm', hour: 18 },
  { label: '7pm', hour: 19 },
  { label: '8pm', hour: 20 },
  { label: '9pm', hour: 21 },
  { label: '10pm', hour: 22 },
]

// Generate 15-minute increment options
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 6; hour <= 22; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
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

// DELIBERATELY LOCAL — not `DaySection` from @/lib/timeUtils, and not a bug.
//
// This union only labels the visual grouping of the picker's own context
// preview. The picker never EMITS a section string: every selection yields a
// concrete hour, and whoever consumes it re-derives the real band via
// getDaySection/getSectionForHour. So its arity is free to differ from the
// canonical seven, and widening it here would add empty groups to the popover
// for no gain. Verified harmless — leave it local; don't "unify" it.
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
  skipToTime = false,
  itemTitle,
  onDefer,
}: SchedulePopoverProps) {
  void _isAllDay // Reserved for visual indicator
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const customTimeInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement | HTMLDivElement>(null)
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  // Close on outside click - check both container and dropdown refs
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(target)
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target)
      const isInputClick = customTimeInputRef.current && customTimeInputRef.current.contains(target)

      // Don't close if clicking inside dropdown or on the input field
      if (isOutsideContainer && isOutsideDropdown && !isInputClick) {
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
      // If skipToTime is true and we have an existing value, start on time step
      if (skipToTime && value) {
        setStep('time')
        setSelectedDate(value)
      } else {
        setStep('date')
        setSelectedDate(null)
      }
      setCustomTimeSearch('')
    }
  }, [isOpen, skipToTime, value])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()

      // Estimate dropdown height (approximately 400px for schedule view with context)
      const estimatedHeight = 450
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      // Position above if not enough space below and more space above
      const shouldPositionAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

      if (shouldPositionAbove) {
        // Position above: use bottom to anchor to viewport bottom
        setDropdownPosition({
          bottom: window.innerHeight - rect.top + 8,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 320 - 16)),
        })
      } else {
        // Position below: use top
        setDropdownPosition({
          top: rect.bottom + 8,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 320 - 16)),
        })
      }
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setStep('date')
    setSelectedDate(null)
    setCustomTimeSearch('')
    setHighlightedIndex(-1)
  }, [])

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setStep('time')
  }

  const handleDateInputChange = (dateString: string) => {
    const newDate = parseDateInput(dateString)
    if (newDate) {
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

  // Parse digit-only input as time (e.g., "210" -> "2:10", "217p" -> "14:17", "930a" -> "9:30")
  const parseDigitInput = (input: string): string | null => {
    const lowerInput = input.toLowerCase()
    const digits = input.replace(/\D/g, '') // Remove non-digits
    if (!digits) return null

    // Detect AM/PM indicator
    const isPM = lowerInput.includes('p')
    const isAM = lowerInput.includes('a')

    let hour: number
    let minute: number

    if (digits.length === 1 || digits.length === 2) {
      // "2" or "14" -> interpret as hour
      hour = parseInt(digits, 10)
      minute = 0
    } else if (digits.length === 3) {
      // "210" -> "2:10", "930" -> "9:30"
      hour = parseInt(digits.slice(0, 1), 10)
      minute = parseInt(digits.slice(1), 10)
    } else if (digits.length === 4) {
      // "1410" -> "14:10"
      hour = parseInt(digits.slice(0, 2), 10)
      minute = parseInt(digits.slice(2), 10)
    } else {
      return null
    }

    // Validate minute
    if (minute < 0 || minute > 59) return null

    // Handle AM/PM conversion
    if (isPM && hour >= 1 && hour <= 11) {
      hour += 12 // Convert to 24-hour format (1pm -> 13, 11pm -> 23)
    } else if (isAM && hour === 12) {
      hour = 0 // 12am -> 00:00
    } else if (isPM && hour === 12) {
      hour = 12 // 12pm stays 12
    }

    // Validate final hour
    if (hour < 0 || hour > 23) return null

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  // Filter time options based on search
  const filteredTimeOptions = (() => {
    const search = customTimeSearch.toLowerCase().trim()
    if (!search) return TIME_OPTIONS

    // First, try standard matching (label or value contains search)
    const standardMatches = TIME_OPTIONS.filter(opt =>
      opt.label.toLowerCase().includes(search) ||
      opt.value.includes(search)
    )

    // If we have matches from standard search, return those
    if (standardMatches.length > 0) return standardMatches

    // Otherwise, try parsing as digit input
    const lowerInput = search.toLowerCase()
    const hasAmPmIndicator = lowerInput.includes('a') || lowerInput.includes('p')

    const parsedTime = parseDigitInput(search)
    if (parsedTime) {
      // Find exact match in 15-min increments
      const exactMatch = TIME_OPTIONS.find(opt => opt.value === parsedTime)
      if (exactMatch) {
        return [exactMatch]
      }

      // If no exact match, create custom option(s) for this time
      const [hourStr, minuteStr] = parsedTime.split(':')
      const hour = parseInt(hourStr, 10)
      const minute = parseInt(minuteStr, 10)

      // If no AM/PM indicator and hour is 1-11, show both AM and PM options
      if (!hasAmPmIndicator && hour >= 1 && hour <= 11) {
        const amHour = hour
        const pmHour = hour + 12

        const amDisplayHour = amHour === 12 ? 12 : amHour
        const pmDisplayHour = pmHour > 12 ? pmHour - 12 : pmHour

        const amLabel = minute === 0
          ? `${amDisplayHour}am`
          : `${amDisplayHour}:${minuteStr}am`
        const pmLabel = minute === 0
          ? `${pmDisplayHour}pm`
          : `${pmDisplayHour}:${minuteStr}pm`

        return [
          {
            value: `${amHour.toString().padStart(2, '0')}:${minuteStr}`,
            label: amLabel
          },
          {
            value: `${pmHour.toString().padStart(2, '0')}:${minuteStr}`,
            label: pmLabel
          }
        ]
      }

      // Otherwise, show single option with the parsed time
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
      const period = hour >= 12 ? 'pm' : 'am'
      const label = minute === 0
        ? `${displayHour}${period}`
        : `${displayHour}:${minuteStr}${period}`

      return [{
        value: parsedTime,
        label: label
      }]
    }

    return []
  })()

  const formatSelectedDateLabel = () => {
    if (!selectedDate) return ''
    return formatDateLabel(selectedDate)
  }

  const hasValue = value !== undefined

  const popoverContent = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] animate-fade-in-scale max-h-[90vh] overflow-y-auto overflow-x-hidden"
      style={{
        ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
        left: dropdownPosition.left,
        background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(44 50% 99%) 100%)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid hsl(38 25% 88%)',
        boxShadow: '0 4px 20px hsl(32 20% 20% / 0.12), 0 0 0 1px hsl(38 25% 88% / 0.5)',
        width: '320px',
        maxWidth: 'calc(100vw - 16px)',
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
                <button
                  onClick={() => handleDateSelect(getBaseDate(0))}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Sun className="w-4 h-4" />
                  <span>Today</span>
                </button>
                <button
                  onClick={() => handleDateSelect(getBaseDate(1))}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Sunrise className="w-4 h-4" />
                  <span>Tomorrow</span>
                </button>
                <button
                  onClick={() => handleDateSelect(getNextWeekend())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>This Weekend · {formatShortDate(getNextWeekend())}</span>
                </button>
                <button
                  onClick={() => handleDateSelect(getWeekendAfterNext())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Next Weekend · {formatShortDate(getWeekendAfterNext())}</span>
                </button>
                <button
                  onClick={() => handleDateSelect(getNextMonday())}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Next Week</span>
                </button>
                <button
                  onClick={() => {
                    const input = document.getElementById('schedule-date-input') as HTMLInputElement
                    input?.showPicker?.()
                    input?.focus()
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                    text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Pick date...</span>
                </button>
              </div>

              {/* Hidden date input */}
              <input
                id="schedule-date-input"
                type="date"
                className="sr-only"
                onChange={(e) => handleDateInputChange(e.target.value)}
              />

              {/* Horizon buckets — no specific date, just a planning horizon.
                  Shown only when onDefer is wired (e.g. the bulk action bar), so
                  scheduling + deferring live in one "When" control. */}
              {onDefer && (
                <>
                  <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mt-3 mb-2 px-1">
                    Or a horizon
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { onDefer('week'); handleClose() }}
                      className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-sm font-medium
                        text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150"
                    >
                      <Layers className="w-4 h-4" />
                      <span>This Week</span>
                    </button>
                    <button
                      onClick={() => { onDefer('month'); handleClose() }}
                      className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-sm font-medium
                        text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Next Month</span>
                    </button>
                    <button
                      onClick={() => { onDefer('quarter'); handleClose() }}
                      className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-sm font-medium
                        text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150"
                    >
                      <Hourglass className="w-4 h-4" />
                      <span>Someday</span>
                    </button>
                  </div>
                </>
              )}

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

          {/* Step 2: Pick time - with schedule context if available */}
          {step === 'time' && (
            <div className="p-3">
              {/* Back button with selected date and task title */}
              <button
                onClick={() => setStep('date')}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="font-medium">{formatSelectedDateLabel()}</span>
                {itemTitle && (
                  <>
                    <span className="text-neutral-300">•</span>
                    <span className="truncate max-w-[140px]">{itemTitle}</span>
                  </>
                )}
              </button>

              {/* Search/type-ahead input at top */}
              <div
                className="relative mb-3"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={customTimeInputRef}
                  type="text"
                  value={customTimeSearch}
                  onChange={(e) => {
                    setCustomTimeSearch(e.target.value)
                    setHighlightedIndex(-1)
                  }}
                  onKeyDown={(e) => {
                    const options = customTimeSearch ? filteredTimeOptions.slice(0, 20) : []
                    if (options.length === 0) return

                    if (e.key === 'Tab' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      const next = highlightedIndex < options.length - 1 ? highlightedIndex + 1 : 0
                      setHighlightedIndex(next)
                      suggestionRefs.current[next]?.scrollIntoView({ block: 'nearest' })
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      const prev = highlightedIndex > 0 ? highlightedIndex - 1 : options.length - 1
                      setHighlightedIndex(prev)
                      suggestionRefs.current[prev]?.scrollIntoView({ block: 'nearest' })
                    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
                      e.preventDefault()
                      handleCustomTimeSelect(options[highlightedIndex].value)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Type time (e.g., 2:15pm)"
                  className="
                    w-full px-3 py-2 rounded-lg text-sm
                    border border-neutral-200 bg-white
                    focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                    transition-all duration-150
                  "
                  role="combobox"
                  aria-expanded={customTimeSearch.length > 0 && filteredTimeOptions.length > 0}
                  aria-activedescendant={highlightedIndex >= 0 ? `time-option-${highlightedIndex}` : undefined}
                />
              </div>

              {/* Show filtered time suggestions when user is typing */}
              {customTimeSearch && filteredTimeOptions.length > 0 && (
                <div
                  className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-neutral-100"
                  role="listbox"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {filteredTimeOptions.slice(0, 20).map((option, idx) => (
                    <button
                      key={option.value}
                      id={`time-option-${idx}`}
                      ref={(el) => { suggestionRefs.current[idx] = el }}
                      role="option"
                      aria-selected={idx === highlightedIndex}
                      onClick={() => handleCustomTimeSelect(option.value)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`
                        w-full px-3 py-2 text-sm text-left
                        transition-colors first:rounded-t-lg last:rounded-b-lg
                        ${idx === highlightedIndex
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-neutral-700 hover:bg-primary-50 hover:text-primary-700'
                        }
                      `}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Show no results message */}
              {customTimeSearch && filteredTimeOptions.length === 0 && (
                <div className="mb-3 px-3 py-4 text-sm text-neutral-400 text-center rounded-lg border border-neutral-100">
                  No matching times
                </div>
              )}

              {/* All day option */}
              {!customTimeSearch && (
                <button
                  onClick={() => handleTimeSelect('all-day')}
                  className="
                    w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-sm font-medium
                    text-neutral-600 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                    transition-all duration-150
                  "
                >
                  <ConceptIcon name="when" size={16} decorative />
                  <span>All Day</span>
                </button>
              )}

              {/* Schedule context view - shows day structure with gaps */}
              {!customTimeSearch && hasScheduleContext ? (
                <div className="space-y-3 max-h-[240px] overflow-y-auto">
                  {/* Render each section with items and gaps */}
                  {(['morning', 'afternoon', 'evening'] as const).map((section) => {
                    const sectionItems = groupedItems[section]
                    const hasItems = sectionItems.length > 0
                    const defaultHour = SECTION_DEFAULT_TIMES[section]

                    return (
                      <div key={section}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            {SECTION_LABELS[section]}
                          </span>
                          <div className="flex-1 h-px bg-neutral-100" />
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
                                        text-primary-600 bg-primary-50/50 hover:bg-primary-100 hover:border-primary-300
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
                </div>
              ) : !customTimeSearch ? (
                /* Fallback: Hourly time grid when no schedule context */
                <div className="max-h-64 overflow-y-auto mb-2">
                  <div className="grid grid-cols-3 gap-1.5 p-1">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.hour}
                        onClick={() => handleTimeSelect(preset.hour)}
                        className="
                          px-3 py-2 rounded-lg text-sm font-medium
                          text-neutral-700 bg-neutral-50 hover:bg-primary-100 hover:text-primary-700
                          transition-all duration-150
                        "
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
    </div>
  ) : null

  // Create trigger with click handler
  const triggerElement = trigger ? (
    isValidElement(trigger) ? (
      cloneElement(trigger as React.ReactElement<any>, {
        ...(trigger.props as any),
        ref: triggerRef,
        onClick: (e: React.MouseEvent) => {
          ;(trigger.props as any).onClick?.(e)
          setIsOpen(!isOpen)
        },
      })
    ) : (
      trigger
    )
  ) : (
    <button
      ref={triggerRef as React.RefObject<HTMLButtonElement | null>}
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
  )

  return (
    <div ref={containerRef} className="relative">
      {triggerElement}
      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  )
}
