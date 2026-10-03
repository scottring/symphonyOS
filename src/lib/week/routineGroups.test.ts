import { describe, it, expect } from 'vitest'
import { routineGroups } from './routineGroups'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance } from '@/types/actionable'

const WEEK = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
const r = (name: string, o: Parameters<typeof createMockRoutine>[0]) => createMockRoutine({ id: name, name, ...o })
const inst = (o: Partial<ActionableInstance>): ActionableInstance => ({ id: 'i', user_id: 'u', entity_type: 'routine', entity_id: 'x', date: '2026-10-03', status: 'pending', created_at: '', updated_at: '', ...o } as ActionableInstance)
const groups = (routines: ReturnType<typeof r>[], instances: ActionableInstance[] = []) =>
  routineGroups({ routines, weekStart: WEEK, dayCount: 7, instances, layers: ALL_LAYERS })
const names = (rows: { routine: { name: string } }[]) => rows.map((x) => x.routine.name)

// Scott, 2026-10-03: the week's routines, one kind at a time.
describe('routineGroups', () => {
  it('sorts each routine into the one group that asks the right question', () => {
    const g = groups([
      r('Bedtime', { time_of_day: '19:00', recurrence_pattern: { type: 'daily' } }),
      r('Kids clean rooms', { time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      r('Yard weeding', { time_of_day: null, recurrence_pattern: { type: 'weekend' } }),
      r('Kids laundry', { time_of_day: '14:00', recurrence_pattern: { type: 'weekend' } }),
      r('Deep clean fridge', { time_of_day: null, recurrence_pattern: { type: 'weekly' } }),
      r('Vitamins', { time_of_day: null, recurrence_pattern: { type: 'daily' } }),
      r('Pay rent', { time_of_day: null, recurrence_pattern: { type: 'monthly', day_of_month: 5 } }),
      r('Gutter check', { time_of_day: null, recurrence_pattern: { type: 'monthly', day_of_month: 20 } }),
    ])
    expect(names(g.timed)).toEqual(['Bedtime'])
    expect(names(g.setDay)).toEqual(['Kids clean rooms'])
    expect(names(g.weekend)).toEqual(['Kids laundry', 'Yard weeding'])
    expect(names(g.anyDay)).toEqual(['Deep clean fridge'])
    expect(names(g.everyDay)).toEqual(['Vitamins'])
    // Monthly on the 5th falls this week; on the 20th it doesn't.
    expect(names(g.lessOften)).toEqual(['Pay rent'])
  })

  it('says which days a routine falls on, and which it is planned or skipped on', () => {
    const g = groups([
      r('Shower night', { time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['tue', 'thu', 'sat'] } }),
      r('Yard weeding', { time_of_day: null, recurrence_pattern: { type: 'weekend' } }),
    ], [inst({ entity_id: 'Shower night', date: '2026-10-06', status: 'skipped' }), inst({ entity_id: 'Yard weeding', date: '2026-10-04', planned_on: '2026-10-04' })])
    expect(g.setDay[0].dayKeys).toEqual(['2026-10-03', '2026-10-06', '2026-10-08'])
    expect(g.setDay[0].skippedKeys).toEqual(['2026-10-06'])
    expect(g.weekend[0].plannedKey).toBe('2026-10-04')
  })

  it('leaves out a resting routine and one hidden from Today and planning', () => {
    const g = groups([
      r('Resting', { time_of_day: null, visibility: 'reference', recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      r('Hidden', { time_of_day: null, show_on_timeline: false, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
    ])
    expect(names(g.setDay)).toEqual([])
  })
})
