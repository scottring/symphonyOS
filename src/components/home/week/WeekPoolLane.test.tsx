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
  })

  it('shows the week list and hides scheduled ones', () => {
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

  it('emits a prefixed id so a pill click opens the task panel', () => {
    // The host parses "<kind>-<id>" and ignores anything else, so a bare uuid
    // was a click that did nothing at all.
    const onSelectItem = vi.fn()
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={onSelectItem}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    fireEvent.click(screen.getByText('Call VW'))
    expect(onSelectItem).toHaveBeenCalledWith('task-a')
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
    fireEvent.click(screen.getByRole('button', { name: /This week · 1/ }))
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

  // A routine with no time needs a slot exactly the way an unscheduled task
  // does, so it rides in the same strip instead of hiding behind its own tab
  // (Scott, 2026-09-05).
  it('carries routines that need a home into the week strip, after the tasks', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
          routines={[createMockRoutine({ name: 'Trash night', time_of_day: null })]}
        />
      </DndContext>,
    )
    expect(screen.getByText('Call VW')).toBeInTheDocument()
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    // Both counted in the header
    expect(screen.getByRole('button', { name: /This week · 2/ })).toBeInTheDocument()
  })

  // Routines get their own allowance. Sharing the tasks' budget meant a busy
  // week (34 loose tasks) spent every slot on tasks and showed no routine at
  // all — the very segregation this change ends.
  it('always shows routines on a busy strip, capped separately from the tasks', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      task({ id: `t${i}`, title: `Loose ${i}`, bucket: 'week' }))
    const routines = Array.from({ length: 6 }, (_, i) =>
      createMockRoutine({ id: `r${i}`, name: `Routine ${i}`, time_of_day: null }))
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={many}
          routines={routines}
        />
      </DndContext>,
    )
    // Tasks fill their 8 slots AND four routines still show
    expect(screen.getAllByTitle(/Loose /)).toHaveLength(8)
    expect(screen.getByText('Routine 3')).toBeInTheDocument()
    expect(screen.queryByText('Routine 4')).not.toBeInTheDocument()
    // One expander opens what both lists are holding back: 12 tasks + 2 routines
    fireEvent.click(screen.getByRole('button', { name: '+14 more' }))
    expect(screen.getByText('Routine 5')).toBeInTheDocument()
    expect(screen.getAllByTitle(/Loose /)).toHaveLength(20)
  })

  it("is titled as this week's list and says so when empty", () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} tasks={[]} /></DndContext>)
    expect(screen.getByRole('button', { name: /This week · 0/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing on the list yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Everything is placed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/UNSCHEDULED/i)).not.toBeInTheDocument()
  })

  // A ticked pill lingers struck-through instead of vanishing — the week still
  // reads as a list with things done on it, not a list that shrinks.
  it('a ticked pill lingers struck-through until the strip is collapsed', () => {
    const onComplete = vi.fn()
    const { rerender } = render(
      <DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} onCompleteTask={onComplete}
        tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]} /></DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call VW' }))
    expect(onComplete).toHaveBeenCalledWith('a')
    rerender(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} onCompleteTask={onComplete}
      tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week', completed: true })]} /></DndContext>)
    expect(screen.getByText('Call VW')).toHaveClass('line-through')
    // The header (with its count), not the "This week" view tab.
    fireEvent.click(screen.getByRole('button', { name: /This week · / }))
    fireEvent.click(screen.getByRole('button', { name: /This week · / }))
    expect(screen.queryByText('Call VW')).not.toBeInTheDocument()
  })

  describe('Last week', () => {
    const thisWeek = new Date(2026, 7, 30) // Sunday Aug 30 (default week start)
    const prev = new Date(2026, 7, 23)
    const onUpdateTask = vi.fn()
    const onDeleteTask = vi.fn()
    const renderLane = () => render(
      <DndContext>
        <WeekPoolLane weekStart={thisWeek} dayCount={7} onSelectItem={() => {}}
          onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask}
          tasks={[
            task({ id: 'done', title: 'Washed the car', bucket: 'week', weekStart: prev, completed: true }),
            task({ id: 'open', title: 'Call the plumber', bucket: 'week', weekStart: prev }),
            task({ id: 'now', title: 'This week thing', bucket: 'week' }),
          ]} />
      </DndContext>,
    )
    beforeEach(() => { onUpdateTask.mockClear(); onDeleteTask.mockClear() })

    it("shows last week's rows, ticked and unticked, and hides this week's", () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      expect(screen.getByText('Washed the car')).toHaveClass('line-through')
      expect(screen.getByText('Call the plumber')).toBeInTheDocument()
      expect(screen.queryByText('This week thing')).not.toBeInTheDocument()
    })

    it('carry forward is a MOVE onto this week', () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      fireEvent.click(screen.getByRole('button', { name: 'Carry forward Call the plumber' }))
      expect(onUpdateTask).toHaveBeenCalledWith('open', expect.objectContaining({ bucket: 'week', weekStart: thisWeek }))
    })

    it('drop deletes; someday writes the explicit someday shape', () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      fireEvent.click(screen.getByRole('button', { name: 'Drop Call the plumber' }))
      expect(onDeleteTask).toHaveBeenCalledWith('open')
      fireEvent.click(screen.getByRole('button', { name: 'Someday Call the plumber' }))
      expect(onUpdateTask).toHaveBeenCalledWith('open', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    })
  })

  // One list, no view tabs: the month is the rail, the backlog is Inbox.
  it('has no view tabs', () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} tasks={[]} /></DndContext>)
    for (const name of ['This month', 'Everything', 'Routines']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Last week' })).toBeInTheDocument()
  })
})

describe('WeekPoolLane readability', () => {
  // The column is read, not hovered: a long title wraps to its full length
  // and the row's actions sit beneath it in plain view (Scott, 2026-09-06,
  // from the "completely readable cards" mockup).
  it('wraps a long title instead of truncating it', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[task({ id: 'a', title: 'Figure out November school break coverage and sitter options', bucket: 'week' })]}
        />
      </DndContext>,
    )
    const title = screen.getByText('Figure out November school break coverage and sitter options')
    expect(title.className).not.toMatch(/\btruncate\b/)
  })

  it('shows the row actions without hover', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          onNotThisWeek={() => {}}
          onPushTask={() => {}}
          tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]}
        />
      </DndContext>,
    )
    const notThisWeek = screen.getByLabelText(/not this week/i)
    expect(notThisWeek.className).not.toMatch(/opacity-0/)
    expect(notThisWeek.parentElement?.className).not.toMatch(/opacity-0/)
  })

  it('wraps a long routine name too', () => {
    render(
      <DndContext>
        <WeekPoolLane
          weekStart={weekStart}
          dayCount={5}
          onSelectItem={() => {}}
          tasks={[]}
          routines={[createMockRoutine({ id: 'r1', name: 'Make a weekly math and reading plan for both kids' })]}
        />
      </DndContext>,
    )
    const name = screen.getByText('Make a weekly math and reading plan for both kids')
    expect(name.className).not.toMatch(/\btruncate\b/)
  })
})
