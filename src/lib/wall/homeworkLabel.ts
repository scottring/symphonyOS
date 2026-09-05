// One place that says when homework is due, so the board chip and the kid
// page can never disagree about "Fri". Pure; `now` is passed in.
import { isSameDay, addDays } from '@/lib/dateUtils'
import type { Task } from '@/types/task'

/** Every member a homework task belongs to. `assignedToAll` wins when it
 *  names anyone in `memberIds` — a class-wide sheet is ONE row carrying every
 *  child (extract-email, 2026-09-04) — and `assignedTo`, the legacy single
 *  column, is the fallback. Empty when nobody recognisable owns it. Shared by
 *  the board and the kid page so a row can never sit on one and not the other. */
export function homeworkOwners(t: Task, memberIds: Set<string>): string[] {
  const all = (t.assignedToAll ?? []).filter((id) => memberIds.has(id))
  if (all.length) return [...new Set(all)]
  if (t.assignedTo && memberIds.has(t.assignedTo)) return [t.assignedTo]
  return []
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export interface HomeworkDue { label: string | null; late: boolean }

export function homeworkDue(neededOn: Date | undefined, now: Date): HomeworkDue {
  if (!neededOn) return { label: null, late: false }
  const today = dayStart(now)
  const due = dayStart(neededOn)
  if (due < today) return { label: 'Late', late: true }
  if (isSameDay(due, today)) return { label: 'Today', late: false }
  if (isSameDay(due, addDays(today, 1))) return { label: 'Tomorrow', late: false }
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days <= 6) return { label: WEEKDAY[due.getDay()], late: false }
  return { label: `${MONTH[due.getMonth()]} ${due.getDate()}`, late: false }
}

/** Late first, then dated ascending, undated last; ties by title. */
export function sortHomework<T extends { neededOn?: Date; title: string }>(tasks: T[], now: Date): T[] {
  const key = (t: T): [number, number, string] => {
    const { late } = homeworkDue(t.neededOn, now)
    return [late ? 0 : t.neededOn ? 1 : 2, t.neededOn ? dayStart(t.neededOn).getTime() : 0, t.title]
  }
  return [...tasks].sort((a, b) => {
    const ka = key(a), kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
  })
}
