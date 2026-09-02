import { describe, it, expect, vi, afterEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { createMockRoutine } from '@/test/mocks/factories'
import { TodayView } from './TodayView'

// File-wide mock: every test in this file renders TodayView's mobile branch.
// This affects the EveningMealCard branch (TodayView.tsx ~line 651) and WHERE
// the overflow menu mounts (mobile: beside the date masthead; desktop: in the
// controls strip). Override per test with `mockUseMobile.mockReturnValue(false)`
// (reset in afterEach) to reach the desktop paths.
const mockUseMobile = vi.fn(() => true)
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mockUseMobile() }))
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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn() }) }
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
  it('keeps the routine show/hide toggle in the overflow', async () => {
    const { user } = renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    await openOverflow(user)
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('shows the assignee filter directly in the controls strip, not behind the overflow', () => {
    // Scott reaches for assignee filtering far more than "Plan today" — it's the
    // one visible control now; "Plan today" moved into the overflow instead.
    renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true, onSelectAssignees: vi.fn() })
    expect(screen.getByRole('button', { name: /filter by assignee/i })).toBeInTheDocument()
  })

  it('offers no "Plan today" anywhere (guided sessions left with the analog-planning pivot)', async () => {
    const { user } = renderView()
    expect(screen.queryByRole('button', { name: /plan today/i })).not.toBeInTheDocument()
    await openOverflow(user)
    expect(screen.queryByRole('button', { name: /plan today/i })).not.toBeInTheDocument()
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

  it('carried-over tasks live in the backlog footer: one line, expanding to the list', () => {
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
    // Carried-over work stays off the page entirely — no count, no inline
    // list. The footer spends one muted "Review", and the task is reachable
    // through it, in the same bounded triage that owns the rest of the
    // backlog.
    expect(screen.queryByText(/carried over/i)).toBeNull()
    expect(screen.queryByText('Overdue task title')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Overdue task title')).toBeInTheDocument()
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

  // Pins the fix-round-2 widening: rung 7's everyday sweep has a pin/dose
  // escape (isPinnedToTimeline) that the old hand-rolled `type !== 'daily'`
  // check never had. A daily + untimed + pinned routine (the med-tracker
  // shape) is placeable work and must be counted; the same routine unpinned
  // must still be swept. This is the one seam that reaches the clarity
  // count without a dedicated export — through the rendered curtain text.
  describe('Clarity placeable count — pin/dose escape from the everyday sweep', () => {
    it('counts a pinned untimed daily routine as placeable work', async () => {
      const pinned = createMockRoutine({
        recurrence_pattern: { type: 'daily' },
        time_of_day: null,
        pin_to_timeline: true,
      })
      const { user } = renderView({ routines: [pinned] })
      await openOverflow(user)
      await user.click(screen.getByLabelText(/clarity/i))
      expect(await screen.findByText(/1 item to place/i)).toBeInTheDocument()
    })

    it('does not count the same routine unpinned — the everyday sweep still applies', async () => {
      const unpinned = createMockRoutine({
        recurrence_pattern: { type: 'daily' },
        time_of_day: null,
      })
      const { user } = renderView({ routines: [unpinned] })
      await openOverflow(user)
      await user.click(screen.getByLabelText(/clarity/i))
      await screen.findByRole('dialog', { name: /clarity/i })
      // Depending on time of day the curtain shows either "You're clear" or
      // the per-step "Your day is placed" line — neither contains "to place",
      // so this holds regardless of when the suite runs.
      expect(screen.queryByText(/to place/i)).not.toBeInTheDocument()
    })
  })

  describe('Up next (in place)', () => {
    it('highlights the next incomplete timed item in its row — no hero card, no duplicate', () => {
      const nextTime = new Date()
      nextTime.setMinutes(nextTime.getMinutes() - 30) // within the 2h grace window
      if (nextTime.getDate() !== new Date().getDate()) {
        // Test ran within 30 min of midnight — use an upcoming slot instead.
        nextTime.setMinutes(nextTime.getMinutes() + 60)
      }
      renderView({
        tasks: [
          {
            id: 'next-task',
            title: 'Call the pediatrician',
            completed: false,
            createdAt: TODAY,
            updatedAt: TODAY,
            bucket: 'timed' as const,
            scheduledFor: nextTime,
          },
        ],
      } as never)

      // The commitment stays IN the timeline; the marker line above the row
      // is the entire treatment. Lifting it into a hero card left its home
      // section rendering an empty "· up next" heading.
      expect(screen.queryByTestId('up-next-hero')).toBeNull()
      const marker = screen.getByTestId('up-next-marker')
      expect(marker).toHaveTextContent(/up next/i)
      expect(marker).toHaveTextContent(/since|starts in|starting now/i)
      // Exactly one rendering of the item — nothing lifted, nothing doubled.
      expect(screen.getAllByText('Call the pediatrician')).toHaveLength(1)
    })

    it('renders no marker when nothing qualifies', () => {
      renderView()
      expect(screen.queryByTestId('up-next-marker')).toBeNull()
    })

    // One-tap Reschedule on the up-next row needs no test here: the row is an
    // ordinary ScheduleItem, whose desktop rail carries RescheduleButton
    // (RowActionRail.test.tsx "holds Reschedule for an open task") and whose
    // apply path is pinned by RescheduleButton.test.tsx. The hero used to need
    // its own copy because it was a separate component; there is no separate
    // component anymore — that is the point.
  })

  it('renders the flat agenda: no period headings, every timed item in one list', () => {
    // Two items in different periods (8am / 2pm). The old layout wrapped each
    // in an EARLY MORNING/MORNING/AFTERNOON band with a heading, count and
    // chevron — more heading than content on a sparse day. The flat agenda
    // renders the rows; times on the rows say when things are. The band
    // structure survives underneath as drag targets only (headers reappear
    // as labels while a drag is live — covered by the drop-zone machinery).
    const morningTime = new Date(TODAY)
    morningTime.setHours(8, 0, 0)
    const afternoonTime = new Date(TODAY)
    afternoonTime.setHours(14, 0, 0)

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
        {
          id: 'afternoon-task',
          title: 'Afternoon task',
          completed: false,
          createdAt: TODAY,
          updatedAt: TODAY,
          bucket: 'timed' as const,
          scheduledFor: afternoonTime,
        },
      ],
    } as never)

    expect(screen.getByText('Morning task')).toBeInTheDocument()
    expect(screen.getByText('Afternoon task')).toBeInTheDocument()
    expect(screen.queryByText('Morning')).not.toBeInTheDocument()
    expect(screen.queryByText('Afternoon')).not.toBeInTheDocument()
  })

  it('completed timed items render in the flat list — no collapsed section hides them', () => {
    // Timed sections used to auto-collapse when everything in them was done,
    // hiding the row behind a header. The flat agenda has no headers to
    // collapse behind: a done item renders checked, in place. (The
    // fold/unfold machinery still runs the Anytime slab, whose collapsed
    // summary row is covered by AnytimeRow.test.tsx.)
    localStorage.clear()

    const afternoonTime = new Date(TODAY)
    afternoonTime.setHours(14, 0, 0, 0)

    renderView({
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

    expect(screen.getByText('Afternoon task, already done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /afternoon/i })).not.toBeInTheDocument()

    localStorage.clear()
  })
})


// ── Plan from paper on mobile web ──
// The desktop controls strip is `hidden md:flex`, so for a long time the only
// "Plan from paper" entry point was invisible on a phone — the one place a
// camera is always at hand. The overflow menu is ONE instance: on mobile it
// mounts beside the date masthead; on desktop it stays in the controls strip.
describe('TodayView plan from paper — mobile entry point', () => {
  afterEach(() => { mockUseMobile.mockReturnValue(true) })

  it('mobile: the overflow lives beside the date masthead, not in the hidden controls strip', () => {
    renderView({ onOpenPlanFromPaper: vi.fn() })
    const strip = screen.getByTestId('today-controls')
    expect(within(strip).queryByRole('button', { name: /more controls/i })).not.toBeInTheDocument()
    const masthead = screen.getByTestId('today-mobile-masthead')
    expect(within(masthead).getByRole('button', { name: /more controls/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /more controls/i })).toHaveLength(1)
  })

  it('mobile: "Plan from paper" is reachable from the overflow and fires the same handler', async () => {
    const onOpenPlanFromPaper = vi.fn()
    const { user } = renderView({ onOpenPlanFromPaper })
    await openOverflow(user)
    await user.click(screen.getByRole('button', { name: /plan from paper/i }))
    expect(onOpenPlanFromPaper).toHaveBeenCalledTimes(1)
  })

  it('mobile: no "Plan from paper" item when the handler is absent', async () => {
    const { user } = renderView()
    await openOverflow(user)
    expect(screen.queryByRole('button', { name: /plan from paper/i })).not.toBeInTheDocument()
  })

  it('desktop: the overflow stays in the controls strip, still one instance', async () => {
    mockUseMobile.mockReturnValue(false)
    const onOpenPlanFromPaper = vi.fn()
    const { user } = renderView({ onOpenPlanFromPaper })
    const strip = screen.getByTestId('today-controls')
    expect(within(strip).getByRole('button', { name: /more controls/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /more controls/i })).toHaveLength(1)
    await openOverflow(user)
    await user.click(screen.getByRole('button', { name: /plan from paper/i }))
    expect(onOpenPlanFromPaper).toHaveBeenCalledTimes(1)
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

  // The teardown contract. A browser's window.print() blocks, so unmounting on
  // the next line was harmless there — but the Mac shell hands printing to
  // AppKit, whose panel is a sheet that renders the page AFTER this call
  // returns. Clearing eagerly printed the screen layout instead of the list.
  // Only `afterprint` may end a print. Don't "simplify" this back.
  it('keeps the printable list mounted until afterprint fires', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const raf = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => { cb(0); return 0 })
    try {
      const { user } = renderView()
      await openOverflow(user)
      await user.click(screen.getByRole('button', { name: /Print list/i }))

      expect(print).toHaveBeenCalled()
      // Still mounted after print() returned — the sheet has not rendered yet.
      expect(screen.getByTestId('printable-day-list')).toBeInTheDocument()

      fireEvent(window, new Event('afterprint'))
      expect(screen.queryByTestId('printable-day-list')).not.toBeInTheDocument()
    } finally {
      print.mockRestore()
      raf.mockRestore()
    }
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

  it('keeps every slipped row off the page and points at them instead', () => {
    renderView({ viewedDate: TODAY, tasks: [mk('c', 'carried thing', 1), mk('s', 'slipped thing', 200)] } as never)
    // Neither population renders on the day — not the one-day-old carry-over,
    // not the 200-day-old slip. The page spends one muted link on both.
    expect(screen.queryByText('carried thing')).toBeNull()
    expect(screen.queryByText('slipped thing')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    // No scoreboard: the footer names neither the size nor the age.
    expect(screen.queryByText(/need attention/)).toBeNull()
    expect(screen.queryByText(/oldest/)).toBeNull()
  })

  it('points at the queue even when the rest of the day is empty', () => {
    // counts.totalItems excludes slipped work, so this day renders "Your day
    // is clear". The attention line must survive that branch or the queue is
    // invisible exactly when it is all that is left.
    renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
    expect(screen.getByText(/Your day is clear/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('Review opens the morning Review drawer with the slipped item triageable', () => {
    // Active management from Today (Scott, 2026-08-18): Review summons a
    // bounded triage ritual as a MODAL — the page itself still spends one
    // line, so the commitment-surface invariant holds. No navigation.
    const back = window.location.pathname + window.location.search
    try {
      renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
      fireEvent.click(screen.getByRole('button', { name: 'Review' }))
      expect(window.location.pathname).toBe(back.split('?')[0])
      expect(screen.getByRole('dialog', { name: /start the day/i })).toBeInTheDocument()
      // The slipped item appears INSIDE the drawer, with a fate on offer.
      expect(screen.getByText('slipped thing')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Someday' })).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', back)
    }
  })

  it('still shows the pointer when the carried-over lane is empty', () => {
    renderView({ viewedDate: TODAY, tasks: [mk('s', 'slipped thing', 200)] } as never)
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('still shows the pointer when only the carried-over lane has work', () => {
    // Carried-over tasks have no other home on the page now that the inline
    // list is gone, so the door must open for them too.
    renderView({ viewedDate: TODAY, tasks: [mk('c', 'carried thing', 1)] } as never)
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('renders no pointer when neither lane has work', () => {
    renderView({ viewedDate: TODAY, tasks: [] } as never)
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
  })
})

