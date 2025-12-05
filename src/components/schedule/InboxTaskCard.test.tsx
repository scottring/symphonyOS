import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxTaskCard } from './InboxTaskCard'
import { createMockTask, createMockProject, createMockContact, createMockFamilyMember } from '@/test/mocks/factories'

describe('InboxTaskCard', () => {
  const mockOnUpdate = vi.fn()
  const mockOnPush = vi.fn()
  const mockOnSelect = vi.fn()
  const mockOnSearchContacts = vi.fn()
  const mockOnAssign = vi.fn()

  const mockTask = createMockTask({
    id: 'task-1',
    title: 'Test task',
    completed: false,
  })

  const mockProjects = [
    createMockProject({ id: 'project-1', name: 'My Project' }),
  ]

  const mockContacts = [
    createMockContact({ id: 'contact-1', name: 'John Doe' }),
  ]

  const mockFamilyMembers = [
    createMockFamilyMember({ id: 'member-1', name: 'Alice' }),
  ]

  const defaultProps = {
    task: mockTask,
    onUpdate: mockOnUpdate,
    onPush: mockOnPush,
    onSelect: mockOnSelect,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSearchContacts.mockReturnValue([])
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

  describe('triage icons', () => {
    it('renders WhenPicker', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Set date' })).toBeInTheDocument()
    })

    it('renders PushDropdown', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Push task' })).toBeInTheDocument()
    })

    it('renders AssignPicker', () => {
      render(<InboxTaskCard {...defaultProps} />)

      expect(screen.getByRole('button', { name: 'Assign to' })).toBeInTheDocument()
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

    it('does not render chip row when no project, contact, or member', () => {
      render(<InboxTaskCard {...defaultProps} projects={mockProjects} />)

      // No chips row should be rendered
      const container = document.querySelector('.hidden.md\\:flex')
      expect(container).not.toBeInTheDocument()
    })
  })

  describe('contact chip', () => {
    // Note: Chips are hidden on mobile (hidden md:flex class)

    it('renders chip row when task has contact', () => {
      const taskWithContact = createMockTask({
        ...mockTask,
        contactId: 'contact-1',
      })

      render(
        <InboxTaskCard
          {...defaultProps}
          task={taskWithContact}
          contacts={mockContacts}
        />
      )

      // The chip row exists in DOM even if hidden by CSS
      const container = document.querySelector('.hidden.md\\:flex')
      expect(container).toBeInTheDocument()
    })
  })

  describe('family member chip', () => {
    // Note: Chips are hidden on mobile (hidden md:flex class)

    it('renders chip row when task has assignee', () => {
      const taskWithAssignee = createMockTask({
        ...mockTask,
        assignedTo: 'member-1',
      })

      render(
        <InboxTaskCard
          {...defaultProps}
          task={taskWithAssignee}
          familyMembers={mockFamilyMembers}
          onAssign={mockOnAssign}
        />
      )

      // The chip row exists in DOM even if hidden by CSS
      const container = document.querySelector('.hidden.md\\:flex')
      expect(container).toBeInTheDocument()
    })
  })

  describe('defer badge', () => {
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

  describe('family member dropdown', () => {
    it('renders AssigneeDropdown when family members provided', () => {
      render(
        <InboxTaskCard
          {...defaultProps}
          familyMembers={mockFamilyMembers}
          onAssign={mockOnAssign}
        />
      )

      // Look for the assignee dropdown button (distinct from AssignPicker)
      const buttons = screen.getAllByRole('button')
      // Should have multiple buttons including assignee dropdown
      expect(buttons.length).toBeGreaterThan(4)
    })

    it('does not render AssigneeDropdown when no family members', () => {
      render(
        <InboxTaskCard
          {...defaultProps}
          familyMembers={[]}
          onAssign={mockOnAssign}
        />
      )

      // Should only have the standard buttons
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBe(5) // checkbox, title, when, push, assign
    })

    it('does not render AssigneeDropdown when onAssign not provided', () => {
      render(
        <InboxTaskCard
          {...defaultProps}
          familyMembers={mockFamilyMembers}
        />
      )

      // Should only have the standard buttons
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBe(5) // checkbox, title, when, push, assign
    })
  })

  describe('triage picker interactions', () => {
    it('WhenPicker updates task when date is selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open WhenPicker
      fireEvent.click(screen.getByRole('button', { name: 'Set date' }))
      // Select Today
      fireEvent.click(screen.getByText('Today'))
      // Select All Day
      fireEvent.click(screen.getByText('All Day'))

      expect(mockOnUpdate).toHaveBeenCalledWith(expect.objectContaining({
        scheduledFor: expect.any(Date),
        isAllDay: true,
        deferredUntil: undefined,
      }))
    })

    it('PushDropdown calls onPush when date selected', () => {
      render(<InboxTaskCard {...defaultProps} />)

      // Open PushDropdown
      fireEvent.click(screen.getByRole('button', { name: 'Push task' }))
      // Select Tomorrow
      fireEvent.click(screen.getByText('Tomorrow'))

      expect(mockOnPush).toHaveBeenCalledWith(expect.any(Date))
    })
  })
})
