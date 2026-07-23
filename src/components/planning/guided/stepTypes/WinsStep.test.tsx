import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { WinsStep } from './WinsStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const STEP = { id: 'wins', type: 'wins' as const, title: 'Celebrate wins', narration: 'x'.repeat(30) }

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 't1', title: over.title ?? 'Move', completed: false,
    createdAt: new Date('2026-07-02'), updatedAt: new Date('2026-07-02'),
    ...over,
  } as Task
}

describe('WinsStep', () => {
  it('lists completed month-bucket moves and completed tasks scheduled in the period', () => {
    const host = makeHost({
      tasks: [
        task({ id: 'a', title: 'Order dishwasher', completed: true, bucket: 'month' }),
        task({ id: 'b', title: 'Book dentist', completed: true, bucket: 'timed', scheduledFor: new Date(2026, 6, 10) }),
        task({ id: 'c', title: 'Outside period', completed: true, bucket: 'timed', scheduledFor: new Date(2026, 5, 10) }),
        task({ id: 'd', title: 'Still open', completed: false, bucket: 'month' }),
      ],
    })
    renderStep(<WinsStep />, { step: STEP, host })
    expect(screen.getByText(/You closed 2 moves/)).toBeInTheDocument()
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
    expect(screen.getByText('Book dentist')).toBeInTheDocument()
    expect(screen.queryByText('Outside period')).not.toBeInTheDocument()
    expect(screen.queryByText('Still open')).not.toBeInTheDocument()
  })

  it('zero state is warm, never guilt', () => {
    renderStep(<WinsStep />, { step: STEP, host: makeHost() })
    expect(screen.getByText(/Nothing closed out yet/)).toBeInTheDocument()
  })

  it('singular copy for one win', () => {
    const host = makeHost({ tasks: [task({ id: 'a', completed: true, bucket: 'month' })] })
    renderStep(<WinsStep />, { step: STEP, host })
    expect(screen.getByText(/You closed 1 move\b/)).toBeInTheDocument()
  })
})
