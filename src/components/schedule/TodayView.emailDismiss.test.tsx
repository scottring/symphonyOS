import { describe, it, expect, vi } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'
import type { Task } from '@/types/task'

/**
 * Dismissing an email row defers its DELETE to the end of the undo window —
 * deleteTask cascades to the row's per-person subtasks and nothing on this
 * surface can recreate a parent WITH its children, so an immediate delete
 * would make "Undo" a promise the page cannot keep.
 *
 * The bug that made the deferral silent: the commit hung off InboxUndoToast's
 * ten-second timer alone, and NOTHING committed on unmount. Leaving Today
 * (or reloading) inside the window left the row un-deleted for good, while
 * the sheet had already reported it gone.
 */

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

// The census is what opens the door: one unreviewed capture, so the footer
// renders "New from email".
vi.mock('@/hooks/useUnreviewedCaptures', () => ({
  useUnreviewedCaptures: () => ({
    captures: [{ id: 'cap-1', subject: 'Picture Day', sourceLabel: 'Hillside', createdAt: new Date() }],
    loading: false,
    markReviewed: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  }),
}))

const NOW = new Date()

const emailTask = {
  id: 'p1',
  title: 'Picture Day',
  completed: false,
  captureId: 'cap-1',
  scheduledFor: NOW,
  isAllDay: true,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Task

function renderToday(onDeleteTask: (id: string) => void) {
  return render(
    <ScheduleActionsProvider
      value={{
        onToggleTask: vi.fn(),
        onDeleteTask,
        projects: [], contacts: [], familyMembers: [], lists: [],
      } as never}
    >
      <TodayView
        tasks={[emailTask]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={NOW} onDateChange={vi.fn()}
        projects={[]}
      />
    </ScheduleActionsProvider>
  )
}

describe('TodayView: dismissing an email row', () => {
  it('commits the deferred delete when the page unmounts inside the undo window', () => {
    const onDeleteTask = vi.fn()
    const { unmount } = renderToday(onDeleteTask)

    fireEvent.click(screen.getByRole('button', { name: /New from email/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Picture Day' }))

    // Still nothing: the ten-second window is the whole point of deferring.
    expect(onDeleteTask).not.toHaveBeenCalled()

    unmount()

    expect(onDeleteTask).toHaveBeenCalledTimes(1)
    expect(onDeleteTask).toHaveBeenCalledWith('p1')
  })

  it('an undone dismiss leaves nothing to commit on unmount', () => {
    const onDeleteTask = vi.fn()
    const { unmount } = renderToday(onDeleteTask)

    fireEvent.click(screen.getByRole('button', { name: /New from email/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Picture Day' }))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    unmount()

    expect(onDeleteTask).not.toHaveBeenCalled()
  })
})
