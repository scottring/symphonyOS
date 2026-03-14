import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

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

const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes
const AGENT_RUN_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours
const AGENT_RUN_KEY = 'kiosk-agent-last-run'

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
    const lastRun = localStorage.getItem(AGENT_RUN_KEY)
    if (lastRun) {
      const elapsed = Date.now() - parseInt(lastRun, 10)
      if (elapsed < AGENT_RUN_INTERVAL_MS) return
    }

    try {
      localStorage.setItem(AGENT_RUN_KEY, Date.now().toString())

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession?.access_token) return

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
    fetchCards()
    runAgent()

    const interval = setInterval(fetchCards, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchCards, runAgent])

  return { cards, loading, dismissCard, refetchCards: fetchCards, runAgentNow: runAgent }
}
