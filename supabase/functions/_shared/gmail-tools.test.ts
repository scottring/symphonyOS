import { describe, it, expect } from 'vitest'
import {
  buildSearchQueries,
  buildDraftPayload,
  clampMaxResults,
  MAX_SEARCH_RESULTS,
} from './gmail-tools'

describe('buildSearchQueries', () => {
  it('uses a raw Gmail query verbatim', () => {
    expect(buildSearchQueries({ query: 'potluck newer_than:30d' })).toEqual(['potluck newer_than:30d'])
  })

  it('trims surrounding whitespace', () => {
    expect(buildSearchQueries({ query: '  subject:trip  ' })).toEqual(['subject:trip'])
  })

  it('prefers the raw query over attendee emails when both are given', () => {
    const out = buildSearchQueries({ query: 'potluck', attendeeEmails: ['a@b.com'] })
    expect(out).toEqual(['potluck'])
  })

  it('expands attendee emails into from:/to: queries', () => {
    expect(buildSearchQueries({ attendeeEmails: ['a@b.com', 'c@d.com'] })).toEqual([
      'from:a@b.com OR to:a@b.com',
      'from:c@d.com OR to:c@d.com',
    ])
  })

  it('treats a whitespace-only query as absent and falls back to attendees', () => {
    expect(buildSearchQueries({ query: '   ', attendeeEmails: ['a@b.com'] })).toEqual([
      'from:a@b.com OR to:a@b.com',
    ])
  })

  it('returns no queries when there is nothing to search', () => {
    expect(buildSearchQueries({})).toEqual([])
    expect(buildSearchQueries({ query: '', attendeeEmails: [] })).toEqual([])
  })

  it('ignores non-string entries in attendeeEmails', () => {
    expect(buildSearchQueries({ attendeeEmails: ['a@b.com', null, 42, ''] })).toEqual([
      'from:a@b.com OR to:a@b.com',
    ])
  })
})

describe('clampMaxResults', () => {
  it('defaults when missing or unparseable', () => {
    expect(clampMaxResults(undefined)).toBe(5)
    expect(clampMaxResults('abc')).toBe(5)
  })

  it('caps at the ceiling', () => {
    expect(clampMaxResults(1000)).toBe(MAX_SEARCH_RESULTS)
  })

  it('rejects zero and negatives in favor of the default', () => {
    expect(clampMaxResults(0)).toBe(5)
    expect(clampMaxResults(-3)).toBe(5)
  })

  it('passes through a sane value and floors fractions', () => {
    expect(clampMaxResults(10)).toBe(10)
    expect(clampMaxResults(7.9)).toBe(7)
  })
})

describe('buildDraftPayload', () => {
  const valid = { to: 'a@b.com', subject: 'Hi', body: 'Text' }

  it('always sets mode to draft', () => {
    expect(buildDraftPayload(valid)).toMatchObject({ mode: 'draft' })
  })

  // The safety property: gmail-send sends on any mode that is not 'draft',
  // so a caller must not be able to talk this function into a real send.
  it('cannot be coerced into send mode by caller input', () => {
    for (const attempt of [{ mode: 'send' }, { mode: 'draft ' }, { sendMode: 'send' }, { Mode: 'send' }]) {
      const out = buildDraftPayload({ ...valid, ...attempt })
      expect(out).toMatchObject({ mode: 'draft' })
    }
  })

  it('passes a thread_id through as threadId for replies', () => {
    expect(buildDraftPayload({ ...valid, thread_id: 'abc123' })).toMatchObject({ threadId: 'abc123' })
  })

  it('omits threadId when absent or blank', () => {
    expect(buildDraftPayload(valid).threadId).toBeUndefined()
    expect(buildDraftPayload({ ...valid, thread_id: '  ' }).threadId).toBeUndefined()
  })

  it('rejects missing required fields', () => {
    expect(buildDraftPayload({ to: 'a@b.com', subject: 'Hi' })).toEqual({
      error: 'to, subject, and body are all required',
    })
    expect(buildDraftPayload({ ...valid, body: '   ' })).toHaveProperty('error')
    expect(buildDraftPayload({ ...valid, to: '' })).toHaveProperty('error')
  })
})
