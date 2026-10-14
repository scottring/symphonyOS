import { describe, expect, it, vi } from 'vitest'
import type { Task, TaskCommitment } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Routine } from '@/types/actionable'
import { applyChangeSet, canApply, plannedWeekStart, type ApplyDeps } from './applyChangeSet'
import type { ChangeSet } from './changeCard'
import { planKeep, planPlacement } from '@/lib/placement/intentions'

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

describe('applyChangeSet: plan ops (Month / Season / Year)', () => {
  const one = (op: ChangeSet['ops'][number]): ChangeSet => ({ key: 'p', title: '1 change', ops: [op] })
  const applyOk = async (s: ChangeSet, d: ApplyDeps) => {
    const r = await applyChangeSet(s, d)
    if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
    return r
  }
  const goal = (id: string, x: Partial<Goal> = {}) => ({
    id, areaId: 'area1', name: id, year: 2026, status: 'active', sortOrder: 0, actions: [], milestones: [],
    context: 'family', notes: 'why', createdAt: new Date(2026, 0, 1), updatedAt: new Date(Date.parse(seen)), ...x,
  }) as Goal
  const oct: TaskCommitment = { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }
  const fall: TaskCommitment = { level: 'season', periodStart: new Date(2026, 8, 1), status: 'open' }
  const planDeps = (over: Partial<ApplyDeps> = {}) => deps({
    tasks: [
      task('m1', { title: 'Plan sabbatical', bucket: 'month', monthStart: oct.periodStart, commitments: [oct], context: 'personal', sourceId: 's1', goalId: 'g1' }),
      task('s1', { title: 'Plan winter vacation', bucket: 'quarter', seasonStart: fall.periodStart, commitments: [fall], context: 'family', goalId: 'g1' }),
    ],
    goals: [goal('g1', { name: 'Rest more' })],
    addGoal: vi.fn(async () => 'gnew'),
    updateGoal: vi.fn(async () => true),
    deleteGoal: vi.fn(async () => {}),
    keepForward: vi.fn(async (id: string) => id),
    dropCommitment: vi.fn(async () => true),
    ...over,
  })

  it('plan_add to a year adds a goal for that year; Undo deletes it', async () => {
    const d = planDeps({ defaultContext: 'work' })
    const r = await applyOk(one({ key: 'p:0', op: 'plan_add', level: 'year', periodStart: '2027-01-01', title: 'Run a half marathon' }), d)
    expect(d.addGoal).toHaveBeenCalledWith('Run a half marathon', { year: 2027, context: 'work' })
    expect(r.ids).toEqual(['gnew'])
    expect(await r.undo()).toBe(true)
    expect(d.deleteGoal).toHaveBeenCalledWith('gnew')
  })

  it('plan_add to a season commits a task there, for its year goal; Undo deletes it', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_add', level: 'season', periodStart: '2026-12-01', title: 'Book the cabin', parentId: 'g1', parentTitle: 'Rest more' }), d)
    expect(d.addTask).toHaveBeenCalledWith('Book the cabin', undefined, { bucket: 'quarter', seasonStart: new Date(2026, 11, 1), goalId: 'g1', context: 'family' })
    expect(r.ids).toEqual(['new1'])
    await r.undo()
    expect(d.deleteTask).toHaveBeenCalledWith('new1')
  })

  it('plan_add to a month links its season goal and inherits the year goal', async () => {
    const d = planDeps()
    await applyOk(one({ key: 'p:0', op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'Book the cabin', parentId: 's1', parentTitle: 'Plan winter vacation' }), d)
    expect(d.addTask).toHaveBeenCalledWith('Book the cabin', undefined, { bucket: 'month', monthStart: new Date(2026, 10, 1), sourceId: 's1', goalId: 'g1', context: 'family' })
  })

  it('plan_add with no parent and no page area adds it plain', async () => {
    const d = planDeps()
    await applyOk(one({ key: 'p:0', op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'Clean the garage' }), d)
    expect(d.addTask).toHaveBeenCalledWith('Clean the garage', undefined, { bucket: 'month', monthStart: new Date(2026, 10, 1) })
  })

  it('plan_add refuses as stale when its parent has gone', async () => {
    const d = planDeps()
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'x', parentId: 'gone', parentTitle: 'Old season goal' }), d))
      .toEqual({ ok: false, reason: 'stale', title: 'Old season goal' })
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('plan_carry of a month goal keeps it forward from its month and renames it; Undo restores title and commitments', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', itemKind: 'task', title: 'Plan sabbatical', seen,
      periodStart: '2026-10-01', toPeriodStart: '2026-11-01', newTitle: 'Draft the sabbatical plan' }), d)
    expect(d.keepForward).toHaveBeenCalledWith('m1', { monthStart: new Date(2026, 10, 1) }, new Date(2026, 9, 1))
    expect(d.updateTask).toHaveBeenCalledWith('m1', { title: 'Draft the sabbatical plan' })
    vi.mocked(d.updateTask).mockClear()
    expect(await r.undo()).toBe(true)
    expect(vi.mocked(d.updateTask).mock.calls).toEqual([
      ['m1', { title: 'Plan sabbatical' }],
      ['m1', { commitments: [oct] }],
    ])
  })

  it('plan_carry of a season goal keeps it into the season named', async () => {
    const d = planDeps()
    await applyOk(one({ key: 'p:0', op: 'plan_carry', level: 'season', itemId: 's1', title: 'Plan winter vacation', periodStart: '2026-09-01', toPeriodStart: '2026-12-01' }), d)
    expect(d.keepForward).toHaveBeenCalledWith('s1', { seasonStart: new Date(2026, 11, 1) }, new Date(2026, 8, 1))
    expect(d.updateTask).not.toHaveBeenCalled()
  })

  it('plan_carry of a goal row puts its open steps back on Undo too', async () => {
    const goalRow = task('gr', { title: 'Transform the porch', isGoal: true, bucket: 'month', monthStart: oct.periodStart, commitments: [oct] })
    const st = task('st', { title: 'Buy chairs', goalTaskId: 'gr', bucket: 'month', monthStart: oct.periodStart, commitments: [oct] })
    const d = planDeps({ tasks: [goalRow, st] })
    const r = await applyOk(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'gr', title: 'Transform the porch', periodStart: '2026-10-01', toPeriodStart: '2026-11-01' }), d)
    await r.undo()
    expect(vi.mocked(d.updateTask).mock.calls).toEqual([['gr', { commitments: [oct] }], ['st', { commitments: [oct] }]])
  })

  it('plan_carry of a year goal adds a carried copy, original untouched; Undo deletes the copy', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_carry', level: 'year', itemId: 'g1', itemKind: 'goal', title: 'Rest more', seen, periodStart: '2026-01-01', toPeriodStart: '2027-01-01', newTitle: 'Rest, really' }), d)
    expect(d.addGoal).toHaveBeenCalledWith('Rest, really', { year: 2027, carriedFrom: 'g1', areaId: 'area1', notes: 'why', strategy: null, context: 'family' })
    expect(d.updateGoal).not.toHaveBeenCalled()
    expect(r.ids).toEqual(['gnew'])
    await r.undo()
    expect(d.deleteGoal).toHaveBeenCalledWith('gnew')
  })

  it('plan_let_go of a month goal drops that month; Undo states the commitments back', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_let_go', level: 'month', itemId: 'm1', title: 'Plan sabbatical', periodStart: '2026-10-01', seen }), d)
    expect(d.dropCommitment).toHaveBeenCalledWith('m1', 'month', new Date(2026, 9, 1))
    await r.undo()
    expect(d.updateTask).toHaveBeenCalledWith('m1', { commitments: [oct] })
  })

  it('plan_let_go of a year goal archives it; Undo restores its status', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_let_go', level: 'year', itemId: 'g1', title: 'Rest more', seen }), d)
    expect(d.updateGoal).toHaveBeenCalledWith('g1', { status: 'archived' })
    await r.undo()
    expect(d.updateGoal).toHaveBeenLastCalledWith('g1', { status: 'active' })
  })

  it('plan_done of a season goal ticks it; Undo reopens it', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_done', level: 'season', itemId: 's1', title: 'Plan winter vacation', seen }), d)
    expect(d.completeTask).toHaveBeenCalledWith('s1')
    await r.undo()
    expect(d.reopenTask).toHaveBeenCalledWith('s1')
  })

  it('plan_done of a year goal marks it met; Undo restores its status; already met writes nothing', async () => {
    const d = planDeps()
    const r = await applyOk(one({ key: 'p:0', op: 'plan_done', level: 'year', itemId: 'g1', title: 'Rest more', seen }), d)
    expect(d.updateGoal).toHaveBeenCalledWith('g1', { status: 'completed' })
    await r.undo()
    expect(d.updateGoal).toHaveBeenLastCalledWith('g1', { status: 'active' })

    const d2 = planDeps({ goals: [goal('g1', { status: 'completed' })] })
    const r2 = await applyOk(one({ key: 'p:0', op: 'plan_done', level: 'year', itemId: 'g1', title: 'g1' }), d2)
    await r2.undo()
    expect(d2.updateGoal).not.toHaveBeenCalled()
  })

  it('refuses the whole set when a year goal changed since Symphony read it', async () => {
    const d = planDeps({ goals: [goal('g1', { updatedAt: new Date(Date.parse(seen) + 60_000) })] })
    const s: ChangeSet = { key: 'p', title: '2 changes', ops: [
      { key: 'p:0', op: 'plan_done', level: 'season', itemId: 's1', title: 'Plan winter vacation', seen },
      { key: 'p:1', op: 'plan_let_go', level: 'year', itemId: 'g1', title: 'Rest more', seen },
    ] }
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'stale', title: 'Rest more' })
    expect(d.completeTask).not.toHaveBeenCalled()
    expect(d.updateGoal).not.toHaveBeenCalled()
  })

  it('refuses when a month goal moved since Symphony read it', async () => {
    const d = planDeps({ tasks: [task('m1', { updatedAt: new Date(Date.parse(seen) + 60_000) })] })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'Plan sabbatical', seen, toPeriodStart: '2026-11-01' }), d))
      .toEqual({ ok: false, reason: 'stale', title: 'Plan sabbatical' })
    expect(d.keepForward).not.toHaveBeenCalled()
  })

  it('a goal or task that has gone is stale', async () => {
    const d = planDeps({ goals: [] })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_done', level: 'year', itemId: 'g1', title: 'Rest more' }), d)).toEqual({ ok: false, reason: 'stale', title: 'Rest more' })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_let_go', level: 'month', itemId: 'nope', title: 'Gone', periodStart: '2026-10-01' }), d)).toEqual({ ok: false, reason: 'stale', title: 'Gone' })
  })

  it('a page without the plan writers refuses a plan set, writing nothing', async () => {
    const { keepForward, dropCommitment, goals, addGoal, updateGoal, deleteGoal, ...noPlan } = planDeps()
    void keepForward; void dropCommitment; void goals; void addGoal; void updateGoal; void deleteGoal
    const s = (op: ChangeSet['ops'][number]): ChangeSet => ({ key: 'p', title: '2 changes', ops: [{ key: 'p:a', op: 'someday', taskId: 'm1', title: 'm1', seen }, op] })
    for (const op of [
      { key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'x', toPeriodStart: '2026-11-01' },
      { key: 'p:0', op: 'plan_carry', level: 'year', itemId: 'g1', title: 'x', toPeriodStart: '2027-01-01' },
      { key: 'p:0', op: 'plan_let_go', level: 'month', itemId: 'm1', title: 'x', periodStart: '2026-10-01' },
      { key: 'p:0', op: 'plan_let_go', level: 'year', itemId: 'g1', title: 'x' },
      { key: 'p:0', op: 'plan_done', level: 'year', itemId: 'g1', title: 'x' },
      { key: 'p:0', op: 'plan_add', level: 'year', periodStart: '2027-01-01', title: 'x' },
      { key: 'p:0', op: 'plan_add', level: 'season', periodStart: '2026-12-01', title: 'x', parentId: 'g1' },
    ] as ChangeSet['ops']) {
      expect(canApply(s(op), noPlan)).toBe(false)
      expect(await applyChangeSet(s(op), noPlan)).toEqual({ ok: false, reason: 'failed' })
    }
    expect(noPlan.updateTask).not.toHaveBeenCalled()
    // A month add with no parent needs only the task writers.
    expect(canApply(one({ key: 'p:0', op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'x' }), noPlan)).toBe(true)
  })

  it('refuses a malformed plan op before writing anything', async () => {
    const d = planDeps()
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'x', toPeriodStart: 'November' }), d)).toEqual({ ok: false, reason: 'failed' })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_let_go', level: 'year', itemId: 'm1', itemKind: 'task', title: 'x' }), d)).toEqual({ ok: false, reason: 'failed' })
    expect(d.keepForward).not.toHaveBeenCalled()
    expect(d.dropCommitment).not.toHaveBeenCalled()
  })

  it('a failed write part way reverses the plan writes before it, newest first', async () => {
    const d = planDeps({ dropCommitment: vi.fn(async () => false) })
    const s: ChangeSet = { key: 'p', title: '4 changes', ops: [
      { key: 'p:0', op: 'plan_add', level: 'year', periodStart: '2027-01-01', title: 'New goal' },
      { key: 'p:1', op: 'plan_done', level: 'year', itemId: 'g1', title: 'Rest more', seen },
      { key: 'p:2', op: 'plan_carry', level: 'season', itemId: 's1', title: 'Plan winter vacation', periodStart: '2026-09-01', toPeriodStart: '2026-12-01' },
      { key: 'p:3', op: 'plan_let_go', level: 'month', itemId: 'm1', title: 'Plan sabbatical', periodStart: '2026-10-01' },
    ] }
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'failed' })
    expect(d.updateTask).toHaveBeenCalledWith('s1', { commitments: [fall] })
    expect(d.updateGoal).toHaveBeenLastCalledWith('g1', { status: 'active' })
    expect(d.deleteGoal).toHaveBeenCalledWith('gnew')
    const order = [vi.mocked(d.updateTask).mock.invocationCallOrder[0], vi.mocked(d.updateGoal).mock.invocationCallOrder[1], vi.mocked(d.deleteGoal).mock.invocationCallOrder[0]]
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  it('the Undo snapshot, through the real placement planner, reopens the source and removes the destination', () => {
    const nov = new Date(2026, 10, 1)
    const m1 = task('m1', { bucket: 'month', monthStart: oct.periodStart, commitments: [oct] })
    const kept = planKeep(m1, 'month', nov, oct.periodStart).local
    expect(kept.commitments?.map((c) => c.status)).toEqual(['carried', 'open'])
    const undone = planPlacement(kept, { commitments: [oct] }, { now: new Date(2026, 9, 14), userId: 'u' })
    expect(undone.commitmentOps).toEqual([{ op: 'remove', level: 'month', periodStart: nov }, { op: 'ensure', level: 'month', periodStart: oct.periodStart }])
    expect(undone.local.commitments?.map((c) => [c.periodStart.getMonth(), c.status])).toEqual([[9, 'open'], [10, 'removed']])
    expect(undone.local.monthStart).toEqual(oct.periodStart)
  })

  it('a keepForward that fails part way is still put back', async () => {
    const d = planDeps({ keepForward: vi.fn(async () => undefined) })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'x', periodStart: '2026-10-01', toPeriodStart: '2026-11-01' }), d)).toEqual({ ok: false, reason: 'failed' })
    expect(d.updateTask).toHaveBeenCalledWith('m1', { commitments: [oct] })
  })
})
