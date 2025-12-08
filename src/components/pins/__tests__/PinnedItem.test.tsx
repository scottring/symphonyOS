import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinnedItem } from '../PinnedItem'
import type { PinnedItem as PinnedItemType } from '@/types/pin'

// Helper to create a mock PinnedItem
function createMockPinnedItem(overrides: Partial<PinnedItemType> = {}): PinnedItemType {
  return {
    id: 'pin-1',
    entityType: 'task',
    entityId: 'task-1',
    displayOrder: 0,
    pinnedAt: new Date('2024-01-01T00:00:00Z'),
    lastAccessedAt: new Date(), // Recent - not stale
    isStale: false,
    ...overrides,
  }
}

describe('PinnedItem', () => {
  const mockOnClick = vi.fn()
  const mockOnRefresh = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders pin name', () => {
      const pin = createMockPinnedItem()

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      expect(screen.getByText('My Task')).toBeInTheDocument()
    })

    it('shows folder icon for project type', () => {
      const pin = createMockPinnedItem({ entityType: 'project' })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="My Project"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      // The folder icon has a specific path
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      const path = svg?.querySelector('path')
      expect(path?.getAttribute('d')).toContain('2 6a2 2 0') // Part of folder path
    })

    it('shows check icon for task type', () => {
      const pin = createMockPinnedItem({ entityType: 'task' })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      const path = svg?.querySelector('path')
      expect(path?.getAttribute('d')).toContain('16.707 5.293') // Part of check path
    })

    it('shows user icon for contact type', () => {
      const pin = createMockPinnedItem({ entityType: 'contact' })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="John Doe"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      const path = svg?.querySelector('path')
      expect(path?.getAttribute('d')).toContain('10 9a3 3') // Part of user path
    })

    it('shows repeat icon for routine type', () => {
      const pin = createMockPinnedItem({ entityType: 'routine' })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="Morning Routine"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      const path = svg?.querySelector('path')
      expect(path?.getAttribute('d')).toContain('4 2a1') // Part of repeat path
    })

    it('shows list icon for list type', () => {
      const pin = createMockPinnedItem({ entityType: 'list' })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="Shopping List"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('stale state', () => {
    it('shows normal styling when not stale', () => {
      const pin = createMockPinnedItem({ isStale: false })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const button = container.querySelector('button')
      expect(button).toHaveClass('text-neutral-600')
    })

    it('shows dimmed styling when stale', () => {
      const pin = createMockPinnedItem({ isStale: true })

      const { container } = render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const button = container.querySelector('button')
      expect(button).toHaveClass('text-neutral-400')
    })

    it('shows refresh icon when stale', () => {
      const pin = createMockPinnedItem({ isStale: true })

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      // Refresh button has title "Still need this?"
      const refreshButton = screen.getByTitle(/Still need this/)
      expect(refreshButton).toBeInTheDocument()
    })

    it('hides refresh icon when not stale', () => {
      const pin = createMockPinnedItem({ isStale: false })

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      // Refresh button should not exist
      const refreshButton = screen.queryByTitle(/Still need this/)
      expect(refreshButton).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onClick when row clicked', () => {
      const pin = createMockPinnedItem()

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const row = screen.getByText('My Task').closest('button')!
      fireEvent.click(row)

      expect(mockOnClick).toHaveBeenCalled()
    })

    it('calls onRefresh when refresh icon clicked', () => {
      const pin = createMockPinnedItem({ isStale: true })

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const refreshButton = screen.getByTitle(/Still need this/)
      fireEvent.click(refreshButton)

      expect(mockOnRefresh).toHaveBeenCalled()
    })

    it('refresh click stops propagation', () => {
      const pin = createMockPinnedItem({ isStale: true })

      render(
        <PinnedItem
          pin={pin}
          name="My Task"
          onClick={mockOnClick}
          onRefresh={mockOnRefresh}
        />
      )

      const refreshButton = screen.getByTitle(/Still need this/)
      fireEvent.click(refreshButton)

      // onClick should NOT have been called
      expect(mockOnClick).not.toHaveBeenCalled()
      expect(mockOnRefresh).toHaveBeenCalled()
    })
  })
})
