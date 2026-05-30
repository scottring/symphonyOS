import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { groupByDaySection } from '@/lib/timeUtils'
import { resolveEventContext } from './eventContext'

export interface GroupingInput {
  timedTasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  viewedDate: Date
  routineStatusMap: Map<string, ActionableInstance>
  eventStatusMap: Map<string, ActionableInstance>
  match: (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean
  eventNotesMap?: Map<string, { notes?: string; assignedTo?: string | null }>
  eventContextOverrides?: Map<string, 'work' | 'family' | 'personal'>
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => 'work' | 'family' | 'personal' | null
}

/** Ports TodaySchedule.grouped (~830-954) verbatim. */
export function buildGroupedSections(input: GroupingInput): Record<DaySection, TimelineItem[]> {
  const {
    timedTasks, events, routines, viewedDate,
    routineStatusMap, eventStatusMap, match,
    eventNotesMap, eventContextOverrides, getDomainForCalendar,
  } = input

  const taskItems = timedTasks.map(taskToTimelineItem)

  const eventItems = events
    .map((event) => {
      const item = eventToTimelineItem(event)
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (eventNote?.notes) item.notes = eventNote.notes
      if (eventNote?.assignedTo) item.assignedTo = eventNote.assignedTo
      // Resolve event context (override → calendar domain mapping → null) via
      // the shared helper, so this matches HomeView's event domain filter.
      const resolvedContext = resolveEventContext(event, eventContextOverrides, getDomainForCalendar)
      if (resolvedContext) item.context = resolvedContext
      // Check if event is completed via actionable_instances
      const instance = eventStatusMap.get(eventId)
      if (instance?.status === 'completed') item.completed = true
      // Override time if rescheduled (deferred_to on same day)
      if (instance?.deferred_to && instance.status === 'pending') {
        const deferredTime = new Date(instance.deferred_to)
        item.startTime = deferredTime
        // If deferred to a specific time, it's no longer all-day
        if (deferredTime.getHours() !== 0 || deferredTime.getMinutes() !== 0) {
          item.allDay = false
          item.endTime = null // Clear stale endTime from original event
        }
      }
      return item
    })
    .filter((item) => match(item.assignedTo))

  // Map and filter routines by assignee
  const routineItems = routines
    .filter((routine) => match(routine.assigned_to, routine.assigned_to_all))
    .map((routine) => {
      const item = routineToTimelineItem(routine, viewedDate)
      const instance = routineStatusMap.get(routine.id)
      if (instance?.status === 'completed') item.completed = true
      else if (instance?.status === 'skipped') item.skipped = true
      // Override time if rescheduled
      // This applies when:
      // 1. Same-day reschedule (status='pending', deferred_to is a time change)
      // 2. Cross-day reschedule showing on target day (status='deferred', viewing the deferred_to date)
      if (instance?.deferred_to) {
        const deferredTime = new Date(instance.deferred_to)
        const deferredDateStr = deferredTime.toISOString().split('T')[0]
        const viewedDateStr = viewedDate.toISOString().split('T')[0]

        // Apply time override if:
        // - Same-day time change (pending status)
        // - Or this is a deferred routine and we're viewing the target date
        if (instance.status === 'pending' || (instance.status === 'deferred' && deferredDateStr === viewedDateStr)) {
          item.startTime = deferredTime
        }
      }
      return item
    })

  const allItems = [...taskItems, ...eventItems, ...routineItems]
  const sections = groupByDaySection(allItems)

  // Post-process: move subtasks right after their parent task within each section
  for (const key of Object.keys(sections) as DaySection[]) {
    const items = sections[key]
    const subtasks: TimelineItem[] = []
    const nonSubtasks: TimelineItem[] = []

    for (const item of items) {
      if (item.isSubtask) {
        subtasks.push(item)
      } else {
        nonSubtasks.push(item)
      }
    }

    if (subtasks.length === 0) continue

    // Rebuild the section: insert subtasks after their parent
    const result: TimelineItem[] = []
    const placed = new Set<string>()

    for (const item of nonSubtasks) {
      result.push(item)
      // Find subtasks belonging to this parent and insert them right after
      const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
      if (taskId) {
        for (const sub of subtasks) {
          if (sub.parentTaskId === taskId) {
            result.push(sub)
            placed.add(sub.id)
          }
        }
      }
    }

    // Any subtasks whose parent isn't in this section — append at end
    for (const sub of subtasks) {
      if (!placed.has(sub.id)) result.push(sub)
    }

    sections[key] = result
  }

  return sections
}
