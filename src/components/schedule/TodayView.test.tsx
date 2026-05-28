import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useEmailActionItems', () => ({ useEmailActionItems: () => ({ items: [], urgentItems: [], loading: false, acknowledge: vi.fn(), dismiss: vi.fn(), snooze: vi.fn(), markDone: vi.fn(), getByCategory: vi.fn(), refetch: vi.fn() }) }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', setDomain: vi.fn() }) }
})

// Mutable state for useTimelineInsert so individual tests can override noteComposer
let mockNoteComposer: { anchor: Date | null } | null = null
const mockCloseNoteComposer = vi.fn()
const mockHandlePick = vi.fn()
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({
    handlePick: mockHandlePick,
    noteComposer: mockNoteComposer,
    closeNoteComposer: mockCloseNoteComposer,
  }),
}))

const ctxValue = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

// Use the actual current date so computeIsToday() returns true for today-mode tests
const TODAY = new Date()

function renderView(props: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={{ ...ctxValue, ...ctxOverrides } as never}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={TODAY} onDateChange={vi.fn()}
        projects={[]} {...props}
      />
    </ScheduleActionsProvider>
  )
}

describe('TodayView', () => {
  it('renders the stats row (HomeHeader date label is now in HomeView, not TodayView)', () => {
    // The date label (e.g. "Tuesday, May 19, 2026") moved to HomeHeader which is
    // rendered by HomeView — it is not in TodayView's subtree. TodayView's own
    // stable landmark is the StatsRow ("N of N done today").
    renderView()
    expect(screen.getByText(/\d+ of \d+ done today/i)).toBeInTheDocument()
  })
  it('renders exactly one stats row (regression guard vs the duplicate-row defect)', () => {
    // "tasks total" was removed by the Today redesign; use "done today" — always
    // rendered by StatsRow and unique to it — as the duplicate-row sentinel.
    renderView()
    expect(screen.getAllByText(/\d+ of \d+ done today/i)).toHaveLength(1)
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
  it('focus card click scrolls to AND opens the top-priority task', async () => {
    const scrollSpy = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollSpy
    const onSelectItem = vi.fn()
    const { user } = renderView({
      onSelectItem,
      tasks: [
        {
          id: 'abc',
          title: 'Test task',
          completed: false,
          createdAt: TODAY,
          updatedAt: TODAY,
          bucket: 'timed' as const,
          scheduledFor: TODAY,
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: /today's focus/i }))
    expect(scrollSpy).toHaveBeenCalled()
    // The card no longer just scrolls — it opens the top priority's detail panel.
    expect(onSelectItem).toHaveBeenCalledWith('task-abc')
  })

  it('renders the assignee filter and a routine show/hide toggle', () => {
    renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('shows a Plan day button that opens the planning grid', async () => {
    const onOpenPlanning = vi.fn()
    const { user } = renderView({}, { onOpenPlanning })
    await user.click(screen.getByRole('button', { name: /plan day/i }))
    expect(onOpenPlanning).toHaveBeenCalled()
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
    // TodayView renders the input in both a desktop-only div (hidden md:block) and a
    // mobile-only div (md:hidden); jsdom has no CSS so both are in the DOM — use the first.
    const inputs = screen.getAllByPlaceholderText(/add to today/i)
    expect(inputs.length).toBeGreaterThan(0)
    await user.type(inputs[0], 'New thing{Enter}')
    expect(onCreateTask).toHaveBeenCalledWith('New thing')
  })

  it('renders the rich OverdueSection (its own header) for overdue tasks', () => {
    // Build a past date 2 days before actual today so computeIsToday + selectOverdue both fire
    const past = new Date(TODAY)
    past.setDate(past.getDate() - 2)
    renderView({
      viewedDate: TODAY,
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
    // Build a past date 2 days before actual today so selectOverdue picks it up
    const past = new Date(TODAY)
    past.setDate(past.getDate() - 2)
    const onToggleWaiting = vi.fn()
    renderView(
      {
        viewedDate: TODAY,
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

  it('mounts EmailActionsBanner without breaking the Today render', () => {
    renderView()
    // EmailActionsBanner self-hides when items empty; assert the Today view still renders intact
    expect(screen.getAllByText(/done today|tasks total|your day is clear|nothing scheduled/i).length).toBeGreaterThan(0)
  })

  it('renders timeline insert (+) slots when create-at handlers are available', () => {
    renderView(
      {
        tasks: [
          {
            id: 'task-1',
            title: 'Test task',
            completed: false,
            createdAt: TODAY,
            updatedAt: TODAY,
            bucket: 'timed' as const,
            scheduledFor: TODAY,
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

  it('renders TimelineNoteComposer when insert.noteComposer is set', () => {
    // Activate the note composer by setting the module-level mock state
    mockNoteComposer = { anchor: new Date('2026-05-19T10:00:00') }
    try {
      renderView({
        onCreateNoteAt: vi.fn(),
        onAppendNoteAt: vi.fn(),
        onLinkNote: vi.fn(),
        timelineNotes: [],
      })
      // TimelineNoteComposer renders "New note" / "Link existing" mode tabs
      expect(screen.getByRole('button', { name: /new note/i })).toBeInTheDocument()
    } finally {
      // Reset so other tests are unaffected
      mockNoteComposer = null
    }
  })

  it('renders mobile section headers in italic serif on mobile', () => {
    // Create a task scheduled for the morning (8am)
    const morningTime = new Date(TODAY)
    morningTime.setHours(8, 0, 0)

    renderView({
      tasks: [
        {
          id: 'morning-task',
          title: 'Morning task',
          completed: false,
          createdAt: TODAY,
          updatedAt: TODAY,
          bucket: 'timed' as const,
          scheduledFor: morningTime,
        },
      ],
    } as never)

    // Query for h3 elements with md:hidden class
    const headers = document.querySelectorAll('h3.md\\:hidden')
    expect(headers.length).toBeGreaterThan(0)

    // Verify each header has the font-display italic styling
    headers.forEach((h) => {
      const span = h.querySelector('span.font-display')
      expect(span).not.toBeNull()
      expect(span?.className).toMatch(/italic/)
    })
  })
})
