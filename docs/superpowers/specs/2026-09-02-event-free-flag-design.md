# "Free" calendar events — design

Date: 2026-09-02 · Status: approved in conversation

## Problem

Some calendar events involve the kids but demand nothing of the parents: the kids
just shift over to them (e.g. FFG on Fridays — nobody drives, packs, or hands off).
Today, the wall, prep suggestions and share nudges treat every event as a parent
commitment. Scott wants a "mark as free" option so such events stay visible but
carry no expectations.

Decision (Scott, 2026-09-02): **informational only** — the event stays on Today and
in the kids' lanes on the wall, rendered as free (dimmed, no check circle, no prep
or handoff expectations), and never counts as a parent commitment. Not hidden.

## Constraint that shapes the design

`event_notes` rows are keyed by `google_event_id`, which for a recurring series is
the **instance** id (`abc_20260904T…`). FFG is weekly; a per-instance flag would
need re-marking every Friday. Every surface already receives the series id
(`recurring_event_id` in the `google-calendar-events` payload; `recurringEventId`
on `CalendarEvent`), and `event_notes` is fully shared within the household (not
scope-gated), so the wall and both phones can read the flag.

## Design

**Storage.** One column: `event_notes.is_free boolean not null default false`.
For a recurring instance the flag lives on a note keyed by the **series id**
(`recurring_event_id`) — a "series note" — so it applies to every occurrence.
One-off events use the instance id as today. Nothing else on `event_notes`
changes; a series note may carry only the flag.

**Resolution (one helper, mirrored on iOS).**
`isEventFree(event, notesMap) = notes[event.id]?.isFree || notes[event.recurringEventId]?.isFree || false`
(instance wins when present, else series). List views must load notes for the
series ids as well as the instance ids (`visibleEventIds` gains the recurring ids).

**Web event panel.** A "Free" pill beside Discuss: pressed state "Free", title
"The kids just show up — no prep, no handoff, nothing for a parent to do."
On a recurring event the toggle writes the series note and the title adds
"Applies to every occurrence." Toggling off writes `is_free=false` on the same
key. Prep-task input and the Complete pill hide while free.

**Today (web `ScheduleItem`).** A free event renders like a skipped row: 60%
opacity, title not struck through, a small "Free" chip in the meta row, no
check circle (not actionable), no swipe-to-complete. It never appears in
prep suggestions (`ProactiveSuggestionChips`), share nudges (`shareNudges`), or
handoff/waiting logic. Grouping and assignee filtering are unchanged.

**Wall (`wall-v2`).** `useWallData` loads `event_notes` rows with `is_free=true`
for the household and stamps `isFree` on the day's event `TimelineItem`s (instance
or series match). `adaptTimelineEvent` passes `free: true`; the Gantt bar and
schedule-band card render at reduced opacity with a "Free" chip and no touch
checkbox. Lane attribution (`wallEventAttribution`) is untouched — the event
stays in whichever kid lanes the title names.

**iOS.** `GoogleCalendarEvent` decodes `recurring_event_id`; `TimelineItem` gains
`recurringEventId` and `isFree`; `TimelineViewModel` resolves the flag from the
synced `EventNote`s (instance, then series). `EventNote` gains `isFree`
(pulled and pushed). `EventDetailView` gets a "Free" toggle that writes the series
note when the event is recurring. `TimelineItemCard` renders a free event
dimmed with a "Free" pill and no check circle; left-swipe complete is disabled
for it.

**Not in scope.** Hiding free events from parents; a per-occurrence override on a
free series; agent/MCP awareness of the flag.

## Testing

Web: resolver unit test (instance vs series precedence, absent → false);
`ScheduleItem` renders the Free chip and no checkbox; `shareNudges` and
prep-suggestion filters skip free events; `visibleEventIds` includes series ids;
wall adapter maps `isFree` → `free`. iOS: resolver test in
`TimelineEnrichmentTests`; serialization test for `is_free`; screenshot of a
free row.

## Rollout

The migration is a one-line `ALTER TABLE`; the Management API DDL call is
blocked for Claude in this environment, so Scott runs it (command in the plan).
Web ships on push to `main`; iOS on `ios-sliders` after the current follow-up.
