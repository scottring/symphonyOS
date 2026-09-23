import { describe, it, expect } from 'vitest'
import { goalStatusOf, goalStatusUpdate } from './goalStatus'

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

describe('goalStatusUpdate', () => {
  const active = { completed: false, bucket: 'month' as const }

  it('completing leaves the goal on its period list, for the look-back', () => {
    expect(goalStatusUpdate(active, 'completed', 'month')).toEqual({ completed: true })
  })

  it('archiving parks it without deleting or completing it', () => {
    expect(goalStatusUpdate(active, 'archived', 'month')).toEqual({ completed: false, bucket: 'someday' })
  })

  it('un-archiving returns the goal to its OWN period, not a guessed one', () => {
    const archived = { completed: false, bucket: 'someday' as const }
    expect(goalStatusUpdate(archived, 'active', 'quarter')).toEqual({ completed: false, bucket: 'quarter' })
  })

  it('re-opening a completed goal clears the tick', () => {
    expect(goalStatusUpdate({ completed: true, bucket: 'month' }, 'active', 'month'))
      .toEqual({ completed: false, bucket: 'month' })
  })

  it('writes nothing when the status is already what you asked for', () => {
    expect(goalStatusUpdate(active, 'active', 'month')).toBeNull()
  })
})
