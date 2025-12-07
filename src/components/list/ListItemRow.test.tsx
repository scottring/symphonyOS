import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ListItemRow } from './ListItemRow'
import { createMockListItem } from '@/test/mocks/factories'

describe('ListItemRow', () => {
  const mockItem = createMockListItem({
    id: 'item-1',
    listId: 'list-1',
    text: 'The Matrix',
    note: 'Sci-fi classic with Keanu Reeves',
  })

  const defaultProps = {
    item: mockItem,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders item text', () => {
      render(<ListItemRow {...defaultProps} />)

      expect(screen.getByText('The Matrix')).toBeInTheDocument()
    })

    it('renders view note button when item has a note', () => {
      render(<ListItemRow {...defaultProps} />)

      expect(screen.getByText('View note')).toBeInTheDocument()
    })

    it('does not render view note button when item has no note', () => {
      const itemWithoutNote = createMockListItem({ text: 'Simple Item' })
      render(<ListItemRow {...defaultProps} item={itemWithoutNote} />)

      expect(screen.queryByText('View note')).not.toBeInTheDocument()
    })

    it('renders edit button when onUpdate provided', () => {
      render(<ListItemRow {...defaultProps} />)

      expect(screen.getByLabelText('Edit item')).toBeInTheDocument()
    })

    it('does not render edit button when onUpdate not provided', () => {
      render(<ListItemRow {...defaultProps} onUpdate={undefined} />)

      expect(screen.queryByLabelText('Edit item')).not.toBeInTheDocument()
    })

    it('renders delete button when onDelete provided', () => {
      render(<ListItemRow {...defaultProps} />)

      expect(screen.getByLabelText('Delete item')).toBeInTheDocument()
    })

    it('does not render delete button when onDelete not provided', () => {
      render(<ListItemRow {...defaultProps} onDelete={undefined} />)

      expect(screen.queryByLabelText('Delete item')).not.toBeInTheDocument()
    })

    it('renders bullet point indicator', () => {
      const { container } = render(<ListItemRow {...defaultProps} />)

      const bullet = container.querySelector('.bg-purple-300')
      expect(bullet).toBeInTheDocument()
    })
  })

  describe('note toggle', () => {
    it('shows note content when View note is clicked', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByText('View note'))

      expect(screen.getByText('Sci-fi classic with Keanu Reeves')).toBeInTheDocument()
    })

    it('changes button text to Hide note when note is visible', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByText('View note'))

      expect(screen.getByText('Hide note')).toBeInTheDocument()
    })

    it('hides note content when Hide note is clicked', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByText('View note'))
      expect(screen.getByText('Sci-fi classic with Keanu Reeves')).toBeInTheDocument()

      await user.click(screen.getByText('Hide note'))
      expect(screen.queryByText('Sci-fi classic with Keanu Reeves')).not.toBeInTheDocument()
    })
  })

  describe('editing', () => {
    it('shows edit form when edit button is clicked', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit item'))

      expect(screen.getByDisplayValue('The Matrix')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Add a note...')).toBeInTheDocument()
    })

    it('pre-fills edit form with current item values', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit item'))

      expect(screen.getByDisplayValue('The Matrix')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Sci-fi classic with Keanu Reeves')).toBeInTheDocument()
    })

    it('calls onUpdate when Save is clicked with valid text', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      await user.clear(textInput)
      await user.type(textInput, 'The Matrix Reloaded')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdate).toHaveBeenCalledWith({
        text: 'The Matrix Reloaded',
        note: 'Sci-fi classic with Keanu Reeves',
      })
    })

    it('closes edit form when Cancel is clicked', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit item'))
      expect(screen.getByDisplayValue('The Matrix')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByDisplayValue('The Matrix')).not.toBeInTheDocument()
      expect(screen.getByText('The Matrix')).toBeInTheDocument()
    })

    it('disables Save button when text is empty', async () => {
      const { user } = render(<ListItemRow {...defaultProps} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      await user.clear(textInput)

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('can update note content', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const noteInput = screen.getByDisplayValue('Sci-fi classic with Keanu Reeves')
      await user.clear(noteInput)
      await user.type(noteInput, 'Updated note')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdate).toHaveBeenCalledWith({
        text: 'The Matrix',
        note: 'Updated note',
      })
    })

    it('clears note when note field is emptied', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const noteInput = screen.getByDisplayValue('Sci-fi classic with Keanu Reeves')
      await user.clear(noteInput)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdate).toHaveBeenCalledWith({
        text: 'The Matrix',
        note: undefined,
      })
    })

    it('can add note to item without one', async () => {
      const itemWithoutNote = createMockListItem({ id: 'item-1', text: 'Simple Item' })
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow item={itemWithoutNote} onUpdate={onUpdate} onDelete={vi.fn()} />)

      await user.click(screen.getByLabelText('Edit item'))

      const noteInput = screen.getByPlaceholderText('Add a note...')
      await user.type(noteInput, 'New note added')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdate).toHaveBeenCalledWith({
        text: 'Simple Item',
        note: 'New note added',
      })
    })
  })

  describe('keyboard shortcuts', () => {
    it('saves on Enter key in text input', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      await user.clear(textInput)
      await user.type(textInput, 'New Title{Enter}')

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        text: 'New Title',
      }))
    })

    it('cancels on Escape key in text input', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      fireEvent.keyDown(textInput, { key: 'Escape' })

      expect(screen.queryByDisplayValue('The Matrix')).not.toBeInTheDocument()
      expect(screen.getByText('The Matrix')).toBeInTheDocument()
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('does not save on Shift+Enter (allows newline in note)', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      fireEvent.keyDown(textInput, { key: 'Enter', shiftKey: true })

      // Should not save - still in edit mode
      expect(screen.getByDisplayValue('The Matrix')).toBeInTheDocument()
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleting', () => {
    it('calls onDelete when delete button is clicked', async () => {
      const onDelete = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onDelete={onDelete} />)

      await user.click(screen.getByLabelText('Delete item'))

      expect(onDelete).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('handles item with empty note string', () => {
      const itemWithEmptyNote = createMockListItem({ text: 'Test', note: '' })
      render(<ListItemRow {...defaultProps} item={itemWithEmptyNote} />)

      // Empty string note should not show View note button
      expect(screen.queryByText('View note')).not.toBeInTheDocument()
    })

    it('trims whitespace from text when saving', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      await user.clear(textInput)
      await user.type(textInput, '  Trimmed Text  ')

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Trimmed Text',
      }))
    })

    it('does not call onUpdate with only whitespace text', async () => {
      const onUpdate = vi.fn()
      const { user } = render(<ListItemRow {...defaultProps} onUpdate={onUpdate} />)

      await user.click(screen.getByLabelText('Edit item'))

      const textInput = screen.getByDisplayValue('The Matrix')
      await user.clear(textInput)
      await user.type(textInput, '   ')

      // Save button should be disabled
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })
  })
})
