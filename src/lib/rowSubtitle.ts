import type { TimelineItem } from '@/types/timeline'

/**
 * Derives a one-line subtitle for a Today-row from a TimelineItem.
 * Returns "" when there's nothing worth showing (plain task with no category, no duration).
 *
 * Examples:
 *   - errand at 5:30–5:50 PM  → "Errand · 20 min"
 *   - 1h event                 → "Event · 60 min"
 *   - routine                  → "Routine"
 *   - plain task               → ""
 */
export function rowSubtitle(item: TimelineItem): string {
  const label = categoryLabel(item)
  const duration = durationLabel(item)

  if (label && duration) return `${label} · ${duration}`
  return label || duration || ''
}

function categoryLabel(item: TimelineItem): string {
  if (item.type === 'routine') return 'Routine'
  if (item.type === 'event') return 'Event'
  switch (item.category) {
    case 'errand': return 'Errand'
    case 'chore': return 'Chore'
    case 'activity': return 'Activity'
    case 'event': return 'Event'
    case 'task':
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
  return `${mins} min`
}
