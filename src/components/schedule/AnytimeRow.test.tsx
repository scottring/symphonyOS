import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
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
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', setDomain: vi.fn() }) }
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

/** `n` untimed routines, the first `completed` of them marked done today. */
function untimedRoutineSet(n: number, completed: number) {
  const routines = Array.from({ length: n }, (_, i) => untimedRoutine(`r${i}`))
  const dateInstances = Array.from({ length: completed }, (_, i) => instance(`r${i}`, 'completed'))
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

describe('Anytime row — the untimed-routine slab collapses to one row', () => {
  it('collapsed, the untimed routines read as one row with a completion count', () => {
    const { routines, dateInstances } = untimedRoutineSet(12, 4)
    renderView({ routines, dateInstances })

    expect(screen.getByText(/Anytime/)).toBeInTheDocument()
    expect(screen.getByText(/4 of 12 done/)).toBeInTheDocument()
  })

  it('collapsed height does not grow with routine count', () => {
    const small = untimedRoutineSet(12, 4)
    const { unmount } = renderView({ routines: small.routines, dateInstances: small.dateInstances })
    // One collapsed row for the Unscheduled section: the header button itself,
    // and nothing else — the rows underneath stay hidden while collapsed.
    const smallRows = screen.getAllByRole('button', { name: /anytime/i })
    expect(smallRows).toHaveLength(1)
    unmount()

    const large = untimedRoutineSet(60, 4)
    renderView({ routines: large.routines, dateInstances: large.dateInstances })
    const largeRows = screen.getAllByRole('button', { name: /anytime/i })
    expect(largeRows).toHaveLength(1)
    // Same shape of row regardless of scale — only the number inside changes.
    expect(screen.getByText(/4 of 60 done/)).toBeInTheDocument()
  })
})
