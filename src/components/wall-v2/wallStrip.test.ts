import { describe, it, expect } from 'vitest'
import { adaptMealRows, adaptDueRows, adaptComingUpRows, STRIP_ROWS } from './wallStrip'
import type { MealDayRecipe } from '@/lib/mealDayRecipes'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'

const member = (id: string, name: string): FamilyMember =>
  ({ id, name, user_id: 'u', initials: name.slice(0, 2), color: 'blue',
     avatar_url: null, is_full_user: true, display_order: 0,
     created_at: '' }) as FamilyMember

const item = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: Math.random().toString(36).slice(2), type: 'task', title: 't',
     startTime: null, endTime: null, completed: false, ...o }) as TimelineItem

const day = (date: Date, isToday: boolean, items: TimelineItem[]): WallDayData =>
  ({ date, isToday, items: { anytime: items }, birthdays: [], milestones: [] }) as unknown as WallDayData

describe('adaptMealRows', () => {
  const meal = (key: string, d: Date, title: string): MealDayRecipe =>
    ({ dateKey: key, date: d, title, ingredients: [], instructions: [] })

  it('starts at today and labels it "Today"', () => {
    const rows = adaptMealRows([
      meal('2026-08-22', new Date(2026, 7, 22), 'Yesterday stew'),
      meal('2026-08-23', new Date(2026, 7, 23), ''),
      meal('2026-08-24', new Date(2026, 7, 24), 'Sheet-pan chicken'),
    ], '2026-08-23')

    expect(rows.map((r) => r.dayLabel)).toEqual(['Today', 'Mon'])
    expect(rows[0].isToday).toBe(true)
  })

  it('calls an unplanned day a GAP rather than printing a blank', () => {
    // The one genuinely useful thing this card does — "no dinner planned" is
    // information, an empty row is not.
    const rows = adaptMealRows(
      [meal('2026-08-23', new Date(2026, 7, 23), '   ')], '2026-08-23')
    expect(rows[0].isGap).toBe(true)
    expect(rows[0].title).toBeNull()
  })

  it('drops days already past', () => {
    const rows = adaptMealRows(
      [meal('2026-08-01', new Date(2026, 7, 1), 'Old')], '2026-08-23')
    expect(rows).toEqual([])
  })
})

describe('adaptDueRows', () => {
  const members = [member('m-iris', 'Iris'), member('m-scott', 'Scott')]

  it('names who each task belongs to, and leaves house tasks unattributed', () => {
    const rows = adaptDueRows(
      day(new Date(), true, [
        item({ id: 'a', title: "Call Dr. Lewis", assignedTo: 'm-iris' }),
        item({ id: 'b', title: 'Renew car registration' }),
      ]), members)

    expect(rows).toEqual([
      { id: 'a', title: 'Call Dr. Lewis', who: 'Iris', completed: false },
      { id: 'b', title: 'Renew car registration', who: null, completed: false },
    ])
  })

  it('excludes routines and events — they already have a lane', () => {
    const rows = adaptDueRows(
      day(new Date(), true, [
        item({ id: 'r', type: 'routine', title: 'Kids shower routine' }),
        item({ id: 'e', type: 'event', title: 'Soccer practice' }),
        item({ id: 't', title: 'Pick up dry cleaning' }),
      ]), members)
    expect(rows.map((r) => r.id)).toEqual(['t'])
  })

  it('excludes anything already done', () => {
    const rows = adaptDueRows(
      day(new Date(), true, [item({ id: 'done', completed: true })]), members)
    expect(rows).toEqual([])
  })

  it('caps at what the card can actually show', () => {
    const many = Array.from({ length: 20 }, (_, i) => item({ id: `t${i}` }))
    expect(adaptDueRows(day(new Date(), true, many), members)).toHaveLength(STRIP_ROWS)
  })

  it('survives a missing day', () => {
    expect(adaptDueRows(undefined, members)).toEqual([])
  })
})

describe('adaptComingUpRows', () => {
  it('gives each day ONE line, not a second timeline', () => {
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 23), true, [item({ title: 'today thing' })]),
      day(new Date(2026, 7, 24), false, [
        item({ title: 'First day of school' }),
        item({ title: 'Art / PE' }),
        item({ title: 'a third thing that should not appear' }),
      ]),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].dayLabel).toBe('Mon')
    expect(rows[0].summary).toBe('First day of school · Art / PE')
  })

  it('omits a day with nothing worth saying rather than printing an empty row', () => {
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 24), false, [item({ type: 'routine', title: 'Everyday routine' })]),
      day(new Date(2026, 7, 25), false, [item({ title: 'Soccer practice' })]),
    ])
    expect(rows.map((r) => r.dayLabel)).toEqual(['Tue'])
  })
})
