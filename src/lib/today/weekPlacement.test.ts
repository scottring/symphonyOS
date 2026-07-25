import { describe, it, expect } from 'vitest'
import { belongsToWeek } from './weekPlacement'

const JUL_19 = new Date(2026, 6, 19) // Sunday
const JUL_26 = new Date(2026, 6, 26) // the next Sunday

describe('belongsToWeek', () => {
  it('a task placed on the viewed week belongs to it', () => {
    expect(belongsToWeek({ weekStart: new Date(2026, 6, 19) }, JUL_19)).toBe(true)
  })

  it('a task placed on a DIFFERENT week does not', () => {
    expect(belongsToWeek({ weekStart: JUL_26 }, JUL_19)).toBe(false)
    expect(belongsToWeek({ weekStart: JUL_19 }, JUL_26)).toBe(false)
  })

  // The no-backfill promise: every row that existed before the cascade shipped
  // has week_start NULL, and its old meaning was the implicit "the current week".
  // Scoping those to one week would make an existing week plan vanish.
  it('a task with no weekStart belongs to whatever week is viewed', () => {
    expect(belongsToWeek({ weekStart: undefined }, JUL_19)).toBe(true)
    expect(belongsToWeek({ weekStart: undefined }, JUL_26)).toBe(true)
  })

  it('compares the calendar day, not the instant — a stamped time never splits a week', () => {
    // A weekStart that somehow carries a time still belongs to its own week.
    expect(belongsToWeek({ weekStart: new Date(2026, 6, 19, 14, 30) }, JUL_19)).toBe(true)
  })
})
