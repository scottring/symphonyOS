import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'
import { ListsApp } from './ListsApp'
import type { ListItem } from '@/types/list'

/**
 * ListsApp.handleUpdateItem is the ONLY thing that makes a mark made on /lists
 * visible on Today: useNeededListItems refetches on TO_BUY_CHANGED_EVENT, and
 * ListsContext.updateItem does not fire it. Without this announce the note
 * shows stale state until reload — an entry point that silently half-works.
 * It had no test at all.
 */

const updateItem = vi.fn().mockResolvedValue(undefined)

const list = { id: 'shop', title: 'To buy', category: 'shopping', visibility: 'family' }

vi.mock('@/contexts/ListsContext', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    ListsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useListsContext: () => ({
      lists: [list], loading: false, listsByCategory: {},
      selectedListId: 'shop', setSelectedListId: vi.fn(), selectedList: list,
      listItems: [], addList: vi.fn(), updateList: vi.fn(), deleteList: vi.fn(),
      addItem: vi.fn(), updateItem, deleteItem: vi.fn(),
      clearCompleted: vi.fn(), reorderItems: vi.fn(),
    }),
  }
})

// ListView is lazy-loaded and irrelevant here — all this test needs is the
// onUpdateItem prop ListsApp hands it. Stand in two buttons that call it with
// the two shapes that matter.
vi.mock('@/components/lazy', () => ({
  ListsList: () => <div />,
  ListView: ({ onUpdateItem }: { onUpdateItem: (id: string, u: Partial<ListItem>) => void }) => (
    <div>
      <button onClick={() => onUpdateItem('i1', { neededOn: new Date(2026, 7, 19) })}>mark</button>
      <button onClick={() => onUpdateItem('i1', { neededOn: undefined })}>unmark</button>
      <button onClick={() => onUpdateItem('i1', { completed: true })}>complete</button>
    </div>
  ),
}))

describe('ListsApp — needed-today announce', () => {
  const announced = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.addEventListener(TO_BUY_CHANGED_EVENT, announced)
  })
  afterEach(() => {
    window.removeEventListener(TO_BUY_CHANGED_EVENT, announced)
  })

  it('announces when a row is marked needed today, so Today refetches', async () => {
    render(<ListsApp />)

    fireEvent.click(await screen.findByText('mark'))

    await waitFor(() => expect(announced).toHaveBeenCalled())
    expect(updateItem).toHaveBeenCalledWith('i1', { neededOn: new Date(2026, 7, 19) })
  })

  // Clearing is `neededOn: undefined` — present in the patch, so `'neededOn' in
  // updates` must be the test, not truthiness. Today's note has to lose the row.
  it('announces when a mark is CLEARED, not just when one is set', async () => {
    render(<ListsApp />)

    fireEvent.click(await screen.findByText('unmark'))

    await waitFor(() => expect(announced).toHaveBeenCalled())
  })

  it('does not announce for unrelated edits', async () => {
    render(<ListsApp />)

    fireEvent.click(await screen.findByText('complete'))

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('i1', { completed: true }))
    expect(announced).not.toHaveBeenCalled()
  })
})
