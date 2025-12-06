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
}

const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Test Project',
    status: 'active',
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

  it('shows type selection buttons', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Task')).toBeInTheDocument()
    // 'Project' appears as both a type button and project picker label
    expect(screen.getAllByText('Project').length).toBeGreaterThanOrEqual(1)
  })

  it('shows when options for task type', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Next Week')).toBeInTheDocument()
    expect(screen.getByText('Someday/Maybe')).toBeInTheDocument()
  })

  it('shows domain selection', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('Family')).toBeInTheDocument()
  })

  it('shows family members for assignment', () => {
    render(<InboxTriageModal {...defaultProps} />)
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })

  it('shows project picker for task type', () => {
    render(<InboxTriageModal {...defaultProps} />)
    // Project section should be visible
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

  it('calls onProcessAsTask when Done is clicked with task type', () => {
    const onProcessAsTask = vi.fn()
    render(<InboxTriageModal {...defaultProps} onProcessAsTask={onProcessAsTask} />)

    // Click Today to set a date
    fireEvent.click(screen.getByText('Today'))

    // Click Done
    fireEvent.click(screen.getByText('Done'))
    expect(onProcessAsTask).toHaveBeenCalled()
  })

  it('switches to project mode when Project type is selected', () => {
    render(<InboxTriageModal {...defaultProps} />)

    // Click the Project type button (first one, in the Type section)
    const projectButtons = screen.getAllByText('Project')
    fireEvent.click(projectButtons[0])

    // Done button should now say "Create Project"
    expect(screen.getByText('Create Project')).toBeInTheDocument()
    // When picker should be hidden for projects
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('calls onConvertToProject when Done is clicked with project type', () => {
    const onConvertToProject = vi.fn()
    render(<InboxTriageModal {...defaultProps} onConvertToProject={onConvertToProject} />)

    // Click the Project type button (first one, in the Type section)
    const projectButtons = screen.getAllByText('Project')
    fireEvent.click(projectButtons[0])
    fireEvent.click(screen.getByText('Create Project'))

    expect(onConvertToProject).toHaveBeenCalledWith('Test inbox item', undefined)
  })

  it('selects domain when domain button is clicked', () => {
    const onProcessAsTask = vi.fn()
    render(<InboxTriageModal {...defaultProps} onProcessAsTask={onProcessAsTask} />)

    fireEvent.click(screen.getByText('Work'))
    fireEvent.click(screen.getByText('Done'))

    expect(onProcessAsTask).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'work' })
    )
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
})
