import { describe, it, expect } from 'vitest'
import { routineToTimelineItem } from './timeline'
import { createMockRoutine } from '@/test/mocks/factories'

const DATE = new Date(2026, 7, 24, 9, 0, 0)

describe('routineToTimelineItem carries owners', () => {
  it('keeps every member of assigned_to_all', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] })
    expect(routineToTimelineItem(r, DATE).owners).toEqual(['scott', 'iris'])
  })

  it('falls back to assigned_to', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: null })
    expect(routineToTimelineItem(r, DATE).owners).toEqual(['scott'])
  })

  it('is empty for an unassigned routine', () => {
    const r = createMockRoutine({ assigned_to: null, assigned_to_all: null })
    expect(routineToTimelineItem(r, DATE).owners).toEqual([])
  })

  it('leaves the legacy assignedTo field alone', () => {
    const r = createMockRoutine({ assigned_to: 'scott', assigned_to_all: ['scott', 'iris'] })
    expect(routineToTimelineItem(r, DATE).assignedTo).toBe('scott')
  })
})
