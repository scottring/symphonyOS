import { describe, it, expect } from 'vitest'
import { computeTodayData } from './computeTodayData'
import type { TodayDataInput } from './types'
import type { Task } from '@/types/task'

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

describe('computeTodayData', () => {
  it('empty input → zeroed counts, empty sections, sectionsOrder set', () => {
    const d = computeTodayData(baseInput())
    expect(d.counts).toEqual({ completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 })
    expect(d.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
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

  it('week + inbox pools populate only when isToday', () => {
    const now = new Date()
    const w = task({ id: 'w', bucket: 'week' })
    const i = task({ id: 'i', bucket: 'inbox' })
    const today = computeTodayData(baseInput({ tasks: [w, i], viewedDate: now }))
    expect(today.weekTasks.map(t => t.id)).toEqual(['w'])
    expect(today.inboxTasks.map(t => t.id)).toEqual(['i'])
    const past = computeTodayData(baseInput({ tasks: [w, i], viewedDate: new Date('2020-01-01') }))
    expect(past.weekTasks).toEqual([])
    expect(past.inboxTasks).toEqual([])
  })
})
