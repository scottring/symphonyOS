import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskDetail } from './TaskDetail'
import { createMockTask } from '@/test/mocks/factories'

describe('TaskDetail', () => {
  const mockOnUpdate = vi.fn()

  const mockTask = createMockTask({
    id: 'task-1',
    title: 'Test task',
    notes: undefined,
    phoneNumber: undefined,
    links: undefined,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders notes section', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('Notes')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Add notes...')).toBeInTheDocument()
    })

    it('renders phone number section', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('Phone Number')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Add phone number...')).toBeInTheDocument()
    })

    it('renders links section', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('Links')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('URL (e.g., https://example.com)')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Title (optional)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    it('displays existing notes', () => {
      const taskWithNotes = createMockTask({ ...mockTask, notes: 'These are my notes' })
      render(<TaskDetail task={taskWithNotes} onUpdate={mockOnUpdate} />)

      expect(screen.getByDisplayValue('These are my notes')).toBeInTheDocument()
    })

    it('displays existing phone number', () => {
      const taskWithPhone = createMockTask({ ...mockTask, phoneNumber: '555-123-4567' })
      render(<TaskDetail task={taskWithPhone} onUpdate={mockOnUpdate} />)

      expect(screen.getByDisplayValue('555-123-4567')).toBeInTheDocument()
    })

    it('displays existing links', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [
          { url: 'https://example.com' },
          { url: 'https://test.com', title: 'Test Link' },
        ],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('example.com')).toBeInTheDocument()
      expect(screen.getByText('Test Link')).toBeInTheDocument()
    })
  })

  describe('notes editing', () => {
    it('calls onUpdate when notes change', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('Add notes...'), {
        target: { value: 'New notes content' },
      })

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', { notes: 'New notes content' })
    })

    it('calls onUpdate with undefined when notes are cleared', () => {
      const taskWithNotes = createMockTask({ ...mockTask, notes: 'Some notes' })
      render(<TaskDetail task={taskWithNotes} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByDisplayValue('Some notes'), {
        target: { value: '' },
      })

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', { notes: undefined })
    })
  })

  describe('phone number editing', () => {
    it('calls onUpdate when phone number changes', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('Add phone number...'), {
        target: { value: '555-987-6543' },
      })

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', { phoneNumber: '555-987-6543' })
    })

    it('calls onUpdate with undefined when phone number is cleared', () => {
      const taskWithPhone = createMockTask({ ...mockTask, phoneNumber: '555-123-4567' })
      render(<TaskDetail task={taskWithPhone} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByDisplayValue('555-123-4567'), {
        target: { value: '' },
      })

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', { phoneNumber: undefined })
    })
  })

  describe('adding links', () => {
    it('adds a link when form is submitted with URL', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('URL (e.g., https://example.com)'), {
        target: { value: 'https://newlink.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', {
        links: [{ url: 'https://newlink.com' }],
      })
    })

    it('adds a link with title when both are provided', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('URL (e.g., https://example.com)'), {
        target: { value: 'https://newlink.com' },
      })
      fireEvent.change(screen.getByPlaceholderText('Title (optional)'), {
        target: { value: 'My New Link' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', {
        links: [{ url: 'https://newlink.com', title: 'My New Link' }],
      })
    })

    it('clears form inputs after adding link', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      const urlInput = screen.getByPlaceholderText('URL (e.g., https://example.com)') as HTMLInputElement
      const titleInput = screen.getByPlaceholderText('Title (optional)') as HTMLInputElement

      fireEvent.change(urlInput, { target: { value: 'https://newlink.com' } })
      fireEvent.change(titleInput, { target: { value: 'Title' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(urlInput.value).toBe('')
      expect(titleInput.value).toBe('')
    })

    it('does not add link with empty URL', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('does not add link with whitespace-only URL', () => {
      render(<TaskDetail task={mockTask} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('URL (e.g., https://example.com)'), {
        target: { value: '   ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('does not add duplicate links', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://existing.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('URL (e.g., https://example.com)'), {
        target: { value: 'https://existing.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('appends new link to existing links', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://existing.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      fireEvent.change(screen.getByPlaceholderText('URL (e.g., https://example.com)'), {
        target: { value: 'https://newlink.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', {
        links: [{ url: 'https://existing.com' }, { url: 'https://newlink.com' }],
      })
    })
  })

  describe('removing links', () => {
    it('removes a link when remove button is clicked', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [
          { url: 'https://link1.com' },
          { url: 'https://link2.com' },
        ],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      const removeButtons = screen.getAllByLabelText('Remove link')
      fireEvent.click(removeButtons[0])

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', {
        links: [{ url: 'https://link2.com' }],
      })
    })

    it('sets links to undefined when last link is removed', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://only-link.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Remove link'))

      expect(mockOnUpdate).toHaveBeenCalledWith('task-1', { links: undefined })
    })
  })

  describe('link display', () => {
    it('displays link URL as text when no title', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://example.com/path/to/page' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('example.com')).toBeInTheDocument()
    })

    it('displays link title when available', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://example.com', title: 'Example Site' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      expect(screen.getByText('Example Site')).toBeInTheDocument()
    })

    it('link has correct href with http prefix', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://example.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      const link = screen.getByRole('link', { name: 'example.com' })
      expect(link).toHaveAttribute('href', 'https://example.com')
    })

    it('link adds https prefix when missing', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'example.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      const link = screen.getByRole('link', { name: 'example.com' })
      expect(link).toHaveAttribute('href', 'https://example.com')
    })

    it('link opens in new tab', () => {
      const taskWithLinks = createMockTask({
        ...mockTask,
        links: [{ url: 'https://example.com' }],
      })
      render(<TaskDetail task={taskWithLinks} onUpdate={mockOnUpdate} />)

      const link = screen.getByRole('link', { name: 'example.com' })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })
})
