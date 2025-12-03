import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'
import type { Contact } from '@/types/contact'

const mockContacts: Contact[] = [
  {
    id: 'contact-1',
    name: 'Alice Smith',
    phone: '555-1234',
    email: 'alice@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'contact-2',
    name: 'Bob Jones',
    phone: '555-5678',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'contact-3',
    name: 'Alice Wong',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('QuickCapture', () => {
  it('renders input field when open', () => {
    const onAdd = vi.fn()
    render(<QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />)

    expect(screen.getByPlaceholderText(/what needs to be done/i)).toBeInTheDocument()
  })

  it('calls onAdd with title when form is submitted', async () => {
    const onAdd = vi.fn()
    const { user } = render(<QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />)

    const input = screen.getByPlaceholderText(/what needs to be done/i)
    await user.type(input, 'My new task')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onAdd).toHaveBeenCalledWith('My new task', undefined, undefined, undefined)
  })

  it('does not submit when title is empty', async () => {
    const onAdd = vi.fn()
    const { user } = render(<QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  describe('@ mention trigger', () => {
    it('shows contact dropdown when @ is typed', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@')

      // Should show contacts in dropdown (up to 5)
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })

    it('shows helper text when @ is typed with no contacts', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={[]} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@')

      // Should show helpful message
      expect(screen.getByText('Type a name to search or create a contact')).toBeInTheDocument()
    })

    it('filters contacts as user types after @', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@ali')

      // Should only show Alice contacts
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Alice Wong')).toBeInTheDocument()
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
    })

    it('shows "Create contact" option when no exact match', async () => {
      const onAdd = vi.fn()
      const onAddContact = vi.fn()
      const { user } = render(
        <QuickCapture
          onAdd={onAdd}
          isOpen={true}
          showFab={false}
          contacts={mockContacts}
          onAddContact={onAddContact}
        />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@Tony')

      // Should show create option
      expect(screen.getByText('Create "Tony"')).toBeInTheDocument()
    })

    it('selects contact when clicked', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, 'Call @')

      // Click on Alice Smith
      await user.click(screen.getByText('Alice Smith'))

      // Should show contact chip
      expect(screen.getByText('@Alice Smith')).toBeInTheDocument()

      // Dropdown should be closed
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
    })

    it('includes contactId when submitting with selected contact', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, 'Call @')
      await user.click(screen.getByText('Alice Smith'))

      // The title should now be "Call" (with @ removed), type rest of task
      // Input is cleared to just the part before @, so we need to add the full task
      await user.clear(input)
      await user.type(input, 'Call about project')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onAdd).toHaveBeenCalledWith('Call about project', 'contact-1', undefined, undefined)
    })

    it('can remove selected contact', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@')
      await user.click(screen.getByText('Alice Smith'))

      // Contact chip should be visible
      expect(screen.getByText('@Alice Smith')).toBeInTheDocument()

      // Remove contact
      await user.click(screen.getByRole('button', { name: 'Remove contact' }))

      // Contact chip should be gone
      expect(screen.queryByText('@Alice Smith')).not.toBeInTheDocument()
    })

    it('closes dropdown on Escape key', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@')

      // Dropdown should be visible
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()

      // Press Escape
      await user.keyboard('{Escape}')

      // Dropdown should be closed
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument()
    })

    it('supports keyboard navigation in dropdown', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} contacts={mockContacts} />
      )

      const input = screen.getByPlaceholderText(/what needs to be done/i)
      await user.type(input, '@')

      // Navigate down then select with Enter
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      // Should have selected Bob Jones (second item)
      expect(screen.getByText('@Bob Jones')).toBeInTheDocument()
    })
  })

  describe('FAB button', () => {
    it('shows FAB when showFab is true', () => {
      const onAdd = vi.fn()
      render(<QuickCapture onAdd={onAdd} showFab={true} />)

      expect(screen.getByRole('button', { name: 'Quick add task' })).toBeInTheDocument()
    })

    it('hides FAB when showFab is false', () => {
      const onAdd = vi.fn()
      render(<QuickCapture onAdd={onAdd} showFab={false} />)

      expect(screen.queryByRole('button', { name: 'Quick add task' })).not.toBeInTheDocument()
    })
  })
})
