import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ReferenceListsProvider } from '@/components/reference/ReferenceListsContext'
import { TodayView } from './TodayView'
import { createMockTask } from '@/test/mocks/factories'

/**
 * Batch E — Today connects to the plan (walkthrough 2026-10-02). After
 * planning year → Fall → October → next week, Today showed none of it.
 *   #24  rows say what they serve; the week column shows the week ahead
 *   #28  "Coming up" under Schedule
 *   #7   the masthead's next item says its day once
 */
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({ setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null), getInstancesForRange: vi.fn(async () => []) }),
}))
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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn(), all: vi.fn() }) }
})
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: false, needsReconnect: false, isLoading: false, isFetching: false, events: [], error: null,
    connect: vi.fn(), disconnect: vi.fn(), fetchTodayEvents: vi.fn(), fetchWeekEvents: vi.fn(), fetchEvents: vi.fn(),
    createEvent: vi.fn(), updateEvent: vi.fn(), moveEvent: vi.fn(), deleteEvent: vi.fn(), removeEventLocal: vi.fn(), restoreEventLocal: vi.fn(),
    fetchCalendarList: vi.fn(async () => []), defaultCalendarId: null, setDefaultCalendarId: vi.fn(),
  }),
}))
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

// Saturday Sep 19, 2026, 5:30 PM — the last day of a Sunday-start week.
const NOW = new Date(2026, 8, 19, 17, 30)
const MIDNIGHT = new Date(2026, 8, 19)
const NEXT_SUNDAY = new Date(2026, 8, 20)
const ctxValue = { onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

const goal = createMockTask({ id: 'goal-10k', title: 'Run a 10K', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1) })
const line = createMockTask({ id: 'line-garden', title: 'Plan the garden', bucket: 'month', monthStart: new Date(2026, 8, 1) })
const step = createMockTask({ id: 'step', title: 'Buy running shoes', bucket: 'timed', isAllDay: true, scheduledFor: MIDNIGHT, plannedOn: MIDNIGHT, goalTaskId: 'goal-10k' })
const copied = createMockTask({ id: 'copied', title: 'Order seeds', bucket: 'timed', isAllDay: true, scheduledFor: MIDNIGHT, plannedOn: MIDNIGHT, sourceId: 'line-garden' })

function renderView(props: Record<string, unknown> = {}) {
  const onSelectItem = vi.fn()
  const r = render(
    <ReferenceListsProvider userId="u1">
      <ScheduleActionsProvider value={ctxValue as never}>
        <TodayView
          tasks={[goal, line, step, copied]} events={[]} routines={[]} dateInstances={[]}
          selectedItemId={null} onSelectItem={onSelectItem} onToggleTask={vi.fn()}
          onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
          viewedDate={NOW} onDateChange={vi.fn()}
          projects={[]} {...props}
        />
      </ScheduleActionsProvider>
    </ReferenceListsProvider>,
  )
  return { ...r, onSelectItem }
}

beforeEach(() => {
  localStorage.removeItem('symphony-plan-v2.view.today')
  sessionStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  window.history.replaceState(null, '', '/today')
})
afterEach(() => { vi.useRealTimers() })

describe('#24 Today rows show what they serve', () => {
  it('a step of a goal reads "Step toward"; a copied-down line reads "From" — at rest', () => {
    renderView()
    const focus = screen.getByRole('region', { name: 'For today' })
    expect(within(focus).getByText('Step toward “Run a 10K”')).toBeInTheDocument()
    expect(within(focus).getByText('From “Plan the garden”')).toBeInTheDocument()
  })

  it('pressing the line opens the parent’s details, not the row', () => {
    const { onSelectItem } = renderView()
    fireEvent.click(screen.getByRole('button', { name: /Step toward Run a 10K — open its details/ }))
    expect(onSelectItem).toHaveBeenCalledWith('task-goal-10k')
    expect(onSelectItem).not.toHaveBeenCalledWith('task-step')
  })

  it('names no parent the reader cannot see (it is not in the filtered list)', () => {
    renderView({ tasks: [line, step, copied] })
    expect(screen.queryByText(/Step toward/)).toBeNull()
    expect(screen.getByText('From “Plan the garden”')).toBeInTheDocument()
  })
})

describe('#24/#18 the week column shows the week still ahead on its last day', () => {
  const nextWeekRow = createMockTask({
    id: 'nw', title: 'Call the plumber', bucket: 'week', weekStart: NEXT_SUNDAY,
    commitments: [{ level: 'week', periodStart: NEXT_SUNDAY, status: 'open' }] as never,
  })
  const othersRow = createMockTask({
    id: 'nw-other', title: 'Iris’s dentist', bucket: 'week', weekStart: NEXT_SUNDAY, assignedTo: 'iris',
    commitments: [{ level: 'week', periodStart: NEXT_SUNDAY, status: 'open' }] as never,
  })

  it('lists next week’s open rows, read-only, with a door to that week', () => {
    localStorage.setItem('symphony-plan-v2.view.today', 'ref')
    const { onSelectItem } = renderView({ tasks: [goal, line, step, copied, nextWeekRow] })
    const ahead = screen.getByRole('region', { name: /Week \d+, starts tomorrow/ })
    expect(within(ahead).getByText(/starts tomorrow/)).toBeInTheDocument()
    expect(within(ahead).getByText('Call the plumber')).toBeInTheDocument()
    // Reading only: no "+ Today" for next week's rows.
    expect(within(ahead).queryByRole('button', { name: /Add Call the plumber to today/ })).toBeNull()
    fireEvent.click(within(ahead).getByRole('button', { name: 'Call the plumber' }))
    expect(onSelectItem).toHaveBeenCalledWith('task-nw')
    fireEvent.click(within(ahead).getByRole('button', { name: /Open week \d+ →/ }))
    expect(window.location.search).toBe('?start=2026-09-20')
  })

  it('applies the people filter the page applies', () => {
    localStorage.setItem('symphony-plan-v2.view.today', 'ref')
    renderView({ tasks: [nextWeekRow, othersRow], selectedAssignees: ['iris'] })
    const ahead = screen.getByRole('region', { name: /starts tomorrow/ })
    expect(within(ahead).getByText('Iris’s dentist')).toBeInTheDocument()
    expect(within(ahead).queryByText('Call the plumber')).toBeNull()
  })

  it('is not there on any other day of the week', () => {
    localStorage.setItem('symphony-plan-v2.view.today', 'ref')
    const friday = new Date(2026, 8, 18, 10, 0)
    vi.setSystemTime(friday)
    renderView({ tasks: [nextWeekRow], viewedDate: friday })
    expect(screen.queryByRole('region', { name: /starts tomorrow/ })).toBeNull()
  })

  it('says placed work in words, never a count', () => {
    localStorage.setItem('symphony-plan-v2.view.today', 'ref')
    const friday = new Date(2026, 8, 18, 10, 0)
    vi.setSystemTime(friday)
    const placed = createMockTask({ id: 'placed', title: 'Placed', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), weekStart: new Date(2026, 8, 13),
      commitments: [{ level: 'week', periodStart: new Date(2026, 8, 13), status: 'open' }] as never })
    renderView({ tasks: [placed], viewedDate: friday })
    expect(screen.getByText('Some of this week’s work is already on a day.')).toBeInTheDocument()
    expect(screen.queryByText(/\d+ more (is|are) already on a day/)).toBeNull()
  })
})

describe('#28 Coming up, under Schedule', () => {
  const monday = createMockTask({ id: 'mon', title: 'Talk to Tim', bucket: 'timed', isAllDay: false, scheduledFor: new Date(2026, 8, 21, 11, 45) })
  const sunday = createMockTask({ id: 'sun', title: 'Pay the sitter', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 20) })
  const irisOnly = createMockTask({ id: 'iris', title: 'Iris’s recital', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 22), assignedTo: 'iris' })
  const done = createMockTask({ id: 'done', title: 'Already done', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 20), completed: true })
  const far = createMockTask({ id: 'far', title: 'Too far', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 28) })

  it('lists the next open dated work in order, opens details, and links to its week', () => {
    const { onSelectItem } = renderView({ tasks: [monday, sunday, done, far] })
    const section = screen.getByRole('region', { name: 'Coming up' })
    const rows = within(section).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Sun, Sep 20 · Pay the sitter', 'Mon, Sep 21 · 11:45 AM · Talk to Tim'])
    fireEvent.click(within(section).getByRole('button', { name: /Talk to Tim/ }))
    expect(onSelectItem).toHaveBeenCalledWith('task-mon')
    fireEvent.click(within(section).getByRole('button', { name: 'Open week →' }))
    expect(window.location.search).toBe('?start=2026-09-20')
  })

  it('uses the page’s people filter — never an unfiltered list', () => {
    renderView({ tasks: [monday, irisOnly], selectedAssignees: ['iris'] })
    const section = screen.getByRole('region', { name: 'Coming up' })
    expect(within(section).getByText(/Iris’s recital/)).toBeInTheDocument()
    expect(within(section).queryByText(/Talk to Tim/)).toBeNull()
  })

  it('is absent when nothing is coming up', () => {
    renderView({ tasks: [step] })
    expect(screen.queryByRole('region', { name: 'Coming up' })).toBeNull()
  })
})

describe('#7 the masthead names the next item, saying its day once', () => {
  it('"Next: Talk to Tim on Monday · 11:45 AM", not "Monday: … on Monday"', () => {
    const tim = createMockTask({ id: 'tim', title: 'Talk to Tim on Monday', bucket: 'timed', isAllDay: false, scheduledFor: new Date(2026, 8, 21, 11, 45) })
    renderView({ tasks: [tim] })
    expect(screen.getByText('Next: Talk to Tim on Monday · 11:45 AM')).toBeInTheDocument()
    expect(screen.queryByText(/Monday: Talk to Tim/)).toBeNull()
  })
})
