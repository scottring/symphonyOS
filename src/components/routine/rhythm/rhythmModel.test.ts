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
  it('puts timed daily routines on the arc and untimed in anytime', () => {
    const m = buildRhythmModel([
      mk({ id: 'a', time_of_day: '06:30:00' }),
      mk({ id: 'b', time_of_day: null }),
    ])
    expect(m.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(['a'])
    expect(m.daily.anytime.map(r => r.id)).toEqual(['b'])
  })

  it('treats weekly with >=5 days as daily, fewer as week-strip', () => {
    const m = buildRhythmModel([
      mk({ id: 'wd', recurrence_pattern: { type: 'weekly', days: ['mon','tue','wed','thu','fri'] }, time_of_day: '17:15:00' }),
      mk({ id: 'w2', recurrence_pattern: { type: 'weekly', days: ['mon','wed'] } }),
    ])
    expect(m.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(['wd'])
    expect(m.week.days.mon.map(r => r.id)).toEqual(['w2'])
    expect(m.week.days.wed.map(r => r.id)).toEqual(['w2'])
  })

  it('puts weekly-without-days into sometime-this-week', () => {
    const m = buildRhythmModel([mk({ id: 'w', recurrence_pattern: { type: 'weekly' } })])
    expect(m.week.sometime.map(r => r.id)).toEqual(['w'])
  })

  it('sends resting weekly routines to seasonal only, not the week columns', () => {
    const m = buildRhythmModel([
      mk({ id: 'p', visibility: 'reference', recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ])
    expect(m.seasonal.map(r => r.id)).toEqual(['p'])
    expect(m.week.days.mon).toHaveLength(0)
  })

  it('derives the day column from start_date when weekly days are empty', () => {
    // 2026-07-25 is a Saturday — the real "library every 2 weeks" shape.
    const m = buildRhythmModel([
      mk({ id: 'lib', recurrence_pattern: { type: 'weekly', days: [], interval: 2, start_date: '2026-07-25' } }),
    ])
    expect(m.week.days.sat.map(r => r.id)).toEqual(['lib'])
    expect(m.week.sometime).toHaveLength(0)
  })

  it('puts monthly/yearly/specific_days into sometimes', () => {
    const m = buildRhythmModel([
      mk({ id: 'mo', recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
      mk({ id: 'sp', recurrence_pattern: { type: 'specific_days', dates: ['2026-08-01'] } }),
    ])
    expect(m.sometimes.map(r => r.id).sort()).toEqual(['mo', 'sp'])
  })

  it('sends paused (reference) top-level routines to seasonal regardless of recurrence', () => {
    const m = buildRhythmModel([
      mk({ id: 'p', visibility: 'reference', time_of_day: '07:00:00' }),
    ])
    expect(m.seasonal.map(r => r.id)).toEqual(['p'])
    expect(m.daily.timed).toHaveLength(0)
  })

  it('never buckets steps as their own items but counts them per collection', () => {
    const m = buildRhythmModel([
      mk({ id: 'parent', name: 'School AM', time_of_day: '07:00:00' }),
      mk({ id: 's1', parent_routine_id: 'parent' }),
      mk({ id: 's2', parent_routine_id: 'parent' }),
    ])
    const all = [
      ...m.daily.timed.map(c => c.id),
      ...m.daily.anytime.map(r => r.id),
      ...m.week.sometime.map(r => r.id),
      ...m.sometimes.map(r => r.id),
    ]
    expect(all).not.toContain('s1')
    expect(m.stepCounts['parent']).toBe(2)
    const card = m.daily.timed.find(c => c.id === 'parent')
    expect(card?.kind).toBe('collection')
    expect(card?.routines.map(r => r.id)).toEqual(['s1', 's2'])
    expect(card?.routine?.id).toBe('parent')
  })
})

describe('buildRhythmModel clustering', () => {
  it('clusters loose daily routines within 45 minutes, splits on bigger gaps', () => {
    const m = buildRhythmModel([
      mk({ id: 'a', time_of_day: '06:30:00' }),
      mk({ id: 'b', time_of_day: '07:00:00' }),
      mk({ id: 'c', time_of_day: '09:00:00' }),
    ])
    expect(m.daily.timed).toHaveLength(2)
    expect(m.daily.timed[0]).toMatchObject({ kind: 'cluster', startTime: '06:30:00', endTime: '07:00:00' })
    expect(m.daily.timed[1]).toMatchObject({ kind: 'single' })
  })

  it('suggests a daypart name for every cluster', () => {
    const m = buildRhythmModel([
      mk({ time_of_day: '19:00:00' }),
      mk({ time_of_day: '19:05:00' }),
      mk({ time_of_day: '19:10:00' }),
    ])
    expect(m.daily.timed[0].suggestedName).toBe('Bedtime')
    const m2 = buildRhythmModel([
      mk({ time_of_day: '06:00:00' }),
      mk({ time_of_day: '06:10:00' }),
    ])
    expect(m2.daily.timed[0].suggestedName).toBe('Morning')
  })

  it('never merges a collection into a cluster', () => {
    const m = buildRhythmModel([
      mk({ id: 'coll', time_of_day: '06:45:00' }),
      mk({ id: 'st', parent_routine_id: 'coll' }),
      mk({ id: 'loose', time_of_day: '06:50:00' }),
    ])
    expect(m.daily.timed).toHaveLength(2)
    expect(m.daily.timed.find(c => c.id === 'coll')?.kind).toBe('collection')
  })

  it('sorts arc cards by start time', () => {
    const m = buildRhythmModel([
      mk({ id: 'late', time_of_day: '18:00:00' }),
      mk({ id: 'early', time_of_day: '06:00:00' }),
    ])
    expect(m.daily.timed.map(c => c.routines[0].id)).toEqual(['early', 'late'])
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
      { memberId: 'iris' },
    )
    const ids = m.daily.timed.flatMap(c => c.routines.map(r => r.id))
    expect(ids.sort()).toEqual(['legacy', 'multi'])
  })

  it('keeps a collection when any step matches the member', () => {
    const m = buildRhythmModel(
      [
        mk({ id: 'coll', time_of_day: '07:00:00' }),
        mk({ id: 'st', parent_routine_id: 'coll', assigned_to_all: ['kaleb'] }),
      ],
      { memberId: 'kaleb' },
    )
    expect(m.daily.timed.map(c => c.id)).toEqual(['coll'])
  })

  it('shows unassigned routines only under Everyone', () => {
    const all = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })])
    const iris = buildRhythmModel([mk({ id: 'n', time_of_day: '08:00:00' })], { memberId: 'iris' })
    expect(all.daily.timed).toHaveLength(1)
    expect(iris.daily.timed).toHaveLength(0)
  })
})

describe('buildRhythmModel focus day', () => {
  it("adds the focused day's weekly routines to the arc, at their times", () => {
    const bedtime = mk({ id: 'bed', name: 'Kids Bedtime', recurrence_pattern: { type: 'weekly', days: ['wed', 'fri'] }, time_of_day: '19:15:00' })
    const errand = mk({ id: 'err', name: 'Recycling out', recurrence_pattern: { type: 'weekly', days: ['wed'] } })
    const daily = mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' })

    const plain = buildRhythmModel([bedtime, errand, daily])
    expect(plain.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(['walk'])
    expect(plain.daily.anytime).toEqual([])

    const wed = buildRhythmModel([bedtime, errand, daily], { focusDay: 'wed' })
    expect(wed.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(expect.arrayContaining(['walk', 'bed']))
    expect(wed.daily.anytime.map(r => r.id)).toEqual(['err'])
    // still present in the week columns — focus augments the arc, not the strip
    expect(wed.week.days.wed.map(r => r.id)).toEqual(expect.arrayContaining(['bed', 'err']))

    const fri = buildRhythmModel([bedtime, errand, daily], { focusDay: 'fri' })
    expect(fri.daily.anytime).toEqual([])
    expect(fri.daily.timed.flatMap(c => c.routines.map(r => r.id))).toEqual(expect.arrayContaining(['walk', 'bed']))
    expect(fri.daily.timed.flatMap(c => c.routines.map(r => r.id))).not.toContain('err')
  })
})
