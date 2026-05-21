import { describe, it, expect } from 'vitest'
import { layoutWeekLanes } from './layoutLanes'

describe('layoutWeekLanes', () => {
  const weekStart = new Date('2026-05-18T00:00:00') // Monday

  it('returns empty array for empty input', () => {
    expect(layoutWeekLanes([], weekStart, 7)).toEqual([])
  })
})
