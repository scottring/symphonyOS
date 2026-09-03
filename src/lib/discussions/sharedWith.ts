// src/lib/discussions/sharedWith.ts
//
// Who else is in the room. Derived, never picked: a thread is shared exactly
// as widely as its item, so the header says so up front — "Shared with Iris"
// or "Only you" — and there is no invite step to look for.
//
// "Login-holding" members are the ones who can open Symphony at all:
// `auth_user_id` links a member to their own login (Iris); the household
// creator's own seed row has no `auth_user_id` but `is_full_user`. Kids and
// guests have neither and can't read a thread, so they aren't named.

import type { Scope } from '@/lib/scope'

export interface SharedWithMember {
  name: string
  auth_user_id?: string | null
  user_id?: string | null
  is_full_user?: boolean
}

function isSelf(m: SharedWithMember, selfAuthId: string | null): boolean {
  if (!selfAuthId) return false
  if (m.auth_user_id) return m.auth_user_id === selfAuthId
  return !!m.user_id && m.user_id === selfAuthId && !!m.is_full_user
}

export function sharedWithNames(
  members: readonly SharedWithMember[],
  selfAuthId: string | null,
  scope: Scope,
): string[] {
  if (scope === 'individual') return []
  return members
    .filter((m) => !!m.auth_user_id || m.is_full_user)
    .filter((m) => !isSelf(m, selfAuthId))
    .map((m) => m.name)
}

export function sharedWithLabel(names: readonly string[], scope: Scope): string {
  if (scope === 'individual' || names.length === 0) return 'Only you'
  if (names.length === 1) return `Shared with ${names[0]}`
  if (names.length === 2) return `Shared with ${names[0]} and ${names[1]}`
  return `Shared with ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}
