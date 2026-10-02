// src/lib/today/forwardLook.ts
//
// A clear Today ("Nothing left with a time on it.") used to sit there mute
// while the week ahead already had 19 things planned on it (demo run
// 2026-09-06). forwardLook names the first thing coming up instead — the
// honest, useful thing to say when today itself has nothing left. comingUp is
// the same look as a short list, for Today's "Coming up" (walkthrough
// 2026-10-02, #28: a task only showed on Today on its own date).

const DAY_MS = 86_400_000
const DEFAULT_WINDOW_DAYS = 7

export interface ForwardItem {
  /** The row's id, when it has one — for opening its details. */
  id?: string
  title: string
  when: Date
  isAllDay: boolean
}

interface ForwardLookRow {
  id?: string
  title: string
  scheduledFor?: Date | null
  isAllDay?: boolean | null
  completed?: boolean
  isGoal?: boolean
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Open rows dated on one of the `daysAfter` days after `today` (default 7),
 *  in order: by day, an all-day row before a timed row on the same day, then
 *  by time. Skips completed rows, goals, and anything scheduled for today
 *  itself — this is a FORWARD look, not a restatement of the current day. */
export function comingUp(
  tasks: readonly ForwardLookRow[],
  today: Date,
  daysAfter: number = DEFAULT_WINDOW_DAYS,
): ForwardItem[] {
  const todayStart = startOfDay(today)
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
  const windowEnd = new Date(todayStart.getTime() + (daysAfter + 1) * DAY_MS)

  return tasks
    .filter((t) => !t.completed && !t.isGoal && t.scheduledFor)
    .map((t): ForwardItem => ({ ...(t.id ? { id: t.id } : {}), title: t.title, when: new Date(t.scheduledFor as Date), isAllDay: !!t.isAllDay }))
    .filter((t) => t.when >= tomorrowStart && t.when < windowEnd)
    .sort((a, b) => {
      const dayDiff = startOfDay(a.when).getTime() - startOfDay(b.when).getTime()
      if (dayDiff !== 0) return dayDiff
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1
      return a.when.getTime() - b.when.getTime()
    })
}

/** The first thing on a day after `today`, within `days` days counting today
 *  (default 7). */
export function forwardLook(
  tasks: readonly ForwardLookRow[],
  today: Date,
  days: number = DEFAULT_WINDOW_DAYS,
): ForwardItem | null {
  return comingUp(tasks, today, days - 1)[0] ?? null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Does the title already name the item's day ("Talk to Tim on Monday")? */
function titleNamesDay(title: string, d: Date, isTomorrow: boolean): boolean {
  const full = WEEKDAYS[d.getDay()]
  if (new RegExp(`\\b(${full}|${full.slice(0, 3)})\\b`, 'i').test(title)) return true
  return isTomorrow && /\btomorrow\b/i.test(title)
}

/** "Next: Book flights · Tomorrow" · "Next: Piano · Thu 4:00 PM" ·
 *  "Nothing else coming up this week." when nothing is. The day is said once:
 *  a title that already names it keeps only the time — "Next: Talk to Tim on
 *  Monday · 11:45 AM" (walkthrough 2026-10-02, #7: the line read "Monday:
 *  Talk to Tim on Monday · 11:45 AM"). */
export function forwardLine(item: ForwardItem | null, today: Date): string {
  if (!item) return 'Nothing else coming up this week.'
  const dayDiff = Math.round((startOfDay(item.when).getTime() - startOfDay(today).getTime()) / DAY_MS)
  const dayLabel = titleNamesDay(item.title, item.when, dayDiff === 1)
    ? ''
    : dayDiff === 1 ? 'Tomorrow' : item.when.toLocaleDateString('en-US', { weekday: 'short' })
  const timeLabel = item.isAllDay ? '' : item.when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const when = [dayLabel, timeLabel].filter(Boolean).join(' ')
  return `Next: ${item.title}${when ? ` · ${when}` : ''}`
}
