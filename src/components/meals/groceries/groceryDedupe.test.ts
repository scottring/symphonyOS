import { describe, it, expect } from 'vitest'
import { filterNewItems, dedupeKey } from './groceryDedupe'

describe('filterNewItems', () => {
  it('drops items already present in the list (case/space-insensitive)', () => {
    const out = filterNewItems(
      [{ text: 'Salmon' }, { text: 'Cucumbers' }, { text: 'milk' }],
      ['salmon', '  CUCUMBERS '],
    )
    expect(out.map((i) => i.text)).toEqual(['milk'])
  })

  it('dedupes within the batch itself', () => {
    const out = filterNewItems([{ text: 'salmon' }, { text: 'Salmon' }, { text: 'eggs' }], [])
    expect(out.map((i) => i.text)).toEqual(['salmon', 'eggs'])
  })

  it('keeps everything when nothing matches', () => {
    const out = filterNewItems([{ text: 'kale' }, { text: 'oats' }], ['salmon'])
    expect(out.map((i) => i.text)).toEqual(['kale', 'oats'])
  })

  it('skips blank/whitespace-only items', () => {
    const out = filterNewItems([{ text: '   ' }, { text: 'rice' }], [])
    expect(out.map((i) => i.text)).toEqual(['rice'])
  })

  it('returns empty when all items already exist', () => {
    expect(filterNewItems([{ text: 'Salmon' }], ['salmon'])).toEqual([])
  })
})

describe('dedupeKey', () => {
  it('lowercases and trims', () => {
    expect(dedupeKey('  Bell Peppers ')).toBe('bell peppers')
  })
})
