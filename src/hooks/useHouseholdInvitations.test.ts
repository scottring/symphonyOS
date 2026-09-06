import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Invites failed on accounts with no households row ("No household found");
// the join page needs a preview (household name, inviter, unlinked adults)
// before membership exists, and acceptance now says WHICH member row is you.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  insertSingle: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
  getAuthUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
}))

import { useHouseholdInvitations } from './useHouseholdInvitations'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ is: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    insert: () => ({ select: () => ({ single: mocks.insertSingle }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  })
  mocks.insertSingle.mockResolvedValue({
    data: { id: 'inv1', household_id: 'h1', email: 'a@b.com', invited_by: 'user-1', token: 't1', expires_at: '2099-01-01', accepted_at: null, created_at: '2026-09-06' },
    error: null,
  })
})

describe('useHouseholdInvitations.createInvitation', () => {
  it('creates a household on demand when the caller has none yet, then retries', async () => {
    let householdCalls = 0
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'get_user_household_id') {
        householdCalls += 1
        return Promise.resolve({ data: householdCalls === 1 ? null : 'h1', error: null })
      }
      if (fn === 'setup_household') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const { result } = renderHook(() => useHouseholdInvitations())
    await act(async () => { await result.current.createInvitation('a@b.com') })

    expect(mocks.rpc).toHaveBeenCalledWith('setup_household', { p_name: null })
    expect(mocks.rpc).toHaveBeenCalledWith('get_user_household_id')
    expect(householdCalls).toBe(2)
    expect(mocks.insertSingle).toHaveBeenCalled()
  })

  it('does not create a household when one already exists', async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'get_user_household_id') return Promise.resolve({ data: 'h1', error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const { result } = renderHook(() => useHouseholdInvitations())
    await act(async () => { await result.current.createInvitation('a@b.com') })

    expect(mocks.rpc).not.toHaveBeenCalledWith('setup_household', expect.anything())
  })
})

describe('useHouseholdInvitations.acceptInvitation', () => {
  it('forwards member_id to accept_household_invitation', async () => {
    mocks.rpc.mockResolvedValue({ data: { household_id: 'h1', status: 'joined' }, error: null })
    const { result } = renderHook(() => useHouseholdInvitations())
    await act(async () => { await result.current.acceptInvitation('tok', 'member-5') })
    expect(mocks.rpc).toHaveBeenCalledWith('accept_household_invitation', { invitation_token: 'tok', member_id: 'member-5' })
  })

  it('defaults member_id to null when omitted', async () => {
    mocks.rpc.mockResolvedValue({ data: { household_id: 'h1', status: 'joined' }, error: null })
    const { result } = renderHook(() => useHouseholdInvitations())
    await act(async () => { await result.current.acceptInvitation('tok') })
    expect(mocks.rpc).toHaveBeenCalledWith('accept_household_invitation', { invitation_token: 'tok', member_id: null })
  })
})

describe('useHouseholdInvitations.getInvitationPreview', () => {
  it('returns the rpc payload', async () => {
    const payload = { household_name: 'Chen Household', inviter_name: 'Alex', candidates: [{ id: 'e', name: 'Edith' }] }
    mocks.rpc.mockResolvedValue({ data: payload, error: null })
    const { result } = renderHook(() => useHouseholdInvitations())
    const preview = await result.current.getInvitationPreview('tok')
    expect(mocks.rpc).toHaveBeenCalledWith('invitation_preview', { invitation_token: 'tok' })
    expect(preview).toEqual(payload)
  })

  it('returns null on error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    const { result } = renderHook(() => useHouseholdInvitations())
    const preview = await result.current.getInvitationPreview('tok')
    expect(preview).toBeNull()
  })
})
