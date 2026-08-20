import { describe, it, expect } from 'vitest'
import {
  planWindowDates,
  validatePlanItems,
  planItemToAddTaskArgs,
  PLAN_WINDOW_DAYS,
  describeExisting,
  placementsEqual,
  planItemToUpdateArgs,
  type PlanItem,
  type ExistingMatch,
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
      { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100', existing: null },
      { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null, existing: null },
      { title: 'Research summer camps', placement: { kind: 'inbox' }, assigneeId: null, note: null, existing: null },
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
    const item: PlanItem = { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: 'ask about Mia', existing: null }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.scheduledFor && localYmd(args.scheduledFor)).toBe('2026-08-18')
    expect(args.options.isAllDay).toBe(true)
    expect(args.options.bucket).toBeUndefined()
    expect(args.options.notes).toBe('ask about Mia')
    expect(args.options.context).toBe('family')
  })

  it('maps a week item to bucket=week WITH the week stamped', () => {
    const item: PlanItem = { title: 'Mulch beds', placement: { kind: 'week' }, assigneeId: null, note: null, existing: null }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.scheduledFor).toBeUndefined()
    expect(args.options.bucket).toBe('week')
    expect(args.options.weekStart).toEqual(ctx.currentWeekStart)
  })

  it('maps an inbox item to the inbox bucket with no week', () => {
    const item: PlanItem = { title: 'Someday thing', placement: { kind: 'inbox' }, assigneeId: null, note: null, existing: null }
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.options.bucket).toBe('inbox')
    expect(args.options.weekStart).toBeUndefined()
  })

  it('passes a named assignee and leaves unnamed for the default', () => {
    const named: PlanItem = { title: 'X', placement: { kind: 'inbox' }, assigneeId: 'm-iris', note: null, existing: null }
    expect(planItemToAddTaskArgs(named, ctx).options.assignedTo).toBe('m-iris')
    const unnamed: PlanItem = { title: 'Y', placement: { kind: 'inbox' }, assigneeId: null, note: null, existing: null }
    expect(planItemToAddTaskArgs(unnamed, ctx).options.assignedTo).toBeUndefined()
  })
})

describe('describeExisting', () => {
  it('labels a dated task with a short local date', () => {
    // Noon UTC, not midnight: midnight UTC resolves to the PREVIOUS local day
    // west of Greenwich (e.g. EDT), which would make this test fail everywhere
    // but UTC. Noon UTC resolves to Aug 20 for every real-world offset
    // (-11..+11), so the test doesn't depend on where it runs. Do not "tidy"
    // this back to midnight.
    const out = describeExisting('timed', '2026-08-20T12:00:00.000Z')
    expect(out.label).toMatch(/Aug 20/)
    expect(out.placement).toEqual({ kind: 'date', date: '2026-08-20' })
  })

  it('labels the week bucket', () => {
    expect(describeExisting('week', null)).toEqual({ label: 'This week', placement: { kind: 'week' } })
  })

  it('labels the inbox, including a null bucket', () => {
    expect(describeExisting('inbox', null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
    expect(describeExisting(null, null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
  })

  it('labels month, quarter, and someday with no comparable placement', () => {
    // No PlanPlacement equivalent — a null placement never compares equal, so
    // these always write rather than being mistaken for a no-op. Someday is a
    // live bucket (TriageWhenMenu, InboxView, RescheduleGrid), not legacy —
    // without its own branch it fell through to Inbox, which both mislabels
    // the match on screen and (via placementsEqual) lets a Someday task get
    // silently skipped as a false no-op against an inbox-bound line.
    expect(describeExisting('month', null)).toEqual({ label: 'Month', placement: null })
    expect(describeExisting('quarter', null)).toEqual({ label: 'Quarter', placement: null })
    expect(describeExisting('someday', null)).toEqual({ label: 'Someday', placement: null })
  })

  it('falls back to Inbox when timed has no date', () => {
    expect(describeExisting('timed', null)).toEqual({ label: 'Inbox', placement: { kind: 'inbox' } })
  })
})

describe('placementsEqual', () => {
  it('matches identical placements', () => {
    expect(placementsEqual({ kind: 'date', date: '2026-08-20' }, { kind: 'date', date: '2026-08-20' })).toBe(true)
    expect(placementsEqual({ kind: 'week' }, { kind: 'week' })).toBe(true)
    expect(placementsEqual({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true)
  })

  it('separates different placements', () => {
    expect(placementsEqual({ kind: 'date', date: '2026-08-20' }, { kind: 'date', date: '2026-08-21' })).toBe(false)
    expect(placementsEqual({ kind: 'week' }, { kind: 'inbox' })).toBe(false)
  })

  it('never matches a null placement', () => {
    expect(placementsEqual(null, { kind: 'week' })).toBe(false)
  })

  it('never treats a Someday match as a no-op against an inbox target', () => {
    // Regression for the bug where 'someday' fell through to describeExisting's
    // Inbox default: a Someday task matched against a line the page places in
    // the inbox must NOT compare equal, or the re-place is silently skipped as
    // a false no-op and the task stays stranded in Someday.
    const someday = describeExisting('someday', null)
    expect(placementsEqual(someday.placement, { kind: 'inbox' })).toBe(false)
  })
})

describe('validatePlanItems with matches', () => {
  it('attaches a match to the item at its index', () => {
    const items = validatePlanItems(
      {
        items: [
          { title: 'Call roofer', day: '2026-08-18', assignee_id: null, note: null },
          { title: 'Mulch beds', day: 'week', assignee_id: null, note: null },
        ],
        matches: [{ index: 0, task_id: 't-roof', bucket: 'week', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toEqual({
      taskId: 't-roof',
      label: 'This week',
      placement: { kind: 'week' },
    })
    expect(items[1].existing).toBeNull()
  })

  it('leaves existing null when the response carries no matches', () => {
    const items = validatePlanItems(
      { items: [{ title: 'Call roofer', day: 'week', assignee_id: null, note: null }] },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toBeNull()
  })

  it('ignores a match index that no item occupies', () => {
    const items = validatePlanItems(
      {
        items: [{ title: 'Call roofer', day: 'week', assignee_id: null, note: null }],
        matches: [{ index: 7, task_id: 't-roof', bucket: 'week', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items[0].existing).toBeNull()
  })

  it('indexes matches against the RAW response, not the filtered output', () => {
    // Item 0 is dropped for having no title, so the surviving item is index 1
    // in the response but index 0 in the output. The match must follow the row.
    const items = validatePlanItems(
      {
        items: [
          { title: '   ', day: 'week', assignee_id: null, note: null },
          { title: 'Call roofer', day: 'week', assignee_id: null, note: null },
        ],
        matches: [{ index: 1, task_id: 't-roof', bucket: 'inbox', scheduled_for: null }],
      },
      WINDOW,
      MEMBERS,
    )
    expect(items).toHaveLength(1)
    expect(items[0].existing?.taskId).toBe('t-roof')
  })
})

describe('planItemToUpdateArgs', () => {
  const ctx = { currentWeekStart: new Date(2026, 7, 16), context: 'family' as const }
  const matched: ExistingMatch = { taskId: 't-1', label: 'Inbox', placement: { kind: 'inbox' } }

  it('moves a matched item to a date as an all-day timed task', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'date', date: '2026-08-20' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(localYmd(updates.scheduledFor as Date)).toBe('2026-08-20')
    expect(updates.isAllDay).toBe(true)
    expect(updates.bucket).toBe('timed')
  })

  it('moves a matched item to the week bucket WITH the week stamped, clearing the date', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'week' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(updates.bucket).toBe('week')
    expect(updates.weekStart).toEqual(ctx.currentWeekStart)
    expect('scheduledFor' in updates).toBe(true)
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('moves a matched item to the inbox, clearing the date', () => {
    const updates = planItemToUpdateArgs(
      { title: 'X', placement: { kind: 'inbox' }, assigneeId: null, note: null, existing: matched },
      ctx,
    )
    expect(updates.bucket).toBe('inbox')
    expect('scheduledFor' in updates).toBe(true)
    expect(updates.scheduledFor).toBeUndefined()
  })

  it('carries neither title nor note — a re-place moves the task, it does not rewrite it', () => {
    const updates = planItemToUpdateArgs(
      { title: 'Rewritten wording', placement: { kind: 'week' }, assigneeId: 'm-iris', note: 'new note', existing: matched },
      ctx,
    )
    expect('title' in updates).toBe(false)
    expect('notes' in updates).toBe(false)
    expect('assignedTo' in updates).toBe(false)
  })
})
