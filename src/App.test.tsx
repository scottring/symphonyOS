import { describe, it, expect, vi, beforeEach } from 'vitest'
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

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByText('Symphony OS')).toBeInTheDocument()
  })

  it('renders empty state when no tasks', () => {
    render(<App />)
    expect(screen.getByText('No tasks yet. Add one above!')).toBeInTheDocument()
  })

  it('can add a task', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'My first task')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('My first task')).toBeInTheDocument()
  })

  it('can complete a task', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Task to complete')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('can delete a task', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Task to delete')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await user.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(screen.queryByText('Task to delete')).not.toBeInTheDocument()
  })

  it('shows tasks in unscheduled section', async () => {
    const { user } = render(<App />)
    const input = screen.getByPlaceholderText('Add a task...')
    await user.type(input, 'Unscheduled task')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Task appears in the Tasks section (unscheduled)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Unscheduled task')).toBeInTheDocument()
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
  })

  it('shows Active Now section', () => {
    render(<App />)
    expect(screen.getByText('Active Now')).toBeInTheDocument()
    expect(screen.getByText('Your day is clear. Add a task to get started.')).toBeInTheDocument()
  })

  it('displays user email and sign out button', () => {
    render(<App />)
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows calendar connect option when not connected', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument()
  })
})
