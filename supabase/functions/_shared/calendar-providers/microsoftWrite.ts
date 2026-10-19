/**
 * Writing to Outlook / Microsoft 365 calendars through Microsoft Graph
 * (2026-10-19): create, edit, delete. The request shapes are the ones the
 * Google write functions already take, so callers never branch on provider —
 * the function picks the account that owns the calendar (writeConnection.ts)
 * and, for an Outlook account, comes here.
 *
 * Two Graph differences shape this file:
 *   - times are wall-clock in a named zone, not instants: a weekly 9am series
 *     must be written in the person's zone or it drifts an hour at DST;
 *   - a series is a structured pattern, not RFC 5545 lines, so the RRULEs
 *     Symphony makes (src/lib/quickRecurrence.ts) are translated, and any rule
 *     outside that set is refused rather than approximated.
 * Graph has no "move between calendars" for events; that stays Google-only.
 */
import { GRAPH_BASE } from './microsoft.ts'

/** Graph-side failure, carried back to the caller as `{ error, statusCode }`. */
export class GraphWriteError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'GraphWriteError'
  }
}

/** Whether a Microsoft granted-scope string lets Symphony write calendars. */
export function grantsGraphWrite(granted: string | null | undefined): boolean {
  if (typeof granted !== 'string') return false
  // Microsoft returns Graph scopes bare ("Calendars.ReadWrite") or as URLs.
  return granted.split(/\s+/).some((s) => /(^|\/)Calendars\.ReadWrite(\.Shared)?$/i.test(s))
}

/** "YYYY-MM-DDTHH:mm:ss" wall-clock time of an instant in an IANA zone. */
export function wallClock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

function validZone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const GRAPH_DAYS: Record<string, string> = {
  SU: 'sunday', MO: 'monday', TU: 'tuesday', WE: 'wednesday', TH: 'thursday', FR: 'friday', SA: 'saturday',
}
const GRAPH_INDEX: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'last', '-1': 'last' }
const WEEKDAY_OF = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface GraphRecurrence {
  pattern: Record<string, unknown>
  range: Record<string, unknown>
}

/**
 * RFC 5545 lines → Graph patternedRecurrence, or null when Graph cannot hold
 * the rule exactly. `startDate` is the first occurrence's local date.
 */
export function rruleToGraphRecurrence(lines: string[], startDate: string): GraphRecurrence | null {
  if (lines.length !== 1 || !lines[0].startsWith('RRULE:')) return null
  const rule: Record<string, string> = {}
  for (const part of lines[0].slice('RRULE:'.length).split(';')) {
    const [key, value] = part.split('=')
    if (!key || value === undefined) return null
    rule[key.toUpperCase()] = value.toUpperCase()
  }
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'COUNT', 'UNTIL', 'WKST'])
  if (Object.keys(rule).some((k) => !known.has(k))) return null

  const interval = rule.INTERVAL ? Number(rule.INTERVAL) : 1
  if (!Number.isInteger(interval) || interval < 1) return null
  const start = new Date(`${startDate}T00:00:00Z`)
  const byDay = rule.BYDAY ? rule.BYDAY.split(',') : []

  let pattern: Record<string, unknown>
  switch (rule.FREQ) {
    case 'DAILY':
      if (byDay.length || rule.BYMONTHDAY) return null
      pattern = { type: 'daily', interval }
      break
    case 'WEEKLY': {
      if (rule.BYMONTHDAY) return null
      const days = byDay.length ? byDay.map((d) => GRAPH_DAYS[d]) : [WEEKDAY_OF[start.getUTCDay()]]
      if (days.some((d) => !d)) return null
      pattern = { type: 'weekly', interval, daysOfWeek: days, firstDayOfWeek: 'sunday' }
      break
    }
    case 'MONTHLY': {
      if (byDay.length > 1 || (byDay.length && rule.BYMONTHDAY)) return null
      if (byDay.length === 1) {
        const m = /^(-1|[1-5])([A-Z]{2})$/.exec(byDay[0])
        if (!m || !GRAPH_DAYS[m[2]]) return null
        pattern = { type: 'relativeMonthly', interval, daysOfWeek: [GRAPH_DAYS[m[2]]], index: GRAPH_INDEX[m[1]] }
      } else {
        const day = rule.BYMONTHDAY ? Number(rule.BYMONTHDAY) : start.getUTCDate()
        if (!Number.isInteger(day) || day < 1 || day > 31) return null
        pattern = { type: 'absoluteMonthly', interval, dayOfMonth: day }
      }
      break
    }
    case 'YEARLY':
      if (byDay.length || rule.BYMONTHDAY) return null
      pattern = { type: 'absoluteYearly', interval, dayOfMonth: start.getUTCDate(), month: start.getUTCMonth() + 1 }
      break
    default:
      return null
  }

  let range: Record<string, unknown> = { type: 'noEnd', startDate }
  if (rule.COUNT) {
    const count = Number(rule.COUNT)
    if (!Number.isInteger(count) || count < 1) return null
    range = { type: 'numbered', startDate, numberOfOccurrences: count }
  } else if (rule.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(rule.UNTIL)
    if (!m) return null
    range = { type: 'endDate', startDate, endDate: `${m[1]}-${m[2]}-${m[3]}` }
  }
  return { pattern, range }
}

export interface GraphCreateInput {
  calendarId: string
  title: string
  description?: string
  startTime: string
  endTime: string
  location?: string
  allDay?: boolean
  timeZone?: string
  requestId?: string
  recurrence?: string[]
}

/** The Graph event body for a create, or an error message when the request cannot be expressed. */
export function buildGraphEvent(input: GraphCreateInput): { body: Record<string, unknown> } | { error: string } {
  const zone = validZone(input.timeZone)
  const body: Record<string, unknown> = { subject: input.title }
  if (input.description) body.body = { contentType: 'text', content: input.description }
  if (input.location) body.location = { displayName: input.location }
  // Graph's own idempotency key: a retried POST with the same id makes no second event.
  if (input.requestId) body.transactionId = input.requestId

  let firstDate: string
  if (input.allDay) {
    // Same day arithmetic as the Google path: the dates as sent, end inclusive.
    firstDate = input.startTime.split('T')[0]
    const lastDate = input.endTime.split('T')[0]
    body.isAllDay = true
    body.start = { dateTime: `${firstDate}T00:00:00`, timeZone: zone }
    body.end = { dateTime: `${addDays(lastDate, 1)}T00:00:00`, timeZone: zone }
  } else {
    const start = wallClock(input.startTime, zone)
    firstDate = start.slice(0, 10)
    body.start = { dateTime: start, timeZone: zone }
    body.end = { dateTime: wallClock(input.endTime, zone), timeZone: zone }
  }

  if (Array.isArray(input.recurrence) && input.recurrence.length > 0) {
    const recurrence = rruleToGraphRecurrence(input.recurrence, firstDate)
    if (!recurrence) return { error: 'Outlook cannot repeat an event on this pattern. Create it on a Google calendar, or as a single event.' }
    body.recurrence = recurrence
  }
  return { body }
}

async function graphError(res: Response, fallback: string): Promise<GraphWriteError> {
  const text = await res.text().catch(() => '')
  let message = fallback
  try {
    message = JSON.parse(text)?.error?.message || fallback
  } catch {
    if (text) message = text.length > 200 ? `${text.slice(0, 200)}...` : text
  }
  return new GraphWriteError(message, res.status)
}

function eventsUrl(calendarId: string): string {
  // 'primary' is Google's word for the account's own calendar; Graph's is /me/events.
  return calendarId && calendarId !== 'primary'
    ? `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/events`
    : `${GRAPH_BASE}/me/events`
}

export async function graphCreateEvent(
  accessToken: string,
  input: GraphCreateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ eventId: string; htmlLink: string | null }> {
  const built = buildGraphEvent(input)
  if ('error' in built) throw new GraphWriteError(built.error, 400)
  const res = await fetchImpl(eventsUrl(input.calendarId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(built.body),
  })
  if (!res.ok) throw await graphError(res, 'Failed to create event')
  const data = await res.json()
  return { eventId: data.id, htmlLink: data.webLink ?? null }
}

export interface GraphUpdateInput {
  title?: string
  location?: string | null
  startTime?: string
  endTime?: string
  timeZone?: string
}

export function buildGraphPatch(input: GraphUpdateInput): Record<string, unknown> {
  const zone = validZone(input.timeZone)
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined && input.title.trim() !== '') patch.subject = input.title.trim()
  if (input.location !== undefined) patch.location = { displayName: input.location ?? '' }
  if (input.startTime) patch.start = { dateTime: wallClock(input.startTime, zone), timeZone: zone }
  if (input.endTime) patch.end = { dateTime: wallClock(input.endTime, zone), timeZone: zone }
  return patch
}

/** Graph event ids are unique within the mailbox, so no calendar is needed. */
export async function graphUpdateEvent(
  accessToken: string,
  eventId: string,
  input: GraphUpdateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ eventId: string; location: string | null; htmlLink: string | null }> {
  const patch = buildGraphPatch(input)
  if (Object.keys(patch).length === 0) throw new GraphWriteError('No fields to update', 400)
  const res = await fetchImpl(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw await graphError(res, 'Failed to update event')
  const data = await res.json()
  return { eventId: data.id, location: data.location?.displayName || null, htmlLink: data.webLink ?? null }
}

/** Delete one occurrence, or its whole series. Returns the id actually deleted. */
export async function graphDeleteEvent(
  accessToken: string,
  eventId: string,
  deleteSeries: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  let target = eventId
  if (deleteSeries) {
    const res = await fetchImpl(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}?$select=seriesMasterId,type`, { headers })
    if (!res.ok) throw await graphError(res, 'Could not load event to delete series')
    const data = await res.json()
    target = data.seriesMasterId || eventId
  }
  const res = await fetchImpl(`${GRAPH_BASE}/me/events/${encodeURIComponent(target)}`, { method: 'DELETE', headers })
  // 404: already gone — a delete is idempotent, as Google's 410 is treated.
  if (!res.ok && res.status !== 404) throw await graphError(res, 'Failed to delete event')
  return target
}
