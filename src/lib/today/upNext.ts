import type { TimelineItem } from '@/types/timeline'

/**
 * Picking rules for the Today "Up Next" hero.
 *
 * Candidates: incomplete, non-all-day items with a start time on the viewed
 * (today) date — tasks, events, and routines alike. The hero shows the
 * earliest one that is either upcoming or recently started: an item stays
 * in the hero for up to GRACE_MINUTES after its start time (a 20-minute-old
 * appointment is still "the thing you should be doing"), after which it
 * yields to the next candidate. Returns null when nothing qualifies — the
 * hero hides rather than showing something stale.
 */

export const UP_NEXT_GRACE_MINUTES = 120

export interface UpNextSelection {
  item: TimelineItem
  /** 'upcoming' → "starts in ~X"; 'started' → "since 8:00 AM" */
  status: 'upcoming' | 'started'
  /** Positive minutes until start (upcoming) or since start (started). */
  minutes: number
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function selectUpNext(items: TimelineItem[], now: Date): UpNextSelection | null {
  const candidates = items
    .filter((item) => {
      if (item.completed) return false
      if (item.allDay) return false
      if (!item.startTime) return false
      if (!isSameDay(item.startTime, now)) return false
      // Routine collections carry their own inline expansion UI; individual
      // routines/tasks/events all make sense as a single hero.
      if (item.type === 'routine-collection') return false
      const minutesSinceStart = (now.getTime() - item.startTime.getTime()) / 60000
      return minutesSinceStart < UP_NEXT_GRACE_MINUTES
    })
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

  const item = candidates[0]
  if (!item) return null

  const diffMinutes = Math.round((item.startTime!.getTime() - now.getTime()) / 60000)
  if (diffMinutes >= 0) {
    return { item, status: 'upcoming', minutes: diffMinutes }
  }
  return { item, status: 'started', minutes: -diffMinutes }
}

/** "starts in ~20 min" / "starts in ~2 hr" / "starting now" / "since 8:00 AM" */
export function formatUpNextStatus(selection: UpNextSelection): string {
  if (selection.status === 'started') {
    const t = selection.item.startTime!.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    return `since ${t}`
  }
  if (selection.minutes <= 1) return 'starting now'
  if (selection.minutes < 60) return `starts in ~${selection.minutes} min`
  const hours = Math.round(selection.minutes / 30) / 2 // nearest half hour
  return `starts in ~${hours % 1 === 0 ? hours : hours.toFixed(1)} hr`
}
