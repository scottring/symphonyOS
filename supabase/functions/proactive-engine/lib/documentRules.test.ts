import { describe, it, expect } from 'vitest'
import { documentExpirySuggestions, EXPIRY_WARNING_DAYS } from './documentRules.ts'

const today = new Date('2026-08-05T12:00:00Z')

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    document_label: "Scott's driver's license",
    document_kind: 'drivers_license',
    document_expires_on: '2026-09-01',
    ...over,
  }
}

describe('documentExpirySuggestions', () => {
  it('suggests renewing a document inside the window', () => {
    const out = documentExpirySuggestions([doc()], today)
    expect(out).toHaveLength(1)
    expect(out[0].title).toMatch(/driver's license/i)
    expect(out[0].suggestion_key).toBe('document:a1:expiry')
    expect(out[0].entity_type).toBe('document')
  })

  it('ignores a document expiring beyond the window', () => {
    expect(documentExpirySuggestions([doc({ document_expires_on: '2029-03-14' })], today)).toHaveLength(0)
  })

  it('ignores a document with no expiry', () => {
    expect(documentExpirySuggestions([doc({ document_expires_on: null })], today)).toHaveLength(0)
  })

  it('ignores an unparseable expiry', () => {
    expect(documentExpirySuggestions([doc({ document_expires_on: 'someday' })], today)).toHaveLength(0)
  })

  it('includes the boundary day exactly', () => {
    const boundary = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10)
    expect(documentExpirySuggestions([doc({ document_expires_on: boundary })], today)).toHaveLength(1)
  })

  it('excludes the day after the boundary', () => {
    const past = new Date(today.getTime() + (EXPIRY_WARNING_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
    expect(documentExpirySuggestions([doc({ document_expires_on: past })], today)).toHaveLength(0)
  })

  it('still surfaces an already-expired document, with higher urgency', () => {
    const out = documentExpirySuggestions([doc({ document_expires_on: '2026-08-01' })], today)
    expect(out).toHaveLength(1)
    expect(out[0].title).toMatch(/expired/i)
    expect(out[0].urgency).toBeGreaterThan(0.8)
  })

  it('ranks a nearer expiry above a further one', () => {
    const near = documentExpirySuggestions([doc({ document_expires_on: '2026-08-10' })], today)[0]
    const far = documentExpirySuggestions([doc({ document_expires_on: '2026-09-25' })], today)[0]
    expect(near.urgency).toBeGreaterThan(far.urgency)
  })

  it('falls back to a generic label when none is stored', () => {
    const out = documentExpirySuggestions([doc({ document_label: null })], today)
    expect(out[0].title).toMatch(/^A document expires/i)
  })

  it('never puts the document number or any facet content in the suggestion', () => {
    const out = documentExpirySuggestions([doc()], today)
    expect(JSON.stringify(out)).not.toMatch(/\d{6,}/)
  })
})
