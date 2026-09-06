import { describe, it, expect } from 'vitest'
import { validatePageResult } from './pageParse'

const MEMBERS = [{ id: 'm-iris', name: 'Iris', role: 'parent' }]
const FALLBACK = ['2026-08-25', '2026-08-26']

describe('validatePageResult', () => {
  it('clamps items against the window the response echoed, not the fallback', () => {
    const out = validatePageResult(
      {
        window: ['2026-09-01', '2026-09-02'],
        items: [{ title: 'Call dentist', day: '2026-09-02', assignee_id: null, note: null }],
      },
      MEMBERS,
      FALLBACK,
    )
    expect(out.windowDates).toEqual(['2026-09-01', '2026-09-02'])
    expect(out.items[0].placement).toEqual({ kind: 'date', date: '2026-09-02' })
  })

  it('falls back to the caller window when the response echoes none', () => {
    const out = validatePageResult(
      { items: [{ title: 'Call dentist', day: '2026-08-26', assignee_id: null, note: null }] },
      MEMBERS,
      FALLBACK,
    )
    expect(out.windowDates).toEqual(FALLBACK)
    expect(out.items[0].placement).toEqual({ kind: 'date', date: '2026-08-26' })
  })

  it('keeps notes with content and derives a missing title from the first line', () => {
    const out = validatePageResult(
      { notes: [{ content: 'Roof quote thinking\nGutters add 1200' }, { title: 'x', content: '   ' }] },
      MEMBERS,
      FALLBACK,
    )
    expect(out.notes).toEqual([
      { title: 'Roof quote thinking', content: 'Roof quote thinking\nGutters add 1200' },
    ])
  })

  it('trims unclear lines and drops the empty ones', () => {
    const out = validatePageResult({ unclear: ['  call ??? re: fence  ', '', 42] }, MEMBERS, FALLBACK)
    expect(out.unclear).toEqual(['call ??? re: fence'])
  })

  it('carries storagePath through and defaults it to null', () => {
    expect(validatePageResult({ storagePath: 'u/1.png' }, MEMBERS, FALLBACK).storagePath).toBe('u/1.png')
    expect(validatePageResult({}, MEMBERS, FALLBACK).storagePath).toBeNull()
  })

  it('carries the page title through and derives titlePeriod from it', () => {
    const out = validatePageResult({ page_title: '2026' }, MEMBERS, FALLBACK)
    expect(out.pageTitle).toBe('2026')
    expect(out.titlePeriod).toEqual({ kind: 'year', year: 2026 })
  })

  it('defaults pageTitle and titlePeriod to null when absent', () => {
    const out = validatePageResult({}, MEMBERS, FALLBACK)
    expect(out.pageTitle).toBeNull()
    expect(out.titlePeriod).toBeNull()
  })

  it('returns an empty result for junk', () => {
    const out = validatePageResult(null, MEMBERS, FALLBACK)
    expect(out).toEqual({
      items: [],
      notes: [],
      unclear: [],
      windowDates: FALLBACK,
      altitude: 'week',
      storagePath: null,
      pageTitle: null,
      titlePeriod: null,
    })
  })
})

describe('validatePageResult — altitude', () => {
  it('reads the echoed altitude and validates items against it', () => {
    const out = validatePageResult(
      { window: [], altitude: 'year', items: [{ title: 'Half marathon', day: 'goal' }] },
      MEMBERS,
      FALLBACK,
    )
    expect(out.altitude).toBe('year')
    expect(out.windowDates).toEqual([])
    expect(out.items[0].placement).toEqual({ kind: 'goal' })
  })

  it('defaults to week when the response predates altitudes', () => {
    const out = validatePageResult({ items: [{ title: 'X', day: 'goal' }] }, MEMBERS, FALLBACK)
    expect(out.altitude).toBe('week')
    expect(out.windowDates).toEqual(FALLBACK)
    expect(out.items[0].placement).toEqual({ kind: 'someday' })
  })
})
