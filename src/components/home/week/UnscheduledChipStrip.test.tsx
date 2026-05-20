import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import type { Task } from '@/types/task'
import { UnscheduledChipStrip } from './UnscheduledChipStrip'

function mkTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    completed: false,
    scheduledFor: new Date(2026, 4, 20),
    isAllDay: true,
    context: null,
    projectId: undefined,
    contactId: undefined,
    assignedTo: undefined,
    bucket: 'timed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

describe('UnscheduledChipStrip', () => {
  it('renders a chip per task title', () => {
    renderWithDnd(
      <UnscheduledChipStrip tasks={[
        mkTask('t1', 'Order shoes'),
        mkTask('t2', 'Call dentist'),
      ]} />,
    )
    expect(screen.getByText('Order shoes')).toBeInTheDocument()
    expect(screen.getByText('Call dentist')).toBeInTheDocument()
  })

  it('renders the empty-state copy when no tasks', () => {
    renderWithDnd(<UnscheduledChipStrip tasks={[]} />)
    expect(screen.getByText(/all scheduled tasks have a time/i)).toBeInTheDocument()
  })

  it('marks each chip with the chip:<taskId> draggable id', () => {
    renderWithDnd(
      <UnscheduledChipStrip tasks={[mkTask('t1', 'Order shoes')]} />,
    )
    const chip = screen.getByText('Order shoes').closest('[data-chip-id]')
    expect(chip).toHaveAttribute('data-chip-id', 'chip:t1')
  })
})
