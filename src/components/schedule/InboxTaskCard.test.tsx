import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxTaskCard } from './InboxTaskCard'
import { createMockTask, createMockProject } from '@/test/mocks/factories'

// Mock the Google Places hook (used by AssignPicker)
vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({
    results: [],
    loading: false,
    searchPlaces: vi.fn(),
    getPlaceDetails: vi.fn(),
    clearResults: vi.fn(),
  }),
}))

describe('InboxTaskCard', () => {
  const mockOnUpdate = vi.fn()
  const mockOnSelect = vi.fn()
  const mockOnDefer = vi.fn()

  const mockTask = createMockTask({
    id: 'task-1',
    title: 'Test task',
    completed: false,
  })

  const mockProjects = [
    createMockProject({ id: 'project-1', name: 'My Project' }),
  ]

  const defaultProps = {
    task: mockTask,
    onUpdate: mockOnUpdate,
    onSelect: mockOnSelect,
    onDefer: mockOnDefer,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders task title', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.getByText('Test task')).toBeInTheDocument()
    })

    it('renders checkbox', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Find the checkbox button
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('applies line-through to completed task title', () => {
      const completedTask = createMockTask({ ...mockTask, completed: true })
      render(<InboxTaskCard {...defaultProps} task={completedTask} />)

      const title = screen.getByText('Test task')
      expect(title).toHaveClass('line-through')
    })
  })

  describe('checkbox interactions', () => {
    it('calls onUpdate with completed:true when clicking incomplete task checkbox', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // TaskCheckbox uses useLongPress which binds onMouseDown/onMouseUp, not onClick
      const checkboxButton = screen.getAllByRole('button')[0]
      fireEvent.mouseDown(checkboxButton)
      fireEvent.mouseUp(checkboxButton)

      expect(mockOnUpdate).toHaveBeenCalledWith({ completed: true })
    })

    it('calls onUpdate with completed:false when clicking complete task checkbox', () => {
      const completedTask = createMockTask({ ...mockTask, completed: true })
      render(<InboxTaskCard {...defaultProps} task={completedTask} />)

      // TaskCheckbox uses useLongPress which binds onMouseDown/onMouseUp, not onClick
      const checkboxButton = screen.getAllByRole('button')[0]
      fireEvent.mouseDown(checkboxButton)
      fireEvent.mouseUp(checkboxButton)

      expect(mockOnUpdate).toHaveBeenCalledWith({ completed: false })
    })
  })

  describe('title interactions', () => {
    it('calls onSelect when clicking title', () => {
      render(<InboxTaskCard {...defaultProps} />)

      fireEvent.click(screen.getByText('Test task'))

      expect(mockOnSelect).toHaveBeenCalled()
    })
  })

  describe('defer picker', () => {
    it('renders DeferPicker', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Defer item' })).toBeInTheDocument()
    })

    it('calls onDefer with "week" when Next Week is selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      // Select Next Week
      fireEvent.click(screen.getByText('Next Week'))

      expect(mockOnDefer).toHaveBeenCalledWith('week')
    })

    it('calls onDefer with "month" when Next Month is selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      // Select Next Month
      fireEvent.click(screen.getByText('Next Month'))

      expect(mockOnDefer).toHaveBeenCalledWith('month')
    })
  })

  describe('compact mode', () => {
    // Compact is used in narrow drop-zone columns (This Week, This Month, Someday).
    // Triage actions, ContextPicker, and assignee avatars are hidden so the title
    // has room. Family pill row is preserved for at-a-glance privacy state.
    it('does not render the triage actions cluster (defer button) when compact is true', () => {
      const task = createMockTask({ context: 'family' })
      render(<InboxTaskCard {...defaultProps} task={task} compact={true} />)
      expect(screen.queryByRole('button', { name: 'Defer item' })).not.toBeInTheDocument()
    })

    it('still renders the Family pill in compact mode for family-context tasks', () => {
      const task = createMockTask({ context: 'family' })
      render(<InboxTaskCard {...defaultProps} task={task} compact={true} />)
      expect(screen.getByLabelText('Shared with family')).toBeInTheDocument()
    })

    it('still renders the task title in compact mode', () => {
      render(<InboxTaskCard {...defaultProps} compact={true} />)
      expect(screen.getByText('Test task')).toBeInTheDocument()
    })

    it('renders the triage actions cluster when compact is false (default)', () => {
      render(<InboxTaskCard {...defaultProps} />)
      expect(screen.getByRole('button', { name: 'Defer item' })).toBeInTheDocument()
    })
  })

  describe('family badge', () => {
    // Note: badge intentionally has NO `hidden md:flex` so it shows on mobile too.
    // jsdom can't exercise responsive classes — don't refactor this row to be
    // desktop-only without first reading the Phase 2 design doc.
    it('renders FamilyBadge when task.context is family', () => {
      const task = createMockTask({ context: 'family' })
      render(<InboxTaskCard {...defaultProps} task={task} />)
      expect(screen.getByLabelText('Shared with family')).toBeInTheDocument()
    })

    it('does not render FamilyBadge when task.context is null', () => {
      const task = createMockTask({ context: null })
      render(<InboxTaskCard {...defaultProps} task={task} />)
      expect(screen.queryByLabelText('Shared with family')).not.toBeInTheDocument()
    })

    it('does not render FamilyBadge when task.context is work', () => {
      const task = createMockTask({ context: 'work' })
      render(<InboxTaskCard {...defaultProps} task={task} />)
      expect(screen.queryByLabelText('Shared with family')).not.toBeInTheDocument()
    })

    it('does not render FamilyBadge when task.context is personal', () => {
      const task = createMockTask({ context: 'personal' })
      render(<InboxTaskCard {...defaultProps} task={task} />)
      expect(screen.queryByLabelText('Shared with family')).not.toBeInTheDocument()
    })
  })

  describe('project chip', () => {
    it('renders project data when task has project', () => {
      const taskWithProject = createMockTask({
        ...mockTask,
        projectId: 'project-1',
      })

      render(
        <InboxTaskCard
          {...defaultProps}
          task={taskWithProject}
          projects={mockProjects}
        />
      )

      // The chip row exists in DOM even if hidden by CSS
      const container = document.querySelector('.hidden.md\\:flex')
      expect(container).toBeInTheDocument()
    })

    it('does not render chip row when no project', () => {
      render(<InboxTaskCard {...defaultProps} projects={mockProjects} />)

      // No chips row should be rendered
      const container = document.querySelector('.hidden.md\\:flex')
      expect(container).not.toBeInTheDocument()
    })
  })
})
