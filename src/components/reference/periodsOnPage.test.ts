import { describe, expect, it } from 'vitest'
import { periodsShownOnPage, pinIsOnPage } from './periodsOnPage'

describe('periods a page already shows', () => {
  it('counts the week AND the month on /week — the month list is folded there', () => {
    expect(periodsShownOnPage('/week')).toEqual(['week', 'month'])
    expect(periodsShownOnPage('/workweek')).toEqual(['week', 'month'])
  })

  it('counts only the month on /month — that page folds the SEASON, not the week', () => {
    expect(periodsShownOnPage('/month')).toEqual(['month'])
    expect(pinIsOnPage('/month', 'week')).toBe(false)
  })

  it('counts nothing on Today, the library, or the higher periods', () => {
    for (const path of ['/today', '/', '/inbox', '/notes', '/season', '/year']) {
      expect(periodsShownOnPage(path)).toEqual([])
      expect(pinIsOnPage(path, 'week')).toBe(false)
      expect(pinIsOnPage(path, 'month')).toBe(false)
    }
  })
})
