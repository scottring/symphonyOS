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

    it('input has text-2xl and font-display classes', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)
      const input = screen.getByPlaceholderText("What's on your mind?")
      expect(input).toHaveClass('text-2xl', 'font-display')
    })
  })

  describe('Cancel and close behavior', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const onClose = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} onClose={onClose} />
      )

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onClose).toHaveBeenCalled()
    })

    it('closes modal when Escape key is pressed', async () => {
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

  describe('Save behavior', () => {
    it('calls onAdd with title when Save is clicked', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'My new task')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onAdd).toHaveBeenCalledWith('My new task')
    })

    it('Save button is disabled when title is empty', () => {
      render(<QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />)

      const saveButton = screen.getByRole('button', { name: 'Save' })
      expect(saveButton).toBeDisabled()
    })

    it('Save button is enabled when title has text', async () => {
      const { user } = render(
        <QuickCapture onAdd={vi.fn()} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, 'Some text')

      const saveButton = screen.getByRole('button', { name: 'Save' })
      expect(saveButton).not.toBeDisabled()
    })

    it('does not call onAdd when title is empty', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onAdd).not.toHaveBeenCalled()
    })

    it('trims whitespace from title', async () => {
      const onAdd = vi.fn()
      const { user } = render(
        <QuickCapture onAdd={onAdd} isOpen={true} showFab={false} />
      )

      const input = screen.getByPlaceholderText("What's on your mind?")
      await user.type(input, '  My task  ')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(onAdd).toHaveBeenCalledWith('My task')
    })
  })
})
