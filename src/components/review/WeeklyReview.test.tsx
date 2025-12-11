import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeeklyReview } from './WeeklyReview'
import { createMockTask, createMockProject, createMockContact } from '@/test/mocks/factories'

describe('WeeklyReview', () => {
  const mockOnUpdateTask = vi.fn()
  const mockOnPushTask = vi.fn()
  const mockOnDeleteTask = vi.fn()
  const mockOnClose = vi.fn()
  const mockOnSearchContacts = vi.fn()
  const mockOnAddContact = vi.fn()

  const mockTasks = [
    createMockTask({ id: 'task-1', title: 'Review documents' }),
    createMockTask({ id: 'task-2', title: 'Call client', deferCount: 3 }),
  ]

  const mockProjects = [
    createMockProject({ id: 'project-1', name: 'Big Project' }),
  ]

  const mockContacts = [
    createMockContact({ id: 'contact-1', name: 'Alice' }),
  ]

  const defaultProps = {
    tasks: mockTasks,
    projects: mockProjects,
    contacts: mockContacts,
    onSearchContacts: mockOnSearchContacts,
    onAddContact: mockOnAddContact,
    onUpdateTask: mockOnUpdateTask,
    onPushTask: mockOnPushTask,
    onDeleteTask: mockOnDeleteTask,
    onClose: mockOnClose,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSearchContacts.mockReturnValue([])
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders modal with header', () => {
      render(<WeeklyReview {...defaultProps} />)
      expect(screen.getByText('Weekly Review')).toBeInTheDocument()
    })

    it('renders close button in header', () => {
      render(<WeeklyReview {...defaultProps} />)
      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toBeInTheDocument()
    })

    it('shows item count', () => {
      render(<WeeklyReview {...defaultProps} />)
      expect(screen.getByText('2 items to process')).toBeInTheDocument()
    })

    it('shows singular "item" for single task', () => {
      render(<WeeklyReview {...defaultProps} tasks={[mockTasks[0]]} />)
      expect(screen.getByText('1 item to process')).toBeInTheDocument()
    })

    it('renders all task titles', () => {
      render(<WeeklyReview {...defaultProps} />)
      expect(screen.getByText('Review documents')).toBeInTheDocument()
      expect(screen.getByText('Call client')).toBeInTheDocument()
    })

    it('shows subheader when tasks exist', () => {
      render(<WeeklyReview {...defaultProps} />)
      expect(screen.getByText('Give each item a home')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows completion message when no tasks', () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)
      expect(screen.getByText('All Clear')).toBeInTheDocument()
      expect(screen.getByText(/Every item has a temporal home/)).toBeInTheDocument()
    })

    it('shows Back to Today button in empty state', () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)
      expect(screen.getByRole('button', { name: 'Back to Today' })).toBeInTheDocument()
    })

    it('calls onClose when clicking Back to Today button', async () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)
      fireEvent.click(screen.getByRole('button', { name: 'Back to Today' }))
      // Wait for animation delay
      vi.advanceTimersByTime(200)
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('task details', () => {
    it('shows project name when task has project', () => {
      const taskWithProject = createMockTask({
        id: 'task-project',
        title: 'Task with project',
        projectId: 'project-1',
      })
      render(<WeeklyReview {...defaultProps} tasks={[taskWithProject]} />)
      expect(screen.getByText('Big Project')).toBeInTheDocument()
    })

    it('does not show project when task has no project', () => {
      const taskWithoutProject = createMockTask({
        id: 'task-no-project',
        title: 'Task without project',
        projectId: undefined,
      })
      render(<WeeklyReview {...defaultProps} tasks={[taskWithoutProject]} />)
      expect(screen.queryByText('Big Project')).not.toBeInTheDocument()
    })

    it('shows defer badge when deferCount >= 2', () => {
      const highDeferTask = createMockTask({
        id: 'defer-task',
        title: 'Deferred task',
        deferCount: 3,
      })
      render(<WeeklyReview {...defaultProps} tasks={[highDeferTask]} />)
      // Badge shows the count number
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('does not show defer badge when deferCount < 2', () => {
      const lowDeferTask = createMockTask({
        id: 'low-defer-task',
        title: 'Low defer task',
        deferCount: 1,
      })
      render(<WeeklyReview {...defaultProps} tasks={[lowDeferTask]} />)
      expect(screen.queryByTitle(/Deferred/)).not.toBeInTheDocument()
    })
  })

  describe('task actions', () => {
    it('renders SchedulePopover for each task', () => {
      render(<WeeklyReview {...defaultProps} />)
      const scheduleButtons = screen.getAllByRole('button', { name: 'Schedule' })
      expect(scheduleButtons).toHaveLength(2)
    })

    it('renders PushDropdown for each task', () => {
      render(<WeeklyReview {...defaultProps} />)
      const pushButtons = screen.getAllByRole('button', { name: 'Push task' })
      expect(pushButtons).toHaveLength(2)
    })

    it('renders AssignPicker for each task', () => {
      render(<WeeklyReview {...defaultProps} />)
      const assignButtons = screen.getAllByRole('button', { name: 'Assign to' })
      expect(assignButtons).toHaveLength(2)
    })

    it('renders delete button for each task', () => {
      render(<WeeklyReview {...defaultProps} />)
      const deleteButtons = screen.getAllByTitle('Delete task')
      expect(deleteButtons).toHaveLength(2)
    })

    it('calls onDeleteTask when clicking delete button', () => {
      render(<WeeklyReview {...defaultProps} />)
      const deleteButtons = screen.getAllByTitle('Delete task')
      fireEvent.click(deleteButtons[0])
      expect(mockOnDeleteTask).toHaveBeenCalledWith('task-1')
    })
  })

  describe('closing modal', () => {
    it('calls onClose when clicking X button (with animation delay)', () => {
      render(<WeeklyReview {...defaultProps} />)
      const closeButton = screen.getAllByRole('button')[0]
      fireEvent.click(closeButton)
      vi.advanceTimersByTime(200)
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose on Escape key (with animation delay)', () => {
      render(<WeeklyReview {...defaultProps} />)
      fireEvent.keyDown(document, { key: 'Escape' })
      vi.advanceTimersByTime(200)
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when clicking backdrop (with animation delay)', () => {
      render(<WeeklyReview {...defaultProps} />)
      const backdrop = document.querySelector('.fixed.inset-0')
      if (backdrop) {
        fireEvent.mouseDown(backdrop)
      }
      vi.advanceTimersByTime(200)
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('does not close when clicking inside modal', () => {
      render(<WeeklyReview {...defaultProps} />)
      const modal = screen.getByText('Weekly Review').closest('div')
      if (modal) {
        fireEvent.mouseDown(modal)
      }
      vi.advanceTimersByTime(200)
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('integration with triage components', () => {
    it('opens SchedulePopover when clicking schedule button', () => {
      render(<WeeklyReview {...defaultProps} />)
      const scheduleButtons = screen.getAllByRole('button', { name: 'Schedule' })
      fireEvent.click(scheduleButtons[0])
      // SchedulePopover shows time slots or date options
      expect(screen.getByText('All Day')).toBeInTheDocument()
    })

    it('opens PushDropdown when clicking push button', () => {
      render(<WeeklyReview {...defaultProps} />)
      const pushButtons = screen.getAllByRole('button', { name: 'Push task' })
      fireEvent.click(pushButtons[0])
      expect(screen.getByText('Push until')).toBeInTheDocument()
    })

    it('opens AssignPicker when clicking assign button', () => {
      render(<WeeklyReview {...defaultProps} />)
      const assignButtons = screen.getAllByRole('button', { name: 'Assign to' })
      fireEvent.click(assignButtons[0])
      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('renders with backdrop blur', () => {
      render(<WeeklyReview {...defaultProps} />)
      const backdrop = document.querySelector('.fixed.inset-0')
      expect(backdrop).toBeInTheDocument()
      // Check inline style for backdrop filter
      expect(backdrop).toHaveStyle({ backdropFilter: 'blur(8px)' })
    })

    it('modal has max width constraint', () => {
      render(<WeeklyReview {...defaultProps} />)
      const modal = document.querySelector('.max-w-lg')
      expect(modal).toBeInTheDocument()
    })

    it('uses rounded-3xl for premium feel', () => {
      render(<WeeklyReview {...defaultProps} />)
      const modal = document.querySelector('.rounded-3xl')
      expect(modal).toBeInTheDocument()
    })
  })

  describe('progress tracking', () => {
    it('shows progress bar when items are processed', () => {
      render(<WeeklyReview {...defaultProps} />)
      // Initially no progress bar
      expect(screen.queryByText('done')).not.toBeInTheDocument()

      // Trigger a task action (delete)
      const deleteButtons = screen.getAllByTitle('Delete task')
      fireEvent.click(deleteButtons[0])

      // Now should show progress
      expect(screen.getByText('1 done')).toBeInTheDocument()
    })
  })
})
