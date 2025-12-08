import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinnedSection } from '../PinnedSection'
import type { PinnedItem as PinnedItemType } from '@/types/pin'

// Mock localStorage
let localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value
  }),
  clear: vi.fn(() => {
    localStorageStore = {}
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key]
  }),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Helper to create a mock PinnedItem
function createMockPin(overrides: Partial<PinnedItemType> = {}): PinnedItemType {
  return {
    id: 'pin-1',
    entityType: 'task',
    entityId: 'task-1',
    displayOrder: 0,
    pinnedAt: new Date('2024-01-01T00:00:00Z'),
    lastAccessedAt: new Date(),
    isStale: false,
    ...overrides,
  }
}

// Helper to create mock entity data
function createMockEntities() {
  return {
    tasks: [{ id: 'task-1', title: 'Test Task' }],
    projects: [{ id: 'project-1', name: 'Test Project' }],
    contacts: [{ id: 'contact-1', name: 'John Doe' }],
    routines: [{ id: 'routine-1', name: 'Morning Routine' }],
    lists: [{ id: 'list-1', name: 'Shopping List' }],
  }
}

describe('PinnedSection', () => {
  const mockOnNavigate = vi.fn()
  const mockOnMarkAccessed = vi.fn()
  const mockOnRefreshStale = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageStore = {} // Reset store directly
    localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] || null)
  })

  describe('rendering', () => {
    it('renders when there are pinned items', () => {
      const pins = [createMockPin()]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Pinned')).toBeInTheDocument()
      expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('does not render when pins array is empty', () => {
      const entities = createMockEntities()

      const { container } = render(
        <PinnedSection
          pins={[]}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders correct number of PinnedItem components', () => {
      const pins = [
        createMockPin({ id: 'pin-1', entityId: 'task-1', entityType: 'task' }),
        createMockPin({ id: 'pin-2', entityId: 'project-1', entityType: 'project' }),
        createMockPin({ id: 'pin-3', entityId: 'contact-1', entityType: 'contact' }),
      ]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Test Task')).toBeInTheDocument()
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('shows collapsed view when sidebar is collapsed', () => {
      const pins = [createMockPin()]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={true}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // Should show pin icon button with title, not the full list
      const button = screen.getByTitle('Pinned items')
      expect(button).toBeInTheDocument()

      // Should not show the expanded header or items
      expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument()
    })
  })

  describe('entity resolution', () => {
    it('resolves task name correctly', () => {
      const pins = [createMockPin({ entityType: 'task', entityId: 'task-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('resolves project name correctly', () => {
      const pins = [createMockPin({ entityType: 'project', entityId: 'project-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('resolves contact name correctly', () => {
      const pins = [createMockPin({ entityType: 'contact', entityId: 'contact-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })

    it('resolves routine name correctly', () => {
      const pins = [createMockPin({ entityType: 'routine', entityId: 'routine-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Morning Routine')).toBeInTheDocument()
    })

    it('resolves list name correctly', () => {
      const pins = [createMockPin({ entityType: 'list', entityId: 'list-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Shopping List')).toBeInTheDocument()
    })

    it('shows "Unknown Task" for missing task', () => {
      const pins = [createMockPin({ entityType: 'task', entityId: 'missing-id' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Unknown Task')).toBeInTheDocument()
    })

    it('shows "Unknown Project" for missing project', () => {
      const pins = [createMockPin({ entityType: 'project', entityId: 'missing-id' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      expect(screen.getByText('Unknown Project')).toBeInTheDocument()
    })
  })

  describe('collapse toggle', () => {
    it('toggles collapse state when header clicked', () => {
      const pins = [createMockPin()]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // Initially expanded, item should be visible
      expect(screen.getByText('Test Task')).toBeInTheDocument()

      // Click header to collapse
      const header = screen.getByText('Pinned').closest('button')!
      fireEvent.click(header)

      // Item should now be hidden
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument()

      // Click again to expand
      fireEvent.click(header)

      // Item should be visible again
      expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('persists collapse state to localStorage', () => {
      const pins = [createMockPin()]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // Click to collapse
      const header = screen.getByText('Pinned').closest('button')!
      fireEvent.click(header)

      expect(localStorageMock.setItem).toHaveBeenCalledWith('symphony-pins-collapsed', 'true')
    })

    it('reads collapse state from localStorage on mount', () => {
      localStorageMock.getItem.mockReturnValue('true')

      const pins = [createMockPin()]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // Should be collapsed based on localStorage
      expect(screen.queryByText('Test Task')).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onNavigate and onMarkAccessed when item clicked', () => {
      const pins = [createMockPin({ entityType: 'task', entityId: 'task-1' })]
      const entities = createMockEntities()

      render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      const item = screen.getByText('Test Task').closest('button')!
      fireEvent.click(item)

      expect(mockOnMarkAccessed).toHaveBeenCalledWith('task', 'task-1')
      expect(mockOnNavigate).toHaveBeenCalledWith('task', 'task-1')
    })

    it('calls onRefreshStale when refresh button clicked on stale item', () => {
      const pins = [createMockPin({ id: 'pin-1', isStale: true })]
      const entities = createMockEntities()

      const { container } = render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // The refresh button is inside the PinnedItem and has title "Still need this? Click to keep pinned"
      const refreshButton = container.querySelector('button[title*="Still need this"]')
      expect(refreshButton).toBeInTheDocument()
      fireEvent.click(refreshButton!)

      expect(mockOnRefreshStale).toHaveBeenCalledWith('pin-1')
    })
  })

  describe('chevron rotation', () => {
    it('shows rotated chevron when expanded', () => {
      // Ensure localStorage returns null (section starts expanded)
      localStorageStore = {}

      const pins = [createMockPin()]
      const entities = createMockEntities()

      const { container } = render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // The chevron is in the header button - get the second svg (first is Pin icon)
      const svgs = container.querySelectorAll('svg')
      // The chevron is lucide-chevron-down and should have rotate-180 when expanded
      const chevron = Array.from(svgs).find((svg) =>
        svg.classList.contains('lucide-chevron-down')
      )
      expect(chevron).toBeInTheDocument()
      expect(chevron).toHaveClass('rotate-180')
    })

    it('shows non-rotated chevron when collapsed', () => {
      // Set localStorage to return 'true' for collapsed state
      localStorageStore = { 'symphony-pins-collapsed': 'true' }

      const pins = [createMockPin()]
      const entities = createMockEntities()

      const { container } = render(
        <PinnedSection
          pins={pins}
          entities={entities as never}
          collapsed={false}
          onNavigate={mockOnNavigate}
          onMarkAccessed={mockOnMarkAccessed}
          onRefreshStale={mockOnRefreshStale}
        />
      )

      // The chevron is lucide-chevron-down and should NOT have rotate-180 when collapsed
      const svgs = container.querySelectorAll('svg')
      const chevron = Array.from(svgs).find((svg) =>
        svg.classList.contains('lucide-chevron-down')
      )
      expect(chevron).toBeInTheDocument()
      expect(chevron).not.toHaveClass('rotate-180')
    })
  })
})
