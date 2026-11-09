import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { dbTaskToTask } from '@/hooks/useSupabaseTasks'
import { sheetRowStatus, statusWrite } from './sheetStatus'

const now = new Date(2026, 10, 9, 9)
const t = (x: Partial<Task> = {}) => ({ id: 'a', title: 'Book the cabin', completed: false, createdAt: now, ...x }) as Task

describe('sheetRowStatus', () => {
  it('says nothing about a task no one has started', () => {
    expect(sheetRowStatus(t())).toEqual({})
  })

  it('reads a started task as in progress, with no extra line', () => {
    expect(sheetRowStatus(t({ startedAt: now }))).toEqual({ status: 'started' })
  })

  it('reads a wait as who it is waiting on', () => {
    expect(sheetRowStatus(t({ isWaiting: true, waitingFor: 'Iris' }))).toEqual({ status: 'waiting', note: 'Waiting on Iris' })
  })

  it('lets a wait win if a task somehow has both', () => {
    expect(sheetRowStatus(t({ startedAt: now, isWaiting: true, waitingFor: 'Iris' })).status).toBe('waiting')
  })
})

describe('statusWrite', () => {
  it('starts a task, ending any wait', () => {
    const { label, patch } = statusWrite(t({ isWaiting: true, waitingFor: 'Iris', waitingSince: now }), { to: 'started' }, now)
    expect(label).toBe('In progress: “Book the cabin”')
    expect(patch).toEqual({ startedAt: now, isWaiting: false, waitingFor: undefined, waitingSince: undefined })
  })

  it('puts a task waiting on someone, ending in progress and stamping the wait', () => {
    const { label, patch } = statusWrite(t({ startedAt: now }), { to: 'waiting', on: ' Iris ' }, now)
    expect(label).toBe('Waiting on Iris: “Book the cabin”')
    expect(patch).toMatchObject({ startedAt: null, isWaiting: true, waitingFor: 'Iris' })
    expect(patch.waitingSince).toBeInstanceOf(Date)
  })

  it('does not reset the clock when a wait moves to someone else', () => {
    const { patch } = statusWrite(t({ isWaiting: true, waitingFor: 'Iris', waitingSince: now }), { to: 'waiting', on: 'Guy' }, now)
    expect(patch.waitingFor).toBe('Guy')
    expect('waitingSince' in patch).toBe(false)
  })

  it('clears both', () => {
    const { label, patch } = statusWrite(t({ startedAt: now }), { to: 'none' }, now)
    expect(label).toBe('Clear status: “Book the cabin”')
    expect(patch).toEqual({ startedAt: null, isWaiting: false, waitingFor: undefined, waitingSince: undefined })
  })

  it('holds what Undo needs to put back', () => {
    const { prev } = statusWrite(t({ isWaiting: true, waitingFor: 'Iris', waitingSince: now }), { to: 'started' }, now)
    expect(prev).toEqual({ startedAt: null, isWaiting: true, waitingFor: 'Iris', waitingSince: now })
  })
})

describe('reading started_at', () => {
  it('becomes startedAt', () => {
    const at = '2026-11-09T14:00:00.000Z'
    expect(dbTaskToTask({ id: 'a', title: 'x', completed: false, created_at: at, updated_at: at, started_at: at } as never).startedAt).toEqual(new Date(at))
  })
})
