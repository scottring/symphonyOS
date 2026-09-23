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
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useToast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showToast: toast,
}))

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

describe('Inbox bulk triage: areas first, real results, whole Undo', () => {
  const select = (...titles: string[]) => {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    for (const t of titles) fireEvent.click(screen.getByText(t))
  }
  const bar = () => screen.getByRole('toolbar', { name: 'Bulk actions' })

  it('asks once for every unclassified item before moving anything; Cancel moves nothing', async () => {
    const { actions } = renderInbox([
      capture('u1', 'Buy stamps', { context: null }),
      capture('u2', 'Call vet', { context: null }),
      capture('c1', 'Quarterly report', { context: 'work' }),
    ])
    select('Buy stamps', 'Call vet', 'Quarterly report')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Today' }))
    const dialog = screen.getByRole('dialog', { name: 'Where do these belong?' })
    // Only the unclassified rows are asked about; the Work row keeps its area.
    expect(within(dialog).getByRole('group', { name: 'Life area for Buy stamps' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Life area for Call vet' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Quarterly report')).toBeNull()
    expect(within(dialog).getByText(/1 already has one and keeps it/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Send to Today' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Where do these belong?' })).toBeNull()
    expect(actions.onPushTask).not.toHaveBeenCalled()
    expect(actions.onUpdateTask).not.toHaveBeenCalled()
  })

  it('writes each chosen area with its placement and leaves classified items\' areas alone', async () => {
    const { actions } = renderInbox([
      capture('u1', 'Buy stamps', { context: null }),
      capture('u2', 'Call vet', { context: null }),
      capture('c1', 'Quarterly report', { context: 'work' }),
    ])
    select('Buy stamps', 'Call vet', 'Quarterly report')
    fireEvent.click(within(bar()).getByRole('button', { name: 'This week' }))
    const dialog = screen.getByRole('dialog', { name: 'Where do these belong?' })
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Set all' })).getByRole('button', { name: 'Family' }))
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Life area for Call vet' })).getByRole('button', { name: 'Personal' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send to This week' }))
    await waitFor(() => expect(screen.getByText('Sent 3 to This Week')).toBeInTheDocument())
    expect(actions.onUpdateTask).toHaveBeenCalledWith('u1', { context: 'family', bucket: 'week', scheduledFor: undefined })
    expect(actions.onUpdateTask).toHaveBeenCalledWith('u2', { context: 'personal', bucket: 'week', scheduledFor: undefined })
    expect(actions.onPushTask).toHaveBeenCalledTimes(1)
    expect(actions.onPushTask).toHaveBeenCalledWith('c1', 'week')
    // Nothing re-tagged the Work item.
    for (const call of (actions.onUpdateTask as ReturnType<typeof vi.fn>).mock.calls) {
      if (call[0] === 'c1') expect(call[1]).not.toHaveProperty('context')
    }
  })

  // A false write result is NOT "nothing changed": the task row can save
  // before its commitment/focus records fail (useSupabaseTasks test "a row
  // write that lands before its records fail"). So an unconfirmed row is
  // reported as possibly unsaved and still restored by Undo.
  it('reports an unconfirmed placement as possibly unsaved and Undo restores it with the rest', async () => {
    const { actions } = renderInbox([capture('t1', 'One'), capture('t2', 'Two'), capture('t3', 'Three')])
    ;(actions.onPushTask as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => id !== 't2')
    select('One', 'Two', 'Three')
    fireEvent.click(within(bar()).getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(screen.getByText('Sent 2 to This Week · 1 may not have saved')).toBeInTheDocument())
    expect(screen.queryByText(/Nothing moved/)).toBeNull()
    ;(actions.onUpdateTask as ReturnType<typeof vi.fn>).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(actions.onUpdateTask).toHaveBeenCalledTimes(3))
    for (const id of ['t1', 't2', 't3']) {
      expect(actions.onUpdateTask).toHaveBeenCalledWith(id, expect.objectContaining({ bucket: 'inbox' }))
    }
    await waitFor(() => expect(screen.queryByText(/may not have saved/)).toBeNull())
  })

  it('never claims nothing moved when every write is unconfirmed, and still offers Undo', async () => {
    const { actions } = renderInbox([capture('t1', 'One'), capture('t2', 'Two')])
    ;(actions.onUpdateTask as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    select('One', 'Two')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Someday' }))
    await waitFor(() => expect(screen.getByText("Couldn't confirm 2 moves to Someday — check the Inbox, or Undo")).toBeInTheDocument())
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/Nothing moved/), expect.anything())
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('a Today move whose "chosen for today" write fails is unconfirmed, not sent', async () => {
    const { actions } = renderInbox([capture('t1', 'One')])
    ;(actions.onPushTask as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(actions.onUpdateTask as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    select('One')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(screen.getByText("Couldn't confirm the move to Today — check the Inbox, or Undo")).toBeInTheDocument())
  })

  it('a failed Undo restore stays on screen with Retry, and Retry re-attempts only the failed rows', async () => {
    const { actions } = renderInbox([capture('t1', 'One'), capture('t2', 'Two'), capture('t3', 'Three')])
    select('One', 'Two', 'Three')
    fireEvent.click(within(bar()).getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(screen.getByText('Sent 3 to This Week')).toBeInTheDocument())
    const update = actions.onUpdateTask as ReturnType<typeof vi.fn>
    update.mockClear()
    update.mockImplementation(async (id: string) => id !== 't3')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByText("Couldn't undo 1 of 3 moves")).toBeInTheDocument())
    // Every restore was attempted and awaited.
    expect(update.mock.calls.map((c) => c[0]).sort()).toEqual(['t1', 't2', 't3'])
    update.mockClear()
    update.mockResolvedValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText("Couldn't undo 1 of 3 moves")).toBeNull())
    expect(update.mock.calls.map((c) => c[0])).toEqual(['t3'])
  })

  it('a failed single-row Undo also offers Retry instead of vanishing', async () => {
    const { actions } = renderInbox([capture('t1', 'Fix gate')])
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument())
    ;(actions.onUpdateTask as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByText("Couldn't undo that move")).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('Undo returns newly classified items to Unsorted along with their placement', async () => {
    const { actions } = renderInbox([capture('u1', 'Buy stamps', { context: null }), capture('u2', 'Call vet', { context: null })])
    select('Buy stamps', 'Call vet')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Someday' }))
    const dialog = screen.getByRole('dialog', { name: 'Where do these belong?' })
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Set all' })).getByRole('button', { name: 'Family' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send to Someday' }))
    await waitFor(() => expect(screen.getByText('Sent 2 to Someday')).toBeInTheDocument())
    ;(actions.onUpdateTask as ReturnType<typeof vi.fn>).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(actions.onUpdateTask).toHaveBeenCalledTimes(2))
    for (const id of ['u1', 'u2']) {
      expect(actions.onUpdateTask).toHaveBeenCalledWith(id, expect.objectContaining({ bucket: 'inbox', context: null }))
    }
  })
})

