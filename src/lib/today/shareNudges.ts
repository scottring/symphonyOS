// src/lib/today/shareNudges.ts
import { useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { TaskContext } from '@/types/task'
import { resolveEventContext } from './eventContext'
import { isFamilyHours } from '@/lib/workingHours'

export interface ShareNudge {
  eventId: string
  title: string
  context: 'work' | 'personal'
}

type DomainResolver = (calendarId?: string, calendarName?: string) => TaskContext | null

/**
 * Pure: which of these events should prompt "add to the family timeline?".
 * A work/personal, timed event during family hours that isn't already shared
 * or dismissed.
 */
export function computeShareNudges(
  events: CalendarEvent[],
  eventNotesMap: Map<string, EventNote> | undefined,
  eventContextOverrides: Map<string, TaskContext> | undefined,
  getDomainForCalendar: DomainResolver | undefined,
): ShareNudge[] {
  const nudges: ShareNudge[] = []
  for (const event of events) {
    const allDay = event.all_day ?? event.allDay ?? false
    if (allDay) continue
    const startStr = event.start_time || event.startTime
    if (!startStr) continue

    const context = resolveEventContext(event, eventContextOverrides, getDomainForCalendar)
    if (context !== 'work' && context !== 'personal') continue
    if (!isFamilyHours(new Date(startStr))) continue

    const eventId = event.google_event_id || event.id
    const note = eventNotesMap?.get(eventId)
    if (note?.sharedWithFamily) continue
    if (note?.shareNudgeDismissed) continue

    nudges.push({ eventId, title: event.title, context })
  }
  return nudges
}

/** Memoized hook wrapper for use in components. */
export function useShareToFamilyNudges(
  events: CalendarEvent[],
  eventNotesMap: Map<string, EventNote> | undefined,
  eventContextOverrides: Map<string, TaskContext> | undefined,
  getDomainForCalendar: DomainResolver | undefined,
): ShareNudge[] {
  return useMemo(
    () => computeShareNudges(events, eventNotesMap, eventContextOverrides, getDomainForCalendar),
    [events, eventNotesMap, eventContextOverrides, getDomainForCalendar],
  )
}
