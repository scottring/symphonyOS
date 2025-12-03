import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { DetailPanel } from './DetailPanel'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'

const mockTask: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Test task',
  completed: false,
  originalTask: {
    id: '1',
    title: 'Test task',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}

const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Existing Project',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('DetailPanel', () => {
  describe('Project creation flow', () => {
    it('opens project picker when clicking Add project', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
        />
      )

      // Click on "Add project"
      await user.click(screen.getByText('Add project'))

      // Project picker should be visible
      expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument()
      expect(screen.getByText('Existing Project')).toBeInTheDocument()
    })

    it('shows New button in project picker when onAddProject is provided', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
          onAddProject={vi.fn()}
        />
      )

      await user.click(screen.getByText('Add project'))

      // New button should be visible
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    it('transitions to create mode when clicking New button', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
          onAddProject={vi.fn()}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      // Should show create form
      expect(screen.getByText('Create new project')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Project name...')).toBeInTheDocument()
    })

    it('pre-fills new project name with search text', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
          onAddProject={vi.fn()}
        />
      )

      await user.click(screen.getByText('Add project'))

      // Type in search box
      const searchInput = screen.getByPlaceholderText('Search projects...')
      await user.type(searchInput, 'My New Project')

      // Click New button
      await user.click(screen.getByRole('button', { name: /new/i }))

      // New project name input should be pre-filled
      const nameInput = screen.getByPlaceholderText('Project name...')
      expect(nameInput).toHaveValue('My New Project')
    })

    it('creates and links project when Create button is clicked', async () => {
      const onAddProject = vi.fn().mockResolvedValue({
        id: 'new-project-1',
        name: 'New Project',
        status: 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const onUpdate = vi.fn()

      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
          onAddProject={onAddProject}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      // Enter project name
      const nameInput = screen.getByPlaceholderText('Project name...')
      await user.type(nameInput, 'New Project')

      // Click Create
      await user.click(screen.getByRole('button', { name: 'Create' }))

      // Should call onAddProject
      expect(onAddProject).toHaveBeenCalledWith({ name: 'New Project' })

      // After creation, should update task with projectId
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('1', { projectId: 'new-project-1' })
      })
    })

    it('shows loading state during project creation', async () => {
      // Create a promise that we can control
      let resolveCreate: (value: Project) => void
      const onAddProject = vi.fn().mockImplementation(() => {
        return new Promise<Project>((resolve) => {
          resolveCreate = resolve
        })
      })

      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
          onAddProject={onAddProject}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      const nameInput = screen.getByPlaceholderText('Project name...')
      await user.type(nameInput, 'New Project')

      await user.click(screen.getByRole('button', { name: 'Create' }))

      // Should show loading state
      expect(screen.getByText('Creating...')).toBeInTheDocument()

      // Input should be disabled
      expect(nameInput).toBeDisabled()

      // Resolve the promise
      resolveCreate!({
        id: 'new-project-1',
        name: 'New Project',
        status: 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    it('returns to picker view when Cancel is clicked in create mode', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
          onAddProject={vi.fn()}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      // Should be in create mode
      expect(screen.getByText('Create new project')).toBeInTheDocument()

      // Click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should return to picker view (project picker closed)
      expect(screen.queryByText('Create new project')).not.toBeInTheDocument()
    })

    it('creates project when Enter is pressed in name input', async () => {
      const onAddProject = vi.fn().mockResolvedValue({
        id: 'new-project-1',
        name: 'Enter Project',
        status: 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
          onAddProject={onAddProject}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      const nameInput = screen.getByPlaceholderText('Project name...')
      await user.type(nameInput, 'Enter Project')
      await user.keyboard('{Enter}')

      expect(onAddProject).toHaveBeenCalledWith({ name: 'Enter Project' })
    })

    it('cancels creation and clears input when Escape is pressed', async () => {
      const onAddProject = vi.fn()

      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
          onAddProject={onAddProject}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      const nameInput = screen.getByPlaceholderText('Project name...')
      await user.type(nameInput, 'Escape Project')
      await user.keyboard('{Escape}')

      // Should not call onAddProject
      expect(onAddProject).not.toHaveBeenCalled()

      // Should return to picker (create form gone)
      expect(screen.queryByText('Create new project')).not.toBeInTheDocument()
    })

    it('does not create project when name is empty', async () => {
      const onAddProject = vi.fn()

      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
          onAddProject={onAddProject}
        />
      )

      await user.click(screen.getByText('Add project'))
      await user.click(screen.getByRole('button', { name: /new/i }))

      // Create button should be disabled when input is empty
      const createButton = screen.getByRole('button', { name: 'Create' })
      expect(createButton).toBeDisabled()

      // Click it anyway (shouldn't do anything)
      await user.click(createButton)

      expect(onAddProject).not.toHaveBeenCalled()
    })
  })
})
