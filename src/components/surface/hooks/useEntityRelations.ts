import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export interface EntityRelationsInput {
  kind: 'contact' | 'project' | 'event'
  entity: Contact | Project | CalendarEvent
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]
  /** Include completed tasks (default false). */
  includeCompleted?: boolean
}

export interface EntityRelations {
  tasks: Task[]
  events: CalendarEvent[]
  projects: Project[]
}

export function useEntityRelations(input: EntityRelationsInput): EntityRelations {
  return useMemo(() => {
    const { kind, entity, allTasks, includeCompleted = false } = input

    const taskFilter = (t: Task) => includeCompleted || !t.completed

    if (kind === 'contact') {
      const contact = entity as Contact
      const tasks = allTasks.filter(t => t.contactId === contact.id && taskFilter(t))
      return { tasks, events: [], projects: [] }
    }

    if (kind === 'project') {
      const project = entity as Project
      const tasks = allTasks.filter(t => t.projectId === project.id && taskFilter(t))
      return { tasks, events: [], projects: [] }
    }

    if (kind === 'event') {
      const event = entity as CalendarEvent
      const eventId = (event as { google_event_id?: string }).google_event_id || event.id
      const tasks = allTasks.filter(t => t.linkedEventId === eventId && taskFilter(t))
      return { tasks, events: [], projects: [] }
    }

    return { tasks: [], events: [], projects: [] }
  }, [input])
}
