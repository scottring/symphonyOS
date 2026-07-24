import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { PickByGoalStep } from './PickByGoalStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

// Reuse the same suggest mechanism WriteListStep uses (streamSymphonyAgent →
// parseSuggestions), mocked here so tapping a chip is the only write path.
const stream = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agentStream', () => ({ streamSymphonyAgent: stream }))

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

  it('set aside demotes the pick (pickedAt null), never deletes', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room' })],
      tasks: [t({ id: 't1', title: 'Fix door', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
      onUpdateTask,
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /set aside fix door/i }))
    expect(onUpdateTask).toHaveBeenCalledWith('t1', { pickedAt: null })
  })

  it('dropping a pick on another goal re-parents it (goalId update)', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Budget plan' }), goal({ id: 'g2', name: 'A real local circle' })],
      tasks: [t({ id: 't1', title: 'Weed the backyard', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
      onUpdateTask,
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    const target = screen.getByText('A real local circle').closest('section')!
    fireEvent.drop(target, { dataTransfer: { getData: () => 't1' } })
    expect(onUpdateTask).toHaveBeenCalledWith('t1', { goalId: 'g2' })
  })

  it('shows a coherence hint on a mis-anchored pick', () => {
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'A budget & investment plan' })],
      tasks: [t({ id: 't1', title: 'Weed the backyard', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    expect(screen.getByText(/re-parent/i)).toBeInTheDocument()
  })

  it('Suggest picks renders AI chips scoped to the goal; tapping one adds it as a pick (tap is the only write path)', async () => {
    stream.mockImplementation(async (_msgs: unknown, handlers: { onDone?: (r: string, e: unknown) => void }) => {
      handlers.onDone?.('["Scan + store the essential set", "Share access with Iris"]', null)
    })
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'A budget & investment plan' })],
      tasks: [t({ id: 't1', title: 'Open the brokerage account', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
      createTaskInBucket,
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })

    // Quiet until asked — no stream call on render.
    expect(stream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /suggest picks/i }))

    await waitFor(() => expect(screen.getByText('Scan + store the essential set')).toBeInTheDocument())

    // Goal name + its existing pick ride in the prompt so the AI won't duplicate.
    const prompt = stream.mock.calls[0][0][0].content as string
    expect(prompt).toContain('A budget & investment plan')
    expect(prompt).toContain('Open the brokerage account')

    fireEvent.click(screen.getByText('Share access with Iris'))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Share access with Iris', 'quarter', expect.objectContaining({ goalId: 'g1', pickedAt: expect.any(Date) }),
    ))
  })

  it('set aside then pick again re-picks with a Date', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room' })],
      tasks: [t({ id: 't1', title: 'Fix door', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })],
      onUpdateTask,
    })
    renderStep(<PickByGoalStep />, { step, host, horizon: 'seasonal' })
    fireEvent.click(screen.getByRole('button', { name: /set aside fix door/i }))
    fireEvent.click(screen.getByRole('button', { name: /pick again fix door/i }))
    expect(onUpdateTask).toHaveBeenLastCalledWith('t1', { pickedAt: expect.any(Date) })
  })
})
