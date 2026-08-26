import { describe, it, expect } from 'vitest'
import { windowCalendar, buildPagePrompt, parsePageResponse } from './parse'

describe('windowCalendar', () => {
  it('walks the window inclusively with weekday names', () => {
    const cal = windowCalendar('2026-08-25', '2026-08-27')
    expect(cal.map((c) => c.ymd)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27'])
    expect(cal[0].weekday).toBe('Tuesday')
  })
})

describe('buildPagePrompt', () => {
  it('embeds the calendar, the members, and the three output registers', () => {
    const prompt = buildPagePrompt(windowCalendar('2026-08-25', '2026-08-26'), [{ id: 'm-1', name: 'Iris' }], '2026-08-25')
    expect(prompt).toContain('2026-08-25 (Tuesday)')
    expect(prompt).toContain('m-1: Iris')
    expect(prompt).toContain('"items"')
    expect(prompt).toContain('"notes"')
    expect(prompt).toContain('"unclear"')
  })
})

describe('parsePageResponse', () => {
  const CAL = new Set(['2026-08-25', '2026-08-26'])
  const MEMBERS = new Set(['m-1'])

  it('parses through markdown fences', () => {
    const out = parsePageResponse(
      '```json\n{"items":[{"title":"Call dentist","day":"2026-08-26","assignee_id":null,"note":null}],"notes":[],"unclear":[]}\n```',
      CAL,
      MEMBERS,
    )
    expect(out.items).toEqual([{ title: 'Call dentist', day: '2026-08-26', assignee_id: null, note: null }])
  })

  it('degrades an out-of-window date to week rather than dropping the item', () => {
    const out = parsePageResponse('{"items":[{"title":"Mow","day":"2025-01-01"}]}', CAL, MEMBERS)
    expect(out.items[0].day).toBe('week')
  })

  it('nulls an assignee id that is not a household member', () => {
    const out = parsePageResponse('{"items":[{"title":"Mow","day":"week","assignee_id":"nope"}]}', CAL, MEMBERS)
    expect(out.items[0].assignee_id).toBeNull()
  })

  it('keeps notes and unclear lines', () => {
    const out = parsePageResponse(
      '{"items":[],"notes":[{"title":"Roof","content":"two quotes in"}],"unclear":["fence ???"]}',
      CAL,
      MEMBERS,
    )
    expect(out.notes).toEqual([{ title: 'Roof', content: 'two quotes in' }])
    expect(out.unclear).toEqual(['fence ???'])
  })

  it('returns an empty result rather than throwing on a missing items array', () => {
    expect(parsePageResponse('{"notes":[]}', CAL, MEMBERS)).toEqual({ items: [], notes: [], unclear: [] })
  })

  it('throws on unparseable text so the caller can retry', () => {
    expect(() => parsePageResponse('I could not read that page.', CAL, MEMBERS)).toThrow()
  })
})
