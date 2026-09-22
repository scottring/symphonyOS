import { describe, expect, it } from 'vitest'
import { periodsShownOnPage, pinIsOnPage } from './periodsOnPage'

describe('periods a page already shows', () => {
  it('allows the contextual shelves pin on broader horizons', () => {
    for (const path of ['/season', '/year']) {
      expect(pinIsOnPage(path, 'today')).toBe(false)
      expect(pinIsOnPage(path, 'week')).toBe(false)
    }
  })
  it('counts the week AND the month on /week — the month list is folded there', () => {
    expect(periodsShownOnPage('/week')).toEqual(['week', 'month'])
    expect(periodsShownOnPage('/workweek')).toEqual(['week', 'month'])
  })

  it('month suppresses only its duplicate month list', () => {
    expect(periodsShownOnPage('/month')).toEqual(['month'])
    expect(pinIsOnPage('/month', 'week')).toBe(false)
  })

  it('counts nothing on Today or the library', () => {
    for (const path of ['/today', '/', '/inbox', '/notes']) {
      expect(periodsShownOnPage(path)).toEqual([])
      expect(pinIsOnPage(path, 'week')).toBe(false)
      expect(pinIsOnPage(path, 'month')).toBe(false)
    }
  })
})
