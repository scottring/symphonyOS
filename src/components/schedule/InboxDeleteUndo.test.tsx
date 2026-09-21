import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

// Walkthrough 2026-09-21, A10: Delete was the only Inbox verdict without Undo.
// It now hides the row at once and deletes only when the Undo window closes,
// so Undo brings back the SAME row rather than a re-inserted copy.

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ addTask: vi.fn() }),
}))
vi.mock('@/hooks/useNotes', () => ({
  useNotes: () => ({ notes: [], addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }),
}))
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({
  HomeNeedsDetailsSection: () => null,
}))

const task = {
  id: 'task-bike',
  title: 'Buy a bike rack',
  completed: false,
  createdAt: new Date('2026-09-21T10:00:00'),
  updatedAt: new Date('2026-09-21T10:00:00'),
  bucket: 'inbox',
  context: 'personal',
} as Task

function renderInbox() {
  const actions = {
    onToggleTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onPushTask: vi.fn(),
    onDeleteTask: vi.fn(),
    familyMembers: [],
  } as unknown as ScheduleActionsValue
  const ui = render(
    <ScheduleActionsProvider value={actions}>
      <InboxView
        tasks={[task]}
        projects={[]}
        selectedItemId={null}
        onSelectItem={vi.fn()}
        panelOpen={false}
        onClosePanel={vi.fn()}
      />
    </ScheduleActionsProvider>,
  )
  return { actions, ...ui }
}

async function deleteRow() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
  await waitFor(() => expect(screen.getByText('Deleted')).toBeInTheDocument())
}

describe('Inbox delete has Undo (A10)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers Undo, hides the row, and writes no delete yet', async () => {
    const { actions } = renderInbox()
    await deleteRow()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.queryByText('Buy a bike rack')).not.toBeInTheDocument()
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
  })

  it('Undo brings the same row back and never deletes it', async () => {
    const { actions } = renderInbox()
    await deleteRow()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByText('Buy a bike rack')).toBeInTheDocument())
    expect(actions.onDeleteTask).not.toHaveBeenCalled()
    expect(actions.onUpdateTask).not.toHaveBeenCalled()
  })

  it('deletes when the toast is dismissed', async () => {
    const { actions } = renderInbox()
    await deleteRow()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(actions.onDeleteTask).toHaveBeenCalledWith('task-bike')
    expect(actions.onDeleteTask).toHaveBeenCalledTimes(1)
  })

  it('deletes when the page unmounts inside the Undo window', async () => {
    const { actions, unmount } = renderInbox()
    await deleteRow()
    unmount()
    expect(actions.onDeleteTask).toHaveBeenCalledWith('task-bike')
    expect(actions.onDeleteTask).toHaveBeenCalledTimes(1)
  })
})
