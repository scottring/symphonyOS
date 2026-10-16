import { describe, expect, it } from 'vitest'
import { readCalendarCoverage, shapeWeek, weekWindow } from './readWeek'

describe('calendar coverage', () => {
  it('distinguishes no connection from a connected but empty cache', async () => {
    const disconnected = await readCalendarCoverage(async () => ({ data: [], error: null }))
    const cached = await readCalendarCoverage(async () => ({ data: [{ provider: 'google', sync_enabled: true }], error: null }))
    expect(disconnected.status).toBe('not-connected')
    expect(cached.status).toBe('cached')
    expect(disconnected.availability).toBe('unknown')
    expect(cached.availability).toBe('unknown')
    const week = shapeWeek({ start: '2026-10-10', today: '2026-10-14', tasks: [], events: [], routines: [], talks: [], calendar: disconnected })
    expect(week.calendar).toEqual(disconnected)
    expect(week.days.every((d) => d.events.length === 0)).toBe(true)
  })
  it('keeps unavailable, fenced, disabled and failed event reads unknown', async () => {
    const results = await Promise.all([
      readCalendarCoverage(async () => ({ data: null, error: { message: 'unavailable' } })),
      readCalendarCoverage(() => { throw new Error('not available on the kitchen wall') }),
      readCalendarCoverage(async () => ({ data: [{ provider: 'google', sync_enabled: false }], error: null })),
      readCalendarCoverage(async () => ({ data: [{ provider: 'google', sync_enabled: true }], error: null }), false),
    ])
    for (const result of results) expect(result).toMatchObject({ status: 'unavailable', availability: 'unknown' })
  })
  it('never infers coverage when the caller supplies only an empty event list', () => {
    expect(shapeWeek({ start: '2026-10-10', today: '2026-10-14', tasks: [], events: [], routines: [], talks: [] }).calendar)
      .toMatchObject({ status: 'unavailable', availability: 'unknown' })
  })
})

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
    expect(read.routines).toEqual([{ id: 'r', name: 'Out the door', time: '07:20', pattern: { days: ['mon'] }, who: [] }])
    expect(read.talkAbouts).toEqual(['Summer camp'])
  })
})

describe('shapeWeek routines', () => {
  const IRIS = 'm-iris', SCOTT = 'm-scott'
  const inst = (x: Record<string, unknown>) => ({ entity_id: 'pick', date: '2026-10-15', status: 'pending', deferred_to: null, assigned_to_override: null, ...x })
  const read = shapeWeek({
    start: '2026-10-10', today: '2026-10-14', tasks: [], events: [], talks: [],
    routines: [
      { id: 'pick', name: 'FFG pickup', recurrence_pattern: { type: 'weekly', days: ['tue', 'thu'] }, time_of_day: '15:10:00', parent_routine_id: null, assigned_to_all: [SCOTT, 'm-gone'], visibility: 'active', paused_until: null },
      { id: 'bed', name: 'Kids bedtime', recurrence_pattern: { type: 'daily' }, time_of_day: '19:45:00', parent_routine_id: null, assigned_to_all: null },
      { id: 'run', name: 'Iris long run', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: null, parent_routine_id: null, assigned_to_all: [IRIS], visibility: 'reference', paused_until: '2026-11-01T04:00:00+00:00' },
      { id: 'nap', name: 'Nap', recurrence_pattern: { type: 'daily' }, time_of_day: null, parent_routine_id: null, visibility: 'reference', paused_until: null },
      { id: 'step', name: 'Brush teeth', recurrence_pattern: { type: 'daily' }, time_of_day: null, parent_routine_id: 'bed' },
    ],
    members: [{ id: IRIS, name: 'Iris' }, { id: SCOTT, name: 'Scott' }],
    instances: [
      inst({ date: '2026-10-15', assigned_to_override: IRIS }),
      inst({ entity_id: 'bed', date: '2026-10-16', status: 'skipped' }),
      inst({ entity_id: 'bed', date: '2026-10-13', status: 'deferred', deferred_to: '2026-10-14T04:00:00+00:00' }),
      inst({ entity_id: 'bed', date: '2026-10-11', status: 'deferred', deferred_to: '2026-10-11T23:30:00+00:00' }),
      inst({ entity_id: 'bed', date: '2026-10-12', status: 'completed' }),
      inst({ entity_id: 'bed', date: '2026-10-17', status: 'skipped' }),
      inst({ entity_id: 'step', date: '2026-10-12', status: 'skipped' }),
    ],
  })
  const byId = (id: string) => read.routines.find((r) => r.id === id)!
  it('names who does each routine, by member name (the id when unknown)', () => {
    expect(byId('pick').who).toEqual(['Scott', 'm-gone'])
    expect(byId('bed').who).toEqual([])
  })
  it("lists this week's skipped, moved and someone-else days, in date order, inside the week only", () => {
    expect(byId('pick').thisWeek).toEqual([{ date: '2026-10-15', who: 'Iris' }])
    expect(byId('bed').thisWeek).toEqual([
      { date: '2026-10-11', status: 'deferred', movedTo: '2026-10-11 19:30' },
      { date: '2026-10-13', status: 'deferred', movedTo: '2026-10-14' },
      { date: '2026-10-16', status: 'skipped' },
    ])
    expect(byId('run').thisWeek).toBeUndefined()
  })
  it('says which routines are resting, and until when', () => {
    expect(byId('run').resting).toEqual({ until: '2026-11-01' })
    expect(byId('nap').resting).toEqual({ until: null })
    expect(byId('pick').resting).toBeUndefined()
  })
  it('leaves steps out', () => {
    expect(read.routines.map((r) => r.id)).toEqual(['pick', 'bed', 'run', 'nap'])
  })
})
