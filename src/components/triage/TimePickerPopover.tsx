import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Clock } from 'lucide-react'
import { formatTimeCompact, formatDateLabel } from '@/lib/dateHelpers'

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

interface TimePickerPopoverProps {
  date: Date
  isAllDay?: boolean
  onTimeChange: (date: Date, isAllDay: boolean) => void
  trigger?: React.ReactNode
  // Schedule context for showing what's on this day
  getItemsForDate?: (date: Date) => ScheduleContextItem[]
}

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
type DaySection = 'morning' | 'afternoon' | 'evening'

function getTimeOfDay(date: Date): DaySection {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function groupItemsBySection(items: ScheduleContextItem[]): Record<DaySection, ScheduleContextItem[]> {
  const groups: Record<DaySection, ScheduleContextItem[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  }

  for (const item of items) {
    if (item.allDay || !item.startTime) continue
    groups[getTimeOfDay(item.startTime)].push(item)
  }

  // Sort by time within each section
  const sortByTime = (a: ScheduleContextItem, b: ScheduleContextItem) =>
    (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0)

  groups.morning.sort(sortByTime)
  groups.afternoon.sort(sortByTime)
  groups.evening.sort(sortByTime)

  return groups
}

const SECTION_LABELS: Record<DaySection, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

// Default time slots for each section when no items exist
const SECTION_DEFAULT_TIMES: Record<DaySection, number> = {
  morning: 9,
  afternoon: 14,
  evening: 18,
}

export function TimePickerPopover({
  date,
  isAllDay: _isAllDay,
  onTimeChange,
  trigger,
  getItemsForDate,
}: TimePickerPopoverProps) {
  void _isAllDay // Reserved for visual indicator
  const [isOpen, setIsOpen] = useState(false)
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customTimeSearch, setCustomTimeSearch] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const customTimeInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement | HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  // Get items for the date
  const itemsForDate = useMemo(() => {
    if (!getItemsForDate) return []
    return getItemsForDate(date)
  }, [date, getItemsForDate])

  // Group items by section
  const groupedItems = useMemo(() => {
    return groupItemsBySection(itemsForDate)
  }, [itemsForDate])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(target)
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target)

      if (isOutsideContainer && isOutsideDropdown) {
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
      setShowCustomTime(false)
      setCustomTimeSearch('')
    }
  }, [isOpen])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()

      // Estimate dropdown height
      const estimatedHeight = 400
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      // Position above if not enough space below and more space above
      const shouldPositionAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

      if (shouldPositionAbove) {
        setDropdownPosition({
          bottom: window.innerHeight - rect.top + 8,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 280 - 8)),
        })
      } else {
        setDropdownPosition({
          top: rect.bottom + 8,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 280 - 8)),
        })
      }
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
    setShowCustomTime(false)
    setCustomTimeSearch('')
  }, [])

  const handleTimeSelect = (hour: number | 'all-day') => {
    const finalDate = new Date(date)
    if (hour === 'all-day') {
      finalDate.setHours(0, 0, 0, 0)
      onTimeChange(finalDate, true)
    } else {
      finalDate.setHours(hour, 0, 0, 0)
      onTimeChange(finalDate, false)
    }
    handleClose()
  }

  const handleCustomTimeSelect = (timeValue: string) => {
    if (!timeValue) return
    const [hours, minutes] = timeValue.split(':').map(Number)
    const finalDate = new Date(date)
    finalDate.setHours(hours, minutes, 0, 0)
    onTimeChange(finalDate, false)
    handleClose()
  }

  // Filter time options based on search
  const filteredTimeOptions = TIME_OPTIONS.filter(opt =>
    opt.label.toLowerCase().includes(customTimeSearch.toLowerCase()) ||
    opt.value.includes(customTimeSearch)
  )

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      {trigger ? (
        <div ref={triggerRef as React.RefObject<HTMLDivElement | null>} onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      ) : (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement | null>}
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-200"
          title="Change time"
          aria-label="Change time"
        >
          <Clock className="w-4 h-4" />
        </button>
      )}

      {/* Popover */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[100] animate-fade-in-scale max-h-[90vh] overflow-y-auto"
          style={{
            ...(dropdownPosition.top !== undefined ? { top: dropdownPosition.top } : { bottom: dropdownPosition.bottom }),
            left: dropdownPosition.left,
            background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(44 50% 99%) 100%)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid hsl(38 25% 88%)',
            boxShadow: '0 4px 20px hsl(32 20% 20% / 0.12), 0 0 0 1px hsl(38 25% 88% / 0.5)',
            minWidth: '280px',
          }}
        >
          {!showCustomTime ? (
            <div className="p-3">
              {/* Header with date context */}
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
                {formatDateLabel(date)}
              </div>

              {/* All day option */}
              <button
                onClick={() => handleTimeSelect('all-day')}
                className="w-full flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-sm font-medium
                  text-neutral-600 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                  transition-all duration-150"
              >
                <span className="text-base">🌤️</span>
                <span>All Day</span>
              </button>

              {/* Schedule context view - shows day structure with gaps */}
              {getItemsForDate ? (
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
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pick exact time...</span>
                  </button>
                </div>
              ) : (
                /* Fallback: Simple time list when no schedule context */
                <div>
                  <button
                    onClick={() => setShowCustomTime(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                      text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
                      transition-all duration-150"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Pick time...</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Custom time picker */
            <div className="p-3">
              {/* Back button */}
              <button
                onClick={() => setShowCustomTime(false)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 px-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="font-medium">{formatDateLabel(date)}</span>
              </button>

              {/* Search/type-ahead input */}
              <div className="relative mb-2">
                <input
                  ref={customTimeInputRef}
                  type="text"
                  value={customTimeSearch}
                  onChange={(e) => setCustomTimeSearch(e.target.value)}
                  placeholder="Type time (e.g., 2:30pm)"
                  className="w-full px-3 py-2 rounded-lg text-sm
                    border border-neutral-200 bg-white
                    focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
                    transition-all duration-150"
                />
              </div>

              {/* Time options list */}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-100">
                {filteredTimeOptions.slice(0, 20).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleCustomTimeSelect(option.value)}
                    className="w-full px-3 py-2 text-sm text-left
                      text-neutral-700 hover:bg-primary-50 hover:text-primary-700
                      transition-colors first:rounded-t-lg last:rounded-b-lg"
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
