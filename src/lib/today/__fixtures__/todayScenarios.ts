// src/lib/today/__fixtures__/todayScenarios.ts
import type { Task } from '@/types/task'
import type { TodayDataInput } from '../types'
import type { DaySection } from '@/lib/timeUtils'

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
function at(h: number, m = 0) { const d = new Date(TODAY); d.setHours(h, m, 0, 0); return d }
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null,
    assignedTo: null, updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

/** Mixed realistic day. */
export const mixedDayInput: TodayDataInput = {
  tasks: [
    task({ id: 'm1', title: 'Hang up hooks', scheduledFor: at(8) }),
    task({ id: 'a1', title: 'Cut the rugs', scheduledFor: at(14) }),
    task({ id: 'e1', title: 'Storm vs Blue', scheduledFor: at(19) }),
    task({ id: 'w1', title: 'Finish vital docs', bucket: 'week' }),
    task({ id: 'i1', title: 'Brain dump', bucket: 'inbox' }),
    task({ id: 'o1', title: 'Old overdue', scheduledFor: new Date(TODAY.getTime() - 3 * 864e5) }),
    task({ id: 'o2', title: 'Done today overdue', scheduledFor: new Date(TODAY.getTime() - 2 * 864e5),
      completed: true, updatedAt: new Date() }),
  ],
  events: [], routines: [], dateInstances: [],
  viewedDate: new Date(), selectedAssignee: null, hideRoutines: false,
}

/**
 * Expected, derived by hand from the legacy algorithm — with ONE deliberate
 * divergence, recorded rather than smoothed over.
 *
 * Legacy put every past-dated task in `overdueTasks`. A date now expires after
 * GRACE_DAYS (2), so `o1` at 3 days old is slipped: it leaves Today entirely
 * and belongs to the review queue. `o2` at 2 days old is still carried over.
 * The counts below drop by one incomplete overdue for the same reason.
 */
export const mixedDayExpected = {
  isToday: true,
  // Every section, so the parity sweep below can iterate SECTIONS_ORDER and
  // actually assert that earlyMorning/night stay empty rather than skipping
  // them entirely.
  groupedTitles: {
    allday: [] as string[],
    earlyMorning: [] as string[],
    morning: ['Hang up hooks'],
    afternoon: ['Cut the rugs'],
    evening: ['Storm vs Blue'],
    night: [] as string[],
    unscheduled: [] as string[],
  } satisfies Record<DaySection, string[]>,
  weekIds: ['w1'],
  inboxIds: ['i1'],
  overdueIds: ['o2'],
  slippedIds: ['o1'],
  counts: {
    actionableCount: 3 + 0 + 0 + 1,
    completedCount: 0 + 0 + 1,
    incompleteOverdue: 0,
  },
}
