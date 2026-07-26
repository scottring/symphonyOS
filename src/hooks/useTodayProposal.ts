import { useCallback, useMemo, useState } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { Project } from '@/types/project'
import type { GroupMemberRef } from '@/types/task'
import type { OrderWrite } from '@/lib/today/taskOrdering'
import { SORT_ORDER_GAP } from '@/lib/today/taskOrdering'
import { proposeOrderAndGrouping, type Proposal } from '@/lib/today/proposeOrder'

/** `task-abc` → `abc`. Non-task ids ride as group_members refs instead. */
function rawId(timelineId: string): string {
  const dash = timelineId.indexOf('-')
  return dash === -1 ? timelineId : timelineId.slice(dash + 1)
}

export interface TodayProposalDeps {
  onGroupItems?: (
    taskIds: string[], memberRefs: GroupMemberRef[], groupName: string, date: Date, isAllDay: boolean,
  ) => Promise<void>
  onReorderTasks?: (writes: OrderWrite[]) => Promise<boolean>
}

/**
 * Today's suggested order and grouping (spec move #8), kept out of TodayView.
 *
 * Applying reuses the SAME writers the drag gestures use — `onGroupItems` and
 * `onReorderTasks` — so an accepted suggestion is indistinguishable from having
 * done it by hand, and inherits every guard those paths already have.
 */
export function useTodayProposal(
  sectionsOrder: DaySection[],
  grouped: Record<DaySection, TimelineItem[]>,
  projects: Project[],
  viewedDate: Date,
  deps: TodayProposalDeps,
): {
  proposal: Proposal
  count: number
  open: boolean
  setOpen: (open: boolean) => void
  titleOf: (itemId: string) => string
  acceptGroup: (key: string) => void
  acceptOrder: () => void
  acceptAll: () => void
} {
  const [open, setOpen] = useState(false)

  // Only the untimed pile is proposed over: a timed item's position already
  // means something, and reshuffling it would fight the timeline.
  const candidates = useMemo(
    () => grouped.allday ?? [],
    [grouped],
  )

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name,
    [projects],
  )

  const proposal = useMemo(
    () => proposeOrderAndGrouping(candidates, projectName),
    [candidates, projectName],
  )

  const byId = useMemo(() => {
    const m = new Map<string, TimelineItem>()
    for (const section of sectionsOrder) {
      for (const item of grouped[section] ?? []) m.set(item.id, item)
    }
    return m
  }, [sectionsOrder, grouped])

  const titleOf = useCallback(
    (itemId: string) => byId.get(itemId)?.title ?? itemId,
    [byId],
  )

  const applyGroup = useCallback(async (key: string) => {
    const group = proposal.groups.find((g) => g.key === key)
    if (!group) return
    const items = group.itemIds.map((id) => byId.get(id)).filter((i): i is TimelineItem => !!i)
    const taskIds = items.filter((i) => i.type === 'task').map((i) => rawId(i.id))
    const memberRefs: GroupMemberRef[] = items
      .filter((i) => i.type === 'event' || i.type === 'routine')
      .map((i) => ({ type: i.type as 'event' | 'routine', id: rawId(i.id).split('#')[0] }))
    const date = new Date(viewedDate)
    date.setHours(0, 0, 0, 0) // an all-day group is dated midnight, never "now"
    await deps.onGroupItems?.(taskIds, memberRefs, group.name, date, true)
  }, [proposal, byId, viewedDate, deps])

  const applyOrder = useCallback(async () => {
    if (!proposal.order) return
    // A whole-list rewrite: the proposal restates every position, so gap-based
    // interpolation has nothing to interpolate against.
    const writes: OrderWrite[] = proposal.order.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is TimelineItem => !!i && i.type === 'task')
      .map((item, index) => ({ id: rawId(item.id), sortOrder: index * SORT_ORDER_GAP }))
    if (writes.length > 0) await deps.onReorderTasks?.(writes)
  }, [proposal, byId, deps])

  const acceptAll = useCallback(() => {
    void (async () => {
      for (const g of proposal.groups) await applyGroup(g.key)
      await applyOrder()
    })()
  }, [proposal, applyGroup, applyOrder])

  return {
    proposal,
    count: proposal.groups.length + (proposal.order ? 1 : 0),
    open,
    setOpen,
    titleOf,
    acceptGroup: (key) => { void applyGroup(key) },
    acceptOrder: () => { void applyOrder() },
    acceptAll,
  }
}
