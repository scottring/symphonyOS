import { describe, it, expect } from 'vitest'
import type { TodayDataInput, TodayData } from './types'
import { EMPTY_TODAY_DATA } from './types'

describe('today types', () => {
  it('EMPTY_TODAY_DATA has the documented zeroed shape', () => {
    expect(EMPTY_TODAY_DATA.isToday).toBe(false)
    expect(EMPTY_TODAY_DATA.overdueTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.weekTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.inboxTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
    expect(EMPTY_TODAY_DATA.counts).toEqual({
      completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0,
    })
    for (const s of EMPTY_TODAY_DATA.sectionsOrder) {
      expect(EMPTY_TODAY_DATA.grouped[s]).toEqual([])
    }
  })
  it('type-only check compiles', () => {
    const _i = null as unknown as TodayDataInput
    const _d = null as unknown as TodayData
    expect(true).toBe(true)
  })
})
