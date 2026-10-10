import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'
import type { Routine } from '@/types/actionable'

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
// "Hide for today" goes through the instance writer (useHideForToday) — the
// hook's own test covers the write and its Undo; here we see what it is asked.
const { hideForToday } = vi.hoisted(() => ({ hideForToday: vi.fn() }))
vi.mock('@/components/routine/useHideForToday', () => ({
  useHideForToday: () => ({ hideForToday, showToday: vi.fn() }),
}))
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

const TODAY = new Date(2026, 7, 31, 6, 0, 0)

function routine(over: Partial<Routine>): Routine {
  return {
    id: 'x', user_id: 'u1', name: 'X', description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: 'family',
    parent_routine_id: null, step_order: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Routine
}

// A collection, the shape the kids' bedtime routine has: a parent with steps.
const BEDTIME = [
  // Weekly-on-today, not daily: an everyday routine is the one the "Show
  // daily" preference can hide, which has nothing to do with what is under
  // test here.
  // Untimed, so its row (and its ⋯ menu) sits in For today; a timed one is a
  // block on the day column, whose details pane carries "show on Today".
  routine({ id: 'bed', name: 'Kids Bedtime routine', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
  routine({ id: 's1', name: 'Brush teeth', parent_routine_id: 'bed', step_order: 0 }),
  routine({ id: 's2', name: 'Lights out', parent_routine_id: 'bed', step_order: 1 }),
]

// Scott, 2026-09-07: "make it so you can choose not to show particular routines
// on the Today page." The row's own verb already said "Remove from Today" — it
// just did something bigger than it said.
describe('taking a routine off Today', () => {
  beforeEach(() => {
    // Section collapse is remembered, so without this the second test opens
    // the section the first one left open — and closes it instead.
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => { vi.useRealTimers() })

  function renderToday(overrides: Record<string, unknown>) {
    const ctxValue = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [], ...overrides }
    render(
      <ScheduleActionsProvider value={ctxValue as never}>
        <TodayView
          tasks={[]} events={[]} routines={BEDTIME} dateInstances={[]}
          selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
          onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
          viewedDate={TODAY} onDateChange={vi.fn()} projects={[]}
        />
      </ScheduleActionsProvider>,
    )
    return ctxValue
  }

  it('keeps the routine running — it only gives up its row', async () => {
    const onUpdateRoutine = vi.fn()
    const onRegisterUndo = vi.fn()
    renderToday({ onUpdateRoutine, onRegisterUndo })

    await screen.findByText('Kids Bedtime routine')
    fireEvent.click(screen.getByLabelText('Routine options'))
    fireEvent.click(screen.getByRole('menuitem', { name: /^off/i }))

    // NOT visibility:'reference' — that is Resting, which stops the routine
    // everywhere including the kitchen wall.
    expect(onUpdateRoutine).toHaveBeenCalledWith('bed', { show_on_timeline: false })
    expect(onRegisterUndo).toHaveBeenCalledWith('"Kids Bedtime routine" is off Today', expect.any(Function))
    onRegisterUndo.mock.calls[0][1]()
    expect(onUpdateRoutine).toHaveBeenLastCalledWith('bed', { show_on_timeline: true })
  })

  // Hide for today skips TODAY'S OCCURRENCE only. It used to write
  // visibility:'reference' + paused_until tomorrow — Rest, which took the
  // routine off the week and the kiosk too.
  it('"Hide for today" skips the viewed day\'s occurrence, never rests the routine', async () => {
    const onUpdateRoutine = vi.fn()
    hideForToday.mockClear()
    renderToday({ onUpdateRoutine })

    await screen.findByText('Kids Bedtime routine')
    fireEvent.click(screen.getByLabelText('Routine options'))
    fireEvent.click(screen.getByRole('menuitem', { name: /hide for today/i }))

    expect(hideForToday).toHaveBeenCalledTimes(1)
    const [id, name, date] = hideForToday.mock.calls[0]
    expect(id).toBe('bed')
    expect(name).toBe('Kids Bedtime routine')
    expect((date as Date).toDateString()).toBe(TODAY.toDateString())
    expect(onUpdateRoutine).not.toHaveBeenCalled()
  })
})
