import { describe, it, expect, vi } from 'vitest'
import { makeEventMover, eventMoveErrorMessage } from './moveEvent'
import { CalendarReconnectError, type CalendarEvent } from '@/hooks/useGoogleCalendar'

const SAT_1PM = new Date(2026, 10, 14, 13, 0)
const SAT_2PM = new Date(2026, 10, 14, 14, 0)
const FRI_1PM = new Date(2026, 10, 13, 13, 0)
const FRI_2PM = new Date(2026, 10, 13, 14, 0)

const pippa = {
  id: 'row-1',
  google_event_id: 'goog-abc',
  title: 'Pippa',
  start_time: SAT_1PM.toISOString(),
  end_time: SAT_2PM.toISOString(),
  calendar_id: 'family@group.calendar.google.com',
} as CalendarEvent

const setup = (over: { updateEvent?: () => Promise<void>; events?: CalendarEvent[] } = {}) => {
  const updateEvent = vi.fn(over.updateEvent ?? (async () => {}))
  const refetch = vi.fn(async () => {})
  const notify = vi.fn()
  const move = makeEventMover({ events: over.events ?? [pippa], updateEvent, refetch, notify })
  return { move, updateEvent, refetch, notify }
}

describe('makeEventMover', () => {
  // The blocker: the week announced "Moved Pippa" and wrote nothing, because
  // no host supplied a writer at all. This is the writer.
  it('writes the move to Google, by the ID and the CALENDAR Google knows', async () => {
    const { move, updateEvent } = setup()
    await move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })
    expect(updateEvent).toHaveBeenCalledWith({
      eventId: 'goog-abc',
      startTime: FRI_1PM,
      endTime: FRI_2PM,
      calendarId: 'family@group.calendar.google.com',
      timeZone: undefined,
    })
  })

  it('accepts either id the grid may have dragged by', async () => {
    const { move, updateEvent } = setup()
    await move('goog-abc', { startTime: FRI_1PM, endTime: FRI_2PM })
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'goog-abc' }))
  })

  it('falls back to the row id when there is no Google id, and to no calendar when there is none', async () => {
    const local = { id: 'row-2', title: 'Local', start_time: SAT_1PM.toISOString(), end_time: SAT_2PM.toISOString() } as CalendarEvent
    const { move, updateEvent } = setup({ events: [local] })
    await move('row-2', { startTime: FRI_1PM, endTime: FRI_2PM })
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'row-2', calendarId: undefined }))
  })

  // The caller computed the duration from the old pair; both ends are written,
  // so a one-hour event stays one hour.
  it('writes both ends, so the duration the caller computed is what lands', async () => {
    const { move, updateEvent } = setup()
    await move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })
    const [params] = updateEvent.mock.calls[0]
    expect(params.endTime.getTime() - params.startTime.getTime()).toBe(SAT_2PM.getTime() - SAT_1PM.getTime())
  })

  it('carries the event’s own time zone when it has one', async () => {
    const zoned = { ...pippa, time_zone: 'America/New_York' } as CalendarEvent
    const { move, updateEvent } = setup({ events: [zoned] })
    await move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/New_York' }))
  })

  it('re-reads the range once the write has landed, so the grid shows the move', async () => {
    const { move, refetch, updateEvent } = setup()
    await move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })
    expect(updateEvent).toHaveBeenCalled()
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  describe('when the write fails', () => {
    const boom = async () => { throw new Error('Forbidden') }

    it('says so where it can be seen, and rejects', async () => {
      const { move, notify } = setup({ updateEvent: boom })
      await expect(move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })).rejects.toThrow()
      expect(notify).toHaveBeenCalledWith(expect.stringMatching(/refused this edit/), 'error')
    })

    it('does not re-read the range — there is nothing new to see', async () => {
      const { move, refetch } = setup({ updateEvent: boom })
      await expect(move('row-1', { startTime: FRI_1PM, endTime: FRI_2PM })).rejects.toThrow()
      expect(refetch).not.toHaveBeenCalled()
    })
  })

  it('refuses an event it cannot find, loudly', async () => {
    const { move, notify, updateEvent } = setup()
    await expect(move('who?', { startTime: FRI_1PM, endTime: FRI_2PM })).rejects.toThrow()
    expect(updateEvent).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('Could not move the event', 'error')
  })
})

describe('eventMoveErrorMessage', () => {
  it('tells each failure apart', () => {
    expect(eventMoveErrorMessage(new CalendarReconnectError())).toMatch(/reconnect in Settings/)
    // A refusal is reported as a refusal. Google does not say WHY, and a
    // shared calendar can perfectly well permit edits — so no cause is named.
    const refused = eventMoveErrorMessage(new Error('403 Forbidden'))
    expect(refused).toMatch(/refused this edit/)
    expect(refused).toMatch(/may not have permission/)
    expect(refused).not.toMatch(/shared|invite|don’t own|not the owner/i)
    expect(eventMoveErrorMessage(new Error('Not connected to Google Calendar'))).toMatch(/No calendar is connected/)
    expect(eventMoveErrorMessage(new Error('kaboom'))).toBe('Could not move the event')
  })
})
