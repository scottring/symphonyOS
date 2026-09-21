import { describe, it, expect } from 'vitest'
import {
  deriveCache, committedTo, onPeriod, toSchedule, lowerPlacement, placementFateOf,
  isFocused, focusedBy, openCommitment, periodStartFor,
} from './model'
import type { Task, TaskCommitment } from '@/types/task'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)
const c = (level: TaskCommitment['level'], periodStart: Date, status: TaskCommitment['status'] = 'open', carriedTo?: Date): TaskCommitment =>
  ({ level, periodStart, status, carriedTo })

const SEP = new Date(2026, 8, 1)
const OCT = new Date(2026, 9, 1)
const FALL = new Date(2026, 8, 1)
const WK20 = new Date(2026, 8, 20) // a Sunday
const WK27 = new Date(2026, 8, 27)

describe('deriveCache — the mirror of tasks_sync_from_commitments()', () => {
  it('a dated task is timed and carries the week of its day, keeping month/season', () => {
    const t = task({ scheduledFor: new Date(2026, 8, 23, 9), commitments: [c('season', FALL), c('month', SEP)] })
    const cache = deriveCache(t)
    expect(cache.bucket).toBe('timed')
    expect(cache.weekStart?.getDate()).toBe(20)
    expect(cache.monthStart).toEqual(SEP)
    expect(cache.seasonStart).toEqual(FALL)
  })
  it('names the LOWEST open commitment', () => {
    expect(deriveCache(task({ commitments: [c('season', FALL), c('month', SEP)] })).bucket).toBe('month')
    expect(deriveCache(task({ commitments: [c('season', FALL), c('month', SEP), c('week', WK20)] })).bucket).toBe('week')
    expect(deriveCache(task({ commitments: [c('season', FALL)] })).bucket).toBe('quarter')
  })
  it('ignores done, carried and removed commitments', () => {
    const t = task({ commitments: [c('season', FALL), c('month', SEP, 'carried', OCT), c('week', WK20, 'removed')] })
    expect(deriveCache(t)).toMatchObject({ bucket: 'quarter', weekStart: undefined, monthStart: undefined })
  })
  it('a period row with no open commitment falls back to inbox; states stay states', () => {
    expect(deriveCache(task({ bucket: 'month', commitments: [c('month', SEP, 'removed')] })).bucket).toBe('inbox')
    expect(deriveCache(task({ bucket: 'someday', commitments: [] })).bucket).toBe('someday')
    expect(deriveCache(task({ bucket: 'inbox' })).bucket).toBe('inbox')
  })
})

describe('committedTo / onPeriod — one row on MORE than one list', () => {
  it('a season item taken into September is on the season list AND the month list', () => {
    const t = task({ bucket: 'month', commitments: [c('season', FALL), c('month', SEP)] })
    expect(committedTo(t, 'season', FALL, { seasons: DEFAULT_SEASONS })).toBeTruthy()
    expect(committedTo(t, 'month', SEP)).toBeTruthy()
    expect(committedTo(t, 'month', OCT)).toBeUndefined()
  })
  it('a season commitment is a RANGE match (a moved boundary must not strand it)', () => {
    const t = task({ commitments: [c('season', new Date(2026, 9, 1))] }) // stamped Oct 1
    expect(committedTo(t, 'season', FALL, { seasons: DEFAULT_SEASONS })).toBeTruthy() // Fall runs Sep 1 – Dec 1
  })
  it('a removed commitment is off the list; a done or carried one is still the record', () => {
    expect(committedTo(task({ commitments: [c('month', SEP, 'removed')] }), 'month', SEP)).toBeUndefined()
    expect(committedTo(task({ commitments: [c('month', SEP, 'done')] }), 'month', SEP)).toBeTruthy()
    expect(committedTo(task({ commitments: [c('month', SEP, 'carried', OCT)] }), 'month', SEP)).toBeTruthy()
  })
  it('a legacy row (no records) answers from its cache, with the NULL rule', () => {
    const current = task({ bucket: 'month' })
    expect(committedTo(current, 'month', SEP, { isCurrent: true })).toBe('legacy')
    expect(committedTo(current, 'month', SEP, { isCurrent: false })).toBeUndefined()
    const stamped = task({ bucket: 'month', monthStart: SEP })
    expect(committedTo(stamped, 'month', SEP, { isCurrent: false })).toBe('legacy')
    expect(committedTo(stamped, 'month', OCT, { isCurrent: true })).toBeUndefined()
    // A legacy WEEK row is not on the month list.
    expect(committedTo(task({ bucket: 'week' }), 'month', SEP)).toBeUndefined()
  })
  it('onPeriod keeps done and placed rows — the list is the record', () => {
    const done = task({ completed: true, commitments: [c('month', SEP, 'done')] })
    const placed = task({ scheduledFor: new Date(2026, 8, 23), commitments: [c('month', SEP)] })
    const other = task({ commitments: [c('month', OCT)] })
    expect(onPeriod([done, placed, other], 'month', SEP).map((t) => t.id)).toEqual([done.id, placed.id])
  })
})

describe('toSchedule — planned for the week, no day yet', () => {
  it('includes the week commitment without a day, excludes dated and done', () => {
    const undated = task({ commitments: [c('week', WK20)] })
    const dated = task({ scheduledFor: new Date(2026, 8, 23), commitments: [c('week', WK20)] })
    const done = task({ completed: true, commitments: [c('week', WK20, 'done')] })
    const nextWeek = task({ commitments: [c('week', WK27)] })
    expect(toSchedule([undated, dated, done, nextWeek], WK20).map((t) => t.id)).toEqual([undated.id])
  })
})

describe('lowerPlacement / placementFateOf — the chip reads off the ROW', () => {
  it('a month row scheduled on a day says the day', () => {
    const t = task({ scheduledFor: new Date(2026, 8, 23), commitments: [c('month', SEP)] })
    expect(lowerPlacement(t, 'month')).toMatchObject({ kind: 'date' })
    expect(lowerPlacement(t, 'month')?.label).toBe('Wednesday, September 23')
    expect(placementFateOf(t, 'month')).toBe('placed-open')
  })
  it('a month row planned for a week says the week; a season row says its month', () => {
    const t = task({ commitments: [c('season', FALL), c('month', SEP), c('week', WK20)] })
    expect(lowerPlacement(t, 'month')).toMatchObject({ kind: 'week', weekStart: WK20 })
    expect(lowerPlacement(t, 'season')).toMatchObject({ kind: 'week' }) // the lowest wins
    const monthOnly = task({ commitments: [c('season', FALL), c('month', SEP)] })
    expect(lowerPlacement(monthOnly, 'season')).toMatchObject({ kind: 'month', label: 'September' })
    expect(lowerPlacement(monthOnly, 'month')).toBeNull()
    expect(placementFateOf(monthOnly, 'month')).toBe('open')
  })
  it('a kept row says where it was carried, on the period it left', () => {
    const t = task({ commitments: [c('month', SEP, 'carried', OCT), c('month', OCT)] })
    expect(lowerPlacement(t, 'month', SEP)).toMatchObject({ kind: 'carried', to: OCT, label: 'carried to October' })
    expect(lowerPlacement(t, 'month', OCT)).toBeNull()
  })
  it('done is done, whatever else the row carries', () => {
    const t = task({ completed: true, scheduledFor: new Date(2026, 8, 23), commitments: [c('month', SEP, 'done')] })
    expect(placementFateOf(t, 'month')).toBe('done')
  })
  it('a legacy week row with no week of its own reads as this week', () => {
    expect(lowerPlacement(task({ bucket: 'week' }), 'month')).toMatchObject({ kind: 'week', label: 'This week' })
  })
})

describe('isFocused — personal, per person', () => {
  const sep23 = new Date(2026, 8, 23)
  it('one adult\'s choice is not the other\'s', () => {
    const t = task({ focus: [{ userId: 'scott', date: sep23 }] })
    expect(isFocused(t, 'scott', '2026-09-23')).toBe(true)
    expect(isFocused(t, 'iris', '2026-09-23')).toBe(false)
    expect(isFocused(t, 'scott', '2026-09-24')).toBe(false)
    expect(focusedBy(t, '2026-09-23')).toEqual(['scott'])
  })
  it('a row with no focus rows falls back to the legacy shared planned_on', () => {
    const t = task({ plannedOn: sep23 })
    expect(isFocused(t, 'scott', '2026-09-23')).toBe(true)
    expect(isFocused(t, null, '2026-09-23')).toBe(true)
  })
  it('once a row has focus rows, planned_on is ignored', () => {
    const t = task({ plannedOn: sep23, focus: [{ userId: 'iris', date: sep23 }] })
    expect(isFocused(t, 'scott', '2026-09-23')).toBe(false)
  })
})

describe('helpers', () => {
  it('openCommitment prefers the latest period', () => {
    const t = task({ commitments: [c('month', SEP), c('month', OCT)] })
    expect(openCommitment(t, 'month')?.periodStart).toEqual(OCT)
  })
  it('periodStartFor', () => {
    expect(periodStartFor('month', new Date(2026, 8, 23))).toEqual(SEP)
    expect(periodStartFor('season', new Date(2026, 8, 23), DEFAULT_SEASONS)).toEqual(FALL)
    expect(periodStartFor('week', new Date(2026, 8, 23)).getDay()).toBeLessThanOrEqual(1)
  })
})
