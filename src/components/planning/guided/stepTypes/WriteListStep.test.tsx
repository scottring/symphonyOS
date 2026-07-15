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
    const input = screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)
    fireEvent.change(input, { target: { value: 'Call the plumber' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Call the plumber', 'week', { projectId: undefined })
    // The atomic-create contract: WriteListStep must never call onSetBucket.
    expect(host.onSetBucket).not.toHaveBeenCalled()
  })

  it('a #project tag attaches the chunk to its project at birth', () => {
    const host = makeHost({
      projects: [{ id: 'p1', name: 'Kitchen Renovation' } as unknown as import('@/types/project').Project],
    })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)
    fireEvent.change(input, { target: { value: '#kitchen order dishwasher' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('order dishwasher', 'week', { projectId: 'p1' })
  })

  it('season list (rows: plain) shows no triage chips and no Done check', () => {
    const seasonStep = {
      id: 'write-season', type: 'write-list' as const, title: 'Write the season\'s list',
      narration: 'Concrete, specific things.',
      props: { bucket: 'quarter' as const, rows: 'plain' as const },
    }
    const host = makeHost({ tasks: [t({ id: 'q1', title: 'Make home into home', bucket: 'quarter' })] })
    renderStep(<WriteListStep />, { step: seasonStep, host, horizon: 'seasonal' })
    expect(screen.getByText('Make home into home')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Change/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carry forward|Put aside/ })).not.toBeInTheDocument()
  })

  it('shows the soft-cap counter without blocking', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => t({ id: `w${i}`, title: `Task ${i}`, bucket: 'week' }))
    const host = makeHost({ tasks })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    expect(screen.getByText(/16 of ~15/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Add a task to this week|Add a chunk to this month|Add an outcome for this season/)).toBeEnabled()
  })
})
