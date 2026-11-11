// The assistant's calendar edits (2026-11-11): change, move and delete an
// event the person already has, and repeat one it creates. The app could do
// all four; the assistant could only create.
//
// Every write goes through the app's own edge functions with the caller's
// Authorization header, exactly as symphony_create_calendar_event does, so
// token refresh and Google/Outlook routing (writeConnection.ts) stay in one
// place:
//   - update → google-calendar-create-event with eventId (its update branch)
//   - move   → google-calendar-move-event (Google only; Outlook is refused there)
//   - delete → google-calendar-delete-event (also clears the cached row)
// Those functions report most failures as a 200 with { error } in the body,
// so a reply is read for `error` as well as for its status.
//
// The event is named by the id symphony_list_events returns (the cached
// calendar_events row); the row supplies the provider's event id, its
// calendar, and the current times a partial change keeps.

import { APP_TZ, etOffsetMinutes } from './schedule.ts'

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface CalendarToolCtx {
  userId: string
  /** The caller's Authorization header, forwarded as-is. */
  authHeader: string
  /** SUPABASE_URL; the edge functions live under /functions/v1. */
  supabaseUrl: string
  /** IANA zone offsetless times are read in; the household's. Defaults to US Eastern. */
  timeZone?: string | null
  fetch?: typeof fetch
}

// ── Times ─────────────────────────────────────────────────────────────

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/
const HAS_TIME = /T\d{2}:\d{2}/

/** A usable IANA zone, else US Eastern. */
export function resolveZone(timeZone: string | null | undefined): string {
  if (!timeZone) return APP_TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return APP_TZ
  }
}

/** Minutes east of UTC for `timeZone` on a date (same noon rule as etOffsetMinutes). */
export function zoneOffsetMinutes(dateStr: string, timeZone: string): number {
  if (timeZone === APP_TZ) return etOffsetMinutes(dateStr)
  const [y, m, d] = dateStr.split('-').map(Number)
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const mt = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  if (!mt) return 0
  return (mt[1] === '-' ? -1 : 1) * (parseInt(mt[2]) * 60 + (mt[3] ? parseInt(mt[3]) : 0))
}

/** A timed ISO value as UTC; one without an offset is wall-clock time in `timeZone`. Null when unreadable. */
export function toUtcIso(value: string, timeZone?: string | null): string | null {
  const v = value.trim()
  if (!HAS_TIME.test(v)) return null
  if (HAS_OFFSET.test(v)) {
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  const ms = Date.parse(`${v}Z`) - zoneOffsetMinutes(v.slice(0, 10), resolveZone(timeZone)) * 60000
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** "YYYY-MM-DDTHH:mm:ss" wall clock of an instant in a zone. */
function wallClock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

// ── The event and the edge functions ──────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface CachedEvent {
  id: string
  user_id: string
  google_event_id: string
  calendar_id: string | null
  calendar_name: string | null
  title: string
  start_time: string
  end_time: string
  all_day: boolean | null
  location: string | null
  recurring_event_id: string | null
}

const EVENT_COLUMNS = 'id, user_id, google_event_id, calendar_id, calendar_name, title, start_time, end_time, all_day, location, recurring_event_id'

/** The person's own cached copy of an event, by Symphony row id or provider event id. */
export async function findEvent(db: Db, userId: string, eventId: string): Promise<{ event: CachedEvent } | { error: string }> {
  const id = eventId.trim()
  if (!id) return { error: 'Error: event_id is required. Call symphony_list_events first and use the id it returns.' }
  const column = UUID_RE.test(id) ? 'id' : 'google_event_id'
  const { data, error } = await db.from('calendar_events').select(EVENT_COLUMNS).eq(column, id).limit(10)
  if (error) return { error: `Error: ${error.message ?? String(error)}` }
  const rows = (data ?? []) as CachedEvent[]
  const own = rows.find((r) => r.user_id === userId)
  if (own) return { event: own }
  if (rows.length) return { error: "Error: that event is on another household member's calendar. Only they can change it." }
  return { error: `Error: no calendar event with id ${id}. Call symphony_list_events and use the id it returns.` }
}

interface EdgeReply { ok: true; body: Record<string, unknown> }

/** POST to one of the app's calendar edge functions as the caller. */
async function callEdge(ctx: CalendarToolCtx, fn: string, payload: Record<string, unknown>, what: string): Promise<EdgeReply | { ok: false; error: string }> {
  const doFetch = ctx.fetch ?? fetch
  const res = await doFetch(`${ctx.supabaseUrl}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: ctx.authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = {} }
  const message = typeof body.error === 'string' ? body.error : null
  if (!res.ok || message) {
    const reconnect = body.needsReconnect === true || body.errorCode === 'invalid_grant' ||
      /No calendar connection found|invalid_grant|Token has been expired or revoked/i.test(message ?? '')
    if (reconnect) {
      return { ok: false, error: `Error ${what}: the calendar connection needs to be renewed. Ask the person to reconnect their calendar in Settings.` }
    }
    return { ok: false, error: `Error ${what} (${res.status}): ${(message ?? text).slice(0, 300)}` }
  }
  return { ok: true, body }
}

/** The cache is read by symphony_list_events; keep it honest after a write. Best-effort. */
async function patchCache(db: Db, rowId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    await db.from('calendar_events').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', rowId)
  } catch { /* the next calendar sync reconciles */ }
}

const str = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined

// ── symphony_update_calendar_event ────────────────────────────────────

export const UPDATE_CALENDAR_EVENT_TOOL = {
  name: 'symphony_update_calendar_event',
  description:
    "Change an existing event on the person's real calendar (Google or Outlook): rename it, change its time or length, or its location. " +
    'Read the event first with symphony_list_events and pass its id. Change only what was asked; leave every other field out. ' +
    'Moving the start keeps the event\'s length unless end_time or duration_minutes is given. Times without a UTC offset are read as local time. ' +
    'For a repeating event this changes only that one occurrence. The description (notes) and all-day dates cannot be changed here yet.',
  input_schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'the id from symphony_list_events' },
      title: { type: 'string', description: 'new name' },
      start_time: { type: 'string', description: 'new start, ISO8601 with a time, e.g. 2026-07-10T15:00:00 (local when no offset)' },
      end_time: { type: 'string', description: 'new end, ISO8601 with a time' },
      duration_minutes: { type: 'number', description: 'new length in minutes, from the (new or current) start; instead of end_time' },
      location: { type: 'string', description: 'new location; an empty string removes it' },
    },
    required: ['event_id'],
  },
} as const

export async function updateCalendarEvent(db: Db, input: Record<string, unknown>, ctx: CalendarToolCtx): Promise<string> {
  const found = await findEvent(db, ctx.userId, String(input.event_id ?? ''))
  if ('error' in found) return found.error
  const ev = found.event
  const zone = resolveZone(ctx.timeZone)

  const title = str(input.title)?.trim()
  const location = str(input.location)
  const rawStart = str(input.start_time)
  const rawEnd = str(input.end_time)
  const duration = typeof input.duration_minutes === 'number' ? input.duration_minutes : undefined
  const timeChange = rawStart !== undefined || rawEnd !== undefined || duration !== undefined

  if (timeChange && ev.all_day) {
    return 'Error: this is an all-day event, and changing its dates is not supported from the assistant yet. Tell the person to change it in the app.'
  }

  let startTime: string | undefined
  let endTime: string | undefined
  if (rawStart !== undefined) {
    const s = toUtcIso(rawStart, zone)
    if (!s) return `Error: start_time "${rawStart}" needs a date and a time, e.g. 2026-07-10T15:00:00.`
    startTime = s
  }
  if (rawEnd !== undefined) {
    const e = toUtcIso(rawEnd, zone)
    if (!e) return `Error: end_time "${rawEnd}" needs a date and a time, e.g. 2026-07-10T16:00:00.`
    endTime = e
  } else if (duration !== undefined) {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 7 * 24 * 60) return 'Error: duration_minutes must be a positive number of minutes.'
    endTime = new Date(Date.parse(startTime ?? ev.start_time) + Math.round(duration) * 60000).toISOString()
  } else if (startTime) {
    // A moved start keeps the event's length.
    const length = Date.parse(ev.end_time) - Date.parse(ev.start_time)
    endTime = new Date(Date.parse(startTime) + (Number.isFinite(length) && length > 0 ? length : 3600000)).toISOString()
  }
  const effectiveStart = startTime ?? ev.start_time
  if (endTime && Date.parse(endTime) <= Date.parse(effectiveStart)) {
    return 'Error: the event would end before it starts. Check start_time and end_time.'
  }

  const changes: Record<string, unknown> = {}
  if (title && title !== ev.title) changes.title = title
  if (location !== undefined && location !== (ev.location ?? '')) changes.location = location === '' ? null : location
  if (startTime && Date.parse(startTime) !== Date.parse(ev.start_time)) changes.startTime = startTime
  if (endTime && Date.parse(endTime) !== Date.parse(ev.end_time)) changes.endTime = endTime
  if (!Object.keys(changes).length) {
    if (input.description !== undefined) return 'Error: an event\'s description cannot be changed from the assistant yet.'
    return 'Error: nothing to change. Pass only the fields that should be different (title, start_time, end_time, duration_minutes, location).'
  }

  const reply = await callEdge(ctx, 'google-calendar-create-event', {
    eventId: ev.google_event_id,
    calendarId: ev.calendar_id ?? 'primary',
    timeZone: zone,
    ...changes,
  }, 'updating calendar event')
  if (!reply.ok) return reply.error

  const cache: Record<string, unknown> = {}
  if ('title' in changes) cache.title = changes.title
  if ('location' in changes) cache.location = changes.location
  if ('startTime' in changes) cache.start_time = changes.startTime
  if ('endTime' in changes) cache.end_time = changes.endTime
  await patchCache(db, ev.id, cache)

  const shown = (iso: string) => wallClock(iso, zone).slice(0, 16)
  return JSON.stringify({
    id: ev.id,
    updated: true,
    calendar: ev.calendar_name,
    title: (changes.title as string | undefined) ?? ev.title,
    ...(('startTime' in changes || 'endTime' in changes) ? {
      start_local: shown(effectiveStart),
      end_local: shown((changes.endTime as string | undefined) ?? ev.end_time),
      previous_start_local: shown(ev.start_time),
      time_zone: zone,
    } : {}),
    ...('location' in changes ? { location: changes.location, previous_location: ev.location } : {}),
    ...('title' in changes ? { previous_title: ev.title } : {}),
    ...(ev.recurring_event_id ? { note: 'Only this occurrence of the repeating event changed.' } : {}),
    ...(input.description !== undefined ? { not_changed: 'description: it cannot be changed from the assistant yet' } : {}),
  })
}

// ── symphony_move_calendar_event ──────────────────────────────────────

export const MOVE_CALENDAR_EVENT_TOOL = {
  name: 'symphony_move_calendar_event',
  description:
    'Move an existing event to a different calendar of the same Google account (e.g. from a personal calendar to the family one). ' +
    'Read the event first with symphony_list_events and pass its id. Name the destination by calendar name, or by domain for that domain\'s default calendar. ' +
    'Outlook events and events on another account\'s calendar cannot be moved; say so rather than recreating the event. ' +
    'Moving changes nothing else about the event.',
  input_schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'the id from symphony_list_events' },
      calendar: { type: 'string', description: 'destination calendar name (or id), as the person calls it' },
      domain: { type: 'string', enum: ['family', 'personal', 'work'], description: "instead of calendar: that domain's default calendar" },
    },
    required: ['event_id'],
  },
} as const

interface CalendarMapping { calendar_id: string; calendar_name: string | null; domain: string | null; is_default: boolean | null }

export async function moveCalendarEvent(db: Db, input: Record<string, unknown>, ctx: CalendarToolCtx): Promise<string> {
  const wanted = str(input.calendar)?.trim()
  const domain = str(input.domain)?.trim().toLowerCase()
  if (!wanted && !domain) return 'Error: say which calendar to move the event to (calendar or domain).'

  const found = await findEvent(db, ctx.userId, String(input.event_id ?? ''))
  if ('error' in found) return found.error
  const ev = found.event

  const { data, error } = await db.from('calendar_domain_mappings')
    .select('calendar_id, calendar_name, domain, is_default, access_role')
    .eq('user_id', ctx.userId)
    .in('access_role', ['owner', 'writer'])
  if (error) return `Error: ${error.message ?? String(error)}`
  const writable = (data ?? []) as CalendarMapping[]

  let dest: CalendarMapping | undefined
  if (wanted) {
    const low = wanted.toLowerCase()
    dest = writable.find((m) => m.calendar_id === wanted) ??
      writable.find((m) => (m.calendar_name ?? '').trim().toLowerCase() === low) ??
      writable.find((m) => (m.calendar_name ?? '').toLowerCase().includes(low))
  } else {
    const inDomain = writable.filter((m) => (m.domain ?? '').toLowerCase() === domain)
    dest = inDomain.find((m) => m.is_default) ?? inDomain[0]
  }
  if (!dest) {
    const names = [...new Set(writable.map((m) => m.calendar_name).filter(Boolean))]
    return `Error: no writable calendar matches "${wanted ?? domain}". Writable calendars: ${names.length ? names.join(', ') : 'none connected'}.`
  }

  const source = ev.calendar_id ?? 'primary'
  if (dest.calendar_id === source) {
    return JSON.stringify({ id: ev.id, moved: false, note: `"${ev.title}" is already on ${dest.calendar_name ?? 'that calendar'}.` })
  }

  const reply = await callEdge(ctx, 'google-calendar-move-event', {
    eventId: ev.google_event_id,
    sourceCalendarId: source,
    destinationCalendarId: dest.calendar_id,
  }, 'moving calendar event')
  if (!reply.ok) return reply.error

  await patchCache(db, ev.id, { calendar_id: dest.calendar_id, calendar_name: dest.calendar_name })
  return JSON.stringify({
    id: ev.id,
    moved: true,
    title: ev.title,
    from_calendar: ev.calendar_name,
    to_calendar: dest.calendar_name,
  })
}

// ── symphony_delete_calendar_event ────────────────────────────────────

export const DELETE_CALENDAR_EVENT_TOOL = {
  name: 'symphony_delete_calendar_event',
  description:
    "Delete an event from the person's real calendar (Google or Outlook). This is permanent on that calendar and everyone invited sees it go. " +
    'Read the event first with symphony_list_events and pass its id. Unless the person plainly asked to delete this specific event, ' +
    'first confirm in one sentence ("Delete Dentist on Thu 3pm from Family?") and wait for yes. ' +
    'For a repeating event, deletes only that occurrence unless whole_series is true, which deletes every occurrence; only set it when they said so.',
  input_schema: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'the id from symphony_list_events' },
      whole_series: { type: 'boolean', description: 'repeating events only: delete every occurrence, not just this one' },
    },
    required: ['event_id'],
  },
} as const

/** Google recurring instances are "baseId_YYYYMMDDTHHMMSSZ" (useHiddenCalendarEvents.getRecurringBaseId). */
export function recurringBaseId(eventId: string): string {
  const m = eventId.match(/^(.+)_\d{8}T\d{6}Z$/)
  return m ? m[1] : eventId
}

export async function deleteCalendarEvent(db: Db, input: Record<string, unknown>, ctx: CalendarToolCtx): Promise<string> {
  const found = await findEvent(db, ctx.userId, String(input.event_id ?? ''))
  if ('error' in found) return found.error
  const ev = found.event
  const wholeSeries = input.whole_series === true

  const reply = await callEdge(ctx, 'google-calendar-delete-event', {
    eventId: ev.google_event_id,
    calendarId: ev.calendar_id ?? 'primary',
    deleteSeries: wholeSeries,
  }, 'deleting calendar event')
  if (!reply.ok) return reply.error

  // As the app does: a "for discussion" flag on a deleted event is an orphan.
  // A flag is per series, so one skipped occurrence leaves it alone.
  if (wholeSeries || !ev.recurring_event_id) {
    try {
      await db.from('event_discussion_flags').delete()
        .eq('user_id', ctx.userId)
        .eq('google_event_base_id', recurringBaseId(ev.recurring_event_id ?? ev.google_event_id))
    } catch { /* harmless orphan */ }
  }

  return JSON.stringify({
    id: ev.id,
    deleted: true,
    title: ev.title,
    start_local: wallClock(ev.start_time, resolveZone(ctx.timeZone)).slice(0, ev.all_day ? 10 : 16),
    calendar: ev.calendar_name,
    whole_series: reply.body.deletedSeries === true,
  })
}

// ── Recurrence on create ──────────────────────────────────────────────

const WEEKDAYS: Record<string, string> = {
  sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA',
  su: 'SU', mo: 'MO', tu: 'TU', we: 'WE', th: 'TH', fr: 'FR', sa: 'SA',
}
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const
const RRULE_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'COUNT', 'UNTIL', 'WKST', 'BYSETPOS'])

/** Merge into symphony_create_calendar_event's input_schema.properties. */
export const RECURRENCE_SCHEMA_PROPERTIES = {
  recurrence: {
    type: 'object',
    description:
      'Only when the person asked for a repeating event ("every Tuesday", "monthly on the 15th"). start_time is the first occurrence. ' +
      'Omit for a one-off event. Outlook calendars cannot hold every pattern; the error says so.',
    properties: {
      frequency: { type: 'string', enum: [...FREQS] },
      interval: { type: 'number', description: '2 = every other; defaults to 1' },
      days: { type: 'array', items: { type: 'string', enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }, description: 'weekly: which days; defaults to the start day' },
      day_of_month: { type: 'number', description: 'monthly: 1-31, e.g. 15 for "the 15th"' },
      week_of_month: { type: 'number', enum: [1, 2, 3, 4, -1], description: 'monthly: with one day in days, e.g. 2 + tue = second Tuesday; -1 = last' },
      until: { type: 'string', description: 'YYYY-MM-DD last day it can occur' },
      count: { type: 'number', description: 'number of occurrences, instead of until' },
    },
    required: ['frequency'],
  },
} as const

/** A sentence to append to the create tool's description. */
export const RECURRENCE_DESCRIPTION_NOTE =
  ' For a repeating event, pass recurrence; never create the occurrences one by one.'

/**
 * The create body's `recurrence` lines (RFC 5545, as google-calendar-create-event
 * takes them) from the tool's `recurrence` input. `startTime` is the first
 * occurrence in UTC; `timeZone` is the zone the event is written in. Returns
 * `{}` when no recurrence was asked for.
 */
export function recurrenceLines(
  raw: unknown,
  opts: { startTime: string; allDay?: boolean; timeZone?: string | null },
): { recurrence?: string[]; error?: string } {
  if (raw === undefined || raw === null || raw === '') return {}
  // A model that writes the RRULE itself: accept it when its keys are ones Google takes.
  if (typeof raw === 'string') return checkRRule(raw)
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Error: recurrence must be an object with frequency.' }
  const r = raw as Record<string, unknown>
  const freq = String(r.frequency ?? '').toLowerCase()
  if (!(FREQS as readonly string[]).includes(freq)) return { error: 'Error: recurrence.frequency must be daily, weekly, monthly or yearly.' }

  const parts = [`FREQ=${freq.toUpperCase()}`]
  if (r.interval !== undefined) {
    const n = Number(r.interval)
    if (!Number.isInteger(n) || n < 1 || n > 99) return { error: 'Error: recurrence.interval must be a whole number from 1.' }
    if (n > 1) parts.push(`INTERVAL=${n}`)
  }

  const rawDays = Array.isArray(r.days) ? r.days : []
  const days = rawDays.map((d) => WEEKDAYS[String(d).trim().toLowerCase().slice(0, 3)] ?? WEEKDAYS[String(d).trim().toLowerCase().slice(0, 2)])
  if (days.some((d) => !d)) return { error: 'Error: recurrence.days must be weekday names like "mon" or "thu".' }

  if (freq === 'weekly' && days.length) parts.push(`BYDAY=${[...new Set(days)].join(',')}`)
  if (freq === 'monthly') {
    const week = r.week_of_month !== undefined ? Number(r.week_of_month) : undefined
    if (week !== undefined) {
      if (![1, 2, 3, 4, -1].includes(week)) return { error: 'Error: recurrence.week_of_month must be 1-4, or -1 for last.' }
      if (days.length !== 1) return { error: 'Error: recurrence.week_of_month needs exactly one day in days, e.g. ["tue"].' }
      parts.push(`BYDAY=${week}${days[0]}`)
    } else if (r.day_of_month !== undefined) {
      const dom = Number(r.day_of_month)
      if (!Number.isInteger(dom) || dom < 1 || dom > 31) return { error: 'Error: recurrence.day_of_month must be 1-31.' }
      parts.push(`BYMONTHDAY=${dom}`)
    }
  }

  if (r.count !== undefined && r.until !== undefined) return { error: 'Error: recurrence takes until or count, not both.' }
  if (r.count !== undefined) {
    const c = Number(r.count)
    if (!Number.isInteger(c) || c < 1 || c > 730) return { error: 'Error: recurrence.count must be a whole number from 1.' }
    parts.push(`COUNT=${c}`)
  } else if (r.until !== undefined) {
    const until = String(r.until).trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(`${until}T00:00:00Z`))) {
      return { error: 'Error: recurrence.until must be a YYYY-MM-DD date.' }
    }
    if (opts.allDay) {
      parts.push(`UNTIL=${until.replace(/-/g, '')}`)
    } else {
      // RFC 5545: a timed series' UNTIL is UTC. The last occurrence's own start
      // keeps that day in (and Outlook, which reads UTC's date, on the same day
      // for any daytime event).
      const zone = resolveZone(opts.timeZone)
      const clock = wallClock(opts.startTime, zone).slice(11)
      const last = toUtcIso(`${until}T${clock}`, zone)
      if (!last) return { error: 'Error: recurrence.until must be a YYYY-MM-DD date.' }
      parts.push(`UNTIL=${last.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)
    }
  }
  return { recurrence: [`RRULE:${parts.join(';')}`] }
}

function checkRRule(raw: string): { recurrence?: string[]; error?: string } {
  const line = raw.trim().replace(/^RRULE:/i, '')
  const keys = line.split(';').map((p) => p.split('=')[0]?.toUpperCase())
  if (!/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.test(line) || keys.some((k) => !k || !RRULE_KEYS.has(k))) {
    return { error: 'Error: recurrence must be an object like {"frequency":"weekly","days":["tue"]}.' }
  }
  return { recurrence: [`RRULE:${line.toUpperCase()}`] }
}
