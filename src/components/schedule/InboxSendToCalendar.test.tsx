import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { DenseInboxRow, type QuickAction } from './DenseInboxRow'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

const task = {
  id: 'task-1',
  title: 'Dentist appointment',
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  bucket: 'inbox',
  context: 'family',
} as Task

const ACTIONS: QuickAction[] = [{ kind: 'calendar' }]

describe('DenseInboxRow calendar quick action', () => {
  it('renders a Calendar chip and reports the action without firing it', () => {
    const onQuickAction = vi.fn()
    render(
      <DenseInboxRow
        task={task}
        familyMembers={[]}
        quickActions={ACTIONS}
        onQuickAction={onQuickAction}
        onToggleComplete={vi.fn()}
        onUpdate={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))
    expect(onQuickAction).toHaveBeenCalledWith({ kind: 'calendar' })
  })
})

// --- InboxView integration -------------------------------------------------
//
// The undo path is what makes destroying a task acceptable, so it is covered
// against the real composed handler: a full InboxView render, the real
// SchedulePopover, the real useSendToCalendar, and only the Google/Supabase
// edges mocked.

const createEvent = vi.fn()
const deleteEvent = vi.fn()

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: true, createEvent, deleteEvent }),
  CalendarReconnectError: class CalendarReconnectError extends Error {},
}))

vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({
    getCalendarForDomain: (domain?: string | null) =>
      domain === 'family'
        ? { calendarId: 'fam@group.calendar.google.com', calendarName: 'Family calendar' }
        : null,
  }),
}))

const addTask = vi.fn()
const updateTask = vi.fn()

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ addTask, updateTask }),
}))

vi.mock('@/hooks/useNotes', () => ({
  useNotes: () => ({ notes: [], addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }),
}))

// Unrelated to this feature, and its home/asset fetches settle after the test
// body finishes — which is only ever act() noise.
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({
  HomeNeedsDetailsSection: () => null,
}))

const showToast = vi.fn()
vi.mock('@/hooks/useToast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useToast')>()),
  showToast: (...args: unknown[]) => showToast(...args),
}))

const inboxTask = {
  id: 'task-1',
  title: 'Dentist appointment',
  completed: false,
  createdAt: new Date('2026-07-29T10:00:00'),
  updatedAt: new Date('2026-07-29T10:00:00'),
  bucket: 'inbox',
  context: 'family',
  notes: 'Bring the insurance card',
} as Task

function renderInbox(overrides: Partial<ScheduleActionsValue> = {}) {
  const onDeleteTask = vi.fn()
  const actions = {
    onToggleTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onPushTask: vi.fn(),
    onDeleteTask,
    familyMembers: [],
    ...overrides,
  } as unknown as ScheduleActionsValue

  render(
    <ScheduleActionsProvider value={actions}>
      <InboxView
        tasks={[inboxTask]}
        projects={[]}
        selectedItemId={null}
        onSelectItem={vi.fn()}
        panelOpen={false}
        onClosePanel={vi.fn()}
      />
    </ScheduleActionsProvider>,
  )

  return { onDeleteTask: actions.onDeleteTask as ReturnType<typeof vi.fn> }
}

/** Chip -> day -> duration -> time. Leaves the popover closed and the send in flight. */
function sendToTomorrowAt2pm(duration: string) {
  fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))
  fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
  fireEvent.click(screen.getByRole('button', { name: duration }))
  fireEvent.click(screen.getByRole('button', { name: '2pm' }))
}

describe('InboxView send to calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createEvent.mockResolvedValue({ id: 'evt-1' })
    deleteEvent.mockResolvedValue(undefined)
    addTask.mockResolvedValue('task-restored')
    updateTask.mockResolvedValue(undefined)
  })

  it('opens the day/time/duration picker from the calendar action', () => {
    renderInbox()

    expect(screen.queryByText('Schedule')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /send to calendar/i }))

    expect(screen.getByText('Schedule')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tomorrow/i }))
    // The duration row is the calendar-specific part of the picker.
    expect(screen.getByRole('group', { name: 'Duration' })).toBeInTheDocument()
  })

  it('creates the event, deletes the task, and names the calendar in the toast', async () => {
    const { onDeleteTask } = renderInbox()

    sendToTomorrowAt2pm('30m')

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1))
    const params = createEvent.mock.calls[0][0]
    expect(params.title).toBe('Dentist appointment')
    expect(params.description).toContain('Bring the insurance card')
    expect(params.calendarId).toBe('fam@group.calendar.google.com')
    expect(params.startTime.getHours()).toBe(14)
    expect(params.endTime.getTime() - params.startTime.getTime()).toBe(30 * 60 * 1000)

    await waitFor(() => expect(onDeleteTask).toHaveBeenCalledWith('task-1'))
    expect(await screen.findByText('Sent to Family calendar')).toBeInTheDocument()
  })

  it('undo removes the created event and restores the task', async () => {
    renderInbox()

    sendToTomorrowAt2pm('1h')
    const undo = await screen.findByRole('button', { name: 'Undo' })

    fireEvent.click(undo)

    await waitFor(() =>
      expect(deleteEvent).toHaveBeenCalledWith({
        eventId: 'evt-1',
        calendarId: 'fam@group.calendar.google.com',
      }),
    )
    await waitFor(() => expect(addTask).toHaveBeenCalled())
    expect(addTask.mock.calls[0][0]).toBe('Dentist appointment')
    // The rich context is restored too — the snapshot, not just the title.
    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        'task-restored',
        expect.objectContaining({ notes: 'Bring the insurance card', bucket: 'inbox' }),
      ),
    )
  })

  it('keeps the task in the inbox and explains why when the calendar is read-only', async () => {
    const { onDeleteTask } = renderInbox()
    // The hook logs the rejection by design; keep the run's output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createEvent.mockRejectedValue(Object.assign(new Error('403'), { context: { status: 403 } }))

    sendToTomorrowAt2pm('1h')

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/read-only/i)
    expect(showToast.mock.calls[0][1]).toBe('error')
    expect(onDeleteTask).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})
