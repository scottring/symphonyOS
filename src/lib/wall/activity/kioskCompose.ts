// What the kiosk's idle Home stage is built from, by part of the day
// (conversational canvas, slice 7). Pure projections over rows the wall
// already holds — wallTodayRows (privacy-filtered: one adult's own tasks
// never reach it) and the kids' day models — so nothing here adds a query or
// a private datum.
//
// The compositions are deliberately few and stable: the same daypart always
// draws the same layout, so the wall doesn't rearrange itself while someone
// is reading it.
//
//   morning    out the door: each kid's bring/do, today's appointments, the
//              morning routine's steps
//   afternoon  who needs to be where: people lanes over the afternoon and
//              evening, after school, before dinner
//   evening    dinner as hero (dinner moment) or bedtime as hero (after
//              7:30), tonight's household tasks
//   quiet      the middle of a school day and late night: scenery first,
//              two or three small cards
//
// PURE: `now` is always passed in.

import type { WallMoment } from '../wallMoment'
import type { WallTodayRow } from '../wallMomentsModel'

export type KioskDaypart = 'morning' | 'afternoon' | 'evening' | 'quiet'

export interface KioskComposition {
  part: KioskDaypart
  /** The evening's hero: dinner while it's dinner time, bedtime after. */
  hero: 'out-the-door' | 'lanes' | 'dinner' | 'bedtime' | 'scenery'
  /** "Morning" for "Home · Morning"; null in the quiet hours ("Home"). */
  label: string | null
}

/** Bedtime routines run 7:30–9:30pm; after that the wall goes quiet. */
const BEDTIME_END_MIN = 21 * 60 + 30
/** Before 2pm the afternoon is still the quiet middle of the day. */
const AFTERNOON_START_MIN = 14 * 60

export function kioskComposition(moment: WallMoment, now: Date): KioskComposition {
  const t = now.getHours() * 60 + now.getMinutes()
  switch (moment) {
    case 'morning':
      return { part: 'morning', hero: 'out-the-door', label: 'Morning' }
    case 'after':
      return t >= AFTERNOON_START_MIN
        ? { part: 'afternoon', hero: 'lanes', label: 'Afternoon' }
        : { part: 'quiet', hero: 'scenery', label: null }
    case 'dinner':
      return { part: 'evening', hero: 'dinner', label: 'Evening' }
    case 'evening':
      // wallMoment's evening runs 7:30pm → 5am. Its first two hours are
      // bedtime; the rest of the night is quiet.
      return t >= 19 * 60 + 30 && t < BEDTIME_END_MIN
        ? { part: 'evening', hero: 'bedtime', label: 'Evening' }
        : { part: 'quiet', hero: 'scenery', label: null }
  }
}

/** "7:30a" / "12p" / "2:10p" on `day` → a Date. Null when it isn't one. */
export function parseWallClock(s: string, day: Date): Date | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])$/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'p') h += 12
  const d = new Date(day)
  d.setHours(h, Number(m[2] ?? 0), 0, 0)
  return d
}

function startOf(row: WallTodayRow, now: Date): Date | null {
  return row.startsAt != null ? new Date(row.startsAt) : parseWallClock(row.time, now)
}

export interface NextCommitment { id: string; time: string; title: string; owners: string[]; at: Date }

/** The next household thing on the clock that hasn't started yet. */
export function nextCommitment(rows: WallTodayRow[], now: Date): NextCommitment | null {
  let best: NextCommitment | null = null
  for (const r of rows) {
    if (r.past) continue
    const at = startOf(r, now)
    if (!at || at.getTime() <= now.getTime()) continue
    if (!best || at.getTime() < best.at.getTime()) best = { id: r.id, time: r.time, title: r.title, owners: r.owners, at }
  }
  return best
}

export interface LaneBlock {
  id: string
  title: string
  time: string
  sub: string | null
  /** Position on the lane's window, 0..100. */
  left: number
  width: number
  now: boolean
}

export interface PeopleLane {
  /** A family member id, or null for the household's own things. */
  memberId: string | null
  name: string
  blocks: LaneBlock[]
}

export interface LaneWindow { start: Date; end: Date; ticks: { label: string; left: number }[] }

/** The afternoon window: from the top of the current hour to 9pm. */
export function laneWindow(now: Date): LaneWindow {
  const start = new Date(now); start.setMinutes(0, 0, 0)
  const end = new Date(now); end.setHours(21, 0, 0, 0)
  if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 3 * 3_600_000)
  const span = end.getTime() - start.getTime()
  const ticks: LaneWindow['ticks'] = []
  for (let t = new Date(start); t.getTime() <= end.getTime(); t = new Date(t.getTime() + 3_600_000)) {
    const h = t.getHours()
    ticks.push({ label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`, left: ((t.getTime() - start.getTime()) / span) * 100 })
  }
  return { start, end, ticks }
}

/**
 * Who needs to be where: one lane per person who has something in the
 * window, plus a Household lane for what nobody in particular carries. Rows
 * already passed through wallTodayRows, so a single adult's own task never
 * appears. Lanes keep roster order; empty lanes are dropped.
 */
export function buildPeopleLanes(
  rows: WallTodayRow[],
  members: { id: string; name: string }[],
  now: Date,
  win: LaneWindow = laneWindow(now),
): PeopleLane[] {
  const span = win.end.getTime() - win.start.getTime()
  const toBlock = (r: WallTodayRow): LaneBlock | null => {
    const at = startOf(r, now)
    if (!at) return null
    const end = r.endsAt != null ? new Date(r.endsAt) : (r.end ? parseWallClock(r.end, now) : null) ?? new Date(at.getTime() + 45 * 60_000)
    if (end.getTime() <= win.start.getTime() || at.getTime() >= win.end.getTime()) return null
    const a = Math.max(at.getTime(), win.start.getTime())
    const b = Math.min(end.getTime(), win.end.getTime())
    return {
      id: r.id, title: r.title, time: r.time, sub: r.sub, now: r.now,
      left: ((a - win.start.getTime()) / span) * 100,
      width: Math.max(4, ((b - a) / span) * 100),
    }
  }
  const lanes: PeopleLane[] = members.map((m) => ({ memberId: m.id, name: m.name, blocks: [] }))
  const household: PeopleLane = { memberId: null, name: 'Household', blocks: [] }
  for (const r of rows) {
    if (r.past) continue
    const block = toBlock(r)
    if (!block) continue
    if (r.owners.length === 0) { household.blocks.push(block); continue }
    for (const id of r.owners) lanes.find((l) => l.memberId === id)?.blocks.push(block)
  }
  return [...lanes, household].filter((l) => l.blocks.length > 0)
}

/** Tonight's household things: timed rows from 5pm on that haven't passed. */
export function tonightRows(rows: WallTodayRow[], now: Date): WallTodayRow[] {
  return rows.filter((r) => {
    if (r.past) return false
    const at = startOf(r, now)
    return !!at && at.getHours() >= 17
  })
}

/** Today's appointments still ahead (or under way) — the morning's list. */
export function upcomingRows(rows: WallTodayRow[], limit = 4): WallTodayRow[] {
  return rows.filter((r) => !r.past).slice(0, limit)
}
