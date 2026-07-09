// src/components/planning/guided/stepTypes/ReviewStep.test.tsx
import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ReviewStep } from './ReviewStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

function task(over: Partial<Task>): Task {
  return {
    id: 't1', title: 'Order dishwasher', completed: false, scheduledFor: undefined,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as unknown as Task
}

const bucketStep = {
  id: 'month-review', type: 'review' as const, title: 'Last month’s list',
  narration: 'Here is what is still open from the month. Give each a fate.',
  props: { bucket: 'month' as const },
}

describe('ReviewStep — bucket source', () => {
  it('lists open items in the bucket and completes via Done', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(host.onCompleteTask).toHaveBeenCalledWith('a')
  })

  it('shows the empty state when the bucket is clear', () => {
    renderStep(<ReviewStep />, { step: bucketStep })
    expect(screen.getByText(/Nothing left open/)).toBeInTheDocument()
  })
})

describe('ReviewStep — someday source', () => {
  const somedayStep = {
    id: 'annual-someday', type: 'review' as const, title: 'Someday list',
    narration: 'Still someday, or ready to move?',
    props: { source: 'someday' as const },
  }

  it('lists open items in the someday bucket', () => {
    const host = makeHost({ tasks: [task({ id: 'b', title: 'Learn pottery', bucket: 'someday' })] })
    renderStep(<ReviewStep />, { step: somedayStep, host })
    expect(screen.getByText('Learn pottery')).toBeInTheDocument()
  })
})

describe('ReviewStep — overdue source', () => {
  const overdueStep = {
    id: 'daily-overdue', type: 'review' as const, title: 'Overdue',
    narration: 'Still worth doing, or let go?',
    props: { source: 'overdue' as const },
  }

  it('lists overdue items via selectOverdue', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const host = makeHost({ tasks: [task({ id: 'c', title: 'Call plumber', bucket: 'timed', scheduledFor: yesterday })] })
    renderStep(<ReviewStep />, { step: overdueStep, host })
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
  })
})

describe('ReviewStep — goals source', () => {
  const goalsStep = {
    id: 'goal-review', type: 'review' as const, title: 'Last year’s goals',
    narration: 'Achieved, carry, or let go.', props: { source: 'goals' as const },
  }
  const goal = { id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'ar1' } as unknown as Goal

  it('marks a goal achieved', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Achieved/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'completed')
  })

  it('lets a goal go (archived)', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Let go/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'archived')
  })

  it('shows the empty state when no goals are waiting on a verdict', () => {
    renderStep(<ReviewStep />, { step: goalsStep })
    expect(screen.getByText(/No goals waiting on a verdict/)).toBeInTheDocument()
  })
})
