import type { TaskContext } from '@/types/task'

/**
 * Scope = WHO can see an item (the sharing ladder: atom → molecule → compound).
 * - individual: private to the owner
 * - couple:     shared with the partner (the "us" layer)
 * - compound:   shared with the whole household (the kitchen-wall layer)
 *
 * It is DERIVED, never chosen: scopeForDomain below is the only thing in the
 * app that may produce a scope value, and every write path calls it. There is
 * no user-facing scope picker — a control beside the domain and the assignees
 * could only ever disagree with them, and that disagreement IS the leak (a row
 * whose life area said private while its scope still said compound).
 */
export type Scope = 'individual' | 'couple' | 'compound'

/**
 * THE scope a row must carry, computed from what it is and who does it.
 * Nothing else may produce a scope value. No history, no "leave it alone":
 * the row's scope is always exactly what its current domain + assignees say.
 *
 * - family → compound (the household layer; every member subscribes)
 * - anything else handed to another member → couple (the minimum RLS share,
 *   and it keeps the item off the kitchen wall, which needs compound)
 * - otherwise → individual
 */
export function scopeForDomain(
  context: TaskContext | null | undefined,
  assignees: readonly (string | null | undefined)[] | null | undefined,
  selfMemberId: string | null | undefined,
): Scope {
  if (context === 'family') return 'compound'
  const others = (assignees ?? []).filter((id): id is string => !!id && id !== selfMemberId)
  return others.length > 0 ? 'couple' : 'individual'
}

/** The shape of a `family_members` row this module needs to identify a person. */
export interface MemberIdentity {
  id: string
  user_id?: string | null
  auth_user_id?: string | null
}

/**
 * The member row belonging to an AUTH USER — the `selfMemberId` argument above.
 *
 * `self` is whoever OWNS the row being written, not whoever is editing it.
 * scopeForDomain's self-exclusion answers "is this assignee someone OTHER than
 * the person whose item this is": pass the editor instead and a partner who
 * re-tags a task that was handed to HER computes others=[] → 'individual' and
 * silently deletes her own access. Every caller therefore resolves the owner
 * through this function first.
 *
 * Matching mirrors useFamilyMembers.getCurrentUserMember, minus its
 * `is_full_user` guess: `auth_user_id` identifies a member who has their own
 * login (Iris), while `user_id` is the household CREATOR's auth id and is
 * stamped on every row in the house — so a `user_id` match only identifies a
 * person on the creator's own seed row, the one with no `auth_user_id`.
 * Anything looser can name the wrong adult, which is the same silent narrowing
 * in a different costume.
 */
export function memberForAuthUser<T extends MemberIdentity>(
  members: readonly T[] | null | undefined,
  authUserId: string | null | undefined,
): T | undefined {
  if (!authUserId) return undefined
  const rows = members ?? []
  return rows.find((m) => m.auth_user_id === authUserId)
    ?? rows.find((m) => m.user_id === authUserId && !m.auth_user_id)
}
