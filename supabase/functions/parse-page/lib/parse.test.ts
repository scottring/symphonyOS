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

  // Demo walkthrough 2026-09-04: "Mia: dentist 10am" and "call Dr. Park re
  // Mia's inhaler" were both ASSIGNED to Mia. A kid's name on a line says
  // who it is about; the role tells the model who can do it.
  it('labels each member with a role and tells the model a named child is the subject, not the doer', () => {
    const prompt = buildPagePrompt(
      windowCalendar('2026-08-25', '2026-08-26'),
      [{ id: 'm-1', name: 'Iris', role: 'parent' }, { id: 'm-2', name: 'Mia', role: 'child' }, { id: 'm-3', name: 'Edith' }],
      '2026-08-25',
    )
    expect(prompt).toContain('m-1: Iris (parent)')
    expect(prompt).toContain('m-2: Mia (child)')
    expect(prompt).toContain('m-3: Edith\n')
    expect(prompt).toContain('who the line is ABOUT')
    expect(prompt).toContain('"Take Mia to dentist", assignee_id null')
    // The demo's Edith had no role_label and the model read "Edith: sign
    // permission slip" as a child's slip for an adult to sign.
    expect(prompt).toContain('A member listed without a role is an adult.')
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
    expect(out.items).toEqual([{ title: 'Call dentist', day: '2026-08-26', time: null, assignee_id: null, note: null }])
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

// A clock time on a paper line is the appointment. It used to be dropped into
// `note`, so "Dentist 2pm" arrived as an all-day chip (launch rehearsal,
// 2026-09-04).
describe('parsePageResponse — times', () => {
  const CAL = new Set(['2026-08-25', '2026-08-26'])
  const MEMBERS = new Set(['m-1'])

  it('keeps a valid HH:MM time on a dated item', () => {
    const out = parsePageResponse(
      '{"items":[{"title":"Dentist","day":"2026-08-26","time":"14:00"}]}',
      CAL,
      MEMBERS,
    )
    expect(out.items[0].time).toBe('14:00')
  })

  it('drops a time from an item with no real day to hang it on', () => {
    const out = parsePageResponse('{"items":[{"title":"Dentist","day":"week","time":"14:00"}]}', CAL, MEMBERS)
    expect(out.items[0].time).toBeNull()
  })

  it('rejects a malformed time rather than passing it through', () => {
    for (const bad of ['2pm', '25:00', '14:60', '9:00', '']) {
      const out = parsePageResponse(
        `{"items":[{"title":"X","day":"2026-08-26","time":${JSON.stringify(bad)}}]}`,
        CAL,
        MEMBERS,
      )
      expect(out.items[0].time).toBeNull()
    }
  })
})
