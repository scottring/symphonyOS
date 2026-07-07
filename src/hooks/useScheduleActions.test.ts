import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScheduleActions } from './useScheduleActions'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { Routine } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

// ---------------------------------------------------------------------------
// Helpers — minimal stubs that satisfy type requirements
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Buy groceries',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeMember(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'member-1',
    user_id: 'user-1',
    name: 'Liam',
    initials: 'L',
    color: 'blue',
    avatar_url: null,
    is_full_user: false,
    display_order: 0,
    created_at: '2024-01-01',
    member_type: 'core',
    ...overrides,
  }
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    user_id: 'user-1',
    name: 'Morning walk',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    title: 'Team standup',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------

function createMocks() {
  return {
    updateTask: vi.fn(),
    updateRoutine: vi.fn(),
    deleteRoutine: vi.fn().mockResolvedValue(undefined),
    updateEventAssignment: vi.fn(),
    updateEventAssignmentAll: vi.fn(),
    markDone: vi.fn().mockResolvedValue(true),
    undoDone: vi.fn().mockResolvedValue(true),
    skip: vi.fn().mockResolvedValue(true),
    reschedule: vi.fn().mockResolvedValue(true),
    refreshDateInstances: vi.fn(),
    pushAction: vi.fn(),
  }
}

type Mocks = ReturnType<typeof createMocks>

function renderActions(
  overrides: {
    tasks?: Task[]
    events?: CalendarEvent[]
    allRoutines?: Routine[]
    familyMembers?: FamilyMember[]
    viewedDate?: Date
  } & Partial<Mocks> = {},
) {
  const mocks = createMocks()
  const merged = { ...mocks, ...overrides }

  const deps = {
    tasks: overrides.tasks ?? [makeTask()],
    events: overrides.events ?? [makeEvent()],
    allRoutines: overrides.allRoutines ?? [makeRoutine()],
    familyMembers: overrides.familyMembers ?? [makeMember()],
    viewedDate: overrides.viewedDate ?? new Date('2026-02-19'),
    updateTask: merged.updateTask,
    updateRoutine: merged.updateRoutine,
    deleteRoutine: merged.deleteRoutine,
    updateEventAssignment: merged.updateEventAssignment,
    updateEventAssignmentAll: merged.updateEventAssignmentAll,
    markDone: merged.markDone,
    undoDone: merged.undoDone,
    skip: merged.skip,
    reschedule: merged.reschedule,
    refreshDateInstances: merged.refreshDateInstances,
    pushAction: merged.pushAction,
  }

  const hook = renderHook(() => useScheduleActions(deps))
  return { ...hook, mocks: merged }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('useScheduleActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Task assignment
  // -------------------------------------------------------------------------
  describe('onAssignTask', () => {
    it('calls updateTask with the new assignee', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignTask('task-1', 'member-1')
      })

      expect(mocks.updateTask).toHaveBeenCalledWith('task-1', { assignedTo: 'member-1' })
    })

    it('pushes an action message containing the member name', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignTask('task-1', 'member-1')
      })

      expect(mocks.pushAction).toHaveBeenCalledTimes(1)
      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Assigned "Buy groceries" to Liam')
    })

    it('pushes an unassign message when memberId is null', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignTask('task-1', null)
      })

      expect(mocks.updateTask).toHaveBeenCalledWith('task-1', { assignedTo: undefined })
      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Unassigned "Buy groceries"')
    })

    it('undo reverts to previous assignedTo value', () => {
      const task = makeTask({ assignedTo: 'old-member' })
      const { result, mocks } = renderActions({ tasks: [task] })

      act(() => {
        result.current.onAssignTask('task-1', 'member-1')
      })

      // Extract the undo function that was passed to pushAction
      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.updateTask.mockClear()

      act(() => {
        undoFn()
      })

      expect(mocks.updateTask).toHaveBeenCalledWith('task-1', { assignedTo: 'old-member' })
    })

    it('falls back to "Task" when task is not found', () => {
      const { result, mocks } = renderActions({ tasks: [] })

      act(() => {
        result.current.onAssignTask('missing-id', 'member-1')
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Assigned "Task" to Liam')
    })
  })

  // -------------------------------------------------------------------------
  // Task multi-assignment
  // -------------------------------------------------------------------------
  describe('onAssignTaskAll', () => {
    it('calls updateTask with assignedToAll and assignedTo set to first member', () => {
      const members = [
        makeMember({ id: 'm1', name: 'Liam' }),
        makeMember({ id: 'm2', name: 'Mia' }),
      ]
      const { result, mocks } = renderActions({ familyMembers: members })

      act(() => {
        result.current.onAssignTaskAll('task-1', ['m1', 'm2'])
      })

      expect(mocks.updateTask).toHaveBeenCalledWith('task-1', {
        assignedToAll: ['m1', 'm2'],
        assignedTo: 'm1',
      })
    })

    it('pushes a message listing all member names', () => {
      const members = [
        makeMember({ id: 'm1', name: 'Liam' }),
        makeMember({ id: 'm2', name: 'Mia' }),
      ]
      const { result, mocks } = renderActions({ familyMembers: members })

      act(() => {
        result.current.onAssignTaskAll('task-1', ['m1', 'm2'])
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Assigned "Buy groceries" to Liam, Mia')
    })

    it('pushes unassign message for empty memberIds array', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignTaskAll('task-1', [])
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Unassigned "Buy groceries"')
    })

    it('undo reverts to previous assignedToAll and assignedTo', () => {
      const task = makeTask({ assignedToAll: ['old-1'], assignedTo: 'old-1' })
      const { result, mocks } = renderActions({ tasks: [task] })

      act(() => {
        result.current.onAssignTaskAll('task-1', ['member-1'])
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.updateTask.mockClear()

      act(() => {
        undoFn()
      })

      expect(mocks.updateTask).toHaveBeenCalledWith('task-1', {
        assignedToAll: ['old-1'],
        assignedTo: 'old-1',
      })
    })
  })

  // -------------------------------------------------------------------------
  // Event assignment
  // -------------------------------------------------------------------------
  describe('onAssignEvent', () => {
    it('delegates to updateEventAssignment', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignEvent('event-1', 'member-1')
      })

      expect(mocks.updateEventAssignment).toHaveBeenCalledWith('event-1', 'member-1')
    })
  })

  describe('onAssignEventAll', () => {
    it('delegates to updateEventAssignmentAll', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignEventAll('event-1', ['m1', 'm2'])
      })

      expect(mocks.updateEventAssignmentAll).toHaveBeenCalledWith('event-1', ['m1', 'm2'])
    })
  })

  // -------------------------------------------------------------------------
  // Routine assignment
  // -------------------------------------------------------------------------
  describe('onAssignRoutine', () => {
    it('calls updateRoutine with assigned_to', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignRoutine('routine-1', 'member-1')
      })

      expect(mocks.updateRoutine).toHaveBeenCalledWith('routine-1', { assigned_to: 'member-1' })
    })

    it('passes null when unassigning', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignRoutine('routine-1', null)
      })

      expect(mocks.updateRoutine).toHaveBeenCalledWith('routine-1', { assigned_to: null })
    })
  })

  describe('onAssignRoutineAll', () => {
    it('calls updateRoutine with assigned_to_all and assigned_to set to first member', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignRoutineAll('routine-1', ['m1', 'm2'])
      })

      expect(mocks.updateRoutine).toHaveBeenCalledWith('routine-1', {
        assigned_to_all: ['m1', 'm2'],
        assigned_to: 'm1',
      })
    })

    it('sets assigned_to to null when memberIds is empty', () => {
      const { result, mocks } = renderActions()

      act(() => {
        result.current.onAssignRoutineAll('routine-1', [])
      })

      expect(mocks.updateRoutine).toHaveBeenCalledWith('routine-1', {
        assigned_to_all: [],
        assigned_to: null,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Routine complete / skip / push
  // -------------------------------------------------------------------------
  describe('onCompleteRoutine', () => {
    it('calls markDone with routine entity type when completing', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', true)
      })

      expect(mocks.markDone).toHaveBeenCalledWith('routine', 'routine-1', viewedDate, undefined)
    })

    it('calls undoDone when uncompleting', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', false)
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('routine', 'routine-1', viewedDate)
      expect(mocks.markDone).not.toHaveBeenCalled()
    })

    it('pushes action with routine name when completing', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', true)
      })

      expect(mocks.pushAction).toHaveBeenCalledTimes(1)
      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Completed "Morning walk"')
    })

    it('does not push action when uncompleting', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', false)
      })

      expect(mocks.pushAction).not.toHaveBeenCalled()
    })

    it('always calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', true)
      })
      expect(mocks.refreshDateInstances).toHaveBeenCalled()

      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', false)
      })
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('undo function calls undoDone and refreshDateInstances', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onCompleteRoutine('routine-1', true)
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.undoDone.mockClear()
      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await undoFn()
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('routine', 'routine-1', viewedDate)
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('falls back to "Routine" when routine is not found', async () => {
      const { result, mocks } = renderActions({ allRoutines: [] })

      await act(async () => {
        await result.current.onCompleteRoutine('missing-id', true)
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Completed "Routine"')
    })
  })

  describe('onSkipRoutine', () => {
    it('calls skip with routine entity type', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onSkipRoutine('routine-1')
      })

      expect(mocks.skip).toHaveBeenCalledWith('routine', 'routine-1', viewedDate)
    })

    it('pushes action with skip message', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onSkipRoutine('routine-1')
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Skipped "Morning walk"')
    })

    it('calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onSkipRoutine('routine-1')
      })

      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('undo calls undoDone and refreshDateInstances', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onSkipRoutine('routine-1')
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.undoDone.mockClear()
      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await undoFn()
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('routine', 'routine-1', viewedDate)
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })
  })

  describe('onPushRoutine', () => {
    it('calls reschedule with routine entity type and target date', async () => {
      const viewedDate = new Date('2026-02-19')
      const targetDate = new Date('2026-02-21')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onPushRoutine('routine-1', targetDate)
      })

      expect(mocks.reschedule).toHaveBeenCalledWith('routine', 'routine-1', viewedDate, targetDate)
    })

    it('pushes action with reschedule message', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onPushRoutine('routine-1', new Date('2026-02-21'))
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Rescheduled "Morning walk"')
    })

    it('calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onPushRoutine('routine-1', new Date('2026-02-21'))
      })

      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('undo calls undoDone and refreshDateInstances', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onPushRoutine('routine-1', new Date('2026-02-21'))
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.undoDone.mockClear()
      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await undoFn()
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('routine', 'routine-1', viewedDate)
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })
  })

  describe('onDeleteRoutine', () => {
    it('calls deleteRoutine with the routine id', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onDeleteRoutine('routine-1')
      })

      expect(mocks.deleteRoutine).toHaveBeenCalledWith('routine-1')
    })
  })

  // -------------------------------------------------------------------------
  // Event complete / skip / push
  // -------------------------------------------------------------------------
  describe('onCompleteEvent', () => {
    it('calls markDone with calendar_event entity type', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onCompleteEvent('event-1', true)
      })

      expect(mocks.markDone).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate)
    })

    it('calls undoDone when uncompleting', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onCompleteEvent('event-1', false)
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate)
      expect(mocks.markDone).not.toHaveBeenCalled()
    })

    it('pushes action with event title when completing', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onCompleteEvent('event-1', true)
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Completed "Team standup"')
    })

    it('always calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onCompleteEvent('event-1', true)
      })
      expect(mocks.refreshDateInstances).toHaveBeenCalled()

      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await result.current.onCompleteEvent('event-1', false)
      })
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('matches event by google_event_id when present', async () => {
      const event = makeEvent({ id: 'db-id', google_event_id: 'gcal-123', title: 'Calendar sync event' })
      const { result, mocks } = renderActions({ events: [event] })

      await act(async () => {
        await result.current.onCompleteEvent('gcal-123', true)
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Completed "Calendar sync event"')
    })

    it('falls back to "Event" when event is not found', async () => {
      const { result, mocks } = renderActions({ events: [] })

      await act(async () => {
        await result.current.onCompleteEvent('missing-id', true)
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Completed "Event"')
    })
  })

  describe('onSkipEvent', () => {
    it('calls skip with calendar_event entity type', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onSkipEvent('event-1')
      })

      expect(mocks.skip).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate)
    })

    it('pushes action with skip message', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onSkipEvent('event-1')
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Skipped "Team standup"')
    })

    it('calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onSkipEvent('event-1')
      })

      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('undo calls undoDone with calendar_event and refreshDateInstances', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onSkipEvent('event-1')
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.undoDone.mockClear()
      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await undoFn()
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate)
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })
  })

  describe('onPushEvent', () => {
    it('calls reschedule with calendar_event entity type', async () => {
      const viewedDate = new Date('2026-02-19')
      const targetDate = new Date('2026-02-21')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onPushEvent('event-1', targetDate)
      })

      expect(mocks.reschedule).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate, targetDate)
    })

    it('pushes action with reschedule message', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onPushEvent('event-1', new Date('2026-02-21'))
      })

      const [message] = mocks.pushAction.mock.calls[0]
      expect(message).toBe('Rescheduled "Team standup"')
    })

    it('calls refreshDateInstances', async () => {
      const { result, mocks } = renderActions()

      await act(async () => {
        await result.current.onPushEvent('event-1', new Date('2026-02-21'))
      })

      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })

    it('undo calls undoDone with calendar_event and refreshDateInstances', async () => {
      const viewedDate = new Date('2026-02-19')
      const { result, mocks } = renderActions({ viewedDate })

      await act(async () => {
        await result.current.onPushEvent('event-1', new Date('2026-02-21'))
      })

      const undoFn = mocks.pushAction.mock.calls[0][1]
      mocks.undoDone.mockClear()
      mocks.refreshDateInstances.mockClear()

      await act(async () => {
        await undoFn()
      })

      expect(mocks.undoDone).toHaveBeenCalledWith('calendar_event', 'event-1', viewedDate)
      expect(mocks.refreshDateInstances).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------
  describe('return value', () => {
    it('returns all 13 action functions', () => {
      const { result } = renderActions()

      const expectedKeys = [
        'onAssignTask',
        'onAssignTaskAll',
        'onAssignEvent',
        'onAssignEventAll',
        'onAssignRoutine',
        'onAssignRoutineAll',
        'onCompleteRoutine',
        'onSkipRoutine',
        'onPushRoutine',
        'onDeleteRoutine',
        'onCompleteEvent',
        'onSkipEvent',
        'onPushEvent',
      ]

      for (const key of expectedKeys) {
        expect(typeof result.current[key as keyof typeof result.current]).toBe('function')
      }
    })
  })
})
