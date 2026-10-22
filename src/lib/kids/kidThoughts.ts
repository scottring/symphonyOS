// Thoughts a kid saves for later (migration 20261021180000, kid_thoughts):
// caught on the kid's tablet so the thought stops pulling at them, gone over
// with a grown-up at bedtime. The tablet adds and reads its own kid's; only
// a grown-up marks one gone over.

import { supabase as defaultSupabase } from '@/lib/supabase'

export type ThoughtKind = 'ask' | 'later' | 'need' | 'feeling'

export const THOUGHT_KINDS: { id: ThoughtKind; label: string }[] = [
  { id: 'ask', label: 'Ask a grown-up' },
  { id: 'later', label: 'Do later' },
  { id: 'need', label: 'Something I need' },
  { id: 'feeling', label: 'A feeling' },
]

export const kindLabel = (k: ThoughtKind | null) => THOUGHT_KINDS.find((x) => x.id === k)?.label ?? null

export interface KidThought {
  id: string
  familyMemberId: string
  text: string
  kind: ThoughtKind | null
  createdAt: Date
  reviewedAt: Date | null
}

interface Row { id: string; family_member_id: string; text: string; kind: string | null; created_at: string; reviewed_at: string | null }

const toThought = (r: Row): KidThought => ({
  id: r.id,
  familyMemberId: r.family_member_id,
  text: r.text,
  kind: (['ask', 'later', 'need', 'feeling'] as const).find((k) => k === r.kind) ?? null,
  createdAt: new Date(r.created_at),
  reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : null,
})

/** Thoughts not yet gone over, oldest first. For one kid, or all kids. */
export async function listOpenThoughts(memberId: string | null, supabase = defaultSupabase): Promise<KidThought[]> {
  let q = supabase.from('kid_thoughts').select('id, family_member_id, text, kind, created_at, reviewed_at').is('reviewed_at', null)
  if (memberId) q = q.eq('family_member_id', memberId)
  const { data, error } = await q.order('created_at', { ascending: true })
  if (error) throw new Error('Could not load saved thoughts.')
  return ((data ?? []) as Row[]).map(toThought)
}

export async function saveThought(
  input: { householdId: string; memberId: string; text: string; kind: ThoughtKind | null },
  supabase = defaultSupabase,
): Promise<KidThought | null> {
  const text = input.text.trim().slice(0, 500)
  if (!text) return null
  const { data, error } = await supabase
    .from('kid_thoughts')
    .insert({ household_id: input.householdId, family_member_id: input.memberId, text, kind: input.kind })
    .select('id, family_member_id, text, kind, created_at, reviewed_at')
    .single()
  if (error || !data) return null
  return toThought(data as Row)
}

/** A grown-up: this one has been talked over. */
export async function markThoughtReviewed(id: string, supabase = defaultSupabase): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('kid_thoughts').update({ reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null }).eq('id', id)
  return !error
}
