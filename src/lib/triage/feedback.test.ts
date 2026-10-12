import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Task } from '@/types/task'

const toast = vi.hoisted(() => ({ showToast: vi.fn() }))
vi.mock('@/hooks/useToast', () => toast)

import { runTriage, triageSkipDay, triageTaskWhen, placementSnapshot } from './feedback'

const MON = new Date(2026, 9, 12)
const week = new Date(2026, 9, 10)
const task = (x: Partial<Task> = {}) => ({
  id: 't1', title: 'Pick up the keys', completed: false, createdAt: new Date(2026, 8, 1),
  bucket: 'timed', scheduledFor: MON, isAllDay: true, weekStart: week, sourceId: 'goal-1', goalId: 'g',
  commitments: [{ level: 'week', periodStart: week, status: 'open' }],
  ...x,
}) as Task

describe('triage feedback', () => {
  beforeEach(() => { toast.showToast.mockClear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 12, 9)) })
  afterEach(() => { vi.useRealTimers() })

  it('success and Undo only after the write resolved as written', async () => {
    let resolve!: (v: boolean) => void
    const pending = runTriage({ done: 'Moved', write: () => new Promise<boolean>((r) => { resolve = r }), undo: vi.fn() })
    expect(toast.showToast).not.toHaveBeenCalled()
    resolve(true)
    expect(await pending).toBe(true)
    expect(toast.showToast).toHaveBeenCalledWith('Moved', 'success', expect.any(Number), expect.objectContaining({ label: 'Undo' }))
  })

  it('a write that did not land says so, offers Retry, and never says it moved', async () => {
    const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await runTriage({ done: 'Moved', write, undo: vi.fn() })).toBe(false)
    expect(toast.showToast).toHaveBeenCalledTimes(1)
    const [msg, kind, , action] = toast.showToast.mock.calls[0]
    expect(kind).toBe('error')
    expect(msg).toMatch(/Nothing changed/)
    expect(action.label).toBe('Retry')
    action.onClick()
    await vi.waitFor(() => expect(toast.showToast).toHaveBeenLastCalledWith('Moved', 'success', expect.any(Number), expect.anything()))
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('a thrown write counts as not written', async () => {
    expect(await runTriage({ done: 'Moved', write: async () => { throw new Error('offline') } })).toBe(false)
    expect(toast.showToast.mock.calls[0][1]).toBe('error')
  })

  it('Skip this day takes only the day: no week, goal, bucket, completion or delete in the write', async () => {
    const onUpdateTask = vi.fn(async () => true)
    await triageSkipDay(task(), MON, onUpdateTask)
    const [, updates] = onUpdateTask.mock.calls[0] as unknown as [string, Partial<Task>]
    expect(Object.keys(updates).sort()).toEqual(['focus', 'isAllDay', 'scheduledFor'])
    expect(updates.scheduledFor).toBeUndefined()
    // Undo puts the day back.
    const undo = toast.showToast.mock.calls[0][3].onClick
    undo()
    expect(onUpdateTask).toHaveBeenLastCalledWith('t1', { focus: [], scheduledFor: MON, isAllDay: true })
  })

  it('a When’s Undo restores the exact placement it changed', async () => {
    const t = task({ scheduledFor: undefined, bucket: 'week' })
    const h = { onPushTask: vi.fn(async () => true), onSetBucket: vi.fn(async () => true), onUpdateTask: vi.fn(async () => true) }
    await triageTaskWhen(t, 'next-month', h)
    expect(toast.showToast.mock.calls[0][0]).toMatch(/^Moved to Next month · November — “Pick up the keys”/)
    toast.showToast.mock.calls[0][3].onClick()
    expect(h.onUpdateTask).toHaveBeenLastCalledWith('t1', placementSnapshot(t))
    expect(placementSnapshot(t).commitments).toEqual([{ level: 'week', periodStart: week, status: 'open' }])
  })
})
