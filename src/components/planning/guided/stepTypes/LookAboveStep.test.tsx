import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { LookAboveStep } from './LookAboveStep'
import { renderStep, makeHost } from './testHarness'
import { GuidedProvider } from '../GuidedContext'
import type { Task } from '@/types/task'
import type { Goal, GoalArea } from '@/types/goal'

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Renovate kitchen', completed: false, scheduledFor: undefined,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('LookAboveStep', () => {
  it('reference mode: copy-down duplicates into this horizon\'s bucket', async () => {
    const host = makeHost({ tasks: [t({ id: 'q1', title: 'Renovate kitchen', bucket: 'quarter' })] })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-season', type: 'look-above', title: 'Your season list',
        narration: 'Read it; copy down what this month should carry.',
        props: { aboveBucket: 'quarter', aboveLabel: 'Your season list' } },
      host, horizon: 'monthly',
    })
    fireEvent.click(screen.getByRole('button', { name: /Copy down/ }))
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Renovate kitchen', 'month')
  })

  it('reference mode: an item already on this list shows a check, no button', () => {
    const host = makeHost({ tasks: [
      t({ id: 'q1', title: 'Renovate kitchen', bucket: 'quarter' }),
      t({ id: 'm1', title: 'Renovate kitchen', bucket: 'month' }),
    ] })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-season', type: 'look-above', title: 'Your season list',
        narration: 'Read it.', props: { aboveBucket: 'quarter' } },
      host, horizon: 'monthly',
    })
    expect(screen.getByText(/on this list/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy down/ })).toBeNull()
  })

  it('goals mode: renders active goals grouped by area, read-only', () => {
    const host = makeHost({
      goals: [{ id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'a1' } as unknown as Goal],
      goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea],
    })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-year', type: 'look-above', title: 'Your year goals',
        narration: 'Read only.', props: { aboveBucket: 'goals' } },
      host, horizon: 'seasonal',
    })
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Run a 5k')).toBeInTheDocument()
  })

  it('goals mode: active goals whose area no longer exists land in an Uncategorized section', () => {
    const host = makeHost({
      goals: [
        { id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'a1' } as unknown as Goal,
        { id: 'g2', name: 'Orphaned goal', status: 'active', areaId: 'gone' } as unknown as Goal,
      ],
      goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea],
    })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-year', type: 'look-above', title: 'Your year goals',
        narration: 'Read only.', props: { aboveBucket: 'goals' } },
      host, horizon: 'seasonal',
    })
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    expect(screen.getByText('Orphaned goal')).toBeInTheDocument()
  })

  it('pick mode (daily): tapping moves the task to today and it stays visible, checked, disabled', () => {
    const host = makeHost({ tasks: [t({ id: 'w1', title: 'Call plumber', bucket: 'week' })] })
    const step = { id: 'pick-today', type: 'look-above', title: 'Pick from the week',
      narration: 'Tap what today should carry.',
      props: { aboveBucket: 'week', pick: true } }
    const { rerender, value } = renderStep(<LookAboveStep />, { step, host, horizon: 'daily' })

    fireEvent.click(screen.getByRole('button', { name: /Call plumber/ }))
    expect(host.onPushTask).toHaveBeenCalledWith('w1', expect.any(Date))

    // Simulate the host's bucket flip that host.onPushTask triggers in the real app:
    // the task moves out of 'week' into 'timed', scheduled for today.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const flippedHost = makeHost({
      tasks: [t({ id: 'w1', title: 'Call plumber', bucket: 'timed', scheduledFor: todayStart })],
      onPushTask: host.onPushTask,
    })
    rerender(
      <GuidedProvider value={{ ...value, host: flippedHost }}>
        <LookAboveStep />
      </GuidedProvider>,
    )

    const btn = screen.getByRole('button', { name: /Call plumber/ })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
    expect(screen.getByText('today')).toBeInTheDocument()
  })
})
