import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxTaskCard } from './InboxTaskCard'
import { createMockTask, createMockProject } from '@/test/mocks/factories'

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

    it('renders unchecked state for incomplete task', () => {
      render(<InboxTaskCard {...defaultProps} />)

      const checkbox = document.querySelector('.border-neutral-300')
      expect(checkbox).toBeInTheDocument()
    })

    it('renders checked state for completed task', () => {
      const completedTask = createMockTask({ ...mockTask, completed: true })
      render(<InboxTaskCard {...defaultProps} task={completedTask} />)

      const checkbox = document.querySelector('.bg-primary-500')
      expect(checkbox).toBeInTheDocument()
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

      // Find and click the checkbox button (first button should be checkbox)
      const checkboxButton = screen.getAllByRole('button')[0]
      fireEvent.click(checkboxButton)

      expect(mockOnUpdate).toHaveBeenCalledWith({ completed: true })
    })

    it('calls onUpdate with completed:false when clicking complete task checkbox', () => {
      const completedTask = createMockTask({ ...mockTask, completed: true })
      render(<InboxTaskCard {...defaultProps} task={completedTask} />)

      const checkboxButton = screen.getAllByRole('button')[0]
      fireEvent.click(checkboxButton)

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

    it('calls onDefer when Tomorrow is selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      // Select Tomorrow
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(mockOnDefer).toHaveBeenCalledWith(expect.any(Date))
    })

    it('calls onDefer when Next Week is selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      // Select Next Week
      fireEvent.click(screen.getByText('Next Week'))

      expect(mockOnDefer).toHaveBeenCalledWith(expect.any(Date))
    })

    it('shows Show Now option when task is deferred', () => {
      const deferredTask = createMockTask({
        ...mockTask,
        deferredUntil: new Date('2024-12-25'),
      })
      render(<InboxTaskCard {...defaultProps} task={deferredTask} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))

      expect(screen.getByText('Show Now')).toBeInTheDocument()
    })

    it('calls onDefer with undefined when Show Now is clicked', () => {
      const deferredTask = createMockTask({
        ...mockTask,
        deferredUntil: new Date('2024-12-25'),
      })
      render(<InboxTaskCard {...defaultProps} task={deferredTask} />)

      // Open DeferPicker
      fireEvent.click(screen.getByRole('button', { name: 'Defer item' }))
      // Click Show Now
      fireEvent.click(screen.getByText('Show Now'))

      expect(mockOnDefer).toHaveBeenCalledWith(undefined)
    })
  })

  describe('project chip', () => {
    // Note: Chips are hidden on mobile (hidden md:flex class)
    // These tests verify the data binding works when rendered

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

  describe('defer badge in DeferPicker', () => {
    it('shows defer badge when deferCount >= 2', () => {
      const deferredTask = createMockTask({
        ...mockTask,
        deferCount: 3,
      })

      render(<InboxTaskCard {...defaultProps} task={deferredTask} />)

      expect(screen.getByText('↻3')).toBeInTheDocument()
    })

    it('does not show defer badge when deferCount < 2', () => {
      const lowDeferTask = createMockTask({
        ...mockTask,
        deferCount: 1,
      })

      render(<InboxTaskCard {...defaultProps} task={lowDeferTask} />)

      expect(screen.queryByText('↻1')).not.toBeInTheDocument()
    })

    it('does not show defer badge when deferCount is undefined', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.queryByText(/↻/)).not.toBeInTheDocument()
    })
  })
})
