import { describe, it, expect } from 'vitest'
import {
  federalDaysOff, isFederalDayOff, weekendWindowFor, isWeekendWindowDay, weekendWindowKeys,
} from './weekendWindow'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('federalDaysOff', () => {
  it('computes the floating ones for 2026', () => {
    const days = federalDaysOff(2026)
    expect(days.get('2026-01-19')).toBe('Martin Luther King Jr. Day')   // 3rd Mon Jan
    expect(days.get('2026-02-16')).toBe('Presidents’ Day')              // 3rd Mon Feb
    expect(days.get('2026-05-25')).toBe('Memorial Day')                 // last Mon May
    expect(days.get('2026-09-07')).toBe('Labor Day')                    // 1st Mon Sep
    expect(days.get('2026-10-12')).toBe('Columbus Day')                 // 2nd Mon Oct
    expect(days.get('2026-11-26')).toBe('Thanksgiving')                 // 4th Thu Nov
    expect(days.get('2026-11-27')).toBe('Day after Thanksgiving')
  })

  it('moves a fixed date off the weekend, the way the country does', () => {
    // Jul 4 2026 is a Saturday, so the day off is Friday Jul 3.
    expect(federalDaysOff(2026).get('2026-07-03')).toBe('Independence Day')
    expect(federalDaysOff(2026).has('2026-07-04')).toBe(false)
    // Christmas 2027 is a Saturday → observed Friday Dec 24.
    expect(federalDaysOff(2027).get('2027-12-24')).toBe('Christmas Day')
  })

  // The subscribed holiday calendar carries these; none is a day off, and
  // treating them as one would invent long weekends all year.
  it('is not the holiday calendar — no Valentine’s, Halloween or Tax Day', () => {
    expect(isFederalDayOff(d(2026, 2, 14))).toBe(false)
    expect(isFederalDayOff(d(2026, 10, 31))).toBe(false)
    expect(isFederalDayOff(d(2026, 4, 15))).toBe(false)
  })
})

describe('weekendWindowFor', () => {
  it('is Saturday and Sunday on an ordinary weekend', () => {
    expect(weekendWindowKeys(d(2026, 9, 19))).toEqual(['2026-09-19', '2026-09-20'])
    expect(weekendWindowKeys(d(2026, 9, 20))).toEqual(['2026-09-19', '2026-09-20'])
  })

  it('has no window on an ordinary weekday', () => {
    expect(weekendWindowFor(d(2026, 9, 16))).toBeNull()
    expect(isWeekendWindowDay(d(2026, 9, 16))).toBe(false)
  })

  // Labor Day, Mon Sep 7 2026.
  it('grows through a Monday day off, from either end', () => {
    const fromSaturday = weekendWindowKeys(d(2026, 9, 5))
    expect(fromSaturday).toEqual(['2026-09-05', '2026-09-06', '2026-09-07'])
    // …and asking on the holiday itself finds the same window.
    expect(weekendWindowKeys(d(2026, 9, 7))).toEqual(fromSaturday)
    expect(isWeekendWindowDay(d(2026, 9, 7))).toBe(true)
  })

  // Thanksgiving 2026: Thu Nov 26 + Fri Nov 27 + the weekend = four days.
  it('reaches back through Thanksgiving and its Friday', () => {
    expect(weekendWindowKeys(d(2026, 11, 28)))
      .toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'])
    expect(weekendWindowKeys(d(2026, 11, 26)))
      .toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'])
  })

  // Independence Day 2026 lands on Saturday, so Friday Jul 3 is the day off.
  it('grows through an observed Friday', () => {
    expect(weekendWindowKeys(d(2026, 7, 4))).toEqual(['2026-07-03', '2026-07-04', '2026-07-05'])
  })

  // Veterans Day 2026 is a Wednesday. A day off in the middle of the week is
  // a day off, not a weekend.
  it('leaves a midweek day off alone', () => {
    expect(weekendWindowFor(d(2026, 11, 11))).toBeNull()
    expect(isWeekendWindowDay(d(2026, 11, 11))).toBe(false)
  })

  it('handles a window that crosses the year boundary', () => {
    // Fri Jan 1 2027 is New Year's Day, with the weekend right after it.
    expect(weekendWindowKeys(d(2027, 1, 2))).toEqual(['2027-01-01', '2027-01-02', '2027-01-03'])
  })
})
