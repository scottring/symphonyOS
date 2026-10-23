import { describe, expect, it } from 'vitest'
import { buildKidPanel, clockLabel, minutesFromTitle, routineNow, shortTitle } from './kidPanelModel'
import type { KidRow, MemberDayModel } from '@/lib/wall/kidDayModel'

const KALEB = 'kaleb'
const row = (id: string, title: string, timeOfDay: string | null, done = false, by?: string[]): KidRow =>
  ({ entityType: 'routine', id, title, done, timeOfDay, target: null, ...(by ? { by } : {}) })

function model(over: Partial<MemberDayModel> = {}): MemberDayModel {
  return {
    needed: [], reading: null, school: null, homework: [], papers: [], notices: [],
    collections: [], bands: { morning: [], afternoon: [], evening: [], anytime: [] }, isEmpty: false,
    ...over,
  }
}

// Tuesday Oct 20, 2026.
const tue = (h: number, m = 0) => new Date(2026, 9, 20, h, m)
const sat = (h: number, m = 0) => new Date(2026, 9, 24, h, m)

const tuesday = model({
  collections: [
    { id: 'm', title: 'School morning', timeOfDay: '06:45', rows: [row('dress', 'Get dressed', null)] },
    { id: 'home', title: 'Home from school', timeOfDay: '17:45', rows: [row('folder', 'Empty take-home folder', null, true), row('read', 'Reading, 20 minutes — a real book', null)] },
    { id: 'jax', title: 'Jax Evening Routine', timeOfDay: '18:00', rows: [row('jax', 'Feed Jax dinner', '18:00', false, [KALEB])] },
    { id: 'bed', title: 'Kids Bedtime routine', timeOfDay: '19:30', rows: [row('shower', 'Shower night: upstairs, teeth', '19:30'), row('out', 'Lights out', '20:30')] },
  ],
  bands: { morning: [], afternoon: [], evening: [row('puzzle', 'Puzzle Trail: 1 round', '18:45')], anytime: [row('tidy', 'Tidy bedrooms', null)] },
})

describe('buildKidPanel', () => {
  it('a weekday starts at noon: the school morning is the wall’s', () => {
    const p = buildKidPanel(tuesday, KALEB, tue(17, 50))
    expect(p.stops.map((s) => s.short)).toEqual(['Empty take-home folder', 'Reading', 'Feed Jax dinner', 'Puzzle Trail', 'Shower night', 'Lights out', 'Tidy bedrooms'])
    expect(p.isWeekend).toBe(false)
  })

  it('NOW is the first open thing that is due; NEXT follows it', () => {
    const p = buildKidPanel(tuesday, KALEB, tue(17, 50))
    expect(p.now?.title).toBe('Reading, 20 minutes — a real book')
    expect(p.now?.group).toBe('Home from school')
    expect(p.now?.minutes).toBe(20)
    expect(p.next?.title).toBe('Feed Jax dinner')
    expect(p.later.map((s) => s.short)).toEqual(['Puzzle Trail', 'Shower night', 'Lights out', 'Tidy bedrooms'])
    expect(p.dayNote).toBe('Reading day')
  })

  it('before anything is due, an anytime thing comes first', () => {
    const p = buildKidPanel(tuesday, KALEB, tue(14, 0))
    expect(p.now?.short).toBe('Tidy bedrooms')
  })

  it('a step for someone else stays off this kid’s screen', () => {
    const p = buildKidPanel(tuesday, 'ella', tue(17, 50))
    expect(p.stops.some((s) => s.short === 'Feed Jax dinner')).toBe(false)
  })

  it('a long-missed stop stays on the trail but never blocks NOW', () => {
    const p = buildKidPanel(tuesday, KALEB, tue(21, 50))
    const reading = p.stops.find((s) => s.short === 'Reading')!
    expect(reading.missed).toBe(true)
    expect(p.now?.short).not.toBe('Reading')
  })

  it('the weekend is the whole day', () => {
    const weekend = model({
      collections: [{ id: 'tidy', title: 'Tidy together', timeOfDay: '07:30', rows: [row('lr', 'Living room', null)] }],
      bands: { morning: [row('out', 'Family outing', '08:00', true)], afternoon: [], evening: [], anytime: [] },
    })
    const p = buildKidPanel(weekend, KALEB, sat(8, 15))
    expect(p.isWeekend).toBe(true)
    expect(p.stops.map((s) => s.short)).toEqual(['Living room', 'Family outing'])
    expect(p.now?.short).toBe('Living room')
    expect(p.doneCount).toBe(1)
  })

  it('the list layout: what is due now (done ones stay, ticked), and later with times', () => {
    const p = buildKidPanel(tuesday, KALEB, tue(17, 50))
    expect(p.listNow.map((s) => [s.short, s.done])).toEqual([
      ['Empty take-home folder', true], ['Reading', false], ['Feed Jax dinner', false], ['Puzzle Trail', false], ['Tidy bedrooms', false],
    ])
    expect(p.listLater.map((s) => s.short)).toEqual(['Shower night', 'Lights out'])
  })

  it('homework is a stop', () => {
    const p = buildKidPanel(model({ homework: [{ id: 'hw', title: 'Spelling sheet', due: 'Fri', late: false, notes: null }] }), KALEB, tue(16))
    expect(p.now).toMatchObject({ key: 'task:hw', group: 'Homework' })
  })
})

describe('the routine on now (the door panel)', () => {
  // Tuesday: School morning, Home from school, bedtime with shower-night steps.
  const day = model({
    collections: [
      { id: 'm', title: 'School morning', timeOfDay: '06:45:00', rows: [
        row('off', 'Pull-up off, underwear on', null, false, [KALEB]),
        row('dress', 'Get dressed', null),
        row('trash', 'Pull-up in the downstairs trash', null, false, [KALEB]),
        row('eat', 'Eat breakfast', '07:00'),
        row('shoes', 'Shoes and jacket on', '07:18'),
      ] },
      { id: 'home', title: 'Home from school', timeOfDay: '17:45', rows: [row('folder', 'Empty take-home folder', null)] },
      { id: 'bed', title: 'Kids Bedtime routine', timeOfDay: '19:30', rows: [
        row('shower', 'Shower', null, true), row('floor', 'Dry off the bathroom floor', null), row('on', 'Pull-up on', null, false, [KALEB]),
        row('out', 'Lights out', '20:30'),
      ] },
      { id: 'later', title: 'Untimed chores', timeOfDay: null, rows: [row('x', 'Tidy bedrooms', null)] },
    ],
  })

  it('7:30 on a Tuesday night is the bedtime routine, every step in its own order', () => {
    const r = routineNow(day, KALEB, tue(19, 30))!
    expect(r.title).toBe('Kids Bedtime routine')
    expect(r.steps.map((s) => s.title)).toEqual(['Shower', 'Dry off the bathroom floor', 'Pull-up on', 'Lights out'])
    expect(r.doneCount).toBe(1)
    expect(r.next).toBeNull()
  })

  it('a morning is the morning routine, on a weekday too', () => {
    const r = buildKidPanel(day, KALEB, tue(7, 5)).routine!
    expect(r.title).toBe('School morning')
    expect(r.steps[0].title).toBe('Pull-up off, underwear on')
    expect(r.next).toEqual({ title: 'Home from school', time: '17:45' })
  })

  it('a step for one kid is only on that kid’s list', () => {
    const r = routineNow(day, 'ella', tue(7, 5))!
    expect(r.steps.map((s) => s.title)).toEqual(['Get dressed', 'Eat breakfast', 'Shoes and jacket on'])
  })

  it('on from half an hour before it starts until an hour and a half after its last step', () => {
    expect(routineNow(day, KALEB, tue(6, 14))).toBeNull()
    expect(routineNow(day, KALEB, tue(6, 15))?.title).toBe('School morning')
    expect(routineNow(day, KALEB, tue(8, 47))?.title).toBe('School morning')
    expect(routineNow(day, KALEB, tue(8, 48))).toBeNull()
    expect(routineNow(day, KALEB, tue(21, 59))?.title).toBe('Kids Bedtime routine')
    expect(routineNow(day, KALEB, tue(22, 0))).toBeNull()
  })

  it('between routines there is none: the trail or list is the screen', () => {
    expect(buildKidPanel(day, KALEB, tue(14, 0)).routine).toBeNull()
  })

  it('when two overlap, the one that has started wins; before either, the sooner one', () => {
    // Home from school runs until 19:15; bedtime opens at 19:00.
    expect(routineNow(day, KALEB, tue(19, 5))?.title).toBe('Home from school')
    expect(routineNow(day, KALEB, tue(19, 16))?.title).toBe('Kids Bedtime routine')
    expect(routineNow(day, KALEB, tue(19, 30))?.title).toBe('Kids Bedtime routine')
  })

  it('a loose routine of the kid’s due during it is on the checklist too (Feed Jax at 7:00, Oct 23)', () => {
    const withJax = model({
      collections: day.collections,
      bands: {
        morning: [row('jaxam', 'Feed Jax AM Meal', '07:00:00', false, ['ella'])],
        afternoon: [],
        evening: [row('jaxpm', 'Feed Jaxx Dinner', '18:00:00', true, [KALEB]), row('late', 'Puzzle Trail', '22:30')],
        anytime: [row('tidy', 'Tidy bedrooms', null)],
      },
    })
    const ella = routineNow(withJax, 'ella', tue(7, 5))!
    expect(ella.title).toBe('School morning')
    expect(ella.also.map((s) => [s.title, s.time])).toEqual([['Feed Jax AM Meal', '07:00']])
    // Slotted in by time: after breakfast (7:00), before shoes (7:18).
    expect(ella.steps.map((s) => s.title)).toEqual(['Get dressed', 'Eat breakfast', 'Feed Jax AM Meal', 'Shoes and jacket on'])
    expect(routineNow(withJax, KALEB, tue(7, 5))!.also).toEqual([])
    // Home from school (17:45) is on until 19:15: dinner at 18:00 is in it, done, and counts.
    const kaleb = routineNow(withJax, KALEB, tue(18, 10))!
    expect(kaleb.title).toBe('Home from school')
    expect(kaleb.steps.map((s) => s.title)).toEqual(['Empty take-home folder', 'Feed Jaxx Dinner'])
    expect(kaleb.doneCount).toBe(1)
    // Anytime things and things after the routine stay on the trail.
    expect(routineNow(withJax, KALEB, tue(21, 0))!.also).toEqual([])
  })

  it('a routine with nothing for this kid is not theirs', () => {
    const onlyKaleb = model({ collections: [{ id: 'j', title: 'Jax', timeOfDay: '18:00', rows: [row('jax', 'Feed Jax dinner', null, false, [KALEB])] }] })
    expect(routineNow(onlyKaleb, 'ella', tue(18, 0))).toBeNull()
  })
})

describe('reading a title', () => {
  it('finds a timer length', () => {
    expect(minutesFromTitle('Math, 20–30 minutes (this week’s pages)')).toBe(20)
    expect(minutesFromTitle('Reading, 20 minutes — a real book')).toBe(20)
    expect(minutesFromTitle('Read 15 min')).toBe(15)
    expect(minutesFromTitle('Lights out')).toBeNull()
  })
  it('shortens for the trail', () => {
    expect(shortTitle('Back inside by 7:45, then upstairs: teeth and pajamas')).toBe('Back inside by 7:45')
    expect(shortTitle('Feed Jax dinner')).toBe('Feed Jax dinner')
  })
  it('clock labels', () => {
    expect(clockLabel('18:45')).toBe('6:45')
    expect(clockLabel('12:00')).toBe('12:00')
    expect(clockLabel(null)).toBeNull()
  })
})
