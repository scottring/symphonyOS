import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { InboxTriageModal } from './InboxTriageModal'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'

const mockTask: Task = {
  id: 'task-1',
  title: 'Test inbox item',
  completed: false,
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
}

const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Test Project',
    status: 'in_progress',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
]

const mockFamilyMembers: FamilyMember[] = [
  {
    id: 'member-1',
    user_id: 'user-1',
    name: 'Scott',
    initials: 'SK',
    color: 'blue',
    avatar_url: null,
    is_full_user: true,
    display_order: 0,
    created_at: '2024-01-01',
  },
  {
    id: 'member-2',
    user_id: 'user-1',
    name: 'Iris',
    initials: 'IK',
    color: 'purple',
    avatar_url: null,
    is_full_user: false,
    display_order: 1,
    created_at: '2024-01-01',
  },
]

describe('InboxTriageModal', () => {
  const defaultProps = {
    task: mockTask,
    isOpen: true,
    onClose: vi.fn(),
    onProcessAsTask: vi.fn(),
    onConvertToProject: vi.fn(),
    onDelete: vi.fn(),
    projects: mockProjects,
    familyMembers: mockFamilyMembers,
    currentUserId: 'member-1',
  }

  it('renders the modal when open', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Test inbox item')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<InboxTriageModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Test inbox item')).not.toBeInTheDocument()
  })

  it('shows category selection buttons', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Chore')).toBeInTheDocument()
    expect(screen.getByText('Errand')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
  })

  it('shows when/schedule options', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Next Week')).toBeInTheDocument()
    expect(screen.getByText('Someday/Maybe')).toBeInTheDocument()
  })

  it('shows family members for assignment', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })

  it('shows project picker', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<InboxTriageModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<InboxTriageModal {...defaultProps} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('calls onProcessAsTask with category when Done is clicked', () => {
    const onProcessAsTask = vi.fn()
    render(<InboxTriageModal {...defaultProps} onProcessAsTask={onProcessAsTask} />)

    // Click Today to set a date
    fireEvent.click(screen.getByText('Today'))
    // Click Done
    fireEvent.click(screen.getByText('Done'))
    
    expect(onProcessAsTask).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'task' }) // Default category
    )
  })

  it('changes category when category button is clicked', () => {
    const onProcessAsTask = vi.fn()
    render(<InboxTriageModal {...defaultProps} onProcessAsTask={onProcessAsTask} />)

    // Click Chore category
    fireEvent.click(screen.getByText('Chore'))
    fireEvent.click(screen.getByText('Done'))

    expect(onProcessAsTask).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'chore' })
    )
  })

  it('shows Create Project button prominently', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Create project from this task')).toBeInTheDocument()
  })

  it('opens create project modal when Create Project button is clicked', () => {
    render(<InboxTriageModal {...defaultProps} />)

    fireEvent.click(screen.getByText('Create project from this task'))
    // The modal should open - check for the project name input
    expect(screen.getByPlaceholderText('Project name')).toBeInTheDocument()
    expect(screen.getByText('Add at least one task to get started')).toBeInTheDocument()
  })

  it('toggles family member selection', () => {
    const onProcessAsTask = vi.fn()
    render(<InboxTriageModal {...defaultProps} onProcessAsTask={onProcessAsTask} currentUserId={undefined} />)

    // Click Iris to select her
    fireEvent.click(screen.getByText('Iris'))
    fireEvent.click(screen.getByText('Done'))

    expect(onProcessAsTask).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: 'member-2' })
    )
  })

  it('shows location field for errand category', () => {
    render(<InboxTriageModal {...defaultProps} />)
    
    // Select Errand category
    fireEvent.click(screen.getByText('Errand'))
    
    // Location field should appear
    expect(screen.getByPlaceholderText('Store, address, etc.')).toBeInTheDocument()
  })

  it('shows time fields for event category', () => {
    render(<InboxTriageModal {...defaultProps} />)
    
    // Select Event category
    fireEvent.click(screen.getByText('Event'))
    
    // Time fields should appear
    expect(screen.getByText('Start Time')).toBeInTheDocument()
    expect(screen.getByText('End Time')).toBeInTheDocument()
  })

  it('hides Someday/Maybe for event category', () => {
    render(<InboxTriageModal {...defaultProps} />)
    
    // Initially Someday/Maybe is visible
    expect(screen.getByText('Someday/Maybe')).toBeInTheDocument()
    
    // Select Event category
    fireEvent.click(screen.getByText('Event'))
    
    // Someday/Maybe should be hidden for events
    expect(screen.queryByText('Someday/Maybe')).not.toBeInTheDocument()
  })
})
