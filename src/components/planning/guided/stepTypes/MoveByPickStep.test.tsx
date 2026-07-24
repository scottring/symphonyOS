import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { MoveByPickStep } from './MoveByPickStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

// Same suggest mechanism the season step uses (streamSymphonyAgent →
// parseSuggestions), mocked so tapping a chip is the only write path.
const stream = vi.hoisted(() => vi.fn())
vi.mock('@/lib/agentStream', () => ({ streamSymphonyAgent: stream }))

const step = {
  id: 'move-by-pick', type: 'move-by-pick' as const, title: 'Move the season',
  narration: 'Under each pick, what moves it this month?',
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

const pick = (over: Record<string, unknown>) =>
  t({ bucket: 'quarter', pickedAt: new Date(2026, 6, 1), ...over })

describe('MoveByPickStep', () => {
  it('lists this season’s picks with the month moves already threaded to them', () => {
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room set up for how we live' })],
      tasks: [
        pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' }),
        t({ id: 'm1', title: 'Weed the backyard', bucket: 'month', sourceId: 'p1', goalId: 'g1' }),
      ],
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    expect(screen.getByText('Porch & backyard')).toBeInTheDocument()
    expect(screen.getByText('Weed the backyard')).toBeInTheDocument()
    // The pick's goal rides along as context.
    expect(screen.getByText(/Every room set up/)).toBeInTheDocument()
  })

  it('adding a move under a pick creates it already threaded (sourceId + goalId, month bucket)', async () => {
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room' })],
      tasks: [pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' })],
      createTaskInBucket,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: 'Add a move for "Porch & backyard"' }))
    fireEvent.change(screen.getByPlaceholderText(/move this pick this month/i), { target: { value: 'Buy a bench' } })
    fireEvent.click(screen.getByRole('button', { name: /^add move$/i }))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Buy a bench', 'month', { sourceId: 'p1', goalId: 'g1' },
    ))
  })

  it('shows unthreaded month items on the shelf and files one under a pick in one tap', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room' })],
      tasks: [
        pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' }),
        t({ id: 'm1', title: 'Buy a bench', bucket: 'month' }),
      ],
      onUpdateTask,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    expect(screen.getByText(/On the shelf/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'File "Buy a bench" under a pick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Porch & backyard' }))
    expect(onUpdateTask).toHaveBeenCalledWith('m1', { sourceId: 'p1', goalId: 'g1' })
  })

  it('dropping a shelf move on a pick threads it', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      goals: [goal({ id: 'g2', name: 'A real local circle' })],
      tasks: [
        pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' }),
        pick({ id: 'p2', title: 'Host get-togethers', goalId: 'g2' }),
        t({ id: 'm1', title: 'Invite Guy + Jess for pizza', bucket: 'month' }),
      ],
      onUpdateTask,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    const target = screen.getByText('Host get-togethers').closest('section')!
    fireEvent.drop(target, { dataTransfer: { getData: () => 'm1' } })
    expect(onUpdateTask).toHaveBeenCalledWith('m1', { sourceId: 'p2', goalId: 'g2' })
  })

  it('set aside un-threads the move instead of deleting it', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      tasks: [
        pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' }),
        t({ id: 'm1', title: 'Weed the backyard', bucket: 'month', sourceId: 'p1', goalId: 'g1' }),
      ],
      onUpdateTask,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /set aside weed the backyard/i }))
    expect(onUpdateTask).toHaveBeenCalledWith('m1', { sourceId: undefined, goalId: undefined })
  })

  it('a set-aside move is recoverable — file again restores the pick it served', () => {
    const onUpdateTask = vi.fn()
    const host = makeHost({
      tasks: [
        pick({ id: 'p1', title: 'Porch & backyard', goalId: 'g1' }),
        t({ id: 'm1', title: 'Weed the backyard', bucket: 'month', sourceId: 'p1', goalId: 'g1' }),
      ],
      onUpdateTask,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /set aside weed the backyard/i }))
    fireEvent.click(screen.getByRole('button', { name: /file again weed the backyard/i }))
    expect(onUpdateTask).toHaveBeenLastCalledWith('m1', { sourceId: 'p1', goalId: 'g1' })
  })

  it('Suggest moves renders AI chips scoped to the pick; tapping one adds it threaded (tap is the only write path)', async () => {
    stream.mockImplementation(async (_msgs: unknown, handlers: { onDone?: (r: string, e: unknown) => void }) => {
      handlers.onDone?.('["Price two benches and pick one", "Book the sand delivery"]', null)
    })
    const createTaskInBucket = vi.fn().mockResolvedValue(undefined)
    const host = makeHost({
      goals: [goal({ id: 'g1', name: 'Every room set up for how we actually live' })],
      tasks: [
        pick({ id: 'p1', title: 'Porch and backyard set up for guests', goalId: 'g1' }),
        t({ id: 'm1', title: 'Weed the backyard', bucket: 'month', sourceId: 'p1', goalId: 'g1' }),
      ],
      createTaskInBucket,
    })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })

    // Quiet until asked — no stream call on render.
    expect(stream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /suggest moves/i }))
    await waitFor(() => expect(screen.getByText('Price two benches and pick one')).toBeInTheDocument())

    // The pick and its existing move ride in the prompt so the AI won't duplicate.
    const prompt = stream.mock.calls[0][0][0].content as string
    expect(prompt).toContain('Porch and backyard set up for guests')
    expect(prompt).toContain('Weed the backyard')

    fireEvent.click(screen.getByText('Book the sand delivery'))
    await waitFor(() => expect(createTaskInBucket).toHaveBeenCalledWith(
      'Book the sand delivery', 'month', { sourceId: 'p1', goalId: 'g1' },
    ))
  })

  it('tells you to go pick a season when there are no picks', () => {
    const host = makeHost({ tasks: [t({ id: 'm1', title: 'Buy a bench', bucket: 'month' })] })
    renderStep(<MoveByPickStep />, { step, host, horizon: 'monthly' })
    expect(screen.getByText(/no picks/i)).toBeInTheDocument()
  })
})
