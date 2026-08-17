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
      { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100' },
      { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null },
      { title: 'Research summer camps', placement: { kind: 'inbox' }, assigneeId: null, note: null },
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
