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
    <section className="mb-6">
      <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-neutral-400 text-sm py-4 text-center">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
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

export function Dashboard({ tasks, events, onToggleTask, onDeleteTask, onUpdateTask }: DashboardProps) {
  const grouped = useMemo(() => {
    // Convert tasks and events to timeline items
    const taskItems = tasks.map(taskToTimelineItem)
    const eventItems = events.map(eventToTimelineItem)

    // Combine and group by time section
    const allItems = [...taskItems, ...eventItems]
    return groupByTimeSection(allItems)
  }, [tasks, events])

  const hasScheduledItems = grouped.now.length > 0 || grouped.soon.length > 0 || grouped.later.length > 0

  return (
    <div>
      {/* Active Now */}
      <TimeSection
        title="Active Now"
        items={grouped.now}
        onToggleTask={onToggleTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        emptyMessage={hasScheduledItems ? undefined : "Nothing scheduled for now"}
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
