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
    // Joined with a bullet, not a middot — see JOIN in wallStrip.ts.
    expect(rows[0].summary).toBe('First day of school • Art / PE')
  })

  it('omits a day with nothing worth saying rather than printing an empty row', () => {
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 24), false, [item({ type: 'routine', title: 'Everyday routine' })]),
      day(new Date(2026, 7, 25), false, [item({ title: 'Soccer practice' })]),
    ])
    expect(rows.map((r) => r.dayLabel)).toEqual(['Tue'])
  })

  // The wall's real Wednesday-to-Sunday: school ran every weekday and took a
  // slot in three of five rows while saying nothing about any of them.
  it("drops the week's background so the news gets the slot", () => {
    const SCHOOL = 'School — Ella & Kaleb'
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 26), false, [
        item({ title: 'Specials — Ella: Music · Kaleb: Library' }), item({ title: SCHOOL })]),
      day(new Date(2026, 7, 27), false, [
        item({ title: 'Specials — Ella: PE · Kaleb: Music' }), item({ title: SCHOOL })]),
      day(new Date(2026, 7, 28), false, [
        item({ title: 'Iris call week' }), item({ title: 'Specials — Ella: Art · Kaleb: PE' }),
        item({ title: SCHOOL })]),
      day(new Date(2026, 7, 29), false, [item({ title: 'Dance Center Open House' })]),
      day(new Date(2026, 7, 30), false, [item({ title: 'Planning' })]),
    ])

    expect(rows.map((r) => r.dayLabel)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(rows.some((r) => r.summary.includes(SCHOOL))).toBe(false)
    expect(rows[0].summary).toBe('Specials — Ella: Music · Kaleb: Library')
    expect(rows[2].summary).toBe('Iris call week • Specials — Ella: Art · Kaleb: PE')
  })

  // Dropping the scenery must never drop the DAY — an absent Thursday reads
  // as broken, a repeated line only reads as a quiet day.
  it('keeps a day whose only content is that background', () => {
    const SCHOOL = 'School — Ella & Kaleb'
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 26), false, [item({ title: SCHOOL }), item({ title: 'Dentist' })]),
      day(new Date(2026, 7, 27), false, [item({ title: SCHOOL })]),
      day(new Date(2026, 7, 28), false, [item({ title: SCHOOL }), item({ title: 'Piano' })]),
    ])

    expect(rows.map((r) => r.summary)).toEqual(['Dentist', SCHOOL, 'Piano'])
  })

  it('says a repeated title once, not twice on the same line', () => {
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 26), false, [item({ title: 'Swim' }), item({ title: 'Swim' })]),
    ])
    expect(rows[0].summary).toBe('Swim')
  })

  // The card is ~36 characters wide; "Specials — " cost eleven of them and
  // pushed the day's second item off the edge.
  it('drops the kind prefix from a per-person rotation', () => {
    const rows = adaptComingUpRows(
      [day(new Date(2026, 7, 26), false, [
        item({ title: 'Specials — Ella: Music · Kaleb: Library' }),
        item({ title: 'Ladies Track Night' }),
      ])],
      [member('ella', 'Ella'), member('kaleb', 'Kaleb')],
    )
    expect(rows[0].summary).toBe('Ella: Music · Kaleb: Library • Ladies Track Night')
  })

  it('leaves a title with no per-person segment whole', () => {
    const rows = adaptComingUpRows(
      [day(new Date(2026, 7, 26), false, [item({ title: 'School — Ella & Kaleb' })])],
      [member('ella', 'Ella'), member('kaleb', 'Kaleb')],
    )
    expect(rows[0].summary).toBe('School — Ella & Kaleb')
  })

  // Two days is a coincidence, not a pattern — the rule must not fire and
  // blank out a short look-ahead.
  it('does not call something background on a window too short to tell', () => {
    const rows = adaptComingUpRows([
      day(new Date(2026, 7, 26), false, [item({ title: 'School' })]),
      day(new Date(2026, 7, 27), false, [item({ title: 'School' })]),
    ])
    expect(rows.map((r) => r.summary)).toEqual(['School', 'School'])
  })
})
