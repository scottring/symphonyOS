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
  onToggleTask: (id: string) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-100">
          <div className="w-4 h-4 bg-neutral-200 rounded" />
          <div className="flex-1">
            <div className="h-4 bg-neutral-200 rounded w-3/4" />
          </div>
        </div>
      ))}
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

  // Filter events for the viewed date
  const filteredEvents = useMemo(() => {
    const viewedYear = viewedDate.getFullYear()
    const viewedMonth = viewedDate.getMonth()
    const viewedDay = viewedDate.getDate()

    return events.filter((event) => {
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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-neutral-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <h2 className="text-lg font-semibold text-neutral-800">
              {isToday() ? "Today's Schedule" : 'Schedule'}
            </h2>
          </div>
          <DateNavigator date={viewedDate} onDateChange={onDateChange} />
        </div>
        <p className="text-sm text-neutral-500">{formatDate()}</p>
        {totalItems > 0 && (
          <p className="text-xs text-neutral-400 mt-1">
            {completedTasks} of {filteredTasks.length} tasks complete
          </p>
        )}
      </div>

      {/* Schedule content */}
      {loading ? (
        <LoadingSkeleton />
      ) : totalItems === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 mb-2">Your day is clear</p>
          <p className="text-sm text-neutral-400">Add a task to get started</p>
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
                      if (item.type === 'task' && item.originalTask) {
                        onToggleTask(item.originalTask.id)
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
