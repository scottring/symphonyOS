import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { taskToTimelineItem, eventToTimelineItem, type TimelineItem } from '@/types/timeline'
import { groupByTimeSectionForDate } from '@/lib/timeUtils'
import { ExecutionCard } from './ExecutionCard'
import { isSameDay } from './DateNavigator'

interface DashboardProps {
  tasks: Task[]
  events: CalendarEvent[]
  viewedDate: Date
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  loading?: boolean
}

interface TimeSectionProps {
  title: string
  items: TimelineItem[]
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  emptyMessage?: string
}

function TimeSection({ title, items, onToggleTask, onDeleteTask, onUpdateTask, emptyMessage }: TimeSectionProps) {
  if (items.length === 0 && !emptyMessage) {
    return null
  }

  return (
    <section className="mb-8 md:mb-10">
      {/* Section header with subtle styling */}
      <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4 px-1">
        {title}
      </h2>
      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-neutral-500 text-base leading-relaxed">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ExecutionCard
              key={item.id}
              item={item}
              onToggleComplete={onToggleTask}
              onDelete={onDeleteTask}
              onUpdate={onUpdateTask}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card p-5">
          <div className="flex gap-4">
            <div className="w-5 h-5 bg-neutral-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-neutral-200 rounded w-3/4" />
              <div className="h-4 bg-neutral-100 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Dashboard({ tasks, events, viewedDate, onToggleTask, onDeleteTask, onUpdateTask, loading }: DashboardProps) {
  const today = useMemo(() => new Date(), [])
  const isViewingToday = isSameDay(viewedDate, today)

  const grouped = useMemo(() => {
    // Filter tasks to those scheduled for the viewed date
    const scheduledTasks = tasks.filter((task) => {
      if (!task.scheduledFor) return false
      return isSameDay(task.scheduledFor, viewedDate)
    })

    // Unscheduled tasks only show when viewing today
    const unscheduledTasks = isViewingToday
      ? tasks.filter((task) => !task.scheduledFor)
      : []

    // Convert tasks and events to timeline items
    const taskItems = [...scheduledTasks, ...unscheduledTasks].map(taskToTimelineItem)
    const eventItems = events.map(eventToTimelineItem)

    // Combine and group by time section
    const allItems = [...taskItems, ...eventItems]
    return groupByTimeSectionForDate(allItems, viewedDate)
  }, [tasks, events, viewedDate, isViewingToday])

  const hasScheduledItems = grouped.now.length > 0 || grouped.soon.length > 0 || grouped.later.length > 0

  if (loading) {
    return (
      <div className="space-y-2">
        <section className="mb-8 md:mb-10">
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-4 px-1">
            Loading...
          </h2>
          <LoadingSkeleton />
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Active Now */}
      <TimeSection
        title="Active Now"
        items={grouped.now}
        onToggleTask={onToggleTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        emptyMessage={hasScheduledItems ? undefined : "Your day is clear. Add a task to get started."}
      />

      {/* Coming Up */}
      <TimeSection
        title="Coming Up"
        items={grouped.soon}
        onToggleTask={onToggleTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
      />

      {/* Later Today */}
      <TimeSection
        title="Later Today"
        items={grouped.later}
        onToggleTask={onToggleTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
      />

      {/* Unscheduled Tasks */}
      <TimeSection
        title="Tasks"
        items={grouped.unscheduled}
        onToggleTask={onToggleTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        emptyMessage="No tasks yet. Add one above!"
      />
    </div>
  )
}
