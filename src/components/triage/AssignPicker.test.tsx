import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AssignPicker } from './AssignPicker'
import { createMockContact } from '@/test/mocks/factories'

describe('AssignPicker', () => {
  const mockOnChange = vi.fn()
  const mockOnSearchContacts = vi.fn()
  const mockOnAddContact = vi.fn()

  const mockContacts = [
    createMockContact({ id: 'contact-1', name: 'Alice Johnson' }),
    createMockContact({ id: 'contact-2', name: 'Bob Smith' }),
    createMockContact({ id: 'contact-3', name: 'Charlie Brown' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSearchContacts.mockImplementation((query: string) =>
      mockContacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      )
    )
    mockOnAddContact.mockResolvedValue(null)
  })

  describe('initial render', () => {
    it('renders trigger button with person icon', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      expect(screen.getByRole('button', { name: 'Assign to' })).toBeInTheDocument()
    })

    it('applies inactive styling when no value is set', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Assign to' })
      expect(button).toHaveClass('text-neutral-400')
    })

    it('applies active styling when value is set', () => {
      render(
        <AssignPicker
          value="contact-1"
          contacts={mockContacts}
          onChange={mockOnChange}
        />
      )

      const button = screen.getByRole('button', { name: 'Assign to' })
      expect(button).toHaveClass('text-primary-600')
    })

    it('does not show dropdown initially', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      expect(screen.queryByPlaceholderText('Search contacts...')).not.toBeInTheDocument()
    })
  })

  describe('opening dropdown', () => {
    it('shows search input when clicked', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()
    })

    it('shows first 5 contacts by default', () => {
      const manyContacts = Array.from({ length: 10 }, (_, i) =>
        createMockContact({ id: `contact-${i}`, name: `Contact ${i}` })
      )

      render(<AssignPicker contacts={manyContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      // Should only show first 5
      expect(screen.getByText('Contact 0')).toBeInTheDocument()
      expect(screen.getByText('Contact 4')).toBeInTheDocument()
      expect(screen.queryByText('Contact 5')).not.toBeInTheDocument()
    })

    it('focuses search input on open', async () => {
      vi.useRealTimers()
      const user = userEvent.setup()

      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      await user.click(screen.getByRole('button', { name: 'Assign to' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search contacts...')).toHaveFocus()
      })
    })

    it('toggles dropdown on button click', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      const button = screen.getByRole('button', { name: 'Assign to' })

      // First click opens
      fireEvent.click(button)
      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()

      // Second click closes
      fireEvent.click(button)
      expect(screen.queryByPlaceholderText('Search contacts...')).not.toBeInTheDocument()
    })

    it('does not show Clear option when no value is set', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('shows Clear option when value is set', () => {
      render(
        <AssignPicker
          value="contact-1"
          contacts={mockContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })
  })

  describe('contact selection', () => {
    it('displays contacts with avatar and name', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
      expect(screen.getByText('A')).toBeInTheDocument() // Avatar initial
    })

    it('calls onChange when selecting a contact', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.click(screen.getByText('Alice Johnson'))

      expect(mockOnChange).toHaveBeenCalledWith('contact-1')
    })

    it('closes dropdown after selecting contact', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.click(screen.getByText('Alice Johnson'))

      expect(screen.queryByPlaceholderText('Search contacts...')).not.toBeInTheDocument()
    })

    it('highlights currently selected contact', () => {
      render(
        <AssignPicker
          value="contact-1"
          contacts={mockContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      const aliceButton = screen.getByText('Alice Johnson').closest('button')
      expect(aliceButton).toHaveClass('bg-primary-50')
    })
  })

  describe('search functionality', () => {
    it('filters contacts using onSearchContacts', () => {
      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'alice' },
      })

      expect(mockOnSearchContacts).toHaveBeenCalledWith('alice')
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument()
    })

    it('shows "No contacts found" when search has no results', () => {
      mockOnSearchContacts.mockReturnValue([])

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'xyz' },
      })

      expect(screen.getByText('No contacts found')).toBeInTheDocument()
    })

    it('shows "No contacts yet" when contacts list is empty and no search', () => {
      render(<AssignPicker contacts={[]} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByText('No contacts yet')).toBeInTheDocument()
    })

    it('clears search query when closing', () => {
      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'alice' },
      })
      fireEvent.click(screen.getByText('Alice Johnson'))

      // Reopen
      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByPlaceholderText('Search contacts...')).toHaveValue('')
    })
  })

  describe('add contact functionality', () => {
    it('shows add contact option when search has no results and onAddContact provided', () => {
      mockOnSearchContacts.mockReturnValue([])

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onAddContact={mockOnAddContact}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'New Person' },
      })

      expect(screen.getByText('Add "New Person"')).toBeInTheDocument()
    })

    it('calls onAddContact when clicking add button', async () => {
      mockOnSearchContacts.mockReturnValue([])
      mockOnAddContact.mockResolvedValue(
        createMockContact({ id: 'new-contact', name: 'New Person' })
      )

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onAddContact={mockOnAddContact}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'New Person' },
      })
      fireEvent.click(screen.getByText('Add "New Person"'))

      await waitFor(() => {
        expect(mockOnAddContact).toHaveBeenCalledWith('New Person')
      })
    })

    it('selects newly added contact on success', async () => {
      mockOnSearchContacts.mockReturnValue([])
      const newContact = createMockContact({ id: 'new-contact', name: 'New Person' })
      mockOnAddContact.mockResolvedValue(newContact)

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onAddContact={mockOnAddContact}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'New Person' },
      })
      fireEvent.click(screen.getByText('Add "New Person"'))

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('new-contact')
      })
    })

    it('shows "Adding..." while adding contact', async () => {
      mockOnSearchContacts.mockReturnValue([])
      let resolveAdd: (value: unknown) => void
      mockOnAddContact.mockImplementation(
        () => new Promise((resolve) => { resolveAdd = resolve })
      )

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onAddContact={mockOnAddContact}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'New Person' },
      })
      fireEvent.click(screen.getByText('Add "New Person"'))

      expect(screen.getByText('Adding...')).toBeInTheDocument()

      // Resolve the promise and wait for state update to complete
      resolveAdd!(createMockContact({ id: 'new', name: 'New Person' }))
      await waitFor(() => {
        expect(screen.queryByText('Adding...')).not.toBeInTheDocument()
      })
    })

    it('does not show add option without onAddContact prop', () => {
      mockOnSearchContacts.mockReturnValue([])

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: 'New Person' },
      })

      expect(screen.queryByText(/Add "/)).not.toBeInTheDocument()
      expect(screen.getByText('No contacts found')).toBeInTheDocument()
    })

    it('does not call onAddContact with empty search query', () => {
      mockOnSearchContacts.mockReturnValue([])

      render(
        <AssignPicker
          contacts={mockContacts}
          onSearchContacts={mockOnSearchContacts}
          onAddContact={mockOnAddContact}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
        target: { value: '   ' }, // Whitespace only
      })

      // Add button should not appear for whitespace-only input
      expect(screen.queryByText(/Add "/)).not.toBeInTheDocument()
    })
  })

  describe('clear functionality', () => {
    it('calls onChange with undefined when clearing', () => {
      render(
        <AssignPicker
          value="contact-1"
          contacts={mockContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(mockOnChange).toHaveBeenCalledWith(undefined)
    })

    it('closes dropdown after clearing', () => {
      render(
        <AssignPicker
          value="contact-1"
          contacts={mockContacts}
          onChange={mockOnChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))
      fireEvent.click(screen.getByText('Clear'))

      expect(screen.queryByPlaceholderText('Search contacts...')).not.toBeInTheDocument()
    })
  })

  describe('outside click behavior', () => {
    it('closes dropdown on outside click', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <AssignPicker contacts={mockContacts} onChange={mockOnChange} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: 'Assign to' }))
      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()

      await user.click(screen.getByTestId('outside'))

      expect(screen.queryByPlaceholderText('Search contacts...')).not.toBeInTheDocument()
    })

    it('clears search query on outside click', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <AssignPicker
            contacts={mockContacts}
            onSearchContacts={mockOnSearchContacts}
            onChange={mockOnChange}
          />
        </div>
      )

      await user.click(screen.getByRole('button', { name: 'Assign to' }))
      await user.type(screen.getByPlaceholderText('Search contacts...'), 'alice')
      await user.click(screen.getByTestId('outside'))

      // Reopen and verify search is cleared
      await user.click(screen.getByRole('button', { name: 'Assign to' }))
      expect(screen.getByPlaceholderText('Search contacts...')).toHaveValue('')
    })
  })

  describe('avatar display', () => {
    it('shows first letter of contact name as avatar', () => {
      render(<AssignPicker contacts={mockContacts} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      // Check avatars show first letter
      expect(screen.getByText('A')).toBeInTheDocument() // Alice
      expect(screen.getByText('B')).toBeInTheDocument() // Bob
      expect(screen.getByText('C')).toBeInTheDocument() // Charlie
    })

    it('capitalizes avatar letter', () => {
      const lowercaseContact = createMockContact({ id: 'lower', name: 'alice' })
      render(<AssignPicker contacts={[lowercaseContact]} onChange={mockOnChange} />)

      fireEvent.click(screen.getByRole('button', { name: 'Assign to' }))

      expect(screen.getByText('A')).toBeInTheDocument()
    })
  })
})
