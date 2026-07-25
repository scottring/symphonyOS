// src/lib/today/parity.test.ts
import { describe, it, expect } from 'vitest'
import { computeTodayData } from './computeTodayData'
import { mixedDayInput, mixedDayExpected } from './__fixtures__/todayScenarios'
import { SECTIONS_ORDER } from './types'

describe('parity: computeTodayData reproduces legacy TodaySchedule output', () => {
  const d = computeTodayData(mixedDayInput)

  it('isToday', () => {
    expect(d.isToday).toBe(mixedDayExpected.isToday)
  })
  it('grouped section membership matches legacy grouping', () => {
    for (const s of SECTIONS_ORDER) {
      expect(d.grouped[s].map(i => i.title)).toEqual(mixedDayExpected.groupedTitles[s])
    }
  })
  it('week / inbox / overdue pools match', () => {
    expect(d.weekTasks.map(t => t.id)).toEqual(mixedDayExpected.weekIds)
    expect(d.inboxTasks.map(t => t.id)).toEqual(mixedDayExpected.inboxIds)
    expect(d.overdueTasks.map(t => t.id).sort()).toEqual([...mixedDayExpected.overdueIds].sort())
  })
  it('counts match legacy formulas', () => {
    expect(d.counts.actionableCount).toBe(mixedDayExpected.counts.actionableCount)
    expect(d.counts.completedCount).toBe(mixedDayExpected.counts.completedCount)
    expect(d.counts.incompleteOverdue).toBe(mixedDayExpected.counts.incompleteOverdue)
  })
})
