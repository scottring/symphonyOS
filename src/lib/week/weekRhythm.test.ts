import { describe, it, expect } from 'vitest'
import { weekRhythm, rhythmLines } from './weekRhythm'
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

  // Review 2026-10-04: a one-day change is particular to that day.
  it('keeps a day whose occurrence has another time in that day', () => {
    const days = week()
    days.forEach((d, i) => d.entries.push(occ('jax', 'Walk Jax', d, new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), i === 3 ? 20 : 18))))
    const r = weekRhythm(days)
    expect(r.everyDay.map((x) => x.time?.getHours())).toEqual([18])
    expect(r.days[3].entries.map((e) => e.title)).toEqual(['Walk Jax'])
    expect(r.days[2].entries).toEqual([])
  })

  // Friday session, Stage 1: a task that repeats (one row per day) shows once.
  describe('a task the same every weekday', () => {
    const pickup = (day: JournalDay, title = 'Pick up from FFG', minute = 15): JournalEntry => ({
      id: `task-ffg-${day.key}`, kind: 'task', title, completed: false,
      time: new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 17, minute),
    })
    const weekdays = (days: JournalDay[]) => days.filter((d) => d.date.getDay() !== 0 && d.date.getDay() !== 6)

    it('is written once under Weekdays, with its time, and leaves those days', () => {
      const days = week()
      // Titles differ only in case and spacing: the same task.
      weekdays(days).forEach((d, i) => d.entries.push(pickup(d, i === 2 ? 'pick up  from FFG ' : 'Pick up from FFG')))
      days[3].entries.push({ id: 'task-dentist', kind: 'task', title: 'Dentist forms', completed: false })
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      const line = rhythmLines(r).find((l) => l.label === 'Weekdays')!
      expect(line.items.map((i) => i.title)).toContain('5:15 Pick up from FFG')
      expect(line.items[0].openId).toBe('task-ffg-2026-10-06')
      expect(r.days.flatMap((d) => d.entries).map((e) => e.title)).toEqual(['Dentist forms'])
    })

    it('missing one weekday, stays in its days', () => {
      const days = week()
      weekdays(days).slice(1).forEach((d) => d.entries.push(pickup(d)))
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      expect(r.weekdays).toEqual([])
      expect(r.days.flatMap((d) => d.entries)).toHaveLength(4)
    })

    it('at another time one weekday, stays in its days', () => {
      const days = week()
      weekdays(days).forEach((d, i) => d.entries.push(pickup(d, 'Pick up from FFG', i === 4 ? 30 : 15)))
      expect(weekRhythm(days, '2026-10-06', { tasks: true }).weekdays).toEqual([])
    })

    // Alternating pickups: the same title and time, different people. Each
    // day keeps its row (and its face).
    it('lifts only when the people match every day; alternating pickups stay in their days', () => {
      const days = week()
      weekdays(days).forEach((d, i) => d.entries.push({ ...pickup(d), people: [i % 2 === 0 ? 'scott' : 'iris'] }))
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      expect(r.weekdays).toEqual([])
      expect(r.days.flatMap((d) => d.entries).map((e) => e.people)).toEqual([['scott'], ['iris'], ['scott'], ['iris'], ['scott']])
    })

    it('an untimed repeat is lifted too, with no time on its line', () => {
      const days = week()
      weekdays(days).forEach((d) => d.entries.push({ ...pickup(d, 'Pack lunches'), time: undefined }))
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      expect(rhythmLines(r).find((l) => l.label === 'Weekdays')!.items.map((i) => i.title)).toEqual(['Pack lunches'])
      expect(r.days.flatMap((d) => d.entries)).toEqual([])
    })

    it('the same people every day, in any order, is one line', () => {
      const days = week()
      weekdays(days).forEach((d, i) => d.entries.push({ ...pickup(d), people: i === 1 ? ['scott', 'iris'] : ['iris', 'scott'] }))
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      expect(r.weekdays.map((x) => x.title)).toEqual(['Pick up from FFG'])
      expect(r.days.flatMap((d) => d.entries)).toEqual([])
    })

    it('every day of the week is written under Every day', () => {
      const days = week()
      days.forEach((d) => d.entries.push(pickup(d, 'Feed the fish')))
      const r = weekRhythm(days, '2026-10-06', { tasks: true })
      expect(rhythmLines(r).find((l) => l.label === 'Every day')!.items.map((i) => i.title)).toEqual(['5:15 Feed the fish'])
      expect(r.days.flatMap((d) => d.entries)).toEqual([])
    })

    it('only where asked: other views keep their tasks in the days', () => {
      const days = week()
      weekdays(days).forEach((d) => d.entries.push(pickup(d)))
      expect(weekRhythm(days, '2026-10-06').days.flatMap((d) => d.entries)).toHaveLength(5)
    })
  })

  it('opens today’s occurrence, not a past one', () => {
    const days = week()
    days.forEach((d) => d.foldedRoutines.push(occ('read', 'Read', d)))
    expect(weekRhythm(days, '2026-10-06').everyDay[0].openId).toBe('routine-read-2026-10-06')
    expect(weekRhythm(days, '2026-09-01').everyDay[0].openId).toBe('routine-read-2026-10-03')
    expect(weekRhythm(days, '2026-12-01').everyDay[0].openId).toBe('routine-read-2026-10-09')
  })
})
