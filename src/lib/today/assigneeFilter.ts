import type { AssigneeFilter } from './types'

/** Ports TodaySchedule.matchesAssigneeFilter verbatim as a pure factory. */
export function makeAssigneeFilter(selectedAssignee: AssigneeFilter) {
  return (assignedTo: string | null | undefined): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true
    if (selectedAssignee === 'unassigned') return !assignedTo
    return assignedTo === selectedAssignee
  }
}
