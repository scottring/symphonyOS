import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRealtimeConnection, REALTIME_RESUMED_EVENT } from './keepAlive'

const state = { connected: true, channels: [{}] as unknown[] }
const connect = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    realtime: {
      isConnected: () => state.connected,
      connect: () => connect(),
    },
    getChannels: () => state.channels,
  },
}))

beforeEach(() => {
  connect.mockClear()
  state.connected = true
  state.channels = [{}]
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('checkRealtimeConnection', () => {
  it('reconnects when the socket has died', () => {
    state.connected = false
    expect(checkRealtimeConnection()).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('announces the resume so consumers can backfill', () => {
    // A reconnect resumes delivery going FORWARD only — anything that changed
    // while the socket was down was never sent. Without a refetch the list
    // looks live while quietly missing what it slept through.
    state.connected = false
    const heard = vi.fn()
    window.addEventListener(REALTIME_RESUMED_EVENT, heard)
    checkRealtimeConnection()
    window.removeEventListener(REALTIME_RESUMED_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the socket is already up', () => {
    expect(checkRealtimeConnection()).toBe(false)
    expect(connect).not.toHaveBeenCalled()
  })

  it('does not open a socket nothing is listening on', () => {
    state.connected = false
    state.channels = []
    expect(checkRealtimeConnection()).toBe(false)
    expect(connect).not.toHaveBeenCalled()
  })

  it('leaves a hidden tab alone', () => {
    // Reconnecting a page nobody is looking at spends egress for nothing; the
    // check runs on the way back to the tab.
    state.connected = false
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    expect(checkRealtimeConnection()).toBe(false)
    expect(connect).not.toHaveBeenCalled()
  })
})
