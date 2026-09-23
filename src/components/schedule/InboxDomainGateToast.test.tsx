import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

// The bug: clicking "Today" on an Unsorted inbox row opens the DomainGate
// dialog ("Where does this belong?"), but a "Sent to Today · Undo" toast used
// to appear at the same moment — before the user had chosen anything, and
// even if they went on to cancel. InboxView's quick-action handlers must
// await the gated onPushTask/onUpdateTask and skip the toast + undo entry
// entirely when the gate resolves `false` (cancelled, nothing written).

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ addTask: vi.fn() }),
}))
vi.mock('@/hooks/useNotes', () => ({
  useNotes: () => ({ notes: [], addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }),
}))
// Unrelated to this feature, and its home/asset fetches settle after the test
// body finishes — which is only ever act() noise.
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({
  HomeNeedsDetailsSection: () => null,
}))

const untaggedTask = {
  id: 'task-unsorted',
  title: 'Renew passport',
  completed: false,
  createdAt: new Date('2026-08-01T10:00:00'),
  updatedAt: new Date('2026-08-01T10:00:00'),
  bucket: 'inbox',
  context: null,
} as Task

function renderInbox(overrides: Partial<ScheduleActionsValue> = {}) {
  const actions = {
    onToggleTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onPushTask: vi.fn(),
    onDeleteTask: vi.fn(),
    familyMembers: [],
    ...overrides,
  } as unknown as ScheduleActionsValue

  render(
    <ScheduleActionsProvider value={actions}>
      <InboxView
        tasks={[untaggedTask]}
        projects={[]}
        selectedItemId={null}
        onSelectItem={vi.fn()}
        panelOpen={false}
        onClosePanel={vi.fn()}
      />
    </ScheduleActionsProvider>,
  )

  return actions
}

describe('InboxView quick-action toast vs a cancelled domain gate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.useRealTimers()
  })

  // Today is one tap on the row (2026-09-22); it fires InboxView's applyWhen.
  function pickToday() {
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  }

  // Three outcomes (review 2026-09-22). The Inbox asks for a missing life
  // area itself, BEFORE writing, so a cancel is known for certain and never
  // confused with a failed write.
  it('cancelled: declining the life-area question writes nothing and shows no notice or Undo', async () => {
    const actions = renderInbox({ onPushTask: vi.fn(), onUpdateTask: vi.fn() })
    pickToday()
    const dialog = await screen.findByRole('dialog', { name: 'Which domain?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Which domain?' })).toBeNull())
    expect(actions.onPushTask).not.toHaveBeenCalled()
    expect(actions.onUpdateTask).not.toHaveBeenCalled()
    expect(screen.queryByText(/Sent to|Couldn't confirm/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    // The row is back, untouched.
    expect(screen.getByText('Renew passport')).toBeInTheDocument()
  })

  it('confirmed: answering writes the area with the placement, then "Sent to Today" with Undo', async () => {
    const actions = renderInbox({ onPushTask: vi.fn(), onUpdateTask: vi.fn().mockResolvedValue(true) })
    pickToday()
    const dialog = await screen.findByRole('dialog', { name: 'Which domain?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Family' }))
    await waitFor(() => expect(screen.getByText('Sent to Today')).toBeInTheDocument())
    expect(actions.onUpdateTask).toHaveBeenCalledWith('task-unsorted', expect.objectContaining({ context: 'family', bucket: 'timed' }))
    expect(actions.onUpdateTask).toHaveBeenCalledWith('task-unsorted', expect.objectContaining({ plannedOn: expect.any(Date) }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('unconfirmed: a failed write after answering keeps a notice with Retry and Undo', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(false)
    renderInbox({ onPushTask: vi.fn(), onUpdateTask })
    pickToday()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Which domain?' })).getByRole('button', { name: 'Work' }))
    await waitFor(() => expect(screen.getByText("Couldn't confirm the move to Today")).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    // Retry re-runs the move with the SAME answer — no second question.
    onUpdateTask.mockClear()
    onUpdateTask.mockResolvedValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('Sent to Today')).toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Which domain?' })).toBeNull()
    expect(onUpdateTask).toHaveBeenCalledWith('task-unsorted', expect.objectContaining({ context: 'work' }))
  })
})
