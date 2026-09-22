import { describe, it, expect } from 'vitest'
import { keepsWeekView } from './keepsWeekView'
const page = (search: string) => ({ pathname: '/week', search })
describe('detail navigation preserves the week on screen', () => {
  it('preserves the view when opening, switching, or closing details', () => {
    expect(keepsWeekView(page(''), page('?detail=task:a'))).toBe(true)
    expect(keepsWeekView(page('?detail=task:a'), page('?detail=task:b'))).toBe(true)
    expect(keepsWeekView(page('?range=weekend&detail=task:a'), page('?range=weekend'))).toBe(true)
  })
  it('applies explicit period navigation even when repeated', () => {
    expect(keepsWeekView(page(''), page(''))).toBe(false)
    expect(keepsWeekView(page('?detail=task:a'), page('?range=weekend'))).toBe(false)
    expect(keepsWeekView(null, page(''))).toBe(false)
    expect(keepsWeekView({ pathname: '/today', search: '' }, page('?detail=task:a'))).toBe(false)
  })
})
