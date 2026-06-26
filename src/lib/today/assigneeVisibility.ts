/**
 * Determines whether the assignee chip should be shown on a schedule row.
 *
 * Rules:
 * - Unassigned → hide (nothing to show)
 * - Assigned to the current user alone → hide (self-evident)
 * - Assigned to someone else, or the current user + others → show (disambiguates)
 */
export function shouldShowAssignee(
  assigned: string | string[] | null | undefined,
  currentMemberId: string | null,
): boolean {
  const ids = Array.isArray(assigned) ? assigned : assigned ? [assigned] : []
  if (ids.length === 0) return false
  if (ids.length === 1 && currentMemberId && ids[0] === currentMemberId) return false
  return true
}
