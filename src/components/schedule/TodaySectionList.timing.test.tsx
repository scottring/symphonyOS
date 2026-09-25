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
    expect(control).toHaveTextContent('· any time')
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
