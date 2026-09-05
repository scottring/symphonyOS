# Per-calendar visibility toggle

**Date:** 2026-06-02
**Status:** Approved (design)

## Problem

Deleting a calendar event on a **read-only** Google calendar fails with a 403
"Forbidden" (you can't delete from a calendar you don't own). Confirmed root
cause for the reported bug: a junk "(No title)" recurring event lives on
`scott.kaufman@stacksdata.com`, which Google reports as `reader` for the
connected account. The OAuth scope is full read-write — the delete genuinely
can't succeed, and the app shows a cryptic "Forbidden."

Several of the user's synced calendars are read-only (Holidays, a stacksdata
mirror, a work-schedule subscription, SportsEngine). They clutter Symphony with
events the user can't act on. The user wants to **turn a calendar off** entirely.

## Decision

Add a **per-calendar on/off visibility toggle** in Settings. "Off" hides that
calendar's events **everywhere** in Symphony (Today, Week, Month, and the wall) —
without touching Google. (Chosen over per-event hide, which already exists for
single events but doesn't address whole-calendar noise, and over a raw error
message.)

## Architecture

### Persistence
New table `public.hidden_calendars (user_id uuid, calendar_id text, created_at,
pk (user_id, calendar_id))` with RLS (`auth.uid() = user_id`). Already created.
Mirrors the existing `hidden_calendar_events` pattern.

### Global filter (the key choice)
Per-**event** hiding lives in `useScheduleFiltering`, which only feeds Today/Week
— so it misses the wall. To make "off" mean off **everywhere**, filter hidden
**calendars** at the single global choke point: the `GoogleCalendarProvider`'s
exposed `events`. Every surface reads `events` from this context, so one filter
covers all of them.

`GoogleCalendarProvider`:
- Loads the user's hidden calendar IDs on mount into `hiddenCalendarIds: Set<string>`.
- Exposes `events` already filtered: drop any event whose `calendar_id`/`calendarId`
  is in `hiddenCalendarIds`.
- Adds to context:
  - `hiddenCalendarIds: Set<string>`
  - `setCalendarHidden(calendarId: string, hidden: boolean): Promise<void>` —
    optimistic local update + upsert/delete the DB row.

### Settings UI
- `CalendarVisibilityList` (presentational): props `{ calendars: GoogleCalendarInfo[],
  hiddenIds: Set<string>, onSetHidden: (id, hidden) => void }`. One row per
  calendar: name, a **read-only** badge when `accessRole === 'reader'`, and an
  on/off toggle (on = visible, off = hidden).
- `CalendarSettings` wires it: `fetchCalendarList()` on mount for the calendar
  list; `hiddenCalendarIds` + `setCalendarHidden` from `useGoogleCalendar()`.

## Components touched
- `supabase` DB: `hidden_calendars` table (done).
- `src/hooks/useGoogleCalendar.tsx` — load hidden set, filter exposed events, add
  `hiddenCalendarIds` + `setCalendarHidden`.
- `src/components/settings/CalendarVisibilityList.tsx` — new presentational list.
- `src/components/settings/CalendarSettings.tsx` — fetch list + render the toggle list.

## Testing
- `CalendarVisibilityList` (TDD): renders a row per calendar; toggle reflects
  hidden state; clicking calls `onSetHidden(id, true/false)`; read-only calendars
  show the badge.
- A pure filter is trivial (`!hiddenIds.has(calId)`) and covered via the provider
  wiring + typecheck.

## Out of scope
- Changing per-event hide (`hidden_calendar_events`) — untouched; composes fine.
- Deleting read-only events via Google (impossible).
- Reducing egress from polling hidden calendars (filter is client-side).
