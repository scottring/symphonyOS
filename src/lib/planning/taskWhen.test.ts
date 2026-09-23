import { describe, it, expect } from 'vitest'
import { taskWhenLabel, taskWhenParts } from './taskWhen'

const WED = new Date(2026, 8, 23, 9, 0) // Wed 23 Sep 2026

describe('taskWhenLabel', () => {
  it('says so plainly when a task has no day and no period', () => {
    expect(taskWhenLabel({}, WED)).toBe('No date yet')
  })

  it('names today and tomorrow rather than their dates', () => {
    expect(taskWhenLabel({ scheduledFor: new Date(2026, 8, 23, 14, 0) }, WED)).toBe('Today · 2:00 PM')
    expect(taskWhenLabel({ scheduledFor: new Date(2026, 8, 24), isAllDay: true }, WED)).toBe('Tomorrow · all day')
  })

  it('keeps the week commitment beside the day it was given (S1-14)', () => {
    // The walk confirmed the data survives; the pane has to show it, or
    // choosing a day looks like it consumed the week.
    const parts = taskWhenParts(
      { scheduledFor: new Date(2026, 8, 25), isAllDay: true, weekStart: new Date(2026, 8, 20) }, WED)
    expect(parts).toEqual(['Fri, Sep 25 · all day', 'Week of Sep 20'])
  })

  it('leaves a weekend two days wide instead of inventing a Saturday', () => {
    expect(taskWhenLabel({ weekStart: new Date(2026, 8, 20), weekendStart: new Date(2026, 8, 26) }, WED))
      .toBe('Weekend · Sep 26–Sep 27')
  })

  it('reads a month or season commitment outermost', () => {
    expect(taskWhenLabel({ monthStart: new Date(2026, 8, 1) }, WED)).toBe('September')
    expect(taskWhenLabel({ seasonStart: new Date(2026, 8, 1) }, WED)).toBe('September 2026')
  })
})
