// src/hooks/useThreadUnread.ts
//
// Does this item's Discussion have something waiting for me? One light read
// (the thread row + my read stamp), a realtime subscription on that row so the
// dot flips live, and a refresh on tab return. Fails quiet: the dot is a hint.

import { useCallback, useEffect, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { onThreadRead } from '@/lib/discussions/readSignal'
import { isUnread, type ReadableMessage } from '@/lib/discussions/unread'

interface StoredMessage {
  role?: string
  timestamp?: string
  author?: { id?: string | null; kind?: string }
}

function toReadable(raw: unknown): ReadableMessage[] {
  if (!Array.isArray(raw)) return []
  return (raw as StoredMessage[]).map((m) => ({
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(0),
    author: {
      id: typeof m.author?.id === 'string' ? m.author.id : null,
      kind: m.role === 'assistant' || m.author?.kind === 'symphony' ? 'symphony' : 'member',
    },
  }))
}

export function useThreadUnread(
  entityType: 'task' | 'routine' | 'event' | null,
  entityId: string | null,
): boolean {
  const [unread, setUnread] = useState(false)

  const load = useCallback(async () => {
    if (!entityType || !entityId) { setUnread(false); return }
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) { setUnread(false); return }
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, messages')
        .eq('mode', 'discuss')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .limit(1)
      const row = (sessions ?? [])[0] as { id: string; messages: unknown } | undefined
      if (!row) { setUnread(false); return }
      const { data: reads } = await supabase
        .from('chat_session_reads')
        .select('last_read_at')
        .eq('session_id', row.id)
        .eq('user_id', user.id)
        .limit(1)
      const stamp = (reads ?? [])[0] as { last_read_at: string } | undefined
      setUnread(isUnread(toReadable(row.messages), user.id, stamp ? new Date(stamp.last_read_at) : null))
    } catch {
      // Leave the last value; a missing table (migration not applied) means no dot.
    }
  }, [entityType, entityId])

  useEffect(() => {
    void load()
    if (!entityId) return
    const channel = supabase
      .channel(`discuss-unread:${entityType}:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions', filter: `entity_id=eq.${entityId}` },
        () => { void load() },
      )
      .subscribe()
    // The drawer's own read stamp: clear the dot without waiting on realtime.
    const offRead = onThreadRead(() => { void load() })
    return () => { supabase.removeChannel?.(channel); offRead() }
  }, [entityType, entityId, load])

  useRefreshOnVisible(() => { void load() }, { enabled: !!entityId })

  return unread
}
