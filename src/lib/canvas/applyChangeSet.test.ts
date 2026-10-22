import { describe, expect, it, vi } from 'vitest'
import type { Task, TaskCommitment } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Routine } from '@/types/actionable'
import { applyChangeSet, canApply, plannedWeekStart, type ApplyDeps } from './applyChangeSet'
import type { ChangeOp, ChangeSet } from './changeCard'
import { planKeep, planPlacement } from '@/lib/placement/intentions'
import type { Choice, ChoiceOption, PriceLine } from '@/types/choice'
import type { ChoiceDetail } from '@/lib/choices/db'
import type { ChoiceWriters } from '@/lib/choices/applyDeps'
import { CHOICES_UPDATED } from '@/hooks/useChoices'

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
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    // a saved, b failed, so a is put back; the add never ran.
    expect(updateTask.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a'])
    expect(d.addTask).not.toHaveBeenCalled()
  })

  it('a rollback that cannot reverse a saved write says so: not "nothing changed"', async () => {
    // a saves; b fails; putting a back fails too (someone else holds it).
    let calls = 0
    const updateTask = vi.fn(async (id: string) => { calls++; if (id === 'b') return false; return calls === 1 })
    const d = deps({ updateTask })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed', reverted: false, kept: ['a'] })
  })

  it('a thrown write is a failure too', async () => {
    const d = deps({ addTask: vi.fn(async () => { throw new Error('offline') }) })
    expect(await applyChangeSet(set, d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
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
    expect(r).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
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
  it('keeps a hidden new routine and changes display without resting an existing routine; Undo restores it', async () => {
    const d=deps({routines:[routine('r1',{show_on_timeline:true})]})
    await applyOk(one({key:'new',op:'routine_add',title:'Vitamins',days:['mon'],showOnTimeline:false}),d)
    expect(d.addRoutine).toHaveBeenCalledWith(expect.objectContaining({show_on_timeline:false}))
    const result=await applyOk(one({key:'edit',op:'routine_change',routineId:'r1',title:'Walk',seen,showOnTimeline:false}),d)
    expect(d.updateRoutine).toHaveBeenCalledWith('r1',{show_on_timeline:false})
    await result.undo()
    expect(d.updateRoutine).toHaveBeenLastCalledWith('r1',{show_on_timeline:true})
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
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
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
      expect(await applyChangeSet(s(op), noPlan)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    }
    expect(noPlan.updateTask).not.toHaveBeenCalled()
    // A month add with no parent needs only the task writers.
    expect(canApply(one({ key: 'p:0', op: 'plan_add', level: 'month', periodStart: '2026-11-01', title: 'x' }), noPlan)).toBe(true)
  })

  it('refuses a malformed plan op before writing anything', async () => {
    const d = planDeps()
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'x', toPeriodStart: 'November' }), d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_let_go', level: 'year', itemId: 'm1', itemKind: 'task', title: 'x' }), d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
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
    expect(await applyChangeSet(s, d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
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
    expect(await applyChangeSet(one({ key: 'p:0', op: 'plan_carry', level: 'month', itemId: 'm1', title: 'x', periodStart: '2026-10-01', toPeriodStart: '2026-11-01' }), d)).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(d.updateTask).toHaveBeenCalledWith('m1', { commitments: [oct] })
  })
})

describe('Undo leaves what someone else changed after Approve (plan §7)', () => {
  it('skips a task edited since, reverses the rest, and reports it could not undo everything', async () => {
    const later = { ...task('a'), updatedAt: new Date(Date.now() + 60_000) }
    const d = deps({ latest: () => ({ tasks: [later, task('b')] }) })
    const r = await applyChangeSet(set, d)
    if (!r.ok) throw new Error('expected ok')
    vi.mocked(d.updateTask).mockClear()
    expect(await r.undo()).toBe(false)
    // b was put back; a (edited by someone else since) was left alone.
    expect(vi.mocked(d.updateTask).mock.calls.map((c) => c[0])).toEqual(['b'])
    expect(d.deleteTask).toHaveBeenCalledWith('new1')
  })
  it('a row this set itself stamped is not "edited since"', async () => {
    const d = deps({ latest: () => ({ tasks: [{ ...task('a'), updatedAt: new Date() }, task('b')] }) })
    const r = await applyChangeSet(set, d)
    if (!r.ok) throw new Error('expected ok')
    expect(await r.undo()).toBe(true)
  })
})

describe('applyChangeSet: choice ops', () => {
  const at = new Date(Date.parse(seen))
  const baseChoice = (id: string, x: Partial<Choice> = {}): Choice => ({
    id, userId: 'u', goal: { kind: 'task', id: 'g1' }, title: 'Contractor', status: 'open', decidedWork: [],
    columns: [], work: [], selectedWork: [], sortOrder: 0, createdAt: at, updatedAt: at, ...x,
  })
  const baseOption = (id: string, choiceId: string, x: Partial<ChoiceOption> = {}): ChoiceOption => ({
    id, choiceId, userId: 'u', name: id, status: 'considering', statusChangedAt: at, values: {}, sortOrder: 0, updatedAt: at, ...x,
  })
  const detailOf = (choice: Choice, options: ChoiceOption[] = [], lines: PriceLine[] = []): ChoiceDetail => ({
    choice, goalTitle: 'Redo the bathrooms', goalContext: 'family', goalScope: 'compound', options, lines, followUps: [], contacts: new Map(),
  })
  /** Writers over an in-memory store, so loadChoice after a create sees it. */
  function fakeWriters(store: Map<string, ChoiceDetail>, over: Partial<ChoiceWriters> = {}): ChoiceWriters {
    let n = 0
    const next = (p: string) => `${p}${++n}`
    return {
      loadChoice: vi.fn(async (id: string) => store.get(id) ?? null),
      createChoice: vi.fn(async (goal, title) => { const c = baseChoice(next('ch'), { goal, title }); store.set(c.id, detailOf(c)); return c }),
      deleteChoice: vi.fn(async () => true),
      updateChoice: vi.fn(async () => true),
      addOption: vi.fn(async (choiceId, input) => baseOption(next('opt'), choiceId, { name: input.name, contactId: input.contactId })),
      deleteOption: vi.fn(async () => true),
      updateOption: vi.fn(async () => true),
      addPriceLine: vi.fn(async (optionId, input) => ({ id: next('line'), optionId, workIds: input.workIds, amountCents: input.amountCents, sortOrder: 0 })),
      deletePriceLine: vi.fn(async () => true),
      addContact: vi.fn(async () => next('contact')),
      deleteContact: vi.fn(async () => true),
      createFollowUp: vi.fn(async () => next('task')),
      deleteTask: vi.fn(async () => true),
      chooseOption: vi.fn(async () => true),
      reopenChoice: vi.fn(async () => true),
      addLogEntry: vi.fn(async (input) => ({ id: next('log'), userId: 'u', ...input, createdAt: new Date() })),
      deleteLogEntry: vi.fn(async () => true),
      planEvent: vi.fn(async () => next('task')),
      loadGoalFacts: vi.fn(async () => ({ context: 'personal' as const, scope: 'individual' })),
      ...over,
    }
  }
  const choiceDeps = (choiceWriters: ChoiceWriters | undefined): ApplyDeps => ({ ...deps(), choiceWriters })
  const g = { goalTitle: 'Redo the bathrooms', choiceTitle: 'Contractor' }

  it('applies a card that builds a new choice end to end', async () => {
    const store = new Map<string, ChoiceDetail>()
    const w = fakeWriters(store)
    const build: ChangeSet = { key: 'c', title: 'A new choice', ops: [
      { key: 'c:0', op: 'choice_add', title: 'Contractor', ...g, goalTaskId: 'g1' },
      { key: 'c:1', op: 'column_add', title: 'Warranty', ...g, choiceKey: 'c:0', columnId: 'col-w', columnLabel: 'Warranty', columnKind: 'text' },
      { key: 'c:2', op: 'work_set', title: 'Main bath', ...g, choiceKey: 'c:0', workIds: ['w-main'], workLabels: ['Main bath'] },
      { key: 'c:3', op: 'option_add', title: 'Martinez', ...g, choiceKey: 'c:0', optionName: 'Martinez', phone: '410-555-0142' },
      { key: 'c:4', op: 'price_line', title: 'Martinez', ...g, choiceKey: 'c:0', optionKey: 'c:3', optionName: 'Martinez', workIds: ['w-main'], workLabels: ['Main bath'], amountCents: 1840000 },
      { key: 'c:5', op: 'option_set', title: 'Martinez', ...g, choiceKey: 'c:0', optionKey: 'c:3', optionName: 'Martinez', columnId: 'col-w', columnLabel: 'Warranty', columnKind: 'text', value: '5 years' },
    ] }
    const events: string[] = []
    const listen = (e: Event) => events.push(e.type)
    window.addEventListener(CHOICES_UPDATED, listen)
    const r = await applyChangeSet(build, choiceDeps(w))
    window.removeEventListener(CHOICES_UPDATED, listen)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) throw new Error('expected ok')
    expect(w.createChoice).toHaveBeenCalledWith({ kind: 'task', id: 'g1' }, 'Contractor')
    expect(w.updateChoice).toHaveBeenNthCalledWith(1, 'ch1', { columns: [{ id: 'col-w', label: 'Warranty', kind: 'text' }] })
    // A first piece of work starts selected, so prices show at once.
    expect(w.updateChoice).toHaveBeenNthCalledWith(2, 'ch1', { work: [{ id: 'w-main', label: 'Main bath' }], selected_work: ['w-main'] })
    // The contact carries the goal's domain.
    expect(w.addContact).toHaveBeenCalledWith('Martinez', '410-555-0142', 'family')
    expect(w.addOption).toHaveBeenCalledWith('ch1', { name: 'Martinez', contactId: 'contact2' })
    expect(w.addPriceLine).toHaveBeenCalledWith('opt3', { workIds: ['w-main'], amountCents: 1840000 })
    expect(w.updateOption).toHaveBeenCalledWith('opt3', { values: { 'col-w': '5 years' } })
    expect(r.ids).toEqual(expect.arrayContaining(['ch1', 'contact2', 'opt3', 'line4']))
    const order = [w.createChoice, w.updateChoice, w.addContact, w.addOption, w.addPriceLine, w.updateOption].map((f) => vi.mocked(f).mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((x, y) => x - y))
    expect(events).toContain(CHOICES_UPDATED)
  })

  it('two column_add ops in one set both persist, the second building on the first', async () => {
    const store = new Map([['ch1', detailOf(baseChoice('ch1', { columns: [{ id: 'old', label: 'Start', kind: 'date' }] }))]])
    const w = fakeWriters(store)
    const two: ChangeSet = { key: 'c', title: 'Columns', ops: [
      { key: 'c:0', op: 'column_add', title: 'A', ...g, choiceId: 'ch1', columnId: 'a', columnLabel: 'A', columnKind: 'text' },
      { key: 'c:1', op: 'column_add', title: 'B', ...g, choiceId: 'ch1', columnId: 'b', columnLabel: 'B', columnKind: 'money' },
    ] }
    const r = await applyChangeSet(two, choiceDeps(w))
    if (!r.ok) throw new Error('expected ok')
    expect(w.updateChoice).toHaveBeenLastCalledWith('ch1', { columns: [{ id: 'old', label: 'Start', kind: 'date' }, { id: 'a', label: 'A', kind: 'text' }, { id: 'b', label: 'B', kind: 'money' }] })
    vi.mocked(w.updateChoice).mockClear()
    expect(await r.undo()).toBe(true)
    expect(vi.mocked(w.updateChoice).mock.calls).toEqual([
      ['ch1', { columns: [{ id: 'old', label: 'Start', kind: 'date' }, { id: 'a', label: 'A', kind: 'text' }] }],
      ['ch1', { columns: [{ id: 'old', label: 'Start', kind: 'date' }] }],
    ])
  })

  it('refuses a choice op when the choice changed since it was read', async () => {
    const store = new Map([['ch1', detailOf(baseChoice('ch1', { updatedAt: new Date(Date.parse(seen) + 60_000) }), [baseOption('o1', 'ch1')])]])
    const w = fakeWriters(store)
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'option_status', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', status: 'contacted', seen },
    ] }
    expect(await applyChangeSet(s, choiceDeps(w))).toEqual({ ok: false, reason: 'stale', title: 'Contractor' })
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  it('a choice that has gone, or an option that has gone, is stale', async () => {
    const w = fakeWriters(new Map([['ch1', detailOf(baseChoice('ch1'))]]))
    const gone: ChangeSet = { key: 'c', title: 'x', ops: [{ key: 'c:0', op: 'choice_reopen', title: 'x', ...g, choiceId: 'nope' }] }
    expect(await applyChangeSet(gone, choiceDeps(w))).toEqual({ ok: false, reason: 'stale', title: 'Contractor' })
    const noOption: ChangeSet = { key: 'c', title: 'x', ops: [{ key: 'c:0', op: 'option_status', title: 'x', ...g, choiceId: 'ch1', optionId: 'o9', optionName: 'Rob', status: 'contacted' }] }
    expect(await applyChangeSet(noOption, choiceDeps(w))).toEqual({ ok: false, reason: 'stale', title: 'Rob' })
  })

  it('a choiceKey or optionKey with no earlier add is refused before anything is written', async () => {
    const w = fakeWriters(new Map())
    const s: ChangeSet = { key: 'c', title: 'x', ops: [{ key: 'c:0', op: 'option_add', title: 'x', ...g, choiceKey: 'c:9', optionName: 'Rob' }] }
    expect(await applyChangeSet(s, choiceDeps(w))).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(w.addOption).not.toHaveBeenCalled()
  })

  it('a failure part way puts back what saved', async () => {
    const store = new Map<string, ChoiceDetail>()
    const w = fakeWriters(store, { addPriceLine: vi.fn(async () => null) })
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'choice_add', title: 'Contractor', ...g, goalId: 'yg1' },
      { key: 'c:1', op: 'option_add', title: 'Rob', ...g, choiceKey: 'c:0', optionName: 'Rob' },
      { key: 'c:2', op: 'price_line', title: 'Rob', ...g, choiceKey: 'c:0', optionKey: 'c:1', optionName: 'Rob', workIds: [], workLabels: [], amountCents: 500 },
    ] }
    expect(await applyChangeSet(s, choiceDeps(w))).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(w.createChoice).toHaveBeenCalledWith({ kind: 'goal', id: 'yg1' }, 'Contractor')
    expect(w.deleteOption).toHaveBeenCalledWith('opt2')
    expect(w.deleteChoice).toHaveBeenCalledWith('ch1')
    expect(vi.mocked(w.deleteOption).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(w.deleteChoice).mock.invocationCallOrder[0])
  })

  it('undo reverses an option_status and a price_line', async () => {
    const store = new Map([['ch1', detailOf(baseChoice('ch1', { work: [{ id: 'w1', label: 'Main bath' }] }), [baseOption('o1', 'ch1', { status: 'contacted' })])]])
    const w = fakeWriters(store)
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'option_status', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', status: 'heard_back', seen },
      { key: 'c:1', op: 'price_line', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', workIds: ['w1'], workLabels: ['Main bath'], amountCents: 1975000, note: 'tile included' },
    ] }
    const r = await applyChangeSet(s, choiceDeps(w))
    if (!r.ok) throw new Error('expected ok')
    expect(w.updateOption).toHaveBeenCalledWith('o1', { status: 'heard_back' })
    expect(w.addPriceLine).toHaveBeenCalledWith('o1', { workIds: ['w1'], amountCents: 1975000, note: 'tile included' })
    expect(await r.undo()).toBe(true)
    expect(w.deletePriceLine).toHaveBeenCalledWith('line1')
    expect(w.updateOption).toHaveBeenLastCalledWith('o1', { status: 'contacted' })
  })

  it('choose, reopen and follow up go through their writers, with an Undo that restores the decision', async () => {
    const decided = baseChoice('ch1', { status: 'decided', chosenOptionId: 'o1', decidedNote: 'Earliest', decidedAt: at, decidedWork: ['w1'], decidedAmountCents: 100 })
    const store = new Map([['ch1', detailOf(decided, [baseOption('o1', 'ch1', { status: 'chosen' }), baseOption('o2', 'ch1', { status: 'heard_back' })])]])
    const w = fakeWriters(store)
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'choice_reopen', title: 'Contractor', ...g, choiceId: 'ch1' },
      { key: 'c:1', op: 'choice_choose', title: 'o2', ...g, choiceId: 'ch1', optionId: 'o2', optionName: 'o2', note: 'Warranty' },
      { key: 'c:2', op: 'follow_up', title: 'o2', ...g, choiceId: 'ch1', optionId: 'o2', optionName: 'o2', date: '2026-10-23' },
    ] }
    const r = await applyChangeSet(s, choiceDeps(w))
    if (!r.ok) throw new Error('expected ok')
    expect(w.reopenChoice).toHaveBeenCalledWith(expect.objectContaining({ choice: decided }))
    // Choose builds on the reopened choice.
    const chosenWith = vi.mocked(w.chooseOption).mock.calls[0]
    expect(chosenWith[0].choice.status).toBe('open')
    expect(chosenWith.slice(1)).toEqual(['o2', 'Warranty'])
    expect(w.createFollowUp).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'o2' }), new Date(2026, 9, 23))
    vi.mocked(w.updateChoice).mockClear()
    vi.mocked(w.updateOption).mockClear()
    expect(await r.undo()).toBe(true)
    expect(w.deleteTask).toHaveBeenCalledWith('task1')
    const restore = { status: 'decided', chosen_option_id: 'o1', decided_at: at.toISOString(), decided_note: 'Earliest', decided_work: ['w1'], decided_amount_cents: 100 }
    expect(w.updateChoice).toHaveBeenLastCalledWith('ch1', restore)
    expect(w.updateOption).toHaveBeenCalledWith('o2', { status: 'heard_back' })
    expect(w.updateOption).toHaveBeenLastCalledWith('o1', { status: 'chosen' })
  })

  it('an option_set whose value does not fit its column is refused before anything is written', async () => {
    const cols = [{ id: 'm', label: 'Deposit', kind: 'money' as const }, { id: 'd', label: 'Start', kind: 'date' as const }, { id: 'y', label: 'Permit', kind: 'yesno' as const }, { id: 't', label: 'Warranty', kind: 'text' as const }]
    const store = () => new Map([['ch1', detailOf(baseChoice('ch1', { columns: cols }), [baseOption('o1', 'ch1')])]])
    const setOp = (columnId: string, value: ChangeOp['value']): ChangeSet => ({ key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'option_set', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', columnId, columnLabel: columnId, value },
    ] })
    const refused = { ok: false, reason: 'failed', reverted: true, kept: [] }
    for (const [col, bad] of [['m', '18400'], ['m', Number.NaN], ['d', 'Dec 1'], ['d', 20261201], ['y', 'yes'], ['t', 5]] as const) {
      const w = fakeWriters(store())
      expect(await applyChangeSet(setOp(col, bad), choiceDeps(w))).toEqual(refused)
      expect(w.updateOption).not.toHaveBeenCalled()
    }
    for (const [col, ok] of [['m', 1840000], ['d', '2026-12-01'], ['y', false], ['t', '5 years'], ['m', null]] as const) {
      expect(await applyChangeSet(setOp(col, ok), choiceDeps(fakeWriters(store())))).toMatchObject({ ok: true })
    }
    // A column added earlier in the set is the one the value must fit.
    const added: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'column_add', title: 'Cost', ...g, choiceId: 'ch1', columnId: 'new', columnLabel: 'Cost', columnKind: 'money' },
      { key: 'c:1', op: 'option_set', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', columnId: 'new', columnLabel: 'Cost', value: 'lots' },
    ] }
    const w = fakeWriters(store())
    expect(await applyChangeSet(added, choiceDeps(w))).toEqual(refused)
    expect(w.updateChoice).not.toHaveBeenCalled()
    // A column that does not exist by then is refused too.
    expect(await applyChangeSet(setOp('nope', 'x'), choiceDeps(fakeWriters(store())))).toEqual(refused)
  })

  it('on the managed (chat) path it never announces: applyReviewedChange does, once the outcome is settled', async () => {
    const events: string[] = []
    const listen = (e: Event) => events.push(e.type)
    window.addEventListener(CHOICES_UPDATED, listen)
    try {
      const store = () => new Map([['ch1', detailOf(baseChoice('ch1'), [baseOption('o1', 'ch1')])]])
      const s: ChangeSet = { key: 'c', title: 'x', ops: [
        { key: 'c:0', op: 'option_status', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', status: 'contacted' },
        { key: 'c:1', op: 'price_line', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', workIds: [], workLabels: [], amountCents: 5 },
      ] }
      const failing = fakeWriters(store(), { addPriceLine: vi.fn(async () => null) })
      expect(await applyChangeSet(s, { ...choiceDeps(failing), managedRecovery: true })).toMatchObject({ ok: false, reverted: false })
      const ok = await applyChangeSet(s, { ...choiceDeps(fakeWriters(store())), managedRecovery: true })
      if (!ok.ok) throw new Error('expected ok')
      expect(events).toEqual([])
      // The non-managed path still announces after its own rollback.
      await applyChangeSet(s, choiceDeps(fakeWriters(store(), { addPriceLine: vi.fn(async () => null) })))
      expect(events).toEqual([CHOICES_UPDATED])
    } finally {
      window.removeEventListener(CHOICES_UPDATED, listen)
    }
  })

  it('the wall cannot apply choice ops', () => {
    const s: ChangeSet = { key: 'c', title: 'x', ops: [{ key: 'c:0', op: 'choice_reopen', title: 'x', ...g, choiceId: 'ch1' }] }
    expect(canApply(s, choiceDeps(undefined))).toBe(false)
    expect(canApply(s, choiceDeps(fakeWriters(new Map())))).toBe(true)
  })

  it('choosing an option the same set adds to an existing choice is refused before anything is written', async () => {
    const w = fakeWriters(new Map([['ch1', detailOf(baseChoice('ch1'), [baseOption('o1', 'ch1')])]]))
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'option_add', title: 'Rob', ...g, choiceId: 'ch1', optionName: 'Rob' },
      { key: 'c:1', op: 'choice_choose', title: 'Rob', ...g, choiceId: 'ch1', optionKey: 'c:0', optionName: 'Rob' },
    ] }
    expect(await applyChangeSet(s, choiceDeps(w))).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(w.addOption).not.toHaveBeenCalled()
    expect(w.chooseOption).not.toHaveBeenCalled()
    // On a choice the same set creates, the whole tree is new: choosing is fine.
    const fresh = fakeWriters(new Map())
    const made: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'choice_add', title: 'Contractor', ...g, goalTaskId: 'g1' },
      { key: 'c:1', op: 'option_add', title: 'Rob', ...g, choiceKey: 'c:0', optionName: 'Rob' },
      { key: 'c:2', op: 'choice_choose', title: 'Rob', ...g, choiceKey: 'c:0', optionKey: 'c:1', optionName: 'Rob' },
    ] }
    expect(await applyChangeSet(made, choiceDeps(fresh))).toMatchObject({ ok: true })
    expect(fresh.chooseOption).toHaveBeenCalled()
  })

  it('option_status never sets Chosen (choosing decides the choice)', async () => {
    const w = fakeWriters(new Map([['ch1', detailOf(baseChoice('ch1'), [baseOption('o1', 'ch1')])]]))
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'option_status', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', status: 'chosen' },
    ] }
    expect(await applyChangeSet(s, choiceDeps(w))).toEqual({ ok: false, reason: 'failed', reverted: true, kept: [] })
    expect(w.updateOption).not.toHaveBeenCalled()
  })

  describe('log and plan ops', () => {
    /** A local day `n` days from now, as the card carries it. */
    const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const refused = { ok: false, reason: 'failed', reverted: true, kept: [] }
    const store = () => new Map([['ch1', detailOf(baseChoice('ch1'), [baseOption('o1', 'ch1', { contactId: 'k1' })])]])
    const onOption = { ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1' }
    const onYearGoal = { goalTitle: 'Redo the bathrooms', goalId: 'yg1' }
    const logOp = (x: Partial<ChangeOp>): ChangeOp => ({ key: 'e:0', op: 'event_log', title: 'x', logKind: 'call', date: day(0), summary: 'Coming Thursday at 10', ...x })
    const one = (x: Partial<ChangeOp>): ChangeSet => ({ key: 'e', title: 'x', ops: [logOp(x)] })

    it('accepts an option-level log and a goal-level plan', async () => {
      const w = fakeWriters(store())
      expect(await applyChangeSet(one({ ...onOption, time: '09:30' }), choiceDeps(w))).toMatchObject({ ok: true })
      expect(w.addLogEntry).toHaveBeenCalledWith({ goal: { kind: 'task', id: 'g1' }, optionId: 'o1', kind: 'call', on: day(0), time: '09:30', summary: 'Coming Thursday at 10' })
      expect(w.updateOption).not.toHaveBeenCalled()
      const p = fakeWriters(store())
      expect(await applyChangeSet(one({ ...onYearGoal, op: 'event_plan', logKind: 'meeting', date: day(3) }), choiceDeps(p))).toMatchObject({ ok: true })
      expect(p.loadChoice).not.toHaveBeenCalled()
    })

    it('refuses a log dated ahead, a plan dated today, a missing summary, a bad kind or time, and two targets', async () => {
      const bad: Partial<ChangeOp>[] = [
        { ...onOption, date: day(1) },
        { ...onYearGoal, op: 'event_plan', date: day(0) },
        { ...onYearGoal, op: 'event_plan', date: day(-2) },
        { ...onOption, summary: '   ' },
        { ...onOption, summary: undefined },
        { ...onOption, summary: 'x'.repeat(501) },
        { ...onOption, logKind: 'email' as never },
        { ...onOption, logKind: undefined },
        { ...onOption, date: 'Oct 22' },
        { ...onOption, time: '9:30' },
        { ...onOption, goalTaskId: 'g1' },
        { ...onYearGoal, goalTaskId: 'g1' },
        { title: 'x' },
        // An existing option belongs to an existing choice.
        { goalTitle: 'x', choiceKey: 'nope', optionId: 'o1' },
      ]
      for (const x of bad) {
        const w = fakeWriters(store())
        expect(await applyChangeSet(one(x), choiceDeps(w))).toEqual(refused)
        expect(w.addLogEntry).not.toHaveBeenCalled()
        expect(w.planEvent).not.toHaveBeenCalled()
      }
      expect(await applyChangeSet(one({ ...onOption, summary: 'x'.repeat(500) }), choiceDeps(fakeWriters(store())))).toMatchObject({ ok: true })
    })

    it('logs about an option the same card adds to an existing choice; Undo removes both', async () => {
      const w = fakeWriters(store())
      const s: ChangeSet = { key: 'e', title: 'x', ops: [
        { key: 'k', op: 'option_add', title: 'Scher', ...g, choiceId: 'ch1', optionName: 'Scher' },
        logOp({ key: 'e:1', ...g, choiceId: 'ch1', optionKey: 'k', optionName: 'Scher', logKind: 'visit', summary: '  Walked the main bath  ' }),
      ] }
      const r = await applyChangeSet(s, choiceDeps(w))
      if (!r.ok) throw new Error('expected ok')
      expect(w.addLogEntry).toHaveBeenCalledWith({ goal: { kind: 'task', id: 'g1' }, optionId: 'opt1', kind: 'visit', on: day(0), summary: 'Walked the main bath' })
      expect(r.ids).toEqual(['opt1', 'log2'])
      expect(await r.undo()).toBe(true)
      expect(w.deleteLogEntry).toHaveBeenCalledWith('log2')
      expect(w.deleteOption).toHaveBeenCalledWith('opt1')
      expect(vi.mocked(w.deleteLogEntry).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(w.deleteOption).mock.invocationCallOrder[0])
    })

    it('a plan on a year goal takes the goal\'s domain and scope; Undo deletes the task', async () => {
      const w = fakeWriters(store(), { loadGoalFacts: vi.fn(async () => ({ context: 'family' as const, scope: 'compound' })) })
      const r = await applyChangeSet(one({ ...onYearGoal, op: 'event_plan', logKind: 'visit', date: day(5), time: '10:00', summary: 'Measure the hall bath' }), choiceDeps(w))
      if (!r.ok) throw new Error('expected ok')
      expect(w.loadGoalFacts).toHaveBeenCalledWith({ kind: 'goal', id: 'yg1' })
      expect(w.planEvent).toHaveBeenCalledWith({ goal: { kind: 'goal', id: 'yg1' }, goalContext: 'family', goalScope: 'compound', kind: 'visit', on: day(5), time: '10:00', summary: 'Measure the hall bath' })
      expect(r.ids).toEqual(['task1'])
      expect(await r.undo()).toBe(true)
      expect(w.deleteTask).toHaveBeenCalledWith('task1')
    })

    it('a plan about an option uses its choice\'s goal and names the option and its contact', async () => {
      const s = new Map([['ch1', detailOf(baseChoice('ch1', { goal: { kind: 'goal', id: 'yg1' } }), [baseOption('o1', 'ch1', { name: 'Scher Remodeling', contactId: 'k1' })])]])
      const w = fakeWriters(s)
      expect(await applyChangeSet(one({ ...onOption, op: 'event_plan', date: day(2) }), choiceDeps(w))).toMatchObject({ ok: true })
      expect(w.loadGoalFacts).not.toHaveBeenCalled()
      expect(w.planEvent).toHaveBeenCalledWith({
        goal: { kind: 'goal', id: 'yg1' }, goalContext: 'family', goalScope: 'compound',
        optionId: 'o1', optionName: 'Scher Remodeling', contactId: 'k1', kind: 'call', on: day(2), summary: 'Coming Thursday at 10',
      })
    })

    it('an option-level log on a choice changed since it was read is stale', async () => {
      const s = new Map([['ch1', detailOf(baseChoice('ch1', { updatedAt: new Date(Date.parse(seen) + 60_000) }), [baseOption('o1', 'ch1')])]])
      const w = fakeWriters(s)
      expect(await applyChangeSet(one({ ...onOption, seen }), choiceDeps(w))).toEqual({ ok: false, reason: 'stale', title: 'Contractor' })
      expect(w.addLogEntry).not.toHaveBeenCalled()
    })

    it('a goal that cannot be read, or a write that fails, fails the set and puts back what saved', async () => {
      const w = fakeWriters(store(), { loadGoalFacts: vi.fn(async () => null) })
      const s: ChangeSet = { key: 'e', title: 'x', ops: [
        logOp({ ...onOption }),
        logOp({ key: 'e:1', ...onYearGoal, op: 'event_plan', date: day(1) }),
      ] }
      expect(await applyChangeSet(s, choiceDeps(w))).toEqual(refused)
      expect(w.planEvent).not.toHaveBeenCalled()
      expect(w.deleteLogEntry).toHaveBeenCalledWith('log1')
      const f = fakeWriters(store(), { addLogEntry: vi.fn(async () => null) })
      expect(await applyChangeSet(one(onOption), choiceDeps(f))).toEqual(refused)
    })

    it('announces Choices like any choice op, and the wall cannot apply them', async () => {
      const events: string[] = []
      const listen = (e: Event) => events.push(e.type)
      window.addEventListener(CHOICES_UPDATED, listen)
      try { await applyChangeSet(one(onYearGoal), choiceDeps(fakeWriters(store()))) } finally { window.removeEventListener(CHOICES_UPDATED, listen) }
      expect(events).toContain(CHOICES_UPDATED)
      expect(canApply(one(onYearGoal), choiceDeps(undefined))).toBe(false)
    })
  })

  it('choosing again on a decided choice: Undo puts back both options and the earlier decision', async () => {
    const decided = baseChoice('ch1', { status: 'decided', chosenOptionId: 'o1', decidedNote: 'Earliest', decidedAt: at, decidedWork: [], decidedAmountCents: 100 })
    const store = new Map([['ch1', detailOf(decided, [baseOption('o1', 'ch1', { status: 'chosen' }), baseOption('o2', 'ch1', { status: 'contacted' })])]])
    const w = fakeWriters(store)
    const s: ChangeSet = { key: 'c', title: 'x', ops: [
      { key: 'c:0', op: 'choice_choose', title: 'o2', ...g, choiceId: 'ch1', optionId: 'o2', optionName: 'o2' },
      // A later op sees the earlier option back at Heard back.
      { key: 'c:1', op: 'option_status', title: 'o1', ...g, choiceId: 'ch1', optionId: 'o1', optionName: 'o1', status: 'ruled_out' },
    ] }
    const r = await applyChangeSet(s, choiceDeps(w))
    if (!r.ok) throw new Error('expected ok')
    expect(w.chooseOption).toHaveBeenCalledWith(expect.objectContaining({ choice: decided }), 'o2', null)
    vi.mocked(w.updateChoice).mockClear()
    vi.mocked(w.updateOption).mockClear()
    expect(await r.undo()).toBe(true)
    expect(vi.mocked(w.updateOption).mock.calls).toEqual([
      ['o1', { status: 'heard_back' }], // the option_status, undone first
      ['o2', { status: 'contacted' }],
      ['o1', { status: 'chosen' }],
    ])
    expect(w.updateChoice).toHaveBeenLastCalledWith('ch1', { status: 'decided', chosen_option_id: 'o1', decided_at: at.toISOString(), decided_note: 'Earliest', decided_work: [], decided_amount_cents: 100 })
  })
})
