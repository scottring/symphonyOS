import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { localYmd } from '@/lib/cadence/config'
import { TodayView } from './TodayView'
import type { DbListItem } from '@/types/list'

/**
 * Regression guard for the Needed Today note's list-item checkbox.
 *
 * `handleToggleNeededListItem` in TodayView writes the completion through
 * ListsContext.updateItem, but useNeededListItems (the note's own data
 * source) only refetches on TO_BUY_CHANGED_EVENT — ListsContext.updateItem
 * never fires it. A test that only asserts `updateItem` was called would NOT
 * catch a missing announce: the write still happens, it's the on-screen
 * refresh that silently breaks. So this test uses the REAL useNeededListItems
 * hook (not mocked) against a controllable Supabase double, and asserts the
 * row actually disappears from the DOM after the checkbox click — which only
 * happens if something re-triggers the fetch.
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

// ListsContext: no lists (so the item reads as "urgent", not "buy" — kind
// doesn't matter for this test), and an updateItem spy so the test can also
// confirm the write happened, not JUST that the row disappeared.
const mockUpdateItem = vi.fn().mockResolvedValue(undefined)
vi.mock('@/contexts/ListsContext', () => ({
  useListsContextOrNull: () => ({ lists: [], updateItem: mockUpdateItem }),
}))

// Deliberately NOT mocking '@/hooks/useNeededListItems' — this test needs the
// real hook, including its TO_BUY_CHANGED_EVENT listener, to prove the note
// actually refreshes. Stand in a controllable Supabase double instead: first
// query returns the marked row, every query after returns none — modelling
// the DB after the completion write.
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

let fetchCount = 0
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => {
              fetchCount += 1
              // First fetch (mount): the marked row is still open. Every
              // fetch after that: the row is gone, as it would be once
              // `completed` flips to true and the `.eq('completed', false)`
              // filter excludes it.
              return Promise.resolve({ data: fetchCount === 1 ? [row] : [], error: null })
            },
          }),
        }),
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

describe('Needed Today note: list-item checkbox refresh', () => {
  it('removes the row after ticking it — proves the note actually refetches, not just writes', async () => {
    renderToday()

    await waitFor(() => expect(screen.getByText('Buy diapers')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('checkbox', { name: 'Buy diapers' }))

    expect(mockUpdateItem).toHaveBeenCalledWith('li1', { completed: true })

    // This is the assertion a "was updateItem called" test would miss: if
    // nothing re-triggers useNeededListItems's fetch, the row (and its
    // checkbox) stays on screen indefinitely even though the DB write
    // succeeded.
    await waitFor(() => expect(screen.queryByText('Buy diapers')).not.toBeInTheDocument())
  })
})
