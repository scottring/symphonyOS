import { describe, it, expect } from 'vitest'
import { wallQuickAdd } from './wallQuickAdd'

const WED = new Date(2026, 9, 21, 15, 0)

describe('wallQuickAdd', () => {
  it('keeps the day the capture showed, all day, and says it', () => {
    const sat = new Date(2026, 9, 24)
    const a = wallQuickAdd({ title: 'Return library book', scheduledFor: sat, isAllDay: true }, WED)
    expect(a.when).toEqual(sat)
    expect(a.options).toMatchObject({ context: 'family', isAllDay: true })
    expect(a.flash).toBe('Added: Return library book · Sat, Oct 24')
  })

  it('keeps a time, and names today and tomorrow plainly', () => {
    const a = wallQuickAdd({ title: 'Call the plumber', scheduledFor: new Date(2026, 9, 22, 10), isAllDay: false }, WED)
    expect(a.options.isAllDay).toBe(false)
    expect(a.flash).toBe('Added: Call the plumber · Tomorrow at 10:00')
  })

  it('assigns the people it named', () => {
    const a = wallQuickAdd({ title: 'Practice piano', assignedMemberIds: ['ella', 'kaleb'] }, WED)
    expect(a.options).toMatchObject({ assignedTo: 'ella', assignedToAll: ['ella', 'kaleb'] })
  })

  it('with no day it goes to the inbox and says so', () => {
    const a = wallQuickAdd({ title: 'Fix the gate' }, WED)
    expect(a.when).toBeUndefined()
    expect(a.flash).toBe('Added: Fix the gate · no day yet')
  })

  it('a repeat is not set from the wall: one day, and it says so', () => {
    const a = wallQuickAdd({ title: 'Swim', scheduledFor: new Date(2026, 9, 27), isAllDay: true, recurrence: { type: 'weekly' } as never }, WED)
    expect(a.flash).toBe('Added: Swim · Tue, Oct 27 only (set repeats in the app)')
  })
})
