import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekPoolLane } from './WeekPoolLane'
import { createMockRoutine } from '@/test/mocks/factories'
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

  it('caps the strip and expands the rest via "+N more"', () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      task({ id: `t${i}`, title: `Task number ${i}`, bucket: 'week' }),
    )
    render(
      <DndContext>
        <WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} tasks={twelve} />
      </DndContext>,
    )
    expect(screen.getByRole('button', { name: '+4 more' })).toBeInTheDocument()
    expect(screen.getAllByTitle(/Task number/)).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: '+4 more' }))
    expect(screen.getAllByTitle(/Task number/)).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('completes a task from its pill', () => {
    const onComplete = vi.fn()
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          onCompleteTask={onComplete}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call VW' }))
    expect(onComplete).toHaveBeenCalledWith('a')
  })

  it('sends a pill to next week via "not this week"', () => {
    const onNotThisWeek = vi.fn()
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          onNotThisWeek={onNotThisWeek}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Not this week/ }))
    expect(onNotThisWeek).toHaveBeenCalledWith('a')
  })

  it('defers a pill through the push dropdown', () => {
    const onPushTask = vi.fn()
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          onPushTask={onPushTask}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
    fireEvent.click(screen.getByRole('button', { name: 'This Month' }))
    expect(onPushTask).toHaveBeenCalledWith('a', 'month')
  })

  it('offers a Routines view listing routines that need a home', () => {
    // The host pre-filters through unhomedRoutines(); the lane only renders.
    const routines = [createMockRoutine({ name: 'Trash night', time_of_day: null })]
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[]}
          routines={routines}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Routines' }))
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    expect(screen.getByText(/no set time/)).toBeInTheDocument()
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
