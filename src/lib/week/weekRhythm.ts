// The week's rhythm (Scott, 2026-10-04: "a mess that can no longer stand").
// A routine that happens every day of the week — Feed Jax, Walk Jax, Bedtime —
// is written once above the days, not seven times down them; one that
// happens every weekday is written once under "Weekdays". What is left in a
// day is what is particular to it.
//
// A task can repeat too: one row a day with the same title and time ("Pick up
// from FFG" at 5:15 each weekday). Where asked (the Week page), it is written
// once the same way (Friday session, Stage 1: repeats show once).
//
// Calm pass 2 (Scott approved the mockup 2026-10-18): where asked, a repeat
// folds even with exceptions — the same thing on at least 3 of the weekdays
// ("Pick up from FFG" Mon–Thu, Friday is early release) is written once,
// labelled with its days.
import type { JournalDay, JournalEntry } from './journalDays'
import { isWeekend } from '@/lib/dateUtils'
import { formatTimeCompact } from '@/lib/dateHelpers'

export interface RhythmItem {
  /** The routine's id; absent for a repeated task. */
  routineId?: string
  title: string
  /** Its time, when it has one (the first day's). */
  time?: Date
  /** One occurrence's id, to open the routine. */
  openId: string
  people?: string[]
}

export interface RhythmGroup {
  /** Its days: "Mon–Thu", or "Mon, Wed, Fri". */
  label: string
  items: RhythmItem[]
}

export interface WeekRhythm {
  everyDay: RhythmItem[]
  weekdays: RhythmItem[]
  /** Repeats on some of the week (at least 3 weekdays), by their days. */
  repeats: RhythmGroup[]
  /** The days without those routines (new objects; the input is untouched). */
  days: JournalDay[]
}

// The weekend as the page draws it (WeekCanvas's weekend columns): a
// Saturday-start week has the same five weekdays.
const isWeekday = (d: Date) => !isWeekend(d)
const clock = (t?: Date) => (t ? `${t.getHours()}:${t.getMinutes()}` : '')
/** Repeats on this many of the week's weekdays fold, when asked. */
const PARTIAL_MIN_WEEKDAYS = 3

/** The days a repeat falls on, in week order: a run of two or more reads as a
 *  range ("Mon–Thu"), the rest as a list ("Mon, Wed, Fri"). */
function daysLabel(days: JournalDay[], keys: Set<string>): string {
  const parts: string[] = []
  const name = (d: JournalDay) => d.date.toLocaleDateString('en-US', { weekday: 'short' })
  let i = 0
  while (i < days.length) {
    if (!keys.has(days[i].key)) { i++; continue }
    let j = i
    while (j + 1 < days.length && keys.has(days[j + 1].key)) j++
    parts.push(j > i ? `${name(days[i])}–${name(days[j])}` : name(days[i]))
    i = j + 1
  }
  return parts.join(', ')
}
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * `todayKey` (local YYYY-MM-DD) picks the occurrence the band opens: today's,
 * else the next one, else the week's last. An occurrence at another time than
 * most days' (Walk Jax at 8p on Wednesday) is particular to its day and stays
 * in it (review 2026-10-04).
 *
 * `tasks` lifts repeated tasks too; `partial` lifts a repeat on at least 3 of
 * the weekdays (not all), into `repeats`. Both are the Week page's.
 */
export function weekRhythm(days: JournalDay[], todayKey: string = localKey(new Date()), opts: { tasks?: boolean; partial?: boolean } = {}): WeekRhythm {
  const none: WeekRhythm = { everyDay: [], weekdays: [], repeats: [], days }
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
  // label → its first day (week order) and items, for repeats on part of the week.
  const partial = new Map<string, { first: number; items: RhythmItem[] }>()
  const weekdayCount = (keys: Iterable<string>) => [...keys].filter((k) => weekdayKeys.includes(k)).length
  // A part-week repeat goes under its days; every weekday is still "Weekdays".
  const placePartial = (keys: Set<string>, item: RhythmItem) => {
    if (weekdayKeys.length === 5 && keys.size === 5 && weekdayKeys.every((k) => keys.has(k))) { weekdays.push(item); return }
    const label = daysLabel(days, keys)
    const g = partial.get(label) ?? { first: days.findIndex((d) => keys.has(d.key)), items: [] }
    partial.set(label, { ...g, items: [...g.items, item] })
  }
  // routineId → the day keys whose occurrence the band stands for.
  const lifted = new Map<string, Set<string>>()
  for (const [routineId, { title, people, byDay }] of seen) {
    const keys = [...byDay.keys()]
    const all = keys.length === days.length
    const weekdaysOnly = !all && weekdayKeys.length === 5 && keys.length === 5 && weekdayKeys.every((k) => byDay.has(k))
    if (!all && !weekdaysOnly && !opts.partial) continue
    // The band's time is the one most days share.
    const counts = new Map<string, number>()
    for (const e of byDay.values()) counts.set(clock(e.time), (counts.get(clock(e.time)) ?? 0) + 1)
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const usualKeys = keys.filter((k) => clock(byDay.get(k)!.time) === usual)
    const open = usualKeys.find((k) => k >= todayKey) ?? usualKeys[usualKeys.length - 1]
    const first = byDay.get(open)!
    const item: RhythmItem = { routineId, title, time: first.time, openId: first.id, people }
    if (all || weekdaysOnly) (all ? everyDay : weekdays).push(item)
    else if (weekdayCount(usualKeys) >= PARTIAL_MIN_WEEKDAYS) placePartial(new Set(usualKeys), item)
    else continue
    lifted.set(routineId, new Set(usualKeys))
  }
  // Repeated tasks: the same title (case and spacing aside) at the same time,
  // for the same people, on every day of the week or on exactly its weekdays.
  // One a different time, or someone else's, any day is particular to its days
  // and stays in them: pickups that alternate between Scott and Iris keep
  // their faces in their days.
  const liftedTasks = new Set<string>()
  if (opts.tasks) {
    // normalised title @ clock @ people → day key → that day's rows (a
    // duplicate row goes with the rest).
    const groups = new Map<string, Map<string, JournalEntry[]>>()
    for (const d of days) {
      for (const e of d.entries) {
        if (e.kind !== 'task') continue
        const k = `${e.title.trim().replace(/\s+/g, ' ').toLowerCase()}@${clock(e.time)}@${[...(e.people ?? [])].sort().join(',')}`
        const byDay = groups.get(k) ?? new Map<string, JournalEntry[]>()
        byDay.set(d.key, [...(byDay.get(d.key) ?? []), e])
        groups.set(k, byDay)
      }
    }
    for (const byDay of groups.values()) {
      const keys = [...byDay.keys()]
      const all = keys.length === days.length
      const weekdaysOnly = !all && weekdayKeys.length === 5 && keys.length === 5 && weekdayKeys.every((k) => byDay.has(k))
      const some = !all && !weekdaysOnly && !!opts.partial && weekdayCount(keys) >= PARTIAL_MIN_WEEKDAYS
      if (!all && !weekdaysOnly && !some) continue
      const first = byDay.get(keys.find((k) => k >= todayKey) ?? keys[keys.length - 1])![0]
      const item: RhythmItem = { title: first.title, time: first.time, openId: first.id, people: first.people }
      if (some) placePartial(new Set(keys), item)
      else (all ? everyDay : weekdays).push(item)
      for (const rows of byDay.values()) for (const e of rows) liftedTasks.add(e.id)
    }
  }
  if (!everyDay.length && !weekdays.length && !partial.size) return none
  const keepIn = (dayKey: string) => (e: JournalEntry) =>
    !(e.kind === 'routine' && e.routineId && lifted.get(e.routineId)?.has(dayKey)) && !(e.kind === 'task' && liftedTasks.has(e.id))
  const byTime = (a: RhythmItem, b: RhythmItem) =>
    (a.time ? a.time.getHours() * 60 + a.time.getMinutes() : 24 * 60) - (b.time ? b.time.getHours() * 60 + b.time.getMinutes() : 24 * 60)
  return {
    everyDay: everyDay.sort(byTime),
    weekdays: weekdays.sort(byTime),
    repeats: [...partial.entries()]
      .sort((a, b) => a[1].first - b[1].first)
      .map(([label, g]) => ({ label, items: g.items.sort(byTime) })),
    days: days.map((d) => ({ ...d, entries: d.entries.filter(keepIn(d.key)), foldedRoutines: d.foldedRoutines.filter(keepIn(d.key)) })),
  }
}

/** Written above the days: "Every day", "Weekdays", then each part-week
 *  repeat under its days ("Mon–Thu"), each thing with its time when it has
 *  one ("5:15p Pick up from FFG"). */
export function rhythmLines(r: Pick<WeekRhythm, 'everyDay' | 'weekdays'> & Partial<Pick<WeekRhythm, 'repeats'>>): { label: string; items: { title: string; openId: string }[] }[] {
  const at = (t?: Date) => (t ? `${formatTimeCompact(t)} ` : '')
  const items = (xs: RhythmItem[]) => xs.map((x) => ({ title: `${at(x.time)}${x.title}`, openId: x.openId }))
  return [
    { label: 'Every day', items: items(r.everyDay) },
    { label: 'Weekdays', items: items(r.weekdays) },
    ...(r.repeats ?? []).map((g) => ({ label: g.label, items: items(g.items) })),
  ]
}
