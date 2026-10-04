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
const clock = (t?: Date) => (t ? `${t.getHours()}:${t.getMinutes()}` : '')
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * `todayKey` (local YYYY-MM-DD) picks the occurrence the band opens: today's,
 * else the next one, else the week's last. An occurrence at another time than
 * most days' (Walk Jax at 8p on Wednesday) is particular to its day and stays
 * in it (review 2026-10-04).
 */
export function weekRhythm(days: JournalDay[], todayKey: string = localKey(new Date())): WeekRhythm {
  const none: WeekRhythm = { everyDay: [], weekdays: [], days }
  if (days.length < 7) return none
  const seen = new Map<string, { title: string; people?: string[]; byDay: Map<string, JournalEntry> }>()
  for (const d of days) {
    for (const e of [...d.entries, ...d.foldedRoutines]) {
      if (e.kind !== 'routine' || !e.routineId) continue
      const s = seen.get(e.routineId) ?? { title: e.title, people: e.people, byDay: new Map<string, JournalEntry>() }
      if (!s.byDay.has(d.key)) s.byDay.set(d.key, e)
      seen.set(e.routineId, s)
    }
  }
  const weekdayKeys = days.filter((d) => isWeekday(d.date)).map((d) => d.key)
  const everyDay: RhythmItem[] = []
  const weekdays: RhythmItem[] = []
  // routineId → the day keys whose occurrence the band stands for.
  const lifted = new Map<string, Set<string>>()
  for (const [routineId, { title, people, byDay }] of seen) {
    const keys = [...byDay.keys()]
    const all = keys.length === days.length
    const weekdaysOnly = !all && weekdayKeys.length === 5 && keys.length === 5 && weekdayKeys.every((k) => byDay.has(k))
    if (!all && !weekdaysOnly) continue
    // The band's time is the one most days share.
    const counts = new Map<string, number>()
    for (const e of byDay.values()) counts.set(clock(e.time), (counts.get(clock(e.time)) ?? 0) + 1)
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const usualKeys = keys.filter((k) => clock(byDay.get(k)!.time) === usual)
    const open = usualKeys.find((k) => k >= todayKey) ?? usualKeys[usualKeys.length - 1]
    const first = byDay.get(open)!
    const item: RhythmItem = { routineId, title, time: first.time, openId: first.id, people }
    ;(all ? everyDay : weekdays).push(item)
    lifted.set(routineId, new Set(usualKeys))
  }
  if (!everyDay.length && !weekdays.length) return none
  const keepIn = (dayKey: string) => (e: JournalEntry) => !(e.kind === 'routine' && e.routineId && lifted.get(e.routineId)?.has(dayKey))
  const byTime = (a: RhythmItem, b: RhythmItem) =>
    (a.time ? a.time.getHours() * 60 + a.time.getMinutes() : 24 * 60) - (b.time ? b.time.getHours() * 60 + b.time.getMinutes() : 24 * 60)
  return {
    everyDay: everyDay.sort(byTime),
    weekdays: weekdays.sort(byTime),
    days: days.map((d) => ({ ...d, entries: d.entries.filter(keepIn(d.key)), foldedRoutines: d.foldedRoutines.filter(keepIn(d.key)) })),
  }
}
