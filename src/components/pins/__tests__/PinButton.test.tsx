import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PinButton } from '../PinButton'

describe('PinButton', () => {
  const mockOnPin = vi.fn().mockResolvedValue(true)
  const mockOnUnpin = vi.fn().mockResolvedValue(true)
  const mockOnMaxPinsReached = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('shows filled Pin icon when isPinned=true', () => {
      const { container } = render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={true}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      // When pinned, the svg has fill="currentColor"
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      // The pinned state uses primary-600 color
      const button = container.querySelector('button')
      expect(button).toHaveClass('text-primary-600')
    })

    it('shows outline Pin icon when isPinned=false', () => {
      const { container } = render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      // The unpinned state uses neutral-400 color
      const button = container.querySelector('button')
      expect(button).toHaveClass('text-neutral-400')
    })

    it('renders sm size correctly', () => {
      const { container } = render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
          size="sm"
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('w-4', 'h-4')
    })

    it('renders md size correctly', () => {
      const { container } = render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
          size="md"
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('w-5', 'h-5')
    })
  })

  describe('interactions', () => {
    it('calls onPin when clicked and not pinned', async () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockOnPin).toHaveBeenCalled()
      })
      expect(mockOnUnpin).not.toHaveBeenCalled()
    })

    it('calls onUnpin when clicked and pinned', async () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={true}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockOnUnpin).toHaveBeenCalled()
      })
      expect(mockOnPin).not.toHaveBeenCalled()
    })

    it('does not call onPin when canPin=false', async () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={false}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockOnPin).not.toHaveBeenCalled()
      })
    })

    it('calls onMaxPinsReached when canPin=false and clicked', async () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={false}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
          onMaxPinsReached={mockOnMaxPinsReached}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockOnMaxPinsReached).toHaveBeenCalled()
      })
      expect(mockOnPin).not.toHaveBeenCalled()
    })

    it('stops event propagation on click', async () => {
      const parentClick = vi.fn()

      render(
        <div onClick={parentClick}>
          <PinButton
            entityType="task"
            entityId="task-1"
            isPinned={false}
            canPin={true}
            onPin={mockOnPin}
            onUnpin={mockOnUnpin}
          />
        </div>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(mockOnPin).toHaveBeenCalled()
      })
      expect(parentClick).not.toHaveBeenCalled()
    })
  })

  describe('titles/tooltips', () => {
    it('shows "Unpin" title when pinned', () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={true}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', 'Unpin')
    })

    it('shows "Pin for quick access" title when not pinned and can pin', () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={true}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', 'Pin for quick access')
    })

    it('shows max pins warning title when cannot pin', () => {
      render(
        <PinButton
          entityType="task"
          entityId="task-1"
          isPinned={false}
          canPin={false}
          onPin={mockOnPin}
          onUnpin={mockOnUnpin}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', 'Unpin something first (max 7)')
    })
  })
})
