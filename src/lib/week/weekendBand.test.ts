import { describe, it, expect } from 'vitest'
import { weekendBand, sometimeThisWeekend } from './weekendBand'
import { createMockRoutine } from '@/test/mocks/factories'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const week = (start: Date) => Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))

// Where the weekend sits in a week (spec §1): Saturday then Sunday, both inside.
describe('weekendBand', () => {
  it('a Saturday-start week leads with it', () => expect(weekendBand(week(d(2026, 10, 3)))).toEqual({ satIndex: 0, sunIndex: 1 }))
  it('a Monday-start week ends with it', () => expect(weekendBand(week(d(2026, 10, 5)))).toEqual({ satIndex: 5, sunIndex: 6 }))
  it('a Sunday-start week splits two weekends: no band', () => expect(weekendBand(week(d(2026, 10, 4)))).toBeNull())
})

// Scott, 2026-10-03: weekend chores showing on both days is "mind-numbing".
describe('sometimeThisWeekend', () => {
  const weekend = { sat: d(2026, 10, 3), sun: d(2026, 10, 4) }
  const win = createMockRoutine({ id: 'w', name: 'Yard weeding', recurrence_pattern: { type: 'weekend' } })
  const both = createMockRoutine({ id: 'b', name: 'Kids laundry', recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] } })
  const none = () => ({ planned: false, completed: false })
  const shows = () => true

  it('holds a Weekend-rule routine with no day and not done, once', () => {
    expect(sometimeThisWeekend({ routines: [win, both], weekend, dayState: none, shows }).map((r) => r.id)).toEqual(['w'])
  })
  it('lets it go once it is done on either day', () => {
    const doneSat = (id: string, key: string) => ({ planned: false, completed: id === 'w' && key === '2026-10-03' })
    expect(sometimeThisWeekend({ routines: [win], weekend, dayState: doneSat, shows })).toEqual([])
  })
  it('lets it go once it has been given a day', () => {
    const plannedSun = (id: string, key: string) => ({ planned: id === 'w' && key === '2026-10-04', completed: false })
    expect(sometimeThisWeekend({ routines: [win], weekend, dayState: plannedSun, shows })).toEqual([])
  })
  it('leaves out a routine that shows on neither day (an off weekend, hidden, someone else’s)', () => {
    expect(sometimeThisWeekend({ routines: [win], weekend, dayState: none, shows: () => false })).toEqual([])
  })
})
