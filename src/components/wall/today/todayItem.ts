import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { isEverydayRoutine } from '@/lib/routineUtils'

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
  /** True when this routine-step recurs daily or on all five weekdays. */
  isEverydayRoutine?: boolean
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
  // Include 'unscheduled' so routines without a time_of_day (e.g. weekly
  // "water the plants") still surface on the kiosk on the day they're due.
  // Restrict the 'unscheduled' bucket to routines — bucketed tasks
  // (week/month/quarter) also live in 'unscheduled' and would otherwise
  // spam the kiosk.
  for (const section of ['allday', 'morning', 'afternoon', 'evening', 'unscheduled'] as DaySection[]) {
    for (const item of sections[section] ?? []) {
      if (section === 'unscheduled' && item.type !== 'routine') continue
      const owner = item.assignedTo ?? null
      if (ownerFilter && owner && owner !== ownerFilter) continue
      const kind = kindFor(item)
      all.push({
        id: item.id,
        kind,
        title: item.title,
        completed: item.completed,
        ownerId: owner,
        startTime: item.startTime,
        sourceId: item.id,
        needsDiscussion: item.needsDiscussion,
        discussionNote: item.discussionNote,
        isEverydayRoutine:
          kind === 'routine-step'
            ? isEverydayRoutine(item.recurrencePattern)
            : undefined,
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
