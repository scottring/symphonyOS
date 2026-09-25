import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const deletes: Array<{ table: string; ids: unknown }> = []
  const results: Record<string, { error: unknown }> = {}
  return {
    deletes,
    results,
    from: vi.fn((table: string) => ({
      delete: () => ({
        in: (_col: string, ids: unknown) => {
          deletes.push({ table, ids })
          return Promise.resolve(results[table] ?? { error: null })
        },
      }),
    })),
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))

import { firstWeekSteps, shouldShowFirstWeek, readSampleIds, writeSampleIds, clearSampleIdsRecord, hasSampleIds, deleteSampleRows, type FirstWeekSignals, shouldOpenFirstWeek } from './firstWeek'

const none: FirstWeekSignals = {
  yearPlanned: false,
  memberCount: 1,
  pageCommitted: false,
  partnerInvited: false,
  routineCount: 0,
}

describe('firstWeekSteps', () => {
  it('five steps, all undone for a fresh account, year first', () => {
    const s = firstWeekSteps(none)
    expect(s.map((x) => x.id)).toEqual(['plan-year', 'people', 'page', 'partner', 'routine'])
    expect(s.every((x) => !x.done)).toBe(true)
    expect(s[0].to).toBe('/year')
    expect(s[2].to).toBe('/today?plan=paper')
  })

  it('only the year step carries a hint', () => {
    const s = firstWeekSteps(none)
    expect(s[0].hint).toBe('One thing you want to be true by December.')
    expect(s.slice(1).every((x) => x.hint === undefined)).toBe(true)
  })

  it('done lines point at where the result lives', () => {
    const s = firstWeekSteps({
      yearPlanned: true,
      memberCount: 4,
      pageCommitted: true,
      partnerInvited: true,
      routineCount: 2,
    })
    expect(s[0]).toMatchObject({ id: 'plan-year', done: true })
    expect(s[1]).toMatchObject({ done: true, doneLine: '4 people' })
    expect(s[2]).toMatchObject({ done: true, doneLine: 'see This Week' })
    expect(s[4]).toMatchObject({ done: true, doneLine: 'see Routines' })
  })
})

describe('shouldShowFirstWeek', () => {
  it('shows only while ≥2 steps remain, and stays dismissed after choosing to explore independently', () => {
    const two = firstWeekSteps({ ...none, yearPlanned: true, memberCount: 4, pageCommitted: true })
    expect(shouldShowFirstWeek(two, null, new Date())).toBe(true)

    const one = firstWeekSteps({ ...none, yearPlanned: true, memberCount: 4, pageCommitted: true, partnerInvited: true })
    expect(shouldShowFirstWeek(one, null, new Date())).toBe(false)

    expect(shouldShowFirstWeek(two, new Date(Date.now() - 2 * 86_400_000).toISOString(), new Date())).toBe(false)
    expect(shouldShowFirstWeek(two, new Date(Date.now() - 8 * 86_400_000).toISOString(), new Date())).toBe(false)
  })
})

describe('sample id tracking', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips what was written, and reports nothing before a write', () => {
    expect(hasSampleIds('u1')).toBe(false)
    expect(readSampleIds('u1')).toEqual({ taskIds: [], noteIds: [] })

    writeSampleIds('u1', { taskIds: ['t1', 't2'], noteIds: ['n1'] })
    expect(hasSampleIds('u1')).toBe(true)
    expect(readSampleIds('u1')).toEqual({ taskIds: ['t1', 't2'], noteIds: ['n1'] })

    clearSampleIdsRecord('u1')
    expect(hasSampleIds('u1')).toBe(false)
  })

  it('keys are per-user', () => {
    writeSampleIds('u1', { taskIds: ['t1'], noteIds: [] })
    expect(hasSampleIds('u2')).toBe(false)
  })
})


// The sample page writes REAL rows into a real household, and the
// localStorage id record is the only handle on them.
describe('deleteSampleRows', () => {
  beforeEach(() => {
    h.deletes.length = 0
    h.from.mockClear()
    for (const k of Object.keys(h.results)) delete h.results[k]
  })

  it('deletes the sample tasks and notes by id and reports success', async () => {
    const ok = await deleteSampleRows({ taskIds: ['t1', 't2'], noteIds: ['n1'] })
    expect(ok).toBe(true)
    expect(h.deletes).toEqual([
      { table: 'tasks', ids: ['t1', 't2'] },
      { table: 'notes', ids: ['n1'] },
    ])
  })

  it('reports failure when either delete errors — the caller must KEEP the id record', async () => {
    // The old code cleared the record inside an unconditional .then(), so a
    // failed delete stranded the sample rows with nothing pointing at them.
    h.results.notes = { error: { message: 'permission denied' } }
    expect(await deleteSampleRows({ taskIds: ['t1'], noteIds: ['n1'] })).toBe(false)

    h.results.notes = { error: null }
    h.results.tasks = { error: { message: 'boom' } }
    expect(await deleteSampleRows({ taskIds: ['t1'], noteIds: ['n1'] })).toBe(false)
  })

  it('touches no table when there is nothing recorded', async () => {
    expect(await deleteSampleRows({ taskIds: [], noteIds: [] })).toBe(true)
    expect(h.from).not.toHaveBeenCalled()
  })
})

// Codex, 2026-09-24: "Remaining scope also includes independent Getting
// Started access." Independent means: reachable because somebody asked, not
// because the planner happens to be empty.
describe('shouldOpenFirstWeek', () => {
  const twoLeft = firstWeekSteps({
    yearPlanned: false, memberCount: 1, pageCommitted: false,
    partnerInvited: false, routineCount: 0,
  })
  const allDone = firstWeekSteps({
    yearPlanned: true, memberCount: 3, pageCommitted: true,
    partnerInvited: true, routineCount: 2,
  })
  const now = new Date(2026, 8, 24)

  it('opens when asked, however full the planner is', () => {
    expect(shouldOpenFirstWeek({ asked: true, taskCount: 500, steps: twoLeft, hiddenAt: null, now })).toBe(true)
  })

  it('opens when asked, even after it was dismissed', () => {
    expect(shouldOpenFirstWeek({ asked: true, taskCount: 0, steps: twoLeft, hiddenAt: '2026-09-01', now })).toBe(true)
  })

  it('opens when asked, even with every step already done', () => {
    expect(shouldOpenFirstWeek({ asked: true, taskCount: 12, steps: allDone, hiddenAt: '2026-09-01', now })).toBe(true)
  })

  // The unasked-for OFFER keeps all its conditions.
  it('offers itself only to an empty planner with work left and no dismissal', () => {
    expect(shouldOpenFirstWeek({ asked: false, taskCount: 0, steps: twoLeft, hiddenAt: null, now })).toBe(true)
    expect(shouldOpenFirstWeek({ asked: false, taskCount: 1, steps: twoLeft, hiddenAt: null, now })).toBe(false)
    expect(shouldOpenFirstWeek({ asked: false, taskCount: 0, steps: twoLeft, hiddenAt: '2026-09-01', now })).toBe(false)
    expect(shouldOpenFirstWeek({ asked: false, taskCount: 0, steps: allDone, hiddenAt: null, now })).toBe(false)
  })
})
