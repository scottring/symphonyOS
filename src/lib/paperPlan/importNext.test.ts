import { describe, it, expect } from 'vitest'
import { landingsOf, nextAfterImport, savedHeadline, type SavedImport } from './importNext'
import type { PlanItem } from '@/lib/planParse'

const line = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({
  title, placement: { kind: 'month' }, time: null, assigneeId: null, note: null, dateHint: null,
  kind: 'task', recurring: null, phone: null, contactMemberId: null, ...over,
})
const NAMES = { month: 'October', season: 'Fall', year: '2026' }
// Saturday weeks; Fall from Sep 1 here.
const helpers = {
  weekStartOf: (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x },
  weekNumber: () => 41,
  seasonOf: (d: Date) => (d.getMonth() >= 8 && d.getMonth() <= 10 ? { start: new Date(d.getFullYear(), 8, 1), name: 'Fall' } : { start: new Date(d.getFullYear(), 11, 1), name: 'Winter' }),
}
const TODAY = new Date(2026, 9, 8) // Thu Oct 8; week of Sat Oct 3

const saved = (over: Partial<SavedImport> = {}): SavedImport => ({
  id: 'x', altitude: 'month', periodStart: '2026-10-01', names: NAMES, saved: 3, linked: 0, failed: 0,
  landings: [{ count: 3, label: 'on October’s list' }], taskIds: ['t1', 't2', 't3'], at: 0, ...over,
})

describe('after a paper import — what it says', () => {
  it('names the period and the count when every line went on the page’s list', () => {
    expect(savedHeadline(saved())).toEqual({ headline: 'Your October list is saved — 3 items.', detail: null })
    expect(savedHeadline(saved({ altitude: 'season', periodStart: '2026-09-01', saved: 1, landings: [{ count: 1, label: 'on Fall’s list' }] })).headline)
      .toBe('Your Fall list is saved — 1 item.')
    expect(savedHeadline(saved({ altitude: 'week', periodStart: '2026-10-03', landings: [{ count: 3, label: 'on this week’s list' }] })).headline)
      .toBe('This week’s list is saved — 3 items.')
  })

  it('says where lines went when some left the page’s list — a day, Today, the Inbox', () => {
    const items = [line('Buy sunscreen'), line('Book the vet', { placement: { kind: 'date', date: '2026-10-14' } }), line('Call Mom', { placement: { kind: 'inbox' } }), line('Pay rent', { placement: { kind: 'date', date: '2026-10-08' } })]
    const landings = landingsOf(items, 1, 'month', NAMES, TODAY)
    expect(landings).toEqual([
      { count: 1, label: 'on October’s list' }, { count: 1, label: 'on Wed, Oct 14' }, { count: 1, label: 'in your Inbox' }, { count: 1, label: 'on Today' }, { count: 1, label: 'as a note' },
    ])
    expect(savedHeadline(saved({ saved: 5, landings }))).toEqual({
      headline: 'Saved from your page — 5 items.',
      detail: '1 on October’s list, 1 on Wed, Oct 14, 1 in your Inbox, 1 on Today, 1 as a note.',
    })
  })

  it('a line matched to one already on the plan is not counted as saved, and is mentioned', () => {
    const landings = landingsOf([line('A'), line('B', { sourceId: 'x' })], 0, 'month', NAMES, TODAY)
    expect(landings).toEqual([{ count: 1, label: 'on October’s list' }])
    expect(savedHeadline(saved({ saved: 1, linked: 1, landings })).detail).toBe('1 was already on your plan and left as it is.')
  })
})

describe('after a paper import — the next rung', () => {
  it('a month hands on to its week: choose what to work on this week', () => {
    expect(nextAfterImport(saved(), TODAY, helpers)).toEqual({
      sentence: 'Next, choose what you want to work on this week.', to: '/week?start=2026-10-03', openRefOn: null, weekFocus: true,
    })
  })

  it('a season hands on to its month, with the season beside it', () => {
    expect(nextAfterImport(saved({ altitude: 'season', periodStart: '2026-09-01' }), TODAY, helpers)).toEqual({
      sentence: 'Next, write October’s list, with Fall beside it.', to: '/month?start=2026-10-01', openRefOn: 'month', weekFocus: false,
    })
  })

  it('a year hands on to its season; a week to today', () => {
    expect(nextAfterImport(saved({ altitude: 'year', periodStart: '2026-01-01' }), TODAY, helpers)).toMatchObject({
      sentence: 'Next, write Fall’s list, with 2026 beside it.', to: '/season?start=2026-09-01', openRefOn: 'season',
    })
    expect(nextAfterImport(saved({ altitude: 'week', periodStart: '2026-10-03' }), TODAY, helpers)).toMatchObject({
      sentence: 'Next, pick something for today.', to: '/today', openRefOn: 'today',
    })
  })
})
