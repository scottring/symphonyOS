import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
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

  // The row's WHEN control (TriageWhenMenu) fans "Today" out into a small
  // menu (Today / Tonight / Tomorrow) — the chip opens it, the menu item
  // inside actually picks the when and fires InboxView's applyWhen.
  function pickToday() {
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Today' }))
  }

  it('shows no "Sent to Today" toast and records no undo when the gate is cancelled', async () => {
    // Mirrors the gated onPushTask: an Unsorted row asks first, and a
    // cancelled ask resolves `false` — nothing was written.
    const onPushTask = vi.fn().mockResolvedValue(false)
    renderInbox({ onPushTask })

    pickToday()

    await waitFor(() => expect(onPushTask).toHaveBeenCalled())

    // Give the post-await state updates a tick to land.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Sent to Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Undo')).not.toBeInTheDocument()
  })

  it('shows the "Sent to Today" toast with Undo when the gate is answered (or the row is already tagged)', async () => {
    const onPushTask = vi.fn().mockResolvedValue(true)
    renderInbox({ onPushTask })

    pickToday()

    await waitFor(() => expect(onPushTask).toHaveBeenCalled())
    await waitFor(() => {
      expect(screen.getByText('Sent to Today')).toBeInTheDocument()
    })
    expect(screen.getByText('Undo')).toBeInTheDocument()
  })
})
