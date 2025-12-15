import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectsList } from './ProjectsList'
import { createMockProject } from '@/test/mocks/factories'

describe('ProjectsList', () => {
  const mockOnSelectProject = vi.fn()
  const mockOnAddProject = vi.fn()

  const mockProjects = [
    createMockProject({ id: 'project-1', name: 'In Progress Project', status: 'in_progress' }),
    createMockProject({ id: 'project-2', name: 'Not Started Project', status: 'not_started' }),
    createMockProject({ id: 'project-3', name: 'Completed Project', status: 'completed' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnAddProject.mockResolvedValue(createMockProject({ id: 'new-project', name: 'New Project' }))
  })

  describe('rendering', () => {
    it('renders header with title', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('Projects')).toBeInTheDocument()
    })

    it('renders project count', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      // Count is in a separate element from text
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText(/projects/)).toBeInTheDocument()
    })

    it('shows singular "project" for one project', () => {
      render(<ProjectsList projects={[mockProjects[0]]} onSelectProject={mockOnSelectProject} />)

      // Count is in a separate element from text
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText(/project$/)).toBeInTheDocument()
    })

    it('renders New button when onAddProject is provided', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument()
    })

    it('does not render New button when onAddProject is not provided', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.queryByRole('button', { name: /New/i })).not.toBeInTheDocument()
    })

    it('renders all project names', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('In Progress Project')).toBeInTheDocument()
      expect(screen.getByText('Not Started Project')).toBeInTheDocument()
      expect(screen.getByText('Completed Project')).toBeInTheDocument()
    })
  })

  describe('project sorting', () => {
    it('sorts projects: in_progress first, then not_started, then completed', () => {
      const unsortedProjects = [
        createMockProject({ id: 'p1', name: 'Completed', status: 'completed' }),
        createMockProject({ id: 'p2', name: 'In Progress', status: 'in_progress' }),
        createMockProject({ id: 'p3', name: 'Not Started', status: 'not_started' }),
      ]

      render(<ProjectsList projects={unsortedProjects} onSelectProject={mockOnSelectProject} />)

      const projectButtons = screen.getAllByRole('button').filter(btn =>
        btn.textContent?.includes('In Progress') ||
        btn.textContent?.includes('Not Started') ||
        btn.textContent?.includes('Completed')
      )

      // First visible project should be In Progress
      expect(projectButtons[0]).toHaveTextContent('In Progress')
      expect(projectButtons[1]).toHaveTextContent('Not Started')
      expect(projectButtons[2]).toHaveTextContent('Completed')
    })
  })

  describe('status display', () => {
    it('shows In Progress status label for in_progress projects', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })

    it('shows Not Started status label for not_started projects', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('Not Started')).toBeInTheDocument()
    })

    it('shows Completed status label for completed projects', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('applies primary styling for in_progress status', () => {
      const inProgressProject = [createMockProject({ status: 'in_progress' })]
      render(<ProjectsList projects={inProgressProject} onSelectProject={mockOnSelectProject} />)

      const badge = screen.getByText('In Progress')
      expect(badge).toHaveClass('bg-primary-50')
      expect(badge).toHaveClass('text-primary-700')
    })

    it('applies neutral styling for not_started status', () => {
      const notStartedProject = [createMockProject({ status: 'not_started' })]
      render(<ProjectsList projects={notStartedProject} onSelectProject={mockOnSelectProject} />)

      const badge = screen.getByText('Not Started')
      expect(badge).toHaveClass('bg-neutral-100')
      expect(badge).toHaveClass('text-neutral-600')
    })

    it('applies sage styling for completed status', () => {
      const completedProject = [createMockProject({ status: 'completed' })]
      render(<ProjectsList projects={completedProject} onSelectProject={mockOnSelectProject} />)

      const badge = screen.getByText('Completed')
      expect(badge).toHaveClass('bg-sage-50')
      expect(badge).toHaveClass('text-sage-600')
    })
  })

  describe('project notes', () => {
    it('displays project notes when available', () => {
      const projectWithNotes = [createMockProject({ notes: 'Some project notes' })]
      render(<ProjectsList projects={projectWithNotes} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('Some project notes')).toBeInTheDocument()
    })

    it('does not display notes section when notes are empty', () => {
      const projectWithoutNotes = [createMockProject({ notes: undefined })]
      render(<ProjectsList projects={projectWithoutNotes} onSelectProject={mockOnSelectProject} />)

      // Project should render without notes section
      expect(screen.queryByText('notes')).not.toBeInTheDocument()
    })
  })

  describe('project selection', () => {
    it('calls onSelectProject with project id when clicking a project', () => {
      render(<ProjectsList projects={mockProjects} onSelectProject={mockOnSelectProject} />)

      fireEvent.click(screen.getByText('In Progress Project'))

      expect(mockOnSelectProject).toHaveBeenCalledWith('project-1')
    })
  })

  describe('empty state', () => {
    it('shows empty state when no projects', () => {
      render(<ProjectsList projects={[]} onSelectProject={mockOnSelectProject} />)

      expect(screen.getByText('No projects yet')).toBeInTheDocument()
      expect(screen.getByText('Create a project to organize your tasks')).toBeInTheDocument()
    })

    it('shows project count as 0', () => {
      render(<ProjectsList projects={[]} onSelectProject={mockOnSelectProject} />)

      // Count is in a separate element from text
      expect(screen.getByText('0')).toBeInTheDocument()
      // "projects" appears in both header count and "No projects yet"
      expect(screen.getAllByText(/projects/).length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('project creation', () => {
    it('shows creation form when clicking New button', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.getByPlaceholderText("What's the project?")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument()
    })

    it('hides New button when creation form is open', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.queryByRole('button', { name: /New/i })).not.toBeInTheDocument()
    })

    it('closes form when clicking Cancel', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByPlaceholderText("What's the project?")).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument()
    })

    it('clears input when closing form', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'New Project Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      // Reopen form
      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the project?") as HTMLInputElement
      expect(input.value).toBe('')
    })

    it('calls onAddProject when submitting form', async () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'My New Project' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      await waitFor(() => {
        expect(mockOnAddProject).toHaveBeenCalledWith({ name: 'My New Project' })
      })
    })

    it('trims whitespace from project name', async () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: '  Trimmed Name  ' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      await waitFor(() => {
        expect(mockOnAddProject).toHaveBeenCalledWith({ name: 'Trimmed Name' })
      })
    })

    it('does not submit with empty name', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      expect(mockOnAddProject).not.toHaveBeenCalled()
    })

    it('disables Create button when name is empty', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))

      expect(screen.getByRole('button', { name: 'Create Project' })).toBeDisabled()
    })

    it('enables Create button when name is provided', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'Project Name' },
      })

      expect(screen.getByRole('button', { name: 'Create Project' })).not.toBeDisabled()
    })

    it('shows Creating... while saving', async () => {
      let resolveCreate: (value: unknown) => void
      mockOnAddProject.mockImplementation(
        () => new Promise((resolve) => { resolveCreate = resolve })
      )

      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'Project Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      expect(screen.getByText('Creating...')).toBeInTheDocument()

      // Resolve the promise and wait for state update to complete
      resolveCreate!(createMockProject({}))
      await waitFor(() => {
        expect(screen.queryByText('Creating...')).not.toBeInTheDocument()
      })
    })

    it('closes form on successful creation', async () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'Project Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("What's the project?")).not.toBeInTheDocument()
      })
    })

    it('keeps form open on failed creation', async () => {
      mockOnAddProject.mockResolvedValue(null)

      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      fireEvent.change(screen.getByPlaceholderText("What's the project?"), {
        target: { value: 'Project Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText("What's the project?")).toBeInTheDocument()
      })
    })
  })

  describe('keyboard interactions', () => {
    it('submits form on Enter key', async () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the project?")
      fireEvent.change(input, { target: { value: 'Enter Project' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockOnAddProject).toHaveBeenCalledWith({ name: 'Enter Project' })
      })
    })

    it('closes form on Escape key', () => {
      render(
        <ProjectsList
          projects={mockProjects}
          onSelectProject={mockOnSelectProject}
          onAddProject={mockOnAddProject}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /New/i }))
      const input = screen.getByPlaceholderText("What's the project?")
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.queryByPlaceholderText("What's the project?")).not.toBeInTheDocument()
    })
  })
})
