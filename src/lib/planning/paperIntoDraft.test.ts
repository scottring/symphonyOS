import { describe, it, expect, beforeEach } from 'vitest'
import { draftTargetFor, mergePaperIntoDraft } from './paperIntoDraft'
import { emptyDraft, type SessionDraft, type SessionLevel } from './session'
import { writeDraft } from './sessionDraft'
import type { PageReviewPayload } from '@/components/capture/PageReviewSheet'
import type { PlanItem, PlanPlacement } from '@/lib/planParse'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

const seasons: Seasons = DEFAULT_SEASONS

function line(title: string, placement: PlanPlacement, over: Partial<PlanItem> = {}): PlanItem {
  return {
    title, placement, time: null, assigneeId: null, note: null, dateHint: null,
    kind: 'task', recurring: null, phone: null, contactMemberId: null, ...over,
  }
}
function page(items: PlanItem[]): PageReviewPayload {
  return { items, notes: [], domain: 'family' }
}
function draftFor(level: SessionLevel, periodStart: string): SessionDraft {
  const d = emptyDraft(level, new Date(2026, 9, 5), new Date(2026, 8, 28))
  return { ...d, periodStart }
}

beforeEach(() => localStorage.clear())

describe('mergePaperIntoDraft', () => {
  const empty = { open: [], above: [], current: [] }

  it('routes a goal line to newGoals and a task line to newTasks', () => {
    const d = draftFor('year', '2026-01-01')
    const r = mergePaperIntoDraft(d, page([
      line('Run a half marathon', { kind: 'goal' }),
      line('Book the race', { kind: 'week' }),
      line('Fix the porch railing', { kind: 'month' }, { goal: true }),
    ]), empty)

    expect(r.draft.newGoals.map((g) => g.title)).toEqual(['Run a half marathon', 'Fix the porch railing'])
    expect(r.draft.newTasks.map((t) => t.title)).toEqual(['Book the race'])
    expect(r.draft.newTasks[0].context).toBeNull()
    expect(r.draft.newTasks[0].id).toBeTruthy()
    expect(r.added).toEqual(['Run a half marathon', 'Book the race', 'Fix the porch railing'])
  })

  it('carries the line’s date as the day, on a WEEK draft only', () => {
    const dated = page([line('Dentist', { kind: 'date', date: '2026-10-07' })])
    const week = mergePaperIntoDraft(draftFor('week', '2026-10-05'), dated, empty)
    expect(week.draft.newTasks[0].day).toBe('2026-10-07')

    const month = mergePaperIntoDraft(draftFor('month', '2026-10-01'), dated, empty)
    expect(month.draft.newTasks[0].day).toBeUndefined()
  })

  it('skips and reports a line already on the draft', () => {
    const d = { ...draftFor('week', '2026-10-05'), newTasks: [{ id: 'n1', title: 'Call the roofer' }] }
    const r = mergePaperIntoDraft(d, page([line('Call the roofer', { kind: 'week' })]), empty)
    expect(r.added).toEqual([])
    expect(r.draft.newTasks).toHaveLength(1)
    expect(r.matched).toEqual([{ title: 'Call the roofer', matchedTo: 'Call the roofer', where: 'draft' }])
  })

  it('skips a line already on the level above, the previous period, or the current list', () => {
    const d = draftFor('week', '2026-10-05')
    const above = mergePaperIntoDraft(d, page([line('Three roof bids', { kind: 'week' })]),
      { ...empty, above: [{ id: 'a1', title: 'Three roof bids' }] })
    expect(above.matched[0].where).toBe('above')

    const prev = mergePaperIntoDraft(d, page([line('Three roof bids', { kind: 'week' })]),
      { ...empty, open: [{ id: 'p1', title: 'Three roof bids' }] })
    expect(prev.matched[0].where).toBe('previous')

    const cur = mergePaperIntoDraft(d, page([line('Three roof bids', { kind: 'week' })]),
      { ...empty, current: [{ id: 'c1', title: 'Three roof bids' }] })
    expect(cur.matched[0].where).toBe('current')
    expect(cur.added).toEqual([])
  })

  it('is idempotent: importing the same page twice adds nothing the second time', () => {
    const p = page([line('Order the mulch', { kind: 'week' }), line('Swap the tyres', { kind: 'week' })])
    const first = mergePaperIntoDraft(draftFor('week', '2026-10-05'), p, empty)
    const second = mergePaperIntoDraft(first.draft, p, empty)

    expect(first.added).toHaveLength(2)
    expect(second.added).toEqual([])
    expect(second.draft.newTasks).toHaveLength(2)
    expect(second.matched.map((m) => m.where)).toEqual(['draft', 'draft'])
  })

  it('leaves day-facts and recurring lines for the ordinary commit', () => {
    const p: PageReviewPayload = {
      ...page([
        line('No school Monday', { kind: 'date', date: '2026-10-05' }, { kind: 'dayfact' }),
        line('Bins out', { kind: 'week' }, { kind: 'recurring', recurring: { days: ['tue'], until: null } }),
        line('Order the mulch', { kind: 'week' }),
      ]),
      notes: [{ title: 'Thoughts', content: 'A good week' }],
    }
    const r = mergePaperIntoDraft(draftFor('week', '2026-10-05'), p, empty)

    expect(r.draft.newTasks.map((t) => t.title)).toEqual(['Order the mulch'])
    expect(r.rest.items.map((i) => i.title)).toEqual(['No school Monday', 'Bins out'])
    expect(r.rest.notes).toEqual(p.notes)
    expect(r.rest.domain).toBe('family')
  })
})

describe('draftTargetFor', () => {
  // Monday 5 October 2026.
  const monday = new Date(2026, 9, 5, 9, 0)

  it('is null when no draft is in progress', () => {
    expect(draftTargetFor('week', monday, seasons, 'u1')).toBeNull()
    expect(draftTargetFor('month', monday, seasons, 'u1')).toBeNull()
  })

  it('finds the week draft for the current week, mid-week', () => {
    // The default week starts on Sunday: Monday the 5th sits in the week of Oct 4.
    writeDraft('u1', draftFor('week', '2026-10-04'))
    expect(draftTargetFor('week', monday, seasons, 'u1')).toEqual({ level: 'week', periodStart: '2026-10-04', label: 'this week' })
  })

  it('a page snapped on the weekend is for the week ahead', () => {
    const saturday = new Date(2026, 9, 10, 9, 0)
    writeDraft('u1', draftFor('week', '2026-10-11'))
    const target = draftTargetFor('week', saturday, seasons, 'u1')
    expect(target?.periodStart).toBe('2026-10-11')
    expect(target?.label).not.toBe('this week')
  })

  it('finds the month and season drafts the pages plan', () => {
    writeDraft('u1', draftFor('month', '2026-10-01'))
    expect(draftTargetFor('month', monday, seasons, 'u1')).toEqual({ level: 'month', periodStart: '2026-10-01', label: 'October' })

    const season = draftTargetFor('season', monday, seasons, 'u1')
    expect(season).toBeNull()
    writeDraft('u1', draftFor('season', '2026-09-01'))
    expect(draftTargetFor('season', monday, seasons, 'u1')?.periodStart).toBe('2026-09-01')
  })

  it('a year page plans this year, and next year from Nov 20', () => {
    writeDraft('u1', draftFor('year', '2026-01-01'))
    expect(draftTargetFor('year', monday, seasons, 'u1')).toEqual({ level: 'year', periodStart: '2026-01-01', label: '2026' })

    const nov20 = new Date(2026, 10, 20, 9, 0)
    expect(draftTargetFor('year', nov20, seasons, 'u1')).toBeNull()
    writeDraft('u1', draftFor('year', '2027-01-01'))
    expect(draftTargetFor('year', nov20, seasons, 'u1')).toEqual({ level: 'year', periodStart: '2027-01-01', label: '2027' })
  })

  it('a draft belonging to another user is not this user’s offer', () => {
    writeDraft('u2', draftFor('week', '2026-10-04'))
    expect(draftTargetFor('week', monday, seasons, 'u1')).toBeNull()
  })
})
