import { describe, it, expect } from 'vitest'
import { parseFacets, tryParseFacets } from './facets'

describe('parseFacets', () => {
  it('validates a phone facet from a parsed array', () => {
    const out = parseFacets([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
    expect(out).toEqual([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
  })
  it('parses from raw model text with markdown fences', () => {
    const out = parseFacets('```json\n[{"type":"access_code","label":"Gate","code":"4321"}]\n```')
    expect(out).toEqual([{ type: 'access_code', label: 'Gate', code: '4321' }])
  })
  it('unwraps {facets: [...]} wrapper from string input', () => {
    const out = parseFacets('{"facets":[{"type":"summary","text":"hi"}]}')
    expect(out).toEqual([{ type: 'summary', text: 'hi' }])
  })
  it('unwraps {facets: [...]} wrapper from parsed object', () => {
    const out = parseFacets({ facets: [{ type: 'summary', text: 'hi' }] })
    expect(out).toEqual([{ type: 'summary', text: 'hi' }])
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

describe('tryParseFacets', () => {
  it('returns null when JSON.parse fails', () => {
    expect(tryParseFacets('not json')).toBeNull()
  })
  it('returns [] for valid empty array', () => {
    expect(tryParseFacets([])).toEqual([])
  })
  it('returns null when object is not array and lacks facets wrapper', () => {
    expect(tryParseFacets({ invalid: 'structure' })).toBeNull()
  })
  it('validates valid facet from wrapped object', () => {
    const out = tryParseFacets({ facets: [{ type: 'phone', label: 'test', number: '123' }] })
    expect(out).toEqual([{ type: 'phone', label: 'test', number: '123' }])
  })
})
