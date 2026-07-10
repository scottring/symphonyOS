import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { WriteListStep } from './WriteListStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const step = {
  id: 'write-week', type: 'write-list' as const, title: 'Write the week\'s list',
  narration: 'Around fifteen items is the honest ceiling.',
  props: { bucket: 'week' as const, softCap: 15 },
}

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Item', completed: false, scheduledFor: undefined,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('WriteListStep', () => {
  it('creates into the bucket ATOMICALLY via createTaskInBucket (race guard)', async () => {
    const host = makeHost()
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add to this list/)
    fireEvent.change(input, { target: { value: 'Call the plumber' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Call the plumber', 'week', undefined)
    // The atomic-create contract: WriteListStep must never call onSetBucket.
    expect(host.onSetBucket).not.toHaveBeenCalled()
  })

  it('a #project tag attaches the chunk to its project at birth', () => {
    const host = makeHost({
      projects: [{ id: 'p1', name: 'Kitchen Renovation' } as unknown as import('@/types/project').Project],
    })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add to this list/)
    fireEvent.change(input, { target: { value: '#kitchen order dishwasher' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('order dishwasher', 'week', 'p1')
  })

  it('shows the soft-cap counter without blocking', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => t({ id: `w${i}`, title: `Task ${i}`, bucket: 'week' }))
    const host = makeHost({ tasks })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    expect(screen.getByText(/16 of ~15/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Add to this list/)).toBeEnabled()
  })
})
