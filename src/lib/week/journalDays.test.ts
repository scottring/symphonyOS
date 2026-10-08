import { describe, it, expect } from 'vitest'
import { buildJournalDays } from './journalDays'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance, Routine } from '@/types/actionable'

const WEEK = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
const build = (routines: Routine[], instances: ActionableInstance[] = [], extra: Partial<Parameters<typeof buildJournalDays>[0]> = {}) => {
  const routineItems = buildWeekRoutineItems({ routines, weekStart: WEEK, dayCount: 7, instances, prefs: { hideRoutines: false, layers: ALL_LAYERS } })
  return buildJournalDays({
    weekStart: WEEK, dayCount: 7, tasks: [], userId: 'me', eventItems: [], events: [], dinnersByDay: new Map(),
    routineItems, instances, labelFor: () => undefined, ...extra,
  })
}
const instance = (o: Partial<ActionableInstance>): ActionableInstance => ({
  id: 'i1', user_id: 'me', entity_type: 'routine', entity_id: 'r', date: '2026-10-04', status: 'pending',
  created_at: '', updated_at: '', ...o,
} as ActionableInstance)

// Scott, 2026-10-03: a day's untimed routines fold to one line; timed ones
// stay in the day's schedule.
describe('buildJournalDays — the fold', () => {
  it('an untimed Saturday routine is folded, not one of the day’s entries', () => {
    const r = createMockRoutine({ id: 'r', name: 'Paper mail', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } })
    const { days } = build([r])
    expect(days[0].foldedRoutines.map((e) => e.title)).toEqual(['Paper mail'])
    expect(days[0].entries.map((e) => e.title)).not.toContain('Paper mail')
  })
  it('a timed routine stays in the day’s entries', () => {
    const r = createMockRoutine({ id: 'r', name: 'Bedtime', time_of_day: '19:00', recurrence_pattern: { type: 'weekly', days: ['sat'] } })
    const { days } = build([r])
    expect(days[0].entries.map((e) => e.title)).toContain('Bedtime')
    expect(days[0].foldedRoutines).toEqual([])
  })
})

// Scott, 2026-10-03: weekend chores on both days are "mind-numbing".
describe('buildJournalDays — the weekend, once', () => {
  const yard = createMockRoutine({ id: 'r', name: 'Yard weeding', time_of_day: null, recurrence_pattern: { type: 'weekend' } })

  it('a Weekend-rule routine nobody has given a day is in Sometime once, and on neither day', () => {
    const { days, weekend } = build([yard])
    expect(weekend?.sometime.map((e) => e.title)).toEqual(['Yard weeding'])
    expect(weekend?.satIndex).toBe(0)
    expect(weekend?.sunIndex).toBe(1)
    for (const d of days.slice(0, 2)) expect([...d.entries, ...d.foldedRoutines].map((e) => e.title)).not.toContain('Yard weeding')
  })

  it('given Sunday, it is Sunday’s and not Sometime’s', () => {
    const { days, weekend } = build([yard], [instance({ planned_on: '2026-10-04' })])
    expect(weekend?.sometime).toEqual([])
    expect(days[1].foldedRoutines.map((e) => e.title)).toEqual(['Yard weeding'])
  })

  it('a timed Weekend-rule routine keeps its time in Sometime', () => {
    const laundry = createMockRoutine({ id: 'k', name: 'Do Kids laundry', time_of_day: '14:00', recurrence_pattern: { type: 'weekend' } })
    const { days, weekend } = build([laundry])
    expect(weekend?.sometime[0].time?.getHours()).toBe(14)
    expect(days[0].entries.map((e) => e.title)).not.toContain('Do Kids laundry')
    expect(days[1].entries.map((e) => e.title)).not.toContain('Do Kids laundry')
  })

  it('a weekly Saturday-and-Sunday routine stays on both days (two commitments)', () => {
    const both = createMockRoutine({ id: 'b', name: 'Water plants', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] } })
    const { days, weekend } = build([both])
    expect(weekend?.sometime).toEqual([])
    expect(days[0].foldedRoutines.map((e) => e.title)).toEqual(['Water plants'])
    expect(days[1].foldedRoutines.map((e) => e.title)).toEqual(['Water plants'])
  })

  it('a task planned for this weekend with no day joins Sometime', () => {
    const t = createMockTask({ id: 't', title: 'Clean the grill', weekendStart: new Date(2026, 9, 3), scheduledFor: undefined })
    const { weekend } = build([], [], { weekendTasks: [t] })
    expect(weekend?.sometime.map((e) => e.title)).toEqual(['Clean the grill'])
  })

  it('a Sunday-start week has no band; Sometime belongs to its Saturday', () => {
    const sundayWeek = new Date(2026, 9, 4)
    const routineItems = buildWeekRoutineItems({ routines: [yard], weekStart: sundayWeek, dayCount: 7, instances: [], prefs: { hideRoutines: false, layers: ALL_LAYERS } })
    const { weekend } = buildJournalDays({ weekStart: sundayWeek, dayCount: 7, tasks: [], userId: 'me', eventItems: [], events: [], dinnersByDay: new Map(), routineItems, instances: [], labelFor: () => undefined })
    expect(weekend?.satIndex).toBe(6)
    expect(weekend?.sunIndex).toBeNull()
    expect(weekend?.sometime.map((e) => e.title)).toEqual(['Yard weeding'])
  })
})

// Walkthrough follow-up 2026-10-08: each week start the app offers keeps its
// days in date order, and a weekend is paired only when Saturday and Sunday
// are both inside the week — never Sunday-at-the-top with Saturday-at-the-end.
describe('buildJournalDays — the weekend for each week start', () => {
  const forWeek = (weekStart: Date, extra: Partial<Parameters<typeof buildJournalDays>[0]> = {}) => buildJournalDays({
    weekStart, dayCount: 7, tasks: [], userId: 'me', eventItems: [], events: [], dinnersByDay: new Map(),
    routineItems: [], instances: [], labelFor: () => undefined, ...extra,
  })
  const consecutive = (days: { date: Date }[]) => days.every((d, i) => i === 0 || d.date.getTime() - days[i - 1].date.getTime() === 86_400_000 || Math.abs(d.date.getTime() - days[i - 1].date.getTime() - 86_400_000) <= 3_600_000)

  it.each([
    ['Saturday', new Date(2026, 9, 3), 0, 1, '2026-10-03', '2026-10-09'],
    ['Monday', new Date(2026, 9, 5), 5, 6, '2026-10-05', '2026-10-11'],
    ['Sunday', new Date(2026, 9, 4), 6, null, '2026-10-04', '2026-10-10'],
  ] as const)('a %s-start week: seven days in order, weekend at %s/%s', (_name, start, sat, sun, first, last) => {
    const { days, weekend } = forWeek(start)
    expect(days).toHaveLength(7)
    expect(consecutive(days)).toBe(true)
    expect([days[0].key, days[6].key]).toEqual([first, last])
    expect([weekend?.satIndex, weekend?.sunIndex]).toEqual([sat, sun])
    if (sun !== null) expect(days[sun].date.getTime() - days[sat].date.getTime()).toBeLessThanOrEqual(25 * 3_600_000)
  })

  it('a Sunday-start week never pulls in the Sunday after its Saturday, and its own Sunday stays first', () => {
    const start = new Date(2026, 9, 4)
    const nextSunday = createMockTask({ id: 'n', title: 'Call the grandparents', scheduledFor: new Date(2026, 9, 11), isAllDay: true })
    const thisSunday = createMockTask({ id: 't', title: 'Long walk', scheduledFor: new Date(2026, 9, 4), isAllDay: true })
    const { days, weekend } = forWeek(start, { tasks: [nextSunday, thisSunday] })
    expect(days.map((d) => d.key)).not.toContain('2026-10-11')
    expect(days.flatMap((d) => d.entries.map((e) => e.title))).not.toContain('Call the grandparents')
    expect(days[0].entries.map((e) => e.title)).toEqual(['Long walk'])
    expect(weekend?.sunIndex).toBeNull()
  })

  it('a split weekend still holds its weekend task once, by its Saturday', () => {
    const wash = createMockTask({ id: 'w', title: 'Wash the car', weekendStart: new Date(2026, 9, 10) })
    const { weekend } = forWeek(new Date(2026, 9, 4), { weekendTasks: [wash] })
    expect(weekend?.sometime.map((e) => e.title)).toEqual(['Wash the car'])
  })
})
