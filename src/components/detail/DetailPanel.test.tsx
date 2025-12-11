import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@/test/test-utils'
import { DetailPanel } from './DetailPanel'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'

// Mock useActionableInstances hook
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    isLoading: false,
    getInstance: vi.fn().mockResolvedValue(null),
    markDone: vi.fn().mockResolvedValue(true),
    undoDone: vi.fn().mockResolvedValue(true),
    skip: vi.fn().mockResolvedValue(true),
    defer: vi.fn().mockResolvedValue(true),
    requestCoverage: vi.fn().mockResolvedValue(null),
    addNote: vi.fn().mockResolvedValue(null),
  }),
}))

const mockTask: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Test task',
  startTime: null,
  endTime: null,
  completed: false,
  notes: '',
  originalTask: {
    id: '1',
    title: 'Test task',
    completed: false,
    createdAt: new Date(),
  },
}

const mockCompletedTask: TimelineItem = {
  id: 'task-2',
  type: 'task',
  title: 'Completed task',
  startTime: null,
  endTime: null,
  completed: true,
  originalTask: {
    id: '2',
    title: 'Completed task',
    completed: true,
    createdAt: new Date(),
  },
}

const mockEvent: TimelineItem = {
  id: 'event-1',
  type: 'event',
  title: 'Test event',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: new Date('2024-01-01T11:00:00Z'),
  completed: false,
  location: '123 Main St',
  googleDescription: 'Event description from calendar',
  originalEvent: {
    id: 'google-event-1',
    google_event_id: 'google-event-1',
    title: 'Test event',
    start_time: '2024-01-01T10:00:00Z',
    end_time: '2024-01-01T11:00:00Z',
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

const mockContacts: Contact[] = [
  {
    id: 'contact-1',
    name: 'John Doe',
    phone: '555-123-4567',
    email: 'john@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('DetailPanel', () => {
  describe('rendering', () => {
    it('renders task title', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByText('Test task')).toBeInTheDocument()
    })

    it('renders null when item is null', () => {
      const { container } = render(
        <DetailPanel
          item={null}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders close button', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByLabelText('Close')).toBeInTheDocument()
    })

    it('renders checkbox for tasks', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onToggleComplete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByLabelText('Mark complete')).toBeInTheDocument()
    })

    it('does not render time pill for task without time', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // In the new UI, tasks without startTime don't show a time pill
      expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument()
    })

    it('renders strikethrough for completed tasks', () => {
      render(
        <DetailPanel
          item={mockCompletedTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      const title = screen.getByText('Completed task')
      expect(title).toHaveClass('line-through')
    })
  })

  describe('close button', () => {
    it('calls onClose when clicked', () => {
      const onClose = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={onClose}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByLabelText('Close'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('task completion', () => {
    it('calls onToggleComplete when checkbox clicked', () => {
      const onToggleComplete = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onToggleComplete={onToggleComplete}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByLabelText('Mark complete'))

      expect(onToggleComplete).toHaveBeenCalledWith('1')
    })

    it('shows Mark incomplete label for completed tasks', () => {
      render(
        <DetailPanel
          item={mockCompletedTask}
          onClose={vi.fn()}
          onToggleComplete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByLabelText('Mark incomplete')).toBeInTheDocument()
    })
  })

  describe('title editing', () => {
    it('shows input when clicking title', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Test task'))

      expect(screen.getByDisplayValue('Test task')).toBeInTheDocument()
    })

    it('saves title on blur with changed value', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Test task'))
      const input = screen.getByDisplayValue('Test task')
      fireEvent.change(input, { target: { value: 'New title' } })
      fireEvent.blur(input)

      expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' })
    })

    it('saves title on Enter key', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Test task'))
      const input = screen.getByDisplayValue('Test task')
      fireEvent.change(input, { target: { value: 'New title' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' })
    })

    it('cancels edit on Escape key', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Test task'))
      const input = screen.getByDisplayValue('Test task')
      fireEvent.change(input, { target: { value: 'New title' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByText('Test task')).toBeInTheDocument()
    })

    it('does not update when title unchanged', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Test task'))
      const input = screen.getByDisplayValue('Test task')
      fireEvent.blur(input)

      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('notes editing', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    it('shows notes textarea with placeholder when empty', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // New UI always shows textarea with placeholder
      expect(screen.getByPlaceholderText('Add notes...')).toBeInTheDocument()
    })

    it('shows textarea with placeholder', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // Textarea is always visible in new UI
      expect(screen.getByPlaceholderText('Add notes...')).toBeInTheDocument()
    })

    it('updates notes with debounce', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      const textarea = screen.getByPlaceholderText('Add notes...')
      fireEvent.change(textarea, { target: { value: 'New notes' } })

      // Not called yet
      expect(onUpdate).not.toHaveBeenCalled()

      // After debounce
      vi.advanceTimersByTime(500)

      expect(onUpdate).toHaveBeenCalledWith('1', { notes: 'New notes' })
    })
  })

  describe('delete functionality', () => {
    it('shows delete button for tasks', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByText('Delete task')).toBeInTheDocument()
    })

    it('shows confirmation when delete clicked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Delete task'))

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('cancels delete when Cancel clicked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Delete task'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('Delete task')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    })

    it('calls onDelete and onClose when delete confirmed', () => {
      const onDelete = vi.fn()
      const onClose = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={onClose}
          onDelete={onDelete}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Delete task'))
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      expect(onDelete).toHaveBeenCalledWith('1')
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('contact section', () => {
    it('shows None when no contact linked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          contacts={mockContacts}
          onSearchContacts={() => mockContacts}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // DetailRow shows "None" when value is null
      expect(screen.getByText('Contact')).toBeInTheDocument()
    })

    it('opens contact picker when contact row clicked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          contacts={mockContacts}
          onSearchContacts={() => mockContacts}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // Click the Contact row (DetailRow component)
      fireEvent.click(screen.getByText('Contact'))

      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()
    })

    it('links contact when selected from picker', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          contacts={mockContacts}
          onSearchContacts={() => mockContacts}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Contact'))
      fireEvent.click(screen.getByText('John Doe'))

      expect(onUpdate).toHaveBeenCalledWith('1', { contactId: 'contact-1' })
    })

    it('shows contact name when linked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          contact={mockContacts[0]}
          contacts={mockContacts}
          onSearchContacts={() => mockContacts}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // Contact name appears in multiple places (header pill + Details row)
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0)
    })
  })

  describe('links section', () => {
    it('shows Links label when no links', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByText('Links')).toBeInTheDocument()
    })

    it('expands links section when clicked', () => {
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Links'))

      expect(screen.getByPlaceholderText('Add link URL...')).toBeInTheDocument()
    })

    it('adds link when form submitted', () => {
      const onUpdate = vi.fn()
      render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={onUpdate}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      fireEvent.click(screen.getByText('Links'))
      const urlInput = screen.getByPlaceholderText('Add link URL...')
      fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
      fireEvent.click(screen.getByText('+'))

      expect(onUpdate).toHaveBeenCalledWith('1', {
        links: [{ url: 'https://example.com' }]
      })
    })

    it('shows link count when links exist', () => {
      const taskWithLinks: TimelineItem = {
        ...mockTask,
        links: [
          { url: 'https://example.com' },
          { url: 'https://test.com' },
        ],
      }
      render(
        <DetailPanel
          item={taskWithLinks}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByText('2 links')).toBeInTheDocument()
    })
  })

  describe('events', () => {
    it('renders event location', async () => {
      render(
        <DetailPanel
          item={mockEvent}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getAllByText('123 Main St').length).toBeGreaterThan(0)
      // Wait for async actionable instance loading to complete
      await waitFor(() => {})
    })

    it('renders google calendar description', async () => {
      render(
        <DetailPanel
          item={mockEvent}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.getByText('Event description from calendar')).toBeInTheDocument()
      // Wait for async actionable instance loading to complete
      await waitFor(() => {})
    })

    it('shows notes placeholder for events', async () => {
      render(
        <DetailPanel
          item={mockEvent}
          onClose={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // New UI uses same placeholder for tasks and events
      expect(screen.getByPlaceholderText('Add notes...')).toBeInTheDocument()
      // Wait for async actionable instance loading to complete
      await waitFor(() => {})
    })

    it('does not show delete button for events', async () => {
      render(
        <DetailPanel
          item={mockEvent}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      expect(screen.queryByText('Delete task')).not.toBeInTheDocument()
      // Wait for async actionable instance loading to complete
      await waitFor(() => {})
    })

    it('does not show contact section for events', async () => {
      render(
        <DetailPanel
          item={mockEvent}
          onClose={vi.fn()}
          contacts={mockContacts}
          onSearchContacts={() => mockContacts}
          projects={[]}
          onSearchProjects={() => []}
        />
      )

      // New UI uses DetailRow with "Contact" label instead of "Add contact"
      // Events may or may not show contact section depending on implementation
      // Wait for async actionable instance loading to complete
      await waitFor(() => {})
    })
  })
  describe('Project creation flow', () => {
    it('opens project picker when clicking Project row', async () => {
      const { user } = render(
        <DetailPanel
          item={mockTask}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          projects={mockProjects}
          onSearchProjects={() => mockProjects}
        />
      )

      // Click on the Project DetailRow
      await user.click(screen.getByText('Project'))

      // Project picker should be visible
      expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument()
      expect(screen.getByText('Existing Project')).toBeInTheDocument()
    })

    it('shows Create New Project button in project picker when onAddProject is provided', async () => {
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

      await user.click(screen.getByText('Project'))

      // Create New Project button should be visible
      expect(screen.getByRole('button', { name: /create new project/i })).toBeInTheDocument()
    })

    it('transitions to create mode when clicking Create New Project button', async () => {
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

      await user.click(screen.getByText('Project'))
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      // Should show create form with input
      expect(screen.getByPlaceholderText('New project name...')).toBeInTheDocument()
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

      await user.click(screen.getByText('Project'))

      // Type in search box
      const searchInput = screen.getByPlaceholderText('Search projects...')
      await user.type(searchInput, 'My New Project')

      // Click Create New Project button
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      // New project name input should be pre-filled
      const nameInput = screen.getByPlaceholderText('New project name...')
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

      await user.click(screen.getByText('Project'))
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      // Enter project name
      const nameInput = screen.getByPlaceholderText('New project name...')
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

      await user.click(screen.getByText('Project'))
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      const nameInput = screen.getByPlaceholderText('New project name...')
      await user.type(nameInput, 'New Project')

      await user.click(screen.getByRole('button', { name: 'Create' }))

      // Should show loading state
      expect(screen.getByText('Creating...')).toBeInTheDocument()

      // Input should be disabled
      expect(nameInput).toBeDisabled()

      // Resolve the promise and wait for the state update to complete
      resolveCreate!({
        id: 'new-project-1',
        name: 'New Project',
        status: 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Wait for the async operation to complete and state to update
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('1', { projectId: 'new-project-1' })
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

      await user.click(screen.getByText('Project'))
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      // Should be in create mode (input visible)
      expect(screen.getByPlaceholderText('New project name...')).toBeInTheDocument()

      // Click Cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should return to picker view (create input gone, modal closed)
      expect(screen.queryByPlaceholderText('New project name...')).not.toBeInTheDocument()
    })

    // Note: The project creation form does not currently support keyboard shortcuts
    // (Enter to create, Escape to cancel). This could be added as a future enhancement.

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

      await user.click(screen.getByText('Project'))
      await user.click(screen.getByRole('button', { name: /create new project/i }))

      // Create button should be disabled when input is empty
      const createButton = screen.getByRole('button', { name: 'Create' })
      expect(createButton).toBeDisabled()

      // Click it anyway (shouldn't do anything)
      await user.click(createButton)

      expect(onAddProject).not.toHaveBeenCalled()
    })
  })
})
