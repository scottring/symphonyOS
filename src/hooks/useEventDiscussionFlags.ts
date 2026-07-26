import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { getRecurringBaseId } from './useHiddenCalendarEvents'
import type { EventDiscussionFlag } from '@/types/eventDiscussion'

interface DbFlag {
  id: string
  user_id: string
  google_event_base_id: string
  event_title: string | null
  calendar_id: string | null
  discussion_note: string | null
  created_at: string
  updated_at: string
}

function dbToFlag(row: DbFlag): EventDiscussionFlag {
  return {
    id: row.id,
    userId: row.user_id,
    googleEventBaseId: row.google_event_base_id,
    eventTitle: row.event_title ?? undefined,
    calendarId: row.calendar_id ?? undefined,
    discussionNote: row.discussion_note ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function useEventDiscussionFlags() {
  const [flags, setFlags] = useState<EventDiscussionFlag[]>([])
  const [flagsByBaseId, setFlagsByBaseId] = useState<Map<string, EventDiscussionFlag>>(new Map())
  const [loading, setLoading] = useState(true)

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    async function fetch() {
      const { data: { user } } = await getAuthUser()
      if (!user) { setLoading(false); return }

      const { data, error } = await supabase
        .from('event_discussion_flags')
        .select('*')
        .eq('user_id', user.id)

      if (cancelled) return
      if (!error && data) {
        const mapped = (data as DbFlag[]).map(dbToFlag)
        setFlags(mapped)
        setFlagsByBaseId(new Map(mapped.map((f) => [f.googleEventBaseId, f])))
      }
      setLoading(false)
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  // Realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    async function subscribe() {
      const { data: { user } } = await getAuthUser()
      if (!user) return
      channel = supabase
        .channel('event_discussion_flags_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_discussion_flags', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const f = dbToFlag(payload.new as DbFlag)
              setFlags((prev) => {
                const without = prev.filter((p) => p.id !== f.id)
                return [...without, f]
              })
              setFlagsByBaseId((prev) => {
                const next = new Map(prev)
                next.set(f.googleEventBaseId, f)
                return next
              })
            } else if (payload.eventType === 'DELETE') {
              const old = payload.old as DbFlag
              setFlags((prev) => prev.filter((p) => p.id !== old.id))
              setFlagsByBaseId((prev) => {
                const next = new Map(prev)
                next.delete(old.google_event_base_id)
                return next
              })
            }
          }
        )
        .subscribe()
    }
    subscribe()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const isFlagged = useCallback((googleEventId: string): boolean => {
    return flagsByBaseId.has(getRecurringBaseId(googleEventId))
  }, [flagsByBaseId])

  const getFlag = useCallback((googleEventId: string): EventDiscussionFlag | undefined => {
    return flagsByBaseId.get(getRecurringBaseId(googleEventId))
  }, [flagsByBaseId])

  const flagEvent = useCallback(
    async (googleEventId: string, opts: { title?: string; calendarId?: string; note?: string }) => {
      const baseId = getRecurringBaseId(googleEventId)
      const { data: { user } } = await getAuthUser()
      if (!user) return false

      const { data, error } = await supabase
        .from('event_discussion_flags')
        .upsert(
          {
            user_id: user.id,
            google_event_base_id: baseId,
            event_title: opts.title ?? null,
            calendar_id: opts.calendarId ?? null,
            discussion_note: opts.note ?? null,
          },
          { onConflict: 'user_id,google_event_base_id' }
        )
        .select()
        .single()

      if (error || !data) {
        console.error('Failed to flag event:', error)
        return false
      }

      const f = dbToFlag(data as DbFlag)
      setFlags((prev) => [...prev.filter((p) => p.googleEventBaseId !== baseId), f])
      setFlagsByBaseId((prev) => {
        const next = new Map(prev)
        next.set(baseId, f)
        return next
      })
      return true
    },
    []
  )

  const unflagEvent = useCallback(async (googleEventId: string) => {
    const baseId = getRecurringBaseId(googleEventId)
    const { data: { user } } = await getAuthUser()
    if (!user) return false

    const { error } = await supabase
      .from('event_discussion_flags')
      .delete()
      .eq('user_id', user.id)
      .eq('google_event_base_id', baseId)

    if (error) {
      console.error('Failed to unflag event:', error)
      return false
    }
    setFlags((prev) => prev.filter((p) => p.googleEventBaseId !== baseId))
    setFlagsByBaseId((prev) => {
      const next = new Map(prev)
      next.delete(baseId)
      return next
    })
    return true
  }, [])

  const updateNote = useCallback(async (googleEventId: string, note: string) => {
    const baseId = getRecurringBaseId(googleEventId)
    const { data: { user } } = await getAuthUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('event_discussion_flags')
      .update({ discussion_note: note || null })
      .eq('user_id', user.id)
      .eq('google_event_base_id', baseId)
      .select()
      .single()

    if (error || !data) {
      console.error('Failed to update discussion note:', error)
      return false
    }
    const f = dbToFlag(data as DbFlag)
    setFlags((prev) => [...prev.filter((p) => p.googleEventBaseId !== baseId), f])
    setFlagsByBaseId((prev) => {
      const next = new Map(prev)
      next.set(baseId, f)
      return next
    })
    return true
  }, [])

  return { flags, flagsByBaseId, loading, isFlagged, getFlag, flagEvent, unflagEvent, updateNote }
}
