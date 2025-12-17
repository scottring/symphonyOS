import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'

describe('QuickCapture', () => {
  describe('FAB button', () => {
    it('renders FAB button when showFab=true', () => {
      render(<QuickCapture onAdd={vi.fn()} showFab={true} />)
      expect(screen.getByRole('button', { name: 'Quick add task' })).toBeInTheDocument()
    })

    it('hides FAB button when showFab=false', () => {
      render(<QuickCapture onAdd={vi.fn()} showFab={false} />)
      expect(screen.queryByRole('button', { name: 'Quick add task' })).not.toBeInTheDocument()
    })

    it('opens modal when FAB is clicked', async () => {
      const { user } = render(<QuickCapture onAdd={vi.fn()} showFab={true} />)

      await user.click(screen.getByRole('button', { name: 'Quick add task' }))

      expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument()
    })
  })

  describe('Modal', () => {
    it('renders modal when isOpen=true', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)
      expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument()
    })

    it('does not render modal when isOpen=false', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={false} showFab={false} />)
      expect(screen.queryByPlaceholderText("What's on your mind?")).not.toBeInTheDocument()
    })

    it('input has font-display class with responsive text sizing', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)
      const input = screen.getByPlaceholderText("What's on your mind?")
      expect(input).toHaveClass('font-display')
      // Uses text-lg on mobile, md:text-2xl on desktop
      expect(input).toHaveClass('text-lg', 'md:text-2xl')
    })
  })

  describe('Close behavior', () => {
    it('calls onClose when Escape key is pressed', async () => {
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onClose={onClose} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, '{Escape}')

      expect(onClose).toHaveBeenCalled()
    })

    it('closes modal when clicking overlay', async () => {
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onClose={onClose} />
      )

      // Click the overlay (the outer div with bg-black/40)
      const overlay = screen.getByPlaceholderText("What's on your mind?").closest('.bg-black\\/40')
      if (overlay) {
        await user.click(overlay)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })

  describe('Submit behavior (no parsing)', () => {
    it('calls onAdd with title when Add to Inbox is clicked', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'My new task')
      await user.click(screen.getByRole('button', { name: 'Add to Inbox' }))

      expect(onAdd).toHaveBeenCalledWith('My new task')
    })

    it('Add to Inbox button is disabled when title is empty', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)

      const saveButton = screen.getByRole('button', { name: 'Add to Inbox' })
      expect(saveButton).toBeDisabled()
    })

    it('Add to Inbox button is enabled when title has text', async () => {
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'Some text')

      const saveButton = screen.getByRole('button', { name: 'Add to Inbox' })
      expect(saveButton).not.toBeDisabled()
    })

    it('does not call onAdd when title is empty', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      await user.click(screen.getByRole('button', { name: 'Add to Inbox' }))

      expect(onAdd).not.toHaveBeenCalled()
    })

    it('trims whitespace from title', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, '  My task  ')
      await user.click(screen.getByRole('button', { name: 'Add to Inbox' }))

      expect(onAdd).toHaveBeenCalledWith('My task')
    })
  })

  describe('Natural language parsing', () => {
    const mockProjects = [
      { id: 'p1', name: 'Montreal Trip' },
      { id: 'p2', name: 'Work Stuff' },
    ]
    const mockContacts = [
      { id: 'c1', name: 'Iris' },
      { id: 'c2', name: 'Dr. Smith' },
    ]

    it('shows preview when date is parsed', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'buy milk tomorrow')

      // Preview should show parsed title
      expect(screen.getByText('"buy milk"')).toBeInTheDocument()
      // Should show date/time chip (📅 for dates, 🕐 for times)
      const dateChips = screen.queryAllByText((content) => content.includes('📅') || content.includes('🕐'))
      expect(dateChips.length).toBeGreaterThan(0)
    })

    it('shows preview when project is parsed with #hashtag', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'book flights #montreal')

      // Preview should show project
      expect(screen.getByText('Montreal Trip')).toBeInTheDocument()
    })

    it('shows preview when contact is parsed with @mention', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'call @iris')

      // Preview should show contact
      expect(screen.getByText('Iris')).toBeInTheDocument()
    })

    it('calls onAddRich with parsed data when Save with Above is clicked', async () => {
      const onAddRich = vi.fn()
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          onAddRich={onAddRich}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'book flight #montreal tomorrow')
      await user.click(screen.getByRole('button', { name: 'Save with Above' }))

      expect(onAddRich).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'book flight',
          projectId: 'p1',
          scheduledFor: expect.any(Date),
        })
      )
    })

    it('shows Add to Inbox button for raw text when parsing occurs', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'buy milk tomorrow')

      // Should show both buttons when parsing happens
      expect(screen.getByRole('button', { name: 'Add to Inbox' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save with Above' })).toBeInTheDocument()
    })

    it('calls onAdd with raw text when Add to Inbox is clicked during parsing', async () => {
      const onAdd = vi.fn()
      const onAddRich = vi.fn()
      const { user } = render(
        <QuickCapture
          onAdd={onAdd}
          onAddRich={onAddRich}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'buy milk tomorrow')
      await user.click(screen.getByRole('button', { name: 'Add to Inbox' }))

      // Should call onAdd with raw text, not onAddRich
      expect(onAdd).toHaveBeenCalledWith('buy milk tomorrow')
      expect(onAddRich).not.toHaveBeenCalled()
    })

    it('removes parsed field when × button is clicked', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'book flight #montreal')

      // Project should be shown
      expect(screen.getByText('Montreal Trip')).toBeInTheDocument()

      // Click × to remove project
      const removeButton = screen.getByText('Montreal Trip').closest('span')?.querySelector('button')
      if (removeButton) {
        await user.click(removeButton)
      }

      // Project chip should be gone
      expect(screen.queryByText('Montreal Trip')).not.toBeInTheDocument()
    })
  })
})
