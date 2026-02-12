// Entry — the content atom of the Relish system
// Every piece of content in any manual or yearbook is an Entry.

import type { DomainId } from './manual'

export type EntryType =
  | 'insight'
  | 'activity'
  | 'goal'
  | 'task'
  | 'reflection'
  | 'story'
  | 'checklist'
  | 'discussion'
  | 'milestone'

export type EntrySource = 'system' | 'parent' | 'child' | 'imported'
export type EntryLifecycle = 'active' | 'completed' | 'archived'
export type EntryVisibility = 'family' | 'parents' | 'individual'

export interface Entry {
  id: string
  household_id: string
  user_id: string
  manual_id?: string | null
  yearbook_id?: string | null
  person_id?: string | null
  type: EntryType
  source: EntrySource
  domain: DomainId
  title: string
  content: EntryContent
  linked_entry_ids: string[]
  lifecycle: EntryLifecycle
  visibility: EntryVisibility
  completed_at?: string | null
  created_at: string
  updated_at: string
}

// Discriminated union for type-specific content
export type EntryContent =
  | StoryContent
  | ChecklistContent
  | GoalContent
  | ReflectionContent
  | DiscussionContent
  | ActivityContent
  | InsightContent
  | TaskContent
  | MilestoneContent

export interface StoryContent {
  kind: 'story'
  body: string
  characterName?: string
  theme?: string
  illustrationUrl?: string
  readAloud?: boolean
}

export interface ChecklistContent {
  kind: 'checklist'
  items: ChecklistItem[]
  frequency?: 'daily' | 'weekly' | 'once'
}

export interface ChecklistItem {
  id: string
  label: string
  checked: boolean
  time?: string
}

export interface GoalContent {
  kind: 'goal'
  description: string
  targetDate?: string
  progress: number
  milestoneIds?: string[]
}

export interface ReflectionContent {
  kind: 'reflection'
  prompt: string
  response?: string
  sentiment?: 'positive' | 'neutral' | 'difficult'
}

export interface DiscussionContent {
  kind: 'discussion'
  prompt: string
  suggestedScript?: string
  targetAudience: 'family' | 'couple' | 'parent-child'
  responses?: DiscussionResponse[]
}

export interface DiscussionResponse {
  personId: string
  personName: string
  response: string
  timestamp: string
}

export interface ActivityContent {
  kind: 'activity'
  instructions: string
  ageRange?: { min: number; max: number }
  duration?: string
  materials?: string[]
  completed?: boolean
}

export interface InsightContent {
  kind: 'insight'
  body: string
  source: string
  actionable?: boolean
}

export interface TaskContent {
  kind: 'task'
  description: string
  assignee?: string
  dueDate?: string
  completed: boolean
}

export interface MilestoneContent {
  kind: 'milestone'
  description: string
  achievedDate?: string
  celebrationNote?: string
}
