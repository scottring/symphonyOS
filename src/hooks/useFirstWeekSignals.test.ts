import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// A chainable builder: every filter method returns the builder, and the
// builder is thenable so `await supabase.from(table)...` resolves to
// whatever count/data is registered for that table.
const h = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const results: Record<string, { count?: number; data?: unknown; error?: unknown }> = {}
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    const ops = ['select', 'eq', 'ilike', 'gt', 'is', 'limit']
    for (const op of ops) {
      b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return b }
    }
    b.then = (resolve: (v: unknown) => void) =>
      resolve(results[table] ?? { data: null, error: null, count: 0 })
    return b
  }
  return {
    calls,
    results,
    from: vi.fn((table: string) => make(table)),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from },
  getAuthUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
}))

import { useFirstWeekSignals } from './useFirstWeekSignals'

beforeEach(() => {
  h.calls.length = 0
  h.from.mockClear()
  for (const k of Object.keys(h.results)) delete h.results[k]
})

describe('useFirstWeekSignals', () => {
  it('derives signals from the counts the account already has', async () => {
    h.results.family_members = { count: 4, data: null, error: null }
    h.results.attachments = { count: 1, data: null, error: null }
    h.results.household_members = { count: 2, data: null, error: null }
    h.results.household_invitations = { count: 0, data: null, error: null }
    h.results.routines = { count: 0, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())

    await waitFor(() => expect(result.current.signals).not.toBeNull())

    expect(result.current.signals).toEqual({
      memberCount: 4,
      pageCommitted: true,
      partnerInvited: true,
      routineCount: 0,
    })

    // The page signal reads attachments filtered to the page-capture path.
    const attachmentsCall = h.calls.find((c) => c.table === 'attachments' && c.op === 'ilike')
    expect(attachmentsCall?.args).toEqual(['storage_path', '%/page/%'])
  })

  it('an unexpired invitation counts as partner-invited even with only one household member', async () => {
    h.results.family_members = { count: 1, data: null, error: null }
    h.results.attachments = { count: 0, data: null, error: null }
    h.results.household_members = { count: 1, data: null, error: null }
    h.results.household_invitations = { count: 1, data: null, error: null }
    h.results.routines = { count: 0, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())

    await waitFor(() => expect(result.current.signals).not.toBeNull())
    expect(result.current.signals?.partnerInvited).toBe(true)

    const invitationsCall = h.calls.find((c) => c.table === 'household_invitations' && c.op === 'gt')
    expect(invitationsCall?.args[0]).toBe('expires_at')
  })

  it('re-fetches when the window regains focus', async () => {
    h.results.family_members = { count: 1, data: null, error: null }
    h.results.attachments = { count: 0, data: null, error: null }
    h.results.household_members = { count: 1, data: null, error: null }
    h.results.household_invitations = { count: 0, data: null, error: null }
    h.results.routines = { count: 0, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())
    await waitFor(() => expect(result.current.signals).not.toBeNull())

    const callsBefore = h.from.mock.calls.length
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(h.from.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
