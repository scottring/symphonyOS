import { describe, it, expect, vi } from 'vitest'
import { render, screen } from './test/test-utils'
import App from './App'
import type { Task } from '@/types/task'
import { useState } from 'react'

// Mock useAuth to return a logged-in user
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
    signOut: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
  }),
}))

// Mock useSupabaseTasks to use local state (like useLocalTasks did)
vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => {
    const [tasks, setTasks] = useState<Task[]>([])

    const addTask = (title: string) => {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        completed: false,
        createdAt: new Date(),
      }
      setTasks((prev) => [newTask, ...prev])
    }

    const toggleTask = (id: string) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id ? { ...task, completed: !task.completed } : task
        )
      )
    }

    const deleteTask = (id: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== id))
    }

    const updateTask = (id: string, updates: Partial<Task>) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id ? { ...task, ...updates } : task
        )
      )
    }

    return { tasks, loading: false, error: null, addTask, toggleTask, deleteTask, updateTask }
  },
}))

// Mock useGoogleCalendar to avoid Supabase calls
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: false,
    isLoading: false,
    events: [],
    connect: vi.fn(),
    disconnect: vi.fn(),
    fetchTodayEvents: vi.fn(),
    fetchWeekEvents: vi.fn(),
    fetchEvents: vi.fn(),
  }),
}))

// Mock useEventNotes to avoid Supabase calls
vi.mock('@/hooks/useEventNotes', () => ({
  useEventNotes: () => ({
    notes: new Map(),
    loading: false,
    error: null,
    fetchNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    getNote: vi.fn(),
  }),
}))

describe('App', () => {
  it('renders the app name in sidebar', () => {
    render(<App />)
    expect(screen.getByText('Symphony')).toBeInTheDocument()
  })

  it('renders empty state when no tasks', () => {
    render(<App />)
    expect(screen.getByText('Your day is clear')).toBeInTheDocument()
  })

  it('renders Today header', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('can add a task', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'My first task')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('My first task')).toBeInTheDocument()
  })

  it('can complete a task via checkbox', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Task to complete')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Find and click the checkbox button (not a native checkbox anymore)
    const completeButton = screen.getByRole('button', { name: /mark complete/i })
    await user.click(completeButton)

    // The task title should now have line-through styling (completed)
    const taskTitle = screen.getByText('Task to complete')
    expect(taskTitle).toHaveClass('line-through')
  })

  it('can delete a task via detail panel', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Task to delete')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Click the task to open detail panel
    await user.click(screen.getByText('Task to delete'))

    // Find delete button in detail panel - it's a button element with text "Delete"
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    // The actual delete button is the one with the visible "Delete" text span
    const deleteButton = deleteButtons.find(btn => btn.querySelector('span')?.textContent === 'Delete')
    expect(deleteButton).toBeTruthy()
    await user.click(deleteButton!)

    expect(screen.queryByText('Task to delete')).not.toBeInTheDocument()
  })

  it('shows tasks in unscheduled section', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Unscheduled task')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Task appears in the Unscheduled section
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
    expect(screen.getByText('Unscheduled task')).toBeInTheDocument()
  })

  it('displays user email', () => {
    render(<App />)
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows calendar connect option when not connected', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument()
  })
})
