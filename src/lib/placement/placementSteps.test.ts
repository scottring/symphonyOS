import { describe, it, expect, vi, afterEach } from 'vitest'
import { placementRpcEnabled, isPlacementOnlyRow, commitmentSteps, focusStep, PLACEMENT_ROW_COLUMNS } from './placementSteps'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('placementSteps', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('the switch is off unless exactly "true"', () => {
    vi.stubEnv('VITE_PLACEMENT_RPC', '')
    expect(placementRpcEnabled()).toBe(false)
    vi.stubEnv('VITE_PLACEMENT_RPC', '1')
    expect(placementRpcEnabled()).toBe(false)
    vi.stubEnv('VITE_PLACEMENT_RPC', 'true')
    expect(placementRpcEnabled()).toBe(true)
  })

  it('only placement columns ride the function', () => {
    expect(isPlacementOnlyRow({ bucket: 'week', week_start: '2026-09-20' })).toBe(true)
    expect(isPlacementOnlyRow({ bucket: 'week', title: 'x' })).toBe(false)
    expect(isPlacementOnlyRow({})).toBe(false)
  })

  it('maps ops to steps as local dates, and drops done/reopen', () => {
    const d = new Date(2026, 8, 20), to = new Date(2026, 8, 27)
    expect(commitmentSteps([
      { op: 'ensure', level: 'week', periodStart: to },
      { op: 'carry', level: 'week', periodStart: d, to },
      { op: 'done', level: 'week', periodStart: d },
    ])).toEqual([
      { t: 'ensure', level: 'week', period_start: '2026-09-27' },
      { t: 'carry', level: 'week', period_start: '2026-09-20', to: '2026-09-27' },
    ])
    expect(focusStep({ op: 'clear', userId: 'u' })).toEqual({ t: 'focus_clear', user_id: 'u', date: null })
  })

  // The client list and the migration's `allowed` must not drift.
  it('the column list matches the migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/2026-09-25_apply_task_placement.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('allowed constant text[] := array['), sql.indexOf('];', sql.indexOf('allowed constant')))
    const cols = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...cols].sort()).toEqual([...PLACEMENT_ROW_COLUMNS].sort())
  })
})
