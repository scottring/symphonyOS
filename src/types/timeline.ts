import type { Task } from './task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export type TimelineItemType = 'task' | 'event'

export interface TimelineItem {
  id: string
  type: TimelineItemType
  title: string
  startTime: Date | null // null for unscheduled tasks
  endTime: Date | null
  completed: boolean
  // Context (from tasks)
  notes?: string
  links?: string[]
  phoneNumber?: string
  // Event-specific
  location?: string
  allDay?: boolean
  googleDescription?: string // Read-only description from Google Calendar
  // Original data for actions
  originalTask?: Task
  originalEvent?: CalendarEvent
}

export type TimeSection = 'now' | 'soon' | 'later' | 'unscheduled'

export function taskToTimelineItem(task: Task): TimelineItem {
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
