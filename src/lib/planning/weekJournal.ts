// src/lib/planning/weekJournal.ts
//
// Week as an open journal (Scott, 2026-11-11, board W): the week's one
// sentence, said back from rules as Today's is, and the likely duplicates on
// its list. Pure.

export interface SentenceEvent { title: string; time?: Date }
export interface SentenceDay { key: string; date: Date; events: readonly SentenceEvent[] }
export interface SentenceSpan { title: string; from?: string; to?: string }

const clock = (d: Date) => {
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() < 12 ? 'am' : 'pm'}`
}
const weekdayOf = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })

/**
 * "Lunch with mom today at 11:30am. Ron staying with us through Sunday.
 * 8 still to do." — what comes next on the calendar, a stay that is on, and
 * what is left on the list. Only the current week speaks; empty says nothing.
 */
export function weekSentence(opts: {
  days: readonly SentenceDay[]
  spans: readonly SentenceSpan[]
  now: Date
  todayKey: string
  open: number
}): string {
  const { days, spans, now, todayKey, open } = opts
  const parts: string[] = []
  const today = days.find((d) => d.key === todayKey)
  const nextToday = today?.events.find((e) => e.time && e.time.getTime() > now.getTime())
  if (nextToday?.time) parts.push(`${nextToday.title} today at ${clock(nextToday.time)}`)
  else {
    const later = days.find((d) => d.key > todayKey && d.events.some((e) => e.time))
    const ev = later?.events.find((e) => e.time)
    if (later && ev) parts.push(`${ev.title} on ${later.date.toLocaleDateString('en-US', { weekday: 'long' })}`)
  }
  const stay = spans.find((s) => s.to && s.to >= todayKey && (!s.from || s.from <= todayKey))
  if (stay?.to) parts.push(`${stay.title} through ${weekdayOf(stay.to)}`)
  if (open > 0) parts.push(`${open} still to do`)
  return parts.map((p) => `${p[0].toUpperCase()}${p.slice(1)}.`).join(' ')
}

const STOP = new Set(['a', 'an', 'the', 'for', 'to', 'of', 'and', 'on', 'in', 'at', 'with', 'my', 'our'])
function words(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)))
}

/** Two titles that likely name the same thing: most of their words shared. */
export function likelySame(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)
  if (x.size < 2 || y.size < 2) return false
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared >= 3 && shared / Math.min(x.size, y.size) >= 0.75
}

/** For each later item that looks like an earlier one, the earlier one's title. */
export function likelyDuplicates<T extends { id: string; title: string }>(items: readonly T[]): Map<string, string> {
  const out = new Map<string, string>()
  items.forEach((b, j) => {
    const a = items.slice(0, j).find((x) => !out.has(x.id) && likelySame(x.title, b.title))
    if (a) out.set(b.id, a.title)
  })
  return out
}
