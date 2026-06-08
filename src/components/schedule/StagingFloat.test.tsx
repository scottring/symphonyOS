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

const pinSet = new Set<string>()
const mockPin = vi.fn((_t: string, id: string) => { pinSet.add(id); return Promise.resolve(true) })
const mockUnpin = vi.fn((_t: string, id: string) => { pinSet.delete(id); return Promise.resolve(true) })
vi.mock('@/hooks/usePinnedItems', () => ({
  usePinnedItems: () => ({
    isPinned: (_t: string, id: string) => pinSet.has(id),
    pin: mockPin,
    unpin: mockUnpin,
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

  beforeEach(() => { vi.clearAllMocks(); pinSet.clear() })

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

  it('renders the summary strip with section counts', () => {
    render(<StagingFloat {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    // Two project-less week tasks => Standalone + Focus labels present (the
    // strip plus the section header may each render the label).
    expect(screen.getAllByText('Standalone').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Focus').length).toBeGreaterThan(0)
  })

  it('toggles a task into Focus via its star', () => {
    render(<StagingFloat {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    fireEvent.click(screen.getByRole('button', { name: /add Week task A to Focus/i }))
    expect(mockPin).toHaveBeenCalledWith('task', 'w1')
  })

  it('adds a week task from the inline input on Enter', () => {
    render(<StagingFloat {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /this week/i }))
    const input = screen.getByPlaceholderText(/add a task/i)
    fireEvent.change(input, { target: { value: 'Buy mulch' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('')
  })
})
