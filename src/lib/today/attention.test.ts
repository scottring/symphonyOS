import { describe, it, expect } from 'vitest'
import {
  selectNeedsAttention, reviewDestination, AGING_INBOX_DAYS, AGING_MONTH_DAYS,
  type AttentionItem, type AttentionReason,
} from './attention'
import type { Task } from '@/types/task'

const NOW = new Date('2026-08-04T12:00:00')
const WEEK_START = new Date('2026-08-02T00:00:00')

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'inbox',
    scheduledFor: null, assignedTo: null,
    createdAt: new Date('2026-08-04T00:00:00'),
    updatedAt: new Date('2026-08-04T00:00:00'),
    subtasks: undefined,
    ...p,
  } as Task
}
const all = () => true

describe('selectNeedsAttention', () => {
  it('flags a dated task past the grace window as slipped', () => {
    const t = task({ id: 's1', bucket: 'timed', scheduledFor: new Date('2026-07-28T09:00:00') })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['s1', 'slipped']])
  })

  it('does NOT flag a dated task inside the grace window', () => {
    const t = task({ id: 'c1', bucket: 'timed', scheduledFor: new Date('2026-08-03T09:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  // The podiatrist. bucket='week', week_start = the week of 2026-07-26, viewed
  // on 2026-08-04 — the exact row that was believed lost.
  it('flags a week placement left behind on a past week', () => {
    const t = task({ id: 'w1', bucket: 'week', weekStart: new Date('2026-07-26T00:00:00') })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['w1', 'stranded-week']])
  })

  it('does NOT flag a week placement on the current week', () => {
    const t = task({ id: 'w2', bucket: 'week', weekStart: new Date('2026-08-02T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('does NOT flag a week placement with no week (legacy = current week)', () => {
    const t = task({ id: 'w3', bucket: 'week', weekStart: undefined })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('does NOT flag a week placement on a FUTURE week', () => {
    const t = task({ id: 'w4', bucket: 'week', weekStart: new Date('2026-08-09T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('flags an inbox task older than the threshold, and reports its age', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - (AGING_INBOX_DAYS + 1))
    const t = task({ id: 'i1', bucket: 'inbox', createdAt: created })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['i1', 'aging-inbox']])
    expect(got[0].ageDays).toBe(AGING_INBOX_DAYS + 1)
  })

  it('does NOT flag an inbox task exactly at the threshold', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - AGING_INBOX_DAYS)
    const t = task({ id: 'i2', bucket: 'inbox', createdAt: created })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('flags a month task older than the month threshold', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - (AGING_MONTH_DAYS + 1))
    const t = task({ id: 'm1', bucket: 'month', createdAt: created })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['m1', 'aging-month']])
  })

  it('never flags a someday task, however old', () => {
    const created = new Date('2024-01-01T00:00:00')
    const t = task({ id: 'sd1', bucket: 'someday', createdAt: created })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('never flags a completed task', () => {
    const t = task({ id: 'd1', bucket: 'week', completed: true, weekStart: new Date('2026-07-26T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('respects the assignee match', () => {
    const t = task({ id: 'x1', bucket: 'week', assignedTo: 'someone-else', weekStart: new Date('2026-07-26T00:00:00') })
    const none = () => false
    expect(selectNeedsAttention([t], none, NOW, WEEK_START)).toEqual([])
  })

  it('reports each task at most once', () => {
    const t = task({ id: 'once', bucket: 'week', weekStart: new Date('2026-07-26T00:00:00') })
    expect(selectNeedsAttention([t, t], all, NOW, WEEK_START).filter(i => i.task.id === 'once')).toHaveLength(1)
  })
})

// Review used to navigate to /week unconditionally, on the reasoning that the
// week's planning shelf already draws carried-over work. Nothing on /week reads
// this set though — it computes its own from THIS week's week_start — so a
// count built from aging inbox capture sent you to a page reading "Everything
// is placed on a day." Told six things were wrong, shown a page saying nothing
// was.
describe('reviewDestination', () => {
  const item = (reason: AttentionReason, ageDays: number): AttentionItem =>
    ({ task: task({ id: `${reason}-${ageDays}` }), reason, ageDays })

  it('sends aging inbox capture to the inbox, not the week', () => {
    expect(reviewDestination([item('aging-inbox', 83)])).toBe('/inbox')
  })

  it('sends an aging month item to the month', () => {
    expect(reviewDestination([item('aging-month', 60)])).toBe('/month')
  })

  it('still sends week-anchored reasons to the week', () => {
    expect(reviewDestination([item('stranded-week', 12)])).toBe('/week')
    expect(reviewDestination([item('slipped', 9)])).toBe('/week')
  })

  it('routes a mixed set to where the most work is', () => {
    const items = [
      item('aging-inbox', 5), item('aging-inbox', 6), item('aging-inbox', 7),
      item('stranded-week', 40),
    ]
    expect(reviewDestination(items)).toBe('/inbox')
  })

  it('breaks a tie toward the group holding the oldest item', () => {
    // The line advertises "oldest N days", so that item must be somewhere the
    // destination actually shows it.
    expect(reviewDestination([item('aging-inbox', 10), item('aging-month', 200)])).toBe('/month')
  })

  it('falls back to the week when there is nothing to review', () => {
    expect(reviewDestination([])).toBe('/week')
  })
})
