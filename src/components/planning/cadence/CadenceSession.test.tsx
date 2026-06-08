import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { CadenceSession } from './CadenceSession'
import type { Task } from '@/types/task'

const patchNotes = vi.fn()
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ notes: {}, patchNotes, loading: false }),
}))

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't', completed: false, bucket: 'inbox', scheduledFor: undefined, isAllDay: true,
    context: null, assignedTo: null, assignedToAll: [], createdAt: new Date(), updatedAt: new Date(),
    ...(over as Task),
  }
}

const monthlyProps = {
  horizon: 'monthly' as const,
  periodToken: '2026-6',
  title: 'Plan the month',
  periodLabel: 'June 2026',
  thisBucket: 'month' as const,
  pullFromBucket: 'quarter' as const,
  pullFromLabel: 'Pull from this season',
  textFields: [{ key: 'concerns' as const, label: 'Concerns & topics', placeholder: 'x' }],
}

describe('CadenceSession', () => {
  it('reviews the current-horizon pool and lists the cascade pool', () => {
    const tasks = [
      task({ id: 'm1', title: 'Already monthly', bucket: 'month' }),
      task({ id: 'q1', title: 'Season item', bucket: 'quarter' }),
    ]
    render(<CadenceSession {...monthlyProps} tasks={tasks} onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Already monthly')).toBeInTheDocument()
    expect(screen.getByText('Season item')).toBeInTheDocument()
    expect(screen.getByText(/Pull from this season \(1\)/)).toBeInTheDocument()
  })

  it('pulls a picked item down into this horizon (onPushTask id, "month")', async () => {
    const onPushTask = vi.fn()
    const tasks = [task({ id: 'q1', title: 'Season item', bucket: 'quarter' })]
    const { user } = render(<CadenceSession {...monthlyProps} tasks={tasks} onPushTask={onPushTask} onClose={vi.fn()} />)
    await user.click(screen.getByText('Season item'))
    await user.click(screen.getByRole('button', { name: /Pull 1 down/ }))
    expect(onPushTask).toHaveBeenCalledWith('q1', 'month')
  })

  it('financial handoff toggles the shared note', async () => {
    const { user } = render(<CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByText(/Do your financial review/))
    expect(patchNotes).toHaveBeenCalledWith({ financialDone: true })
  })

  it('hand-down button fires when provided', async () => {
    const onActivate = vi.fn()
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()}
        handDown={{ label: 'Plan the week', onActivate }} />
    )
    await user.click(screen.getByRole('button', { name: /Plan the week/ }))
    expect(onActivate).toHaveBeenCalled()
  })

  it('annual config (no buckets) renders text only, no pull section', () => {
    render(
      <CadenceSession horizon="annual" periodToken="2026" title="Plan the year" periodLabel="2026"
        tasks={[task({ bucket: 'quarter' })]} thisBucket={null} pullFromBucket={null}
        textFields={[{ key: 'review', label: 'Year in review', placeholder: 'x' }]}
        onPushTask={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByText('Year in review')).toBeInTheDocument()
    expect(screen.queryByText(/Pull/)).not.toBeInTheDocument()
  })
})
