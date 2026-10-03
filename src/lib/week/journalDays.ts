// The Week page's days, assembled (moved out of WeekViewV2 so the rules can be
// tested on their own). What a day holds, and two things the grid adds
// (spec 2026-10-03-week-grid-design §5, §6):
//
//   foldedRoutines  a day's untimed routine occurrences, drawn behind one
//                   "Routines · N" line; timed ones stay among the entries
//   weekend         "Sometime this weekend": the weekend's window work, once —
//                   Weekend-rule routines nobody has given a day or done, and
//                   tasks planned for the weekend with no day
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { localYmd } from '@/lib/cadence/config'
import { focusDays } from '@/lib/placement/model'
import { eventDays, isMultiDayEvent } from '@/lib/week/journalSpread'
import { routineDayIndex, routineDayState, routineIdOf } from '@/lib/planning/weekDensity'
import { weekendBand, sometimeThisWeekend } from '@/lib/week/weekendBand'

export interface JournalEntry {
  /** Selectable id — 'task-<uuid>', 'event-<id>', 'routine-<id>'. */
  id: string
  kind: 'event' | 'task' | 'routine'
  /** Present when the entry has a time. */
  time?: Date
  title: string
  subtitle?: string
  completed: boolean
  /** Tasks: the row. */
  task?: Task
  /** Routines: the occurrence's routine id, for completion. */
  routineId?: string
}

export interface JournalDay {
  date: Date
  /** Local YYYY-MM-DD. */
  key: string
  /** Single-day all-day calendar events (a holiday, "no school"). */
  notes: CalendarEvent[]
  /** Timed entries in time order, then untimed tasks. */
  entries: JournalEntry[]
  /** Untimed routine occurrences that are the day's, behind one fold line. */
  foldedRoutines: JournalEntry[]
  /** Untimed routine occurrences not chosen for the day. */
  available: TimelineItem[]
  dinners: { event: CalendarEvent; label: string }[]
}

/** The weekend in this week: where Saturday and Sunday sit (Sunday null when
 *  it belongs to another weekend — a Sunday-start week) and its window work. */
export interface JournalWeekend {
  satIndex: number
  sunIndex: number | null
  sometime: JournalEntry[]
}

export interface BuildJournalDaysArgs {
  weekStart: Date
  dayCount: number
  /** The tasks the page draws (dated or chosen for a day). */
  tasks: Task[]
  /** Tasks planned for a weekend (weekendStart) with no day of their own. */
  weekendTasks?: Task[]
  userId: string | null | undefined
  eventItems: TimelineItem[]
  events: CalendarEvent[]
  dinnersByDay: Map<string, { event: CalendarEvent; label: string }[]>
  routineItems: TimelineItem[]
  instances: ActionableInstance[]
  labelFor: (t: Task) => string | undefined
}

export function buildJournalDays(a: BuildJournalDaysArgs): { days: JournalDay[]; weekend: JournalWeekend | null } {
  const days: JournalDay[] = Array.from({ length: a.dayCount }, (_, i) => {
    const date = new Date(a.weekStart)
    date.setDate(date.getDate() + i)
    return { date, key: localYmd(date), notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
  })
  const byKey = new Map(days.map((d) => [d.key, d]))
  const timed = new Map(days.map((d) => [d.key, [] as JournalEntry[]]))
  const untimed = new Map(days.map((d) => [d.key, [] as JournalEntry[]]))

  // Tasks: timed ones at their time; untimed ones on the day they are dated
  // to, or the day they were CHOSEN for (a week-list task chosen for
  // Thursday keeps its list but is Thursday's work).
  const seen = new Set<string>()
  for (const t of a.tasks) {
    const entry = (time?: Date): JournalEntry => ({
      id: `task-${t.id}`, kind: 'task', time, title: t.title, subtitle: a.labelFor(t), completed: t.completed, task: t,
    })
    if (t.scheduledFor) {
      const key = localYmd(t.scheduledFor)
      if (byKey.has(key)) {
        seen.add(t.id)
        if (t.isAllDay) untimed.get(key)!.push(entry())
        else timed.get(key)!.push(entry(t.scheduledFor))
        continue
      }
    }
    // Chosen for a day (this person's focus; legacy planned_on when the row
    // has no focus rows) — drawn on that day, untimed.
    if (!seen.has(t.id)) {
      for (const key of focusDays(t, a.userId ?? undefined)) {
        if (byKey.has(key)) { untimed.get(key)!.push(entry()); break }
      }
    }
  }

  for (const item of a.eventItems) {
    if (!item.startTime) continue
    const key = localYmd(item.startTime)
    if (!byKey.has(key)) continue
    const source = item.originalEvent as CalendarEvent | undefined
    // A multi-day timed event (on call Mon 9am → Fri 5pm) is listed once
    // above the days, not as an entry on its first day.
    if (source && isMultiDayEvent(source)) continue
    timed.get(key)!.push({ id: item.id, kind: 'event', time: item.startTime, title: item.title, subtitle: item.subtitle, completed: false })
  }

  for (const ev of a.events) {
    const span = eventDays(ev)
    if (!span || !span.allDay || span.first !== span.last) continue
    byKey.get(span.first)?.notes.push(ev)
  }

  for (const [key, entries] of a.dinnersByDay) byKey.get(key)?.dinners.push(...entries)

  // The weekend: where Saturday sits, and Sunday when it is the same weekend.
  const band = weekendBand(days.map((d) => d.date))
  const satIndex = band?.satIndex ?? days.findIndex((d) => d.date.getDay() === 6)
  const sunIndex = band?.sunIndex ?? null
  const weekendIdx = new Set([satIndex, sunIndex].filter((i): i is number => i !== null && i >= 0))
  const stateOf = (routineId: string, key: string, r: TimelineItem) => routineDayState(routineId, key, r, a.instances)

  // Routine occurrences: with a time, chosen for the day, or due on it with
  // Show in Today on, they are the day's (timed among the entries, untimed
  // behind the fold); one whose rule leaves the day open and nobody chose is
  // only available — the same split Today and its pin make (dayPlan.ts). A
  // Weekend-rule occurrence nobody has given a day waits in Sometime instead.
  const windowItems = new Map<string, TimelineItem[]>()
  for (const r of a.routineItems) {
    const dayIndex = routineDayIndex(r.id)
    const day = days[dayIndex]
    if (!day) continue
    const routineId = routineIdOf(r.id)
    const { completed, planned, pinned, dayBound } = stateOf(routineId, day.key, r)
    const isWindow = r.originalRoutine?.recurrence_pattern.type === 'weekend' && weekendIdx.has(dayIndex)
    if (isWindow && !planned && !completed) {
      windowItems.set(routineId, [...(windowItems.get(routineId) ?? []), r])
      continue
    }
    const entry: JournalEntry = {
      id: r.id, kind: 'routine', time: r.startTime ?? undefined, title: r.title, completed, routineId,
    }
    if (r.startTime) timed.get(day.key)!.push(entry)
    else if (planned || pinned || dayBound || completed) day.foldedRoutines.push(entry)
    else day.available.push({ ...r, completed })
  }

  let weekend: JournalWeekend | null = null
  if (satIndex >= 0) {
    const sat = days[satIndex].date
    const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1)
    const firstItem = new Map([...windowItems].map(([id, items]) => [id, items[0]]))
    const routines = [...firstItem.values()].flatMap((r) => (r.originalRoutine ? [r.originalRoutine] : []))
    const shownOn = (routineId: string, date: Date) =>
      (windowItems.get(routineId) ?? []).some((r) => days[routineDayIndex(r.id)]?.key === localYmd(date))
    const kept = sometimeThisWeekend({
      routines,
      weekend: { sat, sun },
      dayState: (id, key) => { const r = firstItem.get(id); return r ? stateOf(id, key, r) : { planned: false, completed: false } },
      // In view only: a Sunday outside this week counts as "not shown here".
      shows: (routine, date) => shownOn(routine.id, date),
    })
    const satKey = localYmd(sat)
    weekend = {
      satIndex,
      sunIndex,
      sometime: [
        ...kept.map((routine): JournalEntry => {
          const r = firstItem.get(routine.id)!
          return { id: r.id, kind: 'routine', time: r.startTime ?? undefined, title: r.title, completed: false, routineId: routine.id }
        }),
        ...(a.weekendTasks ?? [])
          .filter((t) => !t.completed && !t.scheduledFor && t.weekendStart && localYmd(t.weekendStart) === satKey)
          .map((t): JournalEntry => ({ id: `task-${t.id}`, kind: 'task', title: t.title, subtitle: a.labelFor(t), completed: false, task: t })),
      ],
    }
  }

  for (const d of days) {
    const t = timed.get(d.key)!.sort((x, y) => x.time!.getTime() - y.time!.getTime())
    const u = untimed.get(d.key)!.sort((x, y) => Number(x.completed) - Number(y.completed))
    d.entries = [...t, ...u]
    d.foldedRoutines.sort((x, y) => Number(x.completed) - Number(y.completed))
  }
  return { days, weekend }
}
