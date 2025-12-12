import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ProjectView } from './ProjectView'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

const mockProject: Project = {
  id: 'project-1',
  name: 'Test Project',
  status: 'in_progress',
  notes: 'Some project notes',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Task 1',
    completed: false,
    projectId: 'project-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'task-2',
    title: 'Task 2',
    completed: true,
    projectId: 'project-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('ProjectView', () => {
  describe('Delete confirmation', () => {
    it('shows delete button when onDeleteProject is provided', () => {
      render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Delete project' })).toBeInTheDocument()
    })

    it('does not show delete button when onDeleteProject is not provided', () => {
      render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument()
    })

    it('shows confirmation dialog when delete button is clicked', async () => {
      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onDeleteProject={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      await user.click(screen.getByRole('button', { name: 'Delete project' }))

      // Confirmation message should be visible
      expect(
        screen.getByText(/are you sure you want to delete this project/i)
      ).toBeInTheDocument()

      // Both Cancel and Delete Project buttons should be visible
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete Project' })).toBeInTheDocument()
    })

    it('dismisses confirmation when Cancel is clicked', async () => {
      const onDeleteProject = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onDeleteProject={onDeleteProject}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      // Open confirmation
      await user.click(screen.getByRole('button', { name: 'Delete project' }))
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument()

      // Click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Confirmation should be dismissed
      expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument()

      // onDeleteProject should not be called
      expect(onDeleteProject).not.toHaveBeenCalled()
    })

    it('calls onDeleteProject and onBack when deletion is confirmed', async () => {
      const onDeleteProject = vi.fn()
      const onBack = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={onBack}
          onUpdateProject={vi.fn()}
          onDeleteProject={onDeleteProject}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      // Open confirmation
      await user.click(screen.getByRole('button', { name: 'Delete project' }))

      // Confirm deletion
      await user.click(screen.getByRole('button', { name: 'Delete Project' }))

      // onDeleteProject should be called with project id
      expect(onDeleteProject).toHaveBeenCalledWith('project-1')

      // onBack should be called to navigate away
      expect(onBack).toHaveBeenCalled()
    })

    it('does not call onDeleteProject until confirmation', async () => {
      const onDeleteProject = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onDeleteProject={onDeleteProject}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      // Click delete button
      await user.click(screen.getByRole('button', { name: 'Delete project' }))

      // onDeleteProject should NOT be called yet
      expect(onDeleteProject).not.toHaveBeenCalled()

      // Confirmation dialog should be shown
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument()
    })
  })

  describe('Add task inline', () => {
    it('shows add task input when onAddTask is provided', () => {
      render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      expect(screen.getByPlaceholderText('Add a task...')).toBeInTheDocument()
    })

    it('does not show add task input when onAddTask is not provided', () => {
      render(
        <ProjectView
          project={mockProject}
          tasks={mockTasks}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      expect(screen.queryByPlaceholderText('Add a task...')).not.toBeInTheDocument()
    })

    it('calls onAddTask with title and project id when form is submitted', async () => {
      const onAddTask = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={[]}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={onAddTask}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      const input = screen.getByPlaceholderText('Add a task...')
      await user.type(input, 'New task for project')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onAddTask).toHaveBeenCalledWith('New task for project', 'project-1')
    })

    it('clears input after adding task', async () => {
      const onAddTask = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={[]}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={onAddTask}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      const input = screen.getByPlaceholderText('Add a task...')
      await user.type(input, 'New task')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(input).toHaveValue('')
    })

    it('shows Add button only when input has text', async () => {
      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={[]}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={vi.fn()}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      // Add button should not be visible initially
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()

      // Type some text
      const input = screen.getByPlaceholderText('Add a task...')
      await user.type(input, 'Test')

      // Add button should now be visible
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    it('submits on Enter key press', async () => {
      const onAddTask = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={[]}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={onAddTask}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      const input = screen.getByPlaceholderText('Add a task...')
      await user.type(input, 'Task via enter{Enter}')

      expect(onAddTask).toHaveBeenCalledWith('Task via enter', 'project-1')
    })

    it('does not submit empty or whitespace-only task', async () => {
      const onAddTask = vi.fn()

      const { user } = render(
        <ProjectView
          project={mockProject}
          tasks={[]}
          contactsMap={new Map()}
          onBack={vi.fn()}
          onUpdateProject={vi.fn()}
          onAddTask={onAddTask}
          onSelectTask={vi.fn()}
          onToggleTask={vi.fn()}
        />
      )

      const input = screen.getByPlaceholderText('Add a task...')
      await user.type(input, '   {Enter}')

      expect(onAddTask).not.toHaveBeenCalled()
    })
  })
})
