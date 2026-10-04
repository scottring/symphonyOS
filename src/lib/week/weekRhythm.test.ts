import { describe, it, expect } from 'vitest'
import { weekRhythm } from './weekRhythm'
import type { JournalDay, JournalEntry } from './journalDays'
import { localYmd } from '@/lib/cadence/config'

// A Saturday-start week: Sat Oct 3 … Fri Oct 9, 2026.
const week = (): JournalDay[] => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(2026, 9, 3 + i)
  return { date, key: localYmd(date), notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
})
const occ = (routineId: string, title: string, day: JournalDay, time?: Date): JournalEntry =>
  ({ id: `routine-${routineId}-${day.key}`, kind: 'routine', title, routineId, completed: false, time })

// Scott, 2026-10-04: "this is a mess that can no longer stand" — Feed Jax,
// Walk Jax and Bedtime written seven times down the week.
describe('weekRhythm', () => {
  it('writes an every-day routine once, and takes it out of the days', () => {
    const days = week()
    days.forEach((d) => {
      d.entries.push(occ('jax', 'Feed Jax dinner', d, new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 18)))
      d.foldedRoutines.push(occ('tidy', 'Tidy bedrooms', d))
    })
    days[1].entries.push(occ('shop', 'Food shopping', days[1], new Date(2026, 9, 4, 8)))
    const r = weekRhythm(days)
    expect(r.everyDay.map((x) => x.title)).toEqual(['Feed Jax dinner', 'Tidy bedrooms'])
    expect(r.everyDay[0].time?.getHours()).toBe(18)
    expect(r.days.every((d) => d.foldedRoutines.length === 0)).toBe(true)
    expect(r.days[1].entries.map((e) => e.title)).toEqual(['Food shopping'])
    // The days handed in are left as they were (free time reads them).
    expect(days[0].entries).toHaveLength(1)
  })

  it('writes a Monday-to-Friday routine once under Weekdays', () => {
    const days = week()
    days.forEach((d) => { if (d.date.getDay() >= 1 && d.date.getDay() <= 5) d.entries.push(occ('camp', 'Kids home from camp', d)) })
    const r = weekRhythm(days)
    expect(r.weekdays.map((x) => x.title)).toEqual(['Kids home from camp'])
    expect(r.everyDay).toEqual([])
    expect(r.days.flatMap((d) => d.entries)).toEqual([])
  })

  it('leaves a routine on some days in those days', () => {
    const days = week()
    for (const i of [2, 4]) days[i].entries.push(occ('math', 'Math time', days[i]))
    const r = weekRhythm(days)
    expect(r.everyDay).toEqual([])
    expect(r.weekdays).toEqual([])
    expect(r.days[2].entries.map((e) => e.title)).toEqual(['Math time'])
  })

  it('needs the whole week to call anything "every day"', () => {
    const days = week().slice(0, 3)
    days.forEach((d) => d.entries.push(occ('jax', 'Walk Jax', d)))
    expect(weekRhythm(days).everyDay).toEqual([])
  })
})
