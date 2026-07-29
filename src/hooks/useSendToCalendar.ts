import { useCallback, useRef, useState } from 'react'
import { useGoogleCalendar, CalendarReconnectError } from '@/hooks/useGoogleCalendar'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import type { Task } from '@/types/task'

export interface SendToCalendarWhen {
  start: Date
  /** Minutes. Defaults to 60. Ignored when `allDay` is true. */
  durationMinutes?: number
  allDay?: boolean
}

/** `busy` is not an error: another send is still in flight on this hook
 *  instance. It is separate from `failed` so callers don't tell the user
 *  something went wrong with Google when nothing did. */
export type SendFailureReason = 'read-only' | 'not-connected' | 'failed' | 'busy'

export type SendToCalendarResult =
  | { ok: true; eventId: string; calendarId?: string; calendarName: string }
  | { ok: false; reason: SendFailureReason }

const DEFAULT_DURATION_MINUTES = 60
const ONE_HOUR_MS = 60 * 60 * 1000

/** The task is destroyed by the conversion, so its rich context moves into the
 *  event body — the one place Google will still show it. */
export function buildEventDescription(task: Task): string | undefined {
  const parts: string[] = []
  if (task.notes?.trim()) parts.push(task.notes.trim())
  if (task.phoneNumber?.trim()) parts.push(`Phone: ${task.phoneNumber.trim()}`)
  if (task.links?.length) {
    parts.push(task.links.map((l) => (l.title ? `${l.title}: ${l.url}` : l.url)).join('\n'))
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/** A Google 403 arrives as a FunctionsHttpError whose `context` is the raw
 *  Response — the edge function forwards Google's status verbatim
 *  (google-calendar-create-event/index.ts:418). */
function classifyFailure(err: unknown): SendFailureReason {
  if (err instanceof CalendarReconnectError) return 'not-connected'
  const context = (err as { context?: { status?: number } })?.context
  if (context?.status === 403) return 'read-only'
  return 'failed'
}

export function useSendToCalendar(deleteTask: (id: string) => void | Promise<void>) {
  const { isConnected, createEvent, deleteEvent, defaultCalendarId } = useGoogleCalendar()
  const { getCalendarForDomain, mappings } = useCalendarDomainMappings()

  const [sendingTaskId, setSendingTaskId] = useState<string | null>(null)
  // Ref, not state: a double-tap fires both handlers in the same tick, before
  // any re-render could reflect the state change.
  const inFlight = useRef(false)

  const sendToCalendar = useCallback(
    async (task: Task, when: SendToCalendarWhen): Promise<SendToCalendarResult> => {
      if (!isConnected) return { ok: false, reason: 'not-connected' }
      if (inFlight.current) return { ok: false, reason: 'busy' }

      inFlight.current = true
      setSendingTaskId(task.id)

      const target = getCalendarForDomain(task.context)
      // The edge function picks the destination itself —
      //   `calendarId || connection.calendar_id || 'primary'`
      // (google-calendar-create-event/index.ts:274) — and its response says only
      // `eventId`/`htmlLink`, never which calendar it chose. So mirror that
      // precedence here: without this, an untagged task (no domain mapping) sent
      // `calendarId: undefined`, landed on the user's chosen default write
      // calendar, and Undo then deleted from 'primary' — where the event does not
      // exist — leaving a real orphaned event behind.
      const resolvedCalendarId = target?.calendarId ?? defaultCalendarId ?? undefined
      // Name it from data already in hand. When the resolved calendar is one the
      // user has mapped to a domain we know its real name, so the toast can say
      // where the item actually went instead of the vague 'your calendar'.
      // Naming an unmapped default would need a fetchCalendarList round-trip on
      // the send path, which isn't worth a toast label.
      const resolvedCalendarName =
        target?.calendarName ??
        (resolvedCalendarId
          ? mappings.find((m) => m.calendarId === resolvedCalendarId)?.calendarName
          : undefined) ??
        'your calendar'
      const start = when.start
      // All-day end is INCLUSIVE here, not exclusive: the edge function takes
      // endTime's date as the event's last day and adds the day Google's
      // exclusive `end.date` needs itself
      // (google-calendar-create-event/index.ts:329-339). An end 24h out
      // therefore rendered a two-day banner. Staying on the start's own day —
      // the same +1h the only other allDay caller uses
      // (HomeViewContainer.tsx:375-380) — yields a single-day event.
      const end = when.allDay
        ? new Date(start.getTime() + ONE_HOUR_MS)
        : new Date(start.getTime() + (when.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60000)

      try {
        const created = await createEvent({
          title: task.title,
          description: buildEventDescription(task),
          startTime: start,
          endTime: end,
          allDay: when.allDay,
          location: task.location,
          calendarId: resolvedCalendarId,
        })

        // Only now is it safe to destroy the task.
        await deleteTask(task.id)

        return {
          ok: true,
          eventId: created.id,
          calendarId: resolvedCalendarId,
          calendarName: resolvedCalendarName,
        }
      } catch (err) {
        console.error('Failed to send task to calendar:', err)
        return { ok: false, reason: classifyFailure(err) }
      } finally {
        inFlight.current = false
        setSendingTaskId(null)
      }
    },
    [isConnected, createEvent, getCalendarForDomain, defaultCalendarId, mappings, deleteTask],
  )

  /** Resolves `false` when the event could NOT be removed. A swallowed failure
   *  looks identical to a clean undo while a real event stays on the user's
   *  calendar, so the outcome has to reach the caller — the restored task alone
   *  is not the whole story. */
  const undoSend = useCallback(
    async (eventId: string, calendarId?: string): Promise<boolean> => {
      try {
        await deleteEvent({ eventId, calendarId })
        return true
      } catch (err) {
        console.error('Failed to remove the event during undo:', err)
        return false
      }
    },
    [deleteEvent],
  )

  return { sendToCalendar, undoSend, sendingTaskId }
}
