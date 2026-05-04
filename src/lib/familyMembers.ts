import type { FamilyMember } from '@/types/family'

/**
 * Identify a household child / dependent member.
 *
 * Today's data uses role_label === 'family' for non-parent core members
 * (the type comment also lists 'child' as a valid value, so accept both).
 * Excludes parents and non-core (guest) members.
 */
export function isChildMember(member: FamilyMember): boolean {
  if (member.member_type !== 'core') return false
  return member.role_label === 'family' || member.role_label === 'child'
}

export function getKidMembers(members: FamilyMember[]): FamilyMember[] {
  return members.filter(isChildMember)
}
