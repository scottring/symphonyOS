// The kids' tablets (2026-10-21): what one kid's screen shows, from the same
// day model the wall's kid page uses (kidDayModel). PURE: the clock comes in.
//
// Weekday afternoons and whole weekend days. A weekday screen starts at noon:
// the morning belongs to the kitchen wall and the school run. A weekend
// screen is the whole day.
//
// Two layouts read the same stops:
//   * trail ("one thing at a time", Kaleb): the day as a row of stops, with
//     NOW (the one thing to do), NEXT, and the rest as one line.
//   * list ("any order", Ella): everything for now as a checklist, and the
//     rest of the day below it with times.

import type { KidRow, MemberDayModel } from '@/lib/wall/kidDayModel'

export interface KidStop {
  /** `${entityType}:${id}`, unique across the day. */
  key: string
  row: KidRow
  title: string
  /** A few words for the trail strip: "Math", "Feed Jax dinner". */
  short: string
  /** 'HH:MM', or null for anytime. */
  time: string | null
  /** The collection it belongs to ("Home from school"), or null. */
  group: string | null
  /** How long a timer it wants, from a target or the title ("20 minutes"). */
  minutes: number | null
  done: boolean
  /** Its time passed long ago and it was not done: still on the trail, but
   *  never NOW (so a missed 8:00 does not block the afternoon). */
  missed: boolean
}

export interface KidPanel {
  /** Every stop in order: timed by time, then anytime. */
  stops: KidStop[]
  now: KidStop | null
  next: KidStop | null
  /** The rest of the trail after NEXT, not done. */
  later: KidStop[]
  /** The list layout: what to do now, any order (done ones stay, ticked). */
  listNow: KidStop[]
  /** The list layout: what comes later today, with times. */
  listLater: KidStop[]
  doneCount: number
  /** "Reading day" / "Math day", or null. */
  dayNote: string | null
  isWeekend: boolean
}

/** A stop counts as "now" from this long before its time. */
const SOON_MIN = 60
/** A stop not done this long after its time is missed. */
const MISSED_MIN = 180

export function isWeekendDay(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

/** "Math, 20–30 minutes" → 20; "Reading, 20 minutes" → 20; "Lights out" → null. */
export function minutesFromTitle(title: string): number | null {
  const m = /(\d{1,3})\s*(?:[–-]\s*\d{1,3}\s*)?(?:min|minutes)\b/i.exec(title)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 && n <= 180 ? n : null
}

/** The few words before the first comma, colon, dash or bracket. */
export function shortTitle(title: string): string {
  const cut = title.split(/\s*[,(—–]\s*|:\s+|\s+-\s+/)[0]?.trim() || title.trim()
  return cut.length > 24 ? `${cut.slice(0, 22).trimEnd()}…` : cut
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function buildKidPanel(model: MemberDayModel, memberId: string, now: Date): KidPanel {
  const isWeekend = isWeekendDay(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const seen = new Set<string>()
  const raw: Omit<KidStop, 'missed'>[] = []

  const add = (row: KidRow, time: string | null, group: string | null) => {
    // A step that names other people (a parent's "Wake the kids") is theirs.
    if (row.by && row.by.length && !row.by.includes(memberId)) return
    const key = `${row.entityType}:${row.id}`
    if (seen.has(key)) return
    seen.add(key)
    const minutes = row.target?.unit === 'minutes' ? row.target.amount : minutesFromTitle(row.title)
    raw.push({ key, row, title: row.title, short: shortTitle(row.title), time, group, minutes, done: row.done })
  }

  for (const c of model.collections) for (const r of c.rows) add(r, r.timeOfDay ?? c.timeOfDay, c.title)
  if (model.reading) add(model.reading, model.reading.timeOfDay, null)
  // Every band (kidDayModel's KidBandKey partition); the sort below puts them in time order.
  for (const rows of Object.values(model.bands)) for (const r of rows) add(r, r.timeOfDay, null)
  for (const h of model.homework) add({ entityType: 'task', id: h.id, title: h.title, done: false, timeOfDay: null, target: null }, null, 'Homework')

  // Weekdays start at noon.
  const inWindow = raw.filter((s) => isWeekend || s.time == null || toMin(s.time) >= 12 * 60)
  const order = (a: Omit<KidStop, 'missed'>, b: Omit<KidStop, 'missed'>) => {
    if (a.time == null && b.time == null) return 0
    if (a.time == null) return 1
    if (b.time == null) return -1
    return toMin(a.time) - toMin(b.time)
  }
  const stops: KidStop[] = [...inWindow]
    .map((s, i) => ({ s, i }))
    .sort((x, y) => order(x.s, y.s) || x.i - y.i)
    .map(({ s }) => ({ ...s, missed: !s.done && s.time != null && nowMin - toMin(s.time) > MISSED_MIN }))

  const due = (s: KidStop) => s.time == null || toMin(s.time) - nowMin <= SOON_MIN
  const open = stops.filter((s) => !s.done && !s.missed)
  // NOW: the earliest open timed stop that is due, else an anytime one, else
  // the next timed one (nothing is due yet, so it says when).
  const now_ = open.find((s) => s.time != null && due(s)) ?? open.find((s) => s.time == null) ?? open[0] ?? null
  const rest = open.filter((s) => s !== now_)
  const next = rest[0] ?? null
  const later = rest.slice(1)

  const listNow = stops.filter(due)
  const listLater = stops.filter((s) => !due(s))

  const titles = stops.map((s) => s.title)
  const dayNote = titles.some((t) => /^math\b/i.test(t)) ? 'Math day' : titles.some((t) => /^reading\b/i.test(t)) ? 'Reading day' : null

  return { stops, now: now_, next, later, listNow, listLater, doneCount: stops.filter((s) => s.done).length, dayNote, isWeekend }
}

/** "6:00" from "18:00" — am/pm is obvious on a kid's afternoon. */
export function clockLabel(hhmm: string | null): string | null {
  if (!hhmm) return null
  const h = Number(hhmm.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3, 5)}`
}
