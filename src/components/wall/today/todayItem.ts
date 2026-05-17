import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

export type TodayItemKind = 'task' | 'chore' | 'routine-step' | 'event'

export interface TodayItem {
  id: string
  kind: TodayItemKind
  title: string
  completed: boolean
  ownerId: string | null
  startTime: Date | null
  sourceId: string
  needsDiscussion?: boolean
  discussionNote?: string
}

function kindFor(item: TimelineItem): TodayItemKind {
  if (item.type === 'event') return 'event'
  if (item.type === 'routine') return 'routine-step'
  if (item.category === 'chore') return 'chore'
  return 'task'
}

export function buildTodayItems(
  sections: Record<DaySection, TimelineItem[]>,
  ownerFilter: string | null = null,
): TodayItem[] {
  const all: TodayItem[] = []
  for (const section of ['allday', 'morning', 'afternoon', 'evening'] as DaySection[]) {
    for (const item of sections[section] ?? []) {
      const owner = item.assignedTo ?? null
      if (ownerFilter && owner && owner !== ownerFilter) continue
      all.push({
        id: item.id,
        kind: kindFor(item),
        title: item.title,
        completed: item.completed,
        ownerId: owner,
        startTime: item.startTime,
        sourceId: item.id,
        needsDiscussion: item.needsDiscussion,
        discussionNote: item.discussionNote,
      })
    }
  }
  return all.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0
    if (!a.startTime) return -1
    if (!b.startTime) return 1
    return a.startTime.getTime() - b.startTime.getTime()
  })
}
