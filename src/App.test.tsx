import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from './test/test-utils'
import App from './App'
import type { Task } from '@/types/task'
import { useState } from 'react'

// Mock supabase to return completed onboarding
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { onboarding_completed_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'test-user-id', email: 'test@example.com' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))

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

// Mock useSupabaseTasks to use local state
vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => {
    const [tasks, setTasks] = useState<Task[]>([])

    const addTask = async (title: string): Promise<string | undefined> => {
      const id = crypto.randomUUID()
      const newTask: Task = {
        id,
        title,
        completed: false,
        createdAt: new Date(),
        // Optional fields default to undefined (inbox task)
      }
      setTasks((prev) => [newTask, ...prev])
      return id
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

    const pushTask = (id: string, date: Date) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? { ...task, deferredUntil: date, deferCount: (task.deferCount ?? 0) + 1 }
            : task
        )
      )
    }

    return { tasks, loading: false, error: null, addTask, toggleTask, deleteTask, updateTask, pushTask }
  },
}))

// Mock useGoogleCalendar to avoid Supabase calls
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: false,
    isLoading: false,
    isFetching: false,
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
    fetchNotesForEvents: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    getNote: vi.fn(),
  }),
}))

// Mock useContacts to avoid Supabase calls
vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({
    contacts: [],
    contactsMap: new Map(),
    loading: false,
    error: null,
    addContact: vi.fn().mockResolvedValue({ id: 'new-contact', name: 'Test Contact', createdAt: new Date(), updatedAt: new Date() }),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    searchContacts: vi.fn().mockReturnValue([]),
    getContactById: vi.fn(),
  }),
}))

// Mock useProjects
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [],
    projectsMap: new Map(),
    loading: false,
    error: null,
    addProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    searchProjects: vi.fn().mockReturnValue([]),
  }),
}))

// Mock useRoutines
vi.mock('@/hooks/useRoutines', () => ({
  useRoutines: () => ({
    routines: [],
    activeRoutines: [],
    getRoutinesForDate: vi.fn().mockReturnValue([]),
    loading: false,
    addRoutine: vi.fn(),
    updateRoutine: vi.fn(),
    deleteRoutine: vi.fn(),
    toggleVisibility: vi.fn(),
  }),
}))

// Mock useActionableInstances
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    getInstancesForDate: vi.fn().mockResolvedValue([]),
  }),
}))

// Mock useFamilyMembers
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [],
    loading: false,
    error: null,
    addMember: vi.fn(),
    updateMember: vi.fn(),
    deleteMember: vi.fn(),
    getMember: vi.fn(),
    getCurrentUserMember: vi.fn(),
    refetch: vi.fn(),
  }),
}))

// Mock useMobile to return false (desktop mode)
vi.mock('@/hooks/useMobile', () => ({
  useMobile: () => false,
}))

describe('App', () => {
  it('renders the app name in sidebar', async () => {
    render(<App />)
    expect(await screen.findByText('Symphony')).toBeInTheDocument()
  })

  it('renders empty state when no tasks', async () => {
    render(<App />)
    expect(await screen.findByText('Your day is clear')).toBeInTheDocument()
  })

  it('renders Today header', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('can add a task via QuickCapture modal', async () => {
    const { user } = render(<App />)

    // Wait for app to load
    await screen.findByText('Symphony')

    // On desktop, use Cmd+K to open quick add modal
    await user.keyboard('{Meta>}k{/Meta}')

    // Type in the modal input
    const input = await screen.findByPlaceholderText("What's on your mind?")
    await user.type(input, 'My first task')

    // Click Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Task appears in Inbox section
    await waitFor(() => {
      expect(screen.getByText('My first task')).toBeInTheDocument()
    })
  })

  it('shows tasks in inbox section', async () => {
    const { user } = render(<App />)

    // Wait for app to load
    await screen.findByText('Symphony')

    // On desktop, use Cmd+K to open quick add modal
    await user.keyboard('{Meta>}k{/Meta}')

    const input = await screen.findByPlaceholderText("What's on your mind?")
    await user.type(input, 'Inbox task')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Task appears in the Inbox section (at bottom)
    await waitFor(() => {
      expect(screen.getByText(/Inbox \(\d+\)/)).toBeInTheDocument()
      expect(screen.getByText('Inbox task')).toBeInTheDocument()
    })
  })

  it('displays user email', async () => {
    render(<App />)
    expect(await screen.findByText('test@example.com')).toBeInTheDocument()
  })

  it('shows calendar connect option when not connected', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: /connect google calendar/i })).toBeInTheDocument()
  })
})
