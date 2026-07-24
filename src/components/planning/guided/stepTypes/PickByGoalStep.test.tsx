import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { PickByGoalStep } from './PickByGoalStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

const step = {
  id: 'pick-by-goal', type: 'pick-by-goal' as const, title: 'Pick your season',
  narration: 'Under each goal, what moves it this season?',
  props: {},
}

const goal = (over: Partial<Goal>): Goal => ({
  id: 'g1', areaId: 'a1', name: 'Goal', year: 2026, status: 'active',
  sortOrder: 0, actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(),
  ...over,
}) as Goal

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Item', completed: false, scheduledFor: undefined,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('PickByGoalStep', () => {
  it('lists each domain goal with its existing picks', () => {
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room set up for how we live' })],
      tasks: [t({ id: 't1', title: 'Living room set up', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    expect(screen.getByText(/Every room set up/)).toBeInTheDocument()
    expect(screen.getByText('Living room set up')).toBeInTheDocument()
  })

  it('adding a pick under a goal calls createTaskInBucket with that goalId + pickedAt', async () => {
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room set up' })],
      tasks: [],
      createTaskInBucket,
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /add a pick/i }))
    fireEvent.change(screen.getByPlaceholderText(/move this goal/i), { target: { value: 'Fix the back door' } })
    fireEvent.click(screen.getByRole('button', { name: /^add pick$/i }))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Fix the back door', 'quarter', expect.objectContaining({ goalId: 'g1', pickedAt: expect.any(Date) }),
    ))
  })

  it('standalone mode adds a pick with no goal', async () => {
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    const host = makeHost({ goals: [goal({ id: 'g1' })], tasks: [], createTaskInBucket })
    renderStep(<PickByGoalStep />, { step: { ...step, props: { standalone: true } }, host, horizon: 'seasonal' })
    fireEvent.change(screen.getByPlaceholderText(/serves no goal/i), { target: { value: 'Renew passport' } })
    fireEvent.click(screen.getByRole('button', { name: /^add pick$/i }))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Renew passport', 'quarter', expect.objectContaining({ goalId: undefined, pickedAt: expect.any(Date) }),
    ))
  })
})
