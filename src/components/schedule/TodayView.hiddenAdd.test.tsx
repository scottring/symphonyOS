import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ReferenceListsProvider } from '@/components/reference/ReferenceListsContext'
import { TodayView } from './TodayView'

// Today adds as mine. With the people filter on Alex the new task can't show
// on the list: the page says so at the head of the list, and Show it puts the
// people filter back to everyone — the task itself is not touched.
const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mobile.value }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => ({ id: 'me', name: 'Sam' }) }),
}))
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
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))

const members = [{ id: 'me', name: 'Sam' }, { id: 'alex', name: 'Alex' }]
const writes = { onCreateTaskParsed: vi.fn(async () => true), onUpdateTask: vi.fn(), onAssignTaskAll: vi.fn(), onPushTask: vi.fn() }
const ctxValue = {
  ...writes, onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: members, lists: [],
  parserContext: { projects: [], contacts: [], familyMembers: members }, resolverContext: { contacts: [], aliases: [] },
}

function renderToday(selectedAssignees: string[]) {
  const onSelectAssignees = vi.fn()
  render(
    <ReferenceListsProvider userId="u1">
      <ScheduleActionsProvider value={ctxValue as never}>
        <TodayView
          tasks={[]} events={[]} routines={[]} dateInstances={[]}
          selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
          onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
          viewedDate={new Date()} onDateChange={vi.fn()} projects={[]}
          selectedAssignees={selectedAssignees} onSelectAssignees={onSelectAssignees}
        />
      </ScheduleActionsProvider>
    </ReferenceListsProvider>,
  )
  return { onSelectAssignees }
}
const addForToday = (title: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
  const input = screen.getByRole('textbox', { name: 'Add to today' })
  fireEvent.change(input, { target: { value: title } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('Today — a new task the people filter hides says so', () => {
  beforeEach(() => { mobile.value = false; Object.values(writes).forEach((f) => f.mockClear()) })

  it('Alex chosen: my task is saved, the list says why it is not shown, Show it widens the view only', async () => {
    const { onSelectAssignees } = renderToday(['alex'])
    addForToday('Renew the car tax')
    await waitFor(() => expect(writes.onCreateTaskParsed).toHaveBeenCalled())
    const notice = (await screen.findByText(/It’s hidden because/)).closest('[role="status"]')!
    expect(notice.getAttribute('aria-live')).toBe('polite')
    expect(notice.textContent).toContain('Saved to today. It’s hidden because you’re showing only Alex’s items.')
    fireEvent.click(screen.getByRole('button', { name: 'Show it' }))
    expect(onSelectAssignees).toHaveBeenCalledWith([])
    expect(writes.onUpdateTask).not.toHaveBeenCalled()
    expect(writes.onAssignTaskAll).not.toHaveBeenCalled()
    expect(writes.onPushTask).not.toHaveBeenCalled()
  })

  it('phone: the notice sits on the capture bar, where the task was typed', async () => {
    mobile.value = true
    renderToday(['alex'])
    const input = screen.getByRole('textbox', { name: 'Add to today' })
    fireEvent.change(input, { target: { value: 'Renew the car tax' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const notice = (await screen.findByText(/It’s hidden because/)).closest('[role="status"]')!
    expect(notice.closest('.phone-capture-bar')).not.toBeNull()
  })

  it('everyone: no notice', async () => {
    renderToday([])
    addForToday('Renew the car tax')
    await waitFor(() => expect(writes.onCreateTaskParsed).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByText(/It’s hidden because/)).toBeNull()
  })

  it('a capture sent to the Inbox is not Today’s to explain', async () => {
    renderToday(['alex'])
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Inbox' }))
    const input = screen.getByRole('textbox', { name: 'Capture to inbox' })
    fireEvent.change(input, { target: { value: 'Renew the car tax' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(writes.onCreateTaskParsed).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByText(/It’s hidden because/)).toBeNull()
  })
})
