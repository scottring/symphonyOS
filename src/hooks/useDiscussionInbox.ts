// src/hooks/useDiscussionInbox.ts
//
// Every Discussion the viewer can see with activity, newest first, plus how
// many are waiting on them. RLS does the sharing (own threads + household
// threads on couple/compound scope); this just reads what comes back and
// derives rows with buildInboxRows so the page and the sidebar badge agree.
//
// Live: a realtime subscription on chat_sessions (append_chat_message bumps
// the row, so every message is an UPDATE), plus a refresh on tab return.

import { useCallback, useEffect, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { onThreadRead } from '@/lib/discussions/readSignal'
import { buildInboxRows, type InboxRow, type InboxSession } from '@/lib/discussions/inbox'

export function useDiscussionInbox() {
  const [rows, setRows] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) { setRows([]); setLoading(false); return }
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, entity_type, entity_id, title, messages, updated_at, scope')
        .eq('mode', 'discuss')
        .order('updated_at', { ascending: false })
        .limit(200)
      const { data: reads } = await supabase
        .from('chat_session_reads')
        .select('session_id, last_read_at')
        .eq('user_id', user.id)
      const readMap: Record<string, string> = {}
      for (const r of (reads ?? []) as Array<{ session_id: string; last_read_at: string }>) {
        readMap[r.session_id] = r.last_read_at
      }
      setRows(buildInboxRows((sessions ?? []) as InboxSession[], readMap, user.id))
    } catch {
      // Keep the last good list on screen.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const channel = supabase
      .channel('discussions-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions' },
        () => { void reload() },
      )
      .subscribe()
    // Read stamps don't touch chat_sessions; the drawer announces them in-tab.
    const offRead = onThreadRead(() => { void reload() })
    return () => { supabase.removeChannel?.(channel); offRead() }
  }, [reload])

  useRefreshOnVisible(() => { void reload() })

  const unreadCount = rows.filter((r) => r.unread).length
  return { rows, unreadCount, loading, reload }
}
