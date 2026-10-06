import type { TimelineItem } from '@/types/timeline'
import { formatDurationMinutes } from '@/lib/timeUtils'

/**
 * Derives a one-line subtitle for a Today-row from a TimelineItem.
 * Returns "" when there's nothing worth showing.
 *
 * The subtitle's job is to carry what the rest of the row does NOT already
 * say. A row's type is not that: the checkbox shape, the icon and the time
 * column announce "event" and "routine" three ways over before the subtitle
 * gets a word in, so repeating it under every single title bought nothing and
 * cost a line of grey on every row of the day. What survives is the part only
 * the subtitle knows — a category that actually distinguishes this task from
 * the others (errand, chore, activity), and how long the thing runs.
 *
 * Examples:
 *   - errand at 5:30–5:50 PM   → "Errand · 20 min"
 *   - a 6h40m school day       → "6 hr 40 min"
 *   - routine, event, task     → ""
 */
export function rowSubtitle(item: TimelineItem, opts: { until?: string } = {}): string {
  const label = categoryLabel(item)
  // Today's rows show one time in their lane; when the thing ends goes here,
  // "until 10:15 AM", in place of how long it runs (2026-10-06).
  const duration = opts.until ? `until ${opts.until}` : durationLabel(item)

  if (label && duration) return `${label} · ${duration}`
  return label || duration || ''
}

function categoryLabel(item: TimelineItem): string {
  // 'routine' and 'event' rows carry their type in their own chrome.
  if (item.type === 'routine' || item.type === 'event') return ''
  switch (item.category) {
    case 'errand': return 'Errand'
    case 'chore': return 'Chore'
    case 'activity': return 'Activity'
    case 'homework': return 'Homework'
    case 'task':
    case 'event':
    default:
      return ''
  }
}

function durationLabel(item: TimelineItem): string {
  if (item.allDay) return ''
  if (!item.startTime || !item.endTime) return ''
  const ms = item.endTime.getTime() - item.startTime.getTime()
  const mins = Math.round(ms / 60000)
  if (mins <= 0) return ''
  return formatDurationMinutes(mins)
}
