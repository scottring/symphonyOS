import { describe, it, expect } from 'vitest'
import { calendarNameNote, calendarsShownNowhere, mainCalendarsFirst } from './calendarNameNote'

// Scott, 2026-11-13: two Google calendars both named "me@gmail.com"; he
// ticked the other one and his main calendar's meeting vanished.
const main = { id: 'me@gmail.com', summary: 'me@gmail.com', primary: true }
const twin = { id: 'abc@group.calendar.google.com', summary: 'me@gmail.com', primary: false }
const family = { id: 'fam@group.calendar.google.com', summary: 'Family', primary: false }
const all = [twin, family, main]

describe('telling calendars apart', () => {
  it('marks the main calendar and the look-alike', () => {
    expect(calendarNameNote(main, all)).toBe('Main calendar')
    expect(calendarNameNote(twin, all)).toBe('Not your main calendar — same name')
    expect(calendarNameNote(family, all)).toBeNull()
  })

  it('lists main calendars first', () => {
    expect(mainCalendarsFirst(all).map((c) => c.id)).toEqual(['me@gmail.com', twin.id, family.id])
  })

  it('names the calendars that would show nowhere once any has an area', () => {
    const picks = new Map([[twin.id, ['personal' as const]], [family.id, ['family' as const]]])
    expect(calendarsShownNowhere(all, picks).map((c) => c.id)).toEqual(['me@gmail.com'])
    expect(calendarsShownNowhere(all, new Map())).toEqual([])
  })
})
