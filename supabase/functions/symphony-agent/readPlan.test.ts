import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEASONS, isPeriodStart, loadPlanRefs, nextPeriodStart, normalizeSeasons, periodLabel, periodStartFor,
  readPlan, seasonYears, shapePlan, startsNear, type CommitmentRow, type GoalRow, type PlanTaskRow,
} from './readPlan'

const S = DEFAULT_SEASONS
const TODAY = '2026-10-14'

describe('periods', () => {
  it('finds the start of a month, a year and a season', () => {
    expect(periodStartFor('month', '2026-10-14', S)).toBe('2026-10-01')
    expect(periodStartFor('year', '2026-10-14', S)).toBe('2026-01-01')
    expect(periodStartFor('season', '2026-10-14', S)).toBe('2026-09-01')
    // Before the year's first boundary: last year's last season.
    expect(periodStartFor('season', '2027-01-15', S)).toBe('2026-12-01')
  })
  it('finds the next one, across the year end', () => {
    expect(nextPeriodStart('month', '2026-12-01', S)).toBe('2027-01-01')
    expect(nextPeriodStart('season', '2026-12-01', S)).toBe('2027-03-01')
    expect(nextPeriodStart('season', '2026-10-14', S)).toBe('2026-12-01')
    expect(nextPeriodStart('year', '2026-06-01', S)).toBe('2027-01-01')
  })
  it('knows a real start from any other day', () => {
    expect(isPeriodStart('month', '2026-11-01', S)).toBe(true)
    expect(isPeriodStart('month', '2026-11-02', S)).toBe(false)
    expect(isPeriodStart('season', '2026-12-01', S)).toBe(true)
    expect(isPeriodStart('season', '2026-11-01', S)).toBe(false)
    expect(isPeriodStart('year', '2027-01-01', S)).toBe(true)
  })
  it('names periods as the card says them, with the year only when it is not this one', () => {
    expect(periodLabel('month', '2026-11-01', S, TODAY)).toBe('November')
    expect(periodLabel('month', '2027-01-01', S, TODAY)).toBe('January 2027')
    expect(periodLabel('season', '2026-09-01', S, TODAY)).toBe('Fall')
    expect(periodLabel('season', '2027-03-01', S, TODAY)).toBe('Spring 2027')
    expect(periodLabel('year', '2027-01-01', S, TODAY)).toBe('2027')
    expect(startsNear('season', '2026-11-01', S, TODAY, 2)).toBe('2026-09-01 (Fall), 2026-12-01 (Winter)')
  })
  it("reads the household's own seasons, and falls back to the default four on junk", () => {
    const own = normalizeSeasons([{ name: 'Winter', month: 1, day: 6 }, { name: ' Holidays ', month: 11, day: 20 }, { name: 'Fall', month: 9, day: 1 }, { name: 'Spring', month: 2, day: 31 }])
    expect(own.map((b) => `${b.name} ${b.month}/${b.day}`)).toEqual(['Winter 1/6', 'Spring 2/28', 'Fall 9/1', 'Holidays 11/20'])
    expect(periodStartFor('season', '2026-01-03', own)).toBe('2025-11-20')
    expect(nextPeriodStart('season', '2026-11-20', own)).toBe('2027-01-06')
    expect(normalizeSeasons(null)).toBe(DEFAULT_SEASONS)
    expect(normalizeSeasons([{ name: 'x', month: 13, day: 1 }, 1, 2, 3])).toBe(DEFAULT_SEASONS)
  })
  it('says which years a season touches', () => {
    expect(seasonYears('2026-12-01', S)).toEqual([2026, 2027])
    expect(seasonYears('2026-09-01', S)).toEqual([2026])
  })
})

const c = (task_id: string, level: string, period_start: string, status = 'open'): CommitmentRow => ({ task_id, level, period_start, status })
const t = (id: string, title: string, x: Partial<PlanTaskRow> = {}): PlanTaskRow => ({ id, title, completed: false, source_id: null, goal_id: null, ...x })
const g = (id: string, name: string, year: number, status = 'active'): GoalRow => ({ id, name, year, status })

describe('shapePlan: a month', () => {
  const read = shapePlan({
    level: 'month', start: '2026-10-01', today: TODAY, seasons: S,
    commitments: [
      c('done', 'month', '2026-10-01'), c('open', 'month', '2026-10-01'), c('ticked', 'month', '2026-10-01', 'done'),
      c('carried', 'month', '2026-10-01', 'carried'), c('carried', 'month', '2026-11-01'),
      c('gone', 'month', '2026-10-01', 'removed'), c('nov', 'month', '2026-11-01'),
      c('fall', 'season', '2026-09-01'), c('old', 'month', '2026-09-01'),
    ],
    tasks: [
      t('open', 'Plan sabbatical', { source_id: 'fall' }), t('done', 'Toss umbrella', { completed: true }), t('ticked', 'Fix the gate'),
      t('carried', 'Call the vet', { source_id: 'hidden' }), t('gone', 'Repaint'), t('nov', 'Book the cabin'), t('fall', 'Fall trip', { goal_id: 'g' }), t('old', 'September thing'),
    ],
    goals: [],
    titles: [{ id: 'g', title: 'Take a sabbatical' }],
    doneChildren: [{ source_id: 'open' }, { source_id: 'open' }, { source_id: 'nov' }, { source_id: null }],
  })
  it('says the period, open first, then carried, then done; removed and other months left out', () => {
    expect(read.level).toBe('month')
    expect(read.period).toEqual({ start: '2026-10-01', label: 'October' })
    expect(read.items.map((i) => [i.id, i.done, i.carried ?? false])).toEqual([
      ['open', false, false], ['carried', false, true], ['done', true, false], ['ticked', true, false],
    ])
  })
  it('names the goal each serves, when the person can see it, and how many done tasks moved it', () => {
    const open = read.items.find((i) => i.id === 'open')!
    expect(open).toMatchObject({ kind: 'task', title: 'Plan sabbatical', parent: { id: 'fall', title: 'Fall trip' }, weekProgress: 2 })
    expect(read.items.find((i) => i.id === 'carried')!.parent).toBeUndefined()
    expect(read.items.find((i) => i.id === 'ticked')!.weekProgress).toBe(0)
  })
  it("lists next month, and the season next month's goals serve", () => {
    expect(read.next).toMatchObject({ start: '2026-11-01', label: 'November' })
    expect(read.next.items.map((i) => i.id)).toEqual(['carried', 'nov'])
    expect(read.parents).toMatchObject({ level: 'season', start: '2026-09-01', label: 'Fall' })
    expect(read.parents!.items).toEqual([{ id: 'fall', kind: 'task', title: 'Fall trip', done: false, parent: { id: 'g', title: 'Take a sabbatical' }, weekProgress: 0 }])
  })
})

describe('shapePlan: a season and a year', () => {
  it('a season reads its range (a legacy mid-season start counts), and the year goals next season serves', () => {
    const read = shapePlan({
      level: 'season', start: '2026-09-01', today: TODAY, seasons: S,
      commitments: [c('a', 'season', '2026-09-01'), c('b', 'season', '2026-10-15'), c('w', 'season', '2026-12-01')],
      tasks: [t('a', 'Fall trip', { goal_id: 'g26' }), t('b', 'Legacy'), t('w', 'Ski weekend')],
      goals: [g('g26', 'Take a sabbatical', 2026), g('arch', 'Write a novel', 2026, 'archived'), g('met', 'Learn to sail', 2026, 'completed')],
    })
    expect(read.period.label).toBe('Fall')
    expect(read.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(read.items[0].parent).toEqual({ id: 'g26', title: 'Take a sabbatical' })
    expect(read.next).toMatchObject({ start: '2026-12-01', label: 'Winter' })
    expect(read.next.items.map((i) => i.id)).toEqual(['w'])
    expect(read.parents).toMatchObject({ level: 'year', start: '2026-01-01', label: '2026' })
    expect(read.parents!.items.map((i) => [i.id, i.kind, i.done])).toEqual([['g26', 'goal', false], ['met', 'goal', true]])
  })
  it('a year reads this year and next; met goals are done; let go ones are gone; no parent list', () => {
    const read = shapePlan({
      level: 'year', start: '2026-01-01', today: TODAY, seasons: S, commitments: [], tasks: [],
      goals: [g('met', 'Learn to sail', 2026, 'completed'), g('a', 'Take a sabbatical', 2026), g('arch', 'Write a novel', 2026, 'archived'), g('n', 'Run a half marathon', 2027)],
    })
    expect(read.period).toEqual({ start: '2026-01-01', label: '2026' })
    expect(read.items).toEqual([{ id: 'a', kind: 'goal', title: 'Take a sabbatical', done: false }, { id: 'met', kind: 'goal', title: 'Learn to sail', done: true }])
    expect(read.next).toEqual({ start: '2027-01-01', label: '2027', items: [{ id: 'n', kind: 'goal', title: 'Run a half marathon', done: false }] })
    expect(read.parents).toBeNull()
  })
})

// A small in-memory stand-in for the RLS client: filters rows the way
// PostgREST would for the calls readPlan makes.
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const calls: string[] = []
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q = {
        select: (cols: string) => { calls.push(`${table}:${cols}`); return q },
        eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q },
        neq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] !== v); return q },
        in: (k: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[k])); return q },
        gte: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) >= v); return q },
        lt: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) < v); return q },
        order: () => q,
        limit: () => q,
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      }
      return q
    },
  }
  return { db, calls }
}

describe('readPlan and loadPlanRefs against the database', () => {
  const tables = {
    households: [{ seasons: null, created_at: '2026-01-01' }],
    goals: [
      { id: 'g', name: 'Take a sabbatical', status: 'active', year: 2026, updated_at: 'u-g', context: 'personal' },
      { id: 'n', name: 'Run a half marathon', status: 'active', year: 2027, updated_at: 'u-n', context: 'personal' },
    ],
    task_commitments: [
      { task_id: 'm', level: 'month', period_start: '2026-10-01', status: 'open' },
      { task_id: 's', level: 'season', period_start: '2026-09-01', status: 'open' },
      { task_id: 'x', level: 'month', period_start: '2026-10-01', status: 'removed' },
    ],
    tasks: [
      { id: 'm', title: 'Plan sabbatical', completed: false, source_id: 's', goal_id: null, updated_at: 'u-m', context: 'personal' },
      { id: 's', title: 'Fall trip', completed: false, source_id: null, goal_id: 'g', updated_at: 'u-s', context: 'personal' },
      { id: 'x', title: 'Repaint', completed: false, source_id: null, goal_id: null, updated_at: 'u-x', context: 'personal' },
      { id: 'w', title: 'Email HR', completed: true, source_id: 'm', goal_id: null, updated_at: 'u-w', context: 'work' },
    ],
  }
  it('reads this month (any day in it), next month and the season, with progress', async () => {
    const { db } = fakeDb(tables)
    const read = await readPlan(db, { level: 'month', period_start: '2026-10-20' }, TODAY)
    expect(read.period).toEqual({ start: '2026-10-01', label: 'October' })
    expect(read.items).toEqual([{ id: 'm', kind: 'task', title: 'Plan sabbatical', done: false, parent: { id: 's', title: 'Fall trip' }, weekProgress: 1 }])
    expect(read.parents!.items.map((i) => [i.id, i.parent?.title])).toEqual([['s', 'Take a sabbatical']])
  })
  it('defaults to the current period and refuses a bad level or date', async () => {
    const { db } = fakeDb(tables)
    expect((await readPlan(db, { level: 'year' }, TODAY)).next.items.map((i) => i.id)).toEqual(['n'])
    await expect(readPlan(db, { level: 'week' }, TODAY)).rejects.toThrow("level must be 'month', 'season' or 'year'")
    await expect(readPlan(db, { level: 'month', period_start: '2026-02-30' }, TODAY)).rejects.toThrow('real YYYY-MM-DD')
  })
  it('loads the items and parents plan ops name, each task with its commitments, and the parents of items', async () => {
    const { db } = fakeDb(tables)
    const refs = await loadPlanRefs(db, ['m', 'nope'], TODAY)
    expect(refs.today).toBe(TODAY)
    expect(refs.seasons).toBe(DEFAULT_SEASONS)
    expect(refs.tasks.map((x) => [x.id, x.commitments.map((k) => k.level)])).toEqual([['m', ['month']], ['s', ['season']]])
    expect(refs.goals).toEqual([])
    const both = await loadPlanRefs(db, ['s'], TODAY)
    expect(both.goals.map((x) => x.id)).toEqual(['g'])
  })
})
