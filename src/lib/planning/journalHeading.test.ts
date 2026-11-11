import { describe, it, expect } from 'vitest'
import { monthsTitle } from './journalHeading'

describe('the week in the one-line heading', () => {
  it('names the month and year its days sit in', () => {
    expect(monthsTitle(new Date(2026, 10, 7), new Date(2026, 10, 13))).toBe('November 2026')
    expect(monthsTitle(new Date(2026, 10, 28), new Date(2026, 11, 4))).toBe('Nov – Dec 2026')
    expect(monthsTitle(new Date(2026, 11, 26), new Date(2027, 0, 1))).toBe('Dec 2026 – Jan 2027')
  })
})
