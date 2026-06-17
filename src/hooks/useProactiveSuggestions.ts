import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isQuietHours } from '@/lib/quietHours'
import type {
  ProactiveSuggestion,
  ProactiveSuggestionRow,
  SuggestionEntityType,
} from '@/types/proactiveSuggestion'
import { rowToSuggestion } from '@/types/proactiveSuggestion'

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes — realtime covers new rows; poll is a safety net
const ENGINE_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours (was 4h) — cut AI engine spend
const ENGINE_KEY = 'proactive-engine-last-run'

export function useProactiveSuggestions() {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const mountedRef = useRef(true)

  // Fetch active suggestions
  const fetchSuggestions = useCallback(async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('proactive_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .limit(50)

    if (!error && data && mountedRef.current) {
      setSuggestions(data.map((row: ProactiveSuggestionRow) => rowToSuggestion(row)))
      if (data.length > 0) {
        setLastUpdated(new Date(data[0].generated_at))
      }
    }
    if (mountedRef.current) setLoading(false)
  }, [user])

  // Trigger the proactive engine
  const runEngine = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await supabase.functions.invoke('proactive-engine', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (response.error) {
        console.error('Proactive engine error:', response.error)
      }
      // Refresh suggestions after engine runs
      await fetchSuggestions()
    } catch (err) {
      console.error('Failed to invoke proactive engine:', err)
    }
  }, [fetchSuggestions])

  // Mark suggestion as acted on + log to action_history
  const actOnSuggestion = useCallback(async (
    suggestionId: string,
    actionDetail?: string,
    outcome?: string,
  ) => {
    if (!user) return

    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion) return

    // Update suggestion status
    await supabase
      .from('proactive_suggestions')
      .update({
        status: 'acted',
        acted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)

    // Log to action history
    await supabase
      .from('action_history')
      .insert({
        user_id: user.id,
        entity_type: suggestion.entityType,
        entity_id: suggestion.entityId,
        action_type: suggestion.actionType || suggestion.suggestionType,
        detail: actionDetail || suggestion.title,
        outcome: outcome || null,
      })

    // Optimistic update
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [user, suggestions])

  // Dismiss a suggestion
  const dismissSuggestion = useCallback(async (suggestionId: string) => {
    await supabase
      .from('proactive_suggestions')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)

    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [])

  // Get suggestions for a specific entity
  const suggestionsForEntity = useCallback((
    entityType: SuggestionEntityType,
    entityId: string,
  ): ProactiveSuggestion[] => {
    return suggestions.filter(
      s => s.entityType === entityType && s.entityId === entityId
    )
  }, [suggestions])

  // Top suggestions for daily briefing
  const topSuggestions = useMemo(() => {
    return suggestions.slice(0, 5)
  }, [suggestions])

  // Trigger engine on schedule (waking hours, every 4h)
  useEffect(() => {
    if (!user) return

    const hour = new Date().getHours()
    const isWakingHours = hour >= 6 && hour <= 22

    if (!isWakingHours) {
      fetchSuggestions()
      return
    }

    const lastRun = localStorage.getItem(ENGINE_KEY)
    const shouldRun = !lastRun || (Date.now() - parseInt(lastRun, 10)) > ENGINE_INTERVAL_MS

    if (shouldRun) {
      localStorage.setItem(ENGINE_KEY, Date.now().toString())
      runEngine()
    } else {
      fetchSuggestions()
    }
  }, [user, runEngine, fetchSuggestions])

  // Poll for updates
  useEffect(() => {
    if (!user) return

    // Skip polls for backgrounded tabs and overnight — a forgotten open tab
    // should not keep hitting the backend around the clock.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (isQuietHours()) return
      fetchSuggestions()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [user, fetchSuggestions])

  // Realtime subscription
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('proactive-suggestions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proactive_suggestions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchSuggestions()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchSuggestions])

  // Cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return {
    suggestions,
    suggestionsForEntity,
    topSuggestions,
    actOnSuggestion,
    dismissSuggestion,
    refreshSuggestions: runEngine,
    isLoading: loading,
    lastUpdated,
  }
}
