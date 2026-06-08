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

  it('review rows are triageable: demote into the lower horizon, defer to someday, mark done', async () => {
    const onSetBucket = vi.fn(); const onCompleteTask = vi.fn()
    const tasks = [task({ id: 'm1', title: 'Open monthly', bucket: 'month' })]
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={tasks} onPushTask={vi.fn()} onClose={vi.fn()}
        onSetBucket={onSetBucket} onCompleteTask={onCompleteTask} demote={{ label: 'Into week', bucket: 'week' }} />
    )
    await user.click(screen.getByRole('button', { name: 'Into week' }))
    expect(onSetBucket).toHaveBeenCalledWith('m1', 'week')
    await user.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onSetBucket).toHaveBeenCalledWith('m1', 'someday')
    await user.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onCompleteTask).toHaveBeenCalledWith('m1')
  })

  it('review list is read-only when no triage handlers are given', () => {
    const tasks = [task({ id: 'm1', title: 'Open monthly', bucket: 'month' })]
    render(<CadenceSession {...monthlyProps} tasks={tasks} onPushTask={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Open monthly')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Into week' })).not.toBeInTheDocument()
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

  it('breaks a goal action into this horizon (linked task via onPullGoalAction)', async () => {
    const onPullGoalAction = vi.fn()
    const goalActions = [
      { id: 'ga1', goalId: 'g1', description: 'Renovate backyard', quarter: 'Q2', completed: false, projectId: 'p1', sortOrder: 0, createdAt: new Date() },
    ]
    const { user } = render(
      <CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()}
        goalActions={goalActions as never} onPullGoalAction={onPullGoalAction} />
    )
    expect(screen.getByText(/Break goals down \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('Renovate backyard')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Plan it/ }))
    expect(onPullGoalAction).toHaveBeenCalledWith(goalActions[0])
  })

  it('hides the goals section when there are no goal actions', () => {
    render(<CadenceSession {...monthlyProps} tasks={[]} onPushTask={vi.fn()} onClose={vi.fn()} goalActions={[]} onPullGoalAction={vi.fn()} />)
    expect(screen.queryByText(/Break goals down/)).not.toBeInTheDocument()
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
