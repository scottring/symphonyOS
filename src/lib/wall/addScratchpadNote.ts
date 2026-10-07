// One write for a new scratchpad note, shared by the wall and the app's Add
// box (Scott, 2026-10-07: "post scratchpad notes from our phones/desktops/web").
// Every note is household-shared by RLS; nothing to scope here.
import { supabase } from '@/lib/supabase'
import type { ScratchpadKind } from './scratchpad'

export async function addScratchpadNote(
  userId: string,
  body: string,
  kind: ScratchpadKind,
  authorMemberId: string | null,
): Promise<boolean> {
  const text = body.trim()
  if (!text) return false
  const { error } = await supabase.from('scratchpad_notes').insert({
    user_id: userId, body: text.slice(0, 500), kind, author_member_id: authorMemberId,
  })
  if (error) { console.error('[scratchpad] add failed:', error.message); return false }
  return true
}

/** The signed-in person's own family member, so a note from their phone says who wrote it. */
export async function ownMemberId(userId: string): Promise<string | null> {
  const { data } = await supabase.from('family_members').select('id').eq('auth_user_id', userId).limit(1)
  return (data as { id: string }[] | null)?.[0]?.id ?? null
}
