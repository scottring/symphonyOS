import type { TaskLink } from './task'

export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  context?: 'work' | 'family' | 'personal' | null // Life domain for filtering
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  parentId?: string
  createdAt: Date
  updatedAt: Date
}

export interface DbProject {
  id: string
  user_id: string
  name: string
  status: ProjectStatus
  context?: 'work' | 'family' | 'personal' | null // Life domain for filtering
  notes: string | null
  links: TaskLink[] | null
  phone_number: string | null
  parent_id: string | null
  created_at: string
  updated_at: string
}
