import type { TodayData } from '@/lib/today/types'
import { SECTIONS_ORDER } from '@/lib/today/types'
import type { TimelineItem } from '@/types/timeline'
import { taskToTimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { BandId, Moment, ThreadComposition } from './types'

const MIN = 60_000

/** A timed thing this close to starting is already your problem. */
export const APPROACH_MS = 45 * MIN

/** Past its end by less than this is "running late". Beyond it, the moment
 *  has passed and the item drops to Loose rather than shouting forever. */
export const LATE_GRACE_MS = 120 * MIN

/** Now is meant to be scannable in one glance. Overflow moves to Next. */
export const NOW_CAP = 5

/** The callable window: phones stop answering at 5, so anything you can only
 *  do by phone goes live for the last hour. This is the single most opinionated
 *  rule in the composer and the clearest test of the whole premise. */
export const CALL_WINDOW_START_HOUR = 16
export const CALL_WINDOW_END_HOUR = 17

const UNTIMED_SORT = Number.MAX_SAFE_INTEGER

export interface ComposeInput {
  data: TodayData
  now: Date
  /** Override for tests. */
  nowCap?: number
}

/** "40 min" / "1 hr 5 min" / "2 hr" — short enough to sit on a card. */
export function formatGap(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MIN))
  if (totalMin < 60) return `${totalMin} min`
  const hr = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return min === 0 ? `${hr} hr` : `${hr} hr ${min} min`
}

function weekdayOf(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

function clockOf(date: Date): string {
  return date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?([AP])M/i, (_m, p) => p.toLowerCase())
}

interface Verdict {
  band: BandId
  reason: string
  sortAt: number
}

/**
 * Band a timed item by how it sits against the clock. Untimed items never
 * reach here — the caller routes them by section.
 */
function classifyTimed(item: TimelineItem, now: Date): Verdict {
  const start = item.startTime as Date
  const end = item.endTime ?? start
  const t = now.getTime()
  const startMs = start.getTime()
  const endMs = end.getTime()

  if (t >= startMs && t <= endMs) {
    return { band: 'now', reason: 'happening now', sortAt: startMs }
  }

  if (startMs > t) {
    const gap = startMs - t
    if (gap <= APPROACH_MS) {
      return { band: 'now', reason: `starts in ${formatGap(gap)}`, sortAt: startMs }
    }
    return { band: 'next', reason: clockOf(start), sortAt: startMs }
  }

  // Already past its end.
  const late = t - endMs
  if (late <= LATE_GRACE_MS) {
    return { band: 'now', reason: `${formatGap(late)} past due`, sortAt: startMs }
  }
  return { band: 'loose', reason: `missed at ${clockOf(start)}`, sortAt: startMs }
}

/**
 * The callable-window promotion. An item you can only resolve by phone is not
 * urgent at 10am and is hopeless at 6pm; it is urgent at 4:15. Applies to any
 * incomplete item carrying a phone number that isn't already live.
 */
function isInCallWindow(now: Date): boolean {
  const h = now.getHours()
  return h >= CALL_WINDOW_START_HOUR && h < CALL_WINDOW_END_HOUR
}

function isActionable(item: TimelineItem): boolean {
  return !item.completed && !item.skipped
}

/**
 * Compose the day into three bands.
 *
 * Everything actionable lands in exactly one band — nothing is dropped. The
 * Now cap moves overflow into Next and reports the count rather than hiding it.
 */
export function composeThread({ data, now, nowCap = NOW_CAP }: ComposeInput): ThreadComposition {
  const moments: Moment[] = []
  const seen = new Set<string>()

  const push = (item: TimelineItem, verdict: Verdict): void => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    moments.push({ id: item.id, item, ...verdict })
  }

  // 1. The scheduled day, by section.
  for (const section of SECTIONS_ORDER) {
    for (const item of data.grouped[section] ?? []) {
      if (!isActionable(item)) continue

      if (section === 'unscheduled') {
        push(item, { band: 'loose', reason: 'no time set', sortAt: UNTIMED_SORT })
        continue
      }
      if (section === 'allday' || item.allDay) {
        push(item, { band: 'next', reason: 'all day', sortAt: UNTIMED_SORT })
        continue
      }
      if (!item.startTime) {
        push(item, { band: 'loose', reason: 'no time set', sortAt: UNTIMED_SORT })
        continue
      }
      push(item, classifyTimed(item, now))
    }
  }

  // 2. Carried over from previous days — decaying, so Loose regardless of the
  //    time-of-day they once had.
  for (const task of data.overdueTasks) {
    if (task.completed) continue
    const item = taskToTimelineItem(task as Task)
    const from = task.scheduledFor ? ` from ${weekdayOf(new Date(task.scheduledFor))}` : ''
    push(item, { band: 'loose', reason: `carried over${from}`, sortAt: UNTIMED_SORT })
  }

  // 3. Never triaged.
  for (const task of data.inboxTasks) {
    if (task.completed) continue
    push(taskToTimelineItem(task as Task), {
      band: 'loose',
      reason: 'unsorted',
      sortAt: UNTIMED_SORT,
    })
  }

  // 4. Callable-window promotion, applied after banding so it can lift an item
  //    out of Loose — a carried-over call is exactly the thing this is for.
  if (isInCallWindow(now)) {
    for (const moment of moments) {
      if (moment.band === 'now') continue
      if (!moment.item.phoneNumber) continue
      moment.band = 'now'
      moment.reason = 'phones close at 5'
      moment.sortAt = now.getTime()
    }
  }

  const byBand = (band: BandId): Moment[] =>
    moments.filter((m) => m.band === band).sort((a, b) => a.sortAt - b.sortAt)

  // 5. Cap Now. Overflow drops to the front of Next — moved, never dropped.
  const live = byBand('now')
  const kept = live.slice(0, nowCap)
  const overflow = live.slice(nowCap)
  for (const moment of overflow) moment.band = 'next'

  return {
    now: kept,
    next: byBand('next'),
    loose: byBand('loose'),
    nowOverflow: overflow.length,
  }
}
