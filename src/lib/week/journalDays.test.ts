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
