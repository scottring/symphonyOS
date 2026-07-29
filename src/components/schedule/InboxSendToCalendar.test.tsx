import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { Task } from '@/types/task'

// The undo path is what makes destroying a task acceptable, so the whole feature
// is covered against the real composed handler: a full InboxView render, the real
// SchedulePopover, the real useSendToCalendar, and only the Google/Supabase edges
// mocked.

const createEvent = vi.fn()
const deleteEvent = vi.fn()

/** calendar_connections.calendar_id — Settings -> Calendar -> "Create events on".
 *  Mutable so a test can model a user who has picked one. */
let defaultCalendarId: string | null = null

const FAMILY_MAPPING = {
  calendarId: 'fam@group.calendar.google.com',
  calendarName: 'Family calendar',
  domain: 'family',
}

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: true, createEvent, deleteEvent, defaultCalendarId }),
  CalendarReconnectError: class CalendarReconnectError extends Error {},
}))

vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({
    mappings: [FAMILY_MAPPING],
    getCalendarForDomain: (domain?: string | null) =>
      domain === 'family' ? FAMILY_MAPPING : null,
  }),
}))

/** Rows addTask has "inserted", keyed by the id it handed back. */
const insertedRows: { id: string; row: Record<string, unknown> }[] = []
/** Ids updateTask can see. Deliberately never populated: the whole point is the
 *  race a restore actually runs into — a write issued in the same tick as the
 *  insert reaches findTaskById before the temp->real id swap has landed. */
const visibleTaskIds = new Set<string>()

/** Records the INSERT and hands back the new id, like the real addTask. */
const fakeAddTask = async (
  title: string,
  contactId?: string,
  projectId?: string,
  scheduledFor?: Date,
  options?: Record<string, unknown>,
): Promise<string> => {
  const id = `task-restored-${insertedRows.length + 1}`
  insertedRows.push({ id, row: { title, contactId, projectId, scheduledFor, ...options } })
  return id
}

/** Reproduces the real guard (useSupabaseTasks.ts:990) instead of accepting
 *  anything: a write aimed at a row that is not in state yet is DROPPED whole.
 *  A mock that merrily applied it is what let the two-step restore ship losing
 *  notes, links and phone number. */
const fakeUpdateTask = async (id: string, updates: Record<string, unknown>): Promise<void> => {
  if (!visibleTaskIds.has(id)) return
  const entry = insertedRows.find((r) => r.id === id)
  if (entry) Object.assign(entry.row, updates)
}

// Implementations are (re)attached in beforeEach — the afterEach restoreAllMocks
// below strips them.
const addTask = vi.fn(fakeAddTask)
const updateTask = vi.fn(fakeUpdateTask)

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ addTask, updateTask }),
}))

/** The single row a restore produced, with whatever actually survived. */
function restoredRow(): Record<string, unknown> {
  expect(insertedRows).toHaveLength(1)
  return insertedRows[0].row
}

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
  phoneNumber: '555-0100',
  links: [{ url: 'https://dentist.example/portal', title: 'Portal' }],
} as Task

/** No domain mapping exists for a null context, so the edge function would send
 *  this to the user's default write calendar. */
const untaggedTask = { ...inboxTask, id: 'task-2', context: null } as Task

function renderInbox(overrides: Partial<ScheduleActionsValue> = {}, task: Task = inboxTask) {
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
        tasks={[task]}
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
    // Only the call records — mockClear, not clearAllMocks, so the addTask /
    // updateTask fakes above keep their implementations.
    createEvent.mockClear()
    deleteEvent.mockClear()
    addTask.mockClear()
    updateTask.mockClear()
    showToast.mockClear()
    insertedRows.length = 0
    visibleTaskIds.clear()
    createEvent.mockResolvedValue({ id: 'evt-1' })
    deleteEvent.mockResolvedValue(undefined)
    addTask.mockImplementation(fakeAddTask)
    updateTask.mockImplementation(fakeUpdateTask)
    defaultCalendarId = null
  })

  // The read-only test silences console.error with a spy. clearAllMocks clears
  // recorded calls but leaves the stubbed implementation in place, and this
  // project configures neither restoreMocks nor clearMocks, so without this any
  // test added after it would silently lose console.error.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts a Calendar chip on the row that opens a picker instead of firing', () => {
    const { onDeleteTask } = renderInbox()

    const chip = screen.getByRole('button', { name: /send to calendar/i })
    expect(chip).toHaveTextContent('Calendar')

    fireEvent.click(chip)

    // Opening the picker must not convert anything on its own.
    expect(createEvent).not.toHaveBeenCalled()
    expect(onDeleteTask).not.toHaveBeenCalled()
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

    // The restored ROW, not merely the fact a call happened: the rich context has
    // to survive the guard that drops a same-tick follow-up write, which means it
    // has to ride the INSERT. Asserting a call was *made* is what let notes,
    // links and phone number ship silently lost.
    const restored = restoredRow()
    expect(restored).toMatchObject({
      title: 'Dentist appointment',
      notes: 'Bring the insurance card',
      phoneNumber: '555-0100',
      links: [{ url: 'https://dentist.example/portal', title: 'Portal' }],
      bucket: 'inbox',
      context: 'family',
    })
    // Nothing may depend on a second write — it would be dropped.
    expect(updateTask).not.toHaveBeenCalled()
  })

  // Defect: an untagged task has no domain mapping, so the hook reported
  // `calendarId: undefined` while the edge function had actually created the
  // event on connection.calendar_id and never said so
  // (google-calendar-create-event/index.ts:274). Undo then deleted from
  // 'primary', the delete failed, and a real event was left on the calendar.
  it('undo deletes from the default write calendar when the task has no domain mapping', async () => {
    defaultCalendarId = 'default@group.calendar.google.com'
    renderInbox({}, untaggedTask)

    sendToTomorrowAt2pm('1h')

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1))
    expect(createEvent.mock.calls[0][0].calendarId).toBe('default@group.calendar.google.com')

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(deleteEvent).toHaveBeenCalledWith({
        eventId: 'evt-1',
        calendarId: 'default@group.calendar.google.com',
      }),
    )
  })

  it('tells the user the event survived when undo cannot delete it', async () => {
    // The hook logs the rejection by design; keep the run's output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteEvent.mockRejectedValue(new Error('404: Not Found'))
    renderInbox()

    sendToTomorrowAt2pm('1h')
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    // The task still comes back — a failed Google delete must not cost the item.
    await waitFor(() => expect(addTask).toHaveBeenCalled())
    // But a half-undo cannot look like a clean one.
    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/still on Family calendar/i)
    expect(showToast.mock.calls[0][1]).toBe('error')
  })

  it('marks the chip busy and blocks a second send while the write is in flight', async () => {
    let release: (value: { id: string }) => void = () => {}
    createEvent.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    renderInbox()

    sendToTomorrowAt2pm('1h')

    const chip = screen.getByRole('button', { name: /send to calendar/i })
    await waitFor(() => expect(chip).toBeDisabled())
    expect(chip).toHaveAttribute('aria-busy', 'true')

    await act(async () => { release({ id: 'evt-1' }) })
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

  // Guards the afterEach above: the read-only test stubs console.error and
  // nothing in the vitest config restores it, so without the restore this test —
  // and anything else appended here — would run with console.error silenced.
  it('leaves console.error unstubbed for whatever test runs next', () => {
    expect(vi.isMockFunction(console.error)).toBe(false)
  })
})
