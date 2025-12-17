export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  notes?: string
  parentId?: string
  createdAt: Date
  updatedAt: Date
}

export interface DbProject {
  id: string
  user_id: string
  name: string
  status: ProjectStatus
  notes: string | null
  parent_id: string | null
  created_at: string
  updated_at: string
}
