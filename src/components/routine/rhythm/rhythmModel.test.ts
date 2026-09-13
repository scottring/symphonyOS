import { describe, it, expect } from 'vitest'
import { buildRhythmModel, minutesOf } from './rhythmModel'
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
    context: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('minutesOf', () => {
  it('parses HH:MM:SS and rejects null', () => {
    expect(minutesOf('06:30:00')).toBe(390)
    expect(minutesOf(null)).toBeNull()
  })
})

describe('buildRhythmModel bucketing', () => {
  it('the day reads in order: timed by the clock, then whatever has no time', () => {
    const m = buildRhythmModel([
      mk({ id: 'late', time_of_day: '18:00:00' }),
      mk({ id: 'anytime', time_of_day: null }),
      mk({ id: 'early', time_of_day: '06:30:00' }),
    ])
    expect(m.daily.map(r => r.id)).toEqual(['early', 'late', 'anytime'])
  })

  it('treats weekly with >=5 days as daily, fewer as weekly', () => {
    const m = buildRhythmModel([
      mk({ id: 'wd', recurrence_pattern: { type: 'weekly', days: ['mon','tue','wed','thu','fri'] }, time_of_day: '17:15:00' }),
      mk({ id: 'w2', recurrence_pattern: { type: 'weekly', days: ['mon','wed'] } }),
    ])
    expect(m.daily.map(r => r.id)).toEqual(['wd'])
    expect(m.week.map(r => r.id)).toEqual(['w2'])
  })

  it('a routine on several days is ONE row, not one per day', () => {
    // The day strip repeated a Tue/Thu/Sat routine into three columns; a row
    // says "Tuesday, Thursday, Saturday" once (Scott, 2026-09-13).
    const m = buildRhythmModel([
      mk({ id: 'shower', recurrence_pattern: { type: 'weekly', days: ['tue', 'thu', 'sat'] } }),
    ])
    expect(m.week.map(r => r.id)).toEqual(['shower'])
  })

  it('a weekly routine with no day chosen is still a weekly commitment', () => {
    const m = buildRhythmModel([mk({ id: 'w', recurrence_pattern: { type: 'weekly' } })])
    expect(m.week.map(r => r.id)).toEqual(['w'])
  })

  it('sends resting weekly routines to Resting only', () => {
    const m = buildRhythmModel([
      mk({ id: 'p', visibility: 'reference', recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ])
    expect(m.resting.map(r => r.id)).toEqual(['p'])
    expect(m.week).toHaveLength(0)
  })

  // Past the week the ladder has four rungs, not one: a monthly routine and a
  // once-every-five-years one are not the same kind of commitment (Scott,
  // 2026-09-13).
  it('gives each cadence past the week its own rung', () => {
    const m = buildRhythmModel([
      mk({ id: 'mo', recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
      mk({ id: 'qu', recurrence_pattern: { type: 'quarterly', day_of_month: 1 } }),
      mk({ id: 'yr', recurrence_pattern: { type: 'yearly', month_of_year: 3 } }),
      mk({ id: 'rare', recurrence_pattern: { type: 'yearly', interval: 3 } }),
      mk({ id: 'sp', recurrence_pattern: { type: 'specific_days', dates: ['2026-08-01'] } }),
    ])
    expect(m.month.map(r => r.id)).toEqual(['mo'])
    expect(m.season.map(r => r.id)).toEqual(['qu'])
    expect(m.year.map(r => r.id).sort()).toEqual(['sp', 'yr'])
    expect(m.rare.map(r => r.id)).toEqual(['rare'])
  })

  it('a biweekly routine stays on the WEEK rung — it still happens on a weekday', () => {
    const m = buildRhythmModel([
      mk({ id: 'bi', recurrence_pattern: { type: 'weekly', days: ['tue'], interval: 2 } }),
    ])
    expect(m.week.map(r => r.id)).toEqual(['bi'])
    expect(m.month).toHaveLength(0)
  })

  it("'every 3 months' is seasonal and 'every 18 months' is rarer than a year", () => {
    const m = buildRhythmModel([
      mk({ id: 'q', recurrence_pattern: { type: 'monthly', interval: 3 } }),
      mk({ id: 'r', recurrence_pattern: { type: 'monthly', interval: 18 } }),
    ])
    expect(m.season.map(r => r.id)).toEqual(['q'])
    expect(m.rare.map(r => r.id)).toEqual(['r'])
  })

  it('a since_last routine lands by the span it names', () => {
    const m = buildRhythmModel([
      mk({ id: 'w', recurrence_pattern: { type: 'since_last', interval: 1, unit: 'weeks' } }),
      mk({ id: 'm', recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' } }),
      mk({ id: 'y', recurrence_pattern: { type: 'since_last', interval: 12, unit: 'months' } }),
    ])
    expect(m.week.map(r => r.id)).toEqual(['w'])
    expect(m.month.map(r => r.id)).toEqual(['m'])
    expect(m.year.map(r => r.id)).toEqual(['y'])
  })

  it('sends paused (reference) top-level routines to Resting regardless of recurrence', () => {
    const m = buildRhythmModel([
      mk({ id: 'p', visibility: 'reference', time_of_day: '07:00:00' }),
    ])
    expect(m.resting.map(r => r.id)).toEqual(['p'])
    expect(m.daily).toHaveLength(0)
  })

  it('never buckets steps as their own items but counts them per collection', () => {
    const m = buildRhythmModel([
      mk({ id: 'parent', name: 'School AM', time_of_day: '07:00:00' }),
      mk({ id: 's1', parent_routine_id: 'parent' }),
      mk({ id: 's2', parent_routine_id: 'parent' }),
    ])
    const all = [
      ...m.daily.map(r => r.id),
      ...m.week.map(r => r.id),
      ...m.month.map(r => r.id),
      ...m.season.map(r => r.id),
      ...m.year.map(r => r.id),
      ...m.rare.map(r => r.id),
      ...m.resting.map(r => r.id),
    ]
    expect(all).not.toContain('s1')
    expect(m.stepCounts['parent']).toBe(2)
    // A collection is ONE row, counted by its steps — not a card of children.
    expect(m.daily.map(r => r.id)).toContain('parent')
  })
})

describe('buildRhythmModel person filter', () => {
  it('filters by assigned_to_all with legacy assigned_to fallback', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'multi', assigned_to_all: ['iris'], time_of_day: '09:00:00' }),
        mk({ id: 'legacy', assigned_to: 'iris', assigned_to_all: null, time_of_day: '10:30:00' }),
        mk({ id: 'other', assigned_to_all: ['scott'], time_of_day: '11:00:00' }),
        mk({ id: 'nobody', time_of_day: '12:00:00' }),
      ],
      { memberIds: ['iris'] },
    )
    const ids = m.daily.map(r => r.id)
    expect(ids.sort()).toEqual(['legacy', 'multi'])
  })

  it('keeps a collection when any step matches the member', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'coll', time_of_day: '07:00:00' }),
        mk({ id: 'st', parent_routine_id: 'coll', assigned_to_all: ['kaleb'] }),
      ],
      { memberIds: ['kaleb'] },
    )
    expect(m.daily.map(c => c.id)).toEqual(['coll'])
  })

  // Scott, 2026-09-07: "can we multiselect whose week in Routines?" Two names
  // selected means both weeks laid over each other — anything either of them
  // is on — not only what they share.
  it('unions the selected people rather than intersecting them', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'hers', assigned_to_all: ['iris'], time_of_day: '09:00:00' }),
        mk({ id: 'his', assigned_to: 'kaleb', assigned_to_all: null, time_of_day: '10:00:00' }),
        mk({ id: 'theirs', assigned_to_all: ['iris', 'kaleb'], time_of_day: '11:00:00' }),
        mk({ id: 'someone-else', assigned_to_all: ['scott'], time_of_day: '12:00:00' }),
      ],
      { memberIds: ['iris', 'kaleb'] },
    )
    const ids = m.daily.map(r => r.id)
    expect(ids.sort()).toEqual(['hers', 'his', 'theirs'])
  })

  it('an empty selection is Everyone', () => {
    const routines = [
      mk({ id: 'a', assigned_to_all: ['iris'], time_of_day: '09:00:00' }),
      mk({ id: 'b', time_of_day: '10:00:00' }),
    ]
    const ids = buildRhythmModel(routines, { memberIds: [] }).daily.map(r => r.id)
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('shows unassigned routines only under Everyone', () => {
    const all = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })])
    const iris = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })], { memberIds: ['iris'] })
    expect(all.daily).toHaveLength(1)
    expect(iris.daily).toHaveLength(0)
  })
})
