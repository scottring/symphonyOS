import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGridCreate } from './useGridCreate'

const fakeEvent = () =>
  ({
    currentTarget: {
      getBoundingClientRect: () => ({
        top: 100,
        left: 200,
        width: 80,
        height: 15,
        bottom: 115,
        right: 280,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }),
    },
  }) as unknown as React.PointerEvent

describe('useGridCreate', () => {
  it('click (no movement) saves start slot and a 30-min default end time', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 13,
        minute: 0,
      }),
    )
    act(() => result.current.onSlotPointerUp())

    expect(result.current.state).not.toBeNull()
    const { startTime, endTime } = result.current.toTimes(result.current.state!)
    expect(startTime.getHours()).toBe(13)
    expect(startTime.getMinutes()).toBe(0)
    expect((endTime.getTime() - startTime.getTime()) / 60000).toBe(30)
  })

  it('drag down extends the end slot and the duration covers the range', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 13,
        minute: 0,
      }),
    )
    act(() =>
      result.current.onGridPointerMove({ dayIso: '2026-05-20', hour: 14, minute: 0 }),
    )
    act(() => result.current.onSlotPointerUp())

    const { startTime, endTime } = result.current.toTimes(result.current.state!)
    expect(startTime.getHours()).toBe(13)
    // End slot is 14:00 → end time is 14:15 (end of slot)
    expect(endTime.getHours()).toBe(14)
    expect(endTime.getMinutes()).toBe(15)
  })

  it('ignores cross-day pointer move (v1 keeps create on a single day)', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 13,
        minute: 0,
      }),
    )
    act(() =>
      result.current.onGridPointerMove({ dayIso: '2026-05-21', hour: 13, minute: 0 }),
    )
    act(() => result.current.onSlotPointerUp())

    const { startTime, endTime } = result.current.toTimes(result.current.state!)
    // Start day preserved, end slot stayed at the start slot
    expect(startTime.getDate()).toBe(20)
    expect(endTime.getDate()).toBe(20)
  })

  it('close() clears state', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 13,
        minute: 0,
      }),
    )
    act(() => result.current.onSlotPointerUp())
    expect(result.current.state).not.toBeNull()
    act(() => result.current.close())
    expect(result.current.state).toBeNull()
  })

  it('toTimes respects a custom defaultMinutes parameter', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 10,
        minute: 0,
      }),
    )
    act(() => result.current.onSlotPointerUp())

    const { startTime, endTime } = result.current.toTimes(result.current.state!, 60)
    expect((endTime.getTime() - startTime.getTime()) / 60000).toBe(60)
  })

  it('state is null before any gesture', () => {
    const { result } = renderHook(() => useGridCreate())
    expect(result.current.state).toBeNull()
  })

  it('pointerup without prior pointerdown is a no-op', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() => result.current.onSlotPointerUp())
    expect(result.current.state).toBeNull()
  })

  it('anchorRect is captured from the pointerdown element', () => {
    const { result } = renderHook(() => useGridCreate())
    act(() =>
      result.current.onSlotPointerDown(fakeEvent(), {
        dayIso: '2026-05-20',
        hour: 9,
        minute: 30,
      }),
    )
    act(() => result.current.onSlotPointerUp())

    expect(result.current.state?.anchorRect).toEqual({
      top: 100,
      left: 200,
      width: 80,
      height: 15,
    })
  })
})
