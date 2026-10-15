import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), isDisplay: vi.fn(), getSession: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession, signOut: mocks.signOut } } }))
vi.mock('./pairing', () => ({ isDisplaySession: mocks.isDisplay }))

import { HEARTBEAT_MS, useDisplayHeartbeat } from './useDisplayHeartbeat'

beforeEach(() => {
  vi.useFakeTimers(); mocks.rpc.mockReset(); mocks.isDisplay.mockReset(); mocks.getSession.mockReset(); mocks.signOut.mockReset()
  mocks.rpc.mockResolvedValue({ data: null, error: null }); mocks.signOut.mockResolvedValue({ error: null })
})

describe('useDisplayHeartbeat', () => {
  it('a display beats on mount and every ten minutes, and stops on unmount', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.isDisplay.mockResolvedValue(true)
    const { unmount } = renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('display_heartbeat')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    unmount()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
  it("a person's session sends nothing and is never signed out", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } })
    renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.isDisplay).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
  it('a revoked display (anonymous, no longer a display) is signed out, on mount or at the next beat', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.isDisplay.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.signOut).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
