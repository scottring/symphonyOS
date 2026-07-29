import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Task } from '@/types/task'

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
        ? { calendarId: 'fam@group.calendar.google.com', calendarName: 'Family' }
        : null,
  }),
}))

import { useSendToCalendar, buildEventDescription } from './useSendToCalendar'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Dentist appointment',
    completed: false,
    createdAt: new Date('2026-07-29T00:00:00Z'),
    updatedAt: new Date('2026-07-29T00:00:00Z'),
    bucket: 'inbox',
    context: 'family',
    ...overrides,
  } as Task
}

const START = new Date('2026-07-30T14:00:00')

describe('buildEventDescription', () => {
  it('returns undefined when the task has no context to carry', () => {
    expect(buildEventDescription(makeTask())).toBeUndefined()
  })

  it('carries notes, phone number and links', () => {
    const description = buildEventDescription(
      makeTask({
        notes: 'Bring the insurance card',
        phoneNumber: '555-0100',
        links: [{ url: 'https://dentist.example/portal', title: 'Portal' }],
      }),
    )
    expect(description).toContain('Bring the insurance card')
    expect(description).toContain('555-0100')
    expect(description).toContain('Portal: https://dentist.example/portal')
  })
})

describe('useSendToCalendar', () => {
  beforeEach(() => {
    createEvent.mockReset()
    deleteEvent.mockReset()
  })

  it('creates the event on the domain-mapped calendar, then deletes the task', async () => {
    createEvent.mockResolvedValue({ id: 'evt-1' })
    const deleteTask = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), {
        start: START,
        durationMinutes: 30,
      })
    })

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dentist appointment',
        calendarId: 'fam@group.calendar.google.com',
        startTime: START,
        endTime: new Date(START.getTime() + 30 * 60000),
      }),
    )
    expect(deleteTask).toHaveBeenCalledWith('task-1')
    expect(outcome).toEqual({
      ok: true,
      eventId: 'evt-1',
      calendarId: 'fam@group.calendar.google.com',
      calendarName: 'Family',
    })
  })

  it('does NOT delete the task when Google rejects the write with 403', async () => {
    const err = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { status: 403 } as Response,
    })
    createEvent.mockRejectedValue(err)
    const deleteTask = vi.fn()
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), { start: START })
    })

    expect(deleteTask).not.toHaveBeenCalled()
    expect(outcome).toEqual({ ok: false, reason: 'read-only' })
  })

  it('does NOT delete the task on any other failure', async () => {
    createEvent.mockRejectedValue(new Error('network down'))
    const deleteTask = vi.fn()
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let outcome
    await act(async () => {
      outcome = await result.current.sendToCalendar(makeTask(), { start: START })
    })

    expect(deleteTask).not.toHaveBeenCalled()
    expect(outcome).toEqual({ ok: false, reason: 'failed' })
  })

  it('defaults to a 60 minute event and falls back to the default calendar', async () => {
    createEvent.mockResolvedValue({ id: 'evt-2' })
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    await act(async () => {
      await result.current.sendToCalendar(makeTask({ context: 'work' }), { start: START })
    })

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: undefined,
        endTime: new Date(START.getTime() + 60 * 60000),
      }),
    )
  })

  it('sends an all-day event whose end stays on the start day, so Google gets ONE day', async () => {
    createEvent.mockResolvedValue({ id: 'evt-3' })
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    // A fixed UTC instant, not a local-time literal, so the assertions below
    // don't depend on the runner's timezone. This models "All Day tomorrow" in
    // US Eastern: the picker emits local midnight, which serializes to 04:00Z
    // on the same calendar date.
    const allDayStart = new Date('2026-07-30T04:00:00Z')

    await act(async () => {
      await result.current.sendToCalendar(makeTask(), { start: allDayStart, allDay: true })
    })

    const params = createEvent.mock.calls[0][0]
    expect(params.allDay).toBe(true)
    expect(params.startTime).toEqual(allDayStart)
    // The edge function splits the date off endTime, treats it as the event's
    // LAST day, and adds one to build Google's exclusive `end.date`
    // (google-calendar-create-event/index.ts:329-339). So endTime must land on
    // the start's own date: start.date 2026-07-30 -> end.date 2026-07-31 = a
    // single-day banner. A +24h end (2026-07-31) became end.date 2026-08-01 and
    // spanned two days.
    expect(params.endTime.toISOString()).toBe('2026-07-30T05:00:00.000Z')
    expect(params.endTime.toISOString().split('T')[0]).toBe('2026-07-30')
  })

  it('refuses a concurrent send as busy, not as a failure', async () => {
    // One hook instance serves every row on the page, so this is ordinary fast
    // triage — send row B while row A is still writing — not just a double-tap.
    let releaseFirst: (value: { id: string }) => void = () => {}
    createEvent.mockReturnValueOnce(new Promise((resolve) => { releaseFirst = resolve }))
    const deleteTask = vi.fn()
    const { result } = renderHook(() => useSendToCalendar(deleteTask))

    let first: Promise<unknown>
    let second
    await act(async () => {
      first = result.current.sendToCalendar(makeTask({ id: 'task-a' }), { start: START })
      second = await result.current.sendToCalendar(makeTask({ id: 'task-b' }), { start: START })
      releaseFirst({ id: 'evt-1' })
      await first
    })

    expect(second).toEqual({ ok: false, reason: 'busy' })
    expect(createEvent).toHaveBeenCalledTimes(1)
    // The first send is untouched by the second's refusal.
    expect(deleteTask).toHaveBeenCalledTimes(1)
    expect(deleteTask).toHaveBeenCalledWith('task-a')
  })

  it('undoSend deletes the created event', async () => {
    deleteEvent.mockResolvedValue(undefined)
    const { result } = renderHook(() => useSendToCalendar(vi.fn()))

    await act(async () => {
      await result.current.undoSend('evt-1', 'fam@group.calendar.google.com')
    })

    expect(deleteEvent).toHaveBeenCalledWith({
      eventId: 'evt-1',
      calendarId: 'fam@group.calendar.google.com',
    })
  })
})
