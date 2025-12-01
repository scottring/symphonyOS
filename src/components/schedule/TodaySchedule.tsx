import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { taskToTimelineItem, eventToTimelineItem } from '@/types/timeline'
import { groupByDaySection, type DaySection } from '@/lib/timeUtils'
import { TimeGroup } from './TimeGroup'
import { ScheduleItem } from './ScheduleItem'
import { DateNavigator } from './DateNavigator'

interface TodayScheduleProps {
  tasks: Task[]
  events: CalendarEvent[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Morning section skeleton */}
      <div>
        <div className="h-3 bg-neutral-100 rounded w-16 mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={`m-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100">
              <div className="w-4 h-4 bg-neutral-200 rounded-full flex-shrink-0" />
              <div className="flex-1 flex items-center gap-3">
                <div className="h-4 bg-neutral-100 rounded w-12 flex-shrink-0" />
                <div className="h-4 bg-neutral-200 rounded flex-1 max-w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Afternoon section skeleton */}
      <div>
        <div className="h-3 bg-neutral-100 rounded w-20 mb-3" />
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100">
            <div className="w-4 h-4 bg-neutral-200 rounded-full flex-shrink-0" />
            <div className="flex-1 flex items-center gap-3">
              <div className="h-4 bg-neutral-100 rounded w-12 flex-shrink-0" />
              <div className="h-4 bg-neutral-200 rounded flex-1 max-w-56" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TodaySchedule({
  tasks,
  events,
  selectedItemId,
  onSelectItem,
  onToggleTask,
  loading,
  viewedDate,
  onDateChange,
}: TodayScheduleProps) {
  // Filter tasks for the viewed date
  const filteredTasks = useMemo(() => {
    const startOfDay = new Date(viewedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(viewedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
      // If task has a scheduled time, check if it falls on viewed date
      if (task.scheduledFor) {
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= startOfDay && taskDate <= endOfDay
      }
      // Unscheduled tasks only show on today's view
      const today = new Date()
      return (
        viewedDate.getFullYear() === today.getFullYear() &&
        viewedDate.getMonth() === today.getMonth() &&
        viewedDate.getDate() === today.getDate()
      )
    })
  }, [tasks, viewedDate])

  // Filter events for the viewed date and deduplicate by title + start time
  const filteredEvents = useMemo(() => {
    const viewedYear = viewedDate.getFullYear()
    const viewedMonth = viewedDate.getMonth()
    const viewedDay = viewedDate.getDate()

    const eventsForDay = events.filter((event) => {
      const startTimeStr = event.start_time || event.startTime
      if (!startTimeStr) return false

      const eventStart = new Date(startTimeStr)
      // Check if event starts on the viewed date
      return (
        eventStart.getFullYear() === viewedYear &&
        eventStart.getMonth() === viewedMonth &&
        eventStart.getDate() === viewedDay
      )
    })

    // Deduplicate by title + start time (same event on multiple calendars)
    const seen = new Set<string>()
    return eventsForDay.filter((event) => {
      const startTimeStr = event.start_time || event.startTime
      const key = `${event.title}|${startTimeStr}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [events, viewedDate])

  const grouped = useMemo(() => {
    const taskItems = filteredTasks.map(taskToTimelineItem)
    const eventItems = filteredEvents.map(eventToTimelineItem)
    const allItems = [...taskItems, ...eventItems]
    return groupByDaySection(allItems)
  }, [filteredTasks, filteredEvents])

  const sections: DaySection[] = ['morning', 'afternoon', 'evening', 'unscheduled']

  const formatDate = () => {
    return viewedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  const isToday = () => {
    const today = new Date()
    return (
      viewedDate.getFullYear() === today.getFullYear() &&
      viewedDate.getMonth() === today.getMonth() &&
      viewedDate.getDate() === today.getDate()
    )
  }

  const totalItems = filteredTasks.length + filteredEvents.length
  const completedTasks = filteredTasks.filter((t) => t.completed).length
  const progressPercent = totalItems > 0 ? (completedTasks / totalItems) * 100 : 0

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-800">
            {isToday() ? 'Today' : formatDate()}
          </h2>
          <DateNavigator date={viewedDate} onDateChange={onDateChange} />
        </div>

        {/* Progress bar */}
        {totalItems > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">
              {completedTasks} of {totalItems}
            </span>
            <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Schedule content */}
      {loading ? (
        <LoadingSkeleton />
      ) : totalItems === 0 ? (
        <div className="text-center py-12">
          {isToday() ? (
            <>
              <p className="text-neutral-500 mb-2">Your day is clear</p>
              <p className="text-sm text-neutral-400">Add a task to get started</p>
            </>
          ) : (
            <p className="text-neutral-500">
              Nothing scheduled for {viewedDate.toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          )}
        </div>
      ) : (
        <div>
          {sections.map((section) => {
            const items = grouped[section]
            return (
              <TimeGroup key={section} section={section} isEmpty={items.length === 0}>
                {items.map((item) => (
                  <ScheduleItem
                    key={item.id}
                    item={item}
                    selected={selectedItemId === item.id}
                    onSelect={() => onSelectItem(item.id)}
                    onToggleComplete={() => {
                      // Only toggle tasks, not events
                      if (item.type === 'task' && item.id.startsWith('task-')) {
                        const taskId = item.id.replace('task-', '')
                        onToggleTask(taskId)
                      }
                    }}
                  />
                ))}
              </TimeGroup>
            )
          })}
        </div>
      )}
    </div>
  )
}
