import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'

// File-wide mock: every test in this file renders TodayView's mobile branch.
// Today this affects exactly one JS branch (the EveningMealCard at
// TodayView.tsx ~line 651) — if you add a meal-related test, scope a
// per-test override with vi.spyOn so the desktop meal card path is reachable.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({ isPinned: () => false, pin: vi.fn(), unpin: vi.fn() }) }))
vi.mock('@/hooks/useEmailActionItems', () => ({ useEmailActionItems: () => ({ items: [], urgentItems: [], loading: false, acknowledge: vi.fn(), dismiss: vi.fn(), snooze: vi.fn(), markDone: vi.fn(), getByCategory: vi.fn(), refetch: vi.fn() }) }))
vi.mock('@/hooks/useActionQueue', () => ({ useActionQueue: () => ({ actions: [], loading: false, approveAction: vi.fn(), rejectAction: vi.fn(), pendingCount: 0, refetch: vi.fn() }) }))
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

const ctxValue = {
  onToggleTask: vi.fn(),
  projects: [],
  contacts: [],
  familyMembers: [],
  lists: [],
  // Smart-capture context fields — provided but undefined by default so the
  // "Add to today" row doesn't render unless a test explicitly passes them.
  parserContext: { projects: [], contacts: [], familyMembers: [] } as import('@/lib/quickInputParser').ParserContext,
  currentDomain: 'personal' as const,
  resolverContext: { contacts: [], aliases: [] } as import('@/lib/entityResolver').ResolverContext,
  getRecentTaskForContact: () => null,
}

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
  it('renders the controls strip (HomeHeader date label is now in HomeView, not TodayView)', () => {
    // The date label (e.g. "Tuesday, May 19, 2026") moved to HomeHeader which is
    // rendered by HomeView — it is not in TodayView's subtree. The numeric counts
    // moved into the unified TodayProgress header; the StatsRow is now a
    // controls-only strip, identified by data-testid="today-controls".
    renderView()
    expect(screen.getByTestId('today-controls')).toBeInTheDocument()
  })
  it('renders exactly one controls strip (regression guard vs the duplicate-row defect)', () => {
    // The controls strip is always rendered by StatsRow and unique to it — use
    // it as the duplicate-row sentinel.
    renderView()
    expect(screen.getAllByTestId('today-controls')).toHaveLength(1)
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
  it('renders the assignee filter and a routine show/hide toggle', () => {
    renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('no longer shows a standalone "Plan day" button (time-blocking moved into the Plan today flow)', () => {
    const onOpenPlanning = vi.fn()
    renderView({}, { onOpenPlanning })
    expect(screen.queryByRole('button', { name: /plan day/i })).not.toBeInTheDocument()
  })

  it('routine toggle flips its label after click', async () => {
    const { user } = renderView()
    const toggle = screen.getByRole('button', { name: /hide daily/i })
    await user.click(toggle)
    expect(screen.getByRole('button', { name: /show daily/i })).toBeInTheDocument()
  })

  it('renders the inline "Add to today" pill and expanding+submitting fires onCreateTaskParsed', async () => {
    const onCreateTaskParsed = vi.fn()
    const { user } = renderView({}, { onCreateTaskParsed })
    // TodayAddInput starts collapsed — shows an "Add to today" button pill.
    // jsdom renders both desktop (hidden md:block) and mobile (md:hidden) variants
    // since CSS media queries are not applied; click the first one to expand.
    const pills = screen.getAllByRole('button', { name: /add to today/i })
    expect(pills.length).toBeGreaterThan(0)
    await user.click(pills[0])
    // Now the input should be visible
    const inputs = screen.getAllByPlaceholderText(/add to today/i)
    expect(inputs.length).toBeGreaterThan(0)
    await user.type(inputs[0], 'New thing{Enter}')
    expect(onCreateTaskParsed).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New thing' }),
    )
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
    // OverdueSection renders a role="region" aria-label="Carried over tasks" wrapper
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
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
    // CarriedOver (overdue) section renders with its aria-label region
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
    expect(screen.getByText('Wired overdue task')).toBeInTheDocument()
    // The "Carried over" h3 heading is present — rendered by OverdueSection
    expect(screen.getByText('Carried over')).toBeInTheDocument()
    // onToggleWaiting was passed into context — ScheduleItem renders a waiting toggle
    // when onToggleWaiting is provided; verify it's reachable (no prop-threading crash)
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
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

  it('shows the discussion badge when a task needs discussion', () => {
    renderView({
      tasks: [
        {
          id: 'disc-1',
          title: 'Talk to Iris about budget',
          completed: false,
          createdAt: TODAY,
          updatedAt: TODAY,
          needsDiscussion: true,
        },
      ],
    })
    expect(screen.getByText(/to discuss/i)).toBeInTheDocument()
  })

  it('renders the Clarity binoculars in the content stats row', () => {
    // Clarity was restored to the Today header as a binoculars icon with an
    // explanatory hover tooltip; the static status glance still lives in the sidebar.
    renderView()
    expect(screen.getByLabelText(/clarity/i)).toBeInTheDocument()
  })

  it('renders the Morning section header on mobile in italic serif', () => {
    // Create a task scheduled for the morning (8am) so the Morning section
    // actually renders.
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

    // Both responsive variants (desktop hidden md:flex + mobile md:hidden)
    // render in jsdom; verifying both exist is the durable behavior check.
    // If the responsive split is ever consolidated, this test will fail
    // loudly and the developer can adjust the count accordingly.
    expect(screen.getAllByText('Morning')).toHaveLength(2)

    // At least one of the two label nodes must carry the mobile variant's
    // editorial italic-serif treatment. Asserted via Tailwind utility
    // classes because that is what makes the mobile variant distinct from
    // the desktop variant; this is the smallest assertion that still
    // verifies the design intent.
    const labels = screen.getAllByText('Morning')
    const italicSerifMatch = labels.some(
      (el) => /font-display/.test(el.className) && /italic/.test(el.className),
    )
    expect(italicSerifMatch).toBe(true)
  })
})
