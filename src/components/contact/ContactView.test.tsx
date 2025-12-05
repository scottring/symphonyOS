import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContactView } from './ContactView'
import { createMockContact, createMockTask } from '@/test/mocks/factories'

describe('ContactView', () => {
  const mockContact = createMockContact({
    id: 'contact-1',
    name: 'John Doe',
    phone: '555-123-4567',
    email: 'john@example.com',
    notes: 'Test notes',
  })

  const mockTask = createMockTask({
    id: 'task-1',
    title: 'Test Task',
    contactId: 'contact-1',
    completed: false,
  })

  const mockCompletedTask = createMockTask({
    id: 'task-2',
    title: 'Completed Task',
    contactId: 'contact-1',
    completed: true,
  })

  const mockOnBack = vi.fn()
  const mockOnUpdate = vi.fn().mockResolvedValue(undefined)
  const mockOnDelete = vi.fn().mockResolvedValue(undefined)
  const mockOnSelectTask = vi.fn()

  const defaultProps = {
    contact: mockContact,
    onBack: mockOnBack,
    onUpdate: mockOnUpdate,
    onDelete: mockOnDelete,
    tasks: [mockTask, mockCompletedTask],
    onSelectTask: mockOnSelectTask,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders contact name', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('renders phone field with value', () => {
      render(<ContactView {...defaultProps} />)

      const phoneInput = screen.getByPlaceholderText('Add phone number')
      expect(phoneInput).toHaveValue('555-123-4567')
    })

    it('renders email field with value', () => {
      render(<ContactView {...defaultProps} />)

      const emailInput = screen.getByPlaceholderText('Add email address')
      expect(emailInput).toHaveValue('john@example.com')
    })

    it('renders notes field with value', () => {
      render(<ContactView {...defaultProps} />)

      const notesInput = screen.getByPlaceholderText('Add notes about this contact...')
      expect(notesInput).toHaveValue('Test notes')
    })

    it('renders Back button', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('renders Contact breadcrumb', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Contact')).toBeInTheDocument()
    })

    it('renders delete button', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByLabelText('Delete contact')).toBeInTheDocument()
    })
  })

  describe('quick actions', () => {
    it('renders Call button when phone is provided', () => {
      render(<ContactView {...defaultProps} />)

      const callLink = screen.getByText('Call').closest('a')
      expect(callLink).toHaveAttribute('href', 'tel:555-123-4567')
    })

    it('renders Text button when phone is provided', () => {
      render(<ContactView {...defaultProps} />)

      const textLink = screen.getByText('Text').closest('a')
      expect(textLink).toHaveAttribute('href', 'sms:555-123-4567')
    })

    it('renders Email button when email is provided', () => {
      render(<ContactView {...defaultProps} />)

      const emailLink = screen.getByRole('link', { name: /Email/i })
      expect(emailLink).toHaveAttribute('href', 'mailto:john@example.com')
    })

    it('does not render Call/Text buttons when no phone', () => {
      const contactWithoutPhone = createMockContact({
        id: 'contact-2',
        name: 'No Phone',
        email: 'test@example.com',
      })

      render(<ContactView {...defaultProps} contact={contactWithoutPhone} />)

      expect(screen.queryByText('Call')).not.toBeInTheDocument()
      expect(screen.queryByText('Text')).not.toBeInTheDocument()
    })

    it('does not render Email button when no email', () => {
      const contactWithoutEmail = createMockContact({
        id: 'contact-3',
        name: 'No Email',
        phone: '555-111-2222',
      })

      render(<ContactView {...defaultProps} contact={contactWithoutEmail} tasks={[]} />)

      // Email quick action button should not be present (but Email section header will be)
      expect(screen.queryByRole('link', { name: /Email/i })).not.toBeInTheDocument()
    })

    it('does not render quick action buttons when neither phone nor email', () => {
      const contactMinimal = createMockContact({
        id: 'contact-4',
        name: 'Minimal Contact',
      })

      render(<ContactView {...defaultProps} contact={contactMinimal} tasks={[]} />)

      // Quick action buttons should not be present
      expect(screen.queryByText('Call')).not.toBeInTheDocument()
      expect(screen.queryByText('Text')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Email/i })).not.toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('calls onBack when Back button is clicked', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('Back'))

      expect(mockOnBack).toHaveBeenCalledTimes(1)
    })
  })

  describe('name editing', () => {
    it('shows input when clicking contact name', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))

      const nameInput = screen.getByDisplayValue('John Doe')
      expect(nameInput.tagName).toBe('INPUT')
    })

    it('saves name on blur with changed value', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      fireEvent.blur(nameInput)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { name: 'Jane Doe' })
    })

    it('saves name on Enter key', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      fireEvent.keyDown(nameInput, { key: 'Enter' })

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { name: 'Jane Doe' })
    })

    it('cancels name edit on Escape key', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      fireEvent.keyDown(nameInput, { key: 'Escape' })

      // Should not have called onUpdate
      expect(mockOnUpdate).not.toHaveBeenCalled()
      // Should show original name
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('does not update when name is unchanged', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.blur(nameInput)

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('does not update when name is empty', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.change(nameInput, { target: { value: '' } })
      fireEvent.blur(nameInput)

      expect(mockOnUpdate).not.toHaveBeenCalled()
    })

    it('trims whitespace from name', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('John Doe'))
      const nameInput = screen.getByDisplayValue('John Doe')

      fireEvent.change(nameInput, { target: { value: '  Jane Doe  ' } })
      fireEvent.blur(nameInput)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { name: 'Jane Doe' })
    })
  })

  describe('phone editing with debounce', () => {
    it('updates phone after debounce delay', async () => {
      render(<ContactView {...defaultProps} />)

      const phoneInput = screen.getByPlaceholderText('Add phone number')
      fireEvent.change(phoneInput, { target: { value: '555-999-8888' } })

      // Should not have been called yet
      expect(mockOnUpdate).not.toHaveBeenCalled()

      // Advance past debounce delay
      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { phone: '555-999-8888' })
    })

    it('clears phone when emptied', async () => {
      render(<ContactView {...defaultProps} />)

      const phoneInput = screen.getByPlaceholderText('Add phone number')
      fireEvent.change(phoneInput, { target: { value: '' } })

      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { phone: undefined })
    })

    it('debounces multiple rapid changes', async () => {
      render(<ContactView {...defaultProps} />)

      const phoneInput = screen.getByPlaceholderText('Add phone number')
      fireEvent.change(phoneInput, { target: { value: '1' } })
      vi.advanceTimersByTime(200)
      fireEvent.change(phoneInput, { target: { value: '12' } })
      vi.advanceTimersByTime(200)
      fireEvent.change(phoneInput, { target: { value: '123' } })

      // Should not have been called yet
      expect(mockOnUpdate).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      // Should only be called once with final value
      expect(mockOnUpdate).toHaveBeenCalledTimes(1)
      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { phone: '123' })
    })
  })

  describe('email editing with debounce', () => {
    it('updates email after debounce delay', async () => {
      render(<ContactView {...defaultProps} />)

      const emailInput = screen.getByPlaceholderText('Add email address')
      fireEvent.change(emailInput, { target: { value: 'newemail@example.com' } })

      expect(mockOnUpdate).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { email: 'newemail@example.com' })
    })

    it('clears email when emptied', async () => {
      render(<ContactView {...defaultProps} />)

      const emailInput = screen.getByPlaceholderText('Add email address')
      fireEvent.change(emailInput, { target: { value: '' } })

      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { email: undefined })
    })
  })

  describe('notes editing with debounce', () => {
    it('updates notes after debounce delay', async () => {
      render(<ContactView {...defaultProps} />)

      const notesInput = screen.getByPlaceholderText('Add notes about this contact...')
      fireEvent.change(notesInput, { target: { value: 'Updated notes' } })

      expect(mockOnUpdate).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { notes: 'Updated notes' })
    })

    it('clears notes when emptied', async () => {
      render(<ContactView {...defaultProps} />)

      const notesInput = screen.getByPlaceholderText('Add notes about this contact...')
      fireEvent.change(notesInput, { target: { value: '' } })

      vi.advanceTimersByTime(500)

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', { notes: undefined })
    })
  })

  describe('linked tasks', () => {
    it('renders linked tasks count', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Linked Tasks (2)')).toBeInTheDocument()
    })

    it('renders linked task titles', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Test Task')).toBeInTheDocument()
      expect(screen.getByText('Completed Task')).toBeInTheDocument()
    })

    it('calls onSelectTask when clicking a task', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByText('Test Task'))

      expect(mockOnSelectTask).toHaveBeenCalledWith('task-1')
    })

    it('shows completed task with strikethrough style', () => {
      render(<ContactView {...defaultProps} />)

      const completedTask = screen.getByText('Completed Task')
      expect(completedTask).toHaveClass('line-through')
    })

    it('shows no tasks message when no linked tasks', () => {
      render(<ContactView {...defaultProps} tasks={[]} />)

      expect(screen.getByText('No tasks linked to this contact')).toBeInTheDocument()
    })

    it('filters tasks to only show linked ones', () => {
      const unlinkedTask = createMockTask({
        id: 'task-3',
        title: 'Unlinked Task',
        contactId: 'different-contact-id',
      })

      render(<ContactView {...defaultProps} tasks={[mockTask, unlinkedTask]} />)

      expect(screen.getByText('Test Task')).toBeInTheDocument()
      expect(screen.queryByText('Unlinked Task')).not.toBeInTheDocument()
    })
  })

  describe('delete functionality', () => {
    it('shows delete confirmation when delete button clicked', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))

      expect(screen.getByText('Are you sure you want to delete this contact?')).toBeInTheDocument()
    })

    it('shows linked tasks warning in delete confirmation', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))

      expect(screen.getByText(/This will unlink 2 tasks./)).toBeInTheDocument()
    })

    it('shows singular task warning when only one linked task', () => {
      render(<ContactView {...defaultProps} tasks={[mockTask]} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))

      expect(screen.getByText(/This will unlink 1 task./)).toBeInTheDocument()
    })

    it('does not show linked tasks warning when no linked tasks', () => {
      render(<ContactView {...defaultProps} tasks={[]} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))

      expect(screen.queryByText(/This will unlink/)).not.toBeInTheDocument()
    })

    it('hides confirmation when Cancel clicked', () => {
      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))
      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.queryByText('Are you sure you want to delete this contact?')).not.toBeInTheDocument()
    })

    it('calls onDelete and onBack when delete confirmed', async () => {
      // Use real timers for this async test
      vi.useRealTimers()

      render(<ContactView {...defaultProps} />)

      fireEvent.click(screen.getByLabelText('Delete contact'))
      fireEvent.click(screen.getByText('Delete Contact'))

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('contact-1')
      })
      expect(mockOnBack).toHaveBeenCalled()

      // Re-enable fake timers for next tests
      vi.useFakeTimers()
    })
  })

  describe('state synchronization', () => {
    it('updates state when contact prop changes', () => {
      const { rerender } = render(<ContactView {...defaultProps} />)

      const updatedContact = createMockContact({
        id: 'contact-1',
        name: 'Updated Name',
        phone: '555-000-0000',
        email: 'updated@example.com',
        notes: 'Updated notes',
      })

      rerender(<ContactView {...defaultProps} contact={updatedContact} />)

      expect(screen.getByText('Updated Name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Add phone number')).toHaveValue('555-000-0000')
      expect(screen.getByPlaceholderText('Add email address')).toHaveValue('updated@example.com')
      expect(screen.getByPlaceholderText('Add notes about this contact...')).toHaveValue('Updated notes')
    })

    it('resets editing state when contact changes', () => {
      const { rerender } = render(<ContactView {...defaultProps} />)

      // Start editing name
      fireEvent.click(screen.getByText('John Doe'))
      expect(screen.getByDisplayValue('John Doe').tagName).toBe('INPUT')

      // Change contact
      const newContact = createMockContact({
        id: 'contact-2',
        name: 'New Contact',
      })
      rerender(<ContactView {...defaultProps} contact={newContact} tasks={[]} />)

      // Should no longer be editing
      expect(screen.getByText('New Contact')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('John Doe')).not.toBeInTheDocument()
    })

    it('resets delete confirmation when contact changes', () => {
      const { rerender } = render(<ContactView {...defaultProps} />)

      // Show delete confirmation
      fireEvent.click(screen.getByLabelText('Delete contact'))
      expect(screen.getByText('Are you sure you want to delete this contact?')).toBeInTheDocument()

      // Change contact
      const newContact = createMockContact({
        id: 'contact-2',
        name: 'New Contact',
      })
      rerender(<ContactView {...defaultProps} contact={newContact} tasks={[]} />)

      // Delete confirmation should be hidden
      expect(screen.queryByText('Are you sure you want to delete this contact?')).not.toBeInTheDocument()
    })

    it('handles contact with undefined optional fields', () => {
      const minimalContact = createMockContact({
        id: 'contact-minimal',
        name: 'Minimal',
        phone: undefined,
        email: undefined,
        notes: undefined,
      })

      render(<ContactView {...defaultProps} contact={minimalContact} tasks={[]} />)

      expect(screen.getByPlaceholderText('Add phone number')).toHaveValue('')
      expect(screen.getByPlaceholderText('Add email address')).toHaveValue('')
      expect(screen.getByPlaceholderText('Add notes about this contact...')).toHaveValue('')
    })
  })

  describe('input field sections', () => {
    it('renders Phone section header', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Phone')).toBeInTheDocument()
    })

    it('renders Email section header', () => {
      render(<ContactView {...defaultProps} />)

      // Note: "Email" appears multiple times (section header + quick action)
      const emailHeaders = screen.getAllByText('Email')
      expect(emailHeaders.length).toBeGreaterThanOrEqual(1)
    })

    it('renders Notes section header', () => {
      render(<ContactView {...defaultProps} />)

      expect(screen.getByText('Notes')).toBeInTheDocument()
    })
  })
})
