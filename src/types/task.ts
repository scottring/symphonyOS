import type { Scope } from '@/lib/scope'
import type { TaskDirections } from '@/types/directions'
import type { Facet } from '@/types/facets'
export type { Scope }

export interface TaskLink {
  url: string
  title?: string // Fetched page title, falls back to URL if not available
  /** What the page actually says, read once at save time by the analyze-link
   *  edge function and stored in the same closed vocabulary attachments use.
   *  A saved link is context you'll want at execution time; this is what turns
   *  it from a blue hostname into the phone number you needed. */
  facets?: Facet[]
  /** Set when analysis finished, success or failure — the idempotency flag.
   *  Absent = never looked at; present with empty facets = looked at, nothing
   *  worth keeping. */
  analyzedAt?: string
}

export type TaskBucket = 'inbox' | 'week' | 'month' | 'quarter' | 'someday' | 'timed'

export type TaskContext = 'work' | 'family' | 'personal'

// Category represents what KIND of family item this is
// Defaults to 'task' for backwards compatibility
export type TaskCategory = 'task' | 'chore' | 'errand' | 'event' | 'activity' | 'homework'

// Prep/Follow-up task linking
export type LinkType = 'prep' | 'followup'

export type LinkedActivityType = 'task' | 'routine_instance' | 'calendar_event' | 'list_item'

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
  /** Owner (`tasks.user_id`) — whose row this is, for "is this MINE" checks
   *  (e.g. the Inbox re-filing strip). Distinct from assignedTo (who should
   *  DO it) and contactId (who it's about). */
  userId?: string
  bucket?: TaskBucket // inbox, week, month, quarter, or timed
  scheduledFor?: Date // When this task is scheduled (only set when bucket='timed')
  deferredUntil?: Date // Legacy — kept for backwards compat, prefer bucket
  deferCount?: number // Times this task has been deferred
  weekDeferredAt?: Date // Set when an item already in 'week' bucket is bumped to next week — sinks it to the bottom of the This Week popover
  weekStart?: Date // Which week a bucket='week' task belongs to (that week's start, per weekStartsOn). undefined = the current week (legacy rows).
  monthStart?: Date // Which month a bucket='month' task belongs to (its 1st). undefined = the current month (legacy rows).
  seasonStart?: Date // Which season a bucket='quarter' task belongs to (its start, per the household's seasons). undefined = the current season.
  /** A goal on a month/season list: an outcome you tick, never a thing you place.
   *  The writers refuse to schedule or bucket-move it. Meaningful only for
   *  bucket month/quarter; a week row is a task by definition. */
  isGoal?: boolean
  pickedAt?: Date | null // Season picks: set when the user explicitly picks this quarter item for the season (null/undefined = on the shelf). null is an explicit "set aside" write.
  captureMeta?: TaskCaptureMeta // Photo-first capture state (AI enrichment + suggested merge destination)
  isAllDay?: boolean // True = all day task, false/undefined = specific time
  isSomeday?: boolean // Legacy — replaced by bucket system
  isWaiting?: boolean // True = waiting on someone else (all actions done, pending response)
  waitingSince?: Date // When the task entered waiting state
  /** WHAT you're waiting for, in your own words — e.g. "Guy's response on
   *  whether they can make it to pizza Saturday". Displayed beneath the title
   *  and used by the assistant when a wait goes long. */
  waitingFor?: string
  context?: TaskContext | null // Context: work, family, personal (null = untagged/private)
  scope?: Scope // Who can SEE it: individual (private) | couple | compound (household)
  category?: TaskCategory // What kind of family item (default: 'task')
  notes?: string
  /** Set when this task was extracted from a capture (a Supernote page, or a
   * text sent through capture-to-inbox). Links the row back to its source. */
  captureId?: string
  links?: TaskLink[]
  phoneNumber?: string
  /** Address to reach for this task — the school office, the vendor, the
   *  claims desk. Sibling to phoneNumber: both are "how do I reach whoever
   *  this task requires", captured once and surfaced when you act. */
  email?: string
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
  /**
   * The day this was marked "needed today". A DATE, not a flag: it expires by
   * ceasing to match the viewed day, so no job has to clear it. Never called a
   * "pin" — `pinned_items` is a different, durable system.
   */
  neededOn?: Date
  // ── Planning-cascade lineage (2026-07-15_task_lineage) ──
  /** The task this one was copied down from (season→month, month→week).
   *  Immediate cascade parent — distinct from parentTaskId (subtask nesting). */
  sourceId?: string
  /** The annual goal this task ultimately serves. Stamped on goal promotion,
   *  inherited by every copy below, so goal roll-up is a flat filter. */
  goalId?: string
  /** Fun-audit mark (Best Laid Plans): this item exists because it's fun. */
  isFun?: boolean
  /** Manual position among items with no time (all-day, unscheduled, group
   *  members). Gap-based: increments of 1000 so a drag usually rewrites one
   *  row. null = never manually ordered. Timed items sort by time, not this. */
  sortOrder?: number | null
}
