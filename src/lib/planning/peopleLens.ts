import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import type { AssigneeFilter } from '@/lib/today/types'

/**
 * The people filter on a planning page (Week, Month, Season, Year) — the top
 * bar's one persisted lens (useAssigneeFilter, HeaderPeopleFilter), so choosing
 * Ella on one horizon is choosing Ella on all of them.
 *
 * With nobody chosen a plan list keeps its own scope: unassigned and mine, plus
 * a shared goal's steps (`doableBy` / `staysOnSharedPlan`). Choosing people
 * REPLACES that scope rather than narrowing inside it — otherwise choosing Iris
 * on Scott's page could only ever show rows the two of them share. `scopeId`
 * is what to pass the list selectors as `meId`; `keep` is the row test, the
 * same union match Today uses (any chosen person; 'unassigned' = nobody).
 */
export function planPeopleLens(selected: AssigneeFilter, meId: string | null) {
  const ids = selected == null ? [] : Array.isArray(selected) ? selected : [selected]
  const on = ids.length > 0
  const match = makeAssigneeFilter(selected)
  return {
    on,
    scopeId: on ? null : meId,
    keep: (t: { assignedTo?: string | null; assignedToAll?: readonly string[] | null }) => match(t.assignedTo, t.assignedToAll),
  }
}
