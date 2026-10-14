import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/types/task'
import { applyChangeSet, plannedWeekStart, type ApplyDeps } from './applyChangeSet'
import type { ChangeSet } from './changeCard'

const seen = '2026-10-14T07:00:00.123456+00:00'
const task = (id: string, x: Partial<Task> = {}) => ({ id, title: id, completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(Date.parse(seen)), bucket: 'week', ...x }) as Task
const set: ChangeSet = { key: 's', title: '3 changes', ops: [
  { key: 's:0', op: 'place', taskId: 'a', title: 'a', date: '2026-10-15', seen },
  { key: 's:1', op: 'someday', taskId: 'b', title: 'b', seen },
  { key: 's:2', op: 'add', title: 'Hold', date: '2026-10-14', time: '13:00' },
] }
const deps = (over: Partial<ApplyDeps> = {}): ApplyDeps => ({
  tasks: [task('a'), task('b')],
  updateTask: vi.fn(async () => true),
  addTask: vi.fn(async () => 'new1'),
  deleteTask: vi.fn(async () => {}),
  weekStart: new Date(2026, 9, 10),
  ...over,
})

describe('applyChangeSet', () => {
  it('applies every op in order and returns their ids', async () => {
    const d = deps()
    const r = await applyChangeSet(set, d)
    expect(r).toMatchObject({ ok: true, ids: ['a', 'b', 'new1'] })
    expect(d.updateTask).toHaveBeenNthCalledWith(1, 'a', { isAllDay: true, scheduledFor: new Date(2026, 9, 15), bucket: 'timed' })
    expect(d.updateTask).toHaveBeenNthCalledWith(2, 'b', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    expect(d.addTask).toHaveBeenCalledWith('Hold', new Date(2026, 9, 14, 13, 0), { isAllDay: false, bucket: 'timed' })
  })

  it('Undo reverses everything, newest first', async () => {
    const d = deps()
    const r = await applyChangeSet(set, d)
    if (!r.ok) throw new Error('expected ok')
    vi.mocked(d.updateTask).mockClear()
    expect(await r.undo()).toBe(true)
    expect(d.deleteTask).toHaveBeenCalledWith('new1')
    expect(vi.mocked(d.updateTask).mock.calls.map((c) => c[0])).toEqual(['b', 'a'])
    expect(d.updateTask).toHaveBeenCalledWith('b', { bucket: 'week', scheduledFor: undefined, isAllDay: undefined })
  })

  it('refuses the whole set, writing nothing, when a task moved since Symphony read it', async () => {
    const d = deps({ tasks: [task('a', { updatedAt: new Date(Date.parse(seen) + 60_000) }), task('b')] })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'stale', title: 'a' })
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('treats a task that has gone as stale', async () => {
    const d = deps({ tasks: [task('b')] })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'stale', title: 'a' })
  })

  it('a failure part way reverses what already saved', async () => {
    const updateTask = vi.fn(async (id: string) => id !== 'b')
    const d = deps({ updateTask })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed' })
    // a saved, b failed, so a is put back; the add never ran.
    expect(updateTask.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a'])
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('a thrown write is a failure too', async () => {
    const d = deps({ addTask: vi.fn(async () => { throw new Error('offline') }) })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed' })
    expect(vi.mocked(d.updateTask).mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'b', 'a'])
  })

  it('an add with no day lands on this week', async () => {
    const d = deps()
    await applyChangeSet({ key: 'x', title: '1 change', ops: [{ key: 'x:0', op: 'add', title: 'Call the bank', assignee: 'm1' }] }, d)
    expect(d.addTask).toHaveBeenCalledWith('Call the bank', undefined, { bucket: 'week', weekStart: new Date(2026, 9, 10), assignedTo: 'm1', assignedToAll: ['m1'] })
  })

  it('finds a step nested inside its parent (read_week lists steps as ordinary tasks)', async () => {
    const step = task('s1', { parentTaskId: 'p' })
    const parent = task('p', { subtasks: [step] })
    const d = deps({ tasks: [parent] })
    const r = await applyChangeSet({ key: 'n', title: '1 change', ops: [{ key: 'n:0', op: 'someday', taskId: 's1', title: 's1', seen }] }, d)
    expect(r).toMatchObject({ ok: true, ids: ['s1'] })
    expect(d.updateTask).toHaveBeenCalledWith('s1', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
  })

  it('an add with no day lands in the week being planned, not this one (final review #4)', async () => {
    const planned: ChangeSet = { key: 'w', title: '1 change', weekStart: '2026-10-17', ops: [{ key: 'w:0', op: 'add', title: 'Book the vet' }] }
    const now = new Date(2026, 9, 16, 18) // Friday, the Saturday week's last day
    const d = deps({ weekStart: plannedWeekStart(planned, now, 6) })
    await applyChangeSet(planned, d)
    expect(d.addTask).toHaveBeenCalledWith('Book the vet', undefined, { bucket: 'week', weekStart: new Date(2026, 9, 17) })
  })
})

describe('plannedWeekStart', () => {
  const now = new Date(2026, 9, 14, 9)
  it('is the set\'s week when it names one, anchored to the household\'s week start', () => {
    expect(plannedWeekStart({ key: 'k', title: 't', ops: [], weekStart: '2026-10-17' }, now, 6)).toEqual(new Date(2026, 9, 17))
    expect(plannedWeekStart({ key: 'k', title: 't', ops: [], weekStart: '2026-10-19' }, now, 6)).toEqual(new Date(2026, 9, 17))
  })
  it('is this week otherwise', () => {
    expect(plannedWeekStart({ key: 'k', title: 't', ops: [] }, now, 6)).toEqual(new Date(2026, 9, 10))
  })
})
