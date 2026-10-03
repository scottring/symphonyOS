import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeekDragDrop } from './useWeekDragDrop'
import { createMockTask } from '@/test/mocks/factories'

vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))
import { showToast } from '@/hooks/useToast'

// Scott, 2026-10-03: the columns "are all very confusing" — some rows drag,
// some don't. One rule now: if it can go somewhere else, it drags there.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 5, 9, 0)) })
afterEach(() => { vi.useRealTimers(); vi.mocked(showToast).mockClear() })

const setup = (extra: Partial<Parameters<typeof useWeekDragDrop>[0]> = {}) => {
  const onUpdateTask = vi.fn()
  const pushAction = vi.fn()
  const onTakeIn = vi.fn()
  const onRoutineToDay = vi.fn()
  const timed = createMockTask({ id: 't1', title: 'Dentist', scheduledFor: new Date(2026, 9, 6, 9, 30), isAllDay: false, bucket: 'timed' }) as ReturnType<typeof createMockTask> & { endTime?: Date }
  timed.endTime = new Date(2026, 9, 6, 10, 30)
  const { result } = renderHook(() => useWeekDragDrop({
    weekStart: new Date(2026, 9, 3), onWeekChange: vi.fn(), onUpdateTask, onUpdateRoutine: vi.fn(),
    tasks: [timed, createMockTask({ id: 'm1', title: 'Plan Thanksgiving', bucket: 'month' })], events: [], routines: [],
    pushAction, onTakeIn, onRoutineToDay, ...extra,
  }))
  const drop = (active: Record<string, unknown>, over: Record<string, unknown>) => act(async () => {
    result.current.dndHandlers.onDragEnd({ active: { id: 'x', data: { current: active } }, over: { id: 'y', data: { current: over } } } as never)
  })
  return { drop, onUpdateTask, pushAction, onTakeIn, onRoutineToDay }
}

describe('useWeekDragDrop — one drag rule', () => {
  it('a timed task moved to another day keeps its clock time and its length', async () => {
    const { drop, onUpdateTask, pushAction } = setup()
    await drop({ kind: 'chip', taskId: 't1', keepTime: true }, { kind: 'allDay', dayIso: '2026-10-08' })
    const [id, updates] = onUpdateTask.mock.calls[0]
    expect(id).toBe('t1')
    expect(updates.isAllDay).toBe(false)
    expect(updates.scheduledFor).toEqual(new Date(2026, 9, 8, 9, 30))
    expect(updates.endTime).toEqual(new Date(2026, 9, 8, 10, 30))
    // Undo puts the old day and time back.
    pushAction.mock.calls[0][1]()
    expect(onUpdateTask.mock.calls[1][1]).toMatchObject({ scheduledFor: new Date(2026, 9, 6, 9, 30), isAllDay: false })
  })

  it('a month line dropped on the week’s list is taken into the week', async () => {
    const { drop, onTakeIn } = setup()
    await drop({ kind: 'refLine', taskId: 'm1' }, { kind: 'weekList' })
    expect(onTakeIn).toHaveBeenCalledWith('m1')
  })

  it('a month line dropped on a day lands on that day, any time, this week', async () => {
    const { drop, onUpdateTask } = setup()
    await drop({ kind: 'refLine', taskId: 'm1' }, { kind: 'allDay', dayIso: '2026-10-07' })
    expect(onUpdateTask.mock.calls[0][1]).toMatchObject({ isAllDay: true, bucket: 'timed', scheduledFor: new Date(2026, 9, 7), weekStart: new Date(2026, 9, 3) })
  })

  it('a routine occurrence moves to another day as that one occurrence', async () => {
    const { drop, onRoutineToDay } = setup()
    await drop({ kind: 'routineOcc', routineId: 'r1', fromIso: '2026-10-05', title: 'Yard weeding' }, { kind: 'allDay', dayIso: '2026-10-06' })
    expect(onRoutineToDay).toHaveBeenCalledWith('r1', '2026-10-05', '2026-10-06', 'Yard weeding')
  })

  // Final review 2026-10-03: a Sometime row carries Saturday as its day, so
  // the same-day guard swallowed a drop onto Saturday.
  it('a Sometime-this-weekend routine dropped on Saturday is given Saturday', async () => {
    const { drop, onRoutineToDay } = setup()
    await drop({ kind: 'routineOcc', routineId: 'r1', fromIso: '2026-10-10', title: 'Yard weeding', fromSometime: true }, { kind: 'allDay', dayIso: '2026-10-10' })
    expect(onRoutineToDay).toHaveBeenCalledWith('r1', '2026-10-10', '2026-10-10', 'Yard weeding')
  })

  it('a routine occurrence dropped on its own day does nothing', async () => {
    const { drop, onRoutineToDay } = setup()
    await drop({ kind: 'routineOcc', routineId: 'r1', fromIso: '2026-10-06', title: 'Yard weeding' }, { kind: 'allDay', dayIso: '2026-10-06' })
    expect(onRoutineToDay).not.toHaveBeenCalled()
  })

  it('nothing lands on a day that has passed', async () => {
    const { drop, onRoutineToDay, onUpdateTask } = setup()
    await drop({ kind: 'routineOcc', routineId: 'r1', fromIso: '2026-10-05', title: 'Yard weeding' }, { kind: 'allDay', dayIso: '2026-10-04' })
    await drop({ kind: 'refLine', taskId: 'm1' }, { kind: 'allDay', dayIso: '2026-10-04' })
    expect(onRoutineToDay).not.toHaveBeenCalled()
    expect(onUpdateTask).not.toHaveBeenCalled()
  })

  it('a routine is not added to the week’s list, and says so', async () => {
    const { drop, onRoutineToDay } = setup()
    await drop({ kind: 'routineOcc', routineId: 'r1', fromIso: '2026-10-05', title: 'Yard weeding' }, { kind: 'weekList' })
    expect(onRoutineToDay).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/repeat on their own schedule/), 'warning')
  })
})
