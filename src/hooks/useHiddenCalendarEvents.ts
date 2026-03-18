import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface HiddenCalendarEvent {
  id: string
  google_event_base_id: string
  event_title: string | null
  calendar_id: string | null
}

/**
 * Extract the base recurring event ID from a Google Calendar event ID.
 * Recurring instances have IDs like "abc123_20260318T130000Z" — the base is "abc123".
 * Non-recurring events just use their full ID.
 */
export function getRecurringBaseId(googleEventId: string): string {
  // Google recurring event instances have format: baseId_YYYYMMDDTHHMMSSZ
  const match = googleEventId.match(/^(.+)_\d{8}T\d{6}Z$/)
  return match ? match[1] : googleEventId
}

export function useHiddenCalendarEvents() {
  const [hiddenEvents, setHiddenEvents] = useState<HiddenCalendarEvent[]>([])
  const [hiddenBaseIds, setHiddenBaseIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Fetch hidden events on mount
  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data, error } = await supabase
        .from('hidden_calendar_events')
        .select('id, google_event_base_id, event_title, calendar_id')
        .eq('user_id', user.id)

      if (!error && data) {
        setHiddenEvents(data)
        setHiddenBaseIds(new Set(data.map(e => e.google_event_base_id)))
      }
      setLoading(false)
    }
    fetch()
  }, [])

  // Check if an event is hidden
  const isHidden = useCallback((googleEventId: string): boolean => {
    const baseId = getRecurringBaseId(googleEventId)
    return hiddenBaseIds.has(baseId)
  }, [hiddenBaseIds])

  // Hide a recurring event (all instances)
  const hideEvent = useCallback(async (googleEventId: string, title?: string, calendarId?: string) => {
    const baseId = getRecurringBaseId(googleEventId)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('hidden_calendar_events')
      .insert({
        user_id: user.id,
        google_event_base_id: baseId,
        event_title: title || null,
        calendar_id: calendarId || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to hide event:', error)
      return false
    }

    setHiddenEvents(prev => [...prev, data])
    setHiddenBaseIds(prev => new Set([...prev, baseId]))
    return true
  }, [])

  // Unhide a recurring event
  const unhideEvent = useCallback(async (googleEventBaseId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('hidden_calendar_events')
      .delete()
      .eq('user_id', user.id)
      .eq('google_event_base_id', googleEventBaseId)

    if (error) {
      console.error('Failed to unhide event:', error)
      return false
    }

    setHiddenEvents(prev => prev.filter(e => e.google_event_base_id !== googleEventBaseId))
    setHiddenBaseIds(prev => {
      const next = new Set(prev)
      next.delete(googleEventBaseId)
      return next
    })
    return true
  }, [])

  return {
    hiddenEvents,
    hiddenBaseIds,
    loading,
    isHidden,
    hideEvent,
    unhideEvent,
  }
}
