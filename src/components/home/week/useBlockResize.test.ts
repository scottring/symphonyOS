import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBlockResize } from './useBlockResize'

const SLOT_PX = 15 // pixels per 15-min slot (HOUR_ROW_HEIGHT/4 = 60/4)

describe('useBlockResize', () => {
  it('bottom-edge drag down by 4 slots adds 60 min to endTime', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownBottom({
      pointerId: 1, clientY: 200, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 200 + SLOT_PX * 4,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    expect(onCommit).toHaveBeenCalledTimes(1)
    const updates = onCommit.mock.calls[0][0]
    expect(updates.endTime.getHours()).toBe(15)
    expect(updates.endTime.getMinutes()).toBe(0)
  })

  it('top-edge drag down by 2 slots adds 30 min to startTime', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownTop({
      pointerId: 1, clientY: 100, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 100 + SLOT_PX * 2,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    const updates = onCommit.mock.calls[0][0]
    expect(updates.scheduledFor.getHours()).toBe(13)
    expect(updates.scheduledFor.getMinutes()).toBe(30)
  })

  it('refuses to commit below 15-min minimum duration', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownBottom({
      pointerId: 1, clientY: 200, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 200 - SLOT_PX * 5,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    const updates = onCommit.mock.calls[0][0]
    const dur = updates.endTime.getTime() - start.getTime()
    expect(dur).toBeGreaterThanOrEqual(15 * 60 * 1000)
  })
})
