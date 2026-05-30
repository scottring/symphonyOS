import type { AssigneeFilter } from './types'

/**
 * Assignee matcher. Matches against BOTH the legacy single `assignedTo` and the
 * multi-member `assignedToAll` array, so a task/routine assigned to several
 * people (the model the assignee UI writes) still matches when one of them is
 * selected. Previously this only checked the single field, so multi-assigned
 * items silently failed to match — e.g. "Iris" couldn't isolate a task assigned
 * to ['scott','iris'].
 */
export function makeAssigneeFilter(selectedAssignee: AssigneeFilter) {
  return (
    assignedTo: string | null | undefined,
    assignedToAll?: readonly string[] | null,
  ): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true
    const hasMulti = Array.isArray(assignedToAll) && assignedToAll.length > 0
    if (selectedAssignee === 'unassigned') return !assignedTo && !hasMulti
    if (assignedTo === selectedAssignee) return true
    return hasMulti && assignedToAll!.includes(selectedAssignee)
  }
}
