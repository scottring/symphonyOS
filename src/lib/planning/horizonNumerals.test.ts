import { describe, it, expect } from 'vitest'
import { horizonNumerals, weekOfYear } from './horizonNumerals'
import { readSeasons } from '@/lib/cadence/seasons'

describe('horizonNumerals', () => {
  it('names each horizon by its own date', () => {
    const n = horizonNumerals(new Date(2026, 8, 28), readSeasons(), 0)
    expect(n.year.n).toBe('2026')
    expect(n.month).toEqual({ n: '09', label: 'September' })
    expect(n.today).toEqual({ n: '28', label: 'Today' })
    expect(n.season.n).toMatch(/^\d\d–\d\d$/)
  })
  it('counts weeks in the household’s own weeks', () => {
    expect(weekOfYear(new Date(2026, 0, 1), 0)).toBe(1)
    expect(weekOfYear(new Date(2026, 8, 28), 0)).toBe(40)
    expect(weekOfYear(new Date(2026, 8, 17), 1)).toBe(38)
  })
})
