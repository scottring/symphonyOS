export interface TaskLink {
  url: string
  title?: string // Fetched page title, falls back to URL if not available
}

export type TaskContext = 'work' | 'family' | 'personal'

export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  scheduledFor?: Date // When this task is scheduled to be done (commitment)
  deferredUntil?: Date // Show in inbox again on this date (punt)
  deferCount?: number // Times this task has been deferred
  isAllDay?: boolean // True = all day task, false/undefined = specific time
  context?: TaskContext // Context: work, family, personal
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact (who task is ABOUT)
  assignedTo?: string // Who should DO this task (contact id)
  projectId?: string // Linked project
  parentTaskId?: string // If set, this is a subtask
  subtasks?: Task[] // Populated on fetch, not stored in DB
  linkedEventId?: string // Links prep task to meal event
  estimatedDuration?: number // Duration in minutes (default 30 in UI)
}
