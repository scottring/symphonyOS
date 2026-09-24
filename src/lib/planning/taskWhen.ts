// src/lib/planning/taskWhen.ts
//
// One plain-English answer to "when is this?" for a task, in the order a
// person asks it: the day first, then the broader commitments the day sits
// inside. Walk finding S1-13 — the detail pane showed no date at all, so you
// could reschedule an item from the pane but never read the current answer.
//
// Both halves matter. Symphony's model is that choosing a day for a task does
// not consume its week: "Fri Sep 25 · Week of Sep 22" is the whole truth, and
// showing only the day would teach the wrong thing.
//
// But only a week that was actually CHOSEN counts. `deriveCache` gives a dated
// task the week of its day, so reading `weekStart` alone announced "Week of
// Sep 20" over a task whose only decision was a date — a commitment nobody
// made (connected planning brief, transition contract). A row that carries
// commitment records is therefore asked for a week COMMITMENT; a legacy row
// with no records at all keeps reading its cache, so nothing that predates
// commitments loses its week.

import type { Task } from '@/types/task'
import { weekendEnd } from './weekend'
import { openCommitment } from '@/lib/placement/model'

type WhenTask = Pick<Task,
  'scheduledFor' | 'isAllDay' | 'bucket' | 'weekStart' | 'weekendStart' | 'monthStart' | 'seasonStart'>
  & Partial<Pick<Task, 'commitments'>>

/**
 * The week this task is actually committed to, or null.
 *
 * With commitment records present, only a record counts. Without any, the
 * cached `weekStart` is all there is and is trusted — except on a dated row,
 * where the cache is derived from the date and proves nothing.
 */
function chosenWeek(task: WhenTask): Date | null {
  if (task.commitments) return openCommitment(task, 'week')?.periodStart ?? null
  if (!task.weekStart) return null
  return task.scheduledFor ? null : task.weekStart
}

const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "Today", "Tomorrow", else "Fri Sep 25". */
function dayLabel(date: Date, now: Date): string {
  if (sameDay(date, now)) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay(date, tomorrow)) return 'Tomorrow'
  return day(date)
}

/**
 * The parts of a task's "when", outermost commitment last.
 *
 * Returns `[]` for a task with no day and no period — the caller decides
 * whether that is worth saying out loud.
 */
export function taskWhenParts(task: WhenTask, now: Date = new Date()): string[] {
  const parts: string[] = []

  if (task.scheduledFor) {
    const date = dayLabel(task.scheduledFor, now)
    parts.push(task.isAllDay
      ? `${date} · all day`
      : `${date} · ${task.scheduledFor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)
  }

  // A weekend commitment is deliberately two days wide; naming a Saturday date
  // alone would invent a day the person never chose.
  if (task.weekendStart) {
    parts.push(`Weekend · ${short(task.weekendStart)}–${short(weekendEnd(task.weekendStart))}`)
  } else {
    const week = chosenWeek(task)
    if (week) parts.push(`Week of ${short(week)}`)
  }

  if (task.monthStart) parts.push(task.monthStart.toLocaleDateString('en-US', { month: 'long' }))
  if (task.seasonStart) parts.push(task.seasonStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))

  return parts
}

/** The same answer as one line, with "No date yet" when there is nothing to say. */
export function taskWhenLabel(task: WhenTask, now: Date = new Date()): string {
  const parts = taskWhenParts(task, now)
  return parts.length ? parts.join(' · ') : 'No date yet'
}
