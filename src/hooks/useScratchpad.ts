// src/hooks/useScratchpad.ts
//
// The wall's scratchpad notes (see src/lib/wall/scratchpad.ts). Loads the open
// notes plus the last week's sorted ones, follows the table over realtime so a
// note jotted on a phone or by the other parent lands on the wall, and owns
// every write. Each write reports success so the wall can flash a failure.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { scopeForDomain } from '@/lib/scope'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { addScratchpadNote } from '@/lib/wall/addScratchpadNote'
import {
  dbToScratchpadNote, DONE_WINDOW_DAYS,
  type DbScratchpadNote, type ScratchpadKind, type ScratchpadNote,
} from '@/lib/wall/scratchpad'

const COLUMNS = 'id, body, kind, author_member_id, status, resolution, sent_to_member_id, created_at, resolved_at'

export function useScratchpad(userId: string | null) {
  const [notes, setNotes] = useState<ScratchpadNote[]>([])

  const load = useCallback(async () => {
    if (!userId) { setNotes([]); return }
    const since = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString()
    // RLS shares the household's notes; no user filter here.
    const { data, error } = await supabase
      .from('scratchpad_notes')
      .select(COLUMNS)
      .or(`status.eq.open,resolved_at.gte.${since}`)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) { console.error('[scratchpad] load failed:', error.message); return }
    setNotes((data as DbScratchpadNote[]).map(dbToScratchpadNote))
  }, [userId])

  useEffect(() => {
    void load()
    if (!userId) return
    const channel = supabase
      .channel(`scratchpad:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scratchpad_notes' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, load])

  useRefreshOnVisible(() => { void load() })

  const add = useCallback(async (body: string, kind: ScratchpadKind, authorMemberId: string | null) => {
    if (!userId) return false
    const ok = await addScratchpadNote(userId, body, kind, authorMemberId)
    if (ok) await load()
    return ok
  }, [userId, load])

  const update = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from('scratchpad_notes').update(patch).eq('id', id)
    if (error) { console.error('[scratchpad] update failed:', error.message); return false }
    await load()
    return true
  }, [load])

  const markDone = useCallback((id: string, resolution: string) => update(id, {
    status: 'done', resolution: resolution.trim() || null,
    resolved_at: new Date().toISOString(), resolved_by: userId,
  }), [update, userId])

  const edit = useCallback((id: string, body: string) => {
    const text = body.trim()
    return text ? update(id, { body: text.slice(0, 500) }) : Promise.resolve(false)
  }, [update])

  const reopen = useCallback((id: string) => update(id, {
    status: 'open', resolution: null, resolved_at: null, resolved_by: null,
  }), [update])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('scratchpad_notes').delete().eq('id', id)
    if (error) { console.error('[scratchpad] delete failed:', error.message); return false }
    await load()
    return true
  }, [load])

  // The note becomes a task in the Inbox, assigned to that person, shared with
  // the household like every wall capture (context family, household scope —
  // the same shape as the wall's Add a task). Then the note is marked sent.
  const sendToInbox = useCallback(async (note: { id: string; body: string }, memberId: string) => {
    if (!userId) return false
    const { data, error } = await supabase.from('tasks').insert({
      user_id: userId,
      title: note.body.trim(),
      context: 'family',
      scope: scopeForDomain('family', [], null),
      bucket: 'inbox',
      assigned_to: memberId,
      scheduled_for: null,
      completed: false,
    }).select('id').single()
    if (error || !data) { console.error('[scratchpad] send to inbox failed:', error?.message); return false }
    return update(note.id, {
      status: 'sent', sent_to_member_id: memberId, sent_task_id: (data as { id: string }).id,
      resolved_at: new Date().toISOString(), resolved_by: userId,
    })
  }, [userId, update])

  return { notes, add, markDone, sendToInbox, edit, reopen, remove, reload: load }
}
