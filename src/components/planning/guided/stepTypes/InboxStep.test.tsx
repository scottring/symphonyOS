// src/components/planning/guided/stepTypes/InboxStep.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InboxStep } from './InboxStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

function task(over: Partial<Task>): Task {
  return {
    id: 't1', title: 'Order dishwasher', completed: false, scheduledFor: undefined,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as unknown as Task
}

const inboxStep = {
  id: 'weekly-inbox', type: 'inbox' as const, title: 'Look around',
  narration: 'Drive the inbox to zero.',
  props: {},
}

describe('InboxStep', () => {
  it('shows inbox-zero state when there are no inbox items', () => {
    renderStep(<InboxStep />, { step: inboxStep })
    expect(screen.getByText(/Inbox zero/)).toBeInTheDocument()
  })

  it('lists inbox items with a to-process count', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Buy filters', bucket: 'inbox' })] })
    renderStep(<InboxStep />, { step: inboxStep, host })
    expect(screen.getByText('Buy filters')).toBeInTheDocument()
    expect(screen.getByText(/1 to process/)).toBeInTheDocument()
  })
})
