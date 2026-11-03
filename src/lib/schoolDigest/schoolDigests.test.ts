import { describe, expect, it } from 'vitest'
import { dayLabel, digestFromRow, onePerDay, toDoLabel, type SchoolDigestRow } from './schoolDigests'

const row = (over: Partial<SchoolDigestRow> = {}): SchoolDigestRow => ({
  id: 'a', digest_date: '2026-11-03', date_label: 'Tue, Nov 3', to_do_count: 1, created_at: '2026-11-03T21:02:00Z',
  sections: [{ source: '3-01 Mr. Gorby', toDo: [{ title: 'Study for Unit 4 math test (multiplying by 0, 1, 2, 5, 10)', when: 'Thu', details: 'The Unit 4 Review can help.' }], goodToKnow: ['Early dismissal Friday.'], chatter: 'Photos from the trip.' }],
  ...over,
})

describe('digestFromRow', () => {
  it('keeps every word of a stored section', () => {
    const d = digestFromRow(row())
    expect(d.sections[0].toDo[0].title).toBe('Study for Unit 4 math test (multiplying by 0, 1, 2, 5, 10)')
    expect(d.sections[0].toDo[0].details).toBe('The Unit 4 Review can help.')
    expect(d.sections[0].goodToKnow).toEqual(['Early dismissal Friday.'])
    expect(d.toDoCount).toBe(1)
  })

  it('drops malformed sections instead of rendering them half-way', () => {
    const d = digestFromRow(row({ sections: [{ toDo: [] }, 'nope', { source: 'PTO', toDo: [{ when: 'Fri' }], goodToKnow: [], chatter: '' }] }))
    expect(d.sections).toEqual([{ source: 'PTO', toDo: [], goodToKnow: [], chatter: '' }])
  })

  it('survives a row whose sections are not a list', () => {
    expect(digestFromRow(row({ sections: null, to_do_count: null })).sections).toEqual([])
  })
})

describe('onePerDay', () => {
  it('keeps the newest digest of each day (rows arrive newest first)', () => {
    const later = digestFromRow(row({ id: 'later', created_at: '2026-11-03T22:00:00Z' }))
    const earlier = digestFromRow(row({ id: 'earlier' }))
    const monday = digestFromRow(row({ id: 'mon', digest_date: '2026-11-02', date_label: 'Mon, Nov 2' }))
    expect(onePerDay([later, earlier, monday]).map((d) => d.id)).toEqual(['later', 'mon'])
  })
})

describe('labels', () => {
  it('names today and yesterday, else the email’s date', () => {
    expect(dayLabel({ date: '2026-11-03', label: 'Tue, Nov 3' }, '2026-11-03')).toBe('Today')
    expect(dayLabel({ date: '2026-11-02', label: 'Mon, Nov 2' }, '2026-11-03')).toBe('Yesterday')
    expect(dayLabel({ date: '2026-10-31', label: 'Fri, Oct 31' }, '2026-11-03')).toBe('Fri, Oct 31')
    // Across a month's end.
    expect(dayLabel({ date: '2026-10-31', label: 'Sat, Oct 31' }, '2026-11-01')).toBe('Yesterday')
  })
  it('counts what to do', () => {
    expect(toDoLabel(0)).toBe('Nothing to do')
    expect(toDoLabel(4)).toBe('4 to do')
  })
})
