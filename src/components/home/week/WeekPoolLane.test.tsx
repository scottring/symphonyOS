import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekPoolLane } from './WeekPoolLane'
import type { Task } from '@/types/task'

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 'x',
    title: over.title ?? 'T',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Task
}

const weekStart = new Date(2026, 7, 31)

describe('WeekPoolLane', () => {
  beforeEach(() => {
    localStorage.removeItem('symphony-pool-view:weekbench')
  })

  it('shows unscheduled tasks for the default week view and hides scheduled ones', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[
            task({ id: 'a', title: 'Call VW', bucket: 'week' }),
            task({ id: 'b', title: 'Placed', scheduledFor: new Date(2026, 8, 1, 10) }),
          ]}
        />
      </DndContext>,
    )
    expect(screen.getByText('Call VW')).toBeInTheDocument()
    expect(screen.queryByText('Placed')).not.toBeInTheDocument()
  })

  it('collapses to a header count and expands on click', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Unscheduled · 1/ }))
    expect(screen.queryByText('Call VW')).not.toBeInTheDocument()
  })

  it('offers the official view switcher', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[task({ id: 'a', title: 'Backlog item', bucket: 'inbox' })]}
        />
      </DndContext>,
    )
    // inbox item hidden in the default week view, shown in Everything
    expect(screen.queryByText('Backlog item')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    expect(screen.getByText('Backlog item')).toBeInTheDocument()
  })
})
