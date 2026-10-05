/** Timed instructions on a captured photo, as tasks at that time.
 *
 *  Scott, 2026-10-04: a jury summons said "call after 5 PM the night before to
 *  confirm service". The capture read the number, but the instruction sat in
 *  the note. The vision call now also returns `reminders` — things the photo
 *  says to do at a moment other than the main appointment — and each becomes
 *  its own timed task (bucket 'timed', a real is_all_day, per the Today
 *  invariant) carrying the number and site to tap. Pure, so it is tested
 *  without Deno. */
import { withScheme } from './captureReach.ts'

export interface CaptureReminder {
  title: string
  /** Local wall time: YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS]. */
  when: string
  allDay: boolean
  phone?: string
  url?: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
const MAX_REMINDERS = 3

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function parseReminders(raw: unknown): CaptureReminder[] {
  if (!Array.isArray(raw)) return []
  const out: CaptureReminder[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const title = str(o.title)
    const when = str(o.when)
    if (!title || !when || !(DAY.test(when) || DAY_TIME.test(when))) continue
    const url = withScheme(str(o.url))
    out.push({
      title: title.slice(0, 200),
      when,
      allDay: DAY.test(when),
      ...(str(o.phone) ? { phone: str(o.phone) } : {}),
      ...(typeof url === 'string' && /^https?:\/\//.test(url) ? { url } : {}),
    })
  }
  return out.slice(0, MAX_REMINDERS)
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return (Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - utcMs) / 60_000
}

/** "2026-10-04T17:00" in America/New_York → "2026-10-04T21:00:00.000Z". */
export function zonedToUtc(local: string, timeZone: string): string {
  const [d, t = '00:00:00'] = local.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi, s = 0] = t.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, da, h, mi, s)
  // Twice, so a guess that lands across a daylight-saving change corrects.
  let utc = wall - offsetMinutes(wall, timeZone) * 60_000
  utc = wall - offsetMinutes(utc, timeZone) * 60_000
  return new Date(utc).toISOString()
}

function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export interface ReminderContext {
  userId: string
  timeZone: string
  /** Copied from the capture, so a family photo's reminders are seen alike. */
  context: unknown
  scope: unknown
  captureTitle: string
  now: Date
}

export function reminderRows(reminders: CaptureReminder[], c: ReminderContext): Record<string, unknown>[] {
  const today = localDay(c.now, c.timeZone)
  return reminders
    .filter((r) => (r.allDay ? r.when >= today : Date.parse(zonedToUtc(r.when, c.timeZone)) > c.now.getTime()))
    .map((r) => ({
      user_id: c.userId,
      title: r.title,
      bucket: 'timed',
      scheduled_for: zonedToUtc(r.when, c.timeZone),
      is_all_day: r.allDay,
      ...(r.phone ? { phone_number: r.phone } : {}),
      ...(r.url ? { links: [{ url: r.url }] } : {}),
      notes: `From your photo: ${c.captureTitle}`,
      context: c.context,
      scope: c.scope,
    }))
}
