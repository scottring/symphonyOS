import type { Task, TaskLink } from './task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, RecurrencePattern } from './actionable'

export type TimelineItemType = 'task' | 'event' | 'routine'

export interface TimelineItem {
  id: string
  type: TimelineItemType
  title: string
  startTime: Date | null // null for unscheduled tasks
  endTime: Date | null
  completed: boolean
  // Context (from tasks)
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact
  projectId?: string // Linked project
  assignedTo?: string | null // Family member assignment
  // Subtask support
  subtaskCount?: number // Total subtasks
  subtaskCompletedCount?: number // Completed subtasks
  // Event-specific
  location?: string
  allDay?: boolean
  googleDescription?: string // Read-only description from Google Calendar
  // Routine-specific
  recurrencePattern?: RecurrencePattern
  // Original data for actions
  originalTask?: Task
  originalEvent?: CalendarEvent
  originalRoutine?: Routine
}

export type TimeSection = 'now' | 'soon' | 'later' | 'unscheduled'

export function taskToTimelineItem(task: Task): TimelineItem {
  const subtaskCount = task.subtasks?.length
  const subtaskCompletedCount = task.subtasks?.filter(s => s.completed).length

  return {
    id: `task-${task.id}`,
    type: 'task',
    title: task.title,
    startTime: task.scheduledFor || null,
    endTime: null, // Tasks don't have duration/end time
    completed: task.completed,
    notes: task.notes,
    links: task.links,
    phoneNumber: task.phoneNumber,
    contactId: task.contactId,
    projectId: task.projectId,
    assignedTo: task.assignedTo,
    allDay: task.isAllDay,
    location: task.location,
    subtaskCount,
    subtaskCompletedCount,
    originalTask: task,
  }
}

function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

export function eventToTimelineItem(event: CalendarEvent): TimelineItem {
  // Handle both snake_case (from edge function) and camelCase (possibly transformed) field names
  const startTimeStr = event.start_time || event.startTime
  const endTimeStr = event.end_time || event.endTime
  const allDay = event.all_day ?? event.allDay
  const eventId = event.google_event_id || event.id

  return {
    id: `event-${eventId}`,
    type: 'event',
    title: event.title,
    startTime: parseDate(startTimeStr),
    endTime: parseDate(endTimeStr),
    completed: false, // Events don't have completion state
    googleDescription: event.description || undefined, // Read-only from GCal
    // notes will be populated separately from event_notes table
    location: event.location || undefined,
    allDay: allDay,
    originalEvent: event,
  }
}

export function routineToTimelineItem(routine: Routine, date: Date): TimelineItem {
  // Parse time_of_day if present (format: HH:MM:SS or HH:MM)
  let startTime: Date | null = null
  if (routine.time_of_day) {
    const [hours, minutes] = routine.time_of_day.split(':').map(Number)
    startTime = new Date(date)
    startTime.setHours(hours, minutes, 0, 0)
  }

  return {
    id: `routine-${routine.id}`,
    type: 'routine',
    title: routine.name,
    startTime,
    endTime: null, // Routines don't have duration
    completed: false, // Will be set from actionable_instances
    notes: routine.description || undefined,
    recurrencePattern: routine.recurrence_pattern,
    assignedTo: routine.assigned_to,
    originalRoutine: routine,
  }
}
