import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { localYmd } from '@/lib/cadence/config'
import { TodayView } from './TodayView'
import type { DbListItem } from '@/types/list'

/**
 * End-to-end guard for the Needed Today note's list-item checkbox.
 *
 * The bug this exists to catch: the completion was routed through
 * ListsContext.updateItem, which opens with
 * `const item = items.find(i => i.id === id); if (!item) return`. On Today
 * `selectedListId` is always null, so `items` is [] and the call returned
 * WITHOUT touching the database — while the uncontrolled checkbox ticked and
 * the announce fired, making it look like it worked.
 *
 * So this test refuses two shortcuts that would let that pass:
 *   1. It does NOT mock useNeededListItems — the real hook runs, including its
 *      TO_BUY_CHANGED_EVENT listener, so the on-screen refresh is real.
 *   2. Its Supabase double is driven by the ACTUAL WRITE, not by a fetch
 *      counter: the row keeps coming back from `select` until an `update`
 *      setting `completed: true` has landed on it. A test that scripted the
 *      second fetch to return [] regardless would manufacture the
 *      disappearance it claims to prove.
 * Between them, "the checkbox writes nothing" fails here.
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

// PARTIAL mock (same importOriginal pattern as useDomain above): the real
// module stays, only the accessor the note reads is overridden. Replacing the
// whole module is precisely what masked the broken write path — a wholesale
// stub can never early-return the way the real implementation did.
// One visible list, so the note's list-scoped read has somewhere to look.
vi.mock('@/contexts/ListsContext', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    // Deliberately NOT titled "To buy": that name activates ToBuyLine, whose
    // own count query would pull an unrelated chain shape into the double
    // below. This test is about the note.
    useListsContextOrNull: () => ({
      lists: [{ id: 'list1', title: 'Shopping', category: 'shopping' }],
    }),
  }
})

const NOW = new Date()
const DAY = localYmd(NOW)

const row: DbListItem = {
  id: 'li1',
  list_id: 'list1',
  user_id: 'u1',
  text: 'Buy diapers',
  note: null,
  sort_order: 0,
  external_id: null,
  external_source: null,
  completed: false,
  completed_at: null,
  parent_item_id: null,
  needed_on: DAY,
  created_at: DAY,
  updated_at: DAY,
}

// The double's single piece of state — flipped ONLY by a real update write.
let rowCompleted = false
const updates: Array<{ id: string; patch: Record<string, unknown> }> = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      // .select('*').in('list_id', ids).eq('needed_on', day).eq('completed', false)
      select: () => ({
        in: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: rowCompleted ? [] : [row], error: null }),
          }),
        }),
      }),
      // .update({ completed, completed_at }).eq('id', id)
      update: (patch: Record<string, unknown>) => ({
        eq: (_field: string, id: string) => {
          updates.push({ id, patch })
          if (patch.completed === true) rowCompleted = true
          return Promise.resolve({ error: null })
        },
      }),
    }),
    // Other hooks mounted alongside TodayView (e.g. useAuth, from
    // test-utils' provider tree) touch supabase.auth directly — keep the
    // same no-op shape the global setup.ts mock provides.
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: () => ({
      on: () => ({ subscribe: vi.fn() }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
  },
  getAuthUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
}))

const ctxValue = {
  onToggleTask: vi.fn(),
  projects: [], contacts: [], familyMembers: [], lists: [],
}

function renderToday() {
  return render(
    <ScheduleActionsProvider value={ctxValue as never}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={NOW} onDateChange={vi.fn()}
        projects={[]}
      />
    </ScheduleActionsProvider>
  )
}

describe('Needed Today note: list-item checkbox', () => {
  it('writes the completion to the database and the row then leaves the note', async () => {
    renderToday()

    await waitFor(() => expect(screen.getByText('Buy diapers')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: 'Buy diapers' }))

    // The write itself — against the pre-fix code (ListsContext.updateItem
    // early-returning on Today) `updates` stays empty.
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].id).toBe('li1')
    expect(updates[0].patch).toMatchObject({ completed: true })

    // And the note agrees with the database it just wrote to: the refetch is
    // answered by the double's real post-write state, not by a script.
    await waitFor(() => expect(screen.queryByText('Buy diapers')).not.toBeInTheDocument())
  })
})
