import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeekDragDrop } from './useWeekDragDrop'

const mkOver = (slotId: string) => ({
  active: { id: 'chip:t1', data: { current: { kind: 'chip', taskId: 't1' } } },
  over: { id: slotId, data: { current: { kind: 'timed', dayIso: '2026-05-20', hour: 13, minute: 30 } } },
})

// itemId uses the TimelineItem.id format (prefixed): 'task-<uuid>'.
// The hook must strip the prefix before calling onUpdateTask with the raw DB id.
const mkBlockOver = (slotId: string) => ({
  active: { id: 'block:task-t1', data: { current: { kind: 'block', itemId: 'task-t1', originStartIso: '2026-05-20T10:00:00' } } },
  over: { id: slotId, data: { current: { kind: 'timed', dayIso: '2026-05-21', hour: 14, minute: 0 } } },
})

describe('useWeekDragDrop', () => {
  it('chip drop on timed slot calls onUpdateTask with the new start + 30-min duration', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{ id: 't1', title: 'X' } as never],
      events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd(mkOver('slot:2026-05-20:13:30') as never)
    })

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const [taskId, updates] = onUpdateTask.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(updates.isAllDay).toBe(false)
    expect(updates.scheduledFor).toBeInstanceOf(Date)
    expect((updates.scheduledFor as Date).getHours()).toBe(13)
    expect((updates.scheduledFor as Date).getMinutes()).toBe(30)
    expect((updates.endTime as Date).getTime() - (updates.scheduledFor as Date).getTime()).toBe(30 * 60 * 1000)
  })

  it('block drop preserves the dragged item duration when moving to a new slot', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const startIso = '2026-05-20T10:00:00'
    const endIso = '2026-05-20T11:30:00'
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{
        id: 't1', title: 'X',
        scheduledFor: new Date(startIso), endTime: new Date(endIso),
      } as never],
      events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd(mkBlockOver('slot:2026-05-21:14:00') as never)
    })

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const updates = onUpdateTask.mock.calls[0][1]
    const dur = (updates.endTime as Date).getTime() - (updates.scheduledFor as Date).getTime()
    expect(dur).toBe(90 * 60 * 1000)
    expect((updates.scheduledFor as Date).getHours()).toBe(14)
  })

  it('chip drop on an all-day cell keeps it all-day and moves it to that day', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{ id: 't1', title: 'X', isAllDay: true, scheduledFor: new Date(2026, 4, 20) } as never],
      events: [], routines: [],
    }))

    const allDayDrop = {
      active: { id: 'chip:t1', data: { current: { kind: 'chip', taskId: 't1' } } },
      over: { id: 'slot:2026-05-22:all-day', data: { current: { kind: 'allDay', dayIso: '2026-05-22' } } },
    }

    await act(async () => {
      result.current.dndHandlers.onDragEnd(allDayDrop as never)
    })

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const [taskId, updates] = onUpdateTask.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(updates.isAllDay).toBe(true)
    expect((updates.scheduledFor as Date).getDate()).toBe(22)
    expect((updates.scheduledFor as Date).getHours()).toBe(0)
  })

  it('chip drops write bucket: timed (pool pills may start in week/month/inbox) and undo restores it', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const pushAction = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{ id: 't1', title: 'X', bucket: 'week' } as never],
      events: [], routines: [],
      pushAction,
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd(mkOver('slot:2026-05-20:13:30') as never)
    })

    expect(onUpdateTask.mock.calls[0][1].bucket).toBe('timed')

    // Undo restores the pre-drop bucket, not a re-toggle.
    await act(async () => { pushAction.mock.calls[0][1]() })
    expect(onUpdateTask.mock.calls[1][1].bucket).toBe('week')
  })

  it('routine block drop pins ONE day via onPushRoutine — never a rule rewrite', async () => {
    const onUpdateRoutine = vi.fn()
    const onPushRoutine = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask: vi.fn(),
      onUpdateEvent: vi.fn(),
      onUpdateRoutine,
      onPushRoutine,
      tasks: [], events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd({
        active: { id: 'block-routine:routine-r1-day2', data: { current: { kind: 'block', itemId: 'routine-r1-day2' } } },
        over: { id: 'slot:2026-05-19:09:00', data: { current: { kind: 'timed', dayIso: '2026-05-19', hour: 9, minute: 0 } } },
      } as never)
    })

    expect(onPushRoutine).toHaveBeenCalledTimes(1)
    const [routineId, when] = onPushRoutine.mock.calls[0]
    expect(routineId).toBe('r1')
    expect((when as Date).getDate()).toBe(19)
    expect((when as Date).getHours()).toBe(9)
    expect(onUpdateRoutine).not.toHaveBeenCalled()
  })

  it('onDragCancel produces no mutation', async () => {
    const onUpdateTask = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragCancel()
    })
    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})

describe('useWeekDragDrop — cross-week auto-advance', () => {
  it('fires onWeekChange forward when right-edge hover persists ≥500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('right'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(onWeekChange).toHaveBeenCalledTimes(1)
    const newStart = onWeekChange.mock.calls[0][0]
    expect(newStart.getDate()).toBe(24)
    vi.useRealTimers()
  })

  it('fires onWeekChange backward when left-edge hover persists ≥500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('left'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(onWeekChange).toHaveBeenCalledTimes(1)
    expect(onWeekChange.mock.calls[0][0].getDate()).toBe(10)
    vi.useRealTimers()
  })

  it('cancels auto-advance when edge state clears before 500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('right'))
    act(() => { vi.advanceTimersByTime(300) })
    act(() => result.current.notifyEdge(null))
    act(() => { vi.advanceTimersByTime(300) })

    expect(onWeekChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
