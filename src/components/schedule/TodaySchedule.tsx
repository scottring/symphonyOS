import { useMemo, useState } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { groupByDaySection, type DaySection } from '@/lib/timeUtils'
import { TimeGroup } from './TimeGroup'
import { ScheduleItem } from './ScheduleItem'
import { DateNavigator } from './DateNavigator'
import { InboxSection } from './InboxSection'
import { WeeklyReview } from '@/components/review/WeeklyReview'

interface TodayScheduleProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines?: Routine[]
  dateInstances?: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onDeferTask?: (id: string, date: Date) => void
  onDeleteTask?: (id: string) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  eventNotesMap?: Map<string, EventNote>
  onRefreshInstances?: () => void
  recentlyCreatedTaskId?: string | null
  onTriageCardCollapse?: () => void
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Morning section skeleton */}
      <div>
        <div className="h-4 skeleton w-20 mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={`m-${i}`} className="flex items-center gap-4 p-4 rounded-2xl bg-bg-elevated border border-neutral-100">
              <div className="w-10 h-6 skeleton" />
              <div className="w-6 h-6 skeleton rounded-lg" />
              <div className="flex-1 h-5 skeleton max-w-xs" />
            </div>
          ))}
        </div>
      </div>
      {/* Afternoon section skeleton */}
      <div>
        <div className="h-4 skeleton w-24 mb-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-bg-elevated border border-neutral-100">
            <div className="w-10 h-6 skeleton" />
            <div className="w-6 h-6 skeleton rounded-lg" />
            <div className="flex-1 h-5 skeleton max-w-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function TodaySchedule({
  tasks,
  events,
  routines = [],
  dateInstances = [],
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onUpdateTask,
  onDeferTask,
  onDeleteTask,
  loading,
  viewedDate,
  onDateChange,
  contactsMap,
  projectsMap,
  projects = [],
  contacts = [],
  onSearchContacts,
  eventNotesMap,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
}: TodayScheduleProps) {
  // Weekly review modal state
  const [showWeeklyReview, setShowWeeklyReview] = useState(false)
  // Check if we're viewing today
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      viewedDate.getFullYear() === today.getFullYear() &&
      viewedDate.getMonth() === today.getMonth() &&
      viewedDate.getDate() === today.getDate()
    )
  }, [viewedDate])

  // Inbox tasks: needs triage - only shown on today's view
  // Includes: no scheduledFor, OR deferredUntil <= today
  const inboxTasks = useMemo(() => {
    if (!isToday) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter((task) => {
      if (task.completed) return false
      // No scheduled date = inbox item
      if (!task.scheduledFor) {
        // If deferred to a future date, don't show yet
        if (task.deferredUntil) {
          const deferredDate = new Date(task.deferredUntil)
          deferredDate.setHours(0, 0, 0, 0)
          return deferredDate <= today
        }
        return true
      }
      return false
    })
  }, [tasks, isToday])

  // Filter tasks for the viewed date (only tasks with scheduledFor)
  const filteredTasks = useMemo(() => {
    const startOfDay = new Date(viewedDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(viewedDate)
    endOfDay.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
      if (task.scheduledFor) {
        const taskDate = new Date(task.scheduledFor)
        return taskDate >= startOfDay && taskDate <= endOfDay
      }
      return false // Unscheduled tasks go to inbox, not here
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
      return (
        eventStart.getFullYear() === viewedYear &&
        eventStart.getMonth() === viewedMonth &&
        eventStart.getDate() === viewedDay
      )
    })

    const seen = new Set<string>()
    return eventsForDay.filter((event) => {
      const startTimeStr = event.start_time || event.startTime
      const key = `${event.title}|${startTimeStr}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [events, viewedDate])

  // Build instance status map for routines
  const routineStatusMap = useMemo(() => {
    const map = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        map.set(instance.entity_id, instance)
      }
    }
    return map
  }, [dateInstances])

  const grouped = useMemo(() => {
    const taskItems = filteredTasks.map(taskToTimelineItem)

    const eventItems = filteredEvents.map((event) => {
      const item = eventToTimelineItem(event)
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (eventNote?.notes) {
        item.notes = eventNote.notes
      }
      return item
    })

    const routineItems = routines.map((routine) => {
      const item = routineToTimelineItem(routine, viewedDate)
      const instance = routineStatusMap.get(routine.id)
      if (instance?.status === 'completed') {
        item.completed = true
      }
      return item
    })

    const allItems = [...taskItems, ...eventItems, ...routineItems]
    return groupByDaySection(allItems)
  }, [filteredTasks, filteredEvents, routines, viewedDate, routineStatusMap, eventNotesMap])

  const sections: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

  const formatDate = () => {
    return viewedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  // Calculate completion stats (only scheduled tasks, not inbox)
  const completedTasks = filteredTasks.filter((t) => t.completed).length
  const completedRoutines = routines.filter((r) => routineStatusMap.get(r.id)?.status === 'completed').length
  const completedCount = completedTasks + completedRoutines
  const actionableCount = filteredTasks.length + routines.length
  const totalItems = filteredTasks.length + filteredEvents.length + routines.length + inboxTasks.length
  const progressPercent = actionableCount > 0 ? (completedCount / actionableCount) * 100 : 0

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-neutral-900 mb-1">
              {isToday ? 'Today' : formatDate().split(',')[0]}
            </h2>
            <p className="text-neutral-500 text-sm">
              {formatDate()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Weekly Review button */}
            <button
              onClick={() => setShowWeeklyReview(true)}
              className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="hidden sm:inline">Review</span>
              {inboxTasks.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-semibold">
                  {inboxTasks.length}
                </span>
              )}
            </button>
            <DateNavigator date={viewedDate} onDateChange={onDateChange} />
          </div>
        </div>

        {/* Progress bar */}
        {actionableCount > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="progress-bar" style={{ '--progress-width': `${progressPercent}%` } as React.CSSProperties}>
                <div
                  className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium text-neutral-600 tabular-nums min-w-[4rem] text-right">
              {completedCount} / {actionableCount}
            </span>
          </div>
        )}
      </div>

      {/* Schedule content */}
      {loading ? (
        <LoadingSkeleton />
      ) : totalItems === 0 ? (
        <div className="text-center py-16 animate-fade-in-up">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-neutral-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          </div>
          {isToday ? (
            <>
              <p className="font-display text-xl text-neutral-700 mb-2">Your day is clear</p>
              <p className="text-neutral-500">Press <kbd className="px-2 py-1 bg-neutral-100 rounded-md text-xs font-mono">Cmd+K</kbd> to add a task</p>
            </>
          ) : (
            <p className="font-display text-xl text-neutral-600">
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
                {items.map((item) => {
                  const contactName = item.contactId && contactsMap?.get(item.contactId)?.name
                  const projectName = item.projectId && projectsMap?.get(item.projectId)?.name
                  return (
                    <ScheduleItem
                      key={item.id}
                      item={item}
                      selected={selectedItemId === item.id}
                      onSelect={() => onSelectItem(item.id)}
                      onToggleComplete={() => {
                        if (item.type === 'task' && item.id.startsWith('task-')) {
                          const taskId = item.id.replace('task-', '')
                          onToggleTask(taskId)
                        }
                      }}
                      onDefer={item.type === 'task' && item.id.startsWith('task-') && onDeferTask
                        ? (date: Date) => {
                            const taskId = item.id.replace('task-', '')
                            onDeferTask(taskId, date)
                          }
                        : undefined
                      }
                      contactName={contactName || undefined}
                      projectName={projectName || undefined}
                    />
                  )
                })}
              </TimeGroup>
            )
          })}

          {/* Inbox Section - at bottom, only on today's view */}
          {onUpdateTask && onDeferTask && (
            <InboxSection
              tasks={inboxTasks}
              onUpdateTask={onUpdateTask}
              onDeferTask={onDeferTask}
              onSelectTask={(taskId) => onSelectItem(`task-${taskId}`)}
              projects={projects}
              contacts={contacts}
              onSearchContacts={onSearchContacts}
              recentlyCreatedTaskId={recentlyCreatedTaskId}
              onTriageCardCollapse={onTriageCardCollapse}
            />
          )}
        </div>
      )}

      {/* Weekly Review Modal */}
      {showWeeklyReview && onUpdateTask && onDeferTask && onDeleteTask && (
        <WeeklyReview
          tasks={inboxTasks}
          projects={projects}
          contacts={contacts}
          onSearchContacts={onSearchContacts ?? (() => [])}
          onUpdateTask={onUpdateTask}
          onDeferTask={onDeferTask}
          onDeleteTask={onDeleteTask}
          onClose={() => setShowWeeklyReview(false)}
        />
      )}
    </div>
  )
}
