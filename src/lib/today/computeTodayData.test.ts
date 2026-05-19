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
