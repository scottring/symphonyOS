import { describe, it, expect } from 'vitest'
import {
  planWindowDates,
  validatePlanItems,
  planItemToAddTaskArgs,
  PLAN_WINDOW_DAYS,
  type PlanItem,
} from './planParse'
import { localYmd } from '@/lib/cadence/config'

const TODAY = new Date(2026, 7, 17) // Mon Aug 17 2026, local
const WINDOW = planWindowDates(TODAY)
const MEMBERS = new Set(['m-scott', 'm-iris'])

describe('planWindowDates', () => {
  it('starts today and spans the window, as local dates', () => {
    expect(WINDOW).toHaveLength(PLAN_WINDOW_DAYS)
    expect(WINDOW[0]).toBe('2026-08-17')
    expect(WINDOW[13]).toBe('2026-08-30')
  })

  it('crosses a month boundary without UTC drift', () => {
    const dates = planWindowDates(new Date(2026, 7, 25))
    expect(dates).toContain('2026-08-31')
    expect(dates).toContain('2026-09-01')
  })
})

describe('validatePlanItems', () => {
  it('accepts well-formed items', () => {
    const items = validatePlanItems(
      {
        items: [
          { title: 'Call dentist', day: '2026-08-18', assignee_id: null, note: '410-555-0100' },
          { title: 'Return library books', day: 'week', assignee_id: 'm-iris', note: null },
          { title: 'Research summer camps', day: 'inbox', assignee_id: null, note: null },
        ],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items).toEqual([
      { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, time: null, assigneeId: null, note: '410-555-0100' },
      { title: 'Return library books', placement: { kind: 'week' }, time: null, assigneeId: 'm-iris', note: null },
      { title: 'Research summer camps', placement: { kind: 'inbox' }, time: null, assigneeId: null, note: null },
    ])
  })

  it('degrades a date outside the window to This week instead of dropping the item', () => {
    const items = validatePlanItems(
      { items: [{ title: 'Thing', day: '2026-09-15', assignee_id: null, note: null }] },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].placement).toEqual({ kind: 'week' })
  })

  it('nulls an assignee id that is not a household member', () => {
    const items = validatePlanItems(
      { items: [{ title: 'Thing', day: 'inbox', assignee_id: 'm-stranger', note: null }] },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].assigneeId).toBeNull()
  })

  it('skips rows without a usable title and tolerates a malformed response', () => {
    expect(validatePlanItems({ items: [{ title: '   ', day: 'inbox' }, { day: 'week' }] }, WINDOW, MEMBERS)).toEqual([])
    expect(validatePlanItems(null, WINDOW, MEMBERS)).toEqual([])
    expect(validatePlanItems({ items: 'nope' }, WINDOW, MEMBERS)).toEqual([])
  })
})

describe('planItemToAddTaskArgs', () => {
  const ctx = { currentWeekStart: new Date(2026, 7, 16), context: 'family' as const }

  it('maps a dated item to an all-day scheduledFor on the local date', () => {
    const item: PlanItem = { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: 'ask about Mia' }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.scheduledFor && localYmd(args.scheduledFor)).toBe('2026-08-18')
    expect(args.options.isAllDay).toBe(true)
    expect(args.options.bucket).toBeUndefined()
    expect(args.options.notes).toBe('ask about Mia')
    expect(args.options.context).toBe('family')
  })

  it('maps a week item to bucket=week WITH the week stamped', () => {
    const item: PlanItem = { title: 'Mulch beds', placement: { kind: 'week' }, assigneeId: null, note: null }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.scheduledFor).toBeUndefined()
    expect(args.options.bucket).toBe('week')
    expect(args.options.weekStart).toEqual(ctx.currentWeekStart)
  })

  it('maps an inbox item to the inbox bucket with no week', () => {
    const item: PlanItem = { title: 'Someday thing', placement: { kind: 'inbox' }, assigneeId: null, note: null }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.options.bucket).toBe('inbox')
    expect(args.options.weekStart).toBeUndefined()
  })

  it('passes a named assignee and leaves unnamed for the default', () => {
    const named: PlanItem = { title: 'X', placement: { kind: 'inbox' }, assigneeId: 'm-iris', note: null }
    expect(planItemToAddTaskArgs(named, ctx).options.assignedTo).toBe('m-iris')
    const unnamed: PlanItem = { title: 'Y', placement: { kind: 'inbox' }, assigneeId: null, note: null }
    expect(planItemToAddTaskArgs(unnamed, ctx).options.assignedTo).toBeUndefined()
  })
})

// "Dentist 2pm" from a paper page must become a 2pm block, not an all-day chip
// with "2pm" buried in the note (launch rehearsal, 2026-09-04).
describe('planItemToAddTaskArgs — times', () => {
  const CTX = { currentWeekStart: new Date(2026, 7, 17), context: null }

  it('schedules a dated item with a time as a real block', () => {
    const args = planItemToAddTaskArgs(
      { title: 'Dentist', placement: { kind: 'date', date: '2026-08-18' }, time: '14:00', assigneeId: null, note: null },
      CTX,
    )
    expect(args.options.isAllDay).toBe(false)
    expect(args.scheduledFor?.getHours()).toBe(14)
    expect(args.scheduledFor?.getMinutes()).toBe(0)
    expect(args.scheduledFor?.getDate()).toBe(18)
  })

  it('still writes an all-day chip when the line named no time', () => {
    const args = planItemToAddTaskArgs(
      { title: 'Mow', placement: { kind: 'date', date: '2026-08-18' }, time: null, assigneeId: null, note: null },
      CTX,
    )
    expect(args.options.isAllDay).toBe(true)
    expect(args.scheduledFor?.getHours()).toBe(0)
  })
})

// Altitudes (2026-09-05): a page is a week, month, season, or year page, and
// the altitude sizes the window and decides where an undated line lands.
describe('planWindowDates — altitudes', () => {
  it('a month page runs from today through the end of NEXT month', () => {
    const dates = planWindowDates(new Date(2026, 8, 28), 'month') // Sep 28
    expect(dates[0]).toBe('2026-09-28')
    expect(dates[dates.length - 1]).toBe('2026-10-31')
    expect(dates).toContain('2026-10-01')
  })

  it('a season page runs 92 days', () => {
    const dates = planWindowDates(TODAY, 'season')
    expect(dates).toHaveLength(92)
  })

  it('a year page has no dates', () => {
    expect(planWindowDates(TODAY, 'year')).toEqual([])
  })

  it('a week page is unchanged', () => {
    expect(planWindowDates(TODAY, 'week')).toEqual(WINDOW)
  })
})

describe('validatePlanItems — altitudes', () => {
  it('accepts the horizon placements', () => {
    const items = validatePlanItems(
      { items: [{ title: 'A', day: 'month' }, { title: 'B', day: 'season' }, { title: 'C', day: 'someday' }] },
      WINDOW, MEMBERS, 'month',
    )
    expect(items.map((i) => i.placement)).toEqual([{ kind: 'month' }, { kind: 'season' }, { kind: 'someday' }])
  })

  it('degrades an out-of-window date to the page’s altitude', () => {
    const bad = { items: [{ title: 'X', day: '2030-01-01' }] }
    expect(validatePlanItems(bad, WINDOW, MEMBERS, 'month')[0].placement).toEqual({ kind: 'month' })
    expect(validatePlanItems(bad, WINDOW, MEMBERS, 'season')[0].placement).toEqual({ kind: 'season' })
    expect(validatePlanItems(bad, [], MEMBERS, 'year')[0].placement).toEqual({ kind: 'goal' })
  })

  it('keeps a goal only on a year page', () => {
    const goal = { items: [{ title: 'Half marathon', day: 'goal' }] }
    expect(validatePlanItems(goal, [], MEMBERS, 'year')[0].placement).toEqual({ kind: 'goal' })
    expect(validatePlanItems(goal, WINDOW, MEMBERS, 'week')[0].placement).toEqual({ kind: 'someday' })
  })
})

describe('planItemToAddTaskArgs — horizons', () => {
  const ctx = { currentWeekStart: new Date(2026, 7, 16), context: null }
  const item = (kind: 'month' | 'season' | 'someday' | 'goal'): PlanItem =>
    ({ title: 'X', placement: { kind }, time: null, assigneeId: null, note: null })

  it('month → the month pool', () => {
    const args = planItemToAddTaskArgs(item('month'), ctx)
    expect(args.scheduledFor).toBeUndefined()
    expect(args.options.bucket).toBe('month')
    expect(args.options.weekStart).toBeUndefined()
  })

  it('season → the quarter bucket, picked (writing it on the season page IS the pick)', () => {
    const args = planItemToAddTaskArgs(item('season'), ctx)
    expect(args.options.bucket).toBe('quarter')
    expect(args.options.pickedAt).toBeInstanceOf(Date)
  })

  it('someday → the someday bucket', () => {
    expect(planItemToAddTaskArgs(item('someday'), ctx).options.bucket).toBe('someday')
  })

  it('a goal that reaches the task writer lands in Someday rather than vanishing', () => {
    expect(planItemToAddTaskArgs(item('goal'), ctx).options.bucket).toBe('someday')
  })
})
