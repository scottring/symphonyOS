import { describe, it, expect } from 'vitest'
import { linkedLine, didFor, monthLinkRestore, monthLinkUpdates } from './monthLinks'
import type { Task } from '@/types/task'

const task = (o: Partial<Task>) => ({ completed: false, createdAt: new Date(2026, 8, 1), ...o }) as Task
const WEEK = new Date(2026, 9, 3)
const porch = task({ id: 'm1', title: 'fix up the porch', bucket: 'month', monthStart: new Date(2026, 9, 1) })

// Scott, 2026-10-04: a week item may say which October line it's for; the
// October line shows what the weeks have done for it. One direction, optional.
describe('monthLinks', () => {
  it('a week item names the month line it was written for — never itself', () => {
    const coat = task({ id: 'w1', title: 'Porch — second coat', bucket: 'week', weekStart: WEEK, sourceId: 'm1' })
    const same = task({ id: 'm2', title: 'Plan Thanksgiving', bucket: 'week', weekStart: WEEK, monthStart: new Date(2026, 9, 1) })
    const all = [porch, coat, same]
    expect(linkedLine(coat, all)?.title).toBe('fix up the porch')
    expect(linkedLine(same, all)).toBeNull()
    expect(linkedLine(task({ id: 'x', sourceId: 'gone' }), all)).toBeNull()
  })

  it('a month line lists what the weeks did for it, done ones marked, with when', () => {
    const first = task({ id: 'w0', title: 'Porch — first coat', completed: true, scheduledFor: new Date(2026, 9, 3), isAllDay: true, sourceId: 'm1' })
    const second = task({ id: 'w1', title: 'Porch — second coat', scheduledFor: new Date(2026, 9, 4), isAllDay: true, sourceId: 'm1' })
    const anyDay = task({ id: 'w2', title: 'Buy paint', bucket: 'week', weekStart: WEEK, goalTaskId: 'm1' })
    const did = didFor('m1', [porch, first, second, anyDay], WEEK)
    expect(did.map((d) => [d.title, d.done, d.when])).toEqual([
      ['Porch — first coat', true, 'Sat'],
      ['Porch — second coat', false, 'Sun'],
      ['Buy paint', false, 'this week'],
    ])
  })
})

describe('writtenFor', () => {
  it('groups what the level below wrote for a line, by its own period', async () => {
    const { writtenFor } = await import('./monthLinks')
    const tasks = [
      task({ id: 'a', title: 'Make a budget', monthStart: new Date(2026, 9, 1), sourceId: 'fall1' }),
      task({ id: 'b', title: 'Open a savings account', monthStart: new Date(2026, 10, 1), supportsGoalTaskId: 'fall1' }),
      task({ id: 'c', title: 'Unrelated', monthStart: new Date(2026, 9, 1) }),
    ]
    const groups = writtenFor('fall1', tasks, (t) => t.monthStart!.toLocaleDateString('en-US', { month: 'short' }))
    expect(groups).toEqual([
      { label: 'Oct', items: [{ id: 'a', title: 'Make a budget', done: false }] },
      { label: 'Nov', items: [{ id: 'b', title: 'Open a savings account', done: false }] },
    ])
  })
})

// Walkthrough 2026-10-08: changing an existing week item's month line.
const t = (o: Partial<Task>) => ({ id: 'w', title: 'Week item', completed: false, createdAt: new Date(), ...o }) as Task

describe('monthLinkUpdates — the link shown is the link changed', () => {
  it('sets or changes the link through source_id only', () => {
    expect(monthLinkUpdates(t({}), 'm1')).toEqual({ updates: { sourceId: 'm1' }, revealed: null })
    expect(monthLinkUpdates(t({ sourceId: 'm1', goalTaskId: 'g' }), 'm2')).toEqual({ updates: { sourceId: 'm2' }, revealed: null })
  })
  it('removes a source_id link and leaves a separate goal relation alone, naming it', () => {
    expect(monthLinkUpdates(t({ sourceId: 'm1' }), null)).toEqual({ updates: { sourceId: undefined }, revealed: null })
    expect(monthLinkUpdates(t({ sourceId: 'm1', goalTaskId: 'g' }), null)).toEqual({ updates: { sourceId: undefined }, revealed: 'g' })
  })
  it('both fields naming the same line are one link: Remove clears both, so it is really gone', () => {
    const row = t({ sourceId: 'm1', goalTaskId: 'm1' })
    const { updates, revealed } = monthLinkUpdates(row, null)
    expect(updates).toEqual({ sourceId: undefined, goalTaskId: undefined })
    expect(revealed).toBeNull()
    expect(linkedLine({ ...row, ...updates }, [t({ id: 'm1' })])).toBeNull()
    expect(monthLinkRestore(row, updates)).toEqual({ sourceId: 'm1', goalTaskId: 'm1' })
  })
  it('removes an older row’s goal_task_id link wherever its line lives', () => {
    const row = t({ goalTaskId: 'sept-line' })
    const { updates } = monthLinkUpdates(row, null)
    expect(updates).toEqual({ goalTaskId: undefined })
    expect(linkedLine({ ...row, ...updates }, [t({ id: 'sept-line' })])).toBeNull()
  })
  it('a row linked to itself or to nothing writes nothing', () => {
    expect(monthLinkUpdates(t({}), null).updates).toEqual({})
    expect(monthLinkUpdates(t({ sourceId: 'w' }), null).updates).toEqual({})
  })
  it('undo writes back exactly the fields it wrote', () => {
    const row = t({ sourceId: 'm1', goalTaskId: 'g' })
    expect(monthLinkRestore(row, { sourceId: 'm2' })).toEqual({ sourceId: 'm1' })
    expect(monthLinkRestore(t({ goalTaskId: 'old' }), { goalTaskId: undefined })).toEqual({ goalTaskId: 'old' })
  })
})
