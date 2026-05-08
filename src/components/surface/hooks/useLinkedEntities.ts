import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/types/calendar'
import type { FamilyMember } from '@/types/family'
import type { LinkedEntities } from '../types'

export interface LinkedEntitiesData {
  contacts: Contact[]
  projects: Project[]
  events: CalendarEvent[]
  familyMembers: FamilyMember[]
  /** Pool of tasks to filter siblings from — pass in already-loaded tasks. */
  siblingTaskCandidates: Task[]
}

export function useLinkedEntities(task: Task, data: LinkedEntitiesData): LinkedEntities {
  return useMemo(() => {
    const contact = task.contactId ? data.contacts.find(c => c.id === task.contactId) : undefined
    const project = task.projectId ? data.projects.find(p => p.id === task.projectId) : undefined
    const linkedEvent = task.linkedEventId
      ? data.events.find(e => (e.id === task.linkedEventId) || ((e as { google_event_id?: string }).google_event_id === task.linkedEventId))
      : undefined
    const assignee = task.assignedTo ? data.familyMembers.find(m => m.id === task.assignedTo) : undefined

    const siblingTasks = task.projectId
      ? data.siblingTaskCandidates.filter(t => t.projectId === task.projectId && t.id !== task.id && !t.completed)
      : []

    return { contact, project, linkedEvent, assignee, siblingTasks }
  }, [task, data])
}
