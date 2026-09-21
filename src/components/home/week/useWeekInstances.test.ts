import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ActionableInstance } from '@/types/actionable'
import { createMockActionableInstance } from '@/test/mocks/factories'

// One deferred promise per range request, so the test decides which response
// lands first.
const pending: Array<{ start: Date; resolve: (rows: ActionableInstance[]) => void }> = []
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    getInstancesForRange: (start: Date) => new Promise<ActionableInstance[]>((resolve) => { pending.push({ start, resolve }) }),
  }),
}))

import { useWeekInstances } from './useWeekInstances'

describe('useWeekInstances', () => {
  it('ignores a late response for a week the page has already left', async () => {
    const first = new Date(2026, 8, 20)
    const next = new Date(2026, 8, 27)
    const { result, rerender } = renderHook(({ ws }) => useWeekInstances(ws, 7), { initialProps: { ws: first } })
    expect(pending).toHaveLength(1)

    // Page forward while the first week's request is still in flight.
    rerender({ ws: next })
    expect(pending).toHaveLength(2)

    const nextRow = createMockActionableInstance({ entity_id: 'r-next', date: '2026-09-27' })
    const firstRow = createMockActionableInstance({ entity_id: 'r-first', date: '2026-09-20' })
    await act(async () => { pending[1].resolve([nextRow]) })
    expect(result.current.map((i) => i.entity_id)).toEqual(['r-next'])

    // The stale first-week response arrives last — and must not win.
    await act(async () => { pending[0].resolve([firstRow]) })
    expect(result.current.map((i) => i.entity_id)).toEqual(['r-next'])
  })
})
