import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { taskToTimelineItem, eventToTimelineItem, type TimelineItem } from '@/types/timeline'
import { groupByTimeSection } from '@/lib/timeUtils'
import { ExecutionCard } from './ExecutionCard'

interface DashboardProps {
  tasks: Task[]
  events: CalendarEvent[]
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
          {/* Header row mimics time indicator */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 bg-neutral-200 rounded-full" />
            <div className="h-4 bg-neutral-100 rounded w-16" />
          </div>
          {/* Title row with checkbox placeholder */}
          <div className="flex items-start gap-4">
            <div className="w-6 h-6 bg-neutral-200 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-neutral-200 rounded w-4/5" />
              <div className="h-4 bg-neutral-100 rounded w-2/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Dashboard({ tasks, events, onToggleTask, onDeleteTask, onUpdateTask, loading }: DashboardProps) {
  const grouped = useMemo(() => {
    // Convert tasks and events to timeline items
    const taskItems = tasks.map(taskToTimelineItem)
    const eventItems = events.map(eventToTimelineItem)

    // Combine and group by time section
    const allItems = [...taskItems, ...eventItems]
    return groupByTimeSection(allItems)
  }, [tasks, events])

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
