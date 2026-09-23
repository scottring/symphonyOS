import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

/** Row actions beyond Today / This week / Someday live in the row's More menu. */
function fromMore(item: string | RegExp, index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name: /^More actions for/ })[index])
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}


// UX assessment 2026-09-22: Inbox writes that could lose work without saying so.
//  - "Send to note" deleted the capture even when the append failed
//    (updateNote rolls back and returns false; it never throws).
//  - Bulk delete and the Expired section deleted at once, with no Undo.
//  - Filters hiding every capture read as "Inbox zero".

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

describe('Inbox data safety', () => {
  beforeEach(() => {
    notesHook.notes = [{ id: 'n1', title: 'Garage ideas', content: 'Old', context: 'personal' }]
    notesHook.updateNote.mockReset().mockResolvedValue(true)
  })
  afterEach(() => localStorage.removeItem('symphony-layers'))

  it('keeps the capture when appending it to a note fails', async () => {
    notesHook.updateNote.mockResolvedValue(false)
    const { actions } = renderInbox([capture('t1', 'Pegboard for tools')])
    fromMore('To a note…')
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Send to note' })).getByText('Garage ideas'))
    await waitFor(() => expect(notesHook.updateNote).toHaveBeenCalled())
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
    expect(screen.queryByText(/Sent to/)).not.toBeInTheDocument()
  })

  it('removes the capture only after the append succeeds', async () => {
    const { actions } = renderInbox([capture('t1', 'Pegboard for tools')])
    fromMore('To a note…')
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Send to note' })).getByText('Garage ideas'))
    await waitFor(() => expect(actions.onDeleteTask).toHaveBeenCalledWith('t1'))
  })

  it('bulk delete offers Undo and writes nothing until the window closes', async () => {
    const { actions } = renderInbox([capture('t1', 'One'), capture('t2', 'Two')])
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByText('One'))
    fireEvent.click(screen.getByText('Two'))
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByText('Deleted 2 items')).toBeInTheDocument())
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByText('One')).toBeInTheDocument())
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
  })

  it('an Expired delete also waits for the Undo window', async () => {
    const lapsed = capture('e1', 'Renew library card', { bucket: 'timed', scheduledFor: new Date(Date.now() - 5 * 86_400_000) })
    const { actions } = renderInbox([lapsed])
    fireEvent.click(screen.getByRole('button', { name: /Expired/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Renew library card"' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(actions.onDeleteTask).toHaveBeenCalledWith('e1')
  })

  it('says the filters hide captures instead of claiming Inbox zero', () => {
    localStorage.setItem('symphony-layers', JSON.stringify(['work']))
    renderInbox([capture('t1', 'Personal errand')])
    expect(screen.queryByText('Inbox zero')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(screen.getByText('Personal errand')).toBeInTheDocument()
  })

  it('still says Inbox zero when there is truly nothing', () => {
    renderInbox([])
    expect(screen.getByText('Inbox zero')).toBeInTheDocument()
  })
})
