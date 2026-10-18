// supabase/functions/symphony-agent/readWeek.ts
//
// The planning loop's first step (spec 2026-10-14): Symphony reads the whole
// week before it says or asks anything. One call, shaped for the model.
//
// Times are stored as UTC timestamps; days and clock times here are the
// household's (APP_TZ), or a late-evening task lands on the wrong day.

import { APP_TZ } from './schedule.ts'

export type TaskRow = { id: string; title: string; scheduled_for: string | null; is_all_day: boolean | null; bucket: string | null; week_start: string | null; completed: boolean; assigned_to: string | null; updated_at: string }
export type EventRow = { id: string; title: string; start_time: string; end_time: string; all_day: boolean | null }
export type RoutineRow = { id: string; name: string; recurrence_pattern: unknown; time_of_day: string | null; parent_routine_id: string | null; assigned_to_all?: string[] | null; visibility?: string | null; paused_until?: string | null }
/** One routine occurrence row (actionable_instances, entity_type 'routine'). */
export type InstanceRow = { entity_id: string; date: string; status: string; deferred_to: string | null; assigned_to_override: string | null }

/** A routine day that differs from the routine this week: skipped, moved
 *  (deferred) or done by someone else. */
export type RoutineException = { date: string; status?: 'skipped' | 'deferred'; movedTo?: string; who?: string }
export type WeekRoutine = {
  id: string; name: string; time: string | null; pattern: unknown
  /** Who does it every week: member names (ids when a name is not known). */
  who: string[]
  /** Resting (the board's Rest): until a date, or null for no date. */
  resting?: { until: string | null }
  thisWeek?: RoutineException[]
}

export interface WeekRead {
  start: string
  today: string
  calendar: CalendarCoverage
  days: { date: string; events: { id: string; title: string; time: string | null }[]; tasks: { id: string; title: string; time: string | null; done: boolean; seen: string }[] }[]
  noDay: { id: string; title: string; seen: string }[]
  lastWeekUnfinished: { id: string; title: string; was: string; seen: string }[]
  inbox: { id: string; title: string; seen: string }[]
  routines: WeekRoutine[]
  talkAbouts: string[]
}

/** These tools read cached events, not a complete, live availability check. */
export interface CalendarCoverage {
  status: 'not-connected' | 'unavailable' | 'cached'
  availability: 'unknown'
  note: string
}

export async function readCalendarCoverage(
  read: () => PromiseLike<{ data: { provider: string; sync_enabled: boolean | null }[] | null; error: unknown }>,
  eventsReadable = true,
): Promise<CalendarCoverage> {
  try {
    const { data, error } = await read()
    if (error || !data) return unknownCalendar()
    const connections = data.filter((c) => c.provider === 'google' || c.provider === 'microsoft')
    if (!connections.length) return {
      status: 'not-connected', availability: 'unknown',
      note: 'No calendar is connected. Availability is unknown. Empty event lists do not mean the person is free; plan from their tasks, routines and stated commitments.',
    }
    if (!eventsReadable || !connections.some((c) => c.sync_enabled !== false)) return unknownCalendar()
    return {
      status: 'cached', availability: 'unknown',
      note: 'These are saved calendar events, not a verified live read of all calendars for this range. Missing events do not prove free time. Refer to what is shown in Symphony and ask about other commitments when needed.',
    }
  } catch {
    // A wall device deliberately cannot inspect personal connections. Preserve
    // that boundary; it must not turn a refused read into an empty calendar.
    return unknownCalendar()
  }
}

const unknownCalendar = (): CalendarCoverage => ({
  status: 'unavailable', availability: 'unknown',
  note: 'Calendar coverage could not be verified. Availability is unknown; do not describe the day or week as free, clear or wide open.',
})

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekWindow(start: string) {
  return { start, end: addDays(start, 7), lastStart: addDays(start, -7) }
}

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** The household's local date and HH:MM for a stored timestamp. */
export function local(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
const ymd = (iso: string | null) => (iso ? local(iso).date : null)
const hhmm = (iso: string, allDay: boolean | null) => (allDay ? null : local(iso).time)
/** An all-day calendar event's dates are calendar dates, not instants. */
const eventDay = (iso: string, allDay: boolean | null) => (allDay ? iso.slice(0, 10) : local(iso).date)

/** This week's occurrence exceptions, by routine id. A move to midnight is a
 *  move to that day with no time (how reschedule stores a day-only move). */
function routineExceptions(instances: InstanceRow[], start: string, end: string, nameOf: (id: string) => string) {
  const byRoutine = new Map<string, RoutineException[]>()
  for (const x of instances) {
    if (x.date < start || x.date >= end) continue
    const status = x.status === 'skipped' || x.status === 'deferred' ? x.status : undefined
    if (!status && !x.assigned_to_override) continue
    const e: RoutineException = { date: x.date }
    if (status) e.status = status
    if (status === 'deferred' && x.deferred_to) {
      const to = local(x.deferred_to)
      e.movedTo = to.time === '00:00' ? to.date : `${to.date} ${to.time}`
    }
    if (x.assigned_to_override) e.who = nameOf(x.assigned_to_override)
    byRoutine.set(x.entity_id, [...(byRoutine.get(x.entity_id) ?? []), e])
  }
  for (const list of byRoutine.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return byRoutine
}

export function shapeWeek(input: { start: string; today: string; calendar?: CalendarCoverage; tasks: TaskRow[]; events: EventRow[]; routines: RoutineRow[]; talks: { id: string; body: string }[]; instances?: InstanceRow[]; members?: { id: string; name: string }[] }): WeekRead {
  const { start, today } = input
  const { end, lastStart } = weekWindow(start)
  const memberNames = new Map((input.members ?? []).map((m) => [m.id, m.name]))
  const nameOf = (id: string) => memberNames.get(id) ?? id
  const exceptions = routineExceptions(input.instances ?? [], start, end, nameOf)
  const open = input.tasks.filter((t) => !t.completed)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      events: input.events.filter((e) => { const s = eventDay(e.start_time, e.all_day), en = eventDay(e.end_time, e.all_day); return s <= date && (en > date || s === date) })
        .map((e) => ({ id: e.id, title: e.title, time: hhmm(e.start_time, e.all_day) })),
      tasks: input.tasks.filter((t) => ymd(t.scheduled_for) === date)
        .map((t) => ({ id: t.id, title: t.title, time: t.scheduled_for ? hhmm(t.scheduled_for, t.is_all_day) : null, done: t.completed, seen: t.updated_at })),
    }
  })
  return {
    start, today, calendar: input.calendar ?? unknownCalendar(), days,
    noDay: open.filter((t) => t.bucket === 'week' && !t.scheduled_for && (t.week_start ?? start) === start).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    lastWeekUnfinished: open.filter((t) => { const d = ymd(t.scheduled_for); return !!d && d >= lastStart && d < start })
      .map((t) => ({ id: t.id, title: t.title, was: ymd(t.scheduled_for)!, seen: t.updated_at })),
    inbox: open.filter((t) => t.bucket === 'inbox' && !t.scheduled_for).slice(0, 30).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    routines: input.routines.filter((r) => !r.parent_routine_id).map((r) => {
      const thisWeek = exceptions.get(r.id)
      return {
        id: r.id, name: r.name, time: r.time_of_day ? r.time_of_day.slice(0, 5) : null, pattern: r.recurrence_pattern,
        who: (r.assigned_to_all ?? []).map(nameOf),
        ...(r.visibility === 'reference' ? { resting: { until: r.paused_until ? local(r.paused_until).date : null } } : {}),
        ...(thisWeek ? { thisWeek } : {}),
      }
    }),
    talkAbouts: input.talks.map((s) => s.body),
  }
}

export const READ_WEEK_TOOL = {
  name: 'symphony_read_week',
  description: 'Read the whole week in one call before planning it: each day\'s calendar events and dated tasks, tasks chosen for the week with no day yet, last week\'s unfinished tasks, the inbox, routines (id, time, days, who, resting, and thisWeek: days skipped, moved or done by someone else), and open things-to-talk-about. Use it FIRST when asked to plan the week or the rest of the week, and before proposing a routine change. Task and routine ids here are the ids symphony_propose_changes takes.',
  input_schema: { type: 'object', properties: { start: { type: 'string', description: 'YYYY-MM-DD first day of the week (omit for this week)' } } },
}
