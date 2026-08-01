import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// The context graph runs on a SERVICE-ROLE client, which bypasses RLS entirely. Every query
// it makes therefore has to restate the policy it would otherwise have inherited. This module
// is that restatement for the five scope-gated tables — tasks, routines, projects, contacts,
// notes — whose SELECT policy is, verbatim from 2026-06-07_scope_axis.sql:34:
//
//   auth.uid() = user_id
//   OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id))
//
// Tables with an owner-only policy (calendar_events 001:58, goals 046:61, attachments 023:35)
// must NOT use this helper — they keep a plain .eq('user_id', …). Mirroring means mirroring
// each table's own policy, not applying the most permissive one everywhere.

/** The scope values that 2026-06-07_scope_axis.sql treats as shared. `couple` and `compound`
 *  are deliberately identical in RLS today — there is no scope_groups table yet. */
export const SHARED_SCOPES = ['couple', 'compound'] as const

/** Resolve the owner set whose shared rows `userId` is allowed to read: `userId` themselves,
 *  plus every active member of every household in which `userId` is active.
 *
 *  Mirrors `users_share_household` (027_households.sql:222-240), which requires BOTH sides to
 *  have `status = 'active'`.
 *
 *  Fails closed: any error resolving membership returns `[userId]`, degrading to owner-only
 *  rather than leaking. A wrong answer here is a privacy bug, so the safe direction is fewer
 *  rows, never more. */
export async function resolveVisibleOwners(client: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data: mine, error: mineError } = await client
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .eq('status', 'active')
    if (mineError) throw new Error(mineError.message)

    const householdIds = [...new Set(((mine ?? []) as { household_id: string }[]).map(h => h.household_id))]
    if (householdIds.length === 0) return [userId]

    const { data: peers, error: peersError } = await client
      .from('household_members')
      .select('user_id')
      .in('household_id', householdIds)
      .eq('status', 'active')
    if (peersError) throw new Error(peersError.message)

    return [...new Set([userId, ...((peers ?? []) as { user_id: string }[]).map(p => p.user_id)])]
  } catch {
    return [userId]
  }
}

/** Narrow a service-role query on a scope-gated table to the rows `userId` could have read
 *  through RLS. `owners` is the output of `resolveVisibleOwners`.
 *
 *  With no co-members this collapses to a plain owner-only `.eq`, which keeps the common
 *  single-user case on the same query plan it had before. */
export function applyScopeVisibility<T extends {
  eq(column: string, value: unknown): T
  or(filter: string): T
}>(query: T, userId: string, owners: string[]): T {
  const peers = owners.filter(id => id !== userId)
  if (peers.length === 0) return query.eq('user_id', userId)
  return query.or(
    `user_id.eq.${userId},and(scope.in.(${SHARED_SCOPES.join(',')}),user_id.in.(${peers.join(',')}))`
  )
}
