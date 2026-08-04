import { describe, it, expect } from 'vitest'
import { computeTodayData } from './computeTodayData'
import type { TodayDataInput } from './types'
import type { Task } from '@/types/task'
import type { ActionableInstance, ActionableStatus, Routine } from '@/types/actionable'

function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date('2026-05-19T12:00:00'), subtasks: undefined, ...p } as Task
}
function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  return {
    tasks: [], events: [], routines: [], dateInstances: [],
    viewedDate: new Date('2026-05-19T00:00:00'),
    selectedAssignee: null, hideRoutines: false, ...over,
  }
}

describe('computeTodayData grace window', () => {
  // computeTodayData takes no `now` — it derives isToday from a live
  // new Date(), and selectOverdue defaults the same way. A fixed past
  // viewedDate would make isToday false and the overdue pool empty, so these
  // use dates relative to now.
  function daysAgo(n: number): Date {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    d.setDate(d.getDate() - n)
    return d
  }

  it('overdueTasks is carried-over only; slippedTasks is the rest', () => {
    const carried = task({ id: 'c', bucket: 'timed', scheduledFor: daysAgo(1) })
    const slipped = task({ id: 's', bucket: 'timed', scheduledFor: daysAgo(200) })
    const d = computeTodayData(baseInput({ tasks: [carried, slipped], viewedDate: new Date() }))
    expect(d.overdueTasks.map(t => t.id)).toEqual(['c'])
    expect(d.slippedTasks.map(t => t.id)).toEqual(['s'])
  })

  it('counts describe the visible page, not the slipped queue', () => {
    const carried = task({ id: 'c', bucket: 'timed', scheduledFor: daysAgo(1) })
    const slipped = task({ id: 's', bucket: 'timed', scheduledFor: daysAgo(200) })
    const d = computeTodayData(baseInput({ tasks: [carried, slipped], viewedDate: new Date() }))
    expect(d.counts.incompleteOverdue).toBe(1)
  })
})

describe('computeTodayData', () => {
  it('empty input → zeroed counts, empty sections, sectionsOrder set', () => {
    const d = computeTodayData(baseInput())
    expect(d.counts).toEqual({ completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 })
    expect(d.sectionsOrder).toEqual(['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled'])
    expect(d.grouped.morning).toEqual([])
  })
  it('isToday true when viewedDate is today', () => {
    const now = new Date()
    const d = computeTodayData(baseInput({ viewedDate: now, tasks: [] }))
    expect(d.isToday).toBe(true)
  })
  it('actionableCount = timed + visibleRoutines + overdue; progressPercent computed', () => {
    const now = new Date()
    const t1 = task({ id: 'a', bucket: 'timed', scheduledFor: now, completed: true })
    const t2 = task({ id: 'b', bucket: 'timed', scheduledFor: now, completed: false })
    const d = computeTodayData(baseInput({ tasks: [t1, t2], viewedDate: now }))
    expect(d.counts.actionableCount).toBe(2)
    expect(d.counts.completedCount).toBe(1)
    expect(d.counts.progressPercent).toBeCloseTo(50)
  })
  it('completedLingerCutoff hides completed tasks older than the cutoff but keeps counts', () => {
    const now = new Date()
    const old = new Date(now.getTime() - 120_000) // checked off 2 min ago
    const done = task({ id: 'd', bucket: 'timed', scheduledFor: now, completed: true, updatedAt: old })
    const open = task({ id: 'o', bucket: 'timed', scheduledFor: now, completed: false })

    // No cutoff (desktop default): both render.
    const all = computeTodayData(baseInput({ tasks: [done, open], viewedDate: now }))
    expect(Object.values(all.grouped).flat().length).toBe(2)

    // Cutoff at now-60s: the 2-min-old completed task drops out of the display.
    const filtered = computeTodayData(baseInput({
      tasks: [done, open], viewedDate: now, completedLingerCutoff: now.getTime() - 60_000,
    }))
    const ids = Object.values(filtered.grouped).flat().map((i) => i.id)
    expect(ids).toContain('task-o')
    expect(ids).not.toContain('task-d')
    // Counts use the full pool, so the completed task is still tallied.
    expect(filtered.counts.completedCount).toBe(1)
  })

  it('completedLingerCutoff keeps a just-completed task visible during the linger window', () => {
    const now = new Date()
    const done = task({ id: 'd', bucket: 'timed', scheduledFor: now, completed: true, updatedAt: now })
    const filtered = computeTodayData(baseInput({
      tasks: [done], viewedDate: now, completedLingerCutoff: now.getTime() - 60_000,
    }))
    const ids = Object.values(filtered.grouped).flat().map((i) => i.id)
    expect(ids).toContain('task-d')
  })

  it('selectedAssignee matches a timed task via assignedToAll (multi-member)', () => {
    const now = new Date()
    const shared = task({
      id: 's', bucket: 'timed', scheduledFor: now,
      assignedTo: 'scott', assignedToAll: ['scott', 'iris'],
    })
    // Filtering by Iris must surface a task she shares via assignedToAll, even
    // though the legacy single assignedTo is Scott.
    const d = computeTodayData(baseInput({ tasks: [shared], viewedDate: now, selectedAssignee: 'iris' }))
    const ids = Object.values(d.grouped).flat().map((i) => i.id)
    expect(ids).toContain('task-s')
  })

  it('dedupes the same meeting surfaced by two calendars with different timezone strings', () => {
    // Real-world case: an Outlook invite lands on the primary calendar
    // (offset form) AND a G Suite group calendar (UTC form). Same instant,
    // different start_time strings — both must not render.
    const e1 = {
      id: 'evt-primary', title: 'HOLD - PeerAspect Meeting',
      start_time: '2026-05-19T09:00:00-04:00', end_time: '2026-05-19T09:30:00-04:00',
      calendar_id: 'scott@work',
    }
    const e2 = {
      id: 'evt-gsuite', title: 'HOLD - PeerAspect Meeting',
      start_time: '2026-05-19T13:00:00Z', end_time: '2026-05-19T13:30:00Z',
      calendar_id: 'abc@group.calendar.google.com',
    }
    const d = computeTodayData(baseInput({ viewedDate: new Date('2026-05-19T12:00:00-04:00'), events: [e1, e2] }))
    const eventItems = Object.values(d.grouped).flat().filter((i) => i.type === 'event')
    expect(eventItems).toHaveLength(1)
  })

  it('keeps two events that share a title but start at different times', () => {
    const e1 = {
      id: 'evt-1', title: 'Standup',
      start_time: '2026-05-19T09:00:00-04:00', end_time: '2026-05-19T09:15:00-04:00',
    }
    const e2 = {
      id: 'evt-2', title: 'Standup',
      start_time: '2026-05-19T16:00:00-04:00', end_time: '2026-05-19T16:15:00-04:00',
    }
    const d = computeTodayData(baseInput({ viewedDate: new Date('2026-05-19T12:00:00-04:00'), events: [e1, e2] }))
    const eventItems = Object.values(d.grouped).flat().filter((i) => i.type === 'event')
    expect(eventItems).toHaveLength(2)
  })

})

// ── Progress counts must describe the timeline the user is actually looking at ──
// The Today header ("N of M done") is the day's scoreboard. Its M has to be the
// number of actionable ROWS on screen; anything else makes the bar unreachable
// and unresponsive. These lock the count population to the render population.
describe('computeTodayData — progress counts match the rendered timeline', () => {
  const NOW = new Date()

  function routine(p: Partial<Routine>): Routine {
    return {
      id: 'r', user_id: 'u', name: 'R', description: null, default_assignee: null,
      assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null,
      recurrence_pattern: { type: 'daily' }, time_of_day: null, times_per_day: null,
      raw_input: null, show_on_timeline: true, parent_routine_id: null, step_order: null,
      created_at: '', updated_at: '', ...p,
    } as unknown as Routine
  }
  function instance(entityId: string, status: ActionableStatus): ActionableInstance {
    return {
      id: `i-${entityId}`, user_id: 'u', entity_type: 'routine', entity_id: entityId,
      date: '', status, assignee: null, assigned_to_override: null, deferred_to: null,
      completed_at: null, skipped_at: null, created_at: '', updated_at: '',
    }
  }
  /** Rows the timeline actually renders, excluding events (not actionable). */
  function renderedActionableRows(d: ReturnType<typeof computeTodayData>) {
    return Object.values(d.grouped).flat().filter((i) => i.type !== 'event')
  }

  it('a collection counts as the one row it renders, not parent + every step', () => {
    const parent = routine({ id: 'p', name: 'Morning reset' })
    const steps = [
      routine({ id: 's1', name: 'Unload dishwasher', parent_routine_id: 'p', step_order: 0 }),
      routine({ id: 's2', name: 'Pack lunches', parent_routine_id: 'p', step_order: 1 }),
    ]
    const d = computeTodayData(baseInput({ viewedDate: NOW, routines: [parent, ...steps] }))
    expect(renderedActionableRows(d)).toHaveLength(1)
    expect(d.counts.actionableCount).toBe(1)
  })

  it('a collection reads as done once every step is done (the bar can reach 100%)', () => {
    const parent = routine({ id: 'p', name: 'Morning reset' })
    const steps = [
      routine({ id: 's1', name: 'Unload dishwasher', parent_routine_id: 'p', step_order: 0 }),
      routine({ id: 's2', name: 'Pack lunches', parent_routine_id: 'p', step_order: 1 }),
    ]
    const d = computeTodayData(baseInput({
      viewedDate: NOW, routines: [parent, ...steps],
      dateInstances: [instance('s1', 'completed'), instance('s2', 'completed')],
    }))
    expect(d.counts.completedCount).toBe(1)
    expect(d.counts.actionableCount).toBe(1)
    expect(d.counts.progressPercent).toBe(100)
  })

  it('an orphan step — parent not on today — is rendered nowhere, so it is not counted', () => {
    // Steps carry their own daily recurrence, so a weekday collection's steps
    // still arrive on a Sunday even though the parent does not. Grouping drops
    // them; the count must too.
    const orphan = routine({ id: 's1', name: 'Camp dropoff', parent_routine_id: 'missing-parent' })
    const d = computeTodayData(baseInput({ viewedDate: NOW, routines: [orphan] }))
    expect(renderedActionableRows(d)).toHaveLength(0)
    expect(d.counts.actionableCount).toBe(0)
  })

  it('a dosed routine counts once per dose, matching its rows', () => {
    const dosed = routine({ id: 'd1', name: 'PT Exercises', times_per_day: ['07:00', '19:00'] })
    const d = computeTodayData(baseInput({ viewedDate: NOW, routines: [dosed] }))
    expect(renderedActionableRows(d)).toHaveLength(2)
    expect(d.counts.actionableCount).toBe(2)
  })

  it('completing a dose moves the count — the instance is keyed `id#slot`', () => {
    const dosed = routine({ id: 'd1', name: 'PT Exercises', times_per_day: ['07:00', '19:00'] })
    const d = computeTodayData(baseInput({
      viewedDate: NOW, routines: [dosed], dateInstances: [instance('d1#0', 'completed')],
    }))
    expect(d.counts.completedCount).toBe(1)
    expect(d.counts.actionableCount).toBe(2)
  })

  it('a routine the assignee filter hides is not counted', () => {
    const mine = routine({ id: 'r1', name: 'Mine', assigned_to: 'me' })
    const theirs = routine({ id: 'r2', name: 'Theirs', assigned_to: 'someone-else' })
    const d = computeTodayData(baseInput({
      viewedDate: NOW, routines: [mine, theirs], selectedAssignee: ['me'],
    }))
    expect(renderedActionableRows(d)).toHaveLength(1)
    expect(d.counts.actionableCount).toBe(1)
  })

  it('a skipped routine leaves the pool — skipping is how work comes off the day', () => {
    const a = routine({ id: 'r1', name: 'Iris weekend workout' })
    const b = routine({ id: 'r2', name: 'Food prep' })
    const d = computeTodayData(baseInput({
      viewedDate: NOW, routines: [a, b], dateInstances: [instance('r1', 'skipped')],
    }))
    expect(d.counts.actionableCount).toBe(1)
    expect(d.counts.completedCount).toBe(0)
  })

  it('carried-over tasks stay in the denominator and move the numerator when done', () => {
    // Both fixtures must sit INSIDE the grace window — past it they are
    // slipped, which is a different pool and deliberately not counted here.
    const open = task({ id: 'o1', scheduledFor: new Date(NOW.getTime() - 1 * 864e5) })
    const done = task({ id: 'o2', scheduledFor: new Date(NOW.getTime() - 2 * 864e5), completed: true, updatedAt: NOW })
    const d = computeTodayData(baseInput({ viewedDate: NOW, tasks: [open, done] }))
    expect(d.counts.actionableCount).toBe(2)
    expect(d.counts.completedCount).toBe(1)
  })
})

describe('computeTodayData — Today is a commitment surface', () => {
  it('no longer returns the inbox, week, or month pools', () => {
    const data = computeTodayData(baseInput())
    expect('inboxTasks' in data).toBe(false)
    expect('weekTasks' in data).toBe(false)
    expect('monthTasks' in data).toBe(false)
  })

  it('returns the attention set instead', () => {
    const data = computeTodayData(baseInput())
    expect(Array.isArray(data.attentionItems)).toBe(true)
  })

  it('totalItems does not count backlog — a day with only inbox items is clear', () => {
    const input = baseInput()
    input.tasks = [
      { id: 'i1', title: 'old capture', completed: false, bucket: 'inbox',
        scheduledFor: null, assignedTo: null,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') } as Task,
    ]
    expect(computeTodayData(input).counts.totalItems).toBe(0)
  })
})
