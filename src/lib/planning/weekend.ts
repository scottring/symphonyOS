import type { Task } from '@/types/task'
import { localYmd, weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

/** Saturday–Sunday, including the current weekend when opened on Sunday. */
export function weekendStartFor(day: Date, viewedWeek?: Date | null): Date {
  const start = new Date(viewedWeek ?? day)
  start.setHours(0, 0, 0, 0)
  const dow = start.getDay()
  start.setDate(start.getDate() + (!viewedWeek && dow === 0 ? -1 : (6 - dow + 7) % 7))
  return start
}

export function weekendEnd(start: Date): Date {
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return end
}

export function inTaskWeekend(task: Pick<Task, 'weekendStart'>, day: Date): boolean {
  if (!task.weekendStart) return false
  const date = localYmd(day)
  return date >= localYmd(task.weekendStart) && date <= localYmd(weekendEnd(task.weekendStart))
}

export function weekendLabel(start: Date): string {
  const format = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Weekend · ${format(start)}–${format(weekendEnd(start))}`
}

/** One placement payload for every flexible-weekend entry point. */
export function weekendPlacement(saturday: Date): Partial<Task> {
  const start = new Date(saturday)
  start.setHours(0, 0, 0, 0)
  return { bucket: 'week', weekStart: weekStartAnchor(start, readCadenceConfig().weekStartsOn),
    weekendStart: start, scheduledFor: undefined, isAllDay: false, plannedOn: undefined }
}

export function relativeWeekend(next = false): Date {
  const start = weekendStartFor(new Date())
  if (next) start.setDate(start.getDate() + 7)
  return start
}

/**
 * The weekends a month touches: every Saturday whose Saturday OR Sunday falls
 * in the month of `anchor`. A weekend that straddles the month edge (Sat Oct
 * 31 – Sun Nov 1) belongs to both months, because either day can be done in
 * either — the weekend is one unit and is never split to fit a calendar page.
 */
export function weekendsTouching(anchor: Date): Date[] {
  const y = anchor.getFullYear(), m = anchor.getMonth()
  const first = new Date(y, m, 1)
  // The Saturday on or before the 1st: its Sunday may be the 1st itself.
  const sat = new Date(first)
  sat.setDate(sat.getDate() - ((first.getDay() + 1) % 7))
  const out: Date[] = []
  for (let d = sat; ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    const sun = weekendEnd(d)
    const touches = d.getMonth() === m && d.getFullYear() === y || sun.getMonth() === m && sun.getFullYear() === y
    if (touches) out.push(d)
    else if (d > first) break
  }
  return out
}

/** "Sep 5–6", or "Oct 31 – Nov 1" across a month edge. */
export function weekendRangeLabel(start: Date): string {
  const end = weekendEnd(start)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()}–${end.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
}
