import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
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

      expect(screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')).toBeInTheDocument()
    })
  })

  describe('Modal', () => {
    it('renders modal when isOpen=true', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)
      expect(screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')).toBeInTheDocument()
    })

    it('does not render modal when isOpen=false', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={false} showFab={false} />)
      expect(screen.queryByPlaceholderText('Try "call the vet tomorrow 2pm"')).not.toBeInTheDocument()
    })

    it('input has large text styling', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)
      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      // Test for the classes we care about without being brittle
      expect(input.className).toMatch(/text-2xl|text-lg/)
      expect(input.className).toContain('font-display')
    })
  })

  describe('mobile bottom sheet', () => {
    it('anchors the overlay to the bottom on mobile (items-end)', () => {
      const { container } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      const overlay = container.querySelector('.fixed.inset-0') as HTMLElement
      expect(overlay.className).toMatch(/items-end/)
      // Desktop alignment is preserved as a responsive variant.
      expect(overlay.className).toMatch(/md:items-center/)
    })

    it('uses bg-bg-elevated, full-bleed width, and rounded top corners on mobile', () => {
      const { getByTestId } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      const sheet = getByTestId('quick-capture-sheet')
      expect(sheet.className).toMatch(/bg-bg-elevated/)
      expect(sheet.className).toMatch(/w-full/)
      expect(sheet.className).toMatch(/rounded-t-3xl/)
    })

    it('renders a decorative drag handle (mobile only) inside the sheet', () => {
      const { getByTestId } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />,
      )
      const handle = getByTestId('drag-handle')
      // Mobile-only visibility is enforced via Tailwind's md:hidden utility.
      expect(handle.className).toMatch(/md:hidden/)
      // Decorative — must be hidden from the accessibility tree.
      expect(handle.getAttribute('aria-hidden')).not.toBeNull()
      // The handle lives inside the sheet, not floating elsewhere in the
      // overlay; assert containment so a future refactor can't accidentally
      // move it outside without failing this test.
      const sheet = getByTestId('quick-capture-sheet')
      expect(sheet.contains(handle)).toBe(true)
    })
  })

  describe('Close behavior', () => {
    it('calls onClose when Escape key is pressed', async () => {
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onClose={onClose} />
      )

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, '{Escape}')

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('closes modal when clicking overlay', async () => {
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onClose={onClose} />
      )

      // Click the overlay (the outer div with bg-black/40)
      const overlay = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"').closest('.bg-black\\/40')
      if (overlay) {
        await user.click(overlay)
        await waitFor(() => {
          expect(onClose).toHaveBeenCalled()
        })
      }
    })
  })

  describe('Submit behavior (no parsing)', () => {
    it('calls onAdd with title when Add to My Inbox is clicked', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'My new task')
      await user.click(screen.getByRole('button', { name: 'Add to My Inbox' }))

      expect(onAdd).toHaveBeenCalledWith('My new task')
    })

    it('Add to My Inbox button is disabled when title is empty', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)

      const saveButton = screen.getByRole('button', { name: 'Add to My Inbox' })
      expect(saveButton).toBeDisabled()
    })

    it('Add to My Inbox button is enabled when title has text', async () => {
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'Some text')

      const saveButton = screen.getByRole('button', { name: 'Add to My Inbox' })
      expect(saveButton).not.toBeDisabled()
    })

    it('does not call onAdd when title is empty', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      await user.click(screen.getByRole('button', { name: 'Add to My Inbox' }))

      expect(onAdd).not.toHaveBeenCalled()
    })

    it('trims whitespace from title', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, '  My task  ')
      await user.click(screen.getByRole('button', { name: 'Add to My Inbox' }))

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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'buy milk tomorrow')

      // Preview should show parsed title
      expect(screen.getByText('"buy milk"')).toBeInTheDocument()
      // Should show date chip with temporal indicator (date text rendered in chip)
      expect(screen.getByText(/Tomorrow|Today/)).toBeInTheDocument()
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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'call @iris')

      // Preview should show contact
      expect(screen.getByText('Iris')).toBeInTheDocument()
    })

    it('calls onAddRich with parsed data when the primary save button is clicked', async () => {
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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'book flight #montreal tomorrow')
      await user.click(screen.getByRole('button', { name: 'Schedule Task' }))

      expect(onAddRich).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'book flight',
          projectId: 'p1',
          scheduledFor: expect.any(Date),
        })
      )
    })

    it('shows Add to My Inbox button for raw text when parsing occurs', async () => {
      const { user } = render(
        <QuickCapture
          onAdd={vi.fn()}
          isOpen={true}
          showFab={false}
          projects={mockProjects}
          contacts={mockContacts}
        />
      )

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'buy milk tomorrow')

      // Should show both buttons when parsing happens
      expect(screen.getByRole('button', { name: 'Add to My Inbox' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Schedule Task' })).toBeInTheDocument()
    })

    it('calls onAdd with raw text when Add to My Inbox is clicked during parsing', async () => {
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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'buy milk tomorrow')
      await user.click(screen.getByRole('button', { name: 'Add to My Inbox' }))

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

      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
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
