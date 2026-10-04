import { describe, it, expect, vi } from 'vitest'
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

const TODAY = new Date()
const midnight = () => { const d = new Date(TODAY); d.setHours(0, 0, 0, 0); return d }

const onUpdateTask = vi.fn(async () => true)
const ctxValue = { onToggleTask: vi.fn(), onUpdateTask, projects: [], contacts: [], familyMembers: [], lists: [] }

/** A task chosen for the viewed day, with its month commitment intact — what
 *  "choose a day, keep the month" actually produces. */
const dayTask = () => [{
  id: 't1', title: 'Research games dates and tickets', completed: false,
  bucket: 'timed' as const, isAllDay: true, scheduledFor: midnight(), plannedOn: midnight(),
  monthStart: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  commitments: [{ level: 'month' as const, periodStart: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), status: 'open' as const }],
  createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), sortOrder: 0,
}]

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

// Codex review finding 5: Day is an execution view of the same work, so it
// gets the same timing control the month, season and week rows have.
describe('the day row carries the shared timing control', () => {
  it('states the saved timing on the row, without opening anything', async () => {
    renderView({ tasks: dayTask() as never })
    await screen.findByText('Research games dates and tickets')
    const control = screen.getByRole('button', { name: /Choose a week or a day for Research games dates and tickets/ })
    // On the day's own page the date is the title: the chip says only "Any
    // time" (walkthrough 2026-10-02, #25: "Fri, Oct 2 · any time" on Oct 2).
    expect(control).toHaveTextContent(/^Any time/)
    expect(control.textContent).not.toMatch(/\w{3}, \w{3} \d+/)
    // The accessible description still names the date.
    expect(control).toHaveAccessibleName(/Chosen for \w{3}, \w{3} \d+, any time/)
  })

  // Scott, 2026-10-04: "we don't need the time chips for items in a time
  // slot" — the slot already says when; the row opens to change it.
  it('a row in a time slot carries no timing chip', async () => {
    // The clock sits before 11:45: past that hour the row reads as past and
    // the test would rot with the wall clock (it passed at 10am, failed at 2pm).
    const morning = new Date(TODAY); morning.setHours(8, 0, 0, 0)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(morning)
    try {
      const at = new Date(TODAY); at.setHours(11, 45, 0, 0)
      renderView({ tasks: [{ ...dayTask()[0], isAllDay: false, scheduledFor: at }] as never })
      await screen.findByText('Research games dates and tickets')
      expect(screen.queryByRole('button', { name: /Choose a week or a day for Research games dates and tickets/ })).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it('offers to remove the day, naming what survives, before it is pressed', async () => {
    renderView({ tasks: dayTask() as never })
    await screen.findByText('Research games dates and tickets')
    screen.getByRole('button', { name: /Choose a week or a day for Research/ }).click()
    const removeDay = await screen.findByRole('menuitem', { name: /^Remove \w{3}, / })
    // No week was ever chosen, so it must not promise one.
    expect(removeDay).toHaveTextContent(/No week is chosen/)
    expect(removeDay.textContent).not.toMatch(/Keeps it in .*\d+–\d+/)
    // The other removal is a different gesture with a different survivor.
    expect(screen.getByRole('menuitem', { name: /^Remove day and week/ }))
      .toHaveTextContent(/under anything it supports/)
  })
})
