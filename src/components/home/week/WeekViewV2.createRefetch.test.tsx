import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'

// A /week quick-created event only appeared after a reload: createEvent writes
// to Google but never touches the held events, and /week — unlike Today's
// inline create and ⌘K — did not refetch afterwards.

const calendar = vi.hoisted(() => ({
  createEvent: vi.fn(async () => ({ id: 'g-new', htmlLink: '' })),
  deleteEvent: vi.fn(),
}))
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: true,
    events: [],
    fetchEvents: vi.fn(),
    createEvent: calendar.createEvent,
    deleteEvent: calendar.deleteEvent,
    fetchCalendarList: vi.fn().mockResolvedValue([]),
  }),
}))

// The grid gesture is not what is under test: open the quick-create as if a
// slot had just been dragged, and let a stub popover submit an event.
vi.mock('./useGridCreate', () => ({
  useGridCreate: () => ({
    state: {
      startSlot: { dayIso: '2026-05-18', hour: 10, minute: 0 },
      endSlot: { dayIso: '2026-05-18', hour: 10, minute: 0 },
      anchorRect: { top: 0, left: 0, width: 10, height: 10 },
    },
    liveGesture: null,
    toTimes: () => ({ startTime: new Date(2026, 4, 18, 10), endTime: new Date(2026, 4, 18, 11) }),
    onSlotPointerDown: vi.fn(),
    onGridPointerMove: vi.fn(),
    onSlotPointerUp: vi.fn(),
    close: vi.fn(),
  }),
}))
vi.mock('./SlotQuickCreatePopover', () => ({
  SlotQuickCreatePopover: ({ onCreate, startTime, endTime }: {
    onCreate: (p: { type: 'event'; title: string; startTime: Date; endTime: Date }) => void
    startTime: Date
    endTime: Date
  }) => (
    <button type="button" onClick={() => onCreate({ type: 'event', title: 'Dentist', startTime, endTime })}>
      Create event
    </button>
  ),
}))

vi.mock('@/hooks/useDayPlan', () => ({
  useDayPlan: () => ({
    loading: false, error: false,
    plan: {
      toPlan: [], carried: [], scheduled: [], available: [], week: [], month: [],
      counts: { scheduled: 0, available: 0 }, offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
    },
  }),
}))
vi.mock('@/hooks/usePlanActions', () => ({
  usePlanActions: () => ({
    chooseTaskDay: vi.fn(), unchooseTask: vi.fn(), timeTask: vi.fn(), commitTask: vi.fn(),
    chooseRoutine: vi.fn(), drop: vi.fn(), toggleTask: vi.fn(), completeRoutine: vi.fn(async () => true),
  }),
}))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    getInstancesForRange: async () => [],
    markDone: vi.fn(async () => true), undoDone: vi.fn(async () => true),
    setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null),
  }),
}))

const props = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  routines: [],
  dateInstances: [],
  weekStart: new Date(2026, 4, 18),
  onWeekChange: vi.fn(),
  onSelectItem: vi.fn(),
  onUpdateTask: vi.fn(),
  onUpdateEvent: vi.fn(),
  onUpdateRoutine: vi.fn(),
  layers: ALL_LAYERS,
}

describe('WeekViewV2 quick-create', () => {
  it('refetches the events on screen after creating an event, so it appears without a reload', async () => {
    const onRefetchEvents = vi.fn(async () => {})
    const actions = { onRefetchEvents } as unknown as ScheduleActionsValue
    render(
      <ScheduleActionsProvider value={actions}>
        <WeekViewV2 {...props} />
      </ScheduleActionsProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

    await waitFor(() => expect(onRefetchEvents).toHaveBeenCalledTimes(1))
    expect(calendar.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentist' }))
    // The refetch follows the write, never races ahead of it.
    expect(calendar.createEvent.mock.invocationCallOrder[0])
      .toBeLessThan(onRefetchEvents.mock.invocationCallOrder[0])
  })
})
