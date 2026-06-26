import type { TimelineItem } from '@/types/timeline'

export function selectFocusItems(items: TimelineItem[], limit = 3): TimelineItem[] {
  return items
    .filter((i) => i.startTime != null && !i.completed)
    .sort((a, b) => (a.startTime!.getTime() - b.startTime!.getTime()))
    .slice(0, limit)
}
