import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'

export interface PanelEntity {
  /** The primary entity the panel is rendering. Plan 1: tasks only. */
  task: Task
}

export interface LinkedEntities {
  contact?: Contact
  project?: Project
  linkedEvent?: CalendarEvent
  assignee?: FamilyMember
  siblingTasks: Task[]
}

export interface MightBeRelevantItem {
  id: string
  kind: 'task' | 'contact' | 'note' | 'link'
  title: string
  /** Human-readable reason for surfacing — e.g. "same contact · 8 weeks ago" */
  reason: string
  /** Whether the related item is done — rendered struck-through/greyed. */
  completed?: boolean
}
