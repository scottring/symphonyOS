import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { ListView } from './ListView'
import { createMockList, createMockListItem } from '@/test/mocks/factories'
import type { ListItem } from '@/types/list'

describe('ListView', () => {
  const mockList = createMockList({
    id: 'list-1',
    title: 'Movies to Watch',
    icon: '🎬',
    category: 'entertainment',
    visibility: 'self',
  })

  const mockItems: ListItem[] = [
    createMockListItem({ id: 'item-1', listId: 'list-1', text: 'The Matrix', note: 'Sci-fi classic' }),
    createMockListItem({ id: 'item-2', listId: 'list-1', text: 'Inception' }),
  ]

  const defaultProps = {
    list: mockList,
    items: mockItems,
    onBack: vi.fn(),
    onUpdateList: vi.fn(),
    onDeleteList: vi.fn(),
    onAddItem: vi.fn().mockResolvedValue(null),
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onReorderItems: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders list title and icon', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('Movies to Watch')).toBeInTheDocument()
      expect(screen.getByText('🎬')).toBeInTheDocument()
    })

    it('renders category badge', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('Entertainment')).toBeInTheDocument()
    })

    it('renders item count', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('2 items')).toBeInTheDocument()
    })

    it('renders singular item text for one item', () => {
      render(<ListView {...defaultProps} items={[mockItems[0]]} />)

      expect(screen.getByText('1 item')).toBeInTheDocument()
    })

    it('renders shared badge when visibility is family', () => {
      const familyList = createMockList({
        ...mockList,
        visibility: 'family',
      })
      render(<ListView {...defaultProps} list={familyList} />)

      expect(screen.getByText('Shared')).toBeInTheDocument()
    })

    it('does not render shared badge when visibility is self', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.queryByText('Shared')).not.toBeInTheDocument()
    })

    it('renders Back button', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('renders all items', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('The Matrix')).toBeInTheDocument()
      expect(screen.getByText('Inception')).toBeInTheDocument()
    })

    it('renders add item input when onAddItem provided', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByPlaceholderText('Add an item...')).toBeInTheDocument()
    })

    it('does not render add item input when onAddItem not provided', () => {
      render(<ListView {...defaultProps} onAddItem={undefined} />)

      expect(screen.queryByPlaceholderText('Add an item...')).not.toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty state message when no items', () => {
      render(<ListView {...defaultProps} items={[]} />)

      expect(screen.getByText('No items yet')).toBeInTheDocument()
      expect(screen.getByText('Add an item above to get started')).toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('calls onBack when Back button is clicked', async () => {
      const onBack = vi.fn()
      const { user } = render(<ListView {...defaultProps} onBack={onBack} />)

      await user.click(screen.getByText('Back'))

      expect(onBack).toHaveBeenCalled()
    })
  })

  describe('editing list', () => {
    it('shows edit form when edit button is clicked', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit list'))

      // Check for form labels (labels without for attribute)
      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Icon')).toBeInTheDocument()
      expect(screen.getByText('Category')).toBeInTheDocument()
      expect(screen.getByText('Visibility')).toBeInTheDocument()
    })

    it('pre-fills edit form with current list values', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit list'))

      expect(screen.getByDisplayValue('Movies to Watch')).toBeInTheDocument()
      expect(screen.getByDisplayValue('🎬')).toBeInTheDocument()
    })

    it('calls onUpdateList when Save is clicked with valid title', async () => {
      const onUpdateList = vi.fn()
      const { user } = render(<ListView {...defaultProps} onUpdateList={onUpdateList} />)

      await user.click(screen.getByLabelText('Edit list'))

      const titleInput = screen.getByDisplayValue('Movies to Watch')
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
        title: 'Updated Title',
      }))
    })

    it('closes edit form when Cancel is clicked', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit list'))
      expect(screen.getByText('Title')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Check that form label is no longer present (form closed)
      expect(screen.queryByText('Visibility')).not.toBeInTheDocument()
    })

    it('can change category in edit mode', async () => {
      const onUpdateList = vi.fn()
      const { user } = render(<ListView {...defaultProps} onUpdateList={onUpdateList} />)

      await user.click(screen.getByLabelText('Edit list'))
      await user.click(screen.getByText(/Travel/i))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
        category: 'travel',
      }))
    })

    it('can change visibility in edit mode', async () => {
      const onUpdateList = vi.fn()
      const { user } = render(<ListView {...defaultProps} onUpdateList={onUpdateList} />)

      await user.click(screen.getByLabelText('Edit list'))
      await user.click(screen.getByText('Shared with Family'))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
        visibility: 'family',
      }))
    })

    it('disables Save button when title is empty', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit list'))

      const titleInput = screen.getByDisplayValue('Movies to Watch')
      await user.clear(titleInput)

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })
  })

  describe('deleting list', () => {
    it('shows delete confirmation when delete button is clicked', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Delete list'))

      expect(screen.getByText(/Are you sure you want to delete this list/i)).toBeInTheDocument()
    })

    it('calls onDeleteList and onBack when confirmed', async () => {
      const onDeleteList = vi.fn()
      const onBack = vi.fn()
      const { user } = render(<ListView {...defaultProps} onDeleteList={onDeleteList} onBack={onBack} />)

      await user.click(screen.getByLabelText('Delete list'))
      await user.click(screen.getByRole('button', { name: 'Delete List' }))

      expect(onDeleteList).toHaveBeenCalledWith('list-1')
      expect(onBack).toHaveBeenCalled()
    })

    it('closes delete confirmation when Cancel is clicked', async () => {
      const { user } = render(<ListView {...defaultProps} />)

      await user.click(screen.getByLabelText('Delete list'))
      expect(screen.getByText(/Are you sure you want to delete this list/i)).toBeInTheDocument()

      // Click the Cancel button in the delete confirmation (not the edit Cancel)
      const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
      await user.click(cancelButtons[cancelButtons.length - 1])

      expect(screen.queryByText(/Are you sure you want to delete this list/i)).not.toBeInTheDocument()
    })

    it('does not render delete button when onDeleteList not provided', () => {
      render(<ListView {...defaultProps} onDeleteList={undefined} />)

      expect(screen.queryByLabelText('Delete list')).not.toBeInTheDocument()
    })
  })

  describe('adding items', () => {
    it('calls onAddItem when form is submitted', async () => {
      const onAddItem = vi.fn().mockResolvedValue(null)
      const { user } = render(<ListView {...defaultProps} onAddItem={onAddItem} />)

      const input = screen.getByPlaceholderText('Add an item...')
      await user.type(input, 'New Movie')

      // The Add button should appear
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onAddItem).toHaveBeenCalledWith({ text: 'New Movie' })
    })

    it('clears input after successful add', async () => {
      const onAddItem = vi.fn().mockResolvedValue(createMockListItem({ text: 'New Movie' }))
      const { user } = render(<ListView {...defaultProps} onAddItem={onAddItem} />)

      const input = screen.getByPlaceholderText('Add an item...')
      await user.type(input, 'New Movie')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    it('does not show Add button when input is empty', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    })

    it('does not call onAddItem when input is only whitespace', async () => {
      const onAddItem = vi.fn()
      const { user } = render(<ListView {...defaultProps} onAddItem={onAddItem} />)

      const input = screen.getByPlaceholderText('Add an item...')
      await user.type(input, '   ')

      // Add button should not appear for whitespace-only input
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    })

    it('can submit with Enter key', async () => {
      const onAddItem = vi.fn().mockResolvedValue(null)
      const { user } = render(<ListView {...defaultProps} onAddItem={onAddItem} />)

      const input = screen.getByPlaceholderText('Add an item...')
      await user.type(input, 'New Movie{Enter}')

      expect(onAddItem).toHaveBeenCalledWith({ text: 'New Movie' })
    })
  })

  describe('item rendering', () => {
    it('renders ListItemRow for each item', () => {
      render(<ListView {...defaultProps} />)

      expect(screen.getByText('The Matrix')).toBeInTheDocument()
      expect(screen.getByText('Inception')).toBeInTheDocument()
    })

    it('passes update handler to ListItemRow', async () => {
      const onUpdateItem = vi.fn()
      const { user } = render(<ListView {...defaultProps} onUpdateItem={onUpdateItem} />)

      // Click edit on an item (need to hover first to show buttons)
      const editButtons = screen.getAllByLabelText('Edit item')
      await user.click(editButtons[0])

      // Change text and save
      const input = screen.getByDisplayValue('The Matrix')
      await user.clear(input)
      await user.type(input, 'The Matrix Reloaded')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdateItem).toHaveBeenCalledWith('item-1', expect.objectContaining({
        text: 'The Matrix Reloaded',
      }))
    })

    it('passes delete handler to ListItemRow', async () => {
      const onDeleteItem = vi.fn()
      const { user } = render(<ListView {...defaultProps} onDeleteItem={onDeleteItem} />)

      const deleteButtons = screen.getAllByLabelText('Delete item')
      await user.click(deleteButtons[0])

      expect(onDeleteItem).toHaveBeenCalledWith('item-1')
    })
  })

  describe('category icons', () => {
    it('uses category icon when no custom icon provided', () => {
      const listWithoutIcon = createMockList({
        id: 'list-1',
        title: 'Test List',
        icon: undefined,
        category: 'entertainment',
      })
      render(<ListView {...defaultProps} list={listWithoutIcon} />)

      // Should display the entertainment category icon
      expect(screen.getByText('🎬')).toBeInTheDocument()
    })

    it('uses custom icon when provided', () => {
      const listWithIcon = createMockList({
        id: 'list-1',
        title: 'Test List',
        icon: '⭐',
        category: 'entertainment',
      })
      render(<ListView {...defaultProps} list={listWithIcon} />)

      expect(screen.getByText('⭐')).toBeInTheDocument()
    })
  })
})
