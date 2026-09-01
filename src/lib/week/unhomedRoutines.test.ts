import { describe, it, expect } from 'vitest'
import { unhomedRoutines, type UnhomedCtx } from './unhomedRoutines'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { RecurrencePattern } from '@/types/actionable'

const ctx: UnhomedCtx = { prefs: { hideRoutines: false, layers: ALL_LAYERS } }

describe('unhomedRoutines', () => {
  it('keeps eligible routines missing a time', () => {
    const r = createMockRoutine({ name: 'Trash night', time_of_day: null })
    expect(unhomedRoutines([r], ctx)).toEqual([r])
  })

  it('keeps weekly routines with no days even when timed', () => {
    const r = createMockRoutine({
      name: 'Water plants',
      time_of_day: '17:00',
      recurrence_pattern: { type: 'weekly' } as RecurrencePattern,
    })
    expect(unhomedRoutines([r], ctx)).toEqual([r])
  })

  it('drops routines that already have a home', () => {
    const daily = createMockRoutine({ time_of_day: '07:00' })
    const weekly = createMockRoutine({
      time_of_day: '18:30',
      recurrence_pattern: { type: 'weekly', days: ['tue'] } as RecurrencePattern,
    })
    expect(unhomedRoutines([daily, weekly], ctx)).toEqual([])
  })

  it('drops routines the resolver ladder would hide (resting)', () => {
    const r = createMockRoutine({ time_of_day: null, visibility: 'reference' })
    expect(unhomedRoutines([r], ctx)).toEqual([])
  })
})
