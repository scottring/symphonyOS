import { describe, it, expect } from 'vitest'
import { statusAfterLog, isAhead, mergeLog, rowLine } from './log'
import type { LogEntry, PlannedEvent } from '@/types/goalLog'

const goal = { kind: 'task', id: 'g1' } as const
const entry = (o: Partial<LogEntry>): LogEntry => ({
  id: 'e', userId: 'u1', goal, kind: 'call', on: '2026-10-22', summary: 's', createdAt: new Date(2026, 9, 22), ...o,
})
const plan = (o: Partial<PlannedEvent>): PlannedEvent => ({
  taskId: 't', kind: 'visit', title: 'Home visit: Walk through (Scher)', scheduledFor: new Date(2026, 9, 30, 10, 0),
  allDay: false, completed: false, ...o,
})
// Noon on Thu Oct 22, 2026, local.
const NOW = new Date(2026, 9, 22, 12, 0)

describe('statusAfterLog', () => {
  it('moves considering to contacted only for contact kinds', () => {
    expect(statusAfterLog('considering', 'call')).toBe('contacted')
    expect(statusAfterLog('considering', 'note')).toBeNull()
    expect(statusAfterLog('heard_back', 'visit')).toBeNull()
    expect(statusAfterLog('ruled_out', 'call')).toBeNull()
  })
})

describe('isAhead', () => {
  it('uses the local day', () => {
    const evening = new Date(2026, 9, 22, 23, 30)
    expect(isAhead('2026-10-23', evening)).toBe(true)
    expect(isAhead('2026-10-22', evening)).toBe(false)
  })
})

describe('mergeLog', () => {
  it('orders upcoming soonest first and done newest first, completed plans among entries', () => {
    const log = mergeLog(
      [entry({ id: 'a', on: '2026-10-20' }), entry({ id: 'b', on: '2026-10-22', time: '09:00' })],
      [
        plan({ taskId: 'p2', scheduledFor: new Date(2026, 10, 5, 9, 0) }),
        plan({ taskId: 'p1', scheduledFor: new Date(2026, 9, 30, 10, 0) }),
        plan({ taskId: 'p3', completed: true, completedAt: new Date(2026, 9, 21, 12, 0), title: 'Done thing' }),
      ],
      NOW,
    )
    expect(log.upcoming.map((l) => l.taskId)).toEqual(['p1', 'p2'])
    expect(log.done.map((l) => l.key)).toEqual(['e:b', 't:p3', 'e:a'])
    expect(log.done[1].text).toBe('Done thing')
  })
  it('breaks ties by newest created', () => {
    const log = mergeLog([
      entry({ id: 'old', createdAt: new Date(2026, 9, 1) }), entry({ id: 'new', createdAt: new Date(2026, 9, 2) }),
    ], [], NOW)
    expect(log.done.map((l) => l.entryId)).toEqual(['new', 'old'])
  })
  it('sets open plans whose day has passed apart, newest first; one later today is still coming up', () => {
    const log = mergeLog([], [
      plan({ taskId: 'old', scheduledFor: new Date(2026, 9, 15, 9, 0) }),
      plan({ taskId: 'recent', scheduledFor: new Date(2026, 9, 21, 16, 0) }),
      plan({ taskId: 'this-morning', scheduledFor: new Date(2026, 9, 22, 8, 0) }),
      plan({ taskId: 'ahead', scheduledFor: new Date(2026, 9, 30, 10, 0) }),
    ], NOW)
    expect(log.upcoming.map((l) => l.taskId)).toEqual(['this-morning', 'ahead'])
    expect(log.passed.map((l) => l.taskId)).toEqual(['recent', 'old'])
    expect(log.passed[0]).toMatchObject({ on: '2026-10-21', time: '16:00', upcoming: false, taskId: 'recent' })
    expect(log.done).toEqual([])
  })
  it('a completed plan keeps its scheduled time, on the day it was ticked done', () => {
    const log = mergeLog([], [
      plan({ taskId: 'ticked', scheduledFor: new Date(2026, 9, 20, 10, 0), completed: true, completedAt: new Date(2026, 9, 21, 15, 37) }),
      plan({ taskId: 'no-tick-time', scheduledFor: new Date(2026, 9, 19, 9, 30), completed: true }),
      plan({ taskId: 'all-day', scheduledFor: new Date(2026, 9, 18), allDay: true, completed: true, completedAt: new Date(2026, 9, 18, 20, 5) }),
    ], NOW)
    expect(log.done.map((l) => [l.taskId, l.on, l.time])).toEqual([
      ['ticked', '2026-10-21', '10:00'],
      ['no-tick-time', '2026-10-19', '09:30'],
      ['all-day', '2026-10-18', undefined],
    ])
  })
})

describe('rowLine', () => {
  const visit = plan({ optionId: 'o1' })
  it('gives next and last', () => {
    const log = mergeLog([entry({ optionId: 'o1', summary: 'Quote in a week' })], [visit], NOW)
    expect(rowLine(log, 'o1')).toEqual({ next: 'Home visit Fri Oct 30, 10:00', last: 'Phone call Oct 22' })
  })
  it('adds the summary to last when nothing is ahead', () => {
    const log = mergeLog([entry({ optionId: 'o1', summary: 'Quote in a week' })], [], NOW)
    expect(rowLine(log, 'o1')).toEqual({ last: 'Phone call Oct 22 · “Quote in a week”' })
  })
  it('next ignores a plan whose day has passed', () => {
    const late = plan({ optionId: 'o1', scheduledFor: new Date(2026, 9, 20, 10, 0) })
    const log = mergeLog([entry({ optionId: 'o1', summary: 'Quote in a week' })], [late], NOW)
    expect(rowLine(log, 'o1')).toEqual({ last: 'Phone call Oct 22 · “Quote in a week”' })
  })
  it('is null with nothing', () => {
    expect(rowLine(mergeLog([entry({ optionId: 'o1' })], [], NOW), 'o2')).toBeNull()
  })
})
