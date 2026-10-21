import { describe, expect, it } from 'vitest'
import { buildKidPanel, clockLabel, minutesFromTitle, shortTitle } from './kidPanelModel'
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
