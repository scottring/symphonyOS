import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { NeededTodayNote } from './NeededTodayNote'
import type { Task } from '@/types/task'

const DAY = new Date(2026, 7, 19)

vi.mock('@/contexts/ListsContext', () => ({
  useListsContextOrNull: () => ({ lists: [] }),
}))
vi.mock('@/hooks/useNeededListItems', () => ({
  useNeededListItems: () => ({ items: [], refetch: vi.fn() }),
}))

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

const noop = { onToggleTask: vi.fn(), onToggleListItem: vi.fn(), onOpenTask: vi.fn() }

describe('NeededTodayNote', () => {
  it('renders nothing when nothing is marked', () => {
    const { container } = render(
      <NeededTodayNote tasks={[task({})]} viewedDate={DAY} {...noop} />,
    )
    expect(container.querySelector('[data-testid="needed-today-note"]')).toBeNull()
  })

  it('renders a marked task', () => {
    render(
      <NeededTodayNote tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]} viewedDate={DAY} {...noop} />,
    )
    expect(screen.getByTestId('needed-today-note')).toBeInTheDocument()
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
  })

  it('completes the underlying task from the checkbox', () => {
    const onToggleTask = vi.fn()
    render(
      <NeededTodayNote
        tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]}
        viewedDate={DAY} {...noop} onToggleTask={onToggleTask}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /call plumber/i }))
    expect(onToggleTask).toHaveBeenCalledWith('a')
  })

  it('opens the task when the title is clicked', () => {
    const onOpenTask = vi.fn()
    render(
      <NeededTodayNote
        tasks={[task({ id: 'a', title: 'Call plumber', neededOn: DAY })]}
        viewedDate={DAY} {...noop} onOpenTask={onOpenTask}
      />,
    )
    fireEvent.click(screen.getByText('Call plumber'))
    expect(onOpenTask).toHaveBeenCalledWith('a')
  })

  it('folds past the cap behind "+N more" and expands on click', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, title: `Item ${n}`, neededOn: DAY }))
    render(<NeededTodayNote tasks={many} viewedDate={DAY} {...noop} />)

    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(5)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(8)
  })
})
