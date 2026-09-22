import { describe, it, expect, vi } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, within, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'
import type { Routine, ActionableInstance, ActionableStatus } from '@/types/actionable'

/**
 * Task 6: the untimed-routine slab collapses to one row.
 *
 * TodayView already starts the Unscheduled section collapsed because it holds
 * every routine with no time_of_day (see TodayView.tsx's `collapsedKeys`
 * comment). These tests lock down its COLLAPSED presentation only: it must
 * read "Anytime · M of N done", and that row's height must not grow with the
 * routine count — the same invariant TodayInvariant.test.tsx guards for tasks.
 */

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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: ALL_LAYERS, setDomain: vi.fn() }) }
})
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

const TODAY = new Date()

const ctxValue = {
  onToggleTask: vi.fn(),
  projects: [], contacts: [], familyMembers: [], lists: [],
}

/** A standalone, untimed, active routine — lands in the Unscheduled section. */
function untimedRoutine(id: string): Routine {
  return {
    id, user_id: 'u', name: `Routine ${id}`, description: null, default_assignee: null,
    assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, times_per_day: null,
    raw_input: null, show_on_timeline: true, parent_routine_id: null, step_order: null,
    created_at: '', updated_at: '',
  } as unknown as Routine
}

function instance(entityId: string, status: ActionableStatus): ActionableInstance {
  return {
    id: `i-${entityId}`, user_id: 'u', entity_type: 'routine', entity_id: entityId,
    date: '', status, assignee: null, assigned_to_override: null, deferred_to: null,
    completed_at: null, skipped_at: null, created_at: '', updated_at: '',
  }
}

const TODAY_YMD = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`

/** `n` untimed routines CHOSEN for today (planned_on), the first `completed`
 *  of them marked done. Chosen, because an untimed occurrence nobody chose
 *  waits in the Today pin rather than on the main list (dayPlan.ts). */
function untimedRoutineSet(n: number, completed: number) {
  const routines = Array.from({ length: n }, (_, i) => untimedRoutine(`r${i}`))
  const dateInstances = Array.from({ length: n }, (_, i) => ({
    ...instance(`r${i}`, i < completed ? 'completed' : 'pending'),
    date: TODAY_YMD,
    planned_on: TODAY_YMD,
  }))
  return { routines, dateInstances }
}

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

// Today as a daily journal (2026-09-19): untimed routine occurrences you CHOSE
// for the day list plainly under My focus — no "Anytime" fold, because they
// are the work you picked, not a slab. The fixed space budget still holds:
// the section cap bounds what renders, and the count behind "+N more" is
// honest at any scale.
describe('My focus — chosen untimed routines', () => {
  it('lists them under My focus with no Anytime fold', () => {
    const { routines, dateInstances } = untimedRoutineSet(3, 1)
    renderView({ routines, dateInstances })
    const focus = screen.getByRole('region', { name: 'For today' })
    expect(within(focus).queryByText('Routine r0')).toBeNull()
    fireEvent.click(within(focus).getByRole('button', { name: 'Completed · 1' }))
    expect(within(focus).getByText('Routine r0')).toBeInTheDocument()
    expect(within(focus).getByText('Routine r2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /anytime/i })).toBeNull()
  })

  it('renders a bounded number of rows however many are chosen', () => {
    const small = untimedRoutineSet(12, 4)
    const { unmount } = renderView({ routines: small.routines, dateInstances: small.dateInstances })
    const smallRows = within(screen.getByRole('region', { name: 'For today' })).getAllByText(/^Routine r\d+$/).length
    unmount()

    const large = untimedRoutineSet(60, 4)
    renderView({ routines: large.routines, dateInstances: large.dateInstances })
    const focus = screen.getByRole('region', { name: 'For today' })
    expect(within(focus).getAllByText(/^Routine r\d+$/).length).toBe(smallRows)
    expect(within(focus).getByRole('button', { name: /\+\d+ more today/ })).toBeInTheDocument()
  })
})
