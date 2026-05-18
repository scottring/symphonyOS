import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { StagingFloat } from './StagingFloat'
import { createMockTask } from '@/test/mocks/factories'

vi.mock('@/hooks/useGooglePlaces', () => ({
  useGooglePlaces: () => ({ results: [], loading: false, searchPlaces: vi.fn(), getPlaceDetails: vi.fn(), clearResults: vi.fn() }),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [],
    projectsMap: new Map(),
    activeProjects: [],
    loading: false,
    error: null,
    addProject: vi.fn().mockResolvedValue(null),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    searchProjects: vi.fn().mockReturnValue([]),
    getProjectById: vi.fn(),
    getChildProjects: vi.fn().mockReturnValue([]),
    recalculateProjectStatus: vi.fn(),
  }),
}))

vi.mock('@/hooks/useNotes', () => ({
  useNotes: () => ({
    notes: [],
    loading: false,
    error: null,
    addNote: vi.fn().mockResolvedValue(null),
    updateNote: vi.fn().mockResolvedValue(null),
    deleteNote: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    tasks: [],
    loading: false,
    error: null,
    addTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(null),
  }),
}))

describe('StagingFloat', () => {
  const baseProps = {
    weekTasks: [
      createMockTask({ id: 'w1', title: 'Week task A', bucket: 'week' as const }),
      createMockTask({ id: 'w2', title: 'Week task B', bucket: 'week' as const }),
    ],
    projects: [],
    familyMembers: [],
    onPullToToday: vi.fn(),
    onSelectTask: vi.fn(),
    onCompleteTask: vi.fn(),
    onDeferTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onUpdateTask: vi.fn(),
    inline: true,
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders the trigger pill with the week count', () => {
    render(<StagingFloat {...baseProps} />)
    expect(screen.getByRole('button', { name: /this week/i })).toHaveTextContent('2')
  })

  it('opens the popover and shows only week tasks', () => {
    render(<StagingFloat {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    expect(screen.getByText('Week task A')).toBeInTheDocument()
    expect(screen.getByText('Week task B')).toBeInTheDocument()
  })

  it('calls onPullToToday when Today clicked', () => {
    const onPullToToday = vi.fn()
    render(<StagingFloat {...baseProps} onPullToToday={onPullToToday} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    const todayButtons = screen.getAllByRole('button', { name: /^today$/i })
    fireEvent.click(todayButtons[0])
    // Wait for setTimeout to fire (220ms)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onPullToToday).toHaveBeenCalledWith('w1')
        resolve()
      }, 250)
    })
  })

  it('calls onUpdateTask with weekDeferredAt when Next Week clicked', () => {
    const onUpdateTask = vi.fn()
    render(<StagingFloat {...baseProps} onUpdateTask={onUpdateTask} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /next week/i })[0])
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onUpdateTask).toHaveBeenCalledWith('w1', expect.objectContaining({ weekDeferredAt: expect.any(Date) }))
        resolve()
      }, 250)
    })
  })

  it('calls onDeferTask with quarter when Someday clicked', () => {
    const onDeferTask = vi.fn()
    render(<StagingFloat {...baseProps} onDeferTask={onDeferTask} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^someday$/i })[0])
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onDeferTask).toHaveBeenCalledWith('w1', 'quarter')
        resolve()
      }, 250)
    })
  })

  it('still renders the trigger (count 0) when there are no week tasks', () => {
    render(<StagingFloat {...baseProps} weekTasks={[]} />)
    const trigger = screen.getByRole('button', { name: /this week/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('0')
  })

  it('shows an empty state in the dialog when opened with no week tasks', () => {
    render(<StagingFloat {...baseProps} weekTasks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    expect(screen.getByText(/nothing scheduled this week/i)).toBeInTheDocument()
  })
})
