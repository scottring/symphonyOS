import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isQuietHours } from '@/lib/quietHours'
import type { EmailActionItem, EmailActionCategory } from '@/types/emailAction'

const POLL_INTERVAL_MS = 20 * 60 * 1000 // 20 minutes — realtime covers new items; poll is a safety net
const SCAN_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours (was 2h) — cut email-scanner AI spend

export function useEmailActionItems() {
  const { user } = useAuth()
  const [items, setItems] = useState<EmailActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchItems = useCallback(async () => {
    if (!user) return

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('email_action_items')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['new', 'acknowledged'])
      .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
      .order('urgency', { ascending: true }) // urgent first
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20)

    if (!error && data && mountedRef.current) {
      setItems(data as EmailActionItem[])
    }
    if (mountedRef.current) setLoading(false)
  }, [user])

  // Acknowledge an item
  const acknowledge = useCallback(async (itemId: string) => {
    await supabase
      .from('email_action_items')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
      .eq('id', itemId)
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'acknowledged' as const } : i))
  }, [])

  // Snooze until tomorrow
  const snooze = useCallback(async (itemId: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(7, 0, 0, 0)
    await supabase
      .from('email_action_items')
      .update({ status: 'snoozed', snoozed_until: tomorrow.toISOString() })
      .eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // Dismiss an item
  const dismiss = useCallback(async (itemId: string) => {
    await supabase
      .from('email_action_items')
      .update({ status: 'dismissed' })
      .eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // Mark done
  const markDone = useCallback(async (itemId: string) => {
    await supabase
      .from('email_action_items')
      .update({ status: 'done' })
      .eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // Filter by category
  const getByCategory = useCallback((category: EmailActionCategory) => {
    return items.filter(i => i.category === category)
  }, [items])

  // Trigger the email-scanner edge function (rate-limited to every 2 hours)
  const runScanner = useCallback(async () => {
    // Only scan during waking hours (6 AM - 9 PM)
    const hour = new Date().getHours()
    if (hour < 6 || hour >= 21) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      // Shared, cross-device claim — exactly one device runs the scanner per
      // interval (replaces per-device localStorage gating).
      const { data: claimed } = await supabase.rpc('claim_engine_run', {
        p_key: `email-scanner:${session.user.id}`,
        p_interval_seconds: SCAN_INTERVAL_MS / 1000,
      })
      if (!claimed) return

      const { error } = await supabase.functions.invoke('email-scanner', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) {
        console.error('[email-scanner] Error:', error)
      } else {
        await fetchItems()
      }
    } catch (err) {
      console.error('[email-scanner] Failed:', err)
    }
  }, [fetchItems])

  // Urgent items
  const urgentItems = items.filter(i => i.urgency === 'urgent')

  useEffect(() => {
    mountedRef.current = true
    fetchItems().then(() => {
      runScanner()
    })

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (isQuietHours()) return
      fetchItems()
    }, POLL_INTERVAL_MS)

    // Realtime subscription
    const channel = supabase
      .channel('email-action-items')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'email_action_items',
      }, () => {
        fetchItems()
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
   
  }, [fetchItems, runScanner])

  return {
    items,
    urgentItems,
    loading,
    acknowledge,
    snooze,
    dismiss,
    markDone,
    getByCategory,
    refetch: fetchItems,
  }
}
