# Share work/personal events to the family timeline — AI nudge

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation plan
**Scope:** Single user (Scott's own events). Surface: inline in Today.

## Problem

Work and personal calendar events are private by default — they don't appear on
the shared family timeline (the in-app family domain view or the wall/kiosk).
But a work or personal event that lands **during family time** (a 7pm client
dinner, a Saturday work call) directly affects the household: Iris needs to know
Scott is busy so she can plan around it.

Today the only way to surface such an event to the family is to re-tag it as
`family` (which removes it from the work view) or to leave it hidden. There is no
gentle, contextual prompt to share it.

## Solution

A proactive, AI-style **nudge**: when one of Scott's events resolves to `work` or
`personal` context **and** starts during **family hours**, surface an inline
prompt on the event in Today:

> "This work event lands during family time — add it to the shared family timeline?"

with two actions: **Add** and **Not now**. Accepting surfaces the event on the
family timeline while keeping it in the work/personal view. Dismissing remembers
the choice so it never nags again for that event.

## Non-goals (v1)

- No automatic/silent sharing — every share is an explicit one-tap accept.
- No other household members' events (single-user for now).
- No Daily Briefing / assistant integration — the nudge lives inline in Today only.
- No settings UI for working hours — ships with a sensible default constant.
- No per-event title masking — shared events show their real title.
- No engine (`proactive-engine`) changes — detection is entirely client-side.

## Architecture

The feature is one bounded, self-contained unit: a migration, a small lib, one
hook, one shared predicate, and a render hook-in. It does **not** touch the
`proactive-engine` edge function or the `proactive_suggestions` table.

### 1. Data model — `event_notes` gains two booleans

`event_notes` already stores per-event overrides (context, assignedTo) keyed by
event id, and the client already reads/writes it via `useEventNotes`. Add:

| Column | Type | Default | Meaning |
|--------|------|---------|---------|
| `shared_with_family` | `boolean` | `false` | Event is surfaced on the family timeline. Set by **Add**. |
| `share_nudge_dismissed` | `boolean` | `false` | Nudge dismissed for this event. Set by **Not now**. |

Migration: new file under `supabase/migrations/`. Apply to prod via the
Management API (migration history is out of sync — see CLAUDE/memory notes).

`useEventNotes` (`src/hooks/useEventNotes.ts`) gains both fields in its row type,
the mapped object, and an upsert path so the UI can set them.

### 2. Working hours / family hours — `src/lib/workingHours.ts` (new)

Single source of truth. A pure module:

```ts
// Default working window. Editable later via settings; v1 is a constant.
export const WORKING_HOURS = {
  days: [1, 2, 3, 4, 5],      // Mon–Fri (0 = Sun)
  startHour: 9, startMinute: 0,
  endHour: 17, endMinute: 30, // 5:30pm
}

/** True when `date` is inside the working window. */
export function isWorkingHours(date: Date): boolean

/** Family hours = the complement of working hours. */
export function isFamilyHours(date: Date): boolean  // = !isWorkingHours(date)
```

`isFamilyHours` is what the detection uses. Keeping working hours as the source
of truth (rather than defining family hours directly) makes a future settings
editor a single concept to expose.

### 3. Family-view inclusion — `isEventVisibleToFamily` helper

Today the family view includes an event when its resolved context is `family` or
untagged (`null`). Add one shared predicate so "shared" events also qualify:

```ts
// e.g. src/lib/today/eventVisibility.ts
export function isEventVisibleToFamily(
  resolvedContext: TaskContext | null,
  sharedWithFamily: boolean,
): boolean {
  return resolvedContext === 'family' || resolvedContext == null || sharedWithFamily
}
```

Wire it into **both** places that currently gate family-domain events:
- `HomeView.tsx` family-domain filter (`filteredEvents`, ~line 120–131).
- The wall's event filtering path (`useWallData.ts` / wall components).

This is the entire "it now appears on the shared timeline" mechanic.

### 4. Detection — `useShareToFamilyNudges` (new hook)

Derives nudges **in memory** from the events Today already has — no DB writes for
detection, no `proactive_suggestions` rows.

Input: the timed events in view, the event-notes map, and `getDomainForCalendar`
(to resolve context the same way the rest of the app does, via
`resolveEventContext`).

An event qualifies for a nudge when **all** hold:
1. Resolved context is `work` or `personal` (not `family`, not untagged).
2. The event is **timed** (skip all-day events — no meaningful start time).
3. `isFamilyHours(event.start)` is true.
4. `shared_with_family` is false.
5. `share_nudge_dismissed` is false.

Output: a list of nudge descriptors keyed by event id (title + which context),
plus `onAdd(eventId)` and `onDismiss(eventId)` callbacks that upsert the
respective `event_notes` flag.

### 5. Surface + actions

Render the nudge **inline on the event** in Today, reusing the existing
`ProactiveSuggestionChips` visual treatment for consistency (constructed from the
in-memory descriptor; not fetched from `proactive_suggestions`).

- **Add** → `useEventNotes` upsert `shared_with_family = true`. The event
  immediately passes `isEventVisibleToFamily`, so it appears on the family view /
  wall with its real title. The nudge disappears (it no longer qualifies).
- **Not now** → upsert `share_nudge_dismissed = true`. Nudge gone, never returns
  for that event.

## Data flow

```
Google events ──► resolveEventContext (existing) ──► context (work/personal/family/null)
                                                          │
event_notes (shared_with_family, share_nudge_dismissed) ──┤
                                                          ▼
                              useShareToFamilyNudges  ──► inline nudge in Today
                                   (isFamilyHours)          │  Add        │ Not now
                                                            ▼             ▼
                                          event_notes.shared_with_family  share_nudge_dismissed
                                                            │
                                                            ▼
                              isEventVisibleToFamily ──► family view + wall include it
```

## Edge cases

- **All-day events:** skipped (no start time to test against family hours).
- **Untagged events:** already visible to the family view (`null` passes the
  predicate); no nudge.
- **Recurring events:** handled per instance — `event_notes` is keyed by the
  instance/event id, so sharing one occurrence does not share the series. Accepted
  for v1.
- **Event re-tagged to `family` after sharing:** still visible (predicate
  short-circuits on `family`); the `shared_with_family` flag is harmless.
- **Timezone / DST:** `isFamilyHours` reads local wall-clock hours from the
  event's start `Date`, consistent with how the app already buckets times.

## Testing

- `lib/workingHours.ts`
  - weekday 08:59 → family hours; 09:00 → working hours; 17:29 → working; 17:30 → family.
  - Saturday/Sunday any time → family hours.
- `useShareToFamilyNudges`
  - work event at 19:00 weekday → nudge.
  - personal event at 19:00 weekday → nudge.
  - work event at 10:00 weekday → no nudge (working hours).
  - family-tagged event in family hours → no nudge.
  - all-day work event → no nudge.
  - already `shared_with_family` → no nudge.
  - already `share_nudge_dismissed` → no nudge.
- `isEventVisibleToFamily`
  - shared work event → included.
  - private (unshared, undismissed) work event → excluded.
  - family/untagged → included.

## Risks / open points

- **Working-hours persistence:** v1 is a constant, so no cross-device sync issue.
  When a settings editor is added, decide where it persists (user settings row vs
  localStorage) so the wall and phone agree.
- **Migration application:** migration history is out of sync; apply via the
  Supabase Management API and confirm the columns exist in prod before shipping
  the client read path.
