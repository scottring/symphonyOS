import { describe, it, expect } from 'vitest'
import { DOMAINS, ALL_LAYERS, UNSORTED, LAYER_LABELS, layerOf, domainById } from './domains'

describe('DOMAINS', () => {
  it('lists work, family, personal in that order and only family is shared', () => {
    expect(DOMAINS.map((d) => d.id)).toEqual(['work', 'family', 'personal'])
    expect(DOMAINS.filter((d) => d.shared).map((d) => d.id)).toEqual(['family'])
  })

  it('ALL_LAYERS is the three domains plus unsorted', () => {
    expect([...ALL_LAYERS].sort()).toEqual(['family', 'personal', 'unsorted', 'work'])
  })

  it('layerOf maps null/undefined context to unsorted and a context to itself', () => {
    expect(layerOf(null)).toBe(UNSORTED)
    expect(layerOf(undefined)).toBe(UNSORTED)
    expect(layerOf('work')).toBe('work')
  })

  it('every layer has a label and every domain resolves by id', () => {
    for (const l of ALL_LAYERS) expect(LAYER_LABELS[l]).toBeTruthy()
    expect(domainById('family').label).toBe('Family')
  })
})
