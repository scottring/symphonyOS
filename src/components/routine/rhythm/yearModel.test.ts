import { describe, it, expect } from 'vitest'
import { buildYearModel } from './yearModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`,
    user_id: 'u1',
    name: `Routine ${seq}`,
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    scope: 'individual',
    context: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

/** Sep 5 2026 — the reference "now" for every test in this file. */
const NOW = new Date('2026-09-05T12:00:00')

/** buildRhythmModel splits the zone by visibility before handing it over; the
 *  tests mirror that split rather than re-deriving it. */
function zone(routines: Routine[]) {
  return {
    active: routines.filter(r => r.visibility !== 'reference'),
    resting: routines.filter(r => r.visibility === 'reference'),
  }
}

/** Names in the column whose month/year matches. */
function namesIn(
  model: ReturnType<typeof buildYearModel>,
  month: number,
  year: number,
): string[] {
  const col = model.months.find(m => m.month === month && m.year === year)
  return col ? col.entries.map(e => e.routine.name) : []
}

describe('buildYearModel — the rolling window', () => {
  it('opens on the current month and runs twelve forward', () => {
    const m = buildYearModel(zone([]), { now: NOW })

    expect(m.months).toHaveLength(12)
    expect(m.months[0]).toMatchObject({ month: 9, year: 2026, isCurrent: true })
    expect(m.months[11]).toMatchObject({ month: 8, year: 2027, isCurrent: false })
  })
})

describe('buildYearModel — placement', () => {
  it('pools monthly routines instead of listing them twelve times', () => {
    const m = buildYearModel(
      zone([mk({ name: 'Pay FFG', recurrence_pattern: { type: 'monthly', day_of_month: 1 } })]),
      { now: NOW },
    )

    expect(m.everyMonth.map(r => r.name)).toEqual(['Pay FFG'])
    expect(m.months.every(col => col.entries.length === 0)).toBe(true)
  })

  it('places a yearly routine in its one month', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Storm windows',
        recurrence_pattern: { type: 'yearly', month_of_year: 10, day_of_month: 12 },
      })]),
      { now: NOW },
    )

    expect(namesIn(m, 10, 2026)).toEqual(['Storm windows'])
    expect(m.months.filter(c => c.entries.length > 0)).toHaveLength(1)
  })

  it('places a yearly routine whose month already passed into next year’s column', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Prune hydrangeas',
        recurrence_pattern: { type: 'yearly', month_of_year: 3, day_of_month: 1 },
      })]),
      { now: NOW },
    )

    expect(namesIn(m, 3, 2027)).toEqual(['Prune hydrangeas'])
  })

  it('places a specific_days routine in every month it names, and only those', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Quarterly tax',
        recurrence_pattern: { type: 'specific_days', dates: ['2026-10-15', '2027-01-15'] },
      })]),
      { now: NOW },
    )

    expect(namesIn(m, 10, 2026)).toEqual(['Quarterly tax'])
    expect(namesIn(m, 1, 2027)).toEqual(['Quarterly tax'])
    expect(m.months.filter(c => c.entries.length > 0)).toHaveLength(2)
  })

  it('places a quarterly routine in the four months it lands on', () => {
    const m = buildYearModel(
      zone([mk({ name: 'Furnace filter', recurrence_pattern: { type: 'quarterly', day_of_month: 1 } })]),
      { now: NOW },
    )

    // quarterly is Jan/Apr/Jul/Oct; from Sep 2026 the window catches Oct, Jan, Apr, Jul.
    expect(m.months.filter(c => c.entries.length > 0).map(c => c.month).sort((a, b) => a - b))
      .toEqual([1, 4, 7, 10])
  })

  it('ignores daily and weekly routines — the arc and the week strip own those', () => {
    const m = buildYearModel(
      zone([
        mk({ name: 'Walk Jax', recurrence_pattern: { type: 'daily' } }),
        mk({ name: 'Yard weeding', recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      ]),
      { now: NOW },
    )

    expect(m.everyMonth).toEqual([])
    expect(m.months.every(col => col.entries.length === 0)).toBe(true)
  })
})

describe('buildYearModel — drifting routines', () => {
  it('places an interval routine once, at its next due month, marked drifting', () => {
    const m = buildYearModel(
      zone([mk({
        id: 'haircut',
        name: 'Kaleb haircut',
        recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' },
      })]),
      { now: NOW, lastCompletionByRoutine: { haircut: new Date('2026-09-01T00:00:00') } },
    )

    // Sep 1 + 6 weeks = Oct 13.
    expect(namesIn(m, 10, 2026)).toEqual(['Kaleb haircut'])
    expect(m.months.filter(c => c.entries.length > 0)).toHaveLength(1)
    expect(m.months.find(c => c.month === 10)!.entries[0].drifting).toBe(true)
  })

  it('treats a never-completed interval routine as due in the current month', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Descale the kettle',
        recurrence_pattern: { type: 'since_last', interval: 3, unit: 'months' },
      })]),
      { now: NOW },
    )

    expect(namesIn(m, 9, 2026)).toEqual(['Descale the kettle'])
  })
})

describe('buildYearModel — resting routines', () => {
  it('places a resting routine in the month it wakes, not the month it recurs', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Open the spigots',
        visibility: 'reference',
        paused_until: '2027-04-01T00:00:00Z',
        recurrence_pattern: { type: 'yearly', month_of_year: 10, day_of_month: 1 },
      })]),
      { now: NOW },
    )

    expect(namesIn(m, 4, 2027)).toEqual(['Open the spigots'])
    expect(namesIn(m, 10, 2026)).toEqual([])
    expect(m.months.find(c => c.month === 4)!.entries[0].resting).toBe(true)
  })

  it('leaves a resting routine with no wake date unplaced', () => {
    const m = buildYearModel(
      zone([mk({
        name: 'Someday sourdough',
        visibility: 'reference',
        paused_until: null,
        recurrence_pattern: { type: 'yearly', month_of_year: 10, day_of_month: 1 },
      })]),
      { now: NOW },
    )

    expect(m.months.every(col => col.entries.length === 0)).toBe(true)
    expect(m.unplaced.map(r => r.name)).toEqual(['Someday sourdough'])
  })
})
