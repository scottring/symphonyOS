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

  it('review rows get the full triage fan-out + Done', async () => {
    const onSetBucket = vi.fn(); const onCompleteTask = vi.fn()
    const tasks = [task({ id: 'm1', title: 'Open monthly', bucket: 'month' })]
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={tasks} onPushTask={vi.fn()} onClose={vi.fn()}
        onSetBucket={onSetBucket} onCompleteTask={onCompleteTask} />
    )
    // Someday chip applies directly.
    await user.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onSetBucket).toHaveBeenCalledWith('m1', 'someday')
    // Week chip fans out → This week.
    await user.click(screen.getByRole('button', { name: 'Week' }))
    await user.click(screen.getByRole('menuitem', { name: 'This week' }))
    expect(onSetBucket).toHaveBeenCalledWith('m1', 'week')
    // Done.
    await user.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onCompleteTask).toHaveBeenCalledWith('m1')
  })

  it('review list is read-only when no triage handlers are given', () => {
    const tasks = [task({ id: 'm1', title: 'Open monthly', bucket: 'month' })]
    render(<CadenceSession {...monthlyProps} tasks={tasks} onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Open monthly')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Someday' })).not.toBeInTheDocument()
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

  it('shows the level above as a read-only reference, and copy-down duplicates a line', async () => {
    const onCreateTask = vi.fn()
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()}
        onCreateTask={onCreateTask}
        reference={{ label: 'Your Summer list', items: [{ id: 'r1', title: 'Get bikes' }] }} />
    )
    expect(screen.getByText(/Your Summer list — for reference/)).toBeInTheDocument()
    expect(screen.getByText('Get bikes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Copy down/ }))
    expect(onCreateTask).toHaveBeenCalledWith('Get bikes')
  })

  it('reference lines already on this list show a check instead of a copy button', () => {
    render(
      <CadenceSession {...monthlyProps}
        tasks={[task({ id: 'm1', title: 'Get bikes', bucket: 'month' })]}
        onPushTask={vi.fn()} onClose={vi.fn()} onCreateTask={vi.fn()}
        reference={{ label: 'Your Summer list', items: [{ id: 'r1', title: 'Get bikes' }] }} />
    )
    expect(screen.getByText('on this list')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy down/ })).not.toBeInTheDocument()
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

  it('captures something new straight into the session bucket (Enter + button)', async () => {
    const onCreateTask = vi.fn()
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()} onCreateTask={onCreateTask} />
    )
    const input = screen.getByPlaceholderText(/Something new for June/)
    await user.type(input, 'Invite the neighbors over{Enter}')
    expect(onCreateTask).toHaveBeenCalledWith('Invite the neighbors over')
    expect(input).toHaveValue('')
  })

  it('hides the capture input when the session has no bucket (annual) or no handler', () => {
    render(<CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/Something new/)).not.toBeInTheDocument()
  })

  it('shows a quiet loading placeholder instead of a false empty state', () => {
    render(<CadenceSession {...monthlyProps} tasks={[]} tasksLoading onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getAllByText('Gathering your plan…').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Nothing committed/)).not.toBeInTheDocument()
  })

  it('annual goals link + custom financial copy', async () => {
    const onOpenGoals = vi.fn()
    const { user } = render(
      <CadenceSession horizon="annual" periodToken="2026" title="Plan the year" periodLabel="2026"
        tasks={[]} thisBucket={null} pullFromBucket={null}
        textFields={[]} onPushTask={vi.fn()} onClose={vi.fn()}
        onOpenGoals={onOpenGoals} financialLabel="Long-term & big-expense planning" />
    )
    expect(screen.getByText('Long-term & big-expense planning')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Set this year's goals/ }))
    expect(onOpenGoals).toHaveBeenCalled()
  })
})
