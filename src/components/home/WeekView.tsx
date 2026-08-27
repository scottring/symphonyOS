import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { getDaySection, TIMED_SECTIONS } from '@/lib/timeUtils'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'
import { emptySections } from '@/lib/today/types'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
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

interface WeekViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (date: Date) => void
  onSelectDay: (date: Date) => void
  selectedAssignee?: string | null  // null = "All", "unassigned" = unassigned only
  /** The active domain lens (rung 4). Defaults to 'universal' (no-op). */
  currentDomain?: PlanningDomain
  eventNotesMap?: Map<string, { assignedTo?: string | null }>
}

interface DayData {
  date: Date
  isToday: boolean
  isWeekend: boolean
  completed: number
  total: number
  // Fully keyed: the old four-field shape meant an earlyMorning or night item
  // had nowhere to go, and the `else if` chains that filled it had no final
  // `else`, so those items were dropped without a trace.
  sections: Record<DaySection, string[]>
}

/** Header tint per band. Presentation only — membership comes from TIMED_SECTIONS. */
const SECTION_TINT: Record<string, string> = {
  earlyMorning: 'text-violet-600/70',
  morning: 'text-amber-600/70',
  afternoon: 'text-sky-600/70',
  evening: 'text-indigo-600/70',
  night: 'text-slate-600/70',
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
        {/* Every timed band, in order — driven by TIMED_SECTIONS so a new band
            can't be silently left out of the week grid. */}
        {TIMED_SECTIONS.map((section) => (
          day.sections[section].length > 0 && (
            <div key={section}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${SECTION_TINT[section] ?? 'text-neutral-500'}`}>
                {daySectionMeta(section).label}
              </div>
              {day.sections[section].map((title, i) => (
                <div key={i} className="text-xs text-neutral-600 truncate leading-snug">
                  · {title}
                </div>
              ))}
            </div>
          )
        ))}

        {/* All day items shown at top if any */}
        {day.sections.allday.length > 0 && (
          <div className="mt-1 pt-1 border-t border-neutral-100">
            {day.sections.allday.map((title, i) => (
              <div key={i} className="text-[10px] text-neutral-500 truncate">
                ◇ {title}
              </div>
            ))}
          </div>
        )}

        {/* Untimed items — previously dropped entirely. */}
        {day.sections.unscheduled.length > 0 && (
          <div className="mt-1 pt-1 border-t border-neutral-100">
            {day.sections.unscheduled.map((title, i) => (
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
  currentDomain = 'universal',
  eventNotesMap,
}: WeekViewProps) {
  // Generate 7 days of the week
  const weekDays = useMemo(() => {
    // The shared matcher — Today, Week, Month and the Inbox must agree about
    // who an item belongs to. Each of these views used to carry its own copy
    // of this predicate; makeAssigneeFilter(null) is "everyone", which is the
    // default now.
    const matchesAssigneeFilter = makeAssigneeFilter(selectedAssignee ?? null)
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
        if (!matchesAssigneeFilter(task.assignedTo, task.assignedToAll)) return false
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

      // One rule for routine visibility, shared with Today and the wall.
      const activeRoutines = routines.filter((r) =>
        resolveRoutine(r, {
          date,
          member: selectedAssignee ?? null,
          prefs: { hideRoutines: false, domain: currentDomain },
        }).shows
      )

      // Convert to timeline items and group by section
      const sections: DayData['sections'] = emptySections<string>()

      // Process tasks
      dayTasks.forEach((task) => {
        const item = taskToTimelineItem(task)
        sections[getDaySection(item)].push(task.title)
      })

      // Process events
      dayEvents.forEach((event) => {
        const item = eventToTimelineItem(event)
        sections[getDaySection(item)].push(event.title)
      })

      // Process routines (simplified - just check if they apply to this day of week)
      activeRoutines.forEach((routine) => {
        const item = routineToTimelineItem(routine, date)
        sections[getDaySection(item)].push(routine.name)
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
  }, [weekStart, tasks, events, routines, dateInstances, selectedAssignee, currentDomain, eventNotesMap])

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
