import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

export interface FamilyMemberSummary {
  id: string
  name: string
  initials: string
  color: string
  roleLabel: string | null
  /** Open (incomplete) tasks assigned to this member, across all buckets. */
  openTaskCount: number
}

/**
 * Builds the FAMILY SNAPSHOT panel data: core members (guests excluded),
 * sorted by display_order, each with their open-task count.
 *
 * Future signals to layer in (deferred): per-member next event today/tomorrow,
 * meal involvement, presence detection. Requires events + presence data
 * threaded through, which the rail doesn't have yet.
 */
export function familySnapshot(members: FamilyMember[], tasks: Task[]): FamilyMemberSummary[] {
  const openCountByMember = new Map<string, number>()
  for (const t of tasks) {
    if (t.completed) continue
    if (!t.assignedTo) continue
    openCountByMember.set(t.assignedTo, (openCountByMember.get(t.assignedTo) ?? 0) + 1)
  }

  return members
    .filter((m) => m.member_type === 'core')
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => ({
      id: m.id,
      name: m.name,
      initials: m.initials,
      color: m.color,
      roleLabel: m.role_label ?? null,
      openTaskCount: openCountByMember.get(m.id) ?? 0,
    }))
}
