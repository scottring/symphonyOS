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
//
// The door panel (2026-10-22): while one of the kid's routines is on (School
// morning, Kids Bedtime routine), the screen is that routine's checklist
// instead, in either layout, mornings included. Scott: "if they start it up
// at 7:30pm on Tuesday, it has their Tuesday night shower routine".

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

/** The routine that is on right now, as one checklist in its own step order. */
export interface KidRoutineNow {
  id: string
  title: string
  /** 'HH:MM' it starts. */
  time: string
  /** The routine's steps, with `also` slotted in by time. */
  steps: KidStop[]
  /** The kid's own loose routines timed while this one is on (Feed Jax at
   *  7:00 during School morning). Without them the checklist would hide them
   *  until the routine is over. Each sits after the last step at or before
   *  its time (an untimed step counts as the routine's start). */
  also: KidStop[]
  doneCount: number
  /** The kid's next routine today, for the line at the bottom. */
  next: { title: string; time: string } | null
}

export interface KidPanel {
  /** The routine that is on now; the screen shows it instead of the trail or list. */
  routine: KidRoutineNow | null
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
/** A routine is on from this long before it starts… */
const ROUTINE_LEAD_MIN = 30
/** …until this long after its last step's time (or its start, when no step has one). */
const ROUTINE_TAIL_MIN = 90

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

/** The words before the first comma, colon, dash or bracket: "Bag packed". */
export function headTitle(title: string): string {
  return title.split(/\s*[,(—–]\s*|:\s+|\s+-\s+/)[0]?.trim() || title.trim()
}

/** The head, cut to fit the trail strip. */
export function shortTitle(title: string): string {
  const cut = headTitle(title)
  return cut.length > 24 ? `${cut.slice(0, 22).trimEnd()}…` : cut
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function buildKidPanel(model: MemberDayModel, memberId: string, now: Date): KidPanel {
  const isWeekend = isWeekendDay(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const seen = new Set<string>()
  const raw: Omit<KidStop, 'missed'>[] = []

  const add = (row: KidRow, time: string | null, group: string | null) => {
    if (!isMine(row, memberId)) return
    const key = `${row.entityType}:${row.id}`
    if (seen.has(key)) return
    seen.add(key)
    raw.push(stopFor(row, time, group))
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

  return { routine: routineNow(model, memberId, now), stops, now: now_, next, later, listNow, listLater, doneCount: stops.filter((s) => s.done).length, dayNote, isWeekend }
}

/** A step that names other people (a parent's "Wake the kids") is theirs. */
function isMine(row: KidRow, memberId: string): boolean {
  return !row.by || row.by.length === 0 || row.by.includes(memberId)
}

function stopFor(row: KidRow, time: string | null, group: string | null): Omit<KidStop, 'missed'> {
  const minutes = row.target?.unit === 'minutes' ? row.target.amount : minutesFromTitle(row.title)
  return { key: `${row.entityType}:${row.id}`, row, title: row.title, short: shortTitle(row.title), time, group, minutes, done: row.done }
}

/**
 * The routine on now. Each timed routine (a collection with steps for this
 * kid) is on from ROUTINE_LEAD_MIN before it starts until ROUTINE_TAIL_MIN
 * after its last step's time. When two overlap, the one that has started
 * most recently wins; before either has started, the sooner one does. A
 * finished routine stays up (all checked) until its time is over.
 */
export function routineNow(model: MemberDayModel, memberId: string, now: Date): KidRoutineNow | null {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const routines = model.collections
    .filter((c) => c.timeOfDay != null)
    .map((c) => {
      const time = c.timeOfDay!.slice(0, 5)
      const steps = c.rows.filter((r) => isMine(r, memberId)).map((r) => ({ ...stopFor(r, r.timeOfDay ?? time, c.title), missed: false }))
      const start = toMin(time)
      const last = Math.max(start, ...steps.map((s) => (s.time ? toMin(s.time) : start)))
      return { id: c.id, title: c.title, time, steps, start, from: start - ROUTINE_LEAD_MIN, until: last + ROUTINE_TAIL_MIN }
    })
    .filter((c) => c.steps.length > 0)
    .sort((a, b) => a.start - b.start)

  const on = routines.filter((c) => c.from <= nowMin && nowMin < c.until)
  const started = on.filter((c) => c.start <= nowMin)
  const pick = started[started.length - 1] ?? on[0]
  if (!pick) return null
  const next = routines.find((c) => c.start > nowMin && c !== pick && c.start > pick.start)
  // Loose routines (bands and the reading card), not other collections' steps.
  const inSteps = new Set(pick.steps.map((s) => s.key))
  const also = [...(model.reading ? [model.reading] : []), ...Object.values(model.bands).flat()]
    .filter((r) => r.timeOfDay != null && isMine(r, memberId))
    .map((r) => ({ ...stopFor(r, r.timeOfDay!.slice(0, 5), null), missed: false }))
    .filter((s) => !inSteps.has(s.key) && toMin(s.time!) >= pick.from && toMin(s.time!) < pick.until)
    .sort((a, b) => toMin(a.time!) - toMin(b.time!))
  return {
    id: pick.id,
    title: pick.title,
    time: pick.time,
    steps: slotIn(pick.steps, also, pick.start),
    also,
    doneCount: [...pick.steps, ...also].filter((s) => s.done).length,
    next: next ? { title: next.title, time: next.time } : null,
  }
}

/** `extra` (in time order) into `steps`, each after the last step at or before its time. */
function slotIn(steps: KidStop[], extra: KidStop[], start: number): KidStop[] {
  const out = [...steps]
  for (const e of extra) {
    const t = toMin(e.time!)
    let at = 0
    for (let i = 0; i < out.length; i++) if ((out[i].time ? toMin(out[i].time!) : start) <= t) at = i + 1
    out.splice(at, 0, e)
  }
  return out
}

/** "6:00" from "18:00" — am/pm is obvious on a kid's afternoon. */
export function clockLabel(hhmm: string | null): string | null {
  if (!hhmm) return null
  const h = Number(hhmm.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3, 5)}`
}
