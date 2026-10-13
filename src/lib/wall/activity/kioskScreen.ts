// Which screen leads the kitchen wall right now (wall v1, Scott 2026-10-13:
// "rules decide what's right, not AI"). Read from the household's own
// routines — the kids' morning, home-from-school and bedtime collections —
// and tonight's dinner time, so when a routine changes the wall follows.
// Defaults stand in only where a day has no such routine.
//
//   out-the-door   the morning routine, until its last step (+10 min)
//   home           from half an hour before the home-from-school routine
//   dinner         half an hour before dinner until an hour after
//   bedtime        the bedtime routine, until its last step (+15 min)
//   night          after bedtime, and before the morning
//   weekend        a day with no school morning, until dinner
//   rest           everything else: the house is quiet, the wall is scenery
//
// Dark from the end of dinner until the morning (light by day, warm dark
// after dinner). PURE: `now` is passed in.

export type KioskScreen = 'out-the-door' | 'rest' | 'home' | 'dinner' | 'bedtime' | 'night' | 'weekend'

interface RoutineLike { timeOfDay: string | null; rows: { timeOfDay: string | null }[] }

export interface DayAnchors {
  /** Minutes after midnight. */
  morning: { start: number; end: number } | null
  home: { start: number } | null
  dinner: number
  bedtime: { start: number; end: number }
}

const DEFAULT_DINNER = 18 * 60
const DEFAULT_BEDTIME = { start: 19 * 60 + 30, end: 20 * 60 + 30 }

export const minutesOf = (hhmm: string | null | undefined): number | null => {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
const minutesNow = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** The span a routine covers: its start to its last timed step. */
function span(r: RoutineLike, minLength = 15): { start: number; end: number } | null {
  const start = minutesOf(r.timeOfDay)
  if (start == null) return null
  const steps = r.rows.map((s) => minutesOf(s.timeOfDay)).filter((n): n is number => n != null)
  const last = Math.max(start, ...steps)
  return { start, end: Math.max(last, start + minLength) }
}

/** Today's anchors from every kid's collections (Ella's and Kaleb's mornings
 *  are one routine, so they agree; the widest span wins if they don't). */
export function dayAnchors(collections: RoutineLike[], dinnerAt: Date | null): DayAnchors {
  let morning: DayAnchors['morning'] = null
  let home: DayAnchors['home'] = null
  let bedtime: { start: number; end: number } | null = null
  for (const c of collections) {
    const s = span(c)
    if (!s) continue
    if (s.start < 11 * 60) morning = morning ? { start: Math.min(morning.start, s.start), end: Math.max(morning.end, s.end) } : s
    else if (s.start >= 15 * 60 && s.start < 18 * 60) home = home ? { start: Math.min(home.start, s.start - 30) } : { start: s.start - 30 }
    else if (s.start >= 19 * 60) bedtime = bedtime ? { start: Math.min(bedtime.start, s.start), end: Math.max(bedtime.end, s.end) } : s
  }
  return { morning, home, dinner: dinnerAt ? minutesNow(dinnerAt) : DEFAULT_DINNER, bedtime: bedtime ?? DEFAULT_BEDTIME }
}

export interface KioskScreenPick {
  screen: KioskScreen
  /** The top band's words: what leads, plainly. */
  title: string
  dark: boolean
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The screen that leads at `now`. `schoolDay`: a school morning exists today. */
export function kioskScreen(now: Date, a: DayAnchors): KioskScreenPick {
  const t = minutesNow(now)
  const dinnerStart = a.dinner - 30
  const dinnerEnd = a.dinner + 60
  const dayStart = a.morning ? a.morning.start - 15 : 6 * 60
  const dark = t >= dinnerEnd || t < dayStart
  const left = (end: number) => Math.max(0, end - t)

  if (t < dayStart || t >= a.bedtime.end + 15) return { screen: 'night', title: 'Goodnight', dark: true }
  if (t >= a.bedtime.start) {
    const n = left(a.bedtime.end)
    return { screen: 'bedtime', title: n > 0 ? `Bedtime · lights out in ${n} min` : 'Lights out', dark: true }
  }
  if (t >= dinnerStart && t < dinnerEnd) return { screen: 'dinner', title: 'Dinner', dark: false }
  if (t >= dinnerEnd) return { screen: 'rest', title: 'This evening', dark }
  if (a.morning && t < a.morning.end + 10) {
    const n = left(a.morning.end)
    return { screen: 'out-the-door', title: n > 0 ? `Out the door in ${n} minute${n === 1 ? '' : 's'}` : 'Time to go', dark: false }
  }
  if (!a.morning) return { screen: 'weekend', title: WEEKDAY[now.getDay()], dark: false }
  if (a.home && t >= a.home.start) return { screen: 'home', title: 'Home from school', dark: false }
  return { screen: 'rest', title: t < 12 * 60 ? 'A quiet morning' : 'A quiet afternoon', dark: false }
}
