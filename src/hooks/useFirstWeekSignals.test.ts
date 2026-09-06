import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// A chainable builder: every filter method returns the builder, and the
// builder is thenable so `await supabase.from(table)...` resolves to
// whatever count/data is registered for that table.
//
// `household_members` is queried TWICE per fetch — once for the caller's own
// row (`data.household_id`) and once for that household's member count
// (`count`) — so its registered result carries both fields.
const h = vi.hoisted(() => {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const results: Record<string, { count?: number; data?: unknown; error?: unknown }> = {}
  const make = (table: string) => {
    const b: Record<string, unknown> = {}
    const ops = ['select', 'eq', 'ilike', 'gt', 'is', 'limit', 'maybeSingle']
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
    h.results.household_members = { count: 2, data: { household_id: 'hh-1' }, error: null }
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

  it('scopes the household count to the caller — a global count is not "your partner"', async () => {
    // `household_members` and `household_invitations` both return rows beyond
    // this account (the invitations select policy is `using (true)`). An
    // unfiltered count showed a brand-new household "Invite your partner —
    // invited" off other people's rows. Here the platform has 3 household
    // rows and this user belongs to none of them.
    h.results.family_members = { count: 1, data: null, error: null }
    h.results.attachments = { count: 0, data: null, error: null }
    h.results.household_members = { count: 3, data: null, error: null }
    h.results.household_invitations = { count: 0, data: null, error: null }
    h.results.routines = { count: 0, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())

    await waitFor(() => expect(result.current.signals).not.toBeNull())
    expect(result.current.signals?.partnerInvited).toBe(false)

    // Own row first, by user_id — never a bare count.
    expect(h.calls.some((c) => c.table === 'household_members' && c.op === 'eq' && c.args[0] === 'user_id')).toBe(true)
    // And with no household of our own, its member count is never asked for.
    expect(h.calls.some((c) => c.table === 'household_members' && c.op === 'eq' && c.args[0] === 'household_id')).toBe(false)
  })

  it('an unexpired invitation THIS user sent counts as partner-invited', async () => {
    h.results.family_members = { count: 1, data: null, error: null }
    h.results.attachments = { count: 0, data: null, error: null }
    h.results.household_members = { count: 1, data: { household_id: 'hh-1' }, error: null }
    h.results.household_invitations = { count: 1, data: null, error: null }
    h.results.routines = { count: 0, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())

    await waitFor(() => expect(result.current.signals).not.toBeNull())
    expect(result.current.signals?.partnerInvited).toBe(true)

    const invitationCalls = h.calls.filter((c) => c.table === 'household_invitations')
    expect(invitationCalls.some((c) => c.op === 'gt' && c.args[0] === 'expires_at')).toBe(true)
    expect(invitationCalls.some((c) => c.op === 'eq' && c.args[0] === 'invited_by' && c.args[1] === 'user-1')).toBe(true)
    expect(invitationCalls.some((c) => c.op === 'is' && c.args[0] === 'accepted_at')).toBe(true)
  })

  it('re-fetches when the window regains focus while the card still has work to show', async () => {
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

  it('stops listening once the card is done — an established account polls nothing on focus', async () => {
    // Every step done → `shouldShowFirstWeek` will never show the card again,
    // so the five count queries on every focus were pure waste, forever.
    h.results.family_members = { count: 4, data: null, error: null }
    h.results.attachments = { count: 1, data: null, error: null }
    h.results.household_members = { count: 2, data: { household_id: 'hh-1' }, error: null }
    h.results.household_invitations = { count: 0, data: null, error: null }
    h.results.routines = { count: 3, data: null, error: null }

    const { result } = renderHook(() => useFirstWeekSignals())
    await waitFor(() => expect(result.current.signals?.routineCount).toBe(3))

    const callsBefore = h.from.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(h.from.mock.calls.length).toBe(callsBefore)

    // But an explicit refetch still works — that's how clearing the sample
    // page brings the card, and its listeners, back.
    await act(() => result.current.refetch())
    expect(h.from.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})
