import { describe, it, expect } from 'vitest'
import { ALL_LAYERS, type Layer } from '@/lib/domains'
import { hiddenBy, hiddenSentence, peoplePhrase, viewSummary, widenedView } from './viewVisibility'

const members = [{ id: 'alex', name: 'Alex' }, { id: 'mia', name: 'Mia' }]
const layers = (...l: Layer[]) => new Set<Layer>(l)

describe('hiddenBy — the same rules the pages draw with', () => {
  it('an unassigned line under "Alex only" is hidden by the people filter', () => {
    expect(hiddenBy({ context: 'family' }, { layers: ALL_LAYERS, people: ['alex'] })).toEqual({ people: true, area: false })
  })
  it('a line shows when it matches every lens', () => {
    expect(hiddenBy({ context: 'family', assignedTo: 'alex' }, { layers: layers('family'), people: ['alex'] })).toBeNull()
    expect(hiddenBy({ context: null }, { layers: ALL_LAYERS, people: [] })).toBeNull()
    expect(hiddenBy({ context: null }, { layers: ALL_LAYERS, people: ['unassigned'] })).toBeNull()
  })
  it('one of several assignees is enough (assignedToAll)', () => {
    expect(hiddenBy({ assignedTo: 'me', assignedToAll: ['me', 'alex'] }, { layers: ALL_LAYERS, people: ['alex'] })).toBeNull()
  })
  it('an untagged line is the Unsorted layer', () => {
    expect(hiddenBy({ context: null }, { layers: layers('family'), people: [] })).toEqual({ people: false, area: true })
  })
})

describe('widenedView — only the lens that hid it', () => {
  it('people → everyone; the areas stay as they were', () => {
    const view = { layers: layers('family'), people: ['alex'] }
    const next = widenedView({ context: 'family' }, view, { people: true, area: false })
    expect(next.people).toEqual([])
    expect([...next.layers]).toEqual(['family'])
  })
  it('area → the item’s own area added, nothing else', () => {
    const view = { layers: layers('family'), people: ['alex'] }
    const next = widenedView({ context: 'work', assignedTo: 'alex' }, view, { people: false, area: true })
    expect([...next.layers].sort()).toEqual(['family', 'work'])
    expect(next.people).toEqual(['alex'])
  })
})

describe('the words', () => {
  it('names the people', () => {
    expect(peoplePhrase(['alex'], members)).toBe('Alex’s items')
    expect(peoplePhrase(['alex', 'mia'], members)).toBe('Alex’s and Mia’s items')
    expect(peoplePhrase(['unassigned'], members)).toBe('unassigned items')
  })
  it('says why it is hidden', () => {
    const view = { layers: layers('family'), people: ['alex'] }
    expect(hiddenSentence({ context: 'family' }, view, { people: true, area: false }, members))
      .toBe('It’s hidden because you’re showing only Alex’s items.')
    expect(hiddenSentence({ context: 'work' }, view, { people: true, area: true }, members))
      .toBe('It’s hidden because you’re showing only Alex’s items, and Work items aren’t shown.')
  })
  it('summarises a narrowed view, and nothing for the whole one', () => {
    expect(viewSummary({ layers: ALL_LAYERS, people: [] }, members)).toBeNull()
    expect(viewSummary({ layers: ALL_LAYERS, people: ['alex'] }, members)?.text).toBe('Showing only Alex’s items')
    expect(viewSummary({ layers: layers('family', 'personal'), people: [] }, members)?.text).toBe('Showing only Family and Personal')
    expect(viewSummary({ layers: layers('family'), people: ['alex'] }, members)?.text).toBe('Showing only Alex’s items in Family')
  })
})
