import { describe, it, expect } from 'vitest'
import type { TodayDataInput, TodayData } from './types'
import { EMPTY_TODAY_DATA, SECTIONS_ORDER } from './types'

describe('today types', () => {
  it('EMPTY_TODAY_DATA has the documented zeroed shape', () => {
    expect(EMPTY_TODAY_DATA.isToday).toBe(false)
    expect(EMPTY_TODAY_DATA.overdueTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.attentionItems).toEqual([])
    expect(EMPTY_TODAY_DATA.sectionsOrder).toEqual(['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled'])
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

describe('SECTIONS_ORDER', () => {
  it('runs all-day, then chronologically, then unscheduled', () => {
    expect(SECTIONS_ORDER).toEqual([
      'allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled',
    ])
  })

  it('EMPTY_TODAY_DATA has a bucket for every section', () => {
    for (const s of SECTIONS_ORDER) {
      expect(EMPTY_TODAY_DATA.grouped[s], s).toEqual([])
    }
  })
})
