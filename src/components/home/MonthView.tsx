import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { resolveRoutine } from '@/lib/routineUtils'
import type { PlanningDomain } from '@/lib/today/domainFilter'

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

interface MonthViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  monthStart: Date
  onMonthChange: (date: Date) => void
  onSelectDay: (date: Date) => void
  selectedAssignee?: string | null
  /** The active domain lens (rung 4). Defaults to 'universal' (no-op). */
  currentDomain?: PlanningDomain
  eventNotesMap?: Map<string, { assignedTo?: string | null }>
}

interface DayData {
  date: Date
  isToday: boolean
  isCurrentMonth: boolean
  taskCount: number
  eventCount: number
  routineCount: number
  hasItems: boolean
}

// Day cell in the calendar grid
function DayCell({
  day,
  onClick,
}: {
  day: DayData
  onClick: () => void
}) {
  const dayNum = day.date.getDate()
  const totalItems = day.taskCount + day.eventCount + day.routineCount

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-start p-2 min-h-[80px] rounded-lg
        transition-all duration-200
        hover:bg-white hover:shadow-md
        ${day.isToday ? 'bg-white shadow-sm ring-1 ring-primary-200' : 'bg-transparent'}
        ${!day.isCurrentMonth ? 'opacity-40' : ''}
      `}
    >
      {/* Day number */}
      <div className={`
        w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium
        ${day.isToday ? 'bg-primary-500 text-white' : 'text-neutral-700'}
      `}>
        {dayNum}
      </div>

      {/* Item indicators */}
      {day.hasItems && (
        <div className="mt-1 flex flex-col items-center gap-0.5">
          {/* Show dots for item types */}
          <div className="flex gap-1">
            {day.taskCount > 0 && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary-500" title={`${day.taskCount} tasks`} />
            )}
            {day.eventCount > 0 && (
              <div className="w-1.5 h-1.5 rounded-full bg-sky-500" title={`${day.eventCount} events`} />
            )}
            {day.routineCount > 0 && (
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title={`${day.routineCount} routines`} />
            )}
          </div>
          {/* Total count if more than 3 */}
          {totalItems > 3 && (
            <span className="text-[10px] text-neutral-500">{totalItems}</span>
          )}
        </div>
      )}
    </button>
  )
}

export function MonthView({
  tasks,
  events,
  routines,
  dateInstances,
  monthStart,
  onMonthChange,
  onSelectDay,
  selectedAssignee,
  currentDomain = 'universal',
  eventNotesMap,
}: MonthViewProps) {
  // Generate calendar grid
  const calendarDays = useMemo(() => {
    // The shared matcher — Today, Week, Month and the Inbox must agree about
    // who an item belongs to. Each of these views used to carry its own copy
    // of this predicate; makeAssigneeFilter(null) is "everyone", which is the
    // default now.
    const matchesAssigneeFilter = makeAssigneeFilter(selectedAssignee ?? null)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get first day of the month
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
    // Get the day of week (0 = Sunday, 1 = Monday, etc.)
    let startDayOfWeek = firstDay.getDay()
    // Adjust for Monday start
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

    // Calculate start date (may include days from previous month)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDayOfWeek)

    // Generate 6 weeks (42 days) to ensure we always have a complete grid
    const days: DayData[] = []
    const currentDate = new Date(startDate)

    for (let i = 0; i < 42; i++) {
      const date = new Date(currentDate)
      date.setHours(0, 0, 0, 0)

      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)

      // Filter items for this day
      const dayTasks = tasks.filter((task) => {
        if (!task.scheduledFor) return false
        if (!matchesAssigneeFilter(task.assignedTo, task.assignedToAll)) return false
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= date && taskDate < nextDate
      })

      const dayEvents = events.filter((event) => {
        const startTimeStr = event.start_time || event.startTime
        if (!startTimeStr) return false
        const eventId = event.google_event_id || event.id
        const eventNote = eventNotesMap?.get(eventId)
        if (!matchesAssigneeFilter(eventNote?.assignedTo)) return false
        const eventDate = new Date(startTimeStr)
        return eventDate >= date && eventDate < nextDate
      })

      // One rule for routine visibility, shared with Today and the wall.
      const dayRoutineCount = routines.filter((r) =>
        resolveRoutine(r, {
          date,
          member: selectedAssignee ?? null,
          prefs: { hideRoutines: false, domain: currentDomain },
        }).shows
      ).length

      days.push({
        date,
        isToday: date.getTime() === today.getTime(),
        isCurrentMonth: date.getMonth() === monthStart.getMonth(),
        taskCount: dayTasks.length,
        eventCount: dayEvents.length,
        routineCount: dayRoutineCount,
        hasItems: dayTasks.length > 0 || dayEvents.length > 0 || dayRoutineCount > 0,
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return days
  }, [monthStart, tasks, events, routines, dateInstances, selectedAssignee, currentDomain, eventNotesMap])

  // Format month label
  const monthLabel = useMemo(() => {
    return monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [monthStart])

  // Check if current month contains today
  const isThisMonth = useMemo(() => {
    const today = new Date()
    return today.getMonth() === monthStart.getMonth() && today.getFullYear() === monthStart.getFullYear()
  }, [monthStart])

  const goToPrevMonth = () => {
    const prev = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
    onMonthChange(prev)
  }

  const goToNextMonth = () => {
    const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    onMonthChange(next)
  }

  const goToThisMonth = () => {
    const today = new Date()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    onMonthChange(thisMonth)
  }

  // Day of week headers
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="p-6 md:p-8 animate-fade-in-up">
      {/* Header - pt-8 clears the view switcher icons */}
      <div className="flex items-center justify-between mb-6 pt-8">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-neutral-900">
            Month
          </h2>
          <p className="text-neutral-500 text-sm">{monthLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>

          {!isThisMonth && (
            <button
              onClick={goToThisMonth}
              className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              This Month
            </button>
          )}

          <button
            onClick={goToNextMonth}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
            aria-label="Next month"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {weekDays.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wide"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days - 6 rows */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => (
            <div
              key={day.date.toISOString()}
              className={`
                border-b border-r border-neutral-50
                ${i % 7 === 6 ? 'border-r-0' : ''}
                ${i >= 35 ? 'border-b-0' : ''}
              `}
            >
              <DayCell
                day={day}
                onClick={() => onSelectDay(day.date)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs text-neutral-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary-500" />
          <span>Tasks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-sky-500" />
          <span>Events</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Routines</span>
        </div>
      </div>

      {/* Hint */}
      <p className="text-center text-xs text-neutral-400 mt-3">
        Click any day to see full details
      </p>
    </div>
  )
}
