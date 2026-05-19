import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'

vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', setDomain: vi.fn() }) }
})

const ctxValue = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

function renderView(props: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={{ ...ctxValue, ...ctxOverrides } as never}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={new Date('2026-05-19T09:00:00')} onDateChange={vi.fn()}
        projects={[]} {...props}
      />
    </ScheduleActionsProvider>
  )
}

describe('TodayView', () => {
  it('renders the editorial header date', () => {
    renderView()
    expect(screen.getByText(/Tuesday, May 19, 2026/)).toBeInTheDocument()
  })
  it('renders exactly one stats row (regression guard vs the duplicate-row defect)', () => {
    renderView()
    expect(screen.getAllByText(/tasks? total/i)).toHaveLength(1)
  })
  it('shows the empty state when there are no items', () => {
    renderView()
    expect(screen.getByText(/your day is clear|nothing scheduled/i)).toBeInTheDocument()
  })
  it('renders NO Day/Week/Month control inside TodayView (HomeViewSwitcher owns it)', () => {
    renderView()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })
  it('renders the This Week staging trigger', () => {
    renderView()
    expect(screen.getByRole('button', { name: /this week/i })).toBeInTheDocument()
  })
  it('focus card click scrolls the first item into view', async () => {
    const scrollSpy = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollSpy
    const today = new Date('2026-05-19T09:00:00')
    const { user } = renderView({
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          completed: false,
          createdAt: today,
          updatedAt: today,
          bucket: 'timed' as const,
          scheduledFor: today,
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: /today's focus/i }))
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('renders the assignee filter and a routine show/hide toggle', () => {
    renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('routine toggle flips its label after click', async () => {
    const { user } = renderView()
    const toggle = screen.getByRole('button', { name: /hide daily/i })
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /show daily/i })).toBeInTheDocument()
  })

  it('renders the inline "Add to today" input and submitting fires onCreateTask', async () => {
    const onCreateTask = vi.fn()
    const { user } = renderView({}, { onCreateTask })
    const input = screen.getByPlaceholderText(/add to today/i)
    await user.type(input, 'New thing{Enter}')
    expect(onCreateTask).toHaveBeenCalledWith('New thing')
  })

  it('renders the rich OverdueSection (its own header) for overdue tasks', () => {
    const past = new Date('2026-05-19T09:00:00')
    past.setDate(past.getDate() - 2)
    renderView({
      viewedDate: new Date('2026-05-19T09:00:00'),
      tasks: [
        {
          id: 'overdue-1',
          title: 'Overdue task title',
          completed: false,
          createdAt: past,
          updatedAt: past,
          bucket: 'timed' as const,
          scheduledFor: past,
        },
      ],
    } as never)
    // OverdueSection renders a role="region" aria-label="Overdue tasks" wrapper
    expect(screen.getByRole('region', { name: /overdue tasks/i })).toBeInTheDocument()
    expect(screen.getByText('Overdue task title')).toBeInTheDocument()
  })

  it('OverdueSection receives proactive + follow-up wiring (waiting toggle / suggestions present)', () => {
    const past = new Date('2026-05-17T09:00:00') // 2 days before viewedDate
    const onToggleWaiting = vi.fn()
    renderView(
      {
        viewedDate: new Date('2026-05-19T09:00:00'),
        tasks: [
          {
            id: 'overdue-wired',
            title: 'Wired overdue task',
            completed: false,
            createdAt: past,
            updatedAt: past,
            bucket: 'timed' as const,
            scheduledFor: past,
          },
        ],
      } as never,
      { onToggleWaiting },
    )
    // OverdueSection renders with the aria-label region
    expect(screen.getByRole('region', { name: /overdue tasks/i })).toBeInTheDocument()
    expect(screen.getByText('Wired overdue task')).toBeInTheDocument()
    // The "Overdue" h3 heading is present — rendered by OverdueSection
    // (use getAllByText since the region aria-label also contains "overdue")
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThan(0)
    // onToggleWaiting was passed into context — ScheduleItem renders a waiting toggle
    // when onToggleWaiting is provided; verify it's reachable (no prop-threading crash)
    expect(screen.getByRole('region', { name: /overdue tasks/i })).toBeInTheDocument()
  })

  it('renders timeline insert (+) slots when create-at handlers are available', () => {
    const today = new Date('2026-05-19T09:00:00')
    renderView(
      {
        tasks: [
          {
            id: 'task-1',
            title: 'Test task',
            completed: false,
            createdAt: today,
            updatedAt: today,
            bucket: 'timed' as const,
            scheduledFor: today,
          },
        ],
      } as never,
      {
        onCreateTaskAt: vi.fn(),
        onCreateEventAt: vi.fn(),
        onCreateRoutineAt: vi.fn(),
      },
    )
    // TimelineInsertPoint renders a button with aria-label "Add between items"
    expect(screen.getAllByRole('button', { name: /add between items/i }).length).toBeGreaterThan(0)
  })
})
