// src/lib/planning/weekDensity.ts
//
// What is already on each day of ONE week, counted the way the week journal
// counts it — so every "Choose when" in the app can offer the same tiles and
// mean the same thing by them.
//
// Until now only /week supplied day tiles, because only /week had a per-day
// list to count off (WeekViewV2's `journalDays`). Today, the planning pages
// and a goal's own page all offer day choices too, and offered them blind.
// The counting rules lived inside that one component, so the only way to
// reuse them was to copy them — which is how two surfaces come to disagree
// about the same Tuesday.
//
// So the rules live here, stated once:
//
//   TASKS      a task counts on the day it is scheduled for (timed or all
//              day), or on a day this person chose it for (`focus`, or the
//              legacy `plannedOn`). One task, one day, one count.
//   EVENTS     timed events count on their day; a MULTI-DAY timed event does
//              not (the journal lists it above the days, not on one), and
//              single-day all-day events do count — a day with four all-day
//              commitments is a full day that books no hours.
//   ROUTINES   an occurrence counts when it has a time, or when somebody put
//              it on that day, or when it is pinned, or when it is already
//              done. An untimed routine nobody chose is only AVAILABLE on
//              that day, and the week does not count it either.
//   MEALS      never. A dinner is what the day eats, not a commitment to
//              plan around.
//
// Counting is `dayDensity`'s job; this module decides WHAT is on each day and
// hands it over. `known` still means "we read the sources", never "empty".
import type { Task } from '@/types/task'
import type { ActionableInstance } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { TimelineItem } from '@/types/timeline'
import { localYmd } from '@/lib/cadence/config'
import { focusDays } from '@/lib/placement/model'
import { eventDays, isMultiDayEvent } from '@/lib/week/journalSpread'
import { isTimelineObligation } from '@/lib/routineUtils'
import { dayDensity, type DayDensity, type DensityItem } from './dayDensity'

/**
 * How an event is IDENTIFIED for counting: by what it is and when, not by
 * which calendar sent it. The same meeting synced to two calendars arrives
 * twice with different ids, and counting it twice makes a day look busier
 * than it is. Defined here so the week journal and every other surface
 * dedupe identically.
 */
export function eventDensityKey(title: string, at: Date | null | undefined, dayKey: string): string {
  return at ? `event|${title}|${at.getTime()}` : `event|${title}|allday|${dayKey}`
}

/**
 * Where one routine occurrence stands on one day — the three facts the week
 * journal reads, and the one verdict every surface needs from them.
 *
 * Extracted from WeekViewV2 so the journal and the day tiles cannot drift:
 * the journal uses `completed`/`planned` to decide which lane draws it, and
 * `counts` is exactly the condition under which it becomes one of the day's
 * entries rather than merely available on it.
 */
export function routineDayState(
  routineId: string,
  dayKey: string,
  item: Pick<TimelineItem, 'startTime' | 'originalRoutine'>,
  instances: readonly ActionableInstance[],
): { completed: boolean; planned: boolean; pinned: boolean; counts: boolean } {
  const instance = instances.find((i) => i.entity_type === 'routine' && i.entity_id === routineId && i.date === dayKey)
  const completed = instance?.status === 'completed'
  const planned = instance?.planned_on === dayKey
  // Through the shared resolver, never by reading the column here.
  const pinned = !!item.originalRoutine && isTimelineObligation(item.originalRoutine)
  return { completed, planned, pinned, counts: !!item.startTime || planned || pinned || completed }
}

/** The routine id inside a week item's `routine-<id>-day<n>` key. */
export function routineIdOf(itemId: string): string {
  return itemId.startsWith('routine-') ? itemId.slice('routine-'.length).replace(/-day\d+$/, '') : itemId
}

/** Which day of the week an item built by `buildWeekRoutineItems` belongs to. */
export function routineDayIndex(itemId: string): number {
  return Number(itemId.match(/-day(\d+)$/)?.[1] ?? -1)
}

export interface WeekDensityInput {
  /** The days being offered, in order. */
  days: readonly Date[]
  tasks: readonly Task[]
  /** Whose `focus` rows count as a chosen day. */
  userId: string | null
  events: readonly CalendarEvent[]
  /** Occurrences from `buildWeekRoutineItems`, built for these same days. */
  routineItems: readonly TimelineItem[]
  instances: readonly ActionableInstance[]
  /** What the sources can honestly say — see `densityReadiness`. */
  readiness: boolean | { known: boolean; note?: string }
  /**
   * A day the sources do not reach. The calendar behind the planning tiles
   * holds a fixed window forward from today; past its edge a count would be
   * confidently short, so the day says it does not know instead.
   */
  dayOutOfRange?: (day: Date) => { note: string } | null
}

/** The density of each day in `days`, by the rules at the top of this file. */
export function weekDensities(input: WeekDensityInput): DayDensity[] {
  const { days, tasks, userId, events, routineItems, instances, readiness } = input
  const keys = days.map(localYmd)
  const byKey = new Map<string, DensityItem[]>(keys.map((k) => [k, []]))

  for (const t of tasks) {
    let landed = false
    if (t.scheduledFor) {
      const k = localYmd(t.scheduledFor)
      if (byKey.has(k)) { byKey.get(k)!.push({ id: `task-${t.id}`, kind: 'task' }); landed = true }
    }
    if (landed) continue
    // Chosen for a day — this person's focus, or the legacy shared plannedOn.
    for (const k of focusDays(t, userId)) {
      if (byKey.has(k)) { byKey.get(k)!.push({ id: `task-${t.id}`, kind: 'task' }); break }
    }
  }

  for (const ev of events) {
    const span = eventDays(ev)
    if (!span) continue
    if (span.allDay) {
      // A multi-day all-day span is not a single day's commitment, exactly as
      // the journal treats it.
      if (span.first !== span.last) continue
      const list = byKey.get(span.first)
      if (list) list.push({ id: `event-${ev.google_event_id || ev.id}`, kind: 'event', key: eventDensityKey(ev.title ?? '', null, span.first) })
      continue
    }
    if (isMultiDayEvent(ev)) continue
    // `eventDays` already decided which day a timed event belongs to; the
    // clock is read again only to identify it for dedupe.
    const raw = (ev as { start_time?: string; startTime?: string }).start_time ?? (ev as { startTime?: string }).startTime
    const start = raw ? new Date(raw) : null
    const list = byKey.get(span.first)
    if (list) list.push({ id: `event-${ev.google_event_id || ev.id}`, kind: 'event', key: eventDensityKey(ev.title ?? '', start, span.first) })
  }

  for (const item of routineItems) {
    const idx = routineDayIndex(item.id)
    const key = keys[idx]
    if (!key) continue
    const routineId = routineIdOf(item.id)
    if (!routineDayState(routineId, key, item, instances).counts) continue
    byKey.get(key)!.push({ id: item.id, kind: 'routine', key: `routine|${routineId}|${key}` })
  }

  return days.map((day, i) => {
    const outside = input.dayOutOfRange?.(day)
    return dayDensity(day, byKey.get(keys[i]) ?? [], outside ? { known: false, note: outside.note } : readiness)
  })
}
