// The week's rhythm (Scott, 2026-10-04: "a mess that can no longer stand").
// A routine that happens every day of the week — Feed Jax, Walk Jax, Bedtime —
// is written once above the days, not seven times down them; one that
// happens every weekday is written once under "Weekdays". What is left in a
// day is what is particular to it.
import type { JournalDay, JournalEntry } from './journalDays'

export interface RhythmItem {
  routineId: string
  title: string
  /** Its time, when it has one (the first day's). */
  time?: Date
  /** One occurrence's id, to open the routine. */
  openId: string
  people?: string[]
}

export interface WeekRhythm {
  everyDay: RhythmItem[]
  weekdays: RhythmItem[]
  /** The days without those routines (new objects; the input is untouched). */
  days: JournalDay[]
}

const isWeekday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5

export function weekRhythm(days: JournalDay[]): WeekRhythm {
  const none: WeekRhythm = { everyDay: [], weekdays: [], days }
  if (days.length < 7) return none
  const seen = new Map<string, { first: JournalEntry; keys: Set<string> }>()
  for (const d of days) {
    for (const e of [...d.entries, ...d.foldedRoutines]) {
      if (e.kind !== 'routine' || !e.routineId) continue
      const s = seen.get(e.routineId) ?? { first: e, keys: new Set<string>() }
      s.keys.add(d.key)
      seen.set(e.routineId, s)
    }
  }
  const weekdayKeys = days.filter((d) => isWeekday(d.date)).map((d) => d.key)
  const everyDay: RhythmItem[] = []
  const weekdays: RhythmItem[] = []
  for (const [routineId, { first, keys }] of seen) {
    const item: RhythmItem = { routineId, title: first.title, time: first.time, openId: first.id, people: first.people }
    if (keys.size === days.length) everyDay.push(item)
    else if (weekdayKeys.length === 5 && keys.size === 5 && weekdayKeys.every((k) => keys.has(k))) weekdays.push(item)
  }
  if (!everyDay.length && !weekdays.length) return none
  const lifted = new Set([...everyDay, ...weekdays].map((r) => r.routineId))
  const keep = (e: JournalEntry) => !(e.kind === 'routine' && e.routineId && lifted.has(e.routineId))
  const byTime = (a: RhythmItem, b: RhythmItem) =>
    (a.time ? a.time.getHours() * 60 + a.time.getMinutes() : 24 * 60) - (b.time ? b.time.getHours() * 60 + b.time.getMinutes() : 24 * 60)
  return {
    everyDay: everyDay.sort(byTime),
    weekdays: weekdays.sort(byTime),
    days: days.map((d) => ({ ...d, entries: d.entries.filter(keep), foldedRoutines: d.foldedRoutines.filter(keep) })),
  }
}
