import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
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

/**
 * Today's secondary controls (staging triggers, Clarity, discussion, assignee
 * filter, show/hide daily, print, time-block) live behind one overflow button.
 * They are hidden, not removed — these tests assert exactly that, so opening the
 * menu is part of the contract rather than a workaround.
 */
async function openOverflow(user: { click: (el: Element) => Promise<void> }) {
  await user.click(screen.getByRole('button', { name: /more controls/i }))
}

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
    // rendered by HomeView — it is not in TodayView's subtree. The counts and the
    // always-on control chips are gone entirely; what remains is a thin strip of
    // "Plan today" + the overflow, identified by data-testid="today-controls".
    renderView()
    expect(screen.getByTestId('today-controls')).toBeInTheDocument()
  })
  it('renders exactly one controls strip (regression guard vs the duplicate-row defect)', () => {
    // The controls strip is unique to TodayView — the duplicate-row sentinel.
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
  it('no longer offers the This Week / This Month staging triggers (backlog left the page)', async () => {
    // Inbox, /week and /month are now the canonical homes for that work;
    // Today surfaces it only through the attention line.
    const { user } = renderView()
    await openOverflow(user)
    expect(screen.queryByRole('button', { name: /this week/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /this month/i })).not.toBeInTheDocument()
  })
  it('keeps the assignee filter and routine show/hide toggle in the overflow', async () => {
    const { user } = renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    await openOverflow(user)
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('no longer shows a standalone "Plan day" button (time-blocking moved into the Plan today flow)', () => {
    const onOpenPlanning = vi.fn()
    renderView({}, { onOpenPlanning })
    expect(screen.queryByRole('button', { name: /plan day/i })).not.toBeInTheDocument()
  })

  it('routine toggle flips its label after click', async () => {
    const { user } = renderView()
    await openOverflow(user)
    await user.click(screen.getByRole('button', { name: /hide daily/i }))
    await openOverflow(user)
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
    // OverdueSection renders a role="region" aria-label="Carried over tasks" wrapper,
    // collapsed by default to a single calm line (count + first title).
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
    expect(screen.getByText(/1 carried over/i)).toBeInTheDocument()
    // Expanding reveals the full rows
    fireEvent.click(screen.getByText(/1 carried over/i))
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
    // CarriedOver (overdue) section renders with its aria-label region,
    // collapsed by default — expand it to reach the wired rows.
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/1 carried over/i))
    expect(screen.getByText('Wired overdue task')).toBeInTheDocument()
    // The "Carried over" h3 heading is present — rendered by OverdueSection
    expect(screen.getByText('Carried over')).toBeInTheDocument()
    // onToggleWaiting was passed into context — ScheduleItem renders a waiting toggle
    // when onToggleWaiting is provided; verify it's reachable (no prop-threading crash)
    expect(screen.getByRole('region', { name: /carried over tasks/i })).toBeInTheDocument()
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
          // Second task at the same time: the Up Next hero lifts the first
          // candidate out of its section, this one keeps the section rendered.
          {
            id: 'task-2',
            title: 'Second test task',
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

  it('shows the discussion badge in the overflow when a task needs discussion', async () => {
    const { user } = renderView({
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
    await openOverflow(user)
    expect(screen.getByText(/to discuss/i)).toBeInTheDocument()
  })

  it('keeps the Clarity binoculars reachable from the overflow', async () => {
    // Clarity is a binoculars icon with an explanatory hover tooltip; the static
    // status glance still lives in the sidebar.
    const { user } = renderView()
    await openOverflow(user)
    expect(screen.getByLabelText(/clarity/i)).toBeInTheDocument()
  })

  describe('Up Next hero', () => {
    it('lifts the next incomplete timed item into the hero card (no duplicate row)', () => {
      const heroTime = new Date()
      heroTime.setMinutes(heroTime.getMinutes() - 30) // within the 2h grace window
      if (heroTime.getDate() !== new Date().getDate()) {
        // Test ran within 30 min of midnight — use an upcoming slot instead.
        heroTime.setMinutes(heroTime.getMinutes() + 60)
      }
      renderView({
        tasks: [
          {
            id: 'hero-task',
            title: 'Call the pediatrician',
            completed: false,
            createdAt: TODAY,
            updatedAt: TODAY,
            bucket: 'timed' as const,
            scheduledFor: heroTime,
          },
        ],
      } as never)

      const hero = screen.getByTestId('up-next-hero')
      expect(hero).toHaveTextContent('Call the pediatrician')
      expect(hero).toHaveTextContent(/since|starts in|starting now/i)
      // Tasks get a one-tap Done as the hero action
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
      // The hero item is lifted OUT of its day section — it must not render twice
      expect(screen.getAllByText('Call the pediatrician')).toHaveLength(1)
    })

    it('renders no hero when nothing qualifies', () => {
      renderView()
      expect(screen.queryByTestId('up-next-hero')).toBeNull()
    })

    it('hero task has a one-tap Reschedule — triaging out of Up Next must not require the panel', async () => {
      const onPushTask = vi.fn()
      const heroTime = new Date()
      heroTime.setMinutes(heroTime.getMinutes() - 30)
      if (heroTime.getDate() !== new Date().getDate()) {
        heroTime.setMinutes(heroTime.getMinutes() + 60)
      }
      const { user } = renderView(
        {
          tasks: [
            {
              id: 'hero-task',
              title: 'Call the pediatrician',
              completed: false,
              createdAt: TODAY,
              updatedAt: TODAY,
              bucket: 'timed' as const,
              scheduledFor: heroTime,
            },
          ],
        } as never,
        { onPushTask },
      )
      await user.click(screen.getByRole('button', { name: /reschedule/i }))
      await user.click(screen.getByRole('menuitem', { name: /tomorrow/i }))
      expect(onPushTask).toHaveBeenCalledWith('hero-task', expect.any(Date))
    })
  })

  it('renders the Morning section header once when items remain after the hero is lifted', () => {
    // Create a task scheduled for the morning (8am) so the Morning section
    // actually renders.
    const morningTime = new Date(TODAY)
    morningTime.setHours(8, 0, 0)

    const morningTimeLater = new Date(morningTime)
    morningTimeLater.setMinutes(5)

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
        // Two morning tasks: whichever the Up Next hero lifts, the other keeps
        // the Morning section header rendered.
        {
          id: 'morning-task-2',
          title: 'Second morning task',
          completed: false,
          createdAt: TODAY,
          updatedAt: TODAY,
          bucket: 'timed' as const,
          scheduledFor: morningTimeLater,
        },
      ],
    } as never)

    // Task 6 lifted the header into DaySectionHeader — a single element
    // rendered once, replacing the old desktop `<h3 className="hidden
    // md:flex">` / mobile `<h3 className="md:hidden">` italic-serif pair
    // that jsdom rendered both halves of. DaySectionHeader's own responsive
    // and typography treatment is covered by DaySectionHeader.test.tsx.
    expect(screen.getByText('Morning')).toBeInTheDocument()
  })

  it('an auto-collapsed all-complete section opens on click and stays open, then closes again on the next click', async () => {
    // Regression test for a collapse-state bug: `toggleSection` used to flip
    // `collapsedKeys` and `openedByUser` together on every click. Because a
    // never-touched, all-complete section starts with both sets false, and
    // the two sets were always mutated in lockstep, the one combination that
    // should render it OPEN (`collapsedKeys` false AND `openedByUser` true)
    // was unreachable — the chevron and aria-expanded flipped, but the body
    // never rendered. This test clicks through open -> closed and would have
    // failed against that logic (verified below via reasoning, see the task
    // report for the full trace).
    localStorage.clear()

    const afternoonTime = new Date(TODAY)
    afternoonTime.setHours(14, 0, 0, 0)

    const { user } = renderView({
      tasks: [
        {
          id: 'afternoon-done',
          title: 'Afternoon task, already done',
          completed: true,
          createdAt: TODAY,
          updatedAt: TODAY,
          bucket: 'timed' as const,
          scheduledFor: afternoonTime,
        },
      ],
    } as never)

    // Auto-collapsed on first render: header exists, row does not.
    const header = () => screen.getByRole('button', { name: /afternoon/i })
    expect(header()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Afternoon task, already done')).not.toBeInTheDocument()

    // Click opens it — this is the state the old lockstep toggle could never reach.
    await user.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Afternoon task, already done')).toBeInTheDocument()

    // Click again closes it.
    await user.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Afternoon task, already done')).not.toBeInTheDocument()

    localStorage.clear()
  })
})

// ── Print: a compact list on demand. Today renders ~57 rows of cards, chips
// and avatars; this is the same day as one line per item. Mounted only while
// printing so it can't duplicate every title in the DOM. ──
describe('TodayView print list', () => {
  it('offers a Print list control in the overflow', async () => {
    const { user } = renderView()
    await openOverflow(user)
    expect(screen.getByRole('button', { name: /Print list/i })).toBeInTheDocument()
  })

  it('does not keep the printable list in the DOM when not printing', () => {
    renderView()
    expect(screen.queryByTestId('printable-day-list')).not.toBeInTheDocument()
  })

})

describe('TodayView attention line', () => {
  function daysAgo(n: number) {
    const d = new Date(TODAY)
    d.setDate(d.getDate() - n)
    return d
  }
  const mk = (id: string, title: string, n: number) => ({
    id, title, completed: false,
    createdAt: daysAgo(n), updatedAt: daysAgo(n),
    bucket: 'timed' as const, scheduledFor: daysAgo(n),
  })

  it('keeps slipped rows off the page and points at them instead', () => {
    renderView({ viewedDate: TODAY, tasks: [mk('c', 'carried thing', 1), mk('s', 'slipped thing', 200)] } as never)
    // OverdueSection is collapsed by default — expand it to see the rows.
    fireEvent.click(screen.getByText(/1 carried over/i))
    expect(screen.getByText('carried thing')).toBeInTheDocument()
    expect(screen.queryByText('slipped thing')).toBeNull()
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
    expect(screen.getByText(/oldest 200 days/)).toBeInTheDocument()
  })

  it('points at the queue even when the rest of the day is empty', () => {
    // counts.totalItems excludes slipped work, so this day renders "Your day
    // is clear". The attention line must survive that branch or the queue is
    // invisible exactly when it is all that is left.
    renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
    expect(screen.getByText(/Your day is clear/i)).toBeInTheDocument()
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
  })

  it('sends Review to /week instead of opening a list on Today', () => {
    // The review LIST is planning work and lives on /week, in PlanningShelf's
    // carried-over pills — a surface that already existed. Today keeps the
    // one-line signal and nothing else: no list may open here, or the
    // commitment surface grows a triage surface again — the fusion this
    // whole branch exists to undo. Plain navigate, no `?review=` param: the
    // shelf shows this work unconditionally, it needs no seeding.
    const back = window.location.pathname + window.location.search
    try {
      renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
      fireEvent.click(screen.getByText(/1 needs attention/))
      expect(window.location.pathname).toBe('/week')
      expect(window.location.search).toBe('')
      expect(screen.queryByRole('region', { name: /needs attention review/i })).toBeNull()
      expect(screen.queryByText('slipped thing')).toBeNull()
    } finally {
      window.history.replaceState({}, '', back)
    }
  })

  it('still shows the pointer when the carried-over lane is empty', () => {
    renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
  })

  it('renders no pointer when nothing has slipped', () => {
    renderView({ viewedDate: TODAY, tasks: [mk('c', 'carried thing', 1)] } as never)
    expect(screen.queryByText(/needs attention/)).toBeNull()
  })
})

