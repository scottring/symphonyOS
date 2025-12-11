import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'
import { SearchModal } from './SearchModal'
import type { SearchResult, GroupedSearchResults } from '@/hooks/useSearch'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'

// Mock data factories
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    completed: false,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function createMockContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    name: 'John Doe',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function createMockRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    user_id: 'test-user',
    name: 'Test Routine',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: null,
    raw_input: null,
    visibility: 'active',
    show_on_timeline: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function createTaskResult(task: Task): SearchResult {
  return {
    type: 'task',
    id: task.id,
    title: task.title,
    completed: task.completed,
    item: task,
  }
}

function createProjectResult(project: Project): SearchResult {
  return {
    type: 'project',
    id: project.id,
    title: project.name,
    item: project,
  }
}

function createContactResult(contact: Contact): SearchResult {
  return {
    type: 'contact',
    id: contact.id,
    title: contact.name,
    subtitle: contact.phone || contact.email,
    item: contact,
  }
}

function createRoutineResult(routine: Routine): SearchResult {
  return {
    type: 'routine',
    id: routine.id,
    title: routine.name,
    item: routine,
  }
}

const emptyResults: GroupedSearchResults = {
  tasks: [],
  projects: [],
  contacts: [],
  routines: [],
  lists: [],
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  query: '',
  onQueryChange: vi.fn(),
  results: emptyResults,
  totalResults: 0,
  isSearching: false,
  onSelectResult: vi.fn(),
}

describe('SearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when closed', () => {
      render(<SearchModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders modal when open', () => {
      render(<SearchModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('renders search input with placeholder', () => {
      render(<SearchModal {...defaultProps} />)
      expect(
        screen.getByPlaceholderText(/what are you looking for/i)
      ).toBeInTheDocument()
    })

    it('shows current query in input', () => {
      render(<SearchModal {...defaultProps} query="test query" />)
      expect(screen.getByDisplayValue('test query')).toBeInTheDocument()
    })

    it('renders Search header', () => {
      render(<SearchModal {...defaultProps} />)
      expect(screen.getByText('Search')).toBeInTheDocument()
    })

    it('shows "Searching..." when isSearching is true', () => {
      render(<SearchModal {...defaultProps} query="test" isSearching={true} />)
      expect(screen.getByText(/searching/i)).toBeInTheDocument()
    })

    it('shows no results message when query exists but no results', () => {
      render(<SearchModal {...defaultProps} query="xyz" totalResults={0} />)
      expect(screen.getByText(/no results for "xyz"/i)).toBeInTheDocument()
    })
  })

  describe('search results', () => {
    it('renders task results with section header', () => {
      const tasks = [createTaskResult(createMockTask({ title: 'Buy groceries' }))]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="buy"
          results={results}
          totalResults={1}
        />
      )

      expect(screen.getByText(/tasks/i)).toBeInTheDocument()
      expect(screen.getByText('Buy groceries')).toBeInTheDocument()
    })

    it('renders project results with section header', () => {
      const projects = [
        createProjectResult(createMockProject({ name: 'Website Redesign' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, projects }

      render(
        <SearchModal
          {...defaultProps}
          query="website"
          results={results}
          totalResults={1}
        />
      )

      expect(screen.getByText(/projects/i)).toBeInTheDocument()
      expect(screen.getByText('Website Redesign')).toBeInTheDocument()
    })

    it('renders contact results with section header', () => {
      const contacts = [
        createContactResult(createMockContact({ name: 'Alice Johnson' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, contacts }

      render(
        <SearchModal
          {...defaultProps}
          query="alice"
          results={results}
          totalResults={1}
        />
      )

      expect(screen.getByText(/contacts/i)).toBeInTheDocument()
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    it('renders routine results with section header', () => {
      const routines = [
        createRoutineResult(createMockRoutine({ name: 'Morning Exercise' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, routines }

      render(
        <SearchModal
          {...defaultProps}
          query="morning"
          results={results}
          totalResults={1}
        />
      )

      expect(screen.getByText(/routines/i)).toBeInTheDocument()
      expect(screen.getByText('Morning Exercise')).toBeInTheDocument()
    })

    it('shows result count in section headers', () => {
      const tasks = [
        createTaskResult(createMockTask({ id: '1', title: 'Task 1' })),
        createTaskResult(createMockTask({ id: '2', title: 'Task 2' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={2}
        />
      )

      expect(screen.getByText(/tasks \(2\)/i)).toBeInTheDocument()
    })

    it('shows "Show more" button when more than 5 results', () => {
      const tasks = Array.from({ length: 7 }, (_, i) =>
        createTaskResult(createMockTask({ id: `task-${i}`, title: `Task ${i}` }))
      )
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={7}
        />
      )

      expect(screen.getByText(/show 2 more/i)).toBeInTheDocument()
    })
  })

  describe('user interactions', () => {
    it('calls onQueryChange when typing', async () => {
      const onQueryChange = vi.fn()
      const { user } = render(
        <SearchModal {...defaultProps} onQueryChange={onQueryChange} />
      )

      const input = screen.getByPlaceholderText(/what are you looking for/i)
      await user.type(input, 'test')

      // Each character triggers onChange with the full value up to that point
      expect(onQueryChange).toHaveBeenCalledTimes(4)
    })

    it('calls onSelectResult when clicking a result', async () => {
      const onSelectResult = vi.fn()
      const task = createMockTask({ title: 'Buy groceries' })
      const tasks = [createTaskResult(task)]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      const { user } = render(
        <SearchModal
          {...defaultProps}
          query="buy"
          results={results}
          totalResults={1}
          onSelectResult={onSelectResult}
        />
      )

      await user.click(screen.getByText('Buy groceries'))

      expect(onSelectResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: task.id, type: 'task' })
      )
    })

    it('clears query when clicking clear button', async () => {
      const onQueryChange = vi.fn()
      const { user } = render(
        <SearchModal
          {...defaultProps}
          query="test"
          onQueryChange={onQueryChange}
        />
      )

      const clearButton = screen.getByLabelText(/clear search/i)
      await user.click(clearButton)

      expect(onQueryChange).toHaveBeenCalledWith('')
    })

    it('toggles expanded section when clicking "Show more"', async () => {
      const tasks = Array.from({ length: 7 }, (_, i) =>
        createTaskResult(createMockTask({ id: `task-${i}`, title: `Task ${i}` }))
      )
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      const { user } = render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={7}
        />
      )

      // Initially shows 5 results
      expect(screen.getByText('Task 0')).toBeInTheDocument()
      expect(screen.getByText('Task 4')).toBeInTheDocument()
      expect(screen.queryByText('Task 6')).not.toBeInTheDocument()

      // Click show more
      await user.click(screen.getByText(/show 2 more/i))

      // Now shows all results
      expect(screen.getByText('Task 6')).toBeInTheDocument()
      expect(screen.getByText(/show less/i)).toBeInTheDocument()
    })
  })

  describe('keyboard navigation', () => {
    it('closes modal on Escape key', () => {
      const onClose = vi.fn()
      render(<SearchModal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalled()
    })

    it('navigates down with ArrowDown key', () => {
      const tasks = [
        createTaskResult(createMockTask({ id: '1', title: 'Task 1' })),
        createTaskResult(createMockTask({ id: '2', title: 'Task 2' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={2}
        />
      )

      // First result should be selected by default
      const resultsContainer = screen.getByRole('dialog')
      const resultItems = within(resultsContainer).getAllByRole('button', { name: /task/i })

      // Arrow down to select second result
      fireEvent.keyDown(document, { key: 'ArrowDown' })

      // We can verify the second item is selected by its styling (bg-primary-50)
      expect(resultItems[1]).toHaveClass('bg-primary-50')
    })

    it('navigates up with ArrowUp key', () => {
      const tasks = [
        createTaskResult(createMockTask({ id: '1', title: 'Task 1' })),
        createTaskResult(createMockTask({ id: '2', title: 'Task 2' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={2}
        />
      )

      // Navigate down then up
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      fireEvent.keyDown(document, { key: 'ArrowUp' })

      const resultsContainer = screen.getByRole('dialog')
      const resultItems = within(resultsContainer).getAllByRole('button', { name: /task/i })

      // First item should be selected again
      expect(resultItems[0]).toHaveClass('bg-primary-50')
    })

    it('selects result on Enter key', () => {
      const onSelectResult = vi.fn()
      const task = createMockTask({ title: 'Task 1' })
      const tasks = [createTaskResult(task)]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={1}
          onSelectResult={onSelectResult}
        />
      )

      fireEvent.keyDown(document, { key: 'Enter' })

      expect(onSelectResult).toHaveBeenCalledWith(
        expect.objectContaining({ id: task.id })
      )
    })

    it('does not go below last result', () => {
      const tasks = [
        createTaskResult(createMockTask({ id: '1', title: 'Task 1' })),
        createTaskResult(createMockTask({ id: '2', title: 'Task 2' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={2}
        />
      )

      // Try to go past last result
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      fireEvent.keyDown(document, { key: 'ArrowDown' })

      const resultsContainer = screen.getByRole('dialog')
      const resultItems = within(resultsContainer).getAllByRole('button', { name: /task/i })

      // Should stay on last item
      expect(resultItems[1]).toHaveClass('bg-primary-50')
    })

    it('does not go above first result', () => {
      const tasks = [
        createTaskResult(createMockTask({ id: '1', title: 'Task 1' })),
        createTaskResult(createMockTask({ id: '2', title: 'Task 2' })),
      ]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={2}
        />
      )

      // Try to go above first result
      fireEvent.keyDown(document, { key: 'ArrowUp' })
      fireEvent.keyDown(document, { key: 'ArrowUp' })

      const resultsContainer = screen.getByRole('dialog')
      const resultItems = within(resultsContainer).getAllByRole('button', { name: /task/i })

      // Should stay on first item
      expect(resultItems[0]).toHaveClass('bg-primary-50')
    })
  })

  describe('click outside', () => {
    it('closes modal when clicking backdrop', async () => {
      const onClose = vi.fn()
      render(<SearchModal {...defaultProps} onClose={onClose} />)

      // Click the backdrop (the outer div with bg-black/40)
      const backdrop = document.querySelector('.bg-black\\/40')
      if (backdrop) {
        fireEvent.click(backdrop)
      }

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('keyboard hints', () => {
    it('shows keyboard shortcut hint in header', () => {
      render(<SearchModal {...defaultProps} />)
      expect(screen.getByText('⌘J')).toBeInTheDocument()
    })

    it('shows navigation hints when there are results', () => {
      const tasks = [createTaskResult(createMockTask({ title: 'Task' }))]
      const results: GroupedSearchResults = { ...emptyResults, tasks }

      render(
        <SearchModal
          {...defaultProps}
          query="task"
          results={results}
          totalResults={1}
        />
      )

      // Look for navigation hints in footer
      expect(screen.getByText('to navigate')).toBeInTheDocument()
      expect(screen.getByText('to select')).toBeInTheDocument()
      expect(screen.getByText('to close')).toBeInTheDocument()
    })
  })

  describe('focus management', () => {
    it('focuses input when modal opens', () => {
      render(<SearchModal {...defaultProps} />)

      const input = screen.getByPlaceholderText(/what are you looking for/i)
      expect(document.activeElement).toBe(input)
    })
  })
})
