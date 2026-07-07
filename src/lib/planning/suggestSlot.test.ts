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
  const morning = new Date(2026, 6, 7, 8, 0)   // 8:00 AM
  const midday = new Date(2026, 6, 7, 13, 0)   // 1:00 PM
  const evening = new Date(2026, 6, 7, 18, 30) // 6:30 PM
  const lateNight = new Date(2026, 6, 7, 22, 0)

  it('suggests afternoon for errands and chores (while afternoon has room)', () => {
    expect(suggestSlot({ category: 'errand' }, morning)?.slot).toBe('afternoon')
    expect(suggestSlot({ category: 'chore' }, midday)?.slot).toBe('afternoon')
    // Afternoon gone → errands fold into the evening
    expect(suggestSlot({ category: 'errand' }, evening)?.slot).toBe('evening')
  })

  it('defaults to the earliest slot that still has room', () => {
    expect(suggestSlot({}, morning)?.slot).toBe('morning')
    expect(suggestSlot({ category: 'task' }, midday)?.slot).toBe('afternoon') // morning is over
    expect(suggestSlot({ category: null }, evening)?.slot).toBe('evening')
  })

  it('never suggests a slot that has already passed', () => {
    expect(suggestSlot({}, midday)?.slot).not.toBe('morning')
    expect(suggestSlot({}, evening)?.slot).toBe('evening')
  })

  it('goes quiet late at night instead of suggesting nonsense', () => {
    expect(suggestSlot({}, lateNight)).toBeNull()
    expect(suggestSlot({ category: 'errand' }, lateNight)).toBeNull()
  })

  it('leans business hours for calls and evening for conversations', () => {
    expect(suggestSlot({ title: 'Call the pediatrician' }, morning)?.slot).toBe('morning')
    expect(suggestSlot({ title: 'Call the pediatrician' }, midday)?.slot).toBe('afternoon')
    expect(suggestSlot({ title: 'Talk to Iris about donations' }, morning)?.slot).toBe('evening')
  })

  it('always returns a reason when it suggests', () => {
    expect(suggestSlot({}, morning)?.reason).toBeTruthy()
    expect(suggestSlot({ category: 'errand' }, morning)?.reason).toBeTruthy()
  })

  it('copy varies by slot (no single canned line)', () => {
    const a = suggestSlot({}, morning)?.reason
    const b = suggestSlot({}, midday)?.reason
    const c = suggestSlot({}, evening)?.reason
    expect(new Set([a, b, c]).size).toBe(3)
  })
})
