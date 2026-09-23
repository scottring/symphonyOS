import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

/** Row actions beyond Today / This week / Someday live in the row's More menu. */
function fromMore(item: string | RegExp, index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name: /^More actions for/ })[index])
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}


// Inbox triage simplified (Scott, 2026-09-22): Today, This week and Someday on
// the row; everything else in one More menu; a selection gets a shared toolbar
// with the same three destinations instead of every row repeating every action.

const notesHook = vi.hoisted(() => ({
  notes: [] as unknown[],
  addNote: vi.fn(),
  updateNote: vi.fn(async () => true),
  deleteNote: vi.fn(),
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ addTask: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => notesHook }))
vi.mock('@/hooks/useNoteSuggestion', () => ({ useNoteSuggestion: () => ({ suggestion: null, loading: false }) }))
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({ HomeNeedsDetailsSection: () => null }))

const base = { completed: false, createdAt: new Date('2026-09-21T10:00:00'), updatedAt: new Date('2026-09-21T10:00:00') }
const capture = (id: string, title: string, over: Partial<Task> = {}) =>
  ({ ...base, id, title, bucket: 'inbox', context: 'personal', ...over }) as Task

function renderInbox(tasks: Task[]) {
  const actions = {
    onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), onDeleteTask: vi.fn(), familyMembers: [],
  } as unknown as ScheduleActionsValue
  const ui = render(
    <ScheduleActionsProvider value={actions}>
      <InboxView tasks={tasks} projects={[]} selectedItemId={null} onSelectItem={vi.fn()} panelOpen={false} onClosePanel={vi.fn()} />
    </ScheduleActionsProvider>,
  )
  return { actions, ...ui }
}

describe('Inbox row triage', () => {
  it('shows only Today, This week, Someday and More on a row', () => {
    renderInbox([capture('t1', 'Fix gate')])
    for (const name of ['Today', 'This week', 'Someday']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for Fix gate' })).toBeInTheDocument()
    for (const gone of ['Week', 'Month', 'Send to note', 'Send to calendar', 'Delete', 'Context', 'Pick date']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull()
    }
  })

  it('This week and Someday are one tap', async () => {
    const { actions } = renderInbox([capture('t1', 'Fix gate'), capture('t2', 'Learn cello')])
    fireEvent.click(screen.getAllByRole('button', { name: 'This week' })[0])
    await waitFor(() => expect(actions.onPushTask).toHaveBeenCalledWith('t1', 'week'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Someday' })[1])
    await waitFor(() => expect(actions.onUpdateTask).toHaveBeenCalledWith('t2', { bucket: 'someday', scheduledFor: undefined }))
  })

  it('This season from More actually moves the item (it used to write nothing)', async () => {
    const { actions } = renderInbox([capture('t1', 'Winter tires')])
    fromMore('This season')
    await waitFor(() => expect(actions.onPushTask).toHaveBeenCalledWith('t1', 'quarter'))
    expect(await screen.findByText('Sent to This Season')).toBeInTheDocument()
  })

  it('sets the life area from More', () => {
    const { actions } = renderInbox([capture('t1', 'Fix gate', { context: null })])
    fromMore('Family')
    expect(actions.onUpdateTask).toHaveBeenCalledWith('t1', { context: 'family' })
  })

  it('a selection gets one toolbar; Today moves every selected item and one Undo restores them all', async () => {
    const { actions } = renderInbox([capture('t1', 'One'), capture('t2', 'Two'), capture('t3', 'Three')])
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByText('One'))
    fireEvent.click(screen.getByText('Three'))
    // While selecting, rows stop repeating the actions; the toolbar holds them.
    expect(screen.queryByRole('button', { name: /^More actions for/ })).toBeNull()
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' })
    fireEvent.click(within(bar).getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(screen.getByText('Sent 2 to Today')).toBeInTheDocument())
    expect(actions.onPushTask).toHaveBeenCalledTimes(2)
    expect(actions.onPushTask).toHaveBeenCalledWith('t1', expect.any(Date))
    expect(actions.onPushTask).toHaveBeenCalledWith('t3', expect.any(Date))
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(actions.onUpdateTask).toHaveBeenCalledWith('t3', expect.objectContaining({ bucket: 'inbox' })))
    expect(actions.onUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ bucket: 'inbox' }))
  })
})
