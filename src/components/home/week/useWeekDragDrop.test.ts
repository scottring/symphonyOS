import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeekDragDrop } from './useWeekDragDrop'

const mkOver = (slotId: string) => ({
  active: { id: 'chip:t1', data: { current: { kind: 'chip', taskId: 't1' } } },
  over: { id: slotId, data: { current: { kind: 'timed', dayIso: '2026-05-20', hour: 13, minute: 30 } } },
})

const mkBlockOver = (slotId: string) => ({
  active: { id: 'block:t1', data: { current: { kind: 'block', itemId: 't1', originStartIso: '2026-05-20T10:00:00' } } },
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
