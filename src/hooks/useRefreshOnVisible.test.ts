import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRefreshOnVisible } from './useRefreshOnVisible'

/** Drive jsdom's document.visibilityState + fire the event the hook listens for. */
function setVisible(visible: boolean) {
  Object.defineProperty(document, 'hidden', { value: !visible, configurable: true })
  Object.defineProperty(document, 'visibilityState', {
    value: visible ? 'visible' : 'hidden',
    configurable: true,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useRefreshOnVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 19, 9, 0, 0))
    setVisible(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire on mount — the caller already fetches once itself', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('refetches when a long-backgrounded tab becomes visible again', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh))

    setVisible(false)
    // The real case: tab sat open for hours while an event was added in Google.
    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    setVisible(true)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('also refetches on window focus — app switching may not toggle visibility', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh))

    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('throttles rapid alt-tabbing to one refetch per interval', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh, { minIntervalMs: 60_000 }))

    vi.setSystemTime(new Date(2026, 7, 19, 9, 5, 0))
    setVisible(false)
    setVisible(true)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // Bouncing back within the window must not hit Google again.
    vi.setSystemTime(new Date(2026, 7, 19, 9, 5, 30))
    setVisible(false)
    setVisible(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // Past the throttle window it refetches again.
    vi.setSystemTime(new Date(2026, 7, 19, 9, 7, 0))
    setVisible(false)
    setVisible(true)
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('ignores the hidden transition itself', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh))

    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    setVisible(false)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does nothing while disabled (e.g. calendar not connected)', () => {
    const onRefresh = vi.fn()
    renderHook(() => useRefreshOnVisible(onRefresh, { enabled: false }))

    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    setVisible(false)
    setVisible(true)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('always calls the latest callback, not the one captured at mount', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useRefreshOnVisible(cb), {
      initialProps: { cb: first },
    })

    rerender({ cb: second })

    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    setVisible(false)
    setVisible(true)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('detaches its listeners on unmount', () => {
    const onRefresh = vi.fn()
    const { unmount } = renderHook(() => useRefreshOnVisible(onRefresh))

    unmount()

    vi.setSystemTime(new Date(2026, 7, 19, 14, 0, 0))
    setVisible(false)
    setVisible(true)

    expect(onRefresh).not.toHaveBeenCalled()
  })
})
