import { describe, it, expect } from 'vitest'
import { scopeForDomain } from '@/lib/scope'
import { filterByLayers } from './domainFilter'
import type { Span } from '@/types/span'

/**
 * Ranges obey the layer model like everything else.
 *
 * The span feature first hardcoded `context: 'family'` in three places — the
 * create form, the add-to-range write, and nothing filtered ranges by layer at
 * all. Because scope is DERIVED from the domain, a range assumed to be family
 * derives scope 'compound': shared with the whole household and shown on the
 * kitchen wall. Guessing the domain is the leak, which is why there is no
 * scope picker anywhere in the app.
 */
describe('a range derives its scope from its domain, never a guess', () => {
  it('family → compound, which is the whole household', () => {
    expect(scopeForDomain('family', [], null)).toBe('compound')
  })

  it('work and personal stay individual — NOT compound', () => {
    expect(scopeForDomain('work', [], null)).toBe('individual')
    expect(scopeForDomain('personal', [], null)).toBe('individual')
  })

  it('an Unsorted range stays individual', () => {
    expect(scopeForDomain(null, [], null)).toBe('individual')
  })
})

describe('ranges are filtered by the checked layers', () => {
  const span = (id: string, context: Span['context']): Span => ({
    id, userId: 'u1', name: id, startDate: new Date(2026, 8, 5), endDate: new Date(2026, 8, 7),
    context, scope: 'individual', createdAt: new Date(), updatedAt: new Date(),
  })

  const all = [span('work-trip', 'work'), span('long-weekend', 'family'), span('recovery', 'personal'), span('untagged', null)]

  it('shows only the ranges whose layer is checked', () => {
    expect(filterByLayers(all, new Set(['family'])).map((s) => s.id)).toEqual(['long-weekend'])
    expect(filterByLayers(all, new Set(['work'])).map((s) => s.id)).toEqual(['work-trip'])
  })

  it('overlays several checked layers, like calendars', () => {
    expect(filterByLayers(all, new Set(['work', 'personal'])).map((s) => s.id)).toEqual(['work-trip', 'recovery'])
  })

  // context IS NULL is the Unsorted LAYER — a real layer, not "everywhere".
  it('hides an Unsorted range unless Unsorted is checked', () => {
    expect(filterByLayers(all, new Set(['family'])).map((s) => s.id)).not.toContain('untagged')
    expect(filterByLayers(all, new Set(['unsorted'])).map((s) => s.id)).toEqual(['untagged'])
  })
})
