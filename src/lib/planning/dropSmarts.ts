//
// Rules-first drop help. Pure functions — a later AI tagging pass can replace
// taskWindow's keyword heuristics without touching any grid component.
// Suggestions are PAINT: they highlight good open slots during a drag and
// never capture the drop.
import type { Task } from '@/types/task'

export interface SlotSuggestion {
  dateKey: string
  hour: number
  minute: number
}

/** Minutes from midnight, [start, end). */
export interface BusyInterval {
  startMinutes: number
  endMinutes: number
}

const CALL_RE = /\b(call|phone|dial)\b/i
const MEAL_RE = /\b(cook|dinner|lunch|breakfast|meal|recipe|dough|marinate)\b/i
const ERRAND_RE = /\b(buy|pick ?up|drop ?off|return|order|store|pharmacy|cvs)\b/i

/** The hours a task of this nature plausibly belongs to. Conservative:
 *  anything unrecognized gets the whole grid. */
export function taskWindow(title: string): { startHour: number; endHour: number } {
  if (CALL_RE.test(title)) return { startHour: 9, endHour: 17 }
  if (MEAL_RE.test(title)) return { startHour: 15, endHour: 18 }
  if (ERRAND_RE.test(title)) return { startHour: 9, endHour: 18 }
  return { startHour: 6, endHour: 22 }
}

/** Flatten one day's timed tasks, events, and routine starts into busy
 *  intervals (routines count as 30 minutes, their grid default). */
export function busyIntervals(args: {
  tasks: Task[]
  events: { start: Date; end: Date }[]
  routineStarts: Date[]
}): BusyInterval[] {
  const out: BusyInterval[] = []
  for (const t of args.tasks) {
    if (!t.scheduledFor || t.isAllDay) continue
    const start = new Date(t.scheduledFor)
    const m = start.getHours() * 60 + start.getMinutes()
    out.push({ startMinutes: m, endMinutes: m + (t.estimatedDuration || 30) })
  }
  for (const e of args.events) {
    out.push({
      startMinutes: e.start.getHours() * 60 + e.start.getMinutes(),
      endMinutes: e.end.getHours() * 60 + e.end.getMinutes(),
    })
  }
  for (const r of args.routineStarts) {
    const m = r.getHours() * 60 + r.getMinutes()
    out.push({ startMinutes: m, endMinutes: m + 30 })
  }
  return out
}

/** Up to `max` open slots that fit the task's nature: inside its hour window,
 *  no collision with anything already on the grid, never in the past.
 *  Earliest-first across the given dates. */
export function suggestSlots(
  task: Pick<Task, 'title' | 'estimatedDuration'>,
  busyByDate: Map<string, BusyInterval[]>,
  opts: {
    dates: Date[]
    dayStartHour: number
    dayEndHour: number
    slotMinutes: number
    now: Date
    max?: number
  },
): SlotSuggestion[] {
  const max = opts.max ?? 3
  const dur = task.estimatedDuration || 30
  const win = taskWindow(task.title)
  const startHour = Math.max(win.startHour, opts.dayStartHour)
  const endHour = Math.min(win.endHour, opts.dayEndHour)
  const nowDay = new Date(opts.now)
  nowDay.setHours(0, 0, 0, 0)
  const nowMinutes = opts.now.getHours() * 60 + opts.now.getMinutes()
  const out: SlotSuggestion[] = []

  for (const date of opts.dates) {
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    if (day < nowDay) continue // past day
    const isToday = day.getTime() === nowDay.getTime()
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const busy = busyByDate.get(dateKey) ?? []
    for (let m = startHour * 60; m + dur <= endHour * 60; m += opts.slotMinutes) {
      if (isToday && m < nowMinutes) continue
      const collides = busy.some((b) => m < b.endMinutes && m + dur > b.startMinutes)
      if (collides) continue
      out.push({ dateKey, hour: Math.floor(m / 60), minute: m % 60 })
      if (out.length >= max) return out
    }
  }
  return out
}
