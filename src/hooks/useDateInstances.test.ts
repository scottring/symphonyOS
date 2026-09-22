import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActionableInstance } from '@/types/actionable'
import { useDateInstances } from './useDateInstances'

const today = new Date(2026, 8, 22), tomorrow = new Date(2026, 8, 23)
const row = (date: string) => ({ id: date, date, entity_type: 'routine', entity_id: 'r', status: 'completed' }) as ActionableInstance
function pending() {
  let resolve!: (rows: ActionableInstance[]) => void
  const promise = new Promise<ActionableInstance[]>(r => { resolve = r })
  return { promise, resolve }
}

describe('date-scoped occurrence loading', () => {
  it('does not expose yesterday\'s completion or override while the next day loads', async () => {
    const next = pending()
    const read = vi.fn().mockResolvedValueOnce([row('2026-09-22')]).mockReturnValueOnce(next.promise)
    const { result, rerender } = renderHook(({ day }) => useDateInstances(day, read), { initialProps: { day: today } })
    await waitFor(() => expect(result.current.instances).toHaveLength(1))
    rerender({ day: tomorrow })
    expect(result.current.instances).toBeNull()
    await act(async () => next.resolve([]))
    expect(result.current.instances).toEqual([])
  })
  it('ignores an old date request that finishes after the new date', async () => {
    const old = pending(), next = pending()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const { result, rerender } = renderHook(({ day }) => useDateInstances(day, read), { initialProps: { day: today } })
    rerender({ day: tomorrow })
    await act(async () => next.resolve([row('2026-09-23')]))
    await act(async () => old.resolve([row('2026-09-22')]))
    expect(result.current.instances).toEqual([row('2026-09-23')])
  })
  it('a newer same-day refresh wins over an older one', async () => {
    const old = pending(), next = pending()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const { result } = renderHook(() => useDateInstances(today, read))
    let refresh!: Promise<void>
    act(() => { refresh = result.current.refresh() })
    await act(async () => { next.resolve([]); await refresh })
    await act(async () => old.resolve([row('2026-09-22')]))
    expect(result.current.instances).toEqual([])
  })
})
