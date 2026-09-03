// ── Scheduling normalization ───────────────────────────────────────
// The Today view buckets by the app's timezone (America/New_York). An
// all-day task must be stored at LOCAL midnight expressed in UTC (e.g.
// 2026-06-06 -> 2026-06-06T04:00:00Z in EDT) or it shifts to the wrong day.
//
// Its own module (rather than living in index.ts) so it can be tested without
// importing the whole Deno edge function. The app has a parallel helper for
// the same hazard in src/lib/scheduledFor.ts — that one serves the MCP server.
const APP_TZ = 'America/New_York'

export function etOffsetMinutes(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const name = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, timeZoneName: 'shortOffset' })
    .formatToParts(utcNoon).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const mt = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  if (!mt) return -300
  const sign = mt[1] === '-' ? -1 : 1
  return sign * (parseInt(mt[2]) * 60 + (mt[3] ? parseInt(mt[3]) : 0))
}

/** Resolve scheduled_for + is_all_day + bucket from raw tool input. */
export function normalizeSchedule(
  scheduledFor: unknown,
  isAllDay: unknown,
): { scheduled_for: string | null; is_all_day: boolean; bucket: string } {
  if (!scheduledFor || typeof scheduledFor !== 'string') {
    return { scheduled_for: null, is_all_day: isAllDay === true, bucket: 'inbox' }
  }
  const hasTime = /T\d{2}:\d{2}/.test(scheduledFor)
  // A value with no time IS all-day — the caller does not get a say, because
  // there is no time for it to be not-all-day about. Trusting `is_all_day:
  // false` on a date-only string used to skip BOTH conversion branches below
  // (one needs allDay, the other needs a time), so the raw "2026-09-03" went
  // to Postgres and was read as UTC midnight = Sept 2, 8pm EDT. A task
  // scheduled for today landed on yesterday's page, and once yesterday
  // expired it was reachable from no screen at all.
  const allDay = hasTime ? isAllDay === true : true
  let sf = scheduledFor
  if (!hasTime) {
    const dateStr = scheduledFor.slice(0, 10)
    const offMin = etOffsetMinutes(dateStr)
    const utcMs = Date.parse(`${dateStr}T00:00:00Z`) - offMin * 60000
    sf = new Date(utcMs).toISOString()
  } else if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(scheduledFor)) {
    // A timed value WITHOUT an explicit offset ("2026-07-10T15:00:00") means
    // local wall-clock time to the model ("3pm"). Stored raw, Postgres reads
    // it as UTC and it lands hours off (the camp-show-at-11am bug) — convert
    // from APP_TZ to UTC instead.
    const dateStr = scheduledFor.slice(0, 10)
    const offMin = etOffsetMinutes(dateStr)
    const utcMs = Date.parse(`${scheduledFor}Z`) - offMin * 60000
    if (!Number.isNaN(utcMs)) sf = new Date(utcMs).toISOString()
  }
  return { scheduled_for: sf, is_all_day: allDay, bucket: 'timed' }
}
