import type { Task, TaskLink, TaskCategory } from './task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, RecurrencePattern } from './actionable'
import { routineOwners } from '@/lib/routineUtils'
export type TimelineItemType = 'task' | 'event' | 'routine' | 'routine-collection'

/** One dose of a collection step (an exercise done N times/day). `id` is the slotted timeline id used for completion. */
export interface CollectionDose {
  id: string
  time: string | null
  completed: boolean
  /** Instance status 'skipped' — resolved for roll/anchor purposes but not counted as done. */
  skipped?: boolean
}

/** A collection step (exercise) with its doses grouped, so the name shows once instead of once per dose. */
export interface CollectionStepGroup {
  stepId: string // bare routine id of the exercise
  name: string
  progress: { done: number; total: number }
  doses: CollectionDose[]
}

export interface TimelineItem {
  id: string
  type: TimelineItemType
  title: string
  startTime: Date | null // null for unscheduled tasks
  endTime: Date | null
  completed: boolean
  skipped?: boolean
  isWaiting?: boolean
  /** What the wait is ON, in the user's words. Rendered beneath the title. */
  waitingFor?: string
  waitingSince?: Date
  needsDiscussion?: boolean
  discussionNote?: string
  /** The day this task was marked "needed today". Undefined = not marked. */
  neededOn?: Date
  // Context (from tasks)
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact
  projectId?: string // Linked project
  parentTaskId?: string // Parent task ID for subtasks
  assignedTo?: string | null // Family member assignment
  /** Routine items only: every member who owns this, collapsed from the three
   *  assignment columns by routineOwners(). `assignedTo` stays for callers that
   *  have not migrated. */
  owners?: string[]
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
  meetingUrl?: string // Video join URL from Google Meet hangoutLink or conferenceData
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean }[]
  // Routine-specific
  recurrencePattern?: RecurrencePattern
  // Routine-collection-specific
  collectionProgress?: { done: number; total: number }
  collectionNextUp?: { stepId: string; stepName: string; time: string | null; doseSlot: number | null }
  collectionSteps?: CollectionStepGroup[] // one entry per exercise (NOT per dose); present only on 'routine-collection'
  // Derived display state
  isOverdue?: boolean // True when item is past-due and incomplete
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
    isWaiting: task.isWaiting,
    waitingFor: task.waitingFor,
    waitingSince: task.waitingSince,
    needsDiscussion: task.needsDiscussion,
    discussionNote: task.discussionNote,
    neededOn: task.neededOn,
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
    meetingUrl: event.meeting_url || event.meetingUrl || undefined,
    attendees: event.attendees,
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
    context: routine.context,
    recurrencePattern: routine.recurrence_pattern,
    assignedTo: routine.assigned_to,
    owners: routineOwners(routine),
    originalRoutine: routine,
  }
}
