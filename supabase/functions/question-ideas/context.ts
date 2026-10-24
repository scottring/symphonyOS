// What the ideas know about the household (2026-10-24). Scott: the tool's
// advantage is that "it knows how we think and how we work and how we do
// things", so ideas rest on the household's own data, not general advice:
// its routines, this week, its month and season goals, and when it did
// things lately. Read with the person's own client, so RLS decides what is
// in it; any read that fails is left out and the ideas go on without it.

import { local, readCalendarCoverage, shapeWeek, weekWindow, type EventRow, type RoutineRow, type TaskRow, type WeekRead } from '../symphony-agent/readWeek.ts'
import { readPlan, type PlanRead } from '../symphony-agent/readPlan.ts'

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

export const MAX_CONTEXT = 9000
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const shift = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekday = (ymd: string) => DAY[new Date(`${ymd}T12:00:00Z`).getUTCDay()]
/** "18:00" → "6pm", "07:30" → "7:30am". */
export function clock(hhmm: string | null): string {
  if (!hhmm) return ''
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(3, 5)
  return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : `:${m}`}${h < 12 ? 'am' : 'pm'}`
}

export interface DoneRow { title: string; completed_at: string }

/** Everything above as short lines for the model. PURE. */
export function shapeIdeasContext(input: { today: string; week: WeekRead | null; month: PlanRead | null; season: PlanRead | null; done: DoneRow[] }): string {
  const { today, week, month, season, done } = input
  const out: string[] = [`Today: ${weekday(today)} ${today}.`]

  if (week) {
    const live = week.routines.filter((r) => !r.resting)
    if (live.length) {
      out.push('', 'ROUTINES (how they already do things):')
      for (const r of live) {
        const pattern = JSON.stringify(r.pattern ?? null)
        out.push(`- ${r.name}${r.time ? ` · ${clock(r.time)}` : ''}${r.who.length ? ` · ${r.who.join(', ')}` : ''}${pattern && pattern !== 'null' ? ` · ${pattern.slice(0, 90)}` : ''}`)
      }
    }
    out.push('', `THIS WEEK (${week.start} on). ${week.calendar.note}`)
    for (const d of week.days) {
      const items = [
        ...d.events.map((e) => `${e.time ? `${clock(e.time)} ` : ''}${e.title}`),
        ...d.tasks.map((t) => `${t.time ? `${clock(t.time)} ` : ''}${t.title}${t.done ? ' (done)' : ''}`),
      ]
      out.push(`${weekday(d.date)} ${d.date.slice(5)}: ${items.length ? items.join('; ') : 'nothing in Symphony'}`)
    }
    if (week.noDay.length) out.push(`For this week, no day yet: ${week.noDay.map((t) => t.title).join('; ')}`)
  }

  const goals = (label: string, plan: PlanRead | null) => {
    const open = plan?.items.filter((i) => !i.done) ?? []
    if (plan && open.length) out.push('', `${label} (${plan.period.label}): ${open.map((i) => i.title).join('; ')}`)
  }
  goals('MONTH GOALS', month)
  goals('SEASON GOALS', season)

  if (done.length) {
    out.push('', 'DONE LATELY, with when (their real habits):')
    for (const t of done) {
      const at = local(t.completed_at)
      out.push(`- ${t.title} · ${weekday(at.date)} ${at.date.slice(5)} ${clock(at.time)}`)
    }
  }
  const text = out.join('\n')
  return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}\n…(cut)` : text
}

/** Read it all, as the person. */
export async function readIdeasContext(db: Db, userId: string): Promise<string> {
  const today = local(new Date().toISOString()).date
  // The household's week starts on Saturday, as the chat's own week read assumes.
  const start = shift(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 1) % 7))
  const { end } = weekWindow(start)
  const cols = 'id, title, scheduled_for, is_all_day, bucket, week_start, completed, assigned_to, updated_at'
  const settle = async <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try { const r = await p; return r.error ? [] : r.data ?? [] } catch { return [] }
  }
  const [dated, weekTasks, events, routines, members, done, month, season] = await Promise.all([
    settle<TaskRow>(db.from('tasks').select(cols).gte('scheduled_for', `${shift(start, -1)}T00:00:00Z`).lt('scheduled_for', `${shift(end, 1)}T00:00:00Z`).limit(200)),
    settle<TaskRow>(db.from('tasks').select(cols).eq('bucket', 'week').eq('completed', false).is('scheduled_for', null).limit(60)),
    settle<EventRow>(db.from('calendar_events').select('id, title, start_time, end_time, all_day').lt('start_time', `${shift(end, 1)}T00:00:00Z`).gte('end_time', `${shift(start, -1)}T00:00:00Z`).order('start_time').limit(150)),
    settle<RoutineRow>(db.from('routines').select('id, name, recurrence_pattern, time_of_day, parent_routine_id, assigned_to_all, visibility, paused_until').limit(150)),
    settle<{ id: string; name: string }>(db.from('family_members').select('id, name').limit(50)),
    settle<DoneRow>(db.from('tasks').select('title, completed_at').eq('completed', true).gte('completed_at', `${shift(today, -42)}T00:00:00Z`).order('completed_at', { ascending: false }).limit(50)),
    readPlan(db, { level: 'month' }, today).catch(() => null),
    readPlan(db, { level: 'season' }, today).catch(() => null),
  ])
  const calendar = await readCalendarCoverage(() => db.from('calendar_connections').select('provider, sync_enabled').eq('user_id', userId))
  const week = shapeWeek({ start, today, calendar, tasks: [...dated, ...weekTasks], events, routines, talks: [], members })
  return shapeIdeasContext({ today, week, month, season, done: done.filter((d) => d.completed_at) })
}
