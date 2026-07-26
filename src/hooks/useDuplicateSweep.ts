import { useCallback, useMemo, useState } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { findDuplicates, type DuplicatePair } from '@/lib/today/duplicates'

/**
 * Today's duplicate sweep, kept out of TodayView.
 *
 * The sweep is on demand: this exposes a count and an opener, and nothing here
 * prompts on its own. Auto-prompting on a page whose whole problem is noise
 * would be self-defeating.
 */
export function useDuplicateSweep(
  sectionsOrder: DaySection[],
  grouped: Record<DaySection, TimelineItem[]>,
  onDeleteTask?: (id: string) => void,
): {
  pairs: DuplicatePair[]
  open: boolean
  setOpen: (open: boolean) => void
  keepOne: (keepId: string, dropIds: string[]) => void
} {
  const [open, setOpen] = useState(false)

  const pairs = useMemo(
    () => findDuplicates(sectionsOrder.flatMap((section) => grouped[section] ?? [])),
    [sectionsOrder, grouped],
  )

  // The keeper is left alone; only the copies it supersedes are removed. Never
  // reached for a cross-type group — the UI offers no delete there at all.
  const keepOne = useCallback((_keepId: string, dropIds: string[]) => {
    for (const id of dropIds) onDeleteTask?.(id)
  }, [onDeleteTask])

  return { pairs, open, setOpen, keepOne }
}
