import { describe, it, expect } from 'vitest'
import { slotTime, suggestSlot } from './suggestSlot'

describe('slotTime', () => {
  const date = new Date(2026, 5, 28, 13, 30, 0, 0) // any time of day

  it('maps slots to representative hours', () => {
    expect(slotTime(date, 'morning').getHours()).toBe(9)
    expect(slotTime(date, 'afternoon').getHours()).toBe(14)
    expect(slotTime(date, 'evening').getHours()).toBe(19)
  })

  it('zeroes minutes/seconds and keeps the date', () => {
    const t = slotTime(date, 'afternoon')
    expect(t.getMinutes()).toBe(0)
    expect(t.getDate()).toBe(28)
    expect(t.getHours()).not.toBe(0) // non-midnight → persists as timed, not all-day
  })
})

describe('suggestSlot', () => {
  it('suggests afternoon for errands and chores', () => {
    expect(suggestSlot({ category: 'errand' }).slot).toBe('afternoon')
    expect(suggestSlot({ category: 'chore' }).slot).toBe('afternoon')
  })

  it('defaults to morning otherwise', () => {
    expect(suggestSlot({}).slot).toBe('morning')
    expect(suggestSlot({ category: 'task' }).slot).toBe('morning')
    expect(suggestSlot({ category: null }).slot).toBe('morning')
  })

  it('always returns a reason', () => {
    expect(suggestSlot({}).reason).toBeTruthy()
    expect(suggestSlot({ category: 'errand' }).reason).toBeTruthy()
  })
})
