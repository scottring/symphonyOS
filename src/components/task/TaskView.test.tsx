import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskView } from './TaskView'
import { createMockTask, createMockContact, createMockProject, resetIdCounter } from '@/test/mocks/factories'

describe('TaskView', () => {
  const defaultProps = {
    task: createMockTask({ title: 'Test Task' }),
    onBack: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onToggleComplete: vi.fn(),
  }

  beforeEach(() => {
    resetIdCounter()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders task title', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('renders back button', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    it('renders task breadcrumb', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Task')).toBeInTheDocument()
    })

    it('renders checkbox unchecked for incomplete task', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    })

    it('renders checkbox checked for completed task', () => {
      const completedTask = createMockTask({ completed: true })
      render(<TaskView {...defaultProps} task={completedTask} />)
      expect(screen.getByRole('button', { name: 'Mark incomplete' })).toBeInTheDocument()
    })

    it('renders completed task with strikethrough', () => {
      const completedTask = createMockTask({ title: 'Completed Task', completed: true })
      render(<TaskView {...defaultProps} task={completedTask} />)
      const title = screen.getByText('Completed Task')
      expect(title).toHaveClass('line-through')
    })

    it('renders notes section', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })

    it('renders date/time section', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('When')).toBeInTheDocument()
    })

    it('renders contact section', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Contact')).toBeInTheDocument()
    })

    it('renders project section', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Project')).toBeInTheDocument()
    })

    it('renders links section', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Links')).toBeInTheDocument()
    })
  })

  describe('back navigation', () => {
    it('calls onBack when back button clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Back'))
      expect(defaultProps.onBack).toHaveBeenCalled()
    })
  })

  describe('title editing', () => {
    it('enters edit mode when title clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument()
    })

    it('updates title on blur', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      const input = screen.getByDisplayValue('Test Task')
      fireEvent.change(input, { target: { value: 'Updated Title' } })
      fireEvent.blur(input)

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { title: 'Updated Title' }
      )
    })

    it('updates title on Enter key', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      const input = screen.getByDisplayValue('Test Task')
      fireEvent.change(input, { target: { value: 'New Title' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { title: 'New Title' }
      )
    })

    it('cancels edit on Escape key', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      const input = screen.getByDisplayValue('Test Task')
      fireEvent.change(input, { target: { value: 'Changed' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.getByText('Test Task')).toBeInTheDocument()
      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })

    it('does not update if title unchanged', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      const input = screen.getByDisplayValue('Test Task')
      fireEvent.blur(input)

      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })

    it('does not update if title is empty', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Test Task'))
      const input = screen.getByDisplayValue('Test Task')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.blur(input)

      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('task completion', () => {
    it('calls onToggleComplete when checkbox clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }))
      expect(defaultProps.onToggleComplete).toHaveBeenCalledWith(defaultProps.task.id)
    })
  })

  describe('delete task', () => {
    it('shows delete confirmation when delete button clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
      expect(screen.getByText('Are you sure you want to delete this task?')).toBeInTheDocument()
    })

    it('cancels delete when Cancel clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.queryByText('Are you sure you want to delete this task?')).not.toBeInTheDocument()
    })

    it('deletes task and navigates back when confirmed', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
      fireEvent.click(screen.getByText('Delete Task'))

      expect(defaultProps.onDelete).toHaveBeenCalledWith(defaultProps.task.id)
      expect(defaultProps.onBack).toHaveBeenCalled()
    })
  })

  describe('notes', () => {
    it('renders existing notes', () => {
      const taskWithNotes = createMockTask({ notes: 'Some notes here' })
      render(<TaskView {...defaultProps} task={taskWithNotes} />)
      expect(screen.getByDisplayValue('Some notes here')).toBeInTheDocument()
    })

    it('updates notes with debounce', async () => {
      vi.useFakeTimers()
      render(<TaskView {...defaultProps} />)

      const textarea = screen.getByPlaceholderText('Add notes...')
      fireEvent.change(textarea, { target: { value: 'New note' } })

      // Should not call immediately
      expect(defaultProps.onUpdate).not.toHaveBeenCalled()

      // Advance timers for debounce
      vi.advanceTimersByTime(500)

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { notes: 'New note' }
      )
    })
  })

  describe('scheduled date', () => {
    it('shows add date button when no date', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Add date & time')).toBeInTheDocument()
    })

    it('shows formatted date when scheduled', () => {
      const scheduledTask = createMockTask({
        scheduledFor: new Date('2024-03-15T10:30:00'),
        isAllDay: false,
      })
      render(<TaskView {...defaultProps} task={scheduledTask} />)
      expect(screen.getByText(/Fri, Mar 15 at 10:30 AM/)).toBeInTheDocument()
    })

    it('shows all day indicator', () => {
      const allDayTask = createMockTask({
        scheduledFor: new Date('2024-03-15'),
        isAllDay: true,
      })
      render(<TaskView {...defaultProps} task={allDayTask} />)
      expect(screen.getByText(/\(All Day\)/)).toBeInTheDocument()
    })

    it('opens time picker when clicked', () => {
      render(<TaskView {...defaultProps} />)
      fireEvent.click(screen.getByText('Add date & time'))
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })
  })

  describe('contact section', () => {
    it('shows add contact button when no contact', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Add contact')).toBeInTheDocument()
    })

    it('displays linked contact', () => {
      const contact = createMockContact({ name: 'John Doe', phone: '555-1234' })
      render(<TaskView {...defaultProps} contact={contact} />)
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('555-1234')).toBeInTheDocument()
    })

    it('opens contact picker when add contact clicked', () => {
      const contacts = [createMockContact({ name: 'Jane' })]
      render(<TaskView {...defaultProps} contacts={contacts} />)

      fireEvent.click(screen.getByText('Add contact'))
      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()
    })

    it('links contact when selected from picker', () => {
      const contact = createMockContact({ name: 'Jane Smith' })
      const contacts = [contact]
      render(<TaskView {...defaultProps} contacts={contacts} />)

      fireEvent.click(screen.getByText('Add contact'))
      fireEvent.click(screen.getByText('Jane Smith'))

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { contactId: contact.id }
      )
    })

    it('unlinks contact when remove button clicked', () => {
      const contact = createMockContact({ name: 'John Doe' })
      render(<TaskView {...defaultProps} contact={contact} />)

      // The X button is inside the contact display area
      const buttons = screen.getAllByRole('button')
      // Find the remove button (it's the one that unlinks the contact)
      const removeButton = buttons.find(btn => {
        const svg = btn.querySelector('svg path')
        return svg && svg.getAttribute('d')?.includes('4.293 4.293')
      })

      if (removeButton) {
        fireEvent.click(removeButton)
      }

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { contactId: undefined }
      )
    })

    it('filters contacts by search query', () => {
      const contacts = [
        createMockContact({ name: 'Alice' }),
        createMockContact({ name: 'Bob' }),
      ]
      const onSearchContacts = vi.fn().mockReturnValue([contacts[0]])
      render(<TaskView {...defaultProps} contacts={contacts} onSearchContacts={onSearchContacts} />)

      fireEvent.click(screen.getByText('Add contact'))
      fireEvent.change(screen.getByPlaceholderText('Search contacts...'), { target: { value: 'Ali' } })

      expect(onSearchContacts).toHaveBeenCalledWith('Ali')
    })

    it('opens contact creation form', () => {
      const onAddContact = vi.fn()
      render(<TaskView {...defaultProps} contacts={[]} onAddContact={onAddContact} />)

      fireEvent.click(screen.getByText('Add contact'))
      fireEvent.click(screen.getByText('New'))

      expect(screen.getByText('Create new contact')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Name *')).toBeInTheDocument()
    })

    it('creates and links new contact', async () => {
      const newContact = createMockContact({ name: 'New Person' })
      const onAddContact = vi.fn().mockResolvedValue(newContact)
      render(<TaskView {...defaultProps} contacts={[]} onAddContact={onAddContact} />)

      fireEvent.click(screen.getByText('Add contact'))
      fireEvent.click(screen.getByText('New'))
      fireEvent.change(screen.getByPlaceholderText('Name *'), { target: { value: 'New Person' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(onAddContact).toHaveBeenCalledWith({
          name: 'New Person',
          phone: undefined,
          email: undefined,
        })
      })

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          expect.any(String),
          { contactId: newContact.id }
        )
      })
    })
  })

  describe('project section', () => {
    it('shows add project button when no project', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.getByText('Add project')).toBeInTheDocument()
    })

    it('displays linked project', () => {
      const project = createMockProject({ name: 'My Project' })
      render(<TaskView {...defaultProps} project={project} />)
      expect(screen.getByText('My Project')).toBeInTheDocument()
    })

    it('opens project picker when add project clicked', () => {
      const projects = [createMockProject({ name: 'Work' })]
      render(<TaskView {...defaultProps} projects={projects} />)

      fireEvent.click(screen.getByText('Add project'))
      expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument()
    })

    it('links project when selected', () => {
      const project = createMockProject({ name: 'Work Project' })
      const projects = [project]
      render(<TaskView {...defaultProps} projects={projects} />)

      fireEvent.click(screen.getByText('Add project'))
      fireEvent.click(screen.getByText('Work Project'))

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { projectId: project.id }
      )
    })

    it('creates and links new project', async () => {
      const newProject = createMockProject({ name: 'New Project' })
      const onAddProject = vi.fn().mockResolvedValue(newProject)
      render(<TaskView {...defaultProps} projects={[]} onAddProject={onAddProject} />)

      fireEvent.click(screen.getByText('Add project'))
      fireEvent.click(screen.getByText('New'))
      fireEvent.change(screen.getByPlaceholderText('Project name...'), { target: { value: 'New Project' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(onAddProject).toHaveBeenCalledWith({ name: 'New Project' })
      })

      await waitFor(() => {
        expect(defaultProps.onUpdate).toHaveBeenCalledWith(
          expect.any(String),
          { projectId: newProject.id }
        )
      })
    })
  })

  describe('links section', () => {
    it('shows link count in header', () => {
      const taskWithLinks = createMockTask({
        links: [{ url: 'https://example.com' }, { url: 'https://test.com' }],
      })
      render(<TaskView {...defaultProps} task={taskWithLinks} />)
      expect(screen.getByText('Links (2)')).toBeInTheDocument()
    })

    it('displays existing links', () => {
      const taskWithLinks = createMockTask({
        links: [{ url: 'https://example.com', title: 'Example Site' }],
      })
      render(<TaskView {...defaultProps} task={taskWithLinks} />)
      expect(screen.getByText('Example Site')).toBeInTheDocument()
    })

    it('adds new link', () => {
      render(<TaskView {...defaultProps} />)

      fireEvent.change(
        screen.getByPlaceholderText('URL (e.g., https://example.com)'),
        { target: { value: 'https://newlink.com' } }
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { links: [{ url: 'https://newlink.com' }] }
      )
    })

    it('adds link with title', () => {
      render(<TaskView {...defaultProps} />)

      fireEvent.change(
        screen.getByPlaceholderText('URL (e.g., https://example.com)'),
        { target: { value: 'https://newlink.com' } }
      )
      fireEvent.change(
        screen.getByPlaceholderText('Title (optional)'),
        { target: { value: 'My Link' } }
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { links: [{ url: 'https://newlink.com', title: 'My Link' }] }
      )
    })

    it('removes link when X clicked', () => {
      const taskWithLinks = createMockTask({
        links: [{ url: 'https://example.com' }],
      })
      render(<TaskView {...defaultProps} task={taskWithLinks} />)

      fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))

      expect(defaultProps.onUpdate).toHaveBeenCalledWith(
        expect.any(String),
        { links: undefined }
      )
    })

    it('does not add duplicate link', () => {
      const taskWithLinks = createMockTask({
        links: [{ url: 'https://example.com' }],
      })
      render(<TaskView {...defaultProps} task={taskWithLinks} />)

      fireEvent.change(
        screen.getByPlaceholderText('URL (e.g., https://example.com)'),
        { target: { value: 'https://example.com' } }
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      // Should not be called because URL already exists
      expect(defaultProps.onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('push dropdown', () => {
    it('renders push dropdown when onPush provided', () => {
      const onPush = vi.fn()
      render(<TaskView {...defaultProps} onPush={onPush} />)
      expect(screen.getByTitle('Push task')).toBeInTheDocument()
    })

    it('does not render push dropdown when onPush not provided', () => {
      render(<TaskView {...defaultProps} />)
      expect(screen.queryByTitle('Push task')).not.toBeInTheDocument()
    })
  })

  describe('state synchronization', () => {
    it('resets state when task changes', () => {
      const task1 = createMockTask({ id: 'task-1', title: 'First Task', notes: 'Notes 1' })
      const task2 = createMockTask({ id: 'task-2', title: 'Second Task', notes: 'Notes 2' })

      const { rerender } = render(<TaskView {...defaultProps} task={task1} />)
      expect(screen.getByText('First Task')).toBeInTheDocument()

      rerender(<TaskView {...defaultProps} task={task2} />)
      expect(screen.getByText('Second Task')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Notes 2')).toBeInTheDocument()
    })
  })
})
