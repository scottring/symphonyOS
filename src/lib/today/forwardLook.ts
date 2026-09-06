// src/lib/today/forwardLook.ts
//
// A clear Today ("Nothing left with a time on it.") used to sit there mute
// while the week ahead already had 19 things planned on it (demo run
// 2026-09-06). forwardLook names the first thing coming up instead — the
// honest, useful thing to say when today itself has nothing left.

const DAY_MS = 86_400_000
const DEFAULT_WINDOW_DAYS = 7

export interface ForwardItem {
  title: string
  when: Date
  isAllDay: boolean
}

interface ForwardLookRow {
  title: string
  scheduledFor?: Date | null
  isAllDay?: boolean | null
  completed?: boolean
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** The first thing on a day after `today`, within `days` days (default 7).
 *  Skips completed rows and anything scheduled for today itself — this is a
 *  FORWARD look, not a restatement of the current day. An all-day row sorts
 *  before a timed row on the same day. */
export function forwardLook(
  tasks: readonly ForwardLookRow[],
  today: Date,
  days: number = DEFAULT_WINDOW_DAYS,
): ForwardItem | null {
  const todayStart = startOfDay(today)
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
  const windowEnd = new Date(todayStart.getTime() + days * DAY_MS)

  const candidates = tasks
    .filter((t) => !t.completed && t.scheduledFor)
    .map((t) => ({ title: t.title, when: new Date(t.scheduledFor as Date), isAllDay: !!t.isAllDay }))
    .filter((t) => t.when >= tomorrowStart && t.when < windowEnd)
    .sort((a, b) => {
      const dayDiff = startOfDay(a.when).getTime() - startOfDay(b.when).getTime()
      if (dayDiff !== 0) return dayDiff
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1
      return a.when.getTime() - b.when.getTime()
    })

  return candidates[0] ?? null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Tomorrow: Book flights" · "Thursday: Piano · 4:00 PM" · "Nothing on the
 *  board this week." when nothing is coming up. */
export function forwardLine(item: ForwardItem | null, today: Date): string {
  if (!item) return 'Nothing on the board this week.'
  const todayStart = startOfDay(today)
  const itemStart = startOfDay(item.when)
  const dayDiff = Math.round((itemStart.getTime() - todayStart.getTime()) / DAY_MS)
  const dayLabel = dayDiff === 1 ? 'Tomorrow' : WEEKDAYS[item.when.getDay()]
  const timeLabel = item.isAllDay ? '' : item.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dayLabel}: ${item.title}${timeLabel ? ` · ${timeLabel}` : ''}`
}
