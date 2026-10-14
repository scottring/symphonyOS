import { describe, expect, it } from 'vitest'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { createMockActionableInstance, createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance, Routine } from '@/types/actionable'
import { bandOf, buildOccurrences, cadenceOf, dayList, layoutPicture, notShowingWhy } from './routinesPicture'

// Sat Oct 10 – Fri Oct 16, 2026 (a Saturday-start household).
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 10 + i))
const NAMES: Record<string, string> = { iris: 'Iris', scott: 'Scott' }

function picture(routines: Routine[], instances: ActionableInstance[] = []) {
  const items = buildWeekRoutineItems({ routines, weekStart: WEEK[0], dayCount: 7, instances, prefs: { hideRoutines: false, layers: ALL_LAYERS } })
  const stepCounts = new Map([['bed', 6]])
  const occurrences = buildOccurrences({ items, days: WEEK, instances, stepCounts, nameOf: (id) => NAMES[id] })
  return { occurrences, picture: layoutPicture({ routines, occurrences, days: WEEK, stepCounts }) }
}

const r = (id: string, name: string, over: Partial<Routine> = {}) => createMockRoutine({ id, name, time_of_day: null, recurrence_pattern: { type: 'daily' }, ...over })
const SCHOOL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']

describe('bands', () => {
  it('morning before noon, afternoon until five, evening after, untimed is any time', () => {
    expect(bandOf(new Date(2026, 9, 12, 6, 45))).toBe('morning')
    expect(bandOf(new Date(2026, 9, 12, 12, 0))).toBe('afternoon')
    expect(bandOf(new Date(2026, 9, 12, 16, 59))).toBe('afternoon')
    expect(bandOf(new Date(2026, 9, 12, 17, 0))).toBe('evening')
    expect(bandOf(null)).toBe('anytime')
  })
})

describe('which line a routine is on', () => {
  it('reads the pattern', () => {
    expect(cadenceOf({ type: 'daily' })).toBe('every-day')
    expect(cadenceOf({ type: 'daily', interval: 2 })).toBe('weekly')
    expect(cadenceOf({ type: 'weekly', days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] })).toBe('every-day')
    expect(cadenceOf({ type: 'weekly', days: SCHOOL_DAYS })).toBe('weekly')
    expect(cadenceOf({ type: 'weekly', days: [] })).toBe('no-day')
    expect(cadenceOf({ type: 'weekly' })).toBe('no-day')
    expect(cadenceOf({ type: 'monthly', day_of_month: 1 })).toBe('less-often')
    expect(cadenceOf({ type: 'yearly', month_of_year: 3 })).toBe('less-often')
    expect(cadenceOf({ type: 'since_last', interval: 6, unit: 'weeks' })).toBe('less-often')
  })

  it('says why one is not showing: resting (with its date) or off', () => {
    expect(notShowingWhy(r('a', 'Camp', { visibility: 'reference' }))).toBe('resting')
    expect(notShowingWhy(r('a', 'Camp', { visibility: 'reference', paused_until: '2026-11-01T12:00:00' }))).toBe('resting until Nov 1')
    expect(notShowingWhy(r('a', 'Yard', { show_on_timeline: false }))).toBe('off')
    expect(notShowingWhy(r('a', 'Walk'))).toBeNull()
  })

  it('puts every routine somewhere: Every day, the grid, Each month, No day yet, Not showing', () => {
    const { picture: p } = picture([
      r('bed', 'Kids bedtime routine', { time_of_day: '19:30' }),
      r('school', 'School morning', { time_of_day: '06:45', recurrence_pattern: { type: 'weekly', days: SCHOOL_DAYS } }),
      r('fin', 'Financial review', { recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
      r('lib', 'Library with the kids', { recurrence_pattern: { type: 'weekly', days: [] } }),
      r('camp', 'Camp mornings', { visibility: 'reference' }),
      r('yard', 'Yard weeding', { show_on_timeline: false, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      r('step', 'Brush teeth', { parent_routine_id: 'bed' }),
    ])
    expect(p.everyDay.map((c) => [c.title, c.steps])).toEqual([['Kids bedtime routine', 6]])
    expect(p.lessOften.map((c) => c.title)).toEqual(['Financial review'])
    expect(p.noDay.map((c) => c.title)).toEqual(['Library with the kids'])
    expect(p.notShowing.map((c) => [c.title, c.hint])).toEqual([['Camp mornings', 'resting'], ['Yard weeding', 'off']])
    // The grid: School morning in the weekday mornings, not the weekend; no
    // every-day bedtime in any cell; no step on its own.
    const titles = (i: number) => Object.values(p.days[i].bands).flat().map((o) => o.title)
    expect(titles(0)).toEqual([]) // Sat
    expect(p.days[2].bands.morning.map((o) => o.title)).toEqual(['School morning']) // Mon
    expect(p.days.flatMap((d) => Object.values(d.bands).flat()).some((o) => o.title === 'Kids bedtime routine' || o.title === 'Brush teeth')).toBe(false)
  })

  it('sorts a cell by time, the untimed ones in Any time', () => {
    const { picture: p } = picture([
      r('b', 'Home from school', { time_of_day: '17:45', recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
      r('a', 'FFG pickup', { time_of_day: '17:15', recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
      r('c', 'Book bags out', { recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ])
    expect(p.days[2].bands.evening.map((o) => o.title)).toEqual(['FFG pickup', 'Home from school'])
    expect(p.days[2].bands.anytime.map((o) => o.title)).toEqual(['Book bags out'])
  })
})

describe("this week's changes, in place", () => {
  const bed = r('bed', 'Bedtime', { time_of_day: '19:30' })
  const ffg = r('ffg', 'FFG pickup', { time_of_day: '17:15', assigned_to_all: ['scott'], recurrence_pattern: { type: 'weekly', days: SCHOOL_DAYS } })
  const cut = r('cut', 'Kaleb haircut', { recurrence_pattern: { type: 'weekly', days: ['wed'] } })

  it('an every-day routine skipped on one day shows in that cell, struck, with a this-week mark', () => {
    const skip = createMockActionableInstance({ entity_type: 'routine', entity_id: 'bed', date: '2026-10-16', status: 'skipped' })
    const { picture: p } = picture([bed], [skip])
    const fri = p.days[6].bands.evening
    expect(fri.map((o) => [o.title, o.exception?.label])).toEqual([['Bedtime', 'skipped']])
    expect(p.days[5].bands.evening).toEqual([]) // Thursday as usual: on the Every day line only
    expect(p.everyDay.map((c) => c.title)).toEqual(['Bedtime'])
  })

  it('a day with someone else on it wears their face and says so', () => {
    const iris = createMockActionableInstance({ entity_type: 'routine', entity_id: 'ffg', date: '2026-10-15', assigned_to_override: 'iris' })
    const { picture: p } = picture([ffg], [iris])
    const thu = p.days[5].bands.evening[0]
    expect(thu.people).toEqual(['iris'])
    expect(thu.exception?.label).toBe('Iris')
    expect(p.days[4].bands.evening[0].people).toEqual(['scott'])
    expect(p.days[4].bands.evening[0].exception).toBeUndefined()
  })

  it('a moved occurrence leaves its day and lands on the new one, saying where from', () => {
    const moved = createMockActionableInstance({ entity_type: 'routine', entity_id: 'cut', date: '2026-10-14', status: 'deferred', deferred_to: new Date(2026, 9, 15).toISOString(), planned_on: '2026-10-15' })
    const { picture: p } = picture([cut], [moved])
    expect(p.days[4].bands.anytime).toEqual([])
    expect(p.days[5].bands.anytime.map((o) => [o.title, o.exception?.label])).toEqual([['Kaleb haircut', 'from Wed']])
  })

  it('a new time on one day is said in place', () => {
    const retimed = createMockActionableInstance({ entity_type: 'routine', entity_id: 'ffg', date: '2026-10-13', status: 'pending', deferred_to: new Date(2026, 9, 13, 16, 30).toISOString() })
    const { picture: p } = picture([ffg], [retimed])
    expect(p.days[3].bands.afternoon.map((o) => o.exception?.label)).toEqual(['at 4:30'])
  })

  it("the phone's day list keeps every-day routines in order", () => {
    const { occurrences } = picture([bed, ffg])
    expect(dayList(occurrences, '2026-10-12').map((o) => o.title)).toEqual(['FFG pickup', 'Bedtime'])
  })
})
