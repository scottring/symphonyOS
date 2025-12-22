import type { TripMetadata } from './trip'

export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed'
export type ProjectType = 'general' | 'trip'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  type?: ProjectType
  notes?: string
  parentId?: string
  tripMetadata?: TripMetadata
  createdAt: Date
  updatedAt: Date
}

export interface DbProject {
  id: string
  user_id: string
  name: string
  status: ProjectStatus
  type: ProjectType | null
  notes: string | null
  parent_id: string | null
  trip_metadata: TripMetadata | null
  created_at: string
  updated_at: string
}
