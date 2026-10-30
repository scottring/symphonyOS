/** Scheduled things on a captured picture, as calendar events to approve.
 *
 *  Scott, 2026-10-30: a screenshot of a Southwest itinerary became one Inbox
 *  task. The vision call now also returns `events` — each flight leg,
 *  appointment or reservation — and the ⌘K box shows them as a card to add
 *  to the calendar. Times are read as printed, each with the zone of the
 *  place it happens (a flight departs in one zone and lands in another), and
 *  sent to the client as UTC instants. Pure, so it is tested without Deno. */
import { withScheme } from './captureReach.ts'
import { zonedToUtc } from './captureReminders.ts'

export interface CaptureEvent {
  title: string
  /** UTC instant, or YYYY-MM-DD for an all-day event. */
  start: string
  /** UTC instant, YYYY-MM-DD, or null when the picture gives no end. */
  end: string | null
  allDay: boolean
  location: string | null
  /** People it is for, as printed ("Iris Leviner"). */
  who: string[]
  /** Short printed details: confirmation number, flight number, seat. */
  details: string | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
const MAX_EVENTS = 8

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

function validZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone } catch { return undefined }
}

/** `fallbackZone` is the person's own zone, used where the picture names no place. */
export function parseCaptureEvents(raw: unknown, fallbackZone: string): CaptureEvent[] {
  if (!Array.isArray(raw)) return []
  const out: CaptureEvent[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const title = str(o.title)
    const start = str(o.start)
    if (!title || !start) continue
    const allDay = DAY.test(start)
    if (!allDay && !DAY_TIME.test(start)) continue
    const end = str(o.end)
    const endOk = end && (allDay ? DAY.test(end) : DAY_TIME.test(end)) ? end : undefined
    const startZone = validZone(str(o.start_zone)) ?? fallbackZone
    const endZone = validZone(str(o.end_zone)) ?? startZone
    const startAt = allDay ? start : zonedToUtc(start, startZone)
    let endAt = endOk ? (allDay ? endOk : zonedToUtc(endOk, endZone)) : null
    // An end before its start is a misread, not an overnight event; drop it
    // and let the calendar's default length stand.
    if (endAt && endAt <= startAt) endAt = null
    const who = Array.isArray(o.who) ? o.who.map(str).filter((n): n is string => !!n).slice(0, 6) : []
    const url = withScheme(str(o.url))
    const details = [str(o.details), typeof url === 'string' && /^https?:\/\//.test(url) ? url : undefined]
      .filter(Boolean).join('\n')
    out.push({
      title: title.slice(0, 200),
      start: startAt,
      end: endAt,
      allDay,
      location: str(o.location)?.slice(0, 300) ?? null,
      who,
      details: details ? details.slice(0, 1000) : null,
    })
  }
  return out.slice(0, MAX_EVENTS)
}
