import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ListsList } from './ListsList'
import { createMockList } from '@/test/mocks/factories'
import type { List, ListCategory } from '@/types/list'

function createListsByCategory(lists: List[]): Record<ListCategory, List[]> {
  const grouped: Record<ListCategory, List[]> = {
    entertainment: [],
    food_drink: [],
    shopping: [],
    travel: [],
    family_info: [],
    home: [],
    other: [],
  }

  for (const list of lists) {
    grouped[list.category].push(list)
  }

  return grouped
}

describe('ListsList', () => {
  const mockOnSelectList = vi.fn()
  const mockOnAddList = vi.fn()

  const mockLists = [
    createMockList({ id: 'list-1', title: 'Movies to Watch', category: 'entertainment' }),
    createMockList({ id: 'list-2', title: 'Restaurants to Try', category: 'food_drink' }),
    createMockList({ id: 'list-3', title: 'Gift Ideas', category: 'shopping' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnAddList.mockResolvedValue(createMockList({ id: 'new-list', title: 'New List' }))
  })

  describe('rendering', () => {
    it('renders header with title', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('Lists')).toBeInTheDocument()
    })

    it('renders list count', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('3 lists')).toBeInTheDocument()
    })

    it('shows singular "list" for one list', () => {
      const singleList = [mockLists[0]]
      render(
        <ListsList
          lists={singleList}
          listsByCategory={createListsByCategory(singleList)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('1 list')).toBeInTheDocument()
    })

    it('renders New button when onAddList is provided', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument()
    })

    it('does not render New button when onAddList is not provided', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.queryByRole('button', { name: /New/i })).not.toBeInTheDocument()
    })

    it('renders all list titles', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('Movies to Watch')).toBeInTheDocument()
      expect(screen.getByText('Restaurants to Try')).toBeInTheDocument()
      expect(screen.getByText('Gift Ideas')).toBeInTheDocument()
    })
  })

  describe('category display', () => {
    it('shows category headers for lists', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('Entertainment')).toBeInTheDocument()
      expect(screen.getByText('Food & Drink')).toBeInTheDocument()
      expect(screen.getByText('Shopping')).toBeInTheDocument()
    })

    it('does not show category headers for empty categories', () => {
      const entertainmentOnly = [mockLists[0]]
      render(
        <ListsList
          lists={entertainmentOnly}
          listsByCategory={createListsByCategory(entertainmentOnly)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('Entertainment')).toBeInTheDocument()
      expect(screen.queryByText('Food & Drink')).not.toBeInTheDocument()
      expect(screen.queryByText('Shopping')).not.toBeInTheDocument()
    })

    it('groups lists by their category', () => {
      const listsWithMultipleInCategory = [
        createMockList({ id: '1', title: 'Movies', category: 'entertainment' }),
        createMockList({ id: '2', title: 'TV Shows', category: 'entertainment' }),
        createMockList({ id: '3', title: 'Restaurants', category: 'food_drink' }),
      ]

      render(
        <ListsList
          lists={listsWithMultipleInCategory}
          listsByCategory={createListsByCategory(listsWithMultipleInCategory)}
          onSelectList={mockOnSelectList}
        />
      )

      // Both entertainment lists should be visible
      expect(screen.getByText('Movies')).toBeInTheDocument()
      expect(screen.getByText('TV Shows')).toBeInTheDocument()
      expect(screen.getByText('Restaurants')).toBeInTheDocument()
    })
  })

  describe('visibility indicator', () => {
    it('shows Shared badge for family-visible lists', () => {
      const familyList = [createMockList({ id: '1', title: 'Family List', visibility: 'family' })]
      render(
        <ListsList
          lists={familyList}
          listsByCategory={createListsByCategory(familyList)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('Shared')).toBeInTheDocument()
    })

    it('does not show Shared badge for private lists', () => {
      const privateList = [createMockList({ id: '1', title: 'Private List', visibility: 'self' })]
      render(
        <ListsList
          lists={privateList}
          listsByCategory={createListsByCategory(privateList)}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.queryByText('Shared')).not.toBeInTheDocument()
    })
  })

  describe('list selection', () => {
    it('calls onSelectList with list id when clicking a list', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
        />
      )

      fireEvent.click(screen.getByText('Movies to Watch'))

      expect(mockOnSelectList).toHaveBeenCalledWith('list-1')
    })
  })

  describe('empty state', () => {
    it('shows empty state when no lists', () => {
      render(
        <ListsList
          lists={[]}
          listsByCategory={createListsByCategory([])}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('No lists yet')).toBeInTheDocument()
      expect(screen.getByText('Create a list to remember things')).toBeInTheDocument()
    })

    it('shows list count as 0', () => {
      render(
        <ListsList
          lists={[]}
          listsByCategory={createListsByCategory([])}
          onSelectList={mockOnSelectList}
        />
      )

      expect(screen.getByText('0 lists')).toBeInTheDocument()
    })
  })

  describe('list creation', () => {
    it('shows creation form when clicking New button', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.getByPlaceholderText("What's the list?")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create List' })).toBeInTheDocument()
    })

    it('hides New button when creation form is open', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.queryByRole('button', { name: /New/i })).not.toBeInTheDocument()
    })

    it('closes form when clicking Cancel', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByPlaceholderText("What's the list?")).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument()
    })

    it('clears input when closing form', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'New List Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Reopen form
      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the list?") as HTMLInputElement
      expect(input.value).toBe('')
    })

    it('calls onAddList when submitting form', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'My New List' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(mockOnAddList).toHaveBeenCalledWith({
          title: 'My New List',
          category: 'other',
          isTemplate: false,
        })
      })
    })

    it('trims whitespace from list title', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: '  Trimmed Name  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(mockOnAddList).toHaveBeenCalledWith({
          title: 'Trimmed Name',
          category: 'other',
          isTemplate: false,
        })
      })
    })

    it('does not submit with empty title', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      expect(mockOnAddList).not.toHaveBeenCalled()
    })

    it('disables Create button when title is empty', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.getByRole('button', { name: 'Create List' })).toBeDisabled()
    })

    it('enables Create button when title is provided', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'List Name' },
      })

      expect(screen.getByRole('button', { name: 'Create List' })).not.toBeDisabled()
    })

    it('shows Creating... while saving', async () => {
      let resolveCreate: (value: List | null) => void
      mockOnAddList.mockImplementation(
        () => new Promise((resolve) => { resolveCreate = resolve })
      )

      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'List Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      expect(screen.getByText('Creating...')).toBeInTheDocument()

      // Resolve and wait for state update
      resolveCreate!(createMockList({}))
      await waitFor(() => {
        expect(screen.queryByText('Creating...')).not.toBeInTheDocument()
      })
    })

    it('closes form on successful creation', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'List Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("What's the list?")).not.toBeInTheDocument()
      })
    })

    it('keeps form open on failed creation', async () => {
      mockOnAddList.mockResolvedValue(null)

      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'List Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText("What's the list?")).toBeInTheDocument()
      })
    })
  })

  describe('category selection', () => {
    it('shows category buttons in creation form', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      // Should show all category options
      expect(screen.getByRole('button', { name: /Entertainment/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Food & Drink/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Shopping/i })).toBeInTheDocument()
    })

    it('defaults to "other" category', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'Test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(mockOnAddList).toHaveBeenCalledWith({
          title: 'Test',
          category: 'other',
          isTemplate: false,
        })
      })
    })

    it('allows selecting different category', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the list?"), {
        target: { value: 'My Movies' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Entertainment/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Create List' }))

      await waitFor(() => {
        expect(mockOnAddList).toHaveBeenCalledWith({
          title: 'My Movies',
          category: 'entertainment',
          isTemplate: false,
        })
      })
    })
  })

  describe('keyboard interactions', () => {
    it('submits form on Enter key', async () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the list?")
      fireEvent.change(input, { target: { value: 'Enter List' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockOnAddList).toHaveBeenCalledWith({
          title: 'Enter List',
          category: 'other',
          isTemplate: false,
        })
      })
    })

    it('closes form on Escape key', () => {
      render(
        <ListsList
          lists={mockLists}
          listsByCategory={createListsByCategory(mockLists)}
          onSelectList={mockOnSelectList}
          onAddList={mockOnAddList}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the list?")
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.queryByPlaceholderText("What's the list?")).not.toBeInTheDocument()
    })
  })
})
