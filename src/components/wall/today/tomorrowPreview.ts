import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { TIMED_SECTIONS } from '@/lib/timeUtils'

/**
 * Section order for "what's coming up" previews: chronological timed
 * sections first, all-day last.
 *
 * SECTIONS_ORDER (lib/today/types) puts 'allday' FIRST, which is right for
 * rendering a whole day top-to-bottom but wrong here — all-day events carry
 * a midnight `startTime`, so a preview that walked SECTIONS_ORDER would pick
 * "Trash day" over a real 7 AM school run. 'unscheduled' is excluded
 * entirely: an untriaged/untimed item can't be "the next thing."
 */
export const PREVIEW_SECTIONS: DaySection[] = [...TIMED_SECTIONS, 'allday']

/** The chronologically-first item across a day's sections, in preview order. */
export function pickFirstPreviewItem(
  sections: Record<DaySection, TimelineItem[]> | undefined,
): { title: string; startTime: Date | null } | null {
  if (!sections) return null
  for (const section of PREVIEW_SECTIONS) {
    const first = sections[section]?.[0]
    if (first) return { title: first.title, startTime: first.startTime ?? null }
  }
  return null
}
