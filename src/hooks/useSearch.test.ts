import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearch } from './useSearch'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'
import type { List } from '@/types/list'

// Mock data factories
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    completed: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    status: 'in_progress',
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
    name: 'Morning Routine',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: '08:00:00',
    raw_input: null,
    visibility: 'active',
    paused_until: null,
    show_on_timeline: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function createMockList(overrides: Partial<List> = {}): List {
  return {
    id: 'list-1',
    title: 'Test List',
    category: 'other',
    visibility: 'self',
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with empty query and no results', () => {
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines: [], lists: [] })
      )

      expect(result.current.query).toBe('')
      expect(result.current.totalResults).toBe(0)
      expect(result.current.isSearching).toBe(false)
      expect(result.current.results).toEqual({
        tasks: [],
        projects: [],
        contacts: [],
        routines: [],
        lists: [],
      })
    })
  })

  describe('query handling', () => {
    it('updates query immediately', () => {
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      expect(result.current.query).toBe('test')
    })

    it('shows searching state during debounce', () => {
      const tasks = [createMockTask({ title: 'Test Task' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      expect(result.current.isSearching).toBe(true)
    })

    it('debounces search query (150ms)', async () => {
      const tasks = [createMockTask({ title: 'Test Task' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      // Before debounce completes, no results yet
      expect(result.current.totalResults).toBe(0)
      expect(result.current.isSearching).toBe(true)

      // Advance past debounce time and flush
      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      // Now should have results
      expect(result.current.isSearching).toBe(false)
      expect(result.current.totalResults).toBe(1)
    })

    it('clears search when query is cleared', async () => {
      const tasks = [createMockTask({ title: 'Test Task' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.totalResults).toBe(1)

      act(() => {
        result.current.clearSearch()
      })

      expect(result.current.query).toBe('')
      expect(result.current.totalResults).toBe(0)
    })
  })

  describe('task search', () => {
    it('finds tasks by title', async () => {
      const tasks = [
        createMockTask({ id: 'task-1', title: 'Buy groceries' }),
        createMockTask({ id: 'task-2', title: 'Call mom' }),
        createMockTask({ id: 'task-3', title: 'Write report' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('groceries')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
      expect(result.current.results.tasks[0].title).toBe('Buy groceries')
    })

    it('finds tasks by notes', async () => {
      const tasks = [
        createMockTask({
          id: 'task-1',
          title: 'Meeting',
          notes: 'Discuss quarterly budget with finance team',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('budget')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
      expect(result.current.results.tasks[0].title).toBe('Meeting')
    })

    it('sorts incomplete tasks before completed ones', async () => {
      const tasks = [
        createMockTask({ id: 'task-1', title: 'Test A', completed: true }),
        createMockTask({ id: 'task-2', title: 'Test B', completed: false }),
        createMockTask({ id: 'task-3', title: 'Test C', completed: true }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      const results = result.current.results.tasks
      expect(results[0].completed).toBe(false)
      expect(results[1].completed).toBe(true)
      expect(results[2].completed).toBe(true)
    })

    it('includes subtasks in search results', async () => {
      const parentTask = createMockTask({
        id: 'parent',
        title: 'Main task',
        subtasks: [
          createMockTask({
            id: 'subtask-1',
            title: 'Buy milk',
            parentTaskId: 'parent',
          }),
        ],
      })
      const { result } = renderHook(() =>
        useSearch({ tasks: [parentTask], projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('milk')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
      expect(result.current.results.tasks[0].title).toBe('Buy milk')
    })

    it('shows project name as subtitle when task has project', async () => {
      const projects = [createMockProject({ id: 'proj-1', name: 'Home Renovation' })]
      const tasks = [createMockTask({ title: 'Fix bathroom', projectId: 'proj-1' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects, contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('bathroom')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks[0].subtitle).toBe('Home Renovation')
    })
  })

  describe('project search', () => {
    it('finds projects by name', async () => {
      const projects = [
        createMockProject({ id: 'p1', name: 'Website Redesign' }),
        createMockProject({ id: 'p2', name: 'Mobile App' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects, contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('website')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.projects).toHaveLength(1)
      expect(result.current.results.projects[0].title).toBe('Website Redesign')
    })

    it('finds projects by notes', async () => {
      const projects = [
        createMockProject({
          name: 'Project X',
          notes: 'This project involves customer portal development',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects, contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('portal')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.projects).toHaveLength(1)
    })
  })

  describe('contact search', () => {
    it('finds contacts by name', async () => {
      const contacts = [
        createMockContact({ id: 'c1', name: 'Alice Johnson' }),
        createMockContact({ id: 'c2', name: 'Bob Smith' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts, routines: [] })
      )

      act(() => {
        result.current.setQuery('alice')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.contacts).toHaveLength(1)
      expect(result.current.results.contacts[0].title).toBe('Alice Johnson')
    })

    it('finds contacts by email', async () => {
      const contacts = [
        createMockContact({ name: 'John Doe', email: 'john.doe@example.com' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts, routines: [] })
      )

      act(() => {
        result.current.setQuery('example.com')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.contacts).toHaveLength(1)
    })

    it('finds contacts by phone', async () => {
      const contacts = [
        createMockContact({ name: 'Jane Doe', phone: '555-1234' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts, routines: [] })
      )

      act(() => {
        result.current.setQuery('555')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.contacts).toHaveLength(1)
    })

    it('shows phone or email as subtitle', async () => {
      const contacts = [
        createMockContact({ name: 'John Doe', phone: '555-1234', email: 'john@example.com' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts, routines: [] })
      )

      act(() => {
        result.current.setQuery('john')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      // Phone takes priority over email
      expect(result.current.results.contacts[0].subtitle).toBe('555-1234')
    })
  })

  describe('routine search', () => {
    it('finds routines by name', async () => {
      const routines = [
        createMockRoutine({ id: 'r1', name: 'Morning Exercise' }),
        createMockRoutine({ id: 'r2', name: 'Evening Review' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines })
      )

      act(() => {
        result.current.setQuery('exercise')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.routines).toHaveLength(1)
      expect(result.current.results.routines[0].title).toBe('Morning Exercise')
    })

    it('finds routines by description', async () => {
      const routines = [
        createMockRoutine({
          name: 'Daily Standup',
          description: 'Team sync meeting to discuss blockers',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines })
      )

      act(() => {
        result.current.setQuery('blockers')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.routines).toHaveLength(1)
    })

    it('shows formatted recurrence pattern as subtitle', async () => {
      const routines = [
        createMockRoutine({
          name: 'Weekly Review',
          recurrence_pattern: { type: 'weekly', days: ['monday', 'friday'] },
          time_of_day: '09:00:00',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines })
      )

      act(() => {
        result.current.setQuery('review')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.routines[0].subtitle).toBe('Mon, Fri at 09:00')
    })

    it('handles daily recurrence pattern', async () => {
      const routines = [
        createMockRoutine({
          name: 'Daily Check',
          recurrence_pattern: { type: 'daily' },
          time_of_day: '10:00:00',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines })
      )

      act(() => {
        result.current.setQuery('check')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.routines[0].subtitle).toBe('Daily at 10:00')
    })
  })

  describe('list search', () => {
    it('finds lists by title', async () => {
      const lists = [
        createMockList({ id: 'l1', title: 'Movies to Watch' }),
        createMockList({ id: 'l2', title: 'Restaurants to Try' }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines: [], lists })
      )

      act(() => {
        result.current.setQuery('movies')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.lists).toHaveLength(1)
      expect(result.current.results.lists[0].title).toBe('Movies to Watch')
    })

    it('shows category label as subtitle', async () => {
      const lists = [
        createMockList({
          title: 'Best Pizzerias',
          category: 'food_drink',
        }),
      ]
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines: [], lists })
      )

      act(() => {
        result.current.setQuery('pizza')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.lists[0].subtitle).toBe('Food & Drink')
    })

    it('includes list type and id in result', async () => {
      const list = createMockList({ id: 'list-123', title: 'Test List' })
      const { result } = renderHook(() =>
        useSearch({ tasks: [], projects: [], contacts: [], routines: [], lists: [list] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      const searchResult = result.current.results.lists[0]
      expect(searchResult.type).toBe('list')
      expect(searchResult.id).toBe('list-123')
      expect(searchResult.item).toBe(list)
    })
  })

  describe('fuzzy matching', () => {
    it('finds results with typos', async () => {
      const tasks = [createMockTask({ title: 'Schedule appointment' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('schedlue') // typo
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
    })

    it('finds partial matches', async () => {
      const tasks = [createMockTask({ title: 'Review quarterly report' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('quarter')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
    })
  })

  describe('grouped results', () => {
    it('groups results by type', async () => {
      const tasks = [createMockTask({ title: 'Test task' })]
      const projects = [createMockProject({ name: 'Test project' })]
      const contacts = [createMockContact({ name: 'Test person' })]
      const routines = [createMockRoutine({ name: 'Test routine' })]
      const lists = [createMockList({ title: 'Test list' })]

      const { result } = renderHook(() =>
        useSearch({ tasks, projects, contacts, routines, lists })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(1)
      expect(result.current.results.projects).toHaveLength(1)
      expect(result.current.results.contacts).toHaveLength(1)
      expect(result.current.results.routines).toHaveLength(1)
      expect(result.current.results.lists).toHaveLength(1)
      expect(result.current.totalResults).toBe(5)
    })

    it('returns empty arrays when no matches', async () => {
      const tasks = [createMockTask({ title: 'Buy groceries' })]
      const { result } = renderHook(() =>
        useSearch({ tasks, projects: [], contacts: [], routines: [], lists: [] })
      )

      act(() => {
        result.current.setQuery('xyz123nonexistent')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks).toHaveLength(0)
      expect(result.current.results.projects).toHaveLength(0)
      expect(result.current.results.contacts).toHaveLength(0)
      expect(result.current.results.routines).toHaveLength(0)
      expect(result.current.results.lists).toHaveLength(0)
      expect(result.current.totalResults).toBe(0)
    })
  })

  describe('result structure', () => {
    it('includes type, id, and item reference for tasks', async () => {
      const task = createMockTask({ id: 'task-123', title: 'Test' })
      const { result } = renderHook(() =>
        useSearch({ tasks: [task], projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      const searchResult = result.current.results.tasks[0]
      expect(searchResult.type).toBe('task')
      expect(searchResult.id).toBe('task-123')
      expect(searchResult.item).toBe(task)
    })

    it('includes completed status for tasks', async () => {
      const task = createMockTask({ title: 'Test', completed: true })
      const { result } = renderHook(() =>
        useSearch({ tasks: [task], projects: [], contacts: [], routines: [] })
      )

      act(() => {
        result.current.setQuery('test')
      })

      await act(async () => {
        vi.advanceTimersByTime(200)
      })

      expect(result.current.results.tasks[0].completed).toBe(true)
    })
  })
})
