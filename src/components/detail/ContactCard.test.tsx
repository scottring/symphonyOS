import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactCard } from './ContactCard'
import { createMockContact } from '@/test/mocks/factories'

describe('ContactCard', () => {
  const mockOnUnlink = vi.fn()
  const mockOnUpdate = vi.fn()
  const mockOnOpenContact = vi.fn()

  const mockContact = createMockContact({
    id: 'contact-1',
    name: 'John Doe',
    phone: '555-123-4567',
    email: 'john@example.com',
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders contact name', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('renders contact phone when provided', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.getByText('555-123-4567')).toBeInTheDocument()
    })

    it('renders contact email when provided', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })

    it('does not show phone when not provided', () => {
      const contactWithoutPhone = createMockContact({
        ...mockContact,
        phone: undefined,
      })
      render(<ContactCard contact={contactWithoutPhone} />)

      expect(screen.queryByText('555-123-4567')).not.toBeInTheDocument()
    })

    it('does not show email when not provided', () => {
      const contactWithoutEmail = createMockContact({
        ...mockContact,
        email: undefined,
      })
      render(<ContactCard contact={contactWithoutEmail} />)

      expect(screen.queryByText('john@example.com')).not.toBeInTheDocument()
    })

    it('renders avatar icon', () => {
      render(<ContactCard contact={mockContact} />)

      // Look for the SVG within the avatar button
      const avatarButton = screen.getAllByRole('button')[0]
      expect(avatarButton.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('call and text buttons', () => {
    it('shows call button when phone is present', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.getByRole('button', { name: /call/i })).toBeInTheDocument()
    })

    it('shows text button when phone is present', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.getByRole('button', { name: /text/i })).toBeInTheDocument()
    })

    it('does not show call/text buttons when no phone', () => {
      const contactWithoutPhone = createMockContact({
        ...mockContact,
        phone: undefined,
      })
      render(<ContactCard contact={contactWithoutPhone} />)

      expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /text/i })).not.toBeInTheDocument()
    })

    it('calls tel: link when clicking call button', () => {
      const originalLocation = window.location
      // @ts-expect-error - mocking location
      delete window.location
      window.location = { ...originalLocation, href: '' }

      render(<ContactCard contact={mockContact} />)

      fireEvent.click(screen.getByRole('button', { name: /call/i }))

      expect(window.location.href).toBe('tel:555-123-4567')

      window.location = originalLocation
    })

    it('calls sms: link when clicking text button', () => {
      const originalLocation = window.location
      // @ts-expect-error - mocking location
      delete window.location
      window.location = { ...originalLocation, href: '' }

      render(<ContactCard contact={mockContact} />)

      fireEvent.click(screen.getByRole('button', { name: /text/i }))

      expect(window.location.href).toBe('sms:555-123-4567')

      window.location = originalLocation
    })
  })

  describe('unlink button', () => {
    it('shows unlink button when onUnlink is provided', () => {
      render(<ContactCard contact={mockContact} onUnlink={mockOnUnlink} />)

      expect(screen.getByLabelText('Unlink contact')).toBeInTheDocument()
    })

    it('does not show unlink button when onUnlink is not provided', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.queryByLabelText('Unlink contact')).not.toBeInTheDocument()
    })

    it('calls onUnlink when clicking unlink button', () => {
      render(<ContactCard contact={mockContact} onUnlink={mockOnUnlink} />)

      fireEvent.click(screen.getByLabelText('Unlink contact'))

      expect(mockOnUnlink).toHaveBeenCalled()
    })
  })

  describe('edit functionality', () => {
    it('shows edit button when onUpdate is provided', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      expect(screen.getByLabelText('Edit contact')).toBeInTheDocument()
    })

    it('does not show edit button when onUpdate is not provided', () => {
      render(<ContactCard contact={mockContact} />)

      expect(screen.queryByLabelText('Edit contact')).not.toBeInTheDocument()
    })

    it('enters edit mode when clicking edit button', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))

      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
      expect(screen.getByDisplayValue('555-123-4567')).toBeInTheDocument()
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument()
    })

    it('shows edit form labels', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Phone (optional)')).toBeInTheDocument()
      expect(screen.getByText('Email (optional)')).toBeInTheDocument()
    })

    it('shows Cancel and Save buttons in edit mode', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('cancels edit mode when clicking Cancel', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should be back to view mode showing the name
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('clears form state when canceling', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('John Doe'), {
        target: { value: 'Changed Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Re-enter edit mode
      fireEvent.click(screen.getByLabelText('Edit contact'))
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument()
    })

    it('calls onUpdate when saving', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('John Doe'), {
        target: { value: 'Jane Doe' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', {
        name: 'Jane Doe',
        phone: '555-123-4567',
        email: 'john@example.com',
      })
    })

    it('trims whitespace when saving', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('John Doe'), {
        target: { value: '  Trimmed Name  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', expect.objectContaining({
        name: 'Trimmed Name',
      }))
    })

    it('sets phone to undefined when cleared', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('555-123-4567'), {
        target: { value: '' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', expect.objectContaining({
        phone: undefined,
      }))
    })

    it('sets email to undefined when cleared', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('john@example.com'), {
        target: { value: '' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('contact-1', expect.objectContaining({
        email: undefined,
      }))
    })

    it('disables Save button when name is empty', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('John Doe'), {
        target: { value: '' },
      })

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('disables Save button when name is whitespace only', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.change(screen.getByDisplayValue('John Doe'), {
        target: { value: '   ' },
      })

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('exits edit mode after saving', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      // Should be back to view mode
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })
  })

  describe('open contact functionality', () => {
    it('calls onOpenContact when clicking avatar', () => {
      render(<ContactCard contact={mockContact} onOpenContact={mockOnOpenContact} />)

      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons[0]) // Avatar button

      expect(mockOnOpenContact).toHaveBeenCalledWith('contact-1')
    })

    it('calls onOpenContact when clicking name area', () => {
      render(<ContactCard contact={mockContact} onOpenContact={mockOnOpenContact} />)

      fireEvent.click(screen.getByText('John Doe'))

      expect(mockOnOpenContact).toHaveBeenCalledWith('contact-1')
    })

    it('applies link styling to name when onOpenContact is provided', () => {
      render(<ContactCard contact={mockContact} onOpenContact={mockOnOpenContact} />)

      const nameElement = screen.getByText('John Doe')
      expect(nameElement).toHaveClass('text-primary-600')
    })

    it('applies neutral styling to name when onOpenContact is not provided', () => {
      render(<ContactCard contact={mockContact} />)

      const nameElement = screen.getByText('John Doe')
      expect(nameElement).toHaveClass('text-neutral-800')
    })

    it('disables avatar button when onOpenContact is not provided', () => {
      render(<ContactCard contact={mockContact} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toBeDisabled()
    })
  })

  describe('edit form input handling', () => {
    it('updates name input value', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      const nameInput = screen.getByDisplayValue('John Doe') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      expect(nameInput.value).toBe('New Name')
    })

    it('updates phone input value', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      const phoneInput = screen.getByDisplayValue('555-123-4567') as HTMLInputElement
      fireEvent.change(phoneInput, { target: { value: '999-999-9999' } })

      expect(phoneInput.value).toBe('999-999-9999')
    })

    it('updates email input value', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      const emailInput = screen.getByDisplayValue('john@example.com') as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } })

      expect(emailInput.value).toBe('new@example.com')
    })

    it('phone input has correct type', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      const phoneInput = screen.getByDisplayValue('555-123-4567')

      expect(phoneInput).toHaveAttribute('type', 'tel')
    })

    it('email input has correct type', () => {
      render(<ContactCard contact={mockContact} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))
      const emailInput = screen.getByDisplayValue('john@example.com')

      expect(emailInput).toHaveAttribute('type', 'email')
    })

    it('shows placeholders in edit form', () => {
      const contactMinimal = createMockContact({
        id: 'contact-2',
        name: 'Minimal Contact',
        phone: undefined,
        email: undefined,
      })
      render(<ContactCard contact={contactMinimal} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit contact'))

      expect(screen.getByPlaceholderText('555-123-4567')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument()
    })
  })
})
