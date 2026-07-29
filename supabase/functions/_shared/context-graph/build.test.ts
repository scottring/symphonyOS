import { describe, it, expect } from 'vitest'
import { facetsToFacts, boundKnowledge, buildTime, renderBundleForPrompt } from './build'
import type { BundleNote, ContextBundle } from './types'
import { KNOWLEDGE_K } from './types'

describe('facetsToFacts', () => {
  it('flattens validated facets and keeps the attachment id', () => {
    const out = facetsToFacts([{ id: 'att-1', facets: [{ type: 'phone', number: '410-555-0100' }] }])
    expect(out).toEqual([{ facet: { type: 'phone', number: '410-555-0100' }, attachmentId: 'att-1' }])
  })
  it('skips null facets (never analyzed)', () => {
    expect(facetsToFacts([{ id: 'a', facets: null }])).toEqual([])
  })
})

describe('boundKnowledge', () => {
  const linked = (id: string): BundleNote => ({ id, title: id, snippet: '', source: 'linked' })
  const sem = (id: string, sim: number): BundleNote => ({ id, title: id, snippet: '', source: 'semantic', similarity: sim })
  it('linked notes come first and win dedupe', () => {
    const out = boundKnowledge([sem('a', 0.9), linked('a'), linked('b')])
    expect(out.map(n => n.id)).toEqual(['a', 'b'])
    expect(out[0].source).toBe('linked')
  })
  it('drops semantic notes below the floor and caps at K', () => {
    const notes = [sem('low', 0.3), ...Array.from({ length: 10 }, (_, i) => sem(`s${i}`, 0.9 - i * 0.01))]
    const out = boundKnowledge(notes)
    expect(out.length).toBe(KNOWLEDGE_K)
    expect(out.find(n => n.id === 'low')).toBeUndefined()
  })
})

describe('buildTime', () => {
  it('computes ageDays and passes through waiting state', () => {
    const now = new Date('2026-07-29T12:00:00Z')
    const t = buildTime({ scheduled_for: null, bucket: 'week', is_waiting: true, waiting_since: '2026-07-22T00:00:00Z', defer_count: 3, created_at: '2026-07-01T00:00:00Z' }, now)
    expect(t.ageDays).toBe(28)
    expect(t.isWaiting).toBe(true)
    expect(t.deferCount).toBe(3)
  })
})

describe('renderBundleForPrompt', () => {
  const base: ContextBundle = {
    ref: { entityType: 'task', entityId: 't1', userId: 'u1' },
    entity: { id: 't1', title: 'Call Camp Notre Dame', links: [], phoneNumber: undefined },
    people: [{ id: 'c1', name: 'Camp Notre Dame', role: 'about', phone: '410-555-0100' }],
    lineage: { projectName: 'Summer 2026', goalTitle: 'Kids have a great summer' },
    facts: [{ facet: { type: 'phone', number: '410-555-0199' }, attachmentId: 'a1' }],
    knowledge: [{ id: 'n1', title: 'camp-notes', snippet: 'signed up 6/1, left voicemail', source: 'linked' }],
    history: [{ actionType: 'call', detail: 'Called 410-555-0100', outcome: 'no_answer', createdAt: '2026-07-27T10:00:00Z' }],
    time: { ageDays: 12, isWaiting: true },
    degraded: [],
  }
  it('includes every non-empty part', () => {
    const s = renderBundleForPrompt(base)
    expect(s).toContain('Call Camp Notre Dame')
    expect(s).toContain('410-555-0100')          // person phone
    expect(s).toContain('Summer 2026')           // lineage
    expect(s).toContain('camp-notes')            // knowledge
    expect(s).toContain('no_answer')             // history
  })
  it('omits empty parts entirely', () => {
    const s = renderBundleForPrompt({ ...base, people: [], lineage: {}, facts: [], knowledge: [], history: [] })
    expect(s).not.toContain('PEOPLE')
    expect(s).not.toContain('HISTORY')
  })
})
