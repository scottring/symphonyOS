import { describe, it, expect, beforeEach } from 'vitest'
import { periodBounds, isCurrentPeriod, selectPeriodTasks, intoMonthChoices, selectDatedInPeriod, actionsFor, railLevel, planningPeriod, offerableFromAbove } from './periodPage'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import type { Task } from '@/types/task'

const d = (y: number, m: number, day: number) => new Date(y, m, day)
const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`
let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

describe('periodBounds', () => {
  beforeEach(() => localStorage.clear())
  it('month: first to first, labelled, with neighbours', () => {
    const b = periodBounds('month', d(2026, 8, 17), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-9-1', '2026-10-1', 'September 2026'])
    expect(ymd(b.prev)).toBe('2026-8-1')
    expect(ymd(b.next)).toBe('2026-10-1')
  })
  it('season: follows the configured boundaries and wraps the year', () => {
    const b = periodBounds('season', d(2026, 10, 20), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-9-1', '2026-12-1', 'Fall 2026'])
    expect(ymd(b.prev)).toBe('2026-6-1')
    expect(ymd(b.next)).toBe('2026-12-1')
  })
  it('year: calendar year', () => {
    const b = periodBounds('year', d(2026, 8, 17), DEFAULT_SEASONS)
    expect([ymd(b.start), ymd(b.end), b.label]).toEqual(['2026-1-1', '2027-1-1', '2026'])
  })
})

describe('isCurrentPeriod', () => {
  it('is true only for the period containing today', () => {
    const today = d(2026, 8, 17)
    expect(isCurrentPeriod(periodBounds('month', today, DEFAULT_SEASONS), today)).toBe(true)
    expect(isCurrentPeriod(periodBounds('month', d(2026, 7, 3), DEFAULT_SEASONS), today)).toBe(false)
  })
})

describe('selectPeriodTasks', () => {
  const sep = d(2026, 8, 1); const aug = d(2026, 7, 1)
  const mine = task({ bucket: 'month', monthStart: sep, assignedTo: 'me' })
  const unassigned = task({ bucket: 'month', monthStart: sep })
  const legacy = task({ bucket: 'month' }) // NULL month_start → the current month
  const iris = task({ bucket: 'month', monthStart: sep, assignedTo: 'iris' })
  const august = task({ bucket: 'month', monthStart: aug })
  const weekRow = task({ bucket: 'week' })
  const all = [mine, unassigned, legacy, iris, august, weekRow]

  // The CURRENT period is a pool question: legacy NULL rows belong here.
  it('current month: stamped + legacy rows, scoped to me; other months and buckets stay out', () => {
    const ids = selectPeriodTasks(all, 'month', sep, true, 'me').map((t) => t.id)
    expect(ids).toEqual([mine.id, unassigned.id, legacy.id])
  })
  // A PAST period is a membership question: only rows explicitly placed on it.
  // A legacy row must not repeat in every month you page back to.
  it('a past month: only explicitly placed rows', () => {
    const ids = selectPeriodTasks(all, 'month', aug, false, 'me').map((t) => t.id)
    expect(ids).toEqual([august.id])
  })
  it('season uses the quarter bucket and season_start', () => {
    const fall = d(2026, 9, 1)
    const s = task({ bucket: 'quarter', seasonStart: fall })
    expect(selectPeriodTasks([s, mine], 'season', fall, true, 'me')).toEqual([s])
  })
  it('without a member id nothing is scoped away', () => {
    expect(selectPeriodTasks(all, 'month', sep, true, null)).toHaveLength(4)
  })
  it('sorts rows by created_at ascending, regardless of input order', () => {
    const third = task({ bucket: 'month', monthStart: sep, createdAt: d(2026, 8, 3) })
    const first = task({ bucket: 'month', monthStart: sep, createdAt: d(2026, 8, 1) })
    const second = task({ bucket: 'month', monthStart: sep, createdAt: d(2026, 8, 2) })
    const ids = selectPeriodTasks([third, first, second], 'month', sep, true, null).map((t) => t.id)
    expect(ids).toEqual([first.id, second.id, third.id])
  })
})

describe('selectDatedInPeriod', () => {
  const bounds = periodBounds('month', d(2026, 8, 17), DEFAULT_SEASONS) // September 2026

  it('returns timed, non-completed rows inside the period, sorted by date (all-day first on a tied day)', () => {
    const later = task({ scheduledFor: d(2026, 8, 20), title: 'Later this month' })
    const timed = task({ scheduledFor: new Date(2026, 8, 15, 18, 30), title: 'Back to school night' })
    const allDaySameDate = task({ scheduledFor: d(2026, 8, 15), isAllDay: true, title: 'Picture day' })
    const outOfRange = task({ scheduledFor: d(2026, 7, 30), title: 'August' })
    const doneOne = task({ scheduledFor: d(2026, 8, 10), completed: true, title: 'Done already' })
    const noDate = task({ title: 'No date' })
    const ids = selectDatedInPeriod([later, timed, allDaySameDate, outOfRange, doneOne, noDate], bounds).map((t) => t.id)
    expect(ids).toEqual([allDaySameDate.id, timed.id, later.id])
  })
})

describe('actionsFor', () => {
  // The verbs a row offers, by fate × kind × whether the period is over.
  it('an open task in the current period can be TRIAGED, not just ticked', () => {
    // Referencing this list to choose the week's work is the motion the whole
    // cadence rests on, and the page had no way to do it (Scott, 2026-09-13).
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, level: 'month' }))
      .toEqual(['complete', 'to-lower', 'today', 'drop'])
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, level: 'season' }))
      .toEqual(['complete', 'to-lower', 'today', 'drop'])
    // A year row has no rung below it on this page.
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, level: 'year' }))
      .toEqual(['complete', 'drop'])
  })
  it('a GOAL is never offered a rung — every placement writer refuses it', () => {
    expect(actionsFor({ fate: 'open', isGoal: true, isPast: false, level: 'month' }))
      .toEqual(['complete', 'drop'])
  })
  it('an open task in a PAST period: the look-back verbs', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: true })).toEqual(['complete', 'keep', 'someday', 'drop'])
  })
  // A goal is an outcome, not a thing you postpone: no Someday.
  it('an open goal in a PAST period: keep, make it a task, drop — never someday', () => {
    expect(actionsFor({ fate: 'open', isGoal: true, isPast: true })).toEqual(['complete', 'keep', 'drop'])
  })
  // You write "call the roofer" and only then realise it is porch work.
  it('offers "under a goal" to a loose task only when the period has goals', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, level: 'month', hasGoals: true }))
      .toEqual(['complete', 'to-lower', 'today', 'under-goal', 'drop'])
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: false, level: 'month', hasGoals: false }))
      .not.toContain('under-goal')
  })
  it('never offers "under a goal" to a goal — one level only', () => {
    expect(actionsFor({ fate: 'open', isGoal: true, isPast: false, level: 'month', hasGoals: true }))
      .not.toContain('under-goal')
  })
  // A look-back is read, not re-filed.
  it('never offers "under a goal" in a past period', () => {
    expect(actionsFor({ fate: 'open', isGoal: false, isPast: true, hasGoals: true }))
      .not.toContain('under-goal')
  })
  it('done and placed-done rows are the win column: nothing to do', () => {
    expect(actionsFor({ fate: 'done', isGoal: false, isPast: true })).toEqual([])
    expect(actionsFor({ fate: 'placed-done', isGoal: false, isPast: true })).toEqual([])
  })
  it('a placed-open row can still be kept or dropped in a look-back, not re-placed', () => {
    expect(actionsFor({ fate: 'placed-open', isGoal: false, isPast: true })).toEqual(['keep', 'drop'])
    expect(actionsFor({ fate: 'placed-open', isGoal: false, isPast: false })).toEqual(['complete'])
  })
})

describe('planningPeriod', () => {
  const seasons = DEFAULT_SEASONS
  it('an explicit start wins', () => {
    expect(planningPeriod({ level: 'season', today: new Date(2026, 8, 6), seasons, explicitStart: new Date(2026, 11, 1) }).start).toEqual(new Date(2026, 11, 1))
  })
  it('looks ahead when the current season has ≤14 days left', () => {
    const r = planningPeriod({ level: 'season', today: new Date(2026, 10, 20), seasons })
    expect(r).toEqual({ start: new Date(2026, 11, 1), lookingAhead: true })
  })
  it('stays put when this period is empty and the next has a list (S2-09)', () => {
    // This used to jump silently to the next period. Removed 2026-09-23: it
    // made the page you arrive at depend on data, and it did not fire when it
    // was needed. PeriodPlanPage now NAMES the neighbour that holds the plan
    // and leaves the move to the reader.
    expect(planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons }))
      .toEqual({ start: new Date(2026, 8, 1), lookingAhead: false })
  })
  it('otherwise the current period', () => {
    expect(planningPeriod({ level: 'month', today: new Date(2026, 8, 6), seasons })).toEqual({ start: new Date(2026, 8, 1), lookingAhead: false })
  })
  it('the year level never looks ahead', () => {
    expect(planningPeriod({ level: 'year', today: new Date(2026, 11, 28), seasons })).toEqual({ start: new Date(2026, 0, 1), lookingAhead: false })
  })
})

describe('railLevel', () => {
  it('each page looks at the level above; the year looks at nothing', () => {
    expect(railLevel('month')).toBe('season')
    expect(railLevel('season')).toBe('year')
    expect(railLevel('year')).toBeNull()
  })
})

describe('offerableFromAbove', () => {
  beforeEach(() => localStorage.clear())
  const OCT = d(2026, 9, 1), NOV = d(2026, 10, 1)
  it('offers open and legacy rows, never one already carried on, dropped or a goal', () => {
    const open = task({ id: 'open', bucket: 'month', monthStart: OCT, commitments: [{ level: 'month', periodStart: OCT, status: 'open' }] } as Partial<Task>)
    const carried = task({ id: 'carried', bucket: 'month', monthStart: NOV,
      commitments: [{ level: 'month', periodStart: OCT, status: 'carried', carriedTo: NOV }, { level: 'month', periodStart: NOV, status: 'open' }] } as Partial<Task>)
    const dropped = task({ id: 'dropped', bucket: 'month', monthStart: OCT, commitments: [{ level: 'month', periodStart: OCT, status: 'removed' }] } as Partial<Task>)
    const legacy = task({ id: 'legacy', bucket: 'month', monthStart: OCT } as Partial<Task>)
    const goal = task({ id: 'goal', isGoal: true, bucket: 'month', monthStart: OCT, commitments: [{ level: 'month', periodStart: OCT, status: 'open' }] } as Partial<Task>)
    const out = offerableFromAbove([open, carried, dropped, legacy, goal], 'month', OCT, false, DEFAULT_SEASONS)
    expect(out.map((t) => t.id)).toEqual(['open', 'legacy'])
  })
})

// Scott, 2026-09-25: a household goal assigned to someone else stays on the
// plan — unless it is private. Personal and Work are private; Family (and a
// row with no area) is the household's.
describe('selectPeriodTasks: goals and steps assigned only to others', () => {
  const sep = d(2026, 8, 1)
  const onSep = { bucket: 'month' as const, monthStart: sep }
  const toIris = { assignedTo: 'iris', assignedToAll: ['iris'] }
  const pick = (all: Task[]) => selectPeriodTasks(all, 'month', sep, true, 'me').map((t) => t.title)

  it('a Family goal stays; a Personal or Work goal leaves', () => {
    expect(pick([
      task({ title: 'family goal', isGoal: true, context: 'family', ...onSep, ...toIris }),
      task({ title: 'personal goal', isGoal: true, context: 'personal', ...onSep, ...toIris }),
      task({ title: 'work goal', isGoal: true, context: 'work', ...onSep, ...toIris }),
      task({ title: 'untagged goal', isGoal: true, context: null, ...onSep, ...toIris }),
    ])).toEqual(['family goal', 'untagged goal'])
  })

  it('a step with no area of its own follows its goal', () => {
    const fam = task({ id: 'gf', title: 'family goal', isGoal: true, context: 'family', ...onSep })
    const priv = task({ id: 'gp', title: 'personal goal', isGoal: true, context: 'personal', ...onSep })
    expect(pick([
      fam, priv,
      task({ title: 'family step', goalTaskId: 'gf', context: null, ...onSep, ...toIris }),
      task({ title: 'personal step', goalTaskId: 'gp', context: null, ...onSep, ...toIris }),
    ])).toEqual(['family goal', 'personal goal', 'family step'])
  })

  it('a step\'s own Personal area wins over a Family goal', () => {
    const fam = task({ id: 'gf2', title: 'family goal', isGoal: true, context: 'family', ...onSep })
    expect(pick([fam, task({ title: 'private step', goalTaskId: 'gf2', context: 'personal', ...onSep, ...toIris })]))
      .toEqual(['family goal'])
  })

  it('a plain task assigned to someone else still leaves (the 2026-09-05 rule)', () => {
    expect(pick([task({ title: 'family task', context: 'family', ...onSep, ...toIris })])).toEqual([])
  })
})

describe('intoMonthChoices — a season row\'s "Into a month…"', () => {
  const labels = (b: { start: Date; end: Date; label: string }) => intoMonthChoices(b).map((c) => c.label)
  it('offers the month before the season first, then the season\'s months', () => {
    // A household Fall that starts in October (Scott's).
    expect(labels({ start: new Date(2026, 9, 1), end: new Date(2027, 0, 1), label: 'Fall 2026' }))
      .toEqual(['September (before Fall)', 'October', 'November', 'December'])
  })
  it('names the year across a year boundary', () => {
    const c = intoMonthChoices({ start: new Date(2027, 0, 1), end: new Date(2027, 3, 1), label: 'Winter 2027' })
    expect(c[0]).toMatchObject({ label: 'December 2026 (before Winter)', beforeSeason: true })
    expect(c[0].date).toEqual(new Date(2026, 11, 1))
  })
})
