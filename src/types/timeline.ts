import type { Task, TaskLink, TaskCategory } from './task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, RecurrencePattern } from './actionable'
import type { PlaybookInstance } from './playbook'

export type TimelineItemType = 'task' | 'event' | 'routine' | 'playbook'

export interface TimelineItem {
  id: string
  type: TimelineItemType
  title: string
  startTime: Date | null // null for unscheduled tasks
  endTime: Date | null
  completed: boolean
  skipped?: boolean
  isWaiting?: boolean
  // Context (from tasks)
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact
  projectId?: string // Linked project
  parentTaskId?: string // Parent task ID for subtasks
  assignedTo?: string | null // Family member assignment
  context?: 'work' | 'family' | 'personal' | null // Life domain for filtering
  category?: TaskCategory // Type of task: task, chore, errand, event, activity
  // Subtask support
  isSubtask?: boolean // True if this item is a subtask appearing on the timeline
  subtaskCount?: number // Total subtasks
  subtaskCompletedCount?: number // Completed subtasks
  // Event-specific
  location?: string
  locationPlaceId?: string // Google Place ID for precise directions
  allDay?: boolean
  googleDescription?: string // Read-only description from Google Calendar
  calendarName?: string | null // Name of the source calendar (e.g., "Family", "Work")
  calendarColor?: string | null // Google Calendar color (hex)
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean }[]
  // Routine-specific
  recurrencePattern?: RecurrencePattern
  // Original data for actions
  originalTask?: Task
  originalEvent?: CalendarEvent
  originalRoutine?: Routine
  // Playbook-specific
  originalPlaybookInstance?: PlaybookInstance
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
    isWaiting: task.isWaiting,
    notes: task.notes,
    links: task.links,
    phoneNumber: task.phoneNumber,
    contactId: task.contactId,
    projectId: task.projectId,
    parentTaskId: task.parentTaskId,
    isSubtask: !!task.parentTaskId,
    assignedTo: task.assignedTo,
    context: task.context,
    category: task.category,
    allDay: task.isAllDay,
    location: task.location,
    locationPlaceId: task.locationPlaceId,
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
  const calendarName = event.calendar_name || event.calendarName
  const calendarColor = event.calendar_color || event.calendarColor

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
    calendarName: calendarName || undefined,
    calendarColor: calendarColor || undefined,
    attendees: event.attendees,
    originalEvent: event,
  }
}

/**
 * Convert a PlaybookInstance (with joined block) to a TimelineItem.
 * Parses the block's timeSlot to get a start time for sorting.
 */
export function playbookInstanceToTimelineItem(instance: PlaybookInstance, date: Date): TimelineItem {
  const block = instance.block
  if (!block) {
    return {
      id: `playbook-${instance.id}`,
      type: 'playbook',
      title: 'Unknown block',
      startTime: null,
      endTime: null,
      completed: instance.completed,
      originalPlaybookInstance: instance,
    }
  }

  // Parse timeSlot: "6:50" or "5:30-6:45" or "15:30"
  let startTime: Date | null = null
  const timeStr = block.timeSlot.split('-')[0].trim()
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    startTime = new Date(date)
    startTime.setHours(hours, minutes, 0, 0)
  }

  return {
    id: `playbook-${instance.id}`,
    type: 'playbook',
    title: block.label,
    startTime,
    endTime: null,
    completed: instance.completed,
    context: 'family', // Playbook blocks are always family context
    originalPlaybookInstance: instance,
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
    context: routine.context,
    recurrencePattern: routine.recurrence_pattern,
    assignedTo: routine.assigned_to,
    originalRoutine: routine,
  }
}
