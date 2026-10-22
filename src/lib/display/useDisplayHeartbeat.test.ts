import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), isDisplay: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), pairing: { now: false, listeners: new Set<() => void>() } }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession, signOut: mocks.signOut } } }))
vi.mock('./pairing', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (l: () => void) => { mocks.pairing.listeners.add(l); return () => { mocks.pairing.listeners.delete(l) } }
  return { isDisplaySession: mocks.isDisplay, usePairing: () => useSyncExternalStore(subscribe, () => mocks.pairing.now) }
})
const setPairing = (v: boolean) => { mocks.pairing.now = v; mocks.pairing.listeners.forEach((l) => l()) }

import { HEARTBEAT_MS, useDisplayHeartbeat } from './useDisplayHeartbeat'

beforeEach(() => {
  vi.useFakeTimers(); mocks.rpc.mockReset(); mocks.isDisplay.mockReset(); mocks.getSession.mockReset(); mocks.signOut.mockReset(); mocks.pairing.now = false
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
  it('never signs out a tablet in the middle of pairing, and beats once the pairing is through', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.isDisplay.mockResolvedValue(false)
    mocks.pairing.now = true
    renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.isDisplay).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
    mocks.isDisplay.mockResolvedValue(true)
    act(() => setPairing(false))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('display_heartbeat')
  })
  it('keeps a tablet signed in when the server cannot be asked, and asks again at the next beat', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.isDisplay.mockResolvedValueOnce(null).mockResolvedValueOnce(true)
    renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(mocks.rpc).toHaveBeenCalledWith('display_heartbeat')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
