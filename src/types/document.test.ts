import { describe, it, expect } from 'vitest'
import type { Facet } from '@/types/facets'
import {
  SENSITIVE_KINDS,
  isDocumentKind,
  stripSensitive,
  documentKindLabel,
  parseDocumentProposal,
  type DocumentKind,
} from '@/types/document'

const everyFacetType: Facet[] = [
  { type: 'summary', text: 'Maryland driver license for Scott Kaufman, DLN S-123-456' },
  { type: 'location', address: '742 Evergreen Terrace, Baltimore MD' },
  { type: 'access_code', label: 'DLN', code: 'S-123-456-789' },
  { type: 'phone', label: 'MVA', number: '+1 410 555 0100' },
  { type: 'datetime', label: 'Expires', iso: '2029-03-14T00:00:00' },
  { type: 'link', url: 'https://mva.maryland.gov' },
  { type: 'checklist', label: 'Bring', items: ['proof of address'] },
  { type: 'purchase_item', name: 'nothing', specs: 'n/a' },
]

describe('stripSensitive', () => {
  it('reduces a sensitive kind to a single kind-derived summary', () => {
    const out = stripSensitive(everyFacetType, 'drivers_license')
    expect(out).toEqual([{ type: 'summary', text: "Driver's license" }])
  })

  it.each([...SENSITIVE_KINDS])('drops every non-summary facet for %s', (kind) => {
    const out = stripSensitive(everyFacetType, kind as DocumentKind)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('summary')
  })

  it.each([...SENSITIVE_KINDS])('leaks no original value for %s', (kind) => {
    const serialized = JSON.stringify(stripSensitive(everyFacetType, kind as DocumentKind))
    for (const needle of ['S-123-456', '742 Evergreen', '410 555 0100', 'mva.maryland.gov', '2029-03-14']) {
      expect(serialized).not.toContain(needle)
    }
  })

  it('leaves non-sensitive kinds untouched', () => {
    expect(stripSensitive(everyFacetType, 'receipt')).toEqual(everyFacetType)
    expect(stripSensitive(everyFacetType, 'warranty')).toEqual(everyFacetType)
  })

  it('returns a summary even when the input had none', () => {
    const out = stripSensitive([{ type: 'phone', number: '+1 410 555 0100' }], 'passport')
    expect(out).toEqual([{ type: 'summary', text: 'Passport' }])
  })

  it('does not mutate its input', () => {
    const input = [...everyFacetType]
    stripSensitive(input, 'passport')
    expect(input).toHaveLength(everyFacetType.length)
  })
})

describe('isDocumentKind', () => {
  it('accepts known kinds and rejects everything else', () => {
    expect(isDocumentKind('passport')).toBe(true)
    expect(isDocumentKind('nuclear_codes')).toBe(false)
    expect(isDocumentKind(null)).toBe(false)
    expect(isDocumentKind(7)).toBe(false)
  })
})

describe('documentKindLabel', () => {
  it('renders human labels', () => {
    expect(documentKindLabel('drivers_license')).toBe("Driver's license")
    expect(documentKindLabel('social_security_card')).toBe('Social Security card')
    expect(documentKindLabel('other')).toBe('Document')
  })
})

describe('parseDocumentProposal', () => {
  it('parses a well-formed proposal', () => {
    expect(
      parseDocumentProposal({
        kind: 'drivers_license',
        label: "Scott's driver's license",
        owner: 'Scott',
        expires_on: '2029-03-14',
      })
    ).toEqual({
      kind: 'drivers_license',
      label: "Scott's driver's license",
      owner: 'Scott',
      expiresOn: '2029-03-14',
    })
  })

  it('defaults a missing label to the kind label', () => {
    expect(parseDocumentProposal({ kind: 'passport' })).toEqual({
      kind: 'passport',
      label: 'Passport',
      owner: null,
      expiresOn: null,
    })
  })

  it('rejects unknown kinds, non-objects, and null', () => {
    expect(parseDocumentProposal({ kind: 'grimoire' })).toBeNull()
    expect(parseDocumentProposal(null)).toBeNull()
    expect(parseDocumentProposal('passport')).toBeNull()
    expect(parseDocumentProposal({})).toBeNull()
  })

  it('drops a malformed expiry rather than failing the whole parse', () => {
    const out = parseDocumentProposal({ kind: 'passport', expires_on: 'next tuesday' })
    expect(out?.expiresOn).toBeNull()
    expect(out?.kind).toBe('passport')
  })
})
