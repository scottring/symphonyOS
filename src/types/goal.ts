export type GoalStatus = 'active' | 'completed' | 'archived'
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

// ============================================================================
// Frontend types (camelCase)
// ============================================================================

export interface GoalArea {
  id: string
  name: string
  sortOrder: number
  createdAt: Date
}

export interface GoalAction {
  id: string
  goalId: string
  description: string
  quarter: Quarter
  completed: boolean
  notes?: string
  projectId?: string
  sortOrder: number
  createdAt: Date
}

export interface Goal {
  id: string
  areaId: string
  name: string
  year: number
  notes?: string
  status: GoalStatus
  sortOrder: number
  actions: GoalAction[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// Database types (snake_case)
// ============================================================================

export interface DbGoalArea {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface DbGoal {
  id: string
  user_id: string
  area_id: string
  name: string
  year: number
  notes: string | null
  status: GoalStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbGoalAction {
  id: string
  goal_id: string
  description: string
  quarter: Quarter
  completed: boolean
  notes: string | null
  project_id: string | null
  sort_order: number
  created_at: string
}
