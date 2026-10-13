// Which fetched events actually need writing to the calendar_events cache.
//
// Prod, 2026-10-13: every read of the calendar (each page load, each tab
// return, the kitchen wall every few minutes) upserted EVERY event it returned,
// and each row's updated_at is stamped "now" on fetch, so every row was
// rewritten every time — 277k updates on 1.3k rows, each one a WAL record the
// Realtime change feed then fans out. Only new events and events whose content
// changed are written now; updated_at is not content.

import type { NormalizedEvent } from './types.ts'

export type CachedEventRow = Omit<NormalizedEvent, 'provider'>

/** The fields that make an event different. `updated_at` is when we fetched it. */
const CONTENT = [
  'title', 'description', 'start_time', 'end_time', 'all_day', 'location', 'meeting_url',
  'calendar_id', 'calendar_name', 'calendar_color', 'recurring_event_id', 'attendees',
] as const

export const STORED_EVENT_COLUMNS = ['google_event_id', ...CONTENT].join(', ')

const TIMES = new Set(['start_time', 'end_time'])

/** Stable text for a value as Postgres hands it back: jsonb reorders object
 *  keys and timestamps come back in another format for the same instant. */
function canonical(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (TIMES.has(field) && typeof value === 'string') {
    const t = Date.parse(value)
    return Number.isNaN(t) ? value : String(t)
  }
  return JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
    : v))
}

/** The rows that are new, or differ in content from what is stored. */
export function eventsToCache(rows: CachedEventRow[], stored: Partial<CachedEventRow>[]): CachedEventRow[] {
  const byId = new Map(stored.map((s) => [s.google_event_id, s]))
  return rows.filter((row) => {
    const prev = byId.get(row.google_event_id)
    if (!prev) return true
    return CONTENT.some((f) => canonical(f, row[f]) !== canonical(f, prev[f]))
  })
}
