import { describe, it, expect } from 'vitest'
import { allDayLaneHeight, allDayLaneCapacity, ALL_DAY_LANE_HEIGHT } from '@/lib/planning/allDayLane'

// The week rung places by DAY, so every week placement lands in the all-day
// lane. These two functions are what keep a placement visible instead of
// collapsing behind a "+N" the moment a day has three things on it.
describe('allDayLaneHeight', () => {
  it('an empty or single-chip day is the original one-row lane', () => {
    expect(allDayLaneHeight(0)).toBe(ALL_DAY_LANE_HEIGHT)
    expect(allDayLaneHeight(1)).toBe(ALL_DAY_LANE_HEIGHT)
  })

  it('grows a row per readable chip', () => {
    expect(allDayLaneHeight(2)).toBeGreaterThan(allDayLaneHeight(1))
    expect(allDayLaneHeight(3)).toBeGreaterThan(allDayLaneHeight(2))
    expect(allDayLaneHeight(4)).toBeGreaterThan(allDayLaneHeight(3))
  })

  it('stops growing — a lane taller than five rows would eat the hour grid', () => {
    expect(allDayLaneHeight(5)).toBe(allDayLaneHeight(20))
  })
})

describe('allDayLaneCapacity', () => {
  it('round-trips with the height: a lane sized for N shows N', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(allDayLaneCapacity(allDayLaneHeight(n))).toBeGreaterThanOrEqual(n)
    }
  })

  it('caps out, so a very busy day still truncates rather than growing forever', () => {
    expect(allDayLaneCapacity(allDayLaneHeight(50))).toBe(5)
  })
})
