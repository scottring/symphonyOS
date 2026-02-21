export type GoalStatus = 'active' | 'completed' | 'archived'
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type MilestoneStatus = 'pending' | 'in_progress' | 'achieved'

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

export interface GoalMilestone {
  id: string
  goalId: string
  userId: string
  title: string
  description?: string
  targetDate?: string
  targetValue?: number
  currentValue: number
  unit?: string
  status: MilestoneStatus
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface Goal {
  id: string
  areaId: string
  name: string
  year: number
  notes?: string
  strategy?: string
  domainSlug?: string
  layerId?: string
  status: GoalStatus
  sortOrder: number
  actions: GoalAction[]
  milestones: GoalMilestone[]
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
  strategy: string | null
  domain_slug: string | null
  layer_id: string | null
  status: GoalStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbGoalMilestone {
  id: string
  goal_id: string
  user_id: string
  title: string
  description: string | null
  target_date: string | null
  target_value: number | null
  current_value: number | null
  unit: string | null
  status: MilestoneStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DbGoalConversation {
  id: string
  goal_id: string
  user_id: string
  messages: ConversationMessage[]
  status: 'in_progress' | 'completed'
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

// AI planning result returned from goal-planning-chat finish action
export interface GoalPlanningResult {
  strategy: string
  milestones: Array<{
    title: string
    description?: string
    targetDate?: string
    targetValue?: number
    unit?: string
  }>
  suggestedBlocks: Array<{
    label: string
    blockType: string
    timeSlot: string
    narrative: string
    coachingNote?: string
    items?: Array<{ who: string; action: string; context?: string; coaching?: string }>
    dayTypes: string[]
  }>
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
