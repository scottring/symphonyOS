import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectCard } from './ProjectCard'
import { createMockProject } from '@/test/mocks/factories'

describe('ProjectCard', () => {
  const mockOnUnlink = vi.fn()
  const mockOnUpdate = vi.fn()
  const mockOnOpen = vi.fn()

  const mockProject = createMockProject({
    id: 'project-1',
    name: 'Test Project',
    status: 'active',
    notes: 'Some project notes',
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders project name', () => {
      render(<ProjectCard project={mockProject} />)

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('renders project notes when provided', () => {
      render(<ProjectCard project={mockProject} />)

      expect(screen.getByText('Some project notes')).toBeInTheDocument()
    })

    it('does not show notes section when notes are empty', () => {
      const projectWithoutNotes = createMockProject({
        ...mockProject,
        notes: undefined,
      })
      render(<ProjectCard project={projectWithoutNotes} />)

      expect(screen.queryByText('Some project notes')).not.toBeInTheDocument()
    })

    it('renders folder icon', () => {
      render(<ProjectCard project={mockProject} />)

      // Verify icon container is present
      const iconContainer = document.querySelector('.bg-blue-200')
      expect(iconContainer).toBeInTheDocument()
      expect(iconContainer?.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('status display', () => {
    it('shows Active badge for active status', () => {
      const activeProject = createMockProject({ ...mockProject, status: 'active' })
      render(<ProjectCard project={activeProject} />)

      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('shows Not Started badge for not_started status', () => {
      const notStartedProject = createMockProject({ ...mockProject, status: 'not_started' })
      render(<ProjectCard project={notStartedProject} />)

      expect(screen.getByText('Not Started')).toBeInTheDocument()
    })

    it('shows Completed badge for completed status', () => {
      const completedProject = createMockProject({ ...mockProject, status: 'completed' })
      render(<ProjectCard project={completedProject} />)

      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('applies blue styling for active status', () => {
      const activeProject = createMockProject({ ...mockProject, status: 'active' })
      render(<ProjectCard project={activeProject} />)

      const badge = screen.getByText('Active')
      expect(badge).toHaveClass('bg-blue-100')
      expect(badge).toHaveClass('text-blue-700')
    })

    it('applies neutral styling for not_started status', () => {
      const notStartedProject = createMockProject({ ...mockProject, status: 'not_started' })
      render(<ProjectCard project={notStartedProject} />)

      const badge = screen.getByText('Not Started')
      expect(badge).toHaveClass('bg-neutral-100')
      expect(badge).toHaveClass('text-neutral-600')
    })

    it('applies green styling for completed status', () => {
      const completedProject = createMockProject({ ...mockProject, status: 'completed' })
      render(<ProjectCard project={completedProject} />)

      const badge = screen.getByText('Completed')
      expect(badge).toHaveClass('bg-green-100')
      expect(badge).toHaveClass('text-green-700')
    })
  })

  describe('action buttons', () => {
    it('shows open button when onOpen is provided', () => {
      render(<ProjectCard project={mockProject} onOpen={mockOnOpen} />)

      expect(screen.getByLabelText('Open project')).toBeInTheDocument()
    })

    it('does not show open button when onOpen is not provided', () => {
      render(<ProjectCard project={mockProject} />)

      expect(screen.queryByLabelText('Open project')).not.toBeInTheDocument()
    })

    it('calls onOpen when clicking open button', () => {
      render(<ProjectCard project={mockProject} onOpen={mockOnOpen} />)

      fireEvent.click(screen.getByLabelText('Open project'))

      expect(mockOnOpen).toHaveBeenCalled()
    })

    it('shows edit button when onUpdate is provided', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      expect(screen.getByLabelText('Edit project')).toBeInTheDocument()
    })

    it('does not show edit button when onUpdate is not provided', () => {
      render(<ProjectCard project={mockProject} />)

      expect(screen.queryByLabelText('Edit project')).not.toBeInTheDocument()
    })

    it('shows unlink button when onUnlink is provided', () => {
      render(<ProjectCard project={mockProject} onUnlink={mockOnUnlink} />)

      expect(screen.getByLabelText('Unlink project')).toBeInTheDocument()
    })

    it('does not show unlink button when onUnlink is not provided', () => {
      render(<ProjectCard project={mockProject} />)

      expect(screen.queryByLabelText('Unlink project')).not.toBeInTheDocument()
    })

    it('calls onUnlink when clicking unlink button', () => {
      render(<ProjectCard project={mockProject} onUnlink={mockOnUnlink} />)

      fireEvent.click(screen.getByLabelText('Unlink project'))

      expect(mockOnUnlink).toHaveBeenCalled()
    })
  })

  describe('edit functionality', () => {
    it('enters edit mode when clicking edit button', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Some project notes')).toBeInTheDocument()
    })

    it('shows edit form labels', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Notes (optional)')).toBeInTheDocument()
    })

    it('shows Cancel and Save buttons in edit mode', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('shows status toggle buttons in edit mode', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      // Look for the status buttons in the toggle
      const buttons = screen.getAllByRole('button')
      const statusButtons = buttons.filter(
        (btn) =>
          btn.textContent === 'Not Started' ||
          btn.textContent === 'Active' ||
          btn.textContent === 'Completed'
      )
      expect(statusButtons).toHaveLength(3)
    })

    it('pre-selects current status in edit mode', () => {
      const activeProject = createMockProject({ ...mockProject, status: 'active' })
      render(<ProjectCard project={activeProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      // Active button should have blue styling
      const activeButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent === 'Active'
      )
      expect(activeButton).toHaveClass('bg-blue-100')
    })

    it('cancels edit mode when clicking Cancel', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should be back to view mode
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('calls onUpdate when saving', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Test Project'), {
        target: { value: 'Updated Project' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith('project-1', {
        name: 'Updated Project',
        status: 'active',
        notes: 'Some project notes',
      })
    })

    it('trims whitespace when saving', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Test Project'), {
        target: { value: '  Trimmed Name  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          name: 'Trimmed Name',
        })
      )
    })

    it('sets notes to undefined when cleared', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Some project notes'), {
        target: { value: '' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          notes: undefined,
        })
      )
    })

    it('disables Save button when name is empty', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Test Project'), {
        target: { value: '' },
      })

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('disables Save button when name is whitespace only', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Test Project'), {
        target: { value: '   ' },
      })

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('exits edit mode after saving', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })
  })

  describe('status selection in edit mode', () => {
    it('changes status to not_started when clicking Not Started button', () => {
      const activeProject = createMockProject({ ...mockProject, status: 'active' })
      render(<ProjectCard project={activeProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      // Click Not Started button
      const notStartedButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent === 'Not Started'
      )
      fireEvent.click(notStartedButton!)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          status: 'not_started',
        })
      )
    })

    it('changes status to active when clicking Active button', () => {
      const notStartedProject = createMockProject({ ...mockProject, status: 'not_started' })
      render(<ProjectCard project={notStartedProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      // Click Active button
      const activeButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent === 'Active'
      )
      fireEvent.click(activeButton!)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          status: 'active',
        })
      )
    })

    it('changes status to completed when clicking Completed button', () => {
      const activeProject = createMockProject({ ...mockProject, status: 'active' })
      render(<ProjectCard project={activeProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      // Click Completed button
      const completedButton = screen.getAllByRole('button').find(
        (btn) => btn.textContent === 'Completed'
      )
      fireEvent.click(completedButton!)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(mockOnUpdate).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          status: 'completed',
        })
      )
    })
  })

  describe('edit form input handling', () => {
    it('updates name input value', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      const nameInput = screen.getByDisplayValue('Test Project') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'New Name' } })

      expect(nameInput.value).toBe('New Name')
    })

    it('updates notes textarea value', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      const notesTextarea = screen.getByDisplayValue('Some project notes') as HTMLTextAreaElement
      fireEvent.change(notesTextarea, { target: { value: 'Updated notes' } })

      expect(notesTextarea.value).toBe('Updated notes')
    })

    it('shows placeholder in notes textarea', () => {
      const projectWithoutNotes = createMockProject({
        ...mockProject,
        notes: undefined,
      })
      render(<ProjectCard project={projectWithoutNotes} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))

      expect(screen.getByPlaceholderText('Add notes about this project...')).toBeInTheDocument()
    })

    it('clears form state when canceling', () => {
      render(<ProjectCard project={mockProject} onUpdate={mockOnUpdate} />)

      fireEvent.click(screen.getByLabelText('Edit project'))
      fireEvent.change(screen.getByDisplayValue('Test Project'), {
        target: { value: 'Changed Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Re-enter edit mode
      fireEvent.click(screen.getByLabelText('Edit project'))
      expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument()
    })
  })
})
