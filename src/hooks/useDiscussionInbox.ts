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
import { shareInFlight } from '@/lib/sharedRequest'
import { afterPageData } from '@/lib/loadPriority'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { onThreadRead } from '@/lib/discussions/readSignal'
import { buildInboxRows, type InboxRow, type InboxSession } from '@/lib/discussions/inbox'
import type { WaitingMember } from '@/lib/discussions/waiting'

// Monotonic suffix so every hook instance gets its own realtime channel topic
// (as useSupabaseTasks does). One shared 'discussions-inbox' topic made the
// second instance's subscribe fail, and unmounting any instance removed the
// channel the others were listening on.
let discussionsChannelSeq = 0

type InboxLoad = { sessions: InboxSession[]; reads: Array<{ session_id: string; last_read_at: string }>; people: WaitingMember[] }

// The three reads, together and shared (2026-10-18). Each instance — the top
// bar's badge, Today, Home, an item's discussion label — used to make its own
// three trips, one after another, so a cold load asked for chat_sessions four
// times. Only a load already in flight is shared (lib/sharedRequest).
function loadInbox(userId: string): Promise<InboxLoad> {
  return shareInFlight(`discussion-inbox:${userId}`, async () => {
    const [{ data: sessions }, { data: reads }, { data: people }] = await Promise.all([
      supabase
        .from('chat_sessions')
        .select('id, entity_type, entity_id, title, messages, updated_at, scope, user_id, with_user_ids, settled_at, settled_by, outcome')
        .eq('mode', 'discuss')
        .order('updated_at', { ascending: false })
        .limit(200),
      supabase
        .from('chat_session_reads')
        .select('session_id, last_read_at')
        .eq('user_id', userId),
      // Names for "You and Iris" / "Waiting on Iris": the household's people.
      supabase
        .from('family_members')
        .select('id, name, user_id, auth_user_id, is_full_user'),
    ])
    return {
      sessions: (sessions ?? []) as InboxSession[],
      reads: (reads ?? []) as InboxLoad['reads'],
      people: (people ?? []) as WaitingMember[],
    }
  })
}

/**
 * `defer`: a caller nobody reads on first paint (the top bar's badge) waits
 * for the page's own data before asking (lib/loadPriority).
 */
export function useDiscussionInbox({ defer = false }: { defer?: boolean } = {}) {
  const [rows, setRows] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) { setRows([]); setLoading(false); return }
      const { sessions, reads, people } = await loadInbox(user.id)
      const readMap: Record<string, string> = {}
      for (const r of reads) readMap[r.session_id] = r.last_read_at
      setRows(buildInboxRows(sessions, readMap, user.id, people))
    } catch {
      // Keep the last good list on screen.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let live = true
    if (defer) void afterPageData().then(() => { if (live) void reload() })
    else void reload()
    const channel = supabase
      .channel(`discussions-inbox-${++discussionsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_sessions' },
        () => { void reload() },
      )
      .subscribe()
    // Read stamps don't touch chat_sessions; the drawer announces them in-tab.
    const offRead = onThreadRead(() => { void reload() })
    return () => { live = false; supabase.removeChannel?.(channel); offRead() }
  }, [reload, defer])

  useRefreshOnVisible(() => { void reload() })

  const unreadCount = rows.filter((r) => r.unread).length
  /** Discussions whose turn is yours: the top-bar count. */
  const waitingCount = rows.filter((r) => r.state.kind === 'waiting-on-you').length
  return { rows, unreadCount, waitingCount, loading, reload }
}
