import { describe, it, expect } from 'vitest'
import { periodHeading, monthsTitle } from './journalHeading'
import { periodBounds } from './periodPage'
import { readSeasons } from '@/lib/cadence/seasons'

const seasons = readSeasons()
const now = new Date(2026, 10, 11)

describe('one heading on every horizon', () => {
  it('Month: 1–30, This month, November, 2026; its neighbours by name', () => {
    expect(periodHeading(periodBounds('month', now, seasons), now, seasons)).toEqual({ numeral: '1–30', name: 'This month', title: 'November, 2026' })
    expect(periodHeading(periodBounds('month', new Date(2026, 9, 3), seasons), now, seasons).name).toBe('Last month')
    expect(periodHeading(periodBounds('month', new Date(2026, 11, 3), seasons), now, seasons).name).toBe('Next month')
    expect(periodHeading(periodBounds('month', new Date(2027, 2, 3), seasons), now, seasons)).toEqual({ numeral: '1–31', name: 'Month', title: 'March, 2027' })
  })
  it('Season and Year: the months as the number', () => {
    const s = periodHeading(periodBounds('season', now, seasons), now, seasons)
    expect(s.name).toBe('This season')
    expect(s.title).toMatch(/^\w+, 2026$/)
    expect(periodHeading(periodBounds('year', now, seasons), now, seasons)).toEqual({ numeral: 'Jan–Dec', name: 'This year', title: '2026' })
  })
  it('a run across months or years names both', () => {
    expect(monthsTitle(new Date(2026, 10, 28), new Date(2026, 11, 4))).toBe('Nov – Dec, 2026')
    expect(monthsTitle(new Date(2026, 11, 26), new Date(2027, 0, 1))).toBe('Dec 2026 – Jan 2027')
  })
})
