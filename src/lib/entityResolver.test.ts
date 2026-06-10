// src/lib/entityResolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveContact, type ResolverContext } from './entityResolver'

const macmillan = { id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }
const jon = { id: 'c2', name: 'Jonathan Katz' }
const jonathanK = { id: 'c3', name: 'Jonathan Kane' }

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  contacts: [macmillan, jon, jonathanK],
  aliases: [],
  ...over,
})

describe('resolveContact — tier 2 containment (the Macmillan case)', () => {
  it('resolves a contact whose full name appears in the title', () => {
    const s = resolveContact('Call Macmillan Guitars', ctx())
    expect(s).not.toBeNull()
    expect(s!.contactId).toBe('c1')
    expect(s!.tier).toBe('containment')
    expect(s!.band).toBe('apply')
    expect(s!.phone).toBe('410-555-0142')
  })

  it('detects call intent from the leading verb', () => {
    expect(resolveContact('Call Macmillan Guitars', ctx())!.callIntent).toBe(true)
    expect(resolveContact('text macmillan guitars', ctx())!.callIntent).toBe(true)
    expect(resolveContact('Visit Macmillan Guitars', ctx())!.callIntent).toBe(false)
  })

  it('matches case- and punctuation-insensitively', () => {
    const s = resolveContact('call macmillan guitars!', ctx())
    expect(s!.contactId).toBe('c1')
  })

  it('returns null when nothing matches', () => {
    expect(resolveContact('Buy milk', ctx())).toBeNull()
  })
})

describe('resolveContact — tier 1 learned aliases', () => {
  it('resolves via a learned alias at score 1.0', () => {
    const s = resolveContact('call the guitar place', ctx({
      aliases: [{ aliasNormalized: 'the guitar place', entityType: 'contact', entityId: 'c1' }],
    }))
    expect(s!.tier).toBe('alias')
    expect(s!.score).toBe(1)
    expect(s!.band).toBe('apply')
    expect(s!.contactId).toBe('c1')
  })

  it('alias tier beats containment tier', () => {
    const s = resolveContact('call jonathan', ctx({
      aliases: [{ aliasNormalized: 'jonathan', entityType: 'contact', entityId: 'c3' }],
    }))
    expect(s!.contactId).toBe('c3')
    expect(s!.tier).toBe('alias')
  })

  it('ignores project-type aliases for contact resolution', () => {
    const s = resolveContact('call the guitar place', ctx({
      aliases: [{ aliasNormalized: 'the guitar place', entityType: 'project', entityId: 'c1' }],
    }))
    expect(s).toBeNull()
  })
})

describe('resolveContact — tier 3 fuzzy', () => {
  it('fuzzy-matches a misspelling as a suggestion', () => {
    const s = resolveContact('call macmilan guitars', ctx()) // missing an l
    expect(s).not.toBeNull()
    expect(s!.contactId).toBe('c1')
    expect(s!.tier).toBe('fuzzy')
    expect(s!.score).toBeGreaterThanOrEqual(0.6)
  })

  it('near-tie between two contacts never pre-applies', () => {
    const s = resolveContact('call jonathan', ctx())
    if (s) expect(s.band).toBe('ghost')
  })

  it('disables fuzzy for candidates under 5 chars', () => {
    expect(resolveContact('call jon', ctx({ contacts: [jonathanK] }))).toBeNull()
  })
})

describe('verb stripping', () => {
  it('strips multi-word "pick up"', () => {
    const s = resolveContact('pick up macmillan guitars', ctx())
    expect(s!.contactId).toBe('c1')
    expect(s!.callIntent).toBe(false)
  })

  it('returns null for a bare verb', () => {
    expect(resolveContact('call', ctx())).toBeNull()
  })
})
