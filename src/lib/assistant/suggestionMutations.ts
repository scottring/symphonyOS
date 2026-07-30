import { supabase } from '@/lib/supabase'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

/**
 * The DB writes for a suggestion's lifecycle, in one place. Previously
 * duplicated verbatim between useProactiveSuggestions and useEntityContext
 * (whose copy carried a comment acknowledging it); useUnpromptedSuggestions
 * would have been a third copy.
 *
 * These are plain async functions, not hooks — callers own their own optimistic
 * state updates.
 */

/** Mark acted + append to action_history. */
export async function actOnSuggestionDb(
  userId: string,
  suggestion: ProactiveSuggestion,
  actionDetail?: string,
  outcome?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('proactive_suggestions')
    .update({ status: 'acted', acted_at: now, updated_at: now })
    .eq('id', suggestion.id)

  await supabase.from('action_history').insert({
    user_id: userId,
    entity_type: suggestion.entityType,
    entity_id: suggestion.entityId,
    action_type: suggestion.actionType || suggestion.suggestionType,
    detail: actionDetail || suggestion.title,
    outcome: outcome || null,
  })
}

export async function dismissSuggestionDb(suggestionId: string): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('proactive_suggestions')
    .update({ status: 'dismissed', dismissed_at: now, updated_at: now })
    .eq('id', suggestionId)
}

/** "Not now" — the row stays active, just muted until `until`. */
export async function snoozeSuggestionDb(suggestionId: string, until: Date): Promise<void> {
  await supabase
    .from('proactive_suggestions')
    .update({ snoozed_until: until.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
}

/**
 * Record that an UNPROMPTED surface showed this. Anchored chips must never call
 * this — conflating "you looked at the entity" with "the assistant interrupted
 * you" would poison the exact signal seen_at exists to capture.
 *
 * The `is('seen_at', null)` filter makes this write-once at the database level,
 * so a re-render race can't overwrite the original timestamp.
 */
export async function markSuggestionSeenDb(suggestionId: string, urgency: number): Promise<void> {
  await supabase
    .from('proactive_suggestions')
    .update({ seen_at: new Date().toISOString(), seen_urgency: urgency })
    .eq('id', suggestionId)
    .is('seen_at', null)
}
