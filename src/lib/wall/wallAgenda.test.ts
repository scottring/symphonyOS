import { describe, it, expect } from 'vitest'
import { agendaDays, agendaDay, agendaWeekend, datesLabel, weekendDates } from './wallAgenda'
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

// Scott, 2026-10-20: "we need to be clearer about what 'this weekend' means on
// the kiosk". The household's week starts on Saturday, so on a Tuesday the
// Week page's weekend is the one just gone; the wall's is the coming one, and
// it now says so in dates.
describe('weekend dates', () => {
  it('is always the coming Saturday and Sunday, written out', () => {
    const tue = new Date(2026, 9, 20, 9)
    expect(weekendDates(tue).map((d) => d.getDate())).toEqual([24, 25])
    expect(datesLabel(weekendDates(tue))).toBe('Oct 24–25')
  })
  it('spans a month; on a Sunday is just Sunday', () => {
    expect(datesLabel(weekendDates(new Date(2026, 9, 28)))).toBe('Oct 31 – Nov 1')
    expect(datesLabel(weekendDates(new Date(2026, 9, 25, 9)))).toBe('Oct 25')
  })
  it('labels each day with its date, today as Today', () => {
    expect(agendaDay(day(24, []), members, new Date(2026, 9, 20)).label).toBe('Saturday, Oct 24')
    expect(agendaDay(day(24, [], true), members, new Date(2026, 9, 24)).label).toBe('Today, Oct 24')
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
    expect(d.label).toBe('Saturday, Oct 17')
    expect(d.timed.map((r) => [r.id, r.checkable])).toEqual([['task-mow', true], ['event-party', false], ['routine-pizza', true]])
    expect(d.timed[2].on).toEqual(new Date(2026, 9, 17))
  })
})

// Scott, 2026-10-21: "make it match the main app" — the weekend as the Week
// page draws it, with Sometime this weekend.
describe('agendaWeekend', () => {
  const tue = new Date(2026, 9, 20, 9)
  const weekendRule = (id: string, title: string, o: Partial<TimelineItem> = {}) =>
    item({ id: `routine-${id}`, type: 'routine', title, originalRoutine: { id, recurrence_pattern: { type: 'weekend' } } as never, ...o })
  const days = (sat: TimelineItem[], sun: TimelineItem[]) => [20, 21, 22, 23, 24, 25, 26].map((d) =>
    day(d, d === 24 ? sat : d === 25 ? sun : [], d === 20))
  const none = { tasks: [], planned: () => false }

  it('puts a Weekend-rule routine nobody has given a day in Sometime, once, ticked on Saturday', () => {
    const w = agendaWeekend(days([weekendRule('weed', 'Weed the backyard')], [weekendRule('weed', 'Weed the backyard')]), members, tue, none)
    expect(w.days.map((d) => d.anytime.map((r) => r.title))).toEqual([[], []])
    expect(w.sometime.map((r) => r.title)).toEqual(['Weed the backyard'])
    expect(w.sometime[0].on.getDate()).toBe(24)
  })

  it('keeps one given a day, or done, on that day only', () => {
    const planned = agendaWeekend(days([weekendRule('weed', 'Weed')], [weekendRule('weed', 'Weed')]), members, tue,
      { tasks: [], planned: (id, key) => id === 'weed' && key === '2026-10-25' })
    expect(planned.days.map((d) => d.anytime.map((r) => r.title))).toEqual([[], ['Weed']])
    expect(planned.sometime).toEqual([])
    const done = agendaWeekend(days([weekendRule('weed', 'Weed', { completed: true })], []), members, tue, none)
    expect(done.days[0].anytime.map((r) => [r.title, r.done])).toEqual([['Weed', true]])
    expect(done.sometime).toEqual([])
  })

  it('adds tasks planned for this weekend with no day, not another weekend’s', () => {
    const task = (id: string, title: string, weekendStart: Date, o = {}) => ({ id, title, completed: false, createdAt: new Date(), weekendStart, ...o }) as never
    const w = agendaWeekend(days([], []), members, tue, { planned: () => false, tasks: [
      task('g', 'Clean out the garage', new Date(2026, 9, 24)),
      task('n', 'Next weekend’s thing', new Date(2026, 9, 31)),
      task('d', 'Already done', new Date(2026, 9, 24), { completed: true }),
    ] })
    expect(w.sometime.map((r) => [r.id, r.done, r.checkable])).toEqual([['task-g', false, true], ['task-d', true, true]])
  })
})
