import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@/test/test-utils'
import { QuickCapture } from './QuickCapture'
import { LAYERS_KEY } from '@/hooks/useDomain'

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

  describe('capture lands Unsorted (no lens stamp)', () => {
    // A quick capture must never inherit the active domain lens — a stale
    // filter checkbox (left on "Work" from browsing) can't silently mislabel
    // a new item. With only('work') checked, "Buy milk" has no parsed fields
    // and no context, so it takes the plain onAdd(title) path exactly as it
    // would with every layer checked — proving nothing about the lens
    // leaked into the write.
    it('a submitted capture carries no context even with a single domain checked', async () => {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(['work']))
      try {
        const onAdd = vi.fn()
        const onAddRich = vi.fn()
        const { user } = render(
          <QuickCapture onAdd={onAdd} onAddRich={onAddRich} isOpen={true} showFab={false} />
        )

        const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
        await user.type(input, 'Buy milk')
        await user.click(screen.getByRole('button', { name: 'Add to My Inbox' }))

        expect(onAdd).toHaveBeenCalledWith('Buy milk')
        expect(onAddRich).not.toHaveBeenCalled()
      } finally {
        localStorage.removeItem(LAYERS_KEY)
      }
    })

    it('the "Add to Work?" chip is offered but not applied — tapping it is the only way in', async () => {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(['work']))
      try {
        const onAddRich = vi.fn()
        const { user } = render(
          <QuickCapture
            onAdd={vi.fn()}
            onAddRich={onAddRich}
            isOpen={true}
            showFab={false}
            projects={[{ id: 'p1', name: 'Montreal Trip' }]}
          />
        )

        const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
        await user.type(input, 'book flights #montreal tomorrow')

        const chip = screen.getByRole('button', { name: /Add to Work\?/i })
        await user.click(chip)
        await user.click(screen.getByRole('button', { name: 'Schedule Task' }))

        expect(onAddRich).toHaveBeenCalledWith(
          expect.objectContaining({ context: 'work' }),
        )
      } finally {
        localStorage.removeItem(LAYERS_KEY)
      }
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

  describe('unibox', () => {
    it('renders the results slot with the typed query once 2+ chars', async () => {
      const resultsSlot = vi.fn((query: string) => <div data-testid="slot">results for {query}</div>)
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} resultsSlot={resultsSlot} />,
      )
      await user.type(screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"'), 'lig')
      expect(screen.getByTestId('slot')).toHaveTextContent('results for lig')
    })

    it('shows the Ask Symphony row and escalates + closes on click', async () => {
      const onAskSymphony = vi.fn()
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onAskSymphony={onAskSymphony} onClose={onClose} />,
      )
      await user.type(
        screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"'),
        'plan the school fundraiser',
      )
      await user.click(screen.getByRole('button', { name: /Ask Symphony to set this up/ }))
      expect(onAskSymphony).toHaveBeenCalledWith('plan the school fundraiser')
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('⌘Enter escalates to Symphony', async () => {
      const onAskSymphony = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onAskSymphony={onAskSymphony} onClose={vi.fn()} />,
      )
      const input = screen.getByPlaceholderText('Try "call the vet tomorrow 2pm"')
      await user.type(input, 'set up the garage cleanout')
      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(onAskSymphony).toHaveBeenCalledWith('set up the garage cleanout')
    })

    it('hides the Ask Symphony row when the input is empty', () => {
      render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onAskSymphony={vi.fn()} />,
      )
      expect(screen.queryByRole('button', { name: /Ask Symphony/ })).not.toBeInTheDocument()
    })
  })

  describe('idle behavior', () => {
    // A silent auto-close leaks subsequent keystrokes to whatever global
    // hotkey surface is underneath (Inbox Focus mode binds d=delete,
    // c=complete, 1-4=triage). The modal must only close on explicit
    // user action: Escape, ✕, click-outside, or a navigating submit.
    it('stays open while idle with an empty input — never self-dismisses', () => {
      vi.useFakeTimers()
      try {
        const onClose = vi.fn()
        render(
          <QuickCapture onAdd={vi.fn()} isOpen={true} onClose={onClose} showFab={false} />,
        )
        act(() => {
          vi.advanceTimersByTime(60000)
        })
        expect(onClose).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
