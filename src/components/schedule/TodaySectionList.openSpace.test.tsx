import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
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
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

// Frozen at 6:00 AM so the span is measured from the commitments and not from
// whatever time of day the suite happens to run at — this line clamps to `now`
// on purpose, which makes it exactly the kind of assertion that rots on the
// wall clock if left free-running.
const TODAY = new Date(2026, 7, 31, 6, 0, 0)

function isoAt(h: number, m: number): string {
  return new Date(2026, 7, 31, h, m, 0).toISOString()
}

const ctxValue = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={ctxValue as never}>
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

function event(o: { id: string; title: string; start: string; end: string; allDay?: boolean }) {
  return {
    id: o.id,
    title: o.title,
    start_time: o.start,
    end_time: o.end,
    all_day: o.allDay ?? false,
    calendar_name: 'Family',
    calendar_color: '#0F8A4A',
  }
}

describe('open space on Today', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => { vi.useRealTimers() })

  it('names the hole between two distant commitments', async () => {
    renderView({
      events: [
        event({ id: 'school', title: 'School', start: isoAt(7, 30), end: isoAt(14, 10) }),
        event({ id: 'pickup', title: 'Pickup', start: isoAt(18, 45), end: isoAt(19, 0) }),
      ] as never,
    })
    await screen.findByText('School')
    expect(await screen.findByText('4 hr 35 min free until 6:45 PM')).toBeInTheDocument()
  })

  it('says nothing when the day has no room to speak of', async () => {
    renderView({
      events: [
        event({ id: 'a', title: 'A', start: isoAt(9, 0), end: isoAt(10, 0) }),
        event({ id: 'b', title: 'B', start: isoAt(11, 0), end: isoAt(12, 0) }),
      ] as never,
    })
    await screen.findByText('A')
    expect(screen.queryByTestId('open-space-line')).not.toBeInTheDocument()
  })

  it('closes the afternoon at an all-day dinner, at its inferred hour', async () => {
    // The all-day "Dinner: ..." event is filed under evening by meal
    // inference; the free run has to end there rather than run past it.
    renderView({
      events: [
        event({ id: 'school', title: 'School', start: isoAt(7, 30), end: isoAt(14, 10) }),
        event({ id: 'dinner', title: 'Dinner: bread, salad', start: isoAt(0, 0), end: isoAt(23, 59), allDay: true }),
      ] as never,
    })
    await screen.findByText('School')
    expect(await screen.findByText('4 hr 20 min free until dinner')).toBeInTheDocument()
    // ...and the card it closes reads its inferred time, not its stored one.
    expect(screen.getByText(/6:30 PM/)).toBeInTheDocument()
  })
})
