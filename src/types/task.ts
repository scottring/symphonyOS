import type { Scope } from '@/lib/scope'
import type { TaskDirections } from '@/types/directions'
export type { Scope }

export interface TaskLink {
  url: string
  title?: string // Fetched page title, falls back to URL if not available
}

export type TaskBucket = 'inbox' | 'week' | 'month' | 'quarter' | 'someday' | 'timed'

export type TaskContext = 'work' | 'family' | 'personal'

// Category represents what KIND of family item this is
// Defaults to 'task' for backwards compatibility
export type TaskCategory = 'task' | 'chore' | 'errand' | 'event' | 'activity'

// Prep/Follow-up task linking
export type LinkType = 'prep' | 'followup'

export type LinkedActivityType = 'task' | 'routine_instance' | 'calendar_event'

export interface LinkedActivity {
  type: LinkedActivityType
  id: string // For routine_instance: "{routineId}_{date}", for others: entity id
}

/** A non-task member of a Today group (events/routines attach to the wrapper here; tasks use parentTaskId). */
export type GroupMemberRef = { type: 'event' | 'routine'; id: string }

/** Mirrors tasks.capture_meta jsonb (photo-first capture, written by the
 *  analyze-capture edge function). */
export interface TaskCaptureMeta {
  status?: 'pending' | 'done' | 'failed'
  storagePath?: string
  suggestedTaskId?: string
}

export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  updatedAt: Date
  bucket?: TaskBucket // inbox, week, month, quarter, or timed
  scheduledFor?: Date // When this task is scheduled (only set when bucket='timed')
  deferredUntil?: Date // Legacy — kept for backwards compat, prefer bucket
  deferCount?: number // Times this task has been deferred
  weekDeferredAt?: Date // Set when an item already in 'week' bucket is bumped to next week — sinks it to the bottom of the This Week popover
  captureMeta?: TaskCaptureMeta // Photo-first capture state (AI enrichment + suggested merge destination)
  isAllDay?: boolean // True = all day task, false/undefined = specific time
  isSomeday?: boolean // Legacy — replaced by bucket system
  isWaiting?: boolean // True = waiting on someone else (all actions done, pending response)
  waitingSince?: Date // When the task entered waiting state
  context?: TaskContext | null // Context: work, family, personal (null = untagged/private)
  scope?: Scope // Who can SEE it: individual (private) | couple | compound (household)
  category?: TaskCategory // What kind of family item (default: 'task')
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact (who task is ABOUT)
  assignedTo?: string // Who should DO this task (family member id) - legacy single assignment
  assignedToAll?: string[] // Multi-member assignment
  projectId?: string // Linked project
  parentTaskId?: string // If set, this is a subtask
  subtasks?: Task[] // Populated on fetch, not stored in DB
  /** Wrapper-only: events/routines grouped under this task on Today. Tasks attach via parentTaskId. */
  groupMembers?: GroupMemberRef[]
  linkedEventId?: string // Links prep task to meal event (legacy, use linkedTo instead)
  // Generalized linking for prep/follow-up tasks
  linkedTo?: LinkedActivity
  linkType?: LinkType
  estimatedDuration?: number // Duration in minutes (default 30 in UI)
  location?: string // Address or place name for location-based tasks
  locationPlaceId?: string // Google Place ID for precise directions
  directions?: TaskDirections // Persisted route: starting point + stops + travel mode
  // Needs-discussion flag — surfaces on family kiosk's For Discussion list
  needsDiscussion?: boolean
  discussionNote?: string
}
