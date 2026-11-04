// Let go ("not ever", Scott 2026-11-04) is stored as `tasks.dismissed_at`
// (src/lib/planning/letGo.ts). The app's planPlacement clears it when an item
// is placed again; this is the same rule for writers that update the row
// directly — the in-app agent's symphony_update_task and the MCP server.
// No imports, so both Deno and Node can use it.

const PERIOD_BUCKETS = new Set(['week', 'month', 'quarter', 'season'])

/** Does this (snake_case) row write put the task somewhere: a day, a pick for
 *  a day, a period stamp or a period list? Someday and the Inbox don't. */
export function placesRow(updates: Record<string, unknown>): boolean {
  return !!updates.scheduled_for || !!updates.planned_on
    || !!updates.week_start || !!updates.month_start || !!updates.season_start || !!updates.weekend_start
    || (typeof updates.bucket === 'string' && PERIOD_BUCKETS.has(updates.bucket))
}

/** The row as it stands, for the rule below. */
export interface LetGoState { dismissed_at: string | null; category: string | null }

/** `{ dismissed_at: null }` when this write brings a let-go item back, else
 *  nothing. A write that states dismissed_at itself, and a school paper's
 *  "Not ours", are left alone. */
export function reviveIfPlaced(updates: Record<string, unknown>, row: LetGoState | null): { dismissed_at: null } | Record<string, never> {
  if ('dismissed_at' in updates || !row?.dismissed_at || row.category === 'paper') return {}
  return placesRow(updates) ? { dismissed_at: null } : {}
}
