import { describe, it, expect, vi, afterEach, onTestFinished } from 'vitest'
import { act, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { localYmd } from '@/lib/cadence/config'
import { PLAN_MIME } from '@/lib/planning/planDrag'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import { stepsFor } from '@/lib/guide/steps'
import type { Task } from '@/types/task'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'
import { DesktopControlsContext } from '@/components/layout/DesktopNavigation'
import { GuidedSessionProvider, useGuidedSession } from '@/contexts/GuidedSessionContext'
import { paperSound } from '@/lib/fold/paperSound'

// File-wide mock: every test in this file renders TodayView's mobile branch.
// This affects the EveningMealCard branch (TodayView.tsx ~line 651) and WHERE
// the overflow menu mounts (mobile: beside the date masthead; desktop: in the
// controls strip). Override per test with `mockUseMobile.mockReturnValue(false)`
// (reset in afterEach) to reach the desktop paths.
const mockUseMobile = vi.fn(() => true)
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mockUseMobile() }))
const noWeather = { weather: null, loading: false, error: 'x', requestLocation: vi.fn() }
const mockUseWeather = vi.fn((): Record<string, unknown> => noWeather)
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => mockUseWeather() }))
// The day's plan and review records (planning_sessions): planned, reviewed, or neither.
const daySession = vi.hoisted(() => ({ saved: null as null | { at: Date; authorId: string; notes: object }, reviewed: null as null | object, save: vi.fn(async () => true), finish: vi.fn(async () => true) }))
vi.mock('@/hooks/usePlanningSession', async (importOriginal) => ({ ...await importOriginal<object>(),
  usePlanningSession: () => ({ saved: daySession.saved, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: daySession.save }) }))
vi.mock('@/hooks/usePeriodReview', () => ({ usePeriodReview: () => ({ reviewed: daySession.reviewed, mine: null, loading: false, error: null, reload: vi.fn(), finish: daySession.finish }) }))
// The person's notes rows (usePlanningNotes), in memory: the Day session's
// place in its steps and the day's energy.
const dayNotes = vi.hoisted(() => ({ notes: {} as Record<string, unknown>, patches: [] as Record<string, unknown>[] }))
vi.mock('@/hooks/usePlanningNotes', async () => {
  const { useState, useCallback } = await import('react')
  return {
    usePlanningNotes: () => {
      const [notes, setNotes] = useState(dayNotes.notes)
      const patch = useCallback(async (p: Record<string, unknown>, defaults?: Record<string, unknown>) => {
        dayNotes.patches.push(p)
        dayNotes.notes = { ...defaults, ...dayNotes.notes, ...p }
        setNotes(dayNotes.notes)
        return true
      }, [])
      return { notes, loading: false, error: null, patch, reload: () => undefined }
    },
  }
})
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [], loading: false, error: null, getCurrentUserMember: () => ({ id: 'me', name: 'Scott' }) }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({ isPinned: () => false, pin: vi.fn(), unpin: vi.fn() }) }))
// The day tiles' two sources. Today holds its own week instances, so the hook
// is given them and must not ask again; the calendar is the shared 45-day read.
vi.mock('@/hooks/useDayLoadEvents', () => ({
  DAY_LOAD_RANGE_DAYS: 45,
  DAY_LOAD_BACK_DAYS: 7,
  useDayLoadEvents: () => ({ events: [], available: true, loading: false, failed: false,
    range: { start: Date.now() - 30 * 86_400_000, end: Date.now() + 90 * 86_400_000 } }),
}))
// A guided run's step (retired, but Today still asks whether one is on its step).
const guide = vi.hoisted(() => ({ state: null as null | Record<string, unknown> }))
vi.mock('@/hooks/useGuidedPlan', () => ({ GuideProvider: ({ children }: { children: unknown }) => children, useGuidedPlan: () => ({ state: guide.state }) }))
vi.mock('@/components/home/week/useWeekInstances', () => ({ useWeekInstances: () => [] }))
vi.mock('@/hooks/useActionQueue', () => ({ useActionQueue: () => ({ actions: [], loading: false, approveAction: vi.fn(), rejectAction: vi.fn(), pendingCount: 0, refetch: vi.fn() }) }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: mockLayers ?? ALL_LAYERS, setDomain: vi.fn() }) }
})
let mockLayers: ReadonlySet<string> | null = null
let mockInProgress: unknown[] = []
vi.mock('@/hooks/useChoices', async (importOriginal) => ({
  ...await importOriginal<object>(),
  useInProgressGoals: () => mockInProgress,
}))

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
/** A household week that started two days ago, so yesterday, today and
 *  tomorrow are all in it whatever day the suite runs (Task 4: the week
 *  sheet brings back what an earlier day of this week left open). */
function weekHoldsYesterday() {
  localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: (new Date().getDay() + 5) % 7 }))
  onTestFinished(() => { localStorage.removeItem('symphony-cadence-config') })
}
const TOMORROW = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + 1)

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
  return render(viewElement(props, ctxOverrides))
}

function viewElement(props: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}) {
  return (
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
    // The journal's two empty states: nothing chosen, nothing with a time.
    expect(screen.getByText(/nothing chosen yet/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing with a time today/i)).toBeInTheDocument()
  })
  it('renders NO Day/Week/Month control inside TodayView (HomeViewSwitcher owns it)', () => {
    renderView()
    expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })
  it('no longer offers the This Week / This Month staging triggers (backlog left the page)', async () => {
    // Inbox, /week and /month are now the canonical homes for that work;
    // Today surfaces it only through the attention line.
    // The header's "This week" / "This month" LIST dropdowns are the one
    // legitimate pair (planning lists, Step 4) — nothing else may answer to
    // those names.
    const { user } = renderView()
    await openOverflow(user)
    expect(screen.getAllByRole('button', { name: /this week/i }).map((b) => b.getAttribute('aria-label'))).toEqual(['This week pool'])
    expect(screen.getAllByRole('button', { name: /this month/i }).map((b) => b.getAttribute('aria-label'))).toEqual(['This month pool'])
  })
  // The lists plan MY day: unassigned rows and mine. A row assigned only to
  // someone else stays off — same rule as the /week column and the month fold.
  it('the This week / This month lists scope to the current member', async () => {
    const mk = (over: Record<string, unknown>) => ({ id: String(Math.random()), title: 't', completed: false, createdAt: TODAY, updatedAt: TODAY, ...over })
    const { user } = renderView({ tasks: [
      mk({ title: 'Unassigned month', bucket: 'month' }),
      mk({ title: 'My month', bucket: 'month', assignedTo: 'me' }),
      mk({ title: "Iris's month", bucket: 'month', assignedTo: 'iris' }),
      mk({ title: "Iris's week", bucket: 'week', assignedToAll: ['iris'] }),
      mk({ title: 'Our week', bucket: 'week', assignedToAll: ['me', 'iris'] }),
    ] })
    await user.click(screen.getByRole('button', { name: 'This month pool' }))
    expect(screen.getByText('Unassigned month')).toBeInTheDocument()
    expect(screen.getByText('My month')).toBeInTheDocument()
    expect(screen.queryByText("Iris's month")).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'This month pool' }))
    await user.click(screen.getByRole('button', { name: 'This week pool' }))
    // (The week folded beside the day is the page's week, through the page's
    // people filter, as the column was; this reads the pool's.)
    const inPool = (text: string) => screen.queryAllByText(text).filter((el) => !el.closest('.paper-fold-front'))
    expect(inPool('Our week')).toHaveLength(1)
    expect(inPool("Iris's week")).toHaveLength(0)
  })
  it('keeps the routine show/hide toggle in the overflow', async () => {
    const { user } = renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true })
    await openOverflow(user)
    expect(screen.getByRole('button', { name: /hide daily|show daily/i })).toBeInTheDocument()
  })

  it('leaves the people filter to the top bar, not Today’s heading', () => {
    // 2026-10-02: the filter is one lens for every horizon, so it moved into
    // the top bar (HeaderPeopleFilter); a heading copy read as Today's alone.
    renderView({ assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never], hasUnassignedTasks: true, onSelectAssignees: vi.fn() })
    expect(screen.queryByRole('button', { name: /people filter/i })).not.toBeInTheDocument()
  })

  it('wears the shared masthead card', () => {
    renderView()
    expect(screen.getByTestId('masthead-card')).toBeInTheDocument()
  })

  it('offers no Time-block, Plan week, or Process inbox — the sidebar and the decision strip already reach those', async () => {
    const { user } = renderView()
    expect(screen.queryByRole('button', { name: /time-block/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plan week/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /process inbox/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plan day/i })).not.toBeInTheDocument()
    await openOverflow(user)
    expect(screen.queryByRole('button', { name: /time-block/i })).not.toBeInTheDocument()
  })

  it('routine toggle flips its label after click', async () => {
    const { user } = renderView()
    await openOverflow(user)
    await user.click(screen.getByRole('button', { name: /hide daily/i }))
    await openOverflow(user)
    expect(screen.getByRole('button', { name: /show daily/i })).toBeInTheDocument()
  })

  it('phone: the floating capture bar adds to today; there is no second "Add task" door', async () => {
    const onCreateTaskParsed = vi.fn()
    const { user } = renderView({}, { onCreateTaskParsed })
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    const input = screen.getByPlaceholderText('Add to today…')
    await user.type(input, 'Bar thing{Enter}')
    expect(onCreateTaskParsed).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bar thing', destination: 'today' }))
  })

  it('phone: no capture bar without a create handler, or on another day', () => {
    renderView()
    expect(screen.queryByPlaceholderText('Add to today…')).toBeNull()
    const tomorrow = new Date(TODAY); tomorrow.setDate(tomorrow.getDate() + 1)
    renderView({ viewedDate: tomorrow }, { onCreateTaskParsed: vi.fn() })
    expect(screen.queryByPlaceholderText('Add to today…')).toBeNull()
  })

  it('"Add task" beside the date opens the add box at the head of Tasks; submitting fires onCreateTaskParsed', async () => {
    mockUseMobile.mockReturnValue(false)
    const onCreateTaskParsed = vi.fn()
    const { user } = renderView({}, { onCreateTaskParsed })
    // Nothing to add with until you ask: no pill below the schedule, no box.
    expect(screen.queryByRole('button', { name: /add to today/i })).toBeNull()
    expect(screen.queryByPlaceholderText(/add to today/i)).toBeNull()
    const add = screen.getByRole('button', { name: 'Add task' })
    expect(add).toHaveAttribute('aria-expanded', 'false')
    await user.click(add)
    const input = screen.getByPlaceholderText(/add to today/i)
    await user.type(input, 'New thing{Enter}')
    expect(onCreateTaskParsed).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New thing' }),
    )
    mockUseMobile.mockReturnValue(true)
  })

  it('offers no "Add task" without a create handler, and none on another day', () => {
    renderView()
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
    const tomorrow = new Date(TODAY); tomorrow.setDate(tomorrow.getDate() + 1)
    renderView({ viewedDate: tomorrow }, { onCreateTaskParsed: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull()
  })

  it('carried-over tasks stay off the page, with no review door (Today, trimmed)', () => {
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
    // A two-day-old commitment is NOT drawn on the day, and no line points at
    // it. Given a day earlier this week, it is back on the week sheet beside
    // the day (Task 4, 2026-11-04); never on the day itself.
    for (const el of screen.queryAllByText('Overdue task title')) expect(el.closest('.above-sheet')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Carried over' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /more controls/i })[0])
    expect(screen.queryByRole('button', { name: 'Review carried-over work' })).toBeNull()
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

  describe('In progress', () => {
    const bath = { goal: { kind: 'task', id: 'g1' }, title: 'Renovate Upstairs Bathroom', context: 'family', choices: [{ id: 'c1', title: 'Contractor' }] }
    const work = { goal: { kind: 'task', id: 'g2' }, title: 'Hire an analyst', context: 'work', choices: [{ id: 'c2', title: 'Candidates' }] }
    afterEach(() => { mockInProgress = []; mockLayers = null })
    it('lists goals with an open choice; a chip opens the goal', () => {
      mockInProgress = [bath]
      const onSelectItem = vi.fn()
      renderView({ onSelectItem })
      const line = screen.getByRole('group', { name: 'In progress' })
      fireEvent.click(within(line).getByRole('button', { name: 'Renovate Upstairs Bathroom · Contractor' }))
      expect(onSelectItem).toHaveBeenCalledWith('task-g1')
    })
    it('follows the area filter', () => {
      mockInProgress = [bath, work]
      mockLayers = new Set(['work'])
      renderView({})
      const line = screen.getByRole('group', { name: 'In progress' })
      expect(within(line).queryByText(/Renovate Upstairs Bathroom/)).toBeNull()
      expect(within(line).getByRole('button', { name: 'Hire an analyst · Candidates' })).toBeInTheDocument()
    })
    it('is absent with no goals in progress', () => {
      renderView({})
      expect(screen.queryByRole('group', { name: 'In progress' })).toBeNull()
    })
  })

  describe('To talk about', () => {
    const flagged = {
      id: 'disc-1', title: 'Summer camp', completed: false, createdAt: TODAY, updatedAt: TODAY,
      needsDiscussion: true, discussionNote: 'with Iris',
    }
    it('one quiet line of chips under For today; a chip opens the item', () => {
      const onSelectItem = vi.fn()
      renderView({ tasks: [flagged], onSelectItem })
      const line = screen.getByRole('group', { name: 'To talk about' })
      fireEvent.click(within(line).getByRole('button', { name: 'Summer camp · with Iris' }))
      expect(onSelectItem).toHaveBeenCalledWith('task-disc-1')
    })
    it('is silent when nothing is flagged, or the flagged thing is done', () => {
      renderView({ tasks: [{ ...flagged, completed: true }] })
      expect(screen.queryByRole('group', { name: 'To talk about' })).toBeNull()
    })
  })

  it('the ⋯ menu holds only Hide daily, Print list and Paper sounds', async () => {
    const { user } = renderView({
      tasks: [{ id: 'd', title: 'Talk', completed: false, createdAt: TODAY, updatedAt: TODAY, needsDiscussion: true }],
    })
    await openOverflow(user)
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('button').map((b) => b.textContent?.replace('Show daily', 'Hide daily'))).toEqual(['Hide daily', 'Print list'])
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Paper sounds/ })).toBeInTheDocument()
    for (const gone of [/suggestions/i, /carried-over/i, /end of day review/i, /clarity/i, /to discuss/i, /duplicate/i, /suggested order/i]) {
      expect(within(menu).queryByText(gone)).toBeNull()
    }
  })

  // The one mute control (spec 2026-11-04), remembered per device.
  it('Paper sounds in the ⋯ shows the current state and turns the sounds off and on', async () => {
    paperSound.setOn(true)
    const { user } = renderView({ tasks: [] })
    await openOverflow(user)
    const item = screen.getByRole('menuitemcheckbox', { name: /Paper sounds/ })
    expect(item).toHaveAttribute('aria-checked', 'true')
    expect(item).toHaveTextContent('On')
    await user.click(item)
    expect(paperSound.on).toBe(false)
    expect(localStorage.getItem('symphony-paper-sound')).toBe('off')
    await openOverflow(user)
    expect(screen.getByRole('menuitemcheckbox', { name: /Paper sounds/ })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Paper sounds/ }))
    expect(paperSound.on).toBe(true)
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

      // The commitment stays IN the day, marked where it falls (the day is
      // drawn to scale, 2026-10-06). No hero card.
      expect(screen.queryByTestId('up-next-hero')).toBeNull()
      expect(screen.getByRole('button', { name: /^Call the pediatrician, .*up next$/ })).toBeInTheDocument()
      // Exactly one rendering of the item — nothing lifted, nothing doubled.
      expect(screen.getAllByText('Call the pediatrician')).toHaveLength(1)
    })

    it('renders no marker when nothing qualifies', () => {
      renderView()
      expect(screen.queryByRole('button', { name: /up next$/ })).toBeNull()
    })

    // One-tap Reschedule on the up-next row needs no test here: the row is an
    // ordinary ScheduleItem, whose desktop rail carries RescheduleButton
    // (RowActionRail.test.tsx "holds Reschedule for an open task") and whose
    // apply path is pinned by RescheduleButton.test.tsx. The hero used to need
    // its own copy because it was a separate component; there is no separate
    // component anymore — that is the point.
  })

  // Another day has no "now", so its timed items are one list under Schedule
  // (on today, what is over folds into Earlier today — TodayView.journal.test).
  it('renders the flat agenda: no period headings, every timed item in one list', () => {
    // Two items in different periods (8am / 2pm). The old layout wrapped each
    // in an EARLY MORNING/MORNING/AFTERNOON band with a heading, count and
    // chevron — more heading than content on a sparse day. The flat agenda
    // renders the rows; times on the rows say when things are. The band
    // structure survives underneath as drag targets only (headers reappear
    // as labels while a drag is live — covered by the drop-zone machinery).
    const morningTime = new Date(TOMORROW)
    morningTime.setHours(8, 0, 0)
    const afternoonTime = new Date(TOMORROW)
    afternoonTime.setHours(14, 0, 0)

    renderView({
      viewedDate: TOMORROW,
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

    const afternoonTime = new Date(TOMORROW)
    afternoonTime.setHours(14, 0, 0, 0)

    renderView({
      viewedDate: TOMORROW,
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
    // No "Afternoon" section toggle — the only such buttons are the item's
    // own (its block on the day, and its check).
    expect(screen.queryAllByRole('button', { name: /afternoon/i })
      .filter((b) => !b.getAttribute('aria-label')?.includes('Afternoon task, already done'))).toHaveLength(0)

    localStorage.clear()
  })
})


// ── Phone header (2026-09-22): the date and the day's work come first. One
// Filters control and the ⋯ overflow join the horizon-tab row (inline here,
// with no tab row mounted); Plan from paper moved into Add. ──
describe('TodayView phone header', () => {
  afterEach(() => { mockUseMobile.mockReturnValue(true) })

  it('mobile: one Filters control and one overflow, and no Plan from paper button on the page', () => {
    renderView()
    expect(screen.getAllByRole('button', { name: /^Filters/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /more controls/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /plan from paper/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-mobile-masthead')).not.toBeInTheDocument()
  })

  it('desktop: the overflow stays in the controls strip and there is no phone Filters control', () => {
    mockUseMobile.mockReturnValue(false)
    renderView()
    const strip = screen.getByTestId('today-controls')
    expect(within(strip).getByRole('button', { name: /more controls/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /more controls/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument()
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

describe('TodayView: slipped work stays off the page', () => {
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

  it('puts yesterday’s leftover back on the week sheet, never on the day; older slipped rows stay off; no scoreboard', () => {
    weekHoldsYesterday()
    renderView({ viewedDate: TODAY, tasks: [mk('c', 'carried thing', 1), mk('s', 'slipped thing', 200)] } as never)
    // Leftovers are not a line or a drawer on the page (spec 2026-10-14), nor
    // a section on Today (Task 4, 2026-11-04): they go back to the week sheet
    // beside the day. Older ones stay off.
    expect(screen.getByText('carried thing').closest('.above-sheet')).not.toBeNull()
    expect(screen.getByText('carried thing').closest('.daybook-agenda')).toBeNull()
    expect(screen.queryByRole('region', { name: 'From yesterday' })).toBeNull()
    expect(screen.queryByText('slipped thing')).toBeNull()
    expect(screen.queryByText(/need attention/)).toBeNull()
    expect(screen.queryByText(/oldest/)).toBeNull()
    expect(screen.getByText(/nothing chosen yet/i)).toBeInTheDocument()
  })
})


// ── Today is a commitment surface, not a dashboard ──
// A "control room" pass in 2026-09 added a four-tile counter strip (Open /
// Logistics / Meals / Clarity), a Household Signals tally card, and a pair of
// status cards that between them announced four times that nothing was
// happening. Today shows the day and what is next; it does not score you, and
// it does not spend a third of the page saying a queue is empty.
describe('TodayView — no scoreboard', () => {
  it('shows no counter tiles or tally cards', () => {
    renderView()
    for (const label of [/^open$/i, /^logistics$/i, /^meals$/i, /^clarity$/i, /household signals/i, /week bench/i, /month bench/i]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('does not tally the day in the subline', () => {
    renderView()
    expect(screen.queryByText(/actionable item/i)).not.toBeInTheDocument()
  })

  it('names the next commitment instead of pointing at the timeline', () => {
    // Mid-morning, so "an hour from now" is still today in any time zone
    // (it was tomorrow when CI ran in the 11pm hour).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 10, 0))
    onTestFinished(() => { vi.useRealTimers() })
    const soon = new Date(TODAY)
    soon.setHours(11, 0, 0, 0)
    renderView({
      tasks: [{
        id: 'next-up', title: 'Pick up Mia from climbing', completed: false,
        createdAt: TODAY, updatedAt: TODAY, bucket: 'timed' as const, scheduledFor: soon,
      }],
    } as never)
    // Named in place, on the day, as up next — the masthead no longer
    // repeats it as a "Next: …" line.
    expect(screen.getByRole('button', { name: /^Pick up Mia from climbing, .*up next$/ })).toBeInTheDocument()
    expect(screen.getAllByText('Pick up Mia from climbing')).toHaveLength(1)
    expect(screen.queryByText(/^Next: /)).not.toBeInTheDocument()
    expect(screen.queryByText(/marked in the timeline/i)).not.toBeInTheDocument()
  })

  it('renders no decision rail when there is nothing to decide', () => {
    renderView()
    expect(screen.queryByText(/needs a decision/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument()
  })
})

// ── One date masthead ──
// The page used to stack two: HomeHeader's big serif date above the day card's
// own "TODAY · SEPTEMBER 4" eyebrow. The card's eyebrow is now the real
// control — weekday, date, carets and picker — and HomeHeader draws none.
describe('TodayView — the day card carries the date nav', () => {
  it('puts the weekday, the date and both day carets in the card header', () => {
    renderView()
    const weekday = TODAY.toLocaleDateString('en-US', { weekday: 'long' })
    const date = TODAY.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    // The date is the page's title (2026-09-19); the eyebrow says "Today" and
    // still opens the picker, named with the full date for screen readers.
    expect(screen.getByRole('heading', { level: 1, name: `${weekday}, ${date}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Today, ${weekday} ${date} — choose a date` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument()
  })

  it('renders exactly one date nav — the mobile masthead no longer repeats it', () => {
    renderView()
    expect(screen.getAllByRole('button', { name: /previous day/i })).toHaveLength(1)
  })
})

// The Day session (spec 2026-11-01) replaces Plan today / Review today:
// "Plan today" until 4 pm, "Plan tomorrow" from 4 pm, and the session runs on
// the page itself, the day still showing beside its steps.
function GuidePanel() {
  const reg = useGuidedSession()
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
// The day page's parent, as HomeViewContainer is: the viewed day follows
// ?date=, and moving the day writes ?date= from the URL as it last rendered.
function DatedPage({ first, render: page, spy }: { first: Date; render: (d: Date, change: (d: Date) => void) => React.ReactNode; spy: (d: Date) => void }) {
  const [params, setParams] = useSearchParams()
  // The viewed day is its own state, moved by a ?date= that appears or
  // changes and NOT by one that goes away (HomeViewContainer's contract).
  const [viewed, setViewed] = useState(first)
  const [seen, setSeen] = useState<string | null>(null)
  const raw = params.get('date')
  if (raw !== seen) {
    setSeen(raw)
    if (raw) setViewed(new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, Number(raw.slice(8, 10))))
  }
  const change = (next: Date) => {
    spy(next)
    setViewed(next)
    const isToday = localYmd(next) === localYmd(new Date())
    setParams((prev) => {
      if (isToday && !prev.get('date')) return prev
      const out = new URLSearchParams(prev)
      if (isToday) out.delete('date')
      else out.set('date', localYmd(next))
      return out
    }, { replace: true })
  }
  return <>{page(viewed, change)}</>
}
describe('TodayView — the Day session', () => {
  afterEach(() => { mockUseMobile.mockReturnValue(true); vi.useRealTimers(); window.history.replaceState({}, '', '/'); daySession.saved = null; daySession.reviewed = null; daySession.save.mockClear(); dayNotes.notes = {}; dayNotes.patches = [] })
  const at = (hour: number, days = 0) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days, hour, 0)
  type At = { url?: string; viewed?: Date; tasks?: Task[]; routines?: unknown[]; selectedAssignees?: string[]; ctx?: Record<string, unknown>; dated?: boolean; onToggleTask?: () => void }
  const renderAt = (hour: number, { url = '/', viewed = at(hour), tasks = [], routines = [], selectedAssignees, ctx = {}, dated = false, onToggleTask = vi.fn() }: At = {}) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(hour))
    window.history.replaceState({}, '', url)
    mockUseMobile.mockReturnValue(false)
    const host = document.createElement('div')
    document.body.appendChild(host)
    onTestFinished(() => host.remove())
    const onDateChange = vi.fn()
    const page = (viewedDate: Date, change: (d: Date) => void) => (
      <TodayView
        tasks={tasks} events={[]} routines={routines as never} dateInstances={[]} selectedAssignees={selectedAssignees}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={onToggleTask}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={viewedDate} onDateChange={change} projects={[]}
      />
    )
    const view = render(
      <DesktopControlsContext.Provider value={host}>
        <GuidedSessionProvider>
          <ScheduleActionsProvider value={{ ...ctxValue, ...ctx } as never}>
            {dated ? <DatedPage first={viewed} render={page} spy={onDateChange} /> : page(viewed, onDateChange)}
          </ScheduleActionsProvider>
          <GuidePanel />
        </GuidedSessionProvider>
      </DesktopControlsContext.Provider>,
    )
    return { ...view, onDateChange }
  }
  // The header's plan chip, and the session's one tooltip (GuideCoach).
  const flowButton = (name: string) => screen.getAllByRole('button', { name }).find((b) => b.classList.contains('plan-chip'))!
  const coach = () => within(screen.getByRole('dialog', { name: 'Planning guide' }))
  const stepNow = () => document.querySelector('.coach-t')?.textContent
  const search = () => new URLSearchParams(window.location.search)

  it('in the morning the page offers Plan today, which opens the session on the page itself', async () => {
    const { user } = renderAt(10)
    expect(screen.queryByRole('button', { name: 'Review today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan tomorrow' })).not.toBeInTheDocument()
    await user.click(flowButton('Plan today'))
    const session = screen.getByRole('region', { name: 'Planning today' })
    expect(search().get('plan')).toBe('1')
    // Planning as tooltips (2026-11-04): one tooltip, no band, no card.
    expect(coach().getByText('Step 1 of 5')).toBeInTheDocument()
    // The session is the header's plan chip and its stop, nothing more.
    expect(screen.getByRole('button', { name: 'Planning today · 1 of 5' }).closest('.plan-chip')).toHaveClass('is-on')
    expect(screen.getByRole('button', { name: 'Stop planning' }).closest('.plan-chip')).toHaveClass('is-on')
    expect(within(screen.getByTestId('guide-panel')).getByText('Look back at yesterday')).toBeInTheDocument()
    // One page: the day is still there, as every day.
    expect(within(session).getByRole('heading', { name: 'For today' })).toBeInTheDocument()
    expect(within(session).getByRole('heading', { name: 'The day' })).toBeInTheDocument()
    // The chip says where the session is.
    expect(screen.getByRole('button', { name: 'Planning today · 1 of 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan today' })).toBeNull()
  })

  it('from 4 pm it offers Plan tomorrow, which opens on tomorrow, where today’s leftovers wait; there is no Review today', async () => {
    const { user } = renderAt(17)
    await openOverflow(user)
    expect(screen.queryByRole('button', { name: /End of day review/i })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Review today' })).not.toBeInTheDocument()
    await user.click(flowButton('Plan tomorrow'))
    expect(search().get('plan')).toBe('1')
    // The page shows the day being planned on every step; today's leftovers
    // wait on the week sheet beside it (Task 4).
    await vi.waitFor(() => expect(search().get('date')).toBe(localYmd(at(0, 1))))
    const session = await screen.findByRole('region', { name: 'Planning tomorrow' })
    expect(within(screen.getByTestId('guide-panel')).getByText('Look back at today')).toBeInTheDocument()
    // Today's page is no count of tomorrow's.
    expect(within(session).queryByText(/on tomorrow$/)).toBeNull()
  })

  it('with the real date-writing parent, the page shows the day each step is about; Stop planning goes back to today', async () => {
    const { user } = renderAt(17, { dated: true })
    const heading = (d: Date) => ({ level: 1, name: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) })
    await user.click(flowButton('Plan tomorrow'))
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument())
    // Look back at today: today's leftovers are on the week sheet beside
    // tomorrow's page, so the page goes to tomorrow from the first step.
    await vi.waitFor(() => expect(screen.getByRole('heading', heading(at(0, 1)))).toBeInTheDocument())
    expect(search().get('date')).toBe(localYmd(at(0, 1)))
    // Tomorrow's calendar: the page stays on tomorrow, the session with it.
    await user.click(coach().getByRole('button', { name: 'Next' }))
    expect(stepNow()).toBe('Tomorrow\'s calendar')
    expect(screen.getByRole('heading', heading(at(0, 1)))).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument()
    // Back to the look back: still tomorrow.
    await user.click(coach().getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', heading(at(0, 1)))).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop planning' }))
    await vi.waitFor(() => expect(search().get('plan')).toBeNull())
    // Today keeps its clean URL: no ?date= naming it.
    await vi.waitFor(() => expect(search().get('date')).toBeNull())
    await vi.waitFor(() => expect(screen.getByRole('heading', heading(at(0)))).toBeInTheDocument())
  })

  it('in the morning the look back stays on today, pointing at the first leftover on the week sheet, which it opens', async () => {
    weekHoldsYesterday()
    const { user } = renderAt(10, { dated: true, tasks: [createMockTask({ id: 'y', title: 'Call the vet', bucket: 'timed', scheduledFor: at(0, -1), isAllDay: true })] })
    const heading = (d: Date) => ({ level: 1, name: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) })
    await user.click(flowButton('Plan today'))
    expect(screen.getByRole('region', { name: 'Planning today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', heading(at(0)))).toBeInTheDocument()
    expect(search().get('date')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Planning guide' }).dataset.at).toBe('leftovers')
    expect(coach().getByText('Plan them for today with +, or leave them on the week.')).toBeInTheDocument()
    // The anchor is the first marked row on the week sheet, and the week is open.
    const row = document.querySelector<HTMLElement>('[data-guide-anchor="leftovers"]')!
    expect(row.closest('.above-sheet')).not.toBeNull()
    expect(row.querySelector('.above-sheet-row-title')).toHaveTextContent('Call the vet')
    expect(row.querySelector('.above-sheet-row-mark')).toHaveTextContent(at(0, -1).toLocaleDateString('en-US', { weekday: 'short' }))
    await vi.waitFor(() => expect(document.querySelector('.today-fold [aria-expanded="true"]')).not.toBeNull())
    await user.click(coach().getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', heading(at(0)))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop planning' }))
    await vi.waitFor(() => expect(search().get('plan')).toBeNull())
    await vi.waitFor(() => expect(search().get('date')).toBeNull())
    await vi.waitFor(() => expect(screen.getByRole('heading', heading(at(0)))).toBeInTheDocument())
  })

  // Pre-ship follow-up: + on the week sheet counts as a pick, as a drag does.
  it('+ on the week sheet while on Pick marks the day planned', async () => {
    dayNotes.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    const w = createMockTask({ id: 'w', title: 'Wash the car', bucket: 'week' })
    renderAt(10, { url: '/?plan=1', tasks: [w], ctx: { onUpdateTask: vi.fn(async () => true) } })
    const plus = document.querySelector<HTMLButtonElement>('.above-sheet-pick[aria-label="Plan Wash the car for today"]')!
    await act(async () => { fireEvent.click(plus) })
    await vi.waitFor(() => expect(dayNotes.patches.some((p) => (p.guide as { plannedAt?: string } | undefined)?.plannedAt)).toBe(true))
  })

  it('a task dragged onto the day while on Pick marks the day planned', async () => {
    dayNotes.notes = { guide: { current: 'pick', done: [], skipped: [] } }
    const w = createMockTask({ id: 'w', title: 'Wash the car', bucket: 'week' })
    renderAt(10, { url: '/?plan=1', tasks: [w], ctx: { onUpdateTask: vi.fn(async () => true) } })
    const payload = JSON.stringify({ kind: 'task', id: 'w', date: localYmd(at(0)), title: 'Wash the car' })
    const dataTransfer = { types: [PLAN_MIME], getData: (k: string) => (k === PLAN_MIME ? payload : ''), dropEffect: 'move' }
    await act(async () => { fireEvent.drop(document.querySelector('.daybook-agenda')!, { dataTransfer }) })
    await vi.waitFor(() => expect(dayNotes.patches.some((p) => (p.guide as { plannedAt?: string } | undefined)?.plannedAt)).toBe(true))
  })

  it('on tomorrow’s page in the evening the session plans tomorrow and looks back at today', () => {
    renderAt(17, { url: '/?plan=1', viewed: at(0, 1) })
    expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument()
    expect(stepNow()).toBe('Look back at today')
    expect(screen.getByRole('button', { name: 'Planning tomorrow · 1 of 5' })).toBeInTheDocument()
  })

  it('?review=1 opens the session (the old Review today link)', async () => {
    renderAt(10, { url: '/?review=1' })
    await vi.waitFor(() => expect(search().get('plan')).toBe('1'))
    expect(search().get('review')).toBeNull()
    expect(screen.getByRole('region', { name: 'Planning today' })).toBeInTheDocument()
  })

  it('?review=1 opens on the look back even when the session was left further on', async () => {
    dayNotes.notes = { guide: { current: 'energy', done: [], skipped: [] } }
    renderAt(10, { url: '/?review=1' })
    await vi.waitFor(() => expect(stepNow()).toBe('Look back at yesterday'))
    expect(search().get('step')).toBeNull()
  })

  it('?step= beside ?date= (opened on another day): the step is used and dropped, plan and the session\'s date survive', async () => {
    renderAt(10, { url: `/?plan=1&step=energy&date=${localYmd(at(0, 3))}`, dated: true })
    await vi.waitFor(() => expect(stepNow()).toBe('Energy'))
    await vi.waitFor(() => expect(search().get('step')).toBeNull())
    expect(search().get('plan')).toBe('1')
    expect(search().get('date')).toBe(localYmd(at(0, 0)))
    expect(stepNow()).toBe('Energy')
  })

  it('a bare ?plan=1 in the evening plans tomorrow, its look back on tomorrow’s page', async () => {
    renderAt(18, { url: '/?plan=1', dated: true })
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument())
    await vi.waitFor(() => expect(search().get('date')).toBe(localYmd(at(0, 1))))
  })

  it('opened on a later step in the evening, the page goes to tomorrow', async () => {
    dayNotes.notes = { guide: { current: 'pick', done: ['look-back', 'calendar', 'energy'], skipped: [] } }
    renderAt(18, { url: '/?plan=1', dated: true })
    await vi.waitFor(() => expect(search().get('date')).toBe(localYmd(at(0, 1))))
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Planning tomorrow' })).toBeInTheDocument())
  })

  // Planning as tooltips (2026-11-04): the plan chip in the header starts the
  // session; in it, the chip says where the session is and its ✕ stops it.
  it('the plan chip starts planning the day; in the session it counts the steps; its ✕ stops', async () => {
    const { user } = renderAt(10)
    // One way in: the chip, "Plan today", a button of its own.
    const chips = screen.getAllByRole('button', { name: 'Plan today' })
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveClass('plan-chip')
    await user.click(flowButton('Plan today'))
    expect(search().get('plan')).toBe('1')
    expect(screen.getByRole('region', { name: 'Planning today' })).toBeInTheDocument()
    await user.click(coach().getByRole('button', { name: 'Hide the guide' }))
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Planning today · 1 of 5' }))
    expect(stepNow()).toBe('Look back at yesterday')
    await user.click(screen.getByRole('button', { name: 'Stop planning' }))
    await vi.waitFor(() => expect(search().get('plan')).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    expect(flowButton('Plan today')).toBeInTheDocument()
  })

  it('once the day is planned, the chip still offers Plan today', async () => {
    daySession.saved = { at: at(8), authorId: 'me', notes: {} }
    const { user } = renderAt(10)
    await user.click(flowButton('Plan today'))
    expect(screen.getByRole('region', { name: 'Planning today' })).toBeInTheDocument()
  })

  it('the shown day’s line under the title: when it was planned, yesterday’s review, its energy; a tap on the energy offers Low · Medium · High · Clear', async () => {
    dayNotes.notes = { guide: { current: 'habits', done: ['look-back'], skipped: [], plannedAt: at(8).toISOString() }, energy: { level: 'medium' } }
    renderAt(10)
    const day = at(8).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    expect(screen.getByText(`Planned ${day}`).closest('p')).toHaveTextContent(`Planned ${day} · Yesterday’s review · Energy: medium`)
    fireEvent.click(screen.getByRole('button', { name: 'Energy: medium' }))
    const menu = within(screen.getByRole('menu', { name: 'Energy' }))
    expect(menu.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High'])
    expect(menu.getByRole('menuitem', { name: 'Clear' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(menu.getByRole('menuitemradio', { name: 'Low' })) })
    expect(dayNotes.patches).toContainEqual({ energy: { level: 'low' } })
    expect(screen.getByRole('button', { name: 'Energy: low' })).toBeInTheDocument()
  })

  it('the line stays under the title while the Day session runs', () => {
    dayNotes.notes = { guide: { current: 'energy', done: ['look-back'], skipped: [], plannedAt: at(8).toISOString() }, energy: { level: 'medium' } }
    renderAt(10, { url: '/?plan=1' })
    expect(screen.getByRole('dialog', { name: 'Planning guide' })).toBeInTheDocument()
    const day = at(8).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    expect(screen.getByText(`Planned ${day}`).closest('p')).toHaveTextContent(`Planned ${day} · Yesterday’s review · Energy: medium`)
  })

  it('with nothing saved for the day, no line', () => {
    renderAt(10)
    expect(document.querySelector('.guide-summary-line')).toBeNull()
  })

  it('"Done planning today" marks the day planned and the page comes back as every day', async () => {
    dayNotes.notes = { guide: { current: 'habits', done: [], skipped: [] } }
    localStorage.setItem('symphony-fold:day', 'open')
    renderAt(10, { url: '/?plan=1' })
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Done planning today' })) })
    await vi.waitFor(() => expect(search().get('plan')).toBeNull())
    // Done planning folds the week beside the day, and it stays folded.
    expect(localStorage.getItem('symphony-fold:day')).toBe('folded')
    expect(daySession.save).toHaveBeenCalledWith({ wentWell: '', didnt: '' })
    expect(screen.queryByRole('region', { name: 'Planning today' })).not.toBeInTheDocument()
    expect(dayNotes.patches.some((p) => (p.guide as { finishedAt?: string } | undefined)?.finishedAt)).toBe(true)
  })
  // Task 4 (Scott, 2026-11-04: the From yesterday section and the Energy
  // chip "should not be there, and certainly not permanently"): Today stays
  // as it was. Yesterday's unfinished tasks are back on the week sheet, and
  // the energy is asked in the Energy step's tooltip.
  const yesterdayTasks = () => {
    const y = at(0, -1)
    return [
      createMockTask({ id: 'a', title: 'Call the vet', bucket: 'timed', scheduledFor: y, isAllDay: true }),
      createMockTask({ id: 'b', title: 'Return the books', bucket: 'timed', scheduledFor: at(15, -1), isAllDay: false }),
      createMockTask({ id: 'c', title: 'Already done', bucket: 'timed', scheduledFor: y, isAllDay: true, completed: true }),
      createMockTask({ id: 'e', title: 'Let go of it', bucket: 'someday', scheduledFor: y, isAllDay: true, dismissedAt: at(20, -1) }),
    ]
  }
  it('Today has no From yesterday section and no Energy chip', () => {
    weekHoldsYesterday()
    renderAt(10, { tasks: yesterdayTasks() })
    expect(screen.queryByRole('region', { name: 'From yesterday' })).toBeNull()
    expect(screen.queryByText('From yesterday')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Energy/ })).toBeNull()
    expect(document.querySelector('.energy-chip, .today-leftovers')).toBeNull()
    // Yesterday's are on the week sheet, not on the day.
    expect(screen.getByText('Call the vet').closest('.daybook-agenda')).toBeNull()
  })

  it('the Energy step asks Low · Medium · High in its tooltip; Medium writes the day’s energy note, and the tooltip shows it chosen', async () => {
    dayNotes.notes = { guide: { current: 'energy', done: [], skipped: [] } }
    renderAt(10, { url: '/?plan=1' })
    const group = within(coach().getByRole('radiogroup', { name: 'Energy' }))
    expect(group.getAllByRole('radio').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High'])
    await act(async () => { fireEvent.click(group.getByRole('radio', { name: 'Medium' })) })
    expect(dayNotes.patches).toContainEqual({ energy: { level: 'medium' } })
    expect(group.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
    // Said once, the header line carries it, and a tap there changes it.
    expect(document.querySelector('.guide-summary-line')).toHaveTextContent('Energy: medium')
    fireEvent.click(screen.getByRole('button', { name: 'Energy: medium' }))
    expect(within(screen.getByRole('menu', { name: 'Energy' })).getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High'])
  })

  it('the Energy ask keeps the words already said with it', async () => {
    dayNotes.notes = { guide: { current: 'energy', done: [], skipped: [] }, energy: { level: 'low', words: 'Short night' } }
    renderAt(10, { url: '/?plan=1' })
    expect(coach().getByRole('radio', { name: 'Low' })).toHaveAttribute('aria-checked', 'true')
    await act(async () => { fireEvent.click(coach().getByRole('radio', { name: 'High' })) })
    expect(dayNotes.patches).toContainEqual({ energy: { level: 'high', words: 'Short night' } })
  })

  it('with nothing left from yesterday, the look back points at the week’s fold, not the title', () => {
    dayNotes.notes = { guide: { current: 'look-back', done: [], skipped: [] } }
    renderAt(10, { url: '/?plan=1' })
    expect(document.querySelector('[data-guide-anchor="leftovers"]')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Planning guide' }).dataset.at).toBe('left')
  })

  // Pre-ship follow-up: only days gone by leave leftovers. In the evening,
  // on tomorrow's page, today is not over yet: its open task is an ordinary
  // row of the week, unmarked, and the look back points at the week's fold.
  it('in the evening, planning tomorrow: today’s open task is not marked as left over; yesterday’s is', () => {
    weekHoldsYesterday()
    const left = createMockTask({ id: 't', title: 'Pack the lunches', bucket: 'timed', scheduledFor: at(0), isAllDay: true })
    const yest = createMockTask({ id: 'y', title: 'Call the vet', bucket: 'timed', scheduledFor: at(0, -1), isAllDay: true })
    renderAt(17, { url: '/?plan=1', viewed: at(0, 1), tasks: [left, yest] })
    const rows = [...document.querySelectorAll<HTMLElement>('[data-guide-anchor="leftovers"]')]
    expect(rows.map((r) => r.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Call the vet'])
    expect(screen.getByRole('dialog', { name: 'Planning guide' }).dataset.at).toBe('leftovers')
    const marks = [...document.querySelectorAll('.above-sheet-row-mark')].map((m) => m.closest('li')?.querySelector('.above-sheet-row-title')?.textContent)
    expect(marks).not.toContain('Pack the lunches')
  })

  // Every Day step's tooltip points at its home on the everyday page.
  const chore = createMockRoutine({ id: 'r1', name: 'Kids clean rooms', time_of_day: null, recurrence_pattern: { type: 'daily' }, show_on_timeline: null as unknown as boolean })
  it('every Day step’s home is on the everyday page, not hidden (Energy’s once said)', () => {
    weekHoldsYesterday()
    dayNotes.notes = { energy: { level: 'medium' } }
    renderAt(10, { tasks: yesterdayTasks(), routines: [chore] })
    for (const s of stepsFor('day')) {
      const home = document.querySelector(`[data-guide-anchor="${s.at}"]`)
      expect(home, s.id).not.toBeNull()
      expect(home!.closest('[hidden]'), s.id).toBeNull()
    }
  })
  it.each(stepsFor('day').map((s) => [s.id, s.at]))('the day · %s → [data-guide-anchor="%s"]', (id, anchor) => {
    weekHoldsYesterday()
    dayNotes.notes = { guide: { current: id, done: [], skipped: [] }, energy: { level: 'medium' } }
    renderAt(10, { url: '/?plan=1', tasks: yesterdayTasks(), routines: [chore] })
    expect(screen.getByRole('dialog', { name: 'Planning guide' }).dataset.at).toBe(anchor)
  })
})

// ── Weather in the masthead's ear ──
describe('TodayView weather', () => {
  afterEach(() => mockUseWeather.mockImplementation(() => noWeather))
  const reading = { weather: { currentTemp: 63, weatherCode: 0, condition: 'Clear', highTemp: 78, lowTemp: 58, hourlyForecast: [] }, loading: false, error: null, requestLocation: vi.fn() }

  it("rides in the masthead on today's page", () => {
    mockUseWeather.mockImplementation(() => reading)
    renderView()
    const ear = within(screen.getByTestId('masthead-card')).getByTestId('masthead-aside')
    expect(within(ear).getByText('63°')).toBeInTheDocument()
    expect(within(ear).getByText('78° / 58°')).toBeInTheDocument()
  })
  it('says nothing on another day — the feed only knows today', () => {
    mockUseWeather.mockImplementation(() => reading)
    const tomorrow = new Date(TODAY); tomorrow.setDate(tomorrow.getDate() + 1)
    renderView({ viewedDate: tomorrow })
    expect(screen.queryByTestId('masthead-aside')).not.toBeInTheDocument()
  })
  it('renders no line and no placeholder with no location', () => {
    renderView()
    expect(screen.queryByRole('button', { name: /^weather/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('masthead-aside')).toBeEmptyDOMElement()
  })
})


// Paper-style horizons (Scott, 2026-11-04: "add today with the + on the week
// sheet"): the week folds beside the day in place of the This week column.
describe('Today with the week folded beside it', () => {
  const NOV4 = new Date(2026, 10, 4, 9)
  const SAT = new Date(2026, 9, 31) // a Saturday-start week: Oct 31 – Nov 6
  const onWeek = [{ level: 'week', periodStart: SAT, status: 'open' }] as Task['commitments']
  const wk = (id: string, title: string, x: Partial<Task> = {}) => createMockTask({ id, title, bucket: 'week', weekStart: SAT, commitments: onWeek, createdAt: new Date(2026, 9, 20), ...x })
  const weekTasks = [
    wk('a', 'Book the cabin'),
    wk('b', 'Call the bank'),
    wk('c', 'Fix the gate', { bucket: 'timed', scheduledFor: new Date(2026, 10, 6), isAllDay: true }),
    wk('d', 'Buy maps', { completed: true }),
  ]
  const setup = () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOV4)
    localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: 6 }))
    localStorage.removeItem('symphony-fold:day')
    // Reduced motion: the fold jumps to its state, so a tap opens it at once.
    const media = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    onTestFinished(() => {
      window.matchMedia = media
      vi.useRealTimers()
      localStorage.removeItem('symphony-cadence-config')
      localStorage.removeItem('symphony-fold:day')
    })
  }

  // The guide's Today step asks you to choose from the week, so the week is
  // beside the day for it, without changing the fold you keep afterwards
  // (walkthrough 2026-09-30; restored through PaperFold's drive, Task 5c).
  it('the guide’s Today step opens the week without remembering it; leaving the step folds it back', () => {
    setup()
    onTestFinished(() => { guide.state = null })
    guide.state = { v: 1, route: 'today', steps: ['week', 'today'], periods: {}, current: 1, done: [], status: 'active', updatedAt: '' }
    const { rerender } = renderView({ tasks: weekTasks, viewedDate: NOV4 })
    expect(screen.getByRole('button', { name: 'Fold Oct 31 – Nov 6 away' })).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem('symphony-fold:day')).toBeNull()
    guide.state = null
    rerender(viewElement({ tasks: weekTasks, viewedDate: NOV4 }))
    expect(screen.getByRole('button', { name: 'Oct 31 – Nov 6, 2 open. Unfold to read' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows an edge named for the week’s dates and its open no-day count', () => {
    setup()
    renderView({ tasks: weekTasks, viewedDate: NOV4 })
    expect(screen.getByRole('button', { name: 'Oct 31 – Nov 6, 2 open. Unfold to read' })).toBeInTheDocument()
  })

  it('unfolded, lists the week’s no-day tasks, and + plans one for today through chooseTaskDay', () => {
    setup()
    const onUpdateTask = vi.fn(async () => true)
    renderView({ tasks: weekTasks, viewedDate: NOV4, onUpdateTask }, { onUpdateTask })
    fireEvent.click(screen.getByRole('button', { name: 'Oct 31 – Nov 6, 2 open. Unfold to read' }))
    const sheet = screen.getByRole('region', { name: 'Oct 31 – Nov 6, to pick from' })
    expect(within(within(sheet).getByRole('list', { name: 'Oct 31 – Nov 6' })).getAllByRole('listitem').map((li) => li.querySelector('.above-sheet-row-title')?.textContent))
      .toEqual(['Book the cabin', 'Call the bank'])
    expect(within(sheet).getByText('Pick three to five for today.')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Plan Book the cabin for today' }))
    // The old column's + : planActions.chooseTaskDay(id, today) — the day, all day, focused.
    expect(onUpdateTask).toHaveBeenCalledWith('a', expect.objectContaining({ bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 10, 4), plannedOn: new Date(2026, 10, 4) }))
  })

  // Task 4 (Scott, 2026-11-04): yesterday's unfinished tasks go back where
  // they came from — first on the week sheet, marked faintly with their day.
  it('a task dated yesterday and not done is first on the week sheet, marked “Tue”; + plans it for today', () => {
    setup()
    const onUpdateTask = vi.fn(async () => true)
    const tue = (id: string, title: string, x: Partial<Task> = {}) => createMockTask({ id, title, bucket: 'timed', scheduledFor: new Date(2026, 10, 3), isAllDay: true, ...x })
    const tasks = [...weekTasks, tue('y', 'Call the vet'), tue('z', 'Done yesterday', { completed: true }), tue('g', 'Let go', { dismissedAt: new Date(2026, 10, 3, 20) })]
    renderView({ tasks, viewedDate: NOV4, onUpdateTask }, { onUpdateTask })
    // Counted on the fold's edge with the week's open rows.
    fireEvent.click(screen.getByRole('button', { name: 'Oct 31 – Nov 6, 3 open. Unfold to read' }))
    const sheet = screen.getByRole('region', { name: 'Oct 31 – Nov 6, to pick from' })
    const rows = within(within(sheet).getByRole('list', { name: 'Oct 31 – Nov 6' })).getAllByRole('listitem')
    expect(rows.map((li) => li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Call the vet', 'Book the cabin', 'Call the bank'])
    expect(rows[0].querySelector('.above-sheet-row-mark')).toHaveTextContent('Tue')
    expect(rows[0]).toHaveAttribute('data-guide-anchor', 'leftovers')
    expect(rows[1].querySelector('.above-sheet-row-mark')).toBeNull()
    // Done yesterday and let go are not asked about again.
    expect(within(sheet).queryByText('Done yesterday')).toBeNull()
    expect(within(sheet).queryByText('Let go')).toBeNull()
    // Today itself is as it was: no section of leftovers on the day.
    expect(screen.queryByRole('region', { name: 'From yesterday' })).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Plan Call the vet for today' }))
    expect(onUpdateTask).toHaveBeenCalledWith('y', expect.objectContaining({ bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 10, 4), plannedOn: new Date(2026, 10, 4) }))
  })

  it('the sheet’s leftovers keep to the page’s people filter', () => {
    setup()
    const tue = createMockTask({ id: 'y', title: 'Kid’s form', bucket: 'timed', scheduledFor: new Date(2026, 10, 3), isAllDay: true, assignedTo: 'kid' })
    renderView({ tasks: [...weekTasks, tue], viewedDate: NOV4, selectedAssignees: ['me'] })
    expect(document.querySelector('[data-guide-anchor="leftovers"]')).toBeNull()
    expect(screen.queryByText('Kid’s form')).toBeNull()
  })

  it('viewing Friday from Wednesday, only days already gone are marked: Tuesday’s task, not Thursday’s', () => {
    setup()
    const on = (id: string, title: string, d: number) => createMockTask({ id, title, bucket: 'timed', scheduledFor: new Date(2026, 10, d), isAllDay: true })
    renderView({ tasks: [...weekTasks, on('t', 'Call the vet', 3), on('h', 'Pick up the cake', 5)], viewedDate: new Date(2026, 10, 6) })
    const marked = [...document.querySelectorAll('.above-sheet-row-mark')].map((m) => m.closest('li')?.querySelector('.above-sheet-row-title')?.textContent)
    expect(marked).toEqual(['Call the vet'])
  })
})
