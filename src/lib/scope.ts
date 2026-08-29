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
