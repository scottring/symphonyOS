import { describe, it, expect } from 'vitest'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { explainRoutine } from '@/lib/routines/explain'
import { arrangeBoard, daysInWords, metaLine, isMinePrivate, type BoardRoutine } from './boardModel'

const WED = new Date(2026, 9, 14)
const ME = { id: 'me', name: 'Scott', user_id: 'u-me', auth_user_id: 'u-me', is_full_user: true, age_range: 'adult', display_order: 0 } as FamilyMember
const MIA = { id: 'mia', name: 'Mia', user_id: 'u-me', is_full_user: false, age_range: 'child', display_order: 1 } as FamilyMember
const IRIS = { id: 'iris', name: 'Iris', user_id: 'u-iris', auth_user_id: 'u-iris', is_full_user: true, age_range: 'adult', display_order: 2 } as FamilyMember
const MEMBERS = [ME, MIA, IRIS]

const r = (o: Partial<Routine>) => createMockRoutine({ context: 'family', time_of_day: null, user_id: 'u-me', ...o })
const item = (routine: Routine, steps: Routine[] = []): BoardRoutine => ({
  routine, steps, explanation: explainRoutine(routine, { date: WED, familyMembers: MEMBERS, steps, weekStart: new Date(2026, 9, 11) }),
})
const keys = (m: ReturnType<typeof arrangeBoard>) => m.bands.map((b) => [b.key, b.items.map((i) => i.routine.name)])

describe('arrangeBoard — by time of day', () => {
  it('bands by the hour (a collection takes its earliest step\'s), cadence, privacy; resting and off wait apart', () => {
    const bed = r({ id: 'bed', name: 'Bedtime' })
    const m = arrangeBoard([
      item(r({ name: 'Walk', time_of_day: '06:30' })),
      item(r({ name: 'Lunch', time_of_day: '11:30' })),
      item(r({ name: 'Snack', time_of_day: '15:00' })),
      item(bed, [r({ parent_routine_id: 'bed', time_of_day: '19:30' })]),
      item(r({ name: 'Water' })),
      item(r({ name: 'Trash', recurrence_pattern: { type: 'weekly', days: ['tue'] } })),
      item(r({ name: 'Bills', recurrence_pattern: { type: 'monthly', day_of_month: 1 } })),
      item(r({ name: 'Journal', context: 'personal', assigned_to: 'me', time_of_day: '06:00' })),
      item(r({ name: 'Iris run', context: 'personal', assigned_to: 'iris', time_of_day: '06:10', user_id: 'u-iris' })),
      item(r({ name: 'Camp', visibility: 'reference' })),
      item(r({ name: 'Yard', show_on_timeline: false })),
    ], 'time', { members: MEMBERS, self: ME })
    expect(keys(m)).toEqual([
      ['morning', ['Iris run', 'Walk']],
      ['midday', ['Lunch']],
      ['afternoon', ['Snack']],
      ['evening', ['Bedtime']],
      ['anytime', ['Water']],
      ['weekly', ['Trash']],
      ['monthly', ['Bills']],
      ['private', ['Journal']],
    ])
    expect(m.resting.map((i) => i.routine.name)).toEqual(['Camp'])
    expect(m.off.map((i) => i.routine.name)).toEqual(['Yard'])
  })

  it('weekdays are a daily rhythm, so they band by the hour', () => {
    const m = arrangeBoard([item(r({ name: 'Bus', time_of_day: '07:10', recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }))], 'time')
    expect(keys(m)).toEqual([['morning', ['Bus']]])
  })

  it('isMinePrivate: only the viewer\'s own private routine; an unassigned one counts when the viewer made it', () => {
    expect(isMinePrivate(item(r({ context: 'personal' })), ME)).toBe(true)
    expect(isMinePrivate(item(r({ context: 'personal', user_id: 'u-iris' })), ME)).toBe(false)
    expect(isMinePrivate(item(r({ context: 'family', assigned_to: 'me' })), ME)).toBe(false)
  })
})

describe('arrangeBoard — by person and by where', () => {
  it('by person: a member\'s own, Household for shared, Unassigned; members in household order', () => {
    const m = arrangeBoard([
      item(r({ name: 'Piano', assigned_to: 'mia' })),
      item(r({ name: 'Run', assigned_to: 'iris' })),
      item(r({ name: 'Bedtime', assigned_to_all: ['mia', 'me'] })),
      item(r({ name: 'Water' })),
    ], 'person', { members: [IRIS, MIA, ME] })
    expect(keys(m)).toEqual([['m:mia', ['Piano']], ['m:iris', ['Run']], ['household', ['Bedtime']], ['unassigned', ['Water']]])
  })

  it('by where: the first surface it shows on, once', () => {
    const m = arrangeBoard([
      item(r({ name: 'Daily' })),
      item(r({ name: 'Thursdays', recurrence_pattern: { type: 'weekly', days: ['thu'] } })),
      item(r({ name: 'Someday', recurrence_pattern: { type: 'weekly' } })),
    ], 'where')
    expect(keys(m)).toEqual([['today', ['Daily']], ['week', ['Thursdays']], ['nowhere', ['Someday']]])
  })
})

describe('card words', () => {
  it('days in words', () => {
    expect(daysInWords(r({ recurrence_pattern: { type: 'daily' } }))).toBe('every day')
    expect(daysInWords(r({ recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }))).toBe('weekdays')
    expect(daysInWords(r({ recurrence_pattern: { type: 'weekly', days: ['thu', 'tue'] } }))).toBe('Tue & Thu')
    expect(daysInWords(r({ recurrence_pattern: { type: 'weekly' } }))).toBe('any day each week')
    expect(daysInWords(r({ recurrence_pattern: { type: 'monthly', day_of_month: 1 } }))).toBe('monthly on the 1st')
  })

  it('meta line: people · days · time or any time', () => {
    expect(metaLine(r({ assigned_to_all: ['mia', 'me'], time_of_day: '07:00' }), MEMBERS)).toBe('Mia, Scott · every day · 7:00 AM')
    expect(metaLine(r({}), MEMBERS)).toBe('every day · any time')
  })
})
