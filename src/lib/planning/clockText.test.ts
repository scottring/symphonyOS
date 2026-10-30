import { describe, it, expect } from 'vitest'
import { parseClockText, clockLabel } from './clockText'

describe('parseClockText', () => {
  it.each([
    ['6pm', { hours: 18, minutes: 0 }],
    ['6:30 PM', { hours: 18, minutes: 30 }],
    ['9:15a', { hours: 9, minutes: 15 }],
    ['18:00', { hours: 18, minutes: 0 }],
    ['noon', { hours: 12, minutes: 0 }],
    ['8', { hours: 8, minutes: 0 }],
    ['6', { hours: 18, minutes: 0 }],
  ])('reads %s', (text, want) => {
    expect(parseClockText(text)).toEqual(want)
  })

  it.each([
    ['6-9:15pm', 18, 0, 195],
    ['6pm–9:15pm', 18, 0, 195],
    ['6 to 915pm', 18, 0, 195],
    ['10-1pm', 10, 0, 180],
    ['11am-1', 11, 0, 120],
    ['18:00-21:15', 18, 0, 195],
    ['11pm-1am', 23, 0, 120],
    ['6-9', 18, 0, 180],
  ])('reads the range %s', (text, hours, minutes, duration) => {
    expect(parseClockText(text)).toEqual({ hours, minutes, duration })
  })

  it.each(['', 'soon', '25:00', '13pm', '6:75', '6-', '1-2-3'])('refuses %j', (text) => {
    expect(parseClockText(text)).toBeNull()
  })
})

describe('clockLabel', () => {
  it('says a time, or a range once', () => {
    const six = new Date(2026, 9, 30, 18, 0)
    expect(clockLabel(six)).toBe('6:00 PM')
    expect(clockLabel(six, 195)).toBe('6:00 – 9:15 PM')
    expect(clockLabel(new Date(2026, 9, 30, 11, 0), 120)).toBe('11:00 AM – 1:00 PM')
  })

  it('reads back what it writes', () => {
    const r = parseClockText(clockLabel(new Date(2026, 9, 30, 18, 0), 195))
    expect(r).toEqual({ hours: 18, minutes: 0, duration: 195 })
  })
})
