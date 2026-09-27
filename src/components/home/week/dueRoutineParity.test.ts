import { describe, it, expect } from 'vitest'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import { selectDayPlan } from '@/lib/today/dayPlan'
import { buildWeekRoutineItems } from './weekRoutineItems'
import { routineDayState, routineIdOf, routineDayIndex } from '@/lib/planning/weekDensity'
import type { Routine } from '@/types/actionable'

// Today and the Week journal (and Schedule's all-day cell, which reads the
// journal) must agree on which untimed routines are ON a day versus merely
// available on it (Scott, 2026-09-27). Same routines, same day, both answers.
describe('due-routine parity: Today vs Week, Sunday Sep 27 2026', () => {
  const SUN = new Date(2026, 8, 27, 10, 0)
  const WEEK = new Date(2026, 8, 27)
  const r = (id: string, pattern: Routine['recurrence_pattern'], show: boolean | null) =>
    createMockRoutine({ id, name: id, time_of_day: null, recurrence_pattern: pattern, show_on_timeline: show as boolean })
  const routines = [
    r('daily-on', { type: 'daily' }, true),
    r('sun-on', { type: 'weekly', days: ['sun'] }, true),
    r('satsun-on', { type: 'weekly', days: ['sat', 'sun'] }, true),
    r('tuethu-on', { type: 'weekly', days: ['tue', 'thu'] }, true),
    r('window-on', { type: 'weekend' }, true),
    r('sun-unsaid', { type: 'weekly', days: ['sun'] }, null),
    r('sun-off', { type: 'weekly', days: ['sun'] }, false),
  ]

  it('both put exactly the due, Show-in-Today-on routines on the day; both offer the rest', () => {
    const plan = selectDayPlan({
      tasks: [], routines, dateInstances: [], viewedDate: SUN, selectedAssignee: [], hideRoutines: false, layers: ALL_LAYERS, weekStart: WEEK,
    })
    const todayOn = plan.chooserRoutines.filter((e) => e.onToday).map((e) => e.id).sort()
    const todayOffered = plan.available.map((e) => e.id).sort()

    const items = buildWeekRoutineItems({ routines, weekStart: WEEK, dayCount: 7, instances: [], member: [], prefs: { hideRoutines: false, layers: ALL_LAYERS } })
      .filter((i) => routineDayIndex(i.id) === 0)
    const weekOn = items.filter((i) => routineDayState(routineIdOf(i.id), '2026-09-27', i, []).counts).map((i) => routineIdOf(i.id)).sort()
    const weekOffered = items.filter((i) => !routineDayState(routineIdOf(i.id), '2026-09-27', i, []).counts).map((i) => routineIdOf(i.id)).sort()

    expect(todayOn).toEqual(['daily-on', 'satsun-on', 'sun-on'])
    expect(weekOn).toEqual(todayOn)
    expect(todayOffered).toEqual(['sun-unsaid', 'window-on'])
    expect(weekOffered).toEqual(todayOffered)
  })
})
