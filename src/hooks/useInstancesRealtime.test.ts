import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useInstancesRealtime } from './useInstancesRealtime'
import { createMockUser } from '@/test/mocks/factories'

const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

const mockChannelOn = vi.fn()
const mockChannelSubscribe = vi.fn()
const mockRemoveChannel = vi.fn()
let realtimeCallback: ((payload: Record<string, unknown>) => void) | null = null

const mockChannelObj: {
  on: (event: string, filter: unknown, cb: (payload: Record<string, unknown>) => void) => typeof mockChannelObj
  subscribe: () => typeof mockChannelObj
} = {
  on: (event, filter, cb) => {
    mockChannelOn(event, filter)
    realtimeCallback = cb
    return mockChannelObj
  },
  subscribe: () => {
    mockChannelSubscribe()
    return mockChannelObj
  },
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => mockChannelObj,
    removeChannel: (ch: unknown) => mockRemoveChannel(ch),
  },
}))

describe('useInstancesRealtime', () => {
  beforeEach(() => {
    mockUserState = mockUser
    realtimeCallback = null
    vi.clearAllMocks()
  })

  it('subscribes to actionable_instances changes and invokes onChange per payload', async () => {
    const onChange = vi.fn()
    renderHook(() => useInstancesRealtime(onChange))

    await waitFor(() => expect(mockChannelSubscribe).toHaveBeenCalled())
    expect(mockChannelOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'actionable_instances' }),
    )

    act(() => {
      realtimeCallback?.({ eventType: 'UPDATE', new: { id: 'i1', status: 'completed' } })
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('uses the latest onChange callback without resubscribing', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useInstancesRealtime(cb), {
      initialProps: { cb: first },
    })
    await waitFor(() => expect(mockChannelSubscribe).toHaveBeenCalledTimes(1))

    rerender({ cb: second })
    expect(mockChannelSubscribe).toHaveBeenCalledTimes(1) // no resubscribe

    act(() => {
      realtimeCallback?.({ eventType: 'INSERT', new: { id: 'i2' } })
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe when there is no user', async () => {
    mockUserState = null
    renderHook(() => useInstancesRealtime(vi.fn()))
    await act(async () => {})
    expect(mockChannelSubscribe).not.toHaveBeenCalled()
  })

  it('removes the channel on unmount', async () => {
    const { unmount } = renderHook(() => useInstancesRealtime(vi.fn()))
    await waitFor(() => expect(mockChannelSubscribe).toHaveBeenCalled())
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
