// Events read off a captured picture (analyze-capture → ⌘K's event card).
import type { CaptureEvent } from '@/hooks/usePhotoCapture'

const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** An all-day event's date, read as a local day rather than UTC midnight. */
export function eventDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Start and end as Dates; no end means an hour, or the one day. */
export function eventSpan(e: CaptureEvent): { start: Date; end: Date } {
  if (e.allDay) {
    const start = eventDay(e.start)
    const end = e.end ? eventDay(e.end) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    return { start, end }
  }
  const start = new Date(e.start)
  return { start, end: e.end ? new Date(e.end) : new Date(start.getTime() + 60 * 60_000) }
}

/** "Fri, Dec 4 · 5:10 – 6:45 PM" in the viewer's own time zone. */
export function formatEventWhen(e: CaptureEvent): string {
  if (e.allDay) {
    const start = eventDay(e.start)
    return e.end && e.end !== e.start ? `${day(start)} – ${day(eventDay(e.end))}` : day(start)
  }
  const start = new Date(e.start)
  if (!e.end) return `${day(start)} · ${time(start)}`
  const end = new Date(e.end)
  if (end.toDateString() !== start.toDateString()) return `${day(start)} · ${time(start)} – ${day(end)} ${time(end)}`
  return `${day(start)} · ${time(start)} – ${time(end)}`
}

/** Household members named on the picture ("Iris Leviner" → Iris), by first name. */
export function matchMembers(who: string[], members: Array<{ id: string; name: string }>): string[] {
  const first = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const named = new Set(who.map(first).filter(Boolean))
  return members.filter((m) => named.has(first(m.name))).map((m) => m.id)
}
