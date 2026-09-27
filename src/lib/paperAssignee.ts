// src/lib/paperAssignee.ts
//
// Who a line read off a page is assigned to, decided once on the review sheet
// so the save writes exactly what was shown. The signed-in person is found by
// auth identity only — never by name, and never by "the first full user",
// which on a shared household is someone else half the time.

import type { FamilyMember } from '@/types/family'
import type { PlanItem } from '@/lib/planParse'

type Identity = Pick<FamilyMember, 'id' | 'auth_user_id' | 'user_id' | 'is_full_user'>

/**
 * The member row that IS the signed-in user: the row joined to their auth
 * account, else the self row they created (a full user with no auth link of
 * its own — children's rows share the creator's `user_id` but are not full
 * users). Undefined when neither exists; callers must not guess.
 */
export function signedInMember<T extends Identity>(
  members: readonly T[],
  authUserId: string | null | undefined,
): T | undefined {
  if (!authUserId) return undefined
  return members.find((m) => m.auth_user_id === authUserId)
    ?? members.find((m) => m.user_id === authUserId && !m.auth_user_id && m.is_full_user)
}

/**
 * A parsed line's starting assignee on the sheet: whoever the page named (if
 * that member is in the household), else the signed-in member — the same for
 * tasks and routines. With no signed-in member known it starts Unassigned
 * (null) rather than on a guess.
 */
export function initialAssignee(
  item: Pick<PlanItem, 'assigneeId'>,
  memberIds: ReadonlySet<string>,
  currentMemberId: string | null,
): string | null {
  if (item.assigneeId && memberIds.has(item.assigneeId)) return item.assigneeId
  return currentMemberId
}

export interface AssigneeOption { value: string; label: string }

/** Sentinel for the select; the row itself stores null. */
export const UNASSIGNED = '__unassigned__'

/**
 * The picker's options: the signed-in member once, first, as "Name (you)";
 * everyone else in the household; and a real Unassigned. Matching is by id —
 * a second member who happens to share a name still gets their own entry.
 */
export function assigneeOptions(
  members: readonly Pick<FamilyMember, 'id' | 'name'>[],
  currentMemberId: string | null,
): AssigneeOption[] {
  const me = currentMemberId ? members.find((m) => m.id === currentMemberId) : undefined
  return [
    ...(me ? [{ value: me.id, label: `${me.name} (you)` }] : []),
    ...members.filter((m) => m.id !== me?.id).map((m) => ({ value: m.id, label: m.name })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ]
}
