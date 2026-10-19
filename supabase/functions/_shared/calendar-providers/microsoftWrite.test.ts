import { describe, it, expect, vi } from 'vitest'
import {
  buildGraphEvent,
  buildGraphPatch,
  grantsGraphWrite,
  graphCreateEvent,
  graphDeleteEvent,
  graphUpdateEvent,
  GraphWriteError,
  rruleToGraphRecurrence,
  wallClock,
} from './microsoftWrite.ts'

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('grantsGraphWrite', () => {
  it('reads write access from the granted scopes, bare or as Graph URLs', () => {
    expect(grantsGraphWrite('openid User.Read Calendars.ReadWrite offline_access')).toBe(true)
    expect(grantsGraphWrite('https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read')).toBe(true)
    expect(grantsGraphWrite('Calendars.ReadWrite.Shared')).toBe(true)
  })

  it('a read-only or unrecorded grant cannot write', () => {
    expect(grantsGraphWrite('User.Read Calendars.Read offline_access')).toBe(false)
    expect(grantsGraphWrite(null)).toBe(false)
    expect(grantsGraphWrite(undefined)).toBe(false)
  })
})

describe('wallClock', () => {
  it('is the local time of the instant in that zone, across DST', () => {
    expect(wallClock('2026-10-20T13:00:00.000Z', 'America/New_York')).toBe('2026-10-20T09:00:00')
    expect(wallClock('2026-12-01T14:00:00.000Z', 'America/New_York')).toBe('2026-12-01T09:00:00')
    expect(wallClock('2026-10-20T13:00:00.000Z', 'UTC')).toBe('2026-10-20T13:00:00')
  })

  it('midnight is 00, not 24', () => {
    expect(wallClock('2026-10-20T04:00:00.000Z', 'America/New_York')).toBe('2026-10-20T00:00:00')
  })
})

describe('rruleToGraphRecurrence', () => {
  const start = '2026-10-20' // a Tuesday

  it('daily, with an interval', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=DAILY;INTERVAL=2'], start)).toEqual({
      pattern: { type: 'daily', interval: 2 },
      range: { type: 'noEnd', startDate: start },
    })
  })

  it('weekly on named days, or on the first day when none is named', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'], start)?.pattern).toEqual({
      type: 'weekly', interval: 1, daysOfWeek: ['tuesday', 'thursday'], firstDayOfWeek: 'monday',
    })
    // "Every other week" counts weeks from WKST, Monday by default, as Google does.
    expect(rruleToGraphRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU,MO'], start)?.pattern).toMatchObject({ firstDayOfWeek: 'sunday', interval: 2 })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=WEEKLY'], start)?.pattern).toMatchObject({ daysOfWeek: ['tuesday'] })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=SA,SU'], start)?.pattern).toMatchObject({ daysOfWeek: ['saturday', 'sunday'] })
  })

  it('monthly by date, by position, and quarterly', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'], start)?.pattern).toEqual({ type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY'], start)?.pattern).toEqual({ type: 'absoluteMonthly', interval: 1, dayOfMonth: 20 })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=2TU'], start)?.pattern).toEqual({
      type: 'relativeMonthly', interval: 1, daysOfWeek: ['tuesday'], index: 'second',
    })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=-1FR'], start)?.pattern).toMatchObject({ index: 'last', daysOfWeek: ['friday'] })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;INTERVAL=3'], start)?.pattern).toMatchObject({ interval: 3, dayOfMonth: 20 })
  })

  it('yearly on the first date', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=YEARLY'], start)?.pattern).toEqual({ type: 'absoluteYearly', interval: 1, dayOfMonth: 20, month: 10 })
  })

  it('a count or an end date bounds the series', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=DAILY;COUNT=5'], start)?.range).toEqual({ type: 'numbered', startDate: start, numberOfOccurrences: 5 })
    expect(rruleToGraphRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261231T235959Z'], start)?.range).toEqual({ type: 'endDate', startDate: start, endDate: '2026-12-31' })
  })

  it('refuses what Graph cannot hold exactly', () => {
    expect(rruleToGraphRecurrence(['RRULE:FREQ=HOURLY'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=5FR'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=1MO,3MO'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['RRULE:FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['RRULE:FREQ=WEEKLY', 'EXDATE:20261027'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['EXDATE:20261027'], start)).toBeNull()
    expect(rruleToGraphRecurrence(['RRULE:FREQ=DAILY;INTERVAL=0'], start)).toBeNull()
  })
})

describe('buildGraphEvent', () => {
  it('a timed event is written in the person’s zone, with Graph’s idempotency key', () => {
    const built = buildGraphEvent({
      calendarId: 'cal-1', title: 'Dentist', description: 'Bring card', location: 'Main St',
      startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z',
      timeZone: 'America/New_York', requestId: 'req-123',
    })
    expect(built).toEqual({ body: {
      subject: 'Dentist',
      body: { contentType: 'text', content: 'Bring card' },
      location: { displayName: 'Main St' },
      transactionId: 'req-123',
      start: { dateTime: '2026-10-20T09:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-10-20T10:00:00', timeZone: 'America/New_York' },
    } })
  })

  it('an all-day event runs midnight to the midnight after its last day, as the Google path counts', () => {
    const built = buildGraphEvent({
      calendarId: 'cal-1', title: 'Trip', startTime: '2026-10-20T00:00:00.000Z', endTime: '2026-10-22T00:00:00.000Z', allDay: true, timeZone: 'America/New_York',
    })
    expect('body' in built && built.body).toMatchObject({
      isAllDay: true,
      start: { dateTime: '2026-10-20T00:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-10-23T00:00:00', timeZone: 'America/New_York' },
    })
  })

  it('a series starts on the first occurrence’s local date', () => {
    // 01:00 UTC on the 21st is the evening of the 20th in New York.
    const built = buildGraphEvent({
      calendarId: 'c', title: 'Practice', startTime: '2026-10-21T01:00:00.000Z', endTime: '2026-10-21T02:00:00.000Z',
      timeZone: 'America/New_York', recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
    })
    expect('body' in built && built.body.recurrence).toEqual({
      pattern: { type: 'weekly', interval: 1, daysOfWeek: ['tuesday'], firstDayOfWeek: 'monday' },
      range: { type: 'noEnd', startDate: '2026-10-20' },
    })
  })

  it('an unknown zone falls back to UTC rather than failing', () => {
    const built = buildGraphEvent({ calendarId: 'c', title: 'x', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z', timeZone: 'Mars/Olympus' })
    expect('body' in built && built.body.start).toEqual({ dateTime: '2026-10-20T13:00:00', timeZone: 'UTC' })
  })

  it('a series Graph cannot hold is an error, not a single event', () => {
    const built = buildGraphEvent({ calendarId: 'c', title: 'x', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z', recurrence: ['RRULE:FREQ=HOURLY'] })
    expect(built).toHaveProperty('error')
  })
})

describe('buildGraphPatch', () => {
  it('sends only what changed; a null location clears it', () => {
    expect(buildGraphPatch({ title: '  New  ' })).toEqual({ subject: 'New' })
    expect(buildGraphPatch({ location: null })).toEqual({ location: { displayName: '' } })
    expect(buildGraphPatch({ startTime: '2026-10-20T13:00:00.000Z', timeZone: 'America/New_York' })).toEqual({
      start: { dateTime: '2026-10-20T09:00:00', timeZone: 'America/New_York' },
    })
    expect(buildGraphPatch({ title: '   ' })).toEqual({})
  })
})

describe('Graph calls', () => {
  it('create posts to the named calendar and returns the event id and web link', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'ev-1', webLink: 'https://outlook.live.com/x' }, 201))
    const res = await graphCreateEvent('tok', { calendarId: 'cal 1', title: 'A', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z' }, fetchImpl)
    expect(res).toEqual({ eventId: 'ev-1', htmlLink: 'https://outlook.live.com/x' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/calendars/cal%201/events')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it("'primary' is the account's default calendar", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'ev-1' }, 201))
    await graphCreateEvent('tok', { calendarId: 'primary', title: 'A', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z' }, fetchImpl)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://graph.microsoft.com/v1.0/me/events')
  })

  it('a Graph refusal becomes a GraphWriteError carrying its message and status', async () => {
    const fetchImpl = vi.fn(async () => ok({ error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } }, 403))
    const err = await graphCreateEvent('tok', { calendarId: 'c', title: 'A', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z' }, fetchImpl).catch((e) => e)
    expect(err).toBeInstanceOf(GraphWriteError)
    expect(err).toMatchObject({ message: 'Access is denied.', status: 403 })
  })

  it('an unrepresentable series never reaches Graph', async () => {
    const fetchImpl = vi.fn()
    const err = await graphCreateEvent('tok', { calendarId: 'c', title: 'A', startTime: '2026-10-20T13:00:00.000Z', endTime: '2026-10-20T14:00:00.000Z', recurrence: ['RRULE:FREQ=HOURLY'] }, fetchImpl).catch((e) => e)
    expect(err).toBeInstanceOf(GraphWriteError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('update patches the event by id', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'ev-1', location: { displayName: 'Here' }, webLink: 'w' }))
    const res = await graphUpdateEvent('tok', 'ev/1', { location: 'Here' }, fetchImpl)
    expect(res).toEqual({ eventId: 'ev-1', location: 'Here', htmlLink: 'w' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events/ev%2F1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ location: { displayName: 'Here' } })
  })

  it('update with nothing to change is refused without a call', async () => {
    const fetchImpl = vi.fn()
    await expect(graphUpdateEvent('tok', 'ev-1', {}, fetchImpl)).rejects.toBeInstanceOf(GraphWriteError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('delete removes one occurrence; an already-deleted event is success', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }))
    await expect(graphDeleteEvent('tok', 'occ-1', false, fetchImpl)).resolves.toBe('occ-1')
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE')
  })

  it('deleting a series deletes its master', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({ seriesMasterId: 'master-1', type: 'occurrence' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(graphDeleteEvent('tok', 'occ-1', true, fetchImpl)).resolves.toBe('master-1')
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe('https://graph.microsoft.com/v1.0/me/events/master-1')
  })

  it('a refused delete is an error', async () => {
    const fetchImpl = vi.fn(async () => ok({ error: { message: 'Access is denied.' } }, 403))
    await expect(graphDeleteEvent('tok', 'ev-1', false, fetchImpl)).rejects.toMatchObject({ status: 403 })
  })
})
