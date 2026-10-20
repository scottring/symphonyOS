// Everything on the family's day, or the weekend, on the kitchen wall (Scott,
// 2026-10-18: "a view option on the kiosk … all items for today/this
// weekend"). The moments show a few rows each; this is the whole list: every
// event, task and routine the wall holds for the day, done ones too, each
// task and routine with its check. Pure over useWallData's days.
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { WallDayData } from '@/hooks/useWallData'
import { boardOwnersOf } from '@/components/wall-v2/wallGantt'
import { HOUSEHOLD_ID } from '@/components/wall-v2/wallEventAttribution'
import { wallClock } from './wallMomentsModel'

export type AgendaView = 'today' | 'weekend'

export interface AgendaRow {
  id: string
  kind: TimelineItem['type']
  /** "4:15p"; null for anytime. */
  time: string | null
  title: string
  sub: string | null
  owners: string[]
  done: boolean
  /** A timed thing whose time has gone by. */
  past: boolean
  /** A task or a routine; an event has no check. */
  checkable: boolean
  /** The day it's on: a routine's check marks that day's occurrence. */
  on: Date
}

export interface AgendaDay {
  key: string
  date: Date
  /** "Saturday, Oct 24", or "Today, Oct 24": the date is written, so no one
   *  has to work out which weekend "this weekend" is. */
  label: string
  isToday: boolean
  /** All-day events: titles only. */
  allDay: string[]
  timed: AgendaRow[]
  anytime: AgendaRow[]
}

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** The weekend the wall means by "this weekend": the coming Saturday and
 *  Sunday, or what's left of it when today is one of them. Always the next
 *  one, whatever day the household's week starts on. */
export function weekendDates(now: Date): Date[] {
  const dow = now.getDay()
  const toSat = dow === 0 ? -1 : 6 - dow
  return [toSat, toSat + 1].filter((n) => n >= 0)
    .map((n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n))
}

const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "Oct 24–25", "Oct 31 – Nov 1", or "Oct 25" when only Sunday is left. */
export function datesLabel(dates: Date[]): string {
  if (!dates.length) return ''
  const a = dates[0], b = dates[dates.length - 1]
  if (dates.length === 1 || ymd(a) === ymd(b)) return monthDay(a)
  return a.getMonth() === b.getMonth() ? `${monthDay(a)}–${b.getDate()}` : `${monthDay(a)} – ${monthDay(b)}`
}

/** Today; or the weekend (weekendDates). */
export function agendaDays(days: WallDayData[], view: AgendaView, now: Date): WallDayData[] {
  if (view === 'today') return days.filter((d) => d.isToday)
  const want = weekendDates(now).map(ymd)
  return days.filter((d) => want.includes(ymd(d.date)))
}

export function agendaDay(day: WallDayData, members: FamilyMember[], now: Date): AgendaDay {
  const all = Object.values(day.items).flat()
  const ids = new Set(all.map((it) => it.id))
  const steps = new Map<string, number>()
  for (const it of all) {
    if (it.isSubtask && it.parentTaskId && ids.has(`task-${it.parentTaskId}`) && !it.completed) {
      steps.set(`task-${it.parentTaskId}`, (steps.get(`task-${it.parentTaskId}`) ?? 0) + 1)
    }
  }
  const seen = new Set<string>()
  const allDay: string[] = []
  const timed: (AgendaRow & { at: number })[] = []
  const anytime: AgendaRow[] = []
  for (const it of all) {
    if (seen.has(it.id)) continue
    seen.add(it.id)
    // A collection's steps belong to their checklist; a task's steps fold into it.
    if (it.type === 'routine' && it.originalRoutine?.parent_routine_id != null) continue
    if (it.isSubtask && it.parentTaskId && ids.has(`task-${it.parentTaskId}`)) continue
    if (it.allDay && it.type === 'event') { allDay.push(it.title); continue }
    const stepCount = steps.get(it.id) ?? 0
    const row: AgendaRow = {
      id: it.id,
      kind: it.type,
      time: null,
      title: it.title,
      sub: (it as TimelineItem & { location?: string | null }).location?.split(',')[0]
        ?? (stepCount ? `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}` : null),
      owners: boardOwnersOf(it, members).filter((id) => id !== HOUSEHOLD_ID),
      done: !!it.completed,
      past: false,
      checkable: it.type === 'task' || it.type === 'routine',
      on: day.date,
    }
    if (it.startTime && !it.allDay) {
      const start = new Date(it.startTime)
      const endsAt = it.endTime ? new Date(it.endTime).getTime() : start.getTime() + 30 * 60_000
      timed.push({ ...row, at: start.getTime(), time: wallClock(start), past: endsAt <= now.getTime() })
    } else {
      anytime.push(row)
    }
  }
  return {
    key: ymd(day.date),
    date: day.date,
    label: `${day.isToday ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'long' })}, ${monthDay(day.date)}`,
    isToday: day.isToday,
    allDay,
    timed: timed.sort((a, b) => a.at - b.at).map(({ at: _at, ...r }) => r),
    // Still to do first; done ones keep their place at the foot.
    anytime: [...anytime.filter((r) => !r.done), ...anytime.filter((r) => r.done)],
  }
}
