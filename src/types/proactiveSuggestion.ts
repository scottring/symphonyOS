export type SuggestionEntityType = 'task' | 'calendar_event' | 'email_action' | 'general'

export type SuggestionType =
  | 'call'
  | 'text'
  | 'email'
  | 'open_link'
  | 'guided_chat'
  | 'camera_analyze'
  | 'create_task'
  | 'followup'
  | 'navigate'
  | 'someday'
  | 'stale'
  | 'do_today'
  | 'plan_session'

export type SuggestionActionType =
  | 'call'
  | 'text'
  | 'email'
  | 'open_link'
  | 'guided_chat'
  | 'camera'
  | 'create_task'
  | 'navigate'

export type SuggestionStatus = 'active' | 'acted' | 'dismissed' | 'expired'

export interface ProactiveSuggestion {
  id: string
  userId: string
  entityType: SuggestionEntityType
  entityId: string
  suggestionType: SuggestionType
  title: string
  detail?: string
  confidence: number
  actionType?: SuggestionActionType
  actionPayload: Record<string, unknown>
  status: SuggestionStatus
  actedAt?: string
  dismissedAt?: string
  expiresAt?: string
  suggestionKey: string
  generatedAt: string
  createdAt: string
  updatedAt: string

  // ── Interruption policy (unprompted delivery tier) ──────────────────────
  /** Rules-derived 0-100, written by the engine. A HINT only — recompute live
   *  before any interruption decision (see src/lib/assistant/urgency.ts). */
  urgency?: number
  /** First render on an unprompted surface. Anchored chips never set this. */
  seenAt?: string
  /** Urgency at the moment it was seen — lets escalation override cooldown. */
  seenUrgency?: number
  /** "Not now" — muted while in the future. The row stays `active`. */
  snoozedUntil?: string
}

// DB row shape (snake_case)
export interface ProactiveSuggestionRow {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  suggestion_type: string
  title: string
  detail: string | null
  confidence: number
  action_type: string | null
  action_payload: Record<string, unknown>
  status: string
  acted_at: string | null
  dismissed_at: string | null
  expires_at: string | null
  suggestion_key: string
  generated_at: string
  created_at: string
  updated_at: string
  urgency: number | null
  seen_at: string | null
  seen_urgency: number | null
  snoozed_until: string | null
}

export function rowToSuggestion(row: ProactiveSuggestionRow): ProactiveSuggestion {
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type as SuggestionEntityType,
    entityId: row.entity_id,
    suggestionType: row.suggestion_type as SuggestionType,
    title: row.title,
    detail: row.detail ?? undefined,
    confidence: row.confidence,
    actionType: (row.action_type as SuggestionActionType) ?? undefined,
    actionPayload: row.action_payload,
    status: row.status as SuggestionStatus,
    actedAt: row.acted_at ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    suggestionKey: row.suggestion_key,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    urgency: row.urgency ?? undefined,
    seenAt: row.seen_at ?? undefined,
    seenUrgency: row.seen_urgency ?? undefined,
    snoozedUntil: row.snoozed_until ?? undefined,
  }
}
