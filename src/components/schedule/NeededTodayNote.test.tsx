import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { NeededTodayNote } from './NeededTodayNote'
import { NEEDED_TODAY_EXPANDED_MAX } from '@/lib/today/neededToday'
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'

const DAY = new Date(2026, 7, 19)
const NEXT_DAY = new Date(2026, 7, 20)

// Partial mock: keep the real module (ListsProvider, useListsContext) and
// override only the accessor the note reads. Replacing the whole module is
// what hid a broken write path here once already.
vi.mock('@/contexts/ListsContext', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useListsContextOrNull: () => ({ lists: [{ id: 'shop', category: 'shopping' }] }) }
})

const mockComplete = vi.fn()
let mockListItems: ListItem[] = []
vi.mock('@/hooks/useNeededListItems', () => ({
  useNeededListItems: () => ({ items: mockListItems, refetch: vi.fn(), complete: mockComplete }),
}))

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

function listItem(over: Partial<ListItem>): ListItem {
  return {
    id: 'i1', listId: 'shop', text: 'Pull-ups', sortOrder: 0, completed: false,
    neededOn: DAY, createdAt: DAY, updatedAt: DAY, ...over,
  } as ListItem
}

const noop = { onToggleTask: vi.fn(), onOpenTask: vi.fn() }

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

  describe('list-item rows', () => {
    it('completes through the hook, which owns the off-list write', () => {
      mockListItems = [listItem({})]
      try {
        render(<NeededTodayNote tasks={[]} viewedDate={DAY} {...noop} />)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Pull-ups' }))
        expect(mockComplete).toHaveBeenCalledWith('i1')
      } finally {
        mockListItems = []
      }
    })

    // A list item has no detail surface to open. A <button> with no handler
    // still reads as clickable and does nothing when tapped.
    it('renders the title as plain text, not a button', () => {
      mockListItems = [listItem({})]
      try {
        render(<NeededTodayNote tasks={[]} viewedDate={DAY} {...noop} />)
        expect(screen.queryByRole('button', { name: 'Pull-ups' })).not.toBeInTheDocument()
        expect(screen.getByText('Pull-ups')).toBeInTheDocument()
      } finally {
        mockListItems = []
      }
    })
  })

  it('folds past the cap behind "+N more" and expands on click', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, title: `Item ${n}`, neededOn: DAY }))
    render(<NeededTodayNote tasks={many} viewedDate={DAY} {...noop} />)

    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(5)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(8)
  })

  // Today is a fixed-space surface: expanding must not make the note unbounded.
  it('caps the expanded note instead of rendering everything', () => {
    const many = Array.from(
      { length: NEEDED_TODAY_EXPANDED_MAX + 6 },
      (_, n) => task({ id: `t${n}`, title: `Item ${n}`, neededOn: DAY }),
    )
    render(<NeededTodayNote tasks={many} viewedDate={DAY} {...noop} />)

    fireEvent.click(screen.getByText(/more/))
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(NEEDED_TODAY_EXPANDED_MAX)
    // Still folded: the remainder stays behind the count.
    expect(screen.getByText(/\+6 more/)).toBeInTheDocument()
  })

  // "+N more" is a decision about the day you were looking at. Carrying it
  // across navigation silently blows the space budget on the next day.
  it('collapses again when the viewed date changes', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, title: `Item ${n}`, neededOn: DAY }))
    const nextDayTasks = many.map((t) => ({ ...t, neededOn: NEXT_DAY }))

    const { rerender } = render(<NeededTodayNote tasks={many} viewedDate={DAY} {...noop} />)
    fireEvent.click(screen.getByText(/\+3 more/))
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(8)

    rerender(<NeededTodayNote tasks={nextDayTasks} viewedDate={NEXT_DAY} {...noop} />)
    expect(screen.getAllByTestId('needed-today-row')).toHaveLength(5)
  })
})
