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
export type RoutineRow = { id: string; name: string; recurrence_pattern: unknown; time_of_day: string | null; parent_routine_id: string | null }

export interface WeekRead {
  start: string
  today: string
  days: { date: string; events: { id: string; title: string; time: string | null }[]; tasks: { id: string; title: string; time: string | null; done: boolean; seen: string }[] }[]
  noDay: { id: string; title: string; seen: string }[]
  lastWeekUnfinished: { id: string; title: string; was: string; seen: string }[]
  inbox: { id: string; title: string; seen: string }[]
  routines: { id: string; name: string; time: string | null; pattern: unknown }[]
  talkAbouts: string[]
}

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

export function shapeWeek(input: { start: string; today: string; tasks: TaskRow[]; events: EventRow[]; routines: RoutineRow[]; talks: { id: string; body: string }[] }): WeekRead {
  const { start, today } = input
  const { lastStart } = weekWindow(start)
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
    start, today, days,
    noDay: open.filter((t) => t.bucket === 'week' && !t.scheduled_for && (t.week_start ?? start) === start).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    lastWeekUnfinished: open.filter((t) => { const d = ymd(t.scheduled_for); return !!d && d >= lastStart && d < start })
      .map((t) => ({ id: t.id, title: t.title, was: ymd(t.scheduled_for)!, seen: t.updated_at })),
    inbox: open.filter((t) => t.bucket === 'inbox' && !t.scheduled_for).slice(0, 30).map((t) => ({ id: t.id, title: t.title, seen: t.updated_at })),
    routines: input.routines.filter((r) => !r.parent_routine_id).map((r) => ({ id: r.id, name: r.name, time: r.time_of_day ? r.time_of_day.slice(0, 5) : null, pattern: r.recurrence_pattern })),
    talkAbouts: input.talks.map((s) => s.body),
  }
}

export const READ_WEEK_TOOL = {
  name: 'symphony_read_week',
  description: 'Read the whole week in one call before planning it: each day\'s calendar events and dated tasks, tasks chosen for the week with no day yet, last week\'s unfinished tasks, the inbox, routines, and open things-to-talk-about. Use it FIRST when asked to plan the week or the rest of the week. Task ids here are the ids symphony_propose_changes takes.',
  input_schema: { type: 'object', properties: { start: { type: 'string', description: 'YYYY-MM-DD first day of the week (omit for this week)' } } },
}
