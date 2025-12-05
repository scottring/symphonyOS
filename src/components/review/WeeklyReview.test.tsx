import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  })

  describe('rendering', () => {
    it('renders modal with header', () => {
      render(<WeeklyReview {...defaultProps} />)

      expect(screen.getByText('Weekly Review')).toBeInTheDocument()
    })

    it('renders close button in header', () => {
      render(<WeeklyReview {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      // First button should be the close X button
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
  })

  describe('empty state', () => {
    it('shows completion message when no tasks', () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)

      expect(screen.getByText('Review Complete')).toBeInTheDocument()
      expect(screen.getByText('All items have temporal homes.')).toBeInTheDocument()
    })

    it('shows Done button in empty state', () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)

      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    it('calls onClose when clicking Done button', () => {
      render(<WeeklyReview {...defaultProps} tasks={[]} />)

      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

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

      expect(screen.getByText('#Big Project')).toBeInTheDocument()
    })

    it('does not show project when task has no project', () => {
      const taskWithoutProject = createMockTask({
        id: 'task-no-project',
        title: 'Task without project',
        projectId: undefined,
      })

      render(<WeeklyReview {...defaultProps} tasks={[taskWithoutProject]} />)

      expect(screen.queryByText(/#/)).not.toBeInTheDocument()
    })

    it('shows defer badge when deferCount >= 2', () => {
      const highDeferTask = createMockTask({
        id: 'defer-task',
        title: 'Deferred task',
        deferCount: 3,
      })

      render(<WeeklyReview {...defaultProps} tasks={[highDeferTask]} />)

      expect(screen.getByText('↻3')).toBeInTheDocument()
    })

    it('does not show defer badge when deferCount < 2', () => {
      const lowDeferTask = createMockTask({
        id: 'low-defer-task',
        title: 'Low defer task',
        deferCount: 1,
      })

      render(<WeeklyReview {...defaultProps} tasks={[lowDeferTask]} />)

      expect(screen.queryByText('↻1')).not.toBeInTheDocument()
    })

    it('does not show defer badge when deferCount is undefined', () => {
      const noDeferTask = createMockTask({
        id: 'no-defer-task',
        title: 'No defer task',
        deferCount: undefined,
      })

      render(<WeeklyReview {...defaultProps} tasks={[noDeferTask]} />)

      expect(screen.queryByText(/↻/)).not.toBeInTheDocument()
    })
  })

  describe('task actions', () => {
    it('renders WhenPicker for each task', () => {
      render(<WeeklyReview {...defaultProps} />)

      // Should have 2 "Set date" buttons (one per task)
      const dateButtons = screen.getAllByRole('button', { name: 'Set date' })
      expect(dateButtons).toHaveLength(2)
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
    it('calls onClose when clicking X button', () => {
      render(<WeeklyReview {...defaultProps} />)

      // Find the close button (X) in the header
      const closeButton = screen.getAllByRole('button')[0]
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose on Escape key', () => {
      render(<WeeklyReview {...defaultProps} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when clicking backdrop', async () => {
      const user = userEvent.setup()

      render(<WeeklyReview {...defaultProps} />)

      // Click the backdrop (the fixed overlay)
      const backdrop = document.querySelector('.fixed.inset-0')
      if (backdrop) {
        await user.click(backdrop)
      }

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('does not close when clicking inside modal', async () => {
      const user = userEvent.setup()

      render(<WeeklyReview {...defaultProps} />)

      // Click inside the modal content
      await user.click(screen.getByText('Weekly Review'))

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('integration with triage components', () => {
    it('opens WhenPicker when clicking date button', () => {
      render(<WeeklyReview {...defaultProps} />)

      const dateButtons = screen.getAllByRole('button', { name: 'Set date' })
      fireEvent.click(dateButtons[0])

      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
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

      const backdrop = document.querySelector('.backdrop-blur-sm')
      expect(backdrop).toBeInTheDocument()
    })

    it('modal has max width and height constraints', () => {
      render(<WeeklyReview {...defaultProps} />)

      const modal = document.querySelector('.max-w-lg')
      expect(modal).toBeInTheDocument()

      const maxHeight = document.querySelector('[class*="max-h-"]')
      expect(maxHeight).toBeInTheDocument()
    })
  })
})
