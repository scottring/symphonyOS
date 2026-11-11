import { describe, expect, it } from 'vitest'
import {
  deleteCalendarEvent, moveCalendarEvent, recurrenceLines, recurringBaseId, toUtcIso, updateCalendarEvent,
  RECURRENCE_SCHEMA_PROPERTIES, UPDATE_CALENDAR_EVENT_TOOL, MOVE_CALENDAR_EVENT_TOOL, DELETE_CALENDAR_EVENT_TOOL,
  type CalendarToolCtx,
} from './calendarTools'
import { toolOutcome, CANVAS_WRITE_TOOLS } from './canvasEvents'

// ── An in-memory stand-in for the tables these tools touch ──
type Row = Record<string, unknown>
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { calendar_events: [], calendar_domain_mappings: [], event_discussion_flags: [], ...seed }
  const calls: Array<{ table: string; op: string; filters: Array<[string, unknown]>; values?: Row }> = []
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = []
    let op = 'select'
    let values: Row | undefined
    let lim = Infinity
    const match = (r: Row) => filters.every(([c, v]) => Array.isArray(v) ? v.includes(r[c]) : r[c] === v)
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
      in: (c: string, v: unknown[]) => { filters.push([c, v]); return q },
      limit: (n: number) => { lim = n; return q },
      update: (v: Row) => { op = 'update'; values = v; return q },
      delete: () => { op = 'delete'; return q },
      then: (resolve: (v: { data: Row[]; error: null }) => void) => {
        calls.push({ table, op, filters: [...filters], values })
        if (op === 'update') tables[table].filter(match).forEach((r) => Object.assign(r, values))
        if (op === 'delete') tables[table] = tables[table].filter((r) => !match(r))
        resolve({ data: op === 'select' ? tables[table].filter(match).slice(0, lim).map((r) => ({ ...r })) : [], error: null })
      },
    }
    return q
  }
  return { db: { from }, tables, calls }
}

function fakeFetch(reply: { status?: number; body: unknown }) {
  const sent: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = []
  const f = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
  }) as unknown as typeof fetch
  return { f, sent }
}

const ME = 'user-1'
const ROW_ID = '11111111-2222-4333-8444-555555555555'
const dentist = (over: Row = {}): Row => ({
  id: ROW_ID, user_id: ME, google_event_id: 'gev123', calendar_id: 'personal@group.calendar.google.com',
  calendar_name: 'Personal', title: 'Dentist', start_time: '2026-11-12T19:00:00+00:00', end_time: '2026-11-12T20:30:00+00:00',
  all_day: false, location: 'Main St', recurring_event_id: null, ...over,
})
const ctxWith = (f: typeof fetch, over: Partial<CalendarToolCtx> = {}): CalendarToolCtx => ({
  userId: ME, authHeader: 'Bearer caller-jwt', supabaseUrl: 'https://proj.supabase.co', fetch: f, ...over,
})

describe('toUtcIso', () => {
  it('reads an offsetless time as US Eastern by default, honouring DST', () => {
    expect(toUtcIso('2026-07-10T15:00:00')).toBe('2026-07-10T19:00:00.000Z')
    expect(toUtcIso('2026-12-10T15:00:00')).toBe('2026-12-10T20:00:00.000Z')
  })
  it('reads it in the household zone when one is given', () => {
    expect(toUtcIso('2026-07-10T15:00:00', 'America/Los_Angeles')).toBe('2026-07-10T22:00:00.000Z')
  })
  it('keeps an explicit offset and refuses a date with no time', () => {
    expect(toUtcIso('2026-07-10T15:00:00-05:00', 'Europe/London')).toBe('2026-07-10T20:00:00.000Z')
    expect(toUtcIso('2026-07-10')).toBeNull()
  })
})

describe('symphony_update_calendar_event', () => {
  it('forwards only what changed to the create-event function\'s update branch, as the caller', async () => {
    const { db, tables } = fakeDb({ calendar_events: [dentist()] })
    const { f, sent } = fakeFetch({ body: { eventId: 'gev123', location: 'Main St' } })
    const out = await updateCalendarEvent(db, { event_id: ROW_ID, title: 'Dentist (Mia)' }, ctxWith(f))

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://proj.supabase.co/functions/v1/google-calendar-create-event')
    expect(sent[0].headers.Authorization).toBe('Bearer caller-jwt')
    expect(sent[0].body).toEqual({
      eventId: 'gev123', calendarId: 'personal@group.calendar.google.com', timeZone: 'America/New_York', title: 'Dentist (Mia)',
    })
    expect(JSON.parse(out)).toMatchObject({ id: ROW_ID, updated: true, title: 'Dentist (Mia)', previous_title: 'Dentist' })
    expect(tables.calendar_events[0].title).toBe('Dentist (Mia)')
    expect(toolOutcome('symphony_update_calendar_event', out, new Set([...CANVAS_WRITE_TOOLS, 'symphony_update_calendar_event'])))
      .toEqual({ type: 'tool_result', name: 'symphony_update_calendar_event', ok: true, ids: [ROW_ID] })
  })

  it('a moved start keeps the length; times are read in the passed zone', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()] })
    const { f, sent } = fakeFetch({ body: { eventId: 'gev123' } })
    const out = await updateCalendarEvent(db, { event_id: 'gev123', start_time: '2026-11-13T09:00:00' },
      ctxWith(f, { timeZone: 'America/Chicago' }))
    // 9:00 CST = 15:00Z; 90 minutes kept.
    expect(sent[0].body).toMatchObject({ startTime: '2026-11-13T15:00:00.000Z', endTime: '2026-11-13T16:30:00.000Z', timeZone: 'America/Chicago' })
    expect(sent[0].body).not.toHaveProperty('title')
    expect(JSON.parse(out)).toMatchObject({ start_local: '2026-11-13T09:00', end_local: '2026-11-13T10:30' })
  })

  it('duration_minutes sets the end from the current start; empty location clears it', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()] })
    const { f, sent } = fakeFetch({ body: { eventId: 'gev123' } })
    await updateCalendarEvent(db, { event_id: ROW_ID, duration_minutes: 30, location: '' }, ctxWith(f))
    expect(sent[0].body).toMatchObject({ endTime: '2026-11-12T19:30:00.000Z', location: null })
    expect(sent[0].body).not.toHaveProperty('startTime')
  })

  it('reports an error carried in a 200 body (the Outlook / Google error convention)', async () => {
    const { db, tables } = fakeDb({ calendar_events: [dentist()] })
    const { f } = fakeFetch({ body: { error: 'Rate limit exceeded', statusCode: 403 } })
    const out = await updateCalendarEvent(db, { event_id: ROW_ID, title: 'X' }, ctxWith(f))
    expect(out).toMatch(/^Error updating calendar event \(200\): Rate limit exceeded/)
    expect(tables.calendar_events[0].title).toBe('Dentist')
  })

  it('turns a lapsed connection into a reconnect instruction', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()] })
    const { f } = fakeFetch({ body: { error: 'Token has been expired or revoked.', errorCode: 'invalid_grant', needsReconnect: true } })
    expect(await updateCalendarEvent(db, { event_id: ROW_ID, title: 'X' }, ctxWith(f))).toMatch(/^Error .*reconnect/)
  })

  it('refuses without calling out: unknown id, another member\'s event, no change, all-day time change, end before start', async () => {
    const { db } = fakeDb({ calendar_events: [dentist(), dentist({ id: 'other-row', user_id: 'user-2', google_event_id: 'theirs' }), dentist({ id: 'allday', google_event_id: 'ad1', all_day: true })] })
    const { f, sent } = fakeFetch({ body: {} })
    const ctx = ctxWith(f)
    expect(await updateCalendarEvent(db, { event_id: 'nope', title: 'X' }, ctx)).toMatch(/^Error: no calendar event/)
    expect(await updateCalendarEvent(db, { event_id: 'theirs', title: 'X' }, ctx)).toMatch(/^Error: .*another household member/)
    expect(await updateCalendarEvent(db, { event_id: ROW_ID, title: 'Dentist' }, ctx)).toMatch(/^Error: nothing to change/)
    expect(await updateCalendarEvent(db, { event_id: 'ad1', start_time: '2026-11-13T09:00:00' }, ctx)).toMatch(/^Error: this is an all-day event/)
    expect(await updateCalendarEvent(db, { event_id: ROW_ID, end_time: '2026-11-12T10:00:00' }, ctx)).toMatch(/^Error: the event would end before/)
    expect(await updateCalendarEvent(db, { event_id: ROW_ID, start_time: '2026-11-13' }, ctx)).toMatch(/^Error: start_time/)
    expect(sent).toHaveLength(0)
  })
})

describe('symphony_move_calendar_event', () => {
  const mappings = [
    { user_id: ME, calendar_id: 'personal@group.calendar.google.com', calendar_name: 'Personal', domain: 'personal', is_default: true, access_role: 'owner' },
    { user_id: ME, calendar_id: 'family@group.calendar.google.com', calendar_name: 'Kaufman Family', domain: 'family', is_default: true, access_role: 'writer' },
    { user_id: ME, calendar_id: 'holidays', calendar_name: 'Holidays', domain: 'family', is_default: false, access_role: 'reader' },
  ]

  it('moves to a calendar named by the person, through the move function', async () => {
    const { db, tables } = fakeDb({ calendar_events: [dentist()], calendar_domain_mappings: mappings })
    const { f, sent } = fakeFetch({ body: { eventId: 'gev123', calendarId: 'family@group.calendar.google.com' } })
    const out = await moveCalendarEvent(db, { event_id: ROW_ID, calendar: 'family' }, ctxWith(f))
    expect(sent[0].url).toBe('https://proj.supabase.co/functions/v1/google-calendar-move-event')
    expect(sent[0].body).toEqual({
      eventId: 'gev123', sourceCalendarId: 'personal@group.calendar.google.com', destinationCalendarId: 'family@group.calendar.google.com',
    })
    expect(JSON.parse(out)).toMatchObject({ id: ROW_ID, moved: true, from_calendar: 'Personal', to_calendar: 'Kaufman Family' })
    expect(tables.calendar_events[0]).toMatchObject({ calendar_id: 'family@group.calendar.google.com', calendar_name: 'Kaufman Family' })
  })

  it('by domain picks that domain\'s default writable calendar', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()], calendar_domain_mappings: mappings })
    const { f, sent } = fakeFetch({ body: { eventId: 'gev123' } })
    await moveCalendarEvent(db, { event_id: ROW_ID, domain: 'family' }, ctxWith(f))
    expect(sent[0].body.destinationCalendarId).toBe('family@group.calendar.google.com')
  })

  it('a read-only or unknown calendar is refused with the writable names; same calendar is a no-op', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()], calendar_domain_mappings: mappings })
    const { f, sent } = fakeFetch({ body: {} })
    expect(await moveCalendarEvent(db, { event_id: ROW_ID, calendar: 'Holidays' }, ctxWith(f)))
      .toBe('Error: no writable calendar matches "Holidays". Writable calendars: Personal, Kaufman Family.')
    expect(JSON.parse(await moveCalendarEvent(db, { event_id: ROW_ID, calendar: 'Personal' }, ctxWith(f)))).toMatchObject({ moved: false })
    expect(sent).toHaveLength(0)
  })

  it('passes on the function\'s Outlook refusal as an error', async () => {
    const { db } = fakeDb({ calendar_events: [dentist()], calendar_domain_mappings: mappings })
    const { f } = fakeFetch({ body: { error: 'Outlook events cannot be moved to another calendar from Symphony.' } })
    expect(await moveCalendarEvent(db, { event_id: ROW_ID, calendar: 'Kaufman Family' }, ctxWith(f))).toMatch(/^Error moving .*Outlook events cannot be moved/)
  })
})

describe('symphony_delete_calendar_event', () => {
  it('deletes through the delete function on the event\'s calendar and clears its discussion flag', async () => {
    const { db, tables } = fakeDb({
      calendar_events: [dentist()],
      event_discussion_flags: [{ user_id: ME, google_event_base_id: 'gev123' }, { user_id: ME, google_event_base_id: 'keep' }],
    })
    const { f, sent } = fakeFetch({ body: { ok: true, eventId: 'gev123', deletedSeries: false } })
    const out = await deleteCalendarEvent(db, { event_id: ROW_ID }, ctxWith(f))
    expect(sent[0].url).toBe('https://proj.supabase.co/functions/v1/google-calendar-delete-event')
    expect(sent[0].headers.Authorization).toBe('Bearer caller-jwt')
    expect(sent[0].body).toEqual({ eventId: 'gev123', calendarId: 'personal@group.calendar.google.com', deleteSeries: false })
    expect(JSON.parse(out)).toMatchObject({ id: ROW_ID, deleted: true, title: 'Dentist', start_local: '2026-11-12T14:00', whole_series: false })
    expect(tables.event_discussion_flags.map((r) => r.google_event_base_id)).toEqual(['keep'])
  })

  it('one occurrence of a series leaves the series flag; whole_series asks for the series', async () => {
    const instance = dentist({ google_event_id: 'base9_20261112T190000Z', recurring_event_id: 'base9' })
    const one = fakeDb({ calendar_events: [instance], event_discussion_flags: [{ user_id: ME, google_event_base_id: 'base9' }] })
    const a = fakeFetch({ body: { ok: true, deletedSeries: false } })
    await deleteCalendarEvent(one.db, { event_id: ROW_ID }, ctxWith(a.f))
    expect(one.tables.event_discussion_flags).toHaveLength(1)

    const all = fakeDb({ calendar_events: [instance], event_discussion_flags: [{ user_id: ME, google_event_base_id: 'base9' }] })
    const b = fakeFetch({ body: { ok: true, eventId: 'base9', deletedSeries: true } })
    const out = await deleteCalendarEvent(all.db, { event_id: ROW_ID, whole_series: true }, ctxWith(b.f))
    expect(b.sent[0].body.deleteSeries).toBe(true)
    expect(JSON.parse(out).whole_series).toBe(true)
    expect(all.tables.event_discussion_flags).toHaveLength(0)
  })

  it('a failed delete is an error and touches nothing else', async () => {
    const { db, tables } = fakeDb({ calendar_events: [dentist()], event_discussion_flags: [{ user_id: ME, google_event_base_id: 'gev123' }] })
    const { f } = fakeFetch({ status: 500, body: { error: 'boom' } })
    const out = await deleteCalendarEvent(db, { event_id: ROW_ID }, ctxWith(f))
    expect(out).toBe('Error deleting calendar event (500): boom')
    expect(tables.event_discussion_flags).toHaveLength(1)
    expect(toolOutcome('symphony_delete_calendar_event', out, new Set(['symphony_delete_calendar_event']))?.ok).toBe(false)
  })

  it('recurringBaseId strips a Google instance suffix', () => {
    expect(recurringBaseId('abc_20261112T190000Z')).toBe('abc')
    expect(recurringBaseId('abc')).toBe('abc')
  })
})

describe('recurrenceLines', () => {
  const start = '2026-11-17T14:00:00.000Z' // Tue 9:00 ET
  it('nothing asked, nothing added', () => {
    expect(recurrenceLines(undefined, { startTime: start })).toEqual({})
  })
  it('weekly on named days, every other week', () => {
    expect(recurrenceLines({ frequency: 'weekly', days: ['tue', 'Thursday'], interval: 2 }, { startTime: start }))
      .toEqual({ recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'] })
  })
  it('monthly by date or by position', () => {
    expect(recurrenceLines({ frequency: 'monthly', day_of_month: 15 }, { startTime: start }).recurrence).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'])
    expect(recurrenceLines({ frequency: 'monthly', week_of_month: -1, days: ['fri'] }, { startTime: start }).recurrence).toEqual(['RRULE:FREQ=MONTHLY;BYDAY=-1FR'])
  })
  it('until is the last day, as UTC at the series\' own start time; date-only for all-day', () => {
    expect(recurrenceLines({ frequency: 'daily', until: '2026-12-01' }, { startTime: start }).recurrence)
      .toEqual(['RRULE:FREQ=DAILY;UNTIL=20261201T140000Z'])
    expect(recurrenceLines({ frequency: 'daily', until: '2026-12-01' }, { startTime: start, timeZone: 'America/Los_Angeles' }).recurrence)
      .toEqual(['RRULE:FREQ=DAILY;UNTIL=20261201T140000Z'])
    expect(recurrenceLines({ frequency: 'yearly', until: '2030-01-01' }, { startTime: '2026-11-17', allDay: true }).recurrence)
      .toEqual(['RRULE:FREQ=YEARLY;UNTIL=20300101'])
    expect(recurrenceLines({ frequency: 'weekly', count: 10 }, { startTime: start }).recurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=10'])
  })
  it('accepts a well-formed RRULE string; refuses nonsense with an Error: string', () => {
    expect(recurrenceLines('FREQ=WEEKLY;BYDAY=MO', { startTime: start }).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO'])
    expect(recurrenceLines('every tuesday', { startTime: start }).error).toMatch(/^Error:/)
    expect(recurrenceLines({ frequency: 'hourly' }, { startTime: start }).error).toMatch(/^Error:/)
    expect(recurrenceLines({ frequency: 'monthly', week_of_month: 2, days: ['tue', 'wed'] }, { startTime: start }).error).toMatch(/^Error:/)
    expect(recurrenceLines({ frequency: 'weekly', days: ['funday'] }, { startTime: start }).error).toMatch(/^Error:/)
    expect(recurrenceLines({ frequency: 'daily', count: 3, until: '2026-12-01' }, { startTime: start }).error).toMatch(/^Error:/)
  })
})

describe('schemas', () => {
  it('are Anthropic tool definitions that need only the event id', () => {
    for (const t of [UPDATE_CALENDAR_EVENT_TOOL, MOVE_CALENDAR_EVENT_TOOL, DELETE_CALENDAR_EVENT_TOOL]) {
      expect(t.input_schema.type).toBe('object')
      expect(t.input_schema.required).toEqual(['event_id'])
      expect(t.description).toMatch(/symphony_list_events/)
    }
    expect(DELETE_CALENDAR_EVENT_TOOL.description).toMatch(/permanent/)
    expect(DELETE_CALENDAR_EVENT_TOOL.description).toMatch(/confirm/)
    expect(RECURRENCE_SCHEMA_PROPERTIES.recurrence.required).toEqual(['frequency'])
  })
})
