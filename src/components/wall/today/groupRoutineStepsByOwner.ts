import type { TodayItem } from './todayItem'
import type { FamilyMember } from '@/types/family'

export interface RoutineGroup {
  /** The matched family member's id, or null for the catch-all group. */
  ownerId: string | null
  /** Display label — the member's name, or "Anyone" for unowned/unknown. */
  label: string
  steps: TodayItem[]
}

const UNOWNED_LABEL = 'Anyone'

function findMember(
  ownerId: string | null,
  members: FamilyMember[],
): FamilyMember | null {
  if (!ownerId) return null
  return (
    members.find(m => m.id === ownerId) ??
    members.find(m => m.user_id === ownerId) ??
    null
  )
}

/**
 * Group routine steps by the family member they're assigned to, so the
 * Morning/Bedtime card can show each child's routine as its own labeled
 * section instead of a flat list where two kids' identically-named steps
 * read as duplicates.
 *
 * - Owned groups are ordered by the member's `display_order`.
 * - Steps with no owner, or an owner not in `members`, fall into a single
 *   trailing "Anyone" group.
 * - Steps within every group are sorted by `startTime` (nulls last).
 */
export function groupRoutineStepsByOwner(
  steps: TodayItem[],
  members: FamilyMember[],
): RoutineGroup[] {
  if (steps.length === 0) return []

  const owned = new Map<string, { member: FamilyMember; steps: TodayItem[] }>()
  const unowned: TodayItem[] = []

  for (const step of steps) {
    const member = findMember(step.ownerId, members)
    if (!member) {
      unowned.push(step)
      continue
    }
    let bucket = owned.get(member.id)
    if (!bucket) {
      bucket = { member, steps: [] }
      owned.set(member.id, bucket)
    }
    bucket.steps.push(step)
  }

  const byStartTime = (a: TodayItem, b: TodayItem) => {
    if (!a.startTime && !b.startTime) return 0
    if (!a.startTime) return 1
    if (!b.startTime) return -1
    return a.startTime.getTime() - b.startTime.getTime()
  }

  const groups: RoutineGroup[] = [...owned.values()]
    .sort((a, b) => a.member.display_order - b.member.display_order)
    .map(({ member, steps }) => ({
      ownerId: member.id,
      label: member.name,
      steps: [...steps].sort(byStartTime),
    }))

  if (unowned.length > 0) {
    groups.push({
      ownerId: null,
      label: UNOWNED_LABEL,
      steps: [...unowned].sort(byStartTime),
    })
  }

  return groups
}
