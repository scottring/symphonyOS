// Which routine a wall app's finished day checks off. Pure; index.ts does
// the reading and writing.

/** Apps that may report a finished day. Mirrors src/lib/wall/activity/wallApps.ts. */
export const WALL_APP_HOSTS = ['kaleb-puzzle-trail.vercel.app']

export interface AppRoutine {
  id: string
  user_id: string
  description: string | null
  visibility: string
  paused_until: string | null
  recurrence_pattern: { type?: string; days?: string[]; interval?: number } | null
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** The routine's link names this app and this kid: "kaleb-puzzle-trail.vercel.app/?kid=ella". */
export function linksKid(description: string | null, host: string, kid: string): boolean {
  if (!description) return false
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc}/?\\?(?:[^\\s]*&)?kid=${kid}(?![a-z])`, 'i').test(description)
}

/** On that day (YYYY-MM-DD): daily, or weekly on that weekday. Anything
 *  rarer is left alone rather than guessed at. */
export function dueOn(r: AppRoutine, date: string): boolean {
  if (r.visibility !== 'active') return false
  if (r.paused_until && r.paused_until.slice(0, 10) > date) return false
  const p = r.recurrence_pattern
  if (!p || (p.interval && p.interval > 1)) return false
  if (p.type === 'daily') return true
  if (p.type !== 'weekly') return false
  const [y, m, d] = date.split('-').map(Number)
  return p.days?.includes(DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]) ?? false
}

/** Today in the household's time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Real days from the last two weeks up to tomorrow (time zones), deduped. */
export function reachableDates(dates: unknown, today: string): string[] {
  if (!Array.isArray(dates)) return []
  const t = Date.parse(`${today}T00:00:00Z`)
  return [...new Set(dates.filter((d): d is string => typeof d === 'string' && ISO.test(d)))]
    .filter((d) => { const x = Date.parse(`${d}T00:00:00Z`); return !Number.isNaN(x) && x >= t - 14 * 86_400_000 && x <= t + 86_400_000 })
    .slice(0, 20)
}
