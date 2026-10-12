import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CanvasActivityProvider, useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useOccurrenceTriage } from './useOccurrenceTriage'

const api = vi.hoisted(() => ({
  reschedule: vi.fn(async () => ({ prev: true }) as unknown),
  undoReschedule: vi.fn(async () => true),
  markDone: vi.fn(async () => true),
  undoDone: vi.fn(async () => true),
  getInstance: vi.fn(async () => null as unknown),
}))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => api }))

const wrapper = ({ children }: { children: ReactNode }) => (
  <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{} as never} refetch={() => {}}>{children}</CanvasActivityProvider>
)
const MON = new Date(2026, 9, 12)
const vitamins = { id: 'vit', name: 'Take vitamins', time_of_day: '08:00:00' }

const setup = (routine = vitamins) =>
  renderHook(() => ({ occ: useOccurrenceTriage(routine, MON), activity: useCanvasActivity() }), { wrapper })

describe('useOccurrenceTriage — one occurrence, through the instance writers', () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockClear()) })

  it('a day move keeps the routine’s 8:00 AM and moves only THIS occurrence (from its own date)', async () => {
    const { result } = setup()
    await act(async () => { result.current.occ.onPickWhen('next-week', new Date(2026, 9, 21)) })
    await vi.waitFor(() => expect(result.current.activity.receipt?.state).toBe('saved'))
    expect(api.reschedule).toHaveBeenCalledTimes(1)
    expect(api.reschedule).toHaveBeenCalledWith('routine', 'vit', MON, new Date(2026, 9, 21, 8, 0), undefined)
    expect(result.current.activity.receipt?.undoable).toBe(true)
    await act(async () => { await result.current.activity.undo() })
    expect(api.undoReschedule).toHaveBeenCalledWith({ prev: true })
  })

  it('an untimed routine moves as a day only', async () => {
    const { result } = setup({ id: 'wash', name: 'Wash comforters', time_of_day: null } as never)
    await act(async () => { result.current.occ.onPickDate(new Date(2026, 9, 17), true) })
    await vi.waitFor(() => expect(api.reschedule).toHaveBeenCalledWith('routine', 'wash', MON, new Date(2026, 9, 17), { dayOnly: true }))
  })

  it('a move that did not land: failed, no Undo, Retry writes again', async () => {
    api.reschedule.mockResolvedValueOnce(null)
    const { result } = setup()
    await act(async () => { result.current.occ.onPickWhen('tomorrow') })
    await vi.waitFor(() => expect(result.current.activity.receipt).toMatchObject({ state: 'failed', undoable: false, canRetry: true }))
    await act(async () => { result.current.activity.retry() })
    await vi.waitFor(() => expect(api.reschedule).toHaveBeenCalledTimes(2))
  })

  it('Complete marks this date’s occurrence done, with Undo', async () => {
    const { result } = setup()
    await vi.waitFor(() => expect(result.current.occ.completed).toBe(false))
    await act(async () => { result.current.occ.onComplete() })
    await vi.waitFor(() => expect(api.markDone).toHaveBeenCalledWith('routine', 'vit', MON))
    await vi.waitFor(() => expect(result.current.activity.receipt?.undoable).toBe(true))
    await act(async () => { await result.current.activity.undo() })
    expect(api.undoDone).toHaveBeenCalledWith('routine', 'vit', MON)
  })
})
