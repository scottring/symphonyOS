/**
 * Today as a daily journal (Scott, 2026-09-19): the day's main list, read in
 * three parts instead of one run.
 *
 *   focus    what you CHOSE for the day with no time — untimed tasks and
 *            routine occurrences on the main list (dayPlan.ts decided they
 *            belong there). In your order.
 *   ahead    the timed day from the first thing not yet over (or the Up next
 *            row, if that started a little earlier), in time order,
 *            with the day's all-day events (a holiday, "Specials") above it.
 *   earlier  the timed rows before that point, folded. Nothing is marked done
 *            by being here; an unfinished one says so.
 *
 * Earlier is always a PREFIX of the timed day, cut in render order. That is
 * what lets "Still ahead" keep the drop targets: a gap index there counts from
 * the full section (gapOffset), so a drop retimes against the same rows the
 * resolver (todayDrop.ts) reads. A group's children never split from their
 * parent — the cut moves past them.
 *
 * Only today has a "now"; on any other day nothing is earlier.
 *
 * Pure. Never writes.
 */
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { emptySections } from './types'

const TIMED: DaySection[] = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night']
const DEFAULT_MINUTES = 30

export interface TodayJournal {
  focus: Record<DaySection, TimelineItem[]>
  allDayEvents: TimelineItem[]
  ahead: Record<DaySection, TimelineItem[]>
  earlier: Record<DaySection, TimelineItem[]>
  /** Rows of each section that went to `earlier` — `ahead`'s gap offset. */
  earlierCount: Partial<Record<DaySection, number>>
  /** Timed rows folded into Earlier, and how many of those still ask for a tick. */
  earlierSummary: { rows: number; notDone: number }
  focusCount: number
  aheadCount: number
}

function hasEnded(item: TimelineItem, now: Date): boolean {
  if (!item.startTime) return false
  const end = item.endTime ?? new Date(item.startTime.getTime() + DEFAULT_MINUTES * 60_000)
  return end.getTime() <= now.getTime()
}

export function splitTodayJournal(
  grouped: Record<DaySection, TimelineItem[]>,
  opts: {
    isToday: boolean
    now: Date
    /** The Up next row (upNext.ts) — something started a little while ago
     *  and not ticked is still the thing you're on. The cut never passes it. */
    upNextId?: string
  },
): TodayJournal {
  const focus = emptySections<TimelineItem>()
  const ahead = emptySections<TimelineItem>()
  const earlier = emptySections<TimelineItem>()
  const allDayEvents: TimelineItem[] = []

  for (const item of grouped.allday ?? []) {
    if (item.type === 'event') allDayEvents.push(item)
    else focus.allday.push(item)
  }
  focus.unscheduled = [...(grouped.unscheduled ?? [])]

  // The timed day in render order, and the cut: the first row (not a group
  // child) that is not over yet. Everything before it is earlier.
  const timed = TIMED.flatMap((section) => (grouped[section] ?? []).map((item) => ({ section, item })))
  let cut = timed.length
  if (opts.isToday) {
    cut = timed.findIndex(({ item }) => !item.isSubtask && (!hasEnded(item, opts.now) || item.id === opts.upNextId))
    if (cut === -1) cut = timed.length
  } else {
    cut = 0
  }

  const earlierCount: Partial<Record<DaySection, number>> = {}
  timed.forEach(({ section, item }, i) => {
    if (i < cut) {
      earlier[section].push(item)
      earlierCount[section] = (earlierCount[section] ?? 0) + 1
    } else {
      ahead[section].push(item)
    }
  })

  const earlierRows = timed.slice(0, cut).map((t) => t.item)
  return {
    focus,
    allDayEvents,
    ahead,
    earlier,
    earlierCount,
    earlierSummary: {
      rows: earlierRows.filter((i) => !i.isSubtask).length,
      notDone: earlierRows.filter((i) => !i.isSubtask && i.type !== 'event' && !i.completed && !i.skipped).length,
    },
    focusCount: focus.allday.length + focus.unscheduled.length,
    aheadCount: allDayEvents.length + timed.length - cut,
  }
}
