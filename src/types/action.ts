/**
 * Action types for AI-powered task execution
 * Supports SMS and email actions with preview/confirm flow
 */

export type ActionType = 'sms' | 'email'

export type ActionStatus = 'draft' | 'confirmed' | 'sent' | 'failed'

/**
 * Recipient resolved from contacts or entered manually
 */
export interface ActionRecipient {
  contactId?: string
  name: string
  phone?: string // E.164 format for SMS
  email?: string // For email actions
}

/**
 * Result from AI parsing of user input
 */
export interface ParsedAction {
  isAction: boolean
  actionType?: ActionType
  recipient?: ActionRecipient
  possibleRecipients?: ActionRecipient[] // For disambiguation when multiple matches
  draftMessage?: string
  subject?: string // For email actions
  confidence: number // 0-1 confidence score
  originalInput: string
  reasoning?: string // AI's explanation for the parsing
}

/**
 * Action ready for execution or in history
 */
export interface Action {
  id: string
  type: ActionType
  recipient: ActionRecipient
  message: string
  subject?: string // For email
  status: ActionStatus
  createdAt: Date
  sentAt?: Date
  error?: string
  // External IDs for tracking
  twilioSid?: string
  resendId?: string
}

/**
 * Database representation of action log
 */
export interface DbActionLog {
  id: string
  user_id: string
  action_type: ActionType
  status: ActionStatus
  // Recipient
  recipient_contact_id: string | null
  recipient_name: string
  recipient_phone: string | null
  recipient_email: string | null
  // Content
  original_input: string
  ai_draft: string | null
  final_message: string
  subject: string | null
  // Execution
  sent_at: string | null
  error: string | null
  twilio_sid: string | null
  resend_id: string | null
  // AI metadata
  ai_confidence: number | null
  ai_model: string | null
  ai_latency_ms: number | null
  // Timestamps
  created_at: string
  updated_at: string
}

/**
 * Convert database action log to frontend Action type
 */
export function dbActionLogToAction(db: DbActionLog): Action {
  return {
    id: db.id,
    type: db.action_type,
    recipient: {
      contactId: db.recipient_contact_id ?? undefined,
      name: db.recipient_name,
      phone: db.recipient_phone ?? undefined,
      email: db.recipient_email ?? undefined,
    },
    message: db.final_message,
    subject: db.subject ?? undefined,
    status: db.status,
    createdAt: new Date(db.created_at),
    sentAt: db.sent_at ? new Date(db.sent_at) : undefined,
    error: db.error ?? undefined,
    twilioSid: db.twilio_sid ?? undefined,
    resendId: db.resend_id ?? undefined,
  }
}

/**
 * SMS character limits
 */
export const SMS_LIMITS = {
  SINGLE_SEGMENT: 160,
  MULTI_SEGMENT: 153, // Each segment in multi-part SMS
  WARNING_THRESHOLD: 140,
} as const

/**
 * Get SMS segment info for character count display
 */
export function getSmsSegmentInfo(message: string): {
  charCount: number
  segmentCount: number
  charsRemaining: number
  isMultiSegment: boolean
} {
  const charCount = message.length

  if (charCount <= SMS_LIMITS.SINGLE_SEGMENT) {
    return {
      charCount,
      segmentCount: 1,
      charsRemaining: SMS_LIMITS.SINGLE_SEGMENT - charCount,
      isMultiSegment: false,
    }
  }

  const segmentCount = Math.ceil(charCount / SMS_LIMITS.MULTI_SEGMENT)
  const charsInLastSegment = charCount % SMS_LIMITS.MULTI_SEGMENT || SMS_LIMITS.MULTI_SEGMENT
  const charsRemaining = SMS_LIMITS.MULTI_SEGMENT - charsInLastSegment

  return {
    charCount,
    segmentCount,
    charsRemaining,
    isMultiSegment: true,
  }
}

// =============================================================================
// Daily Brief Types (Phase 3: Proactive AI)
// =============================================================================

export type DailyBriefItemType =
  | 'stale_followup'
  | 'conflict'
  | 'deferred_reminder'
  | 'upcoming_deadline'
  | 'inbox_reminder'
  | 'routine_check'
  | 'ai_suggestion'
  | 'overdue'
  | 'empty_project'
  | 'unassigned'
  | 'calendar_reminder'
  | 'proactive_suggestion'

export type DailyBriefActionType =
  | 'follow_up'
  | 'mark_resolved'
  | 'snooze'
  | 'schedule'
  | 'defer'
  | 'delete'
  | 'open'
  | 'complete'
  | 'draft_email'
  | 'send_note'

// Import and re-export TaskContext from task.ts
import type { TaskContext } from './task'
export type { TaskContext }

export type DailyBriefPriority = 'high' | 'medium' | 'low'

export interface DailyBriefSuggestedAction {
  label: string
  action: DailyBriefActionType
}

export interface DailyBriefItem {
  id: string
  type: DailyBriefItemType
  title: string
  description: string
  relatedEntityType?: 'task' | 'contact' | 'event' | 'action_log' | 'project'
  relatedEntityId?: string
  suggestedActions: DailyBriefSuggestedAction[]
  priority: DailyBriefPriority
  context?: TaskContext
}

export interface DailyBrief {
  id: string
  userId: string
  briefDate: string
  greeting: string
  summary: string
  items: DailyBriefItem[]
  generatedAt: Date
  viewedAt?: Date
  dismissedAt?: Date
}

export interface DbDailyBrief {
  id: string
  user_id: string
  brief_date: string
  greeting: string
  summary: string
  items: DailyBriefItem[]
  generated_at: string
  viewed_at: string | null
  dismissed_at: string | null
}

export function dbDailyBriefToDailyBrief(db: DbDailyBrief): DailyBrief {
  return {
    id: db.id,
    userId: db.user_id,
    briefDate: db.brief_date,
    greeting: db.greeting,
    summary: db.summary,
    items: db.items,
    generatedAt: new Date(db.generated_at),
    viewedAt: db.viewed_at ? new Date(db.viewed_at) : undefined,
    dismissedAt: db.dismissed_at ? new Date(db.dismissed_at) : undefined,
  }
}
