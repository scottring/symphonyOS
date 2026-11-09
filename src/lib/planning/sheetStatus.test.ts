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

describe('steps on an in-progress row', () => {
  const step = (id: string, completed = false) => ({ id, title: `Step ${id}`, completed }) as Task

  it('shows the first open step and how far along it is', () => {
    expect(sheetRowStatus(t({ startedAt: now, subtasks: [step('1', true), step('2'), step('3'), step('4', true)] })))
      .toEqual({ status: 'started', fill: 50, nextStep: 'Step 2' })
  })

  it('always shows some fill once there are steps, so it still reads as started', () => {
    expect(sheetRowStatus(t({ startedAt: now, subtasks: [step('1'), step('2'), step('3'), step('4'), step('5'), step('6'), step('7'), step('8'), step('9'), step('10')] })).fill).toBe(12)
  })

  it('is full with no next step when every step is done', () => {
    expect(sheetRowStatus(t({ startedAt: now, subtasks: [step('1', true)] }))).toEqual({ status: 'started', fill: 100 })
  })

  it('leaves out steps that were let go', () => {
    expect(sheetRowStatus(t({ startedAt: now, subtasks: [{ ...step('1'), dismissedAt: now }, step('2')] })).nextStep).toBe('Step 2')
  })

  it('shows no step on a task that is not in progress', () => {
    expect(sheetRowStatus(t({ subtasks: [step('1')] }))).toEqual({})
    expect(sheetRowStatus(t({ isWaiting: true, waitingFor: 'Iris', subtasks: [step('1')] }))).toEqual({ status: 'waiting', note: 'Waiting on Iris' })
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
