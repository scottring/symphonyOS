import { describe, it, expect } from 'vitest'
import { canSetGoalStatus, goalStatusOf, goalStatusUpdate } from './goalStatus'

describe('goalStatusOf', () => {
  it('reads an open month goal as active', () => {
    expect(goalStatusOf({ completed: false, bucket: 'month' })).toBe('active')
  })
  it('reads a ticked goal as completed', () => {
    expect(goalStatusOf({ completed: true, bucket: 'month' })).toBe('completed')
  })
  it('reads a parked goal as archived', () => {
    expect(goalStatusOf({ completed: false, bucket: 'someday' })).toBe('archived')
  })
})

describe('goalStatusUpdate — only `completed`, never a placement', () => {
  const active = { completed: false, bucket: 'month' as const }
  const done = { completed: true, bucket: 'month' as const }

  it('completing sends the tick alone', () => {
    expect(goalStatusUpdate(active, 'completed')).toEqual({ completed: true })
  })

  it('reopening sends the tick alone, so the write is not refused', () => {
    // The first version sent `{ completed: false, bucket: 'month' }`.
    // `updateTask` refuses ANY write to a goal that carries a placement key
    // (useSupabaseTasks.ts:1614), so the whole update was dropped with a toast
    // and a goal ticked by accident could not be reopened from its own page.
    expect(goalStatusUpdate(done, 'active')).toEqual({ completed: false })
  })

  it('never carries a bucket or a period stamp', () => {
    for (const next of ['active', 'completed'] as const) {
      const update = goalStatusUpdate(next === 'active' ? done : active, next) ?? {}
      expect(Object.keys(update)).toEqual(['completed'])
    }
  })

  it('cannot archive a month or season goal, and says so rather than pretending', () => {
    // Parking one would mean bucket 'someday' — a placement, refused for goals.
    expect(goalStatusUpdate(active, 'archived')).toBeNull()
    expect(canSetGoalStatus('archived')).toBe(false)
    expect(canSetGoalStatus('active')).toBe(true)
    expect(canSetGoalStatus('completed')).toBe(true)
  })

  it('writes nothing when the status is already what you asked for', () => {
    expect(goalStatusUpdate(active, 'active')).toBeNull()
    expect(goalStatusUpdate(done, 'completed')).toBeNull()
  })
})
