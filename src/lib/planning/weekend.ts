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
