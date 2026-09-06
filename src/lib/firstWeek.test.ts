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

import {
  firstWeekSteps,
  shouldShowFirstWeek,
  readSampleIds,
  writeSampleIds,
  clearSampleIdsRecord,
  hasSampleIds,
  deleteSampleRows,
  type FirstWeekSignals,
} from './firstWeek'

const none: FirstWeekSignals = { memberCount: 1, pageCommitted: false, partnerInvited: false, routineCount: 0 }

describe('firstWeekSteps', () => {
  it('four steps, all undone for a fresh account', () => {
    const s = firstWeekSteps(none)
    expect(s.map((x) => x.id)).toEqual(['people', 'page', 'partner', 'routine'])
    expect(s.every((x) => !x.done)).toBe(true)
    expect(s[1].to).toBe('/today?plan=paper')
  })

  it('done lines point at where the result lives', () => {
    const s = firstWeekSteps({ memberCount: 4, pageCommitted: true, partnerInvited: true, routineCount: 2 })
    expect(s[0]).toMatchObject({ done: true, doneLine: '4 people' })
    expect(s[1]).toMatchObject({ done: true, doneLine: 'see This Week' })
    expect(s[3]).toMatchObject({ done: true, doneLine: 'see Routines' })
  })
})

describe('shouldShowFirstWeek', () => {
  it('shows only while ≥2 steps remain, and hides for 7 days after Hide for now', () => {
    const two = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true })
    expect(shouldShowFirstWeek(two, null, new Date())).toBe(true)

    const one = firstWeekSteps({ ...none, memberCount: 4, pageCommitted: true, partnerInvited: true })
    expect(shouldShowFirstWeek(one, null, new Date())).toBe(false)

    expect(shouldShowFirstWeek(two, new Date(Date.now() - 2 * 86_400_000).toISOString(), new Date())).toBe(false)
    expect(shouldShowFirstWeek(two, new Date(Date.now() - 8 * 86_400_000).toISOString(), new Date())).toBe(true)
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
