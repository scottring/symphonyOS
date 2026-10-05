import { describe, it, expect } from 'vitest'
import { parseCaptureFacets, reachFromFacets } from './captureReach'

// Scott, 2026-10-04: a photo of a jury summons came back with the night-before
// confirmation number and website buried in the note as plain text — "being
// able to just click that phone number or that website would have been great".
describe('parseCaptureFacets', () => {
  it('keeps a printed website without a scheme, as https', () => {
    const out = parseCaptureFacets([
      { type: 'phone', label: 'Confirm service — night before, after 5 PM', number: '410-333-1555' },
      { type: 'link', label: 'Confirm service online', url: 'www.baltimorecitycourt.org' },
      { type: 'link', label: 'Juror form', url: 'https://ejury.mdcourts.gov' },
    ])
    expect(out.map((f) => (f.type === 'link' ? f.url : f.type))).toEqual([
      'phone', 'https://www.baltimorecitycourt.org', 'https://ejury.mdcourts.gov',
    ])
  })

  it('drops anything that is not a web address', () => {
    expect(parseCaptureFacets([{ type: 'link', url: 'see back of card' }])).toEqual([])
    expect(parseCaptureFacets(undefined)).toEqual([])
  })
})

describe('reachFromFacets', () => {
  const facets = parseCaptureFacets([
    { type: 'summary', text: 'Trial jury summons' },
    { type: 'phone', label: 'Confirm service — night before, after 5 PM', number: '410-333-1555' },
    { type: 'phone', label: 'Jury office', number: '410-333-3773' },
    { type: 'link', label: 'Confirm service online', url: 'www.baltimorecitycourt.org' },
  ])

  it('puts the first number on the task and every website in its links, labelled', () => {
    expect(reachFromFacets(facets, { phone_number: null, links: null })).toEqual({
      phone_number: '410-333-1555',
      links: [{ url: 'https://www.baltimorecitycourt.org', title: 'Confirm service online' }],
    })
  })

  it('never overwrites a number or repeats a link the task already has', () => {
    expect(reachFromFacets(facets, {
      phone_number: '410-555-0100',
      links: [{ url: 'https://www.baltimorecitycourt.org', title: 'Court' }],
    })).toEqual({})
  })

  it('reads links stored the old way, as bare strings', () => {
    expect(reachFromFacets(facets, { phone_number: 'x', links: ['https://www.baltimorecitycourt.org'] })).toEqual({})
  })
})
