import { describe, it, expect } from 'vitest'
import { parseFacets } from './facets'

describe('parseFacets', () => {
  it('validates a phone facet from a parsed array', () => {
    const out = parseFacets([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
    expect(out).toEqual([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
  })
  it('parses from raw model text with markdown fences', () => {
    const out = parseFacets('```json\n[{"type":"access_code","label":"Gate","code":"4321"}]\n```')
    expect(out).toEqual([{ type: 'access_code', label: 'Gate', code: '4321' }])
  })
  it('drops malformed entries and caps at 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ type: 'summary', text: `s${i}` }))
    expect(parseFacets([{ type: 'phone' }, ...many]).length).toBe(12)
  })
  it('returns [] for garbage', () => {
    expect(parseFacets('not json')).toEqual([])
    expect(parseFacets(null)).toEqual([])
  })
})
