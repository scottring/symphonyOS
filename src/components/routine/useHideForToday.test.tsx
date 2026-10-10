import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CanvasActivityProvider, useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useHideForToday, useSkippedOn } from './useHideForToday'
import { emitInstancesChanged } from '@/lib/instancesChangedSignal'

const api = vi.hoisted(() => ({
  skip: vi.fn(async () => true),
  undoDone: vi.fn(async () => true),
  getInstance: vi.fn(async () => null as null | { status: string }),
}))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => api }))

const DAY = new Date(2026, 9, 14)

function wrapper({ children }: { children: ReactNode }) {
  return (
    <CanvasActivityProvider snapshot={{ tasks: [], goals: [] } as never} writers={{} as never} refetch={() => {}}>
      {children}
    </CanvasActivityProvider>
  )
}

describe('useHideForToday', () => {
  beforeEach(() => { api.skip.mockClear(); api.undoDone.mockClear() })

  it("writes a skipped instance for that routine and date — not visibility or paused_until — and Undo un-skips it", async () => {
    const { result } = renderHook(() => ({ hide: useHideForToday(), activity: useCanvasActivity() }), { wrapper })
    await act(async () => { await result.current.hide.hideForToday('bed', 'Bedtime', DAY) })

    expect(api.skip).toHaveBeenCalledWith('routine', 'bed', DAY)
    expect(result.current.activity.receipt).toMatchObject({ state: 'saved', request: 'Hide "Bedtime" for today', undoable: true })
    expect(result.current.activity.isArrived('bed')).toBe(true)

    await act(async () => { await result.current.activity.undo() })
    expect(api.undoDone).toHaveBeenCalledWith('routine', 'bed', DAY)
  })

  it("reports a failed write as didn't save, with no Undo", async () => {
    api.skip.mockResolvedValueOnce(false)
    const { result } = renderHook(() => ({ hide: useHideForToday(), activity: useCanvasActivity() }), { wrapper })
    await act(async () => { await result.current.hide.hideForToday('bed', 'Bedtime', DAY) })
    expect(result.current.activity.receipt).toMatchObject({ state: 'failed', undoable: false })
  })

  it('Show today again un-skips, and its Undo skips again', async () => {
    const { result } = renderHook(() => ({ hide: useHideForToday(), activity: useCanvasActivity() }), { wrapper })
    await act(async () => { await result.current.hide.showToday('bed', 'Bedtime', DAY) })
    expect(api.undoDone).toHaveBeenCalledWith('routine', 'bed', DAY)
    await act(async () => { await result.current.activity.undo() })
    expect(api.skip).toHaveBeenCalledWith('routine', 'bed', DAY)
  })
})

describe('useSkippedOn', () => {
  it("reads the day's instance and follows instance changes", async () => {
    api.getInstance.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useSkippedOn('bed', DAY))
    await act(async () => {})
    expect(result.current).toBe(false)
    api.getInstance.mockResolvedValueOnce({ status: 'skipped' })
    await act(async () => { emitInstancesChanged() })
    expect(result.current).toBe(true)
  })
})
