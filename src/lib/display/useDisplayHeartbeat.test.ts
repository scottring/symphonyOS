import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), isDisplay: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('./pairing', () => ({ isDisplaySession: mocks.isDisplay }))

import { HEARTBEAT_MS, useDisplayHeartbeat } from './useDisplayHeartbeat'

beforeEach(() => { vi.useFakeTimers(); mocks.rpc.mockReset(); mocks.isDisplay.mockReset(); mocks.rpc.mockResolvedValue({ data: null, error: null }) })

describe('useDisplayHeartbeat', () => {
  it('a display beats on mount and every ten minutes, and stops on unmount', async () => {
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
  it('a person\'s session sends nothing', async () => {
    mocks.isDisplay.mockResolvedValue(false)
    renderHook(() => useDisplayHeartbeat())
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
