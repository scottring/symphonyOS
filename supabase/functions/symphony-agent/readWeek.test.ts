import { describe, expect, it } from 'vitest'
import { shapeWeek, weekWindow } from './readWeek'

const t = (x: Record<string, unknown>) => ({ id: 'x', title: 'X', scheduled_for: null, is_all_day: null, bucket: 'inbox', week_start: null, completed: false, assigned_to: null, updated_at: 'u', ...x })

describe('weekWindow', () => {
  it('a Saturday week runs seven days; last week is the seven before', () => {
    expect(weekWindow('2026-10-10')).toEqual({ start: '2026-10-10', end: '2026-10-17', lastStart: '2026-10-03' })
  })
})

describe('shapeWeek', () => {
  const read = shapeWeek({
    start: '2026-10-10', today: '2026-10-14',
    tasks: [
      t({ id: 'a', title: 'Reply to Christian', scheduled_for: '2026-10-14T04:00:00+00:00', is_all_day: true, bucket: 'timed' }),
      t({ id: 'b', title: 'Submit AF&PA', bucket: 'week', week_start: '2026-10-10' }),
      t({ id: 'c', title: 'Pull PPVIS numbers', scheduled_for: '2026-10-08T04:00:00+00:00', is_all_day: true, bucket: 'timed' }),
      t({ id: 'd', title: 'Washing machine', bucket: 'inbox' }),
      t({ id: 'e', title: 'Old done', scheduled_for: '2026-10-07T04:00:00+00:00', bucket: 'timed', completed: true }),
      t({ id: 'f', title: 'Boxing prep', scheduled_for: '2026-10-13T13:00:00+00:00', is_all_day: false, bucket: 'timed' }),
      t({ id: 'g', title: 'Late call', scheduled_for: '2026-10-15T01:30:00+00:00', is_all_day: false, bucket: 'timed' }),
    ],
    events: [{ id: 'ev', title: 'CEPI food-contact meeting', start_time: '2026-10-14T00:00:00+00:00', end_time: '2026-10-15T00:00:00+00:00', all_day: true }],
    routines: [{ id: 'r', name: 'Out the door', recurrence_pattern: { days: ['mon'] }, time_of_day: '07:20:00', parent_routine_id: null }],
    talks: [{ id: 's', body: 'Summer camp' }],
  })
  it('lays the week out by day, with times', () => {
    expect(read.days).toHaveLength(7)
    const wed = read.days.find((d) => d.date === '2026-10-14')!
    expect(wed.events).toEqual([{ id: 'ev', title: 'CEPI food-contact meeting', time: null }])
    expect(wed.tasks[0]).toEqual({ id: 'a', title: 'Reply to Christian', time: null, done: false, seen: 'u' })
    expect(read.days.find((d) => d.date === '2026-10-13')!.tasks[0].time).toBe('09:00')
  })
  it('a late-evening task stays on its local day', () => {
    const wed = read.days.find((d) => d.date === '2026-10-14')!
    expect(wed.tasks.map((x) => [x.id, x.time])).toContainEqual(['g', '21:30'])
  })
  it('names what has no day, what last week left, the inbox, routines and talk-abouts', () => {
    expect(read.noDay.map((x) => x.id)).toEqual(['b'])
    expect(read.lastWeekUnfinished).toEqual([{ id: 'c', title: 'Pull PPVIS numbers', was: '2026-10-08', seen: 'u' }])
    expect(read.inbox.map((x) => x.id)).toEqual(['d'])
    expect(read.routines).toEqual([{ id: 'r', name: 'Out the door', time: '07:20', pattern: { days: ['mon'] } }])
    expect(read.talkAbouts).toEqual(['Summer camp'])
  })
})
