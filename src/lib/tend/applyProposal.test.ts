import { describe, it, expect, vi } from 'vitest'
import { applyProposal } from './applyProposal'
import type { TendActions } from './applyProposal'

function actions(): TendActions {
  return { setBucket: vi.fn(), deleteTask: vi.fn() }
}

describe('applyProposal', () => {
  it('merge deletes every drop id and nothing else', () => {
    const a = actions()
    applyProposal({ kind: 'merge', id: 'm', keepId: 'keep', dropIds: ['d1', 'd2'], why: '' }, a)
    expect(a.deleteTask).toHaveBeenCalledTimes(2)
    expect(a.deleteTask).toHaveBeenCalledWith('d1')
    expect(a.deleteTask).toHaveBeenCalledWith('d2')
    expect(a.setBucket).not.toHaveBeenCalled()
  })

  it('put_aside sends the task to the someday bucket', () => {
    const a = actions()
    applyProposal({ kind: 'put_aside', id: 'p', taskId: 't1', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'someday')
  })

  it('regrade sends the task to the named bucket', () => {
    const a = actions()
    applyProposal({ kind: 'regrade', id: 'r', taskId: 't1', to: 'month', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'month')
  })

  it('place schedules each task as timed at the local date+time in one call', () => {
    const a = actions()
    applyProposal({ kind: 'place', id: 'pl', taskIds: ['t1', 't2'], date: '2026-07-25', time: '10:30', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledTimes(2)
    const [, bucket, when, isAllDay] = (a.setBucket as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(bucket).toBe('timed')
    expect(isAllDay).toBe(false)
    expect(when).toEqual(new Date(2026, 6, 25, 10, 30, 0, 0)) // local parts, no UTC shift
  })

  it('place without time is an all-day placement at local midnight', () => {
    const a = actions()
    applyProposal({ kind: 'place', id: 'pl', taskIds: ['t1'], date: '2026-07-25', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'timed', new Date(2026, 6, 25, 0, 0, 0, 0), true)
  })

  it('regrade to season lands in the quarter bucket', () => {
    const a = actions()
    applyProposal({ kind: 'regrade', id: 'r', taskId: 't1', to: 'season', why: '' }, a)
    expect(a.setBucket).toHaveBeenCalledWith('t1', 'quarter')
  })
})
