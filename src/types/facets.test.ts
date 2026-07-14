import { describe, it, expect } from 'vitest'
import { parseFacets } from './facets'

describe('parseFacets', () => {
  it('accepts every vocabulary type', () => {
    const raw = [
      { type: 'summary', text: 'Airbnb confirmation for Kennebunkport' },
      { type: 'location', label: 'The house', address: '4 Beach Ave, Kennebunkport ME' },
      { type: 'access_code', label: 'Door code', code: '4482#' },
      { type: 'phone', number: '+1 207 555 0101' },
      { type: 'datetime', label: 'Check-in', iso: '2026-07-18T16:00:00' },
      { type: 'link', url: 'https://airbnb.com/trips/x' },
      { type: 'checklist', items: ['RSVP by Friday', 'Bring a gift'] },
      { type: 'purchase_item', name: 'T8 bulb', specs: '18W 4-pin' },
    ]
    expect(parseFacets(raw)).toHaveLength(8)
  })

  it('drops unknown types, malformed entries, and non-arrays', () => {
    expect(parseFacets([{ type: 'evil_html', html: '<script>' }, { type: 'location' }, 'x', null])).toEqual([])
    expect(parseFacets('not an array')).toEqual([])
    expect(parseFacets(null)).toEqual([])
  })

  it('drops empty strings and empty checklists, trims values', () => {
    expect(parseFacets([{ type: 'access_code', label: 'Door', code: '  ' }])).toEqual([])
    expect(parseFacets([{ type: 'checklist', items: [] }])).toEqual([])
    expect(parseFacets([{ type: 'summary', text: '  hi  ' }])).toEqual([{ type: 'summary', text: 'hi' }])
  })

  it('rejects non-http links', () => {
    expect(parseFacets([{ type: 'link', url: 'javascript:alert(1)' }])).toEqual([])
  })

  it('caps at 12 facets and 20 checklist items', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ type: 'summary', text: `s${i}` }))
    expect(parseFacets(many)).toHaveLength(12)
    const items = Array.from({ length: 30 }, (_, i) => `item ${i}`)
    const [cl] = parseFacets([{ type: 'checklist', items }]) as [{ type: 'checklist'; items: string[] }]
    expect(cl.items).toHaveLength(20)
  })
})
