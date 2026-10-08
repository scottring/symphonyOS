import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { ALL_LAYERS } from '@/lib/domains'
import { backlogHomes, backlogWhereabouts } from './backlogHomes'
import { selectCarriedOver } from './taskPools'
import { selectNeedsAttention } from './attention'
import { selectInboxExpired } from './expired'
import { makeAssigneeFilter } from './assigneeFilter'
import { filterInboxTasksForLayers, filterTasksForLayers } from './domainFilter'

// A fixed day: these selectors age rows off `now`, so a wall clock would rot
// the fixtures (see tend_tests_rot_on_wall_clock).
const NOW = new Date(2026, 9, 8, 9, 0)
const daysAgo = (n: number) => new Date(2026, 9, 8 - n)
const WEEK_START = new Date(2026, 9, 3) // Saturday weeks

const task = (p: Partial<Task> & { id: string }): Task => ({
  title: p.id, completed: false, createdAt: daysAgo(1), updatedAt: daysAgo(1), ...p,
} as Task)

describe('backlogWhereabouts', () => {
  it('names each part and its home, adding up to the total', () => {
    expect(backlogWhereabouts({ dated: 1, waiting: 0, pastWeek: 4, monthList: 3, inbox: 2 }))
      .toBe('Of the 10 here: 1 past its date — in the Inbox under Expired; 9 with no date that sat a while (4 on a week that has passed, 3 on a month list for 45+ days, 2 in the Inbox for 2+ weeks).')
  })
  it('sends only dated work to Expired, and waits to Waiting on', () => {
    expect(backlogWhereabouts({ dated: 3, waiting: 1, pastWeek: 0, monthList: 0, inbox: 0 }))
      .toBe('Of the 4 here: 3 past their date — all in the Inbox under Expired; 1 you’re waiting on — in the Inbox under Waiting on.')
  })
  it('says nothing for an empty backlog', () => {
    expect(backlogWhereabouts({ dated: 0, waiting: 0, pastWeek: 0, monthList: 0, inbox: 0 })).toBe('')
  })
})

// The review and the Inbox read the same tasks through different doors:
// Today's review = carried over (computeTodayData) + needs attention; the
// Inbox's Expired = selectInboxExpired over the Inbox's own layer/person
// scope. The review's line may only send a row to Expired if Expired really
// lists it — run the real selectors, both ways, over one household.
describe('the review’s backlog against the Inbox’s Expired list', () => {
  const tasks: Task[] = [
    task({ id: 'yesterday', bucket: 'timed', scheduledFor: daysAgo(1) }),            // carried over
    task({ id: 'slipped', bucket: 'timed', scheduledFor: daysAgo(9) }),              // slipped
    task({ id: 'unsorted-slip', bucket: 'timed', scheduledFor: daysAgo(5), context: undefined }),
    task({ id: 'wait', bucket: 'timed', scheduledFor: daysAgo(4), isWaiting: true }), // follow-up past due
    task({ id: 'past-week', bucket: 'week', weekStart: new Date(2026, 8, 19), createdAt: daysAgo(20) }),
    task({ id: 'old-month', bucket: 'month', createdAt: daysAgo(60) }),
    task({ id: 'old-capture', bucket: 'inbox', createdAt: daysAgo(30) }),
    task({ id: 'done', bucket: 'timed', scheduledFor: daysAgo(3), completed: true, updatedAt: daysAgo(2) }),
  ]
  const layers = ALL_LAYERS
  const match = makeAssigneeFilter([])

  // As TodayView builds it (HomeView's layer filter, then computeTodayData).
  const todayTasks = filterTasksForLayers(tasks, layers)
  const carried = selectCarriedOver(todayTasks, true, match, NOW).filter((t) => !t.completed)
  const attention = selectNeedsAttention(todayTasks, match, NOW, WEEK_START)
  const rows = [
    ...carried.map((t) => ({ task: t, reason: 'carried' as const })),
    ...attention.filter((a) => !carried.some((t) => t.id === a.task.id)).map((a) => ({ task: a.task, reason: a.reason })),
  ]
  // As InboxView builds it.
  const expiredIds = new Set(selectInboxExpired(filterInboxTasksForLayers(tasks, layers).filter((t) => match(t.assignedTo, t.assignedToAll)), NOW).map((r) => r.task.id))

  it('every row the line sends to Expired is in Expired', () => {
    const sentToExpired = rows.filter((r) => (r.reason === 'carried' || r.reason === 'slipped') && !r.task.isWaiting)
    expect(sentToExpired.map((r) => r.task.id).sort()).toEqual(['slipped', 'unsorted-slip', 'yesterday'])
    for (const r of sentToExpired) expect(expiredIds.has(r.task.id)).toBe(true)
  })

  it('undated rows and waits are counted apart, because Expired does not list them', () => {
    for (const id of ['past-week', 'old-month', 'old-capture', 'wait']) expect(expiredIds.has(id)).toBe(false)
    const h = backlogHomes(rows)
    expect(h).toEqual({ dated: 3, waiting: 1, pastWeek: 1, monthList: 1, inbox: 1 })
    // The numbers the line prints add up to the rows the review holds.
    expect(h.dated + h.waiting + h.pastWeek + h.monthList + h.inbox).toBe(rows.length)
  })
})
