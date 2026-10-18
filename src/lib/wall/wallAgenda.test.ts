import { describe, it, expect } from 'vitest'
import { agendaDays, agendaDay } from './wallAgenda'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { WallDayData } from '@/hooks/useWallData'

const members = [
  { id: 'sk', name: 'Scott', initials: 'SK', color: 'blue', role_label: 'parent', is_full_user: true },
  { id: 'el', name: 'Ella', initials: 'EL', color: 'pink', role_label: 'child' },
] as unknown as FamilyMember[]

const item = (o: Partial<TimelineItem>) => ({ id: 'x', type: 'event', title: 'X', startTime: null, endTime: null, completed: false, ...o }) as TimelineItem
const day = (d: number, items: TimelineItem[], isToday = false): WallDayData =>
  ({ date: new Date(2026, 9, d), isToday, items: { morning: items }, birthdays: [], milestones: [] }) as unknown as WallDayData

// Scott, 2026-10-18: "all items for today/this weekend … the items shown need
// to have a check circle".
describe('agendaDays', () => {
  const week = [14, 15, 16, 17, 18, 19, 20].map((d) => day(d, [], d === 14))
  it('is today, or the coming Saturday and Sunday', () => {
    const wed = new Date(2026, 9, 14, 9)
    expect(agendaDays(week, 'today', wed).map((d) => d.date.getDate())).toEqual([14])
    expect(agendaDays(week, 'weekend', wed).map((d) => d.date.getDate())).toEqual([17, 18])
  })
  it('on a Saturday is that day and Sunday; on a Sunday, Sunday', () => {
    const days = [17, 18, 19].map((d) => day(d, []))
    expect(agendaDays(days, 'weekend', new Date(2026, 9, 17, 9)).map((d) => d.date.getDate())).toEqual([17, 18])
    expect(agendaDays(days, 'weekend', new Date(2026, 9, 18, 9)).map((d) => d.date.getDate())).toEqual([18])
  })
})

describe('agendaDay', () => {
  const at = (h: number) => new Date(2026, 9, 14, h)
  it('lists every item, done ones too: timed in order, anytime after, all-day events as titles; steps fold in', () => {
    const d = agendaDay(day(14, [
      item({ id: 'event-sp', title: 'Specials', allDay: true }),
      item({ id: 'task-late', type: 'task', title: 'Late', startTime: at(16), assignedTo: 'el' }),
      item({ id: 'event-swim', title: 'Swim', startTime: at(8), endTime: at(9) }),
      item({ id: 'routine-brush', type: 'routine', title: 'Brush teeth', startTime: at(7), recurrencePattern: { type: 'daily' } as never }),
      item({ id: 'routine-step', type: 'routine', title: 'A step', originalRoutine: { parent_routine_id: 'r' } as never }),
      item({ id: 'task-p', type: 'task', title: 'Plan trip', startTime: at(10), completed: true }),
      item({ id: 'task-s', type: 'task', title: 'Step', isSubtask: true, parentTaskId: 'p' }),
      item({ id: 'task-done', type: 'task', title: 'Bought batteries', completed: true }),
      item({ id: 'task-form', type: 'task', title: 'Sign the form' }),
    ], true), members, at(12))
    expect(d.allDay).toEqual(['Specials'])
    expect(d.timed.map((r) => [r.title, r.time, r.done, r.past])).toEqual([
      ['Brush teeth', '7a', false, true], ['Swim', '8a', false, true], ['Plan trip', '10a', true, true], ['Late', '4p', false, false],
    ])
    expect(d.anytime.map((r) => r.title)).toEqual(['Sign the form', 'Bought batteries'])
    expect(d.timed.find((r) => r.id === 'task-late')?.owners).toEqual(['el'])
  })

  it('gives tasks and routines a check, on any day, and events none', () => {
    const sat = day(17, [
      item({ id: 'task-mow', type: 'task', title: 'Mow', startTime: new Date(2026, 9, 17, 11) }),
      item({ id: 'routine-pizza', type: 'routine', title: 'Pizza night', startTime: new Date(2026, 9, 17, 18) }),
      item({ id: 'event-party', title: 'Party', startTime: new Date(2026, 9, 17, 14) }),
    ])
    const d = agendaDay(sat, members, at(12))
    expect(d.label).toBe('Saturday')
    expect(d.timed.map((r) => [r.id, r.checkable])).toEqual([['task-mow', true], ['event-party', false], ['routine-pizza', true]])
    expect(d.timed[2].on).toEqual(new Date(2026, 9, 17))
  })
})
