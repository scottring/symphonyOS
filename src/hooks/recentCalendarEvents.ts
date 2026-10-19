// src/hooks/recentCalendarEvents.ts
//
// Event reads, shared for a moment (2026-10-18). Home and Today both ask for
// today; moving between them asked Google twice within seconds. A read that
// answered in the last RECENT_EVENTS_MS answers the same window again
// (GoogleCalendarProvider.fetchEvents; one still in the air is shared there
// too). Keyed by account, window and domain; dropped whenever the app writes
// to the calendar, so a write is never followed by its old answer.

import { onCalendarChanged } from '@/lib/calendarChangedSignal'
import type { CalendarEvent } from './useGoogleCalendar'

export const RECENT_EVENTS_MS = 30_000

type Answer = { events?: CalendarEvent[]; calendarListMissing?: boolean }
const recent = new Map<string, { at: number; data: Answer }>()

if (typeof window !== 'undefined') onCalendarChanged(() => recent.clear())

export function recentEventsFor(key: string): { at: number; data: Answer } | undefined {
  return recent.get(key)
}

export function rememberEvents(key: string, data: Answer): void {
  recent.set(key, { at: Date.now(), data })
}

/** Test seam — the map is module state. */
export function __resetRecentEvents(): void {
  recent.clear()
}
