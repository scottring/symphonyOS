import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { getDaySection } from '@/lib/timeUtils'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'

// Inline SVG icons
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

interface WeekViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (date: Date) => void
  onSelectDay: (date: Date) => void
  selectedAssignee?: string | null  // null = "All", "unassigned" = unassigned only
  eventNotesMap?: Map<string, { assignedTo?: string | null }>
}

interface DayData {
  date: Date
  isToday: boolean
  isWeekend: boolean
  completed: number
  total: number
  sections: {
    allday: string[]
    morning: string[]
    afternoon: string[]
    evening: string[]
  }
}

// Progress indicator icon
function ProgressPulse({ completed, total }: { completed: number; total: number }) {
  const ratio = total > 0 ? completed / total : 0

  let icon: React.ReactNode
  if (total === 0) {
    // No tasks
    icon = <span className="text-neutral-300">○</span>
  } else if (ratio === 0) {
    // Nothing done
    icon = <span className="text-neutral-400">○</span>
  } else if (ratio < 1) {
    // In progress
    icon = <span className="text-amber-500">◐</span>
  } else {
    // Complete
    icon = <span className="text-primary-500">●</span>
  }

  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      {icon}
      <span className="text-neutral-500 tabular-nums text-xs">
        {completed}/{total}
      </span>
    </div>
  )
}

// Single day column
function DayColumn({
  day,
  onClick,
}: {
  day: DayData
  onClick: () => void
}) {
  const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' })
  const dayNum = day.date.getDate()

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col min-w-0 p-3 rounded-xl
        transition-all duration-200
        hover:bg-white hover:shadow-md
        ${day.isToday ? 'bg-white shadow-sm ring-1 ring-primary-200' : 'bg-transparent'}
        ${day.isWeekend ? 'opacity-80' : ''}
      `}
    >
      {/* Day header */}
      <div className="text-center mb-2">
        <div className={`text-xs font-medium ${day.isToday ? 'text-primary-600' : 'text-neutral-500'}`}>
          {dayName}
        </div>
        <div className={`text-lg font-semibold ${day.isToday ? 'text-primary-700' : 'text-neutral-800'}`}>
          {dayNum}
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center mb-3">
        <ProgressPulse completed={day.completed} total={day.total} />
      </div>

      {/* Time sections with tasks */}
      <div className="flex-1 space-y-2 text-left">
        {/* Morning */}
        {day.sections.morning.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-amber-600/70 uppercase tracking-wide mb-0.5">
              Morning
            </div>
            {day.sections.morning.slice(0, 2).map((title, i) => (
              <div key={i} className="text-xs text-neutral-600 truncate leading-snug">
                · {title}
              </div>
            ))}
            {day.sections.morning.length > 2 && (
              <div className="text-[10px] text-neutral-400">+{day.sections.morning.length - 2} more</div>
            )}
          </div>
        )}

        {/* Afternoon */}
        {day.sections.afternoon.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-sky-600/70 uppercase tracking-wide mb-0.5">
              Afternoon
            </div>
            {day.sections.afternoon.slice(0, 2).map((title, i) => (
              <div key={i} className="text-xs text-neutral-600 truncate leading-snug">
                · {title}
              </div>
            ))}
            {day.sections.afternoon.length > 2 && (
              <div className="text-[10px] text-neutral-400">+{day.sections.afternoon.length - 2} more</div>
            )}
          </div>
        )}

        {/* Evening */}
        {day.sections.evening.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-indigo-600/70 uppercase tracking-wide mb-0.5">
              Evening
            </div>
            {day.sections.evening.slice(0, 2).map((title, i) => (
              <div key={i} className="text-xs text-neutral-600 truncate leading-snug">
                · {title}
              </div>
            ))}
            {day.sections.evening.length > 2 && (
              <div className="text-[10px] text-neutral-400">+{day.sections.evening.length - 2} more</div>
            )}
          </div>
        )}

        {/* All day items shown at top if any */}
        {day.sections.allday.length > 0 && (
          <div className="mt-1 pt-1 border-t border-neutral-100">
            {day.sections.allday.slice(0, 2).map((title, i) => (
              <div key={i} className="text-[10px] text-neutral-500 truncate">
                ◇ {title}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {day.total === 0 && (
          <div className="text-xs text-neutral-400 italic text-center py-2">
            Clear
          </div>
        )}
      </div>
    </button>
  )
}

export function WeekView({
  tasks,
  events,
  routines,
  dateInstances,
  weekStart,
  onWeekChange,
  onSelectDay,
  selectedAssignee,
  eventNotesMap,
}: WeekViewProps) {
  // Helper function to check if an item matches the assignee filter
  const matchesAssigneeFilter = (assignedTo: string | null | undefined): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true // "All" - show everything
    if (selectedAssignee === 'unassigned') return !assignedTo // Show only unassigned
    return assignedTo === selectedAssignee // Show items assigned to selected person
  }
  // Generate 7 days of the week
  const weekDays = useMemo(() => {
    const days: DayData[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Build routine status map
    const routineStatusMap = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        routineStatusMap.set(`${instance.entity_id}-${instance.date}`, instance)
      }
    }

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      date.setHours(0, 0, 0, 0)

      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)

      // Filter items for this day and by assignee
      const dayTasks = tasks.filter((task) => {
        if (!task.scheduledFor) return false
        if (!matchesAssigneeFilter(task.assignedTo)) return false
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= date && taskDate < nextDate
      })

      const dayEvents = events.filter((event) => {
        const startTimeStr = event.start_time || event.startTime
        if (!startTimeStr) return false
        // Get assignedTo from eventNotesMap
        const eventId = event.google_event_id || event.id
        const eventNote = eventNotesMap?.get(eventId)
        if (!matchesAssigneeFilter(eventNote?.assignedTo)) return false
        const eventDate = new Date(startTimeStr)
        return eventDate >= date && eventDate < nextDate
      })

      // Only active routines (visibility === 'active') and matching assignee filter
      const activeRoutines = routines.filter((r) =>
        r.visibility === 'active' &&
        r.show_on_timeline !== false &&
        matchesAssigneeFilter(r.assigned_to)
      )

      // Convert to timeline items and group by section
      const sections: DayData['sections'] = {
        allday: [],
        morning: [],
        afternoon: [],
        evening: [],
      }

      // Process tasks
      dayTasks.forEach((task) => {
        const item = taskToTimelineItem(task)
        const section = getDaySection(item)
        if (section === 'allday') sections.allday.push(task.title)
        else if (section === 'morning') sections.morning.push(task.title)
        else if (section === 'afternoon') sections.afternoon.push(task.title)
        else if (section === 'evening') sections.evening.push(task.title)
      })

      // Process events
      dayEvents.forEach((event) => {
        const item = eventToTimelineItem(event)
        const section = getDaySection(item)
        if (section === 'allday') sections.allday.push(event.title)
        else if (section === 'morning') sections.morning.push(event.title)
        else if (section === 'afternoon') sections.afternoon.push(event.title)
        else if (section === 'evening') sections.evening.push(event.title)
      })

      // Process routines (simplified - just check if they apply to this day of week)
      activeRoutines.forEach((routine) => {
        const item = routineToTimelineItem(routine, date)
        const section = getDaySection(item)
        if (section === 'morning') sections.morning.push(routine.name)
        else if (section === 'afternoon') sections.afternoon.push(routine.name)
        else if (section === 'evening') sections.evening.push(routine.name)
      })

      // Calculate completion
      const completedTasks = dayTasks.filter((t) => t.completed).length

      days.push({
        date,
        isToday: date.getTime() === today.getTime(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        completed: completedTasks,
        total: dayTasks.length, // Only count tasks for completion
        sections,
      })
    }

    return days
  }, [weekStart, tasks, events, routines, dateInstances, selectedAssignee, eventNotesMap])

  // Format week label
  const weekLabel = useMemo(() => {
    const endDate = new Date(weekStart)
    endDate.setDate(endDate.getDate() + 6)

    const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' })
    const startDay = weekStart.getDate()
    const endDay = endDate.getDate()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}–${endDay}`
    }
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}`
  }, [weekStart])

  // Check if current week contains today
  const isThisWeek = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    return today >= weekStart && today <= weekEnd
  }, [weekStart])

  const goToPrevWeek = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    onWeekChange(prev)
  }

  const goToNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    onWeekChange(next)
  }

  const goToThisWeek = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Monday start
    const monday = new Date(today)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    onWeekChange(monday)
  }

  return (
    <div className="p-6 md:p-8 animate-fade-in-up">
      {/* Header - pt-8 clears the view switcher icons */}
      <div className="flex items-center justify-between mb-6 pt-8">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-neutral-900">
            Week
          </h2>
          <p className="text-neutral-500 text-sm">{weekLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevWeek}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>

          {!isThisWeek && (
            <button
              onClick={goToThisWeek}
              className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              This Week
            </button>
          )}

          <button
            onClick={goToNextWeek}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
            aria-label="Next week"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2 md:gap-3">
        {weekDays.map((day) => (
          <DayColumn
            key={day.date.toISOString()}
            day={day}
            onClick={() => onSelectDay(day.date)}
          />
        ))}
      </div>

      {/* Hint */}
      <p className="text-center text-xs text-neutral-400 mt-4">
        Click any day to see full details
      </p>
    </div>
  )
}
