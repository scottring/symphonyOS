import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isQuietHours } from '@/lib/quietHours'

export interface KioskCard {
  id: string
  card_type: string
  title: string
  subtitle: string | null
  body: Record<string, unknown>
  source_task_id: string | null
  source_project_id: string | null
  icon: string | null
  priority: number
  expires_at: string | null
  dismissed: boolean
  created_at: string
}

const POLL_INTERVAL_MS = 12 * 60 * 1000 // 12 minutes (was 3) — glance display, no need to poll so often
const AGENT_RUN_INTERVAL_MS = 8 * 60 * 60 * 1000 // 8 hours (was 4h) — cut kiosk-agent (gpt-4o) spend

export function useKioskCards() {
  const { user } = useAuth()
  const [cards, setCards] = useState<KioskCard[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  // Fetch active (non-dismissed, non-expired) cards
  const fetchCards = useCallback(async () => {
    if (!user) return

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('kiosk_cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('priority', { ascending: false })
      .limit(10)

    if (!error && data && mountedRef.current) {
      setCards(data as KioskCard[])
    }
    if (mountedRef.current) setLoading(false)
  }, [user])

  // Trigger the kiosk-agent edge function (rate-limited to every 4 hours)
  const runAgent = useCallback(async () => {
    // Don't run the (gpt-4o) agent overnight — the always-on wall is unread while
    // everyone sleeps, so an overnight run is pure spend nobody sees.
    if (isQuietHours()) return

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession?.access_token) return

      // Shared, cross-device claim — exactly one device runs the agent per
      // interval (replaces per-device localStorage gating).
      const { data: claimed } = await supabase.rpc('claim_engine_run', {
        p_key: `kiosk-agent:${currentSession.user.id}`,
        p_interval_seconds: AGENT_RUN_INTERVAL_MS / 1000,
      })
      if (!claimed) return

      const { data, error } = await supabase.functions.invoke('kiosk-agent', {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      })

      if (error) {
        console.error('[kiosk-agent] Error:', error)
      } else {
        console.log('[kiosk-agent] Result:', data)
        // Refresh cards after agent runs
        await fetchCards()
      }
    } catch (err) {
      console.error('[kiosk-agent] Failed:', err)
    }
  }, [fetchCards])

  // Dismiss a card
  const dismissCard = useCallback(async (cardId: string) => {
    await supabase
      .from('kiosk_cards')
      .update({ dismissed: true })
      .eq('id', cardId)
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // On mount: fetch cards, then attempt an agent run (the shared claim gate
    // lets exactly one device run per interval; the first-ever run claims
    // immediately, so a cold start still populates cards).
    fetchCards().then(() => {
      runAgent()
    })

    // Skip overnight polls — the always-on wall is unread while everyone sleeps.
    const interval = setInterval(() => { if (!isQuietHours()) fetchCards() }, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchCards, runAgent])

  return { cards, loading, dismissCard, refetchCards: fetchCards, runAgentNow: runAgent }
}
