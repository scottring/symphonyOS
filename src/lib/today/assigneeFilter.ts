import type { AssigneeFilter } from './types'

/**
 * Assignee matcher. Accepts a single id OR an array of selected ids (multi-select
 * person filter). An empty/null/undefined selection matches everyone; otherwise
 * an item matches when it belongs to ANY selected person (union), so selecting
 * Iris + Ella shows items for either.
 *
 * Each id is matched against BOTH the legacy single `assignedTo` and the
 * multi-member `assignedToAll` array, so a task assigned to several people (the
 * model the assignee UI writes) still matches when one of them is selected —
 * e.g. "Iris" isolates a task assigned to ['scott','iris']. The pseudo-id
 * `'unassigned'` matches only items with no assignee at all.
 */
export function makeAssigneeFilter(selected: AssigneeFilter) {
  const ids: string[] =
    selected == null ? [] : Array.isArray(selected) ? selected.filter(Boolean) : [selected]

  return (
    assignedTo: string | null | undefined,
    assignedToAll?: readonly string[] | null,
  ): boolean => {
    if (ids.length === 0) return true // "everyone"
    const hasMulti = Array.isArray(assignedToAll) && assignedToAll.length > 0
    return ids.some((id) => {
      if (id === 'unassigned') return !assignedTo && !hasMulti
      if (assignedTo === id) return true
      return hasMulti && assignedToAll!.includes(id)
    })
  }
}
