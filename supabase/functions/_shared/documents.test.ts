import { describe, it, expect } from 'vitest'
import type { Facet } from './facets.ts'
import {
  SENSITIVE_KINDS,
  stripSensitive,
  parseDocumentProposal,
  documentKindLabel,
  type DocumentKind,
} from './documents.ts'

const loaded: Facet[] = [
  { type: 'summary', text: 'Passport for Scott Kaufman, no. 123456789' },
  { type: 'access_code', label: 'Passport no', code: '123456789' },
  { type: 'location', address: '742 Evergreen Terrace' },
  { type: 'datetime', label: 'Expires', iso: '2031-01-02T00:00:00' },
]

describe('edge stripSensitive', () => {
  it.each([...SENSITIVE_KINDS])('reduces %s to one summary and leaks nothing', (kind) => {
    const out = stripSensitive(loaded, kind as DocumentKind)
    expect(out).toEqual([{ type: 'summary', text: documentKindLabel(kind as DocumentKind) }])
    expect(JSON.stringify(out)).not.toContain('123456789')
    expect(JSON.stringify(out)).not.toContain('Evergreen')
  })

  it('passes non-sensitive kinds through', () => {
    expect(stripSensitive(loaded, 'receipt')).toEqual(loaded)
  })
})

describe('edge parseDocumentProposal', () => {
  it('parses and rejects symmetrically with the client twin', () => {
    expect(parseDocumentProposal({ kind: 'passport', expires_on: '2031-01-02' })?.expiresOn).toBe('2031-01-02')
    expect(parseDocumentProposal({ kind: 'not_a_kind' })).toBeNull()
    expect(parseDocumentProposal(undefined)).toBeNull()
  })
})
