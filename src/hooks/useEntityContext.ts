import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  ProactiveSuggestion,
  ProactiveSuggestionRow,
  SuggestionEntityType,
} from '@/types/proactiveSuggestion'
import { rowToSuggestion } from '@/types/proactiveSuggestion'
import { actOnSuggestionDb, dismissSuggestionDb } from '@/lib/assistant/suggestionMutations'
import { unexpiredFilter } from '@/lib/assistant/suggestionFreshness'

export interface LastAction {
  actionType: string
  detail?: string
  outcome?: string
  createdAt: Date
}

export interface EntityContextResult {
  suggestions: ProactiveSuggestion[]
  lastAction: LastAction | null
  loading: boolean
  actOnSuggestion: (suggestionId: string, detail?: string, outcome?: string) => Promise<void>
  dismissSuggestion: (suggestionId: string) => Promise<void>
}

interface ActionHistoryRow {
  action_type: string
  detail: string | null
  outcome: string | null
  created_at: string
}

/**
 * Proactive suggestions + last-action fact for a single entity — the client
 * counterpart to the context-graph bundle's `history` part. Used to power
 * ContextChips wherever a task/event/etc. is rendered (panel or row).
 */
export function useEntityContext(
  entityType: SuggestionEntityType,
  entityId: string | null,
): EntityContextResult {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entityId || !user) {
      setSuggestions([])
      setLastAction(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    async function fetchContext() {
      const [suggestionsResult, historyResult] = await Promise.all([
        supabase
          .from('proactive_suggestions')
          .select('*')
          .eq('user_id', user!.id)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId as string)
          .eq('status', 'active')
          // 'active' alone never expired anything — see suggestionFreshness.ts.
          .or(unexpiredFilter())
          .order('confidence', { ascending: false }),
        supabase
          .from('action_history')
          .select('action_type, detail, outcome, created_at')
          .eq('user_id', user!.id)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId as string)
          .order('created_at', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return

      if (!suggestionsResult.error && suggestionsResult.data) {
        setSuggestions((suggestionsResult.data as ProactiveSuggestionRow[]).map(rowToSuggestion))
      } else {
        setSuggestions([])
      }

      if (!historyResult.error && historyResult.data && historyResult.data.length > 0) {
        const row = historyResult.data[0] as ActionHistoryRow
        setLastAction({
          actionType: row.action_type,
          detail: row.detail ?? undefined,
          outcome: row.outcome ?? undefined,
          createdAt: new Date(row.created_at),
        })
      } else {
        setLastAction(null)
      }

      setLoading(false)
    }

    fetchContext()

    return () => {
      cancelled = true
    }
  }, [entityType, entityId, user])

  // Mark acted + log to action_history. Shared with useProactiveSuggestions and
  // useUnpromptedSuggestions via lib/assistant/suggestionMutations.
  //
  // NOTE: anchored delivery deliberately never marks seen_at — you looked at the
  // entity, the assistant didn't interrupt you.
  const actOnSuggestion = useCallback(async (
    suggestionId: string,
    actionDetail?: string,
    outcome?: string,
  ) => {
    if (!user) return

    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion) return

    await actOnSuggestionDb(user.id, suggestion, actionDetail, outcome)

    // Optimistic update
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [user, suggestions])

  // Dismiss a suggestion
  const dismissSuggestion = useCallback(async (suggestionId: string) => {
    await dismissSuggestionDb(suggestionId)
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [])

  return {
    suggestions,
    lastAction,
    loading,
    actOnSuggestion,
    dismissSuggestion,
  }
}
