import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
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
  completeTask: vi.fn(async () => true),
  reopenTask: vi.fn(async () => true),
  routines: [routine('r1'), routine('r2')],
  updateRoutine: vi.fn(async () => true),
  addRoutine: vi.fn(async () => 'rnew'),
  deleteRoutine: vi.fn(async () => true),
  skipOccurrence: vi.fn(async () => true),
  undoSkip: vi.fn(async () => true),
  moveOccurrence: vi.fn(async () => moved),
  undoMove: vi.fn(async () => true),
  setOccurrenceAssignee: vi.fn(async () => ({ instanceId: 'i1', previous: 'm-old' })),
  ...over,
})
const moved = { instanceId: 'i9', previousStatus: 'pending' as const, previousDeferredTo: null, previousPlannedOn: null }
function routine(id: string, x: Partial<Routine> = {}): Routine {
  return {
    id, name: id, user_id: 'u', description: null, default_assignee: null, assigned_to: 'm1', assigned_to_all: ['m1'],
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'weekly', days: ['mon'], interval: 2, start_date: '2026-01-05' },
    time_of_day: '07:00:00', raw_input: null, show_on_timeline: true, scope: 'couple', created_at: seen, updated_at: seen, ...x,
  } as Routine
}

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

describe('applyChangeSet: done, merge and routine ops (stage 3)', () => {
  const one = (op: ChangeSet['ops'][number]): ChangeSet => ({ key: 'k', title: '1 change', ops: [op] })
  const applyOk = async (s: ChangeSet, d: ApplyDeps) => {
    const r = await applyChangeSet(s, d)
    if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
    return r
  }

  it('a page with only the task writers (the wall) refuses a routine set, writing nothing', async () => {
    const d = deps()
    const { skipOccurrence, undoSkip, routines, ...taskOnly } = d
    void skipOccurrence; void undoSkip; void routines
    const r = await applyChangeSet({ key: 'k', title: '2 changes', ops: [
      { key: 'k:0', op: 'place', taskId: 'a', title: 'a', date: '2026-10-15', seen },
      { key: 'k:1', op: 'routine_skip', routineId: 'r1', title: 'Bedtime', date: '2026-10-16' },
    ] }, taskOnly)
    expect(r).toEqual({ ok: false, reason: 'failed' })
    expect(d.updateTask).not.toHaveBeenCalled()
  })

  it('done completes the task; Undo reopens it', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'done', taskId: 'a', title: 'a', seen }), d)
    expect(d.completeTask).toHaveBeenCalledWith('a')
    expect(r.ids).toEqual(['a'])
    expect(await r.undo()).toBe(true)
    expect(d.reopenTask).toHaveBeenCalledWith('a')
  })

  it('done on a task already done writes nothing and Undo leaves it done', async () => {
    const d = deps({ tasks: [task('a', { completed: true })] })
    const r = await applyOk(one({ key: 'k:0', op: 'done', taskId: 'a', title: 'a', seen }), d)
    await r.undo()
    expect(d.completeTask).not.toHaveBeenCalled()
    expect(d.reopenTask).not.toHaveBeenCalled()
  })

  it('merge keeps one task with both notes and links, closes the other; Undo puts both back', async () => {
    const kept = task('keep', { title: 'Call Molly', notes: 'Her number', links: [{ url: 'https://a' }] })
    const dup = task('dup', { title: 'Call Molly about the Buick', notes: 'Ask about the brakes', links: [{ url: 'https://a' }, { url: 'https://b' }] })
    const d = deps({ tasks: [kept, dup] })
    const r = await applyOk(one({ key: 'k:0', op: 'merge', taskId: 'keep', title: 'Call Molly', seen, fromTaskId: 'dup', fromTitle: 'Call Molly about the Buick', fromSeen: seen }), d)
    expect(d.updateTask).toHaveBeenNthCalledWith(1, 'keep', { notes: 'Her number\n\nAsk about the brakes', links: [{ url: 'https://a' }, { url: 'https://b' }] })
    expect(d.updateTask).toHaveBeenNthCalledWith(2, 'dup', { notes: 'Ask about the brakes\n\nMerged into “Call Molly”.' })
    expect(d.completeTask).toHaveBeenCalledWith('dup')
    expect(d.deleteTask).not.toHaveBeenCalled()

    vi.mocked(d.updateTask).mockClear()
    expect(await r.undo()).toBe(true)
    expect(d.reopenTask).toHaveBeenCalledWith('dup')
    expect(vi.mocked(d.updateTask).mock.calls).toEqual([
      ['dup', { notes: 'Ask about the brakes' }],
      ['keep', { notes: 'Her number', links: [{ url: 'https://a' }] }],
    ])
  })

  it('merge with nothing to carry over only closes the duplicate', async () => {
    const d = deps({ tasks: [task('keep', { title: 'Call Molly' }), task('dup')] })
    await applyOk(one({ key: 'k:0', op: 'merge', taskId: 'keep', title: 'Call Molly', fromTaskId: 'dup' }), d)
    expect(d.updateTask).toHaveBeenCalledTimes(1)
    expect(d.updateTask).toHaveBeenCalledWith('dup', { notes: 'Merged into “Call Molly”.' })
  })

  it('talk puts the task on the talk-about list; Undo restores it', async () => {
    const d = deps({ tasks: [task('a', { needsDiscussion: false })] })
    const r = await applyOk(one({ key: 'k:0', op: 'talk', taskId: 'a', title: 'a', note: 'with Iris', seen }), d)
    expect(d.updateTask).toHaveBeenCalledWith('a', { needsDiscussion: true, discussionNote: 'with Iris' })
    await r.undo()
    expect(d.updateTask).toHaveBeenLastCalledWith('a', { needsDiscussion: false, discussionNote: undefined })
  })

  it('routine_skip skips that one day; Undo un-skips it', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_skip', routineId: 'r1', title: 'Bedtime', date: '2026-10-16' }), d)
    expect(d.skipOccurrence).toHaveBeenCalledWith('r1', new Date(2026, 9, 16))
    expect(r.ids).toEqual(['r1'])
    await r.undo()
    expect(d.undoSkip).toHaveBeenCalledWith('r1', new Date(2026, 9, 16))
  })

  it('routine_move moves one occurrence day-only, or to a time; Undo puts it back', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_move', routineId: 'r1', title: 'Haircut', date: '2026-10-15', toDate: '2026-10-16' }), d)
    expect(d.moveOccurrence).toHaveBeenCalledWith('r1', new Date(2026, 9, 15), new Date(2026, 9, 16), { dayOnly: true })
    await r.undo()
    expect(d.undoMove).toHaveBeenCalledWith(moved)

    const d2 = deps()
    await applyOk(one({ key: 'k:0', op: 'routine_move', routineId: 'r1', title: 'Haircut', date: '2026-10-15', toDate: '2026-10-16', time: '15:30' }), d2)
    expect(d2.moveOccurrence).toHaveBeenCalledWith('r1', new Date(2026, 9, 15), new Date(2026, 9, 16, 15, 30), { dayOnly: false })
  })

  it('routine_who sets that day\'s person; Undo restores the one before', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_who', routineId: 'r1', title: 'Pickup', date: '2026-10-15', assignee: 'm-iris' }), d)
    expect(d.setOccurrenceAssignee).toHaveBeenCalledWith('r1', new Date(2026, 9, 15), 'm-iris')
    await r.undo()
    expect(d.setOccurrenceAssignee).toHaveBeenLastCalledWith('r1', new Date(2026, 9, 15), 'm-old')
  })

  it('routine_change writes name, time, days and people; Undo writes the old values', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_change', routineId: 'r1', title: 'Monday run', seen,
      name: 'Tuesday run', time: '08:30', days: ['tue'], assignees: ['m2', 'm3'] }), d)
    expect(d.updateRoutine).toHaveBeenCalledWith('r1', {
      name: 'Tuesday run', time_of_day: '08:30:00',
      recurrence_pattern: { type: 'weekly', days: ['tue'], interval: 2, start_date: '2026-01-05' },
      assigned_to_all: ['m2', 'm3'], assigned_to: 'm2',
    })
    await r.undo()
    expect(d.updateRoutine).toHaveBeenLastCalledWith('r1', {
      name: 'r1', time_of_day: '07:00:00',
      recurrence_pattern: { type: 'weekly', days: ['mon'], interval: 2, start_date: '2026-01-05' },
      assigned_to_all: ['m1'], assigned_to: 'm1',
    })
  })

  it('routine_change turns a non-weekly rule weekly, and clears a time', async () => {
    const d = deps({ routines: [routine('r1', { recurrence_pattern: { type: 'daily', start_date: '2026-02-01' } })] })
    await applyOk(one({ key: 'k:0', op: 'routine_change', routineId: 'r1', title: 'r1', days: ['sat', 'sun'], clearTime: true }), d)
    expect(d.updateRoutine).toHaveBeenCalledWith('r1', {
      time_of_day: null,
      recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'], interval: 1, start_date: '2026-02-01' },
    })
  })

  it('routine_rest rests it until a date; Undo restores visibility and wake date', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_rest', routineId: 'r1', title: 'Long run', until: '2026-11-01', seen }), d)
    expect(d.updateRoutine).toHaveBeenCalledWith('r1', { visibility: 'reference', paused_until: new Date(2026, 10, 1).toISOString() })
    await r.undo()
    expect(d.updateRoutine).toHaveBeenLastCalledWith('r1', { visibility: 'active', paused_until: null })
  })

  it('routine_add creates the routine; Undo deletes it', async () => {
    const d = deps()
    const r = await applyOk(one({ key: 'k:0', op: 'routine_add', title: 'Reading time', days: ['sun', 'mon', 'tue', 'wed', 'thu'], time: '19:00', assignees: ['m2'], context: 'family' }), d)
    expect(d.addRoutine).toHaveBeenCalledWith({
      name: 'Reading time', recurrence_pattern: { type: 'weekly', days: ['sun', 'mon', 'tue', 'wed', 'thu'], interval: 1 },
      time_of_day: '19:00:00', assigned_to_all: ['m2'], assigned_to: 'm2', context: 'family',
    })
    expect(r.ids).toEqual(['rnew'])
    await r.undo()
    expect(d.deleteRoutine).toHaveBeenCalledWith('rnew')
  })

  it('routine_add every day is daily; no days is weekly with none', async () => {
    const d = deps()
    await applyOk(one({ key: 'k:0', op: 'routine_add', title: 'Water plants', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }), d)
    expect(d.addRoutine).toHaveBeenLastCalledWith(expect.objectContaining({ recurrence_pattern: { type: 'daily' }, assigned_to_all: null, assigned_to: null }))
    await applyOk(one({ key: 'k:1', op: 'routine_add', title: 'Someday chore' }), d)
    expect(d.addRoutine).toHaveBeenLastCalledWith(expect.objectContaining({ recurrence_pattern: { type: 'weekly', days: [], interval: 1 } }))
  })

  it('refuses the whole set when a routine changed since Symphony read it', async () => {
    const d = deps({ routines: [routine('r1', { updated_at: new Date(Date.parse(seen) + 60_000).toISOString() })] })
    const s: ChangeSet = { key: 'k', title: '2 changes', ops: [
      { key: 'k:0', op: 'someday', taskId: 'a', title: 'a', seen },
      { key: 'k:1', op: 'routine_change', routineId: 'r1', title: 'Monday run', time: '08:30', seen },
    ] }
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'stale', title: 'Monday run' })
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.updateRoutine).not.toHaveBeenCalled()
  })

  it('a microsecond-later updated_at is not a change', async () => {
    const d = deps({ routines: [routine('r1', { updated_at: '2026-10-14T07:00:00.123999+00:00' })] })
    expect(await applyChangeSet(one({ key: 'k:0', op: 'routine_rest', routineId: 'r1', title: 'r1', seen }), d)).toMatchObject({ ok: true })
  })

  it('a routine that has gone is stale, for this-week ops too', async () => {
    const d = deps({ routines: [] })
    expect(await applyChangeSet(one({ key: 'k:0', op: 'routine_skip', routineId: 'r1', title: 'Bedtime', date: '2026-10-16' }), d))
      .toEqual({ ok: false, reason: 'stale', title: 'Bedtime' })
    expect(d.skipOccurrence).not.toHaveBeenCalled()
  })

  it('refuses a merge when the duplicate moved since Symphony read it', async () => {
    const d = deps({ tasks: [task('keep'), task('dup', { updatedAt: new Date(Date.parse(seen) + 60_000) })] })
    expect(await applyChangeSet(one({ key: 'k:0', op: 'merge', taskId: 'keep', title: 'keep', seen, fromTaskId: 'dup', fromTitle: 'dup', fromSeen: seen }), d))
      .toEqual({ ok: false, reason: 'stale', title: 'dup' })
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.completeTask).not.toHaveBeenCalled()
  })

  it('a routine write failing part way reverses the task and routine writes before it', async () => {
    const d = deps({ moveOccurrence: vi.fn(async () => null) })
    const s: ChangeSet = { key: 'k', title: '4 changes', ops: [
      { key: 'k:0', op: 'done', taskId: 'a', title: 'a', seen },
      { key: 'k:1', op: 'routine_skip', routineId: 'r1', title: 'Bedtime', date: '2026-10-16' },
      { key: 'k:2', op: 'routine_move', routineId: 'r2', title: 'Haircut', date: '2026-10-15', toDate: '2026-10-16' },
      { key: 'k:3', op: 'routine_add', title: 'Reading time' },
    ] }
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'failed' })
    expect(d.undoSkip).toHaveBeenCalledWith('r1', new Date(2026, 9, 16))
    expect(d.reopenTask).toHaveBeenCalledWith('a')
    expect(vi.mocked(d.undoSkip).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(d.reopenTask).mock.invocationCallOrder[0])
    expect(d.addRoutine).not.toHaveBeenCalled()
  })

  it('one Undo reverses a mixed set newest first', async () => {
    const d = deps()
    const s: ChangeSet = { key: 'k', title: '3 changes', ops: [
      { key: 'k:0', op: 'done', taskId: 'a', title: 'a', seen },
      { key: 'k:1', op: 'routine_who', routineId: 'r1', title: 'Pickup', date: '2026-10-15', assignee: 'm2' },
      { key: 'k:2', op: 'routine_add', title: 'Reading time' },
    ] }
    const r = await applyOk(s, d)
    expect(r.ids).toEqual(['a', 'r1', 'rnew'])
    expect(await r.undo()).toBe(true)
    const order = [vi.mocked(d.deleteRoutine).mock.invocationCallOrder[0], vi.mocked(d.setOccurrenceAssignee).mock.invocationCallOrder[1], vi.mocked(d.reopenTask).mock.invocationCallOrder[0]]
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })
})
