# iOS Calendar Event Detail Card — Design

**Date:** 2026-07-12
**Branch:** `ios-sliders`
**Status:** Approved design, ready for implementation plan

## Problem

On the iOS app, calendar events on the Today timeline cannot be opened or acted
on the way tasks can. Tasks reveal a right-swipe action set (Push / Context /
More) where "More" opens a full detail card (`TaskDetailView`). Events have no
detail card at all: their `fetchTask()` returns `nil`, and on builds ≤ 104 they
had **no swipe actions whatsoever** (the `.event` case was only added to
`slideActions` in commit `a7accccd`, build 105), so a right-swipe did nothing —
matching Scott's report that "you cannot swipe right to edit or do anything on
calendar events, other types work."

Scott wants events to have **the same detail card experience as tasks**: swipe →
open a card → attach context (notes, links, photos).

## Goal

Give calendar-event rows a detail card, opened via a right-swipe **Details**
action, that lets the user view the event and attach Symphony context to it —
notes, links, and photos — persisted to the same storage the web already uses so
everything round-trips across devices. No write-back to Google Calendar (the
event's title/time/location stay read-only).

## Non-goals

- Editing the Google event itself (title, time, location) or writing back to
  Google Calendar. (Write-back hits Google-permission 403s on read-only shared
  work calendars and is out of scope.)
- Tap-to-open on event rows. The card opens via swipe → **Details** only, exact
  parity with how task rows open their detail today.
- Any change to task rows' existing behavior.
- Event context fields beyond notes/links/photos (assignment, project link,
  share-to-family, recipe detection). The `EventNote` model will *carry* those
  columns for round-trip safety but the card will not surface editors for them
  in this iteration.

## Data model (already exists server-side)

The web stores event context in two places, both keyed by the Google event id:

**`event_notes` table** (one row per user per event):

| column | type | this card |
|---|---|---|
| `id` | uuid | pk |
| `user_id` | uuid | owner |
| `google_event_id` | text | natural key (with user_id) |
| `notes` | text | **edited** (Notes field) |
| `links` | jsonb | **edited** (Links section) — array of `{url, title?}` |
| `event_title` | text | stored for display; set on create |
| `event_start_time` | timestamptz | stored for display; set on create |
| `context` | text | preserved, not surfaced |
| `shared_with_family` | boolean | preserved, not surfaced |
| `share_nudge_dismissed` | boolean | preserved, not surfaced |
| `assigned_to` | uuid | preserved, not surfaced |
| `assigned_to_all` | uuid[] | preserved, not surfaced |
| `recipe_url` | text | preserved, not surfaced |
| `project_id` | uuid | preserved, not surfaced |
| `created_at` / `updated_at` | timestamptz | timestamps |

**`attachments` table** (photos): `entity_type = 'event_note'`,
`entity_id = <google_event_id lowercased>`. Same table and storage bucket the
iOS `TaskAttachmentsSection` already uses for tasks (`entity_type = 'task'`).

No migrations required — the schema is live in prod.

## Architecture

Four units, each independently testable.

### 1. `EventNote` SwiftData model + sync

New model `Models/EventNote.swift` mirroring **every** `event_notes` column
(see table above). Links stored as `[TaskLink]` (the existing `{url, title}`
type), (de)serialized to/from the `links` jsonb.

Sync wiring, following the existing `ActionableInstance` pattern (the other
natural-key, per-occurrence model):

- **RowMapper** — add `event_notes` row ↔ `EventNote` mapping (both directions).
- **SyncEngine pull** — include `event_notes` in the tables pulled for the user;
  reconcile by `id`, but the *push* upserts on the natural key
  `(user_id, google_event_id)` so a note created on another device doesn't
  duplicate.
- **SyncEngine push serializer** — emit the **exact** `event_notes` column set.
  This is load-bearing: iOS has previously dropped every write of a table by
  sending a phantom column (`abb8ab3e`), so the serializer column set is locked
  by a test (below).
- **Realtime** — `event_notes` is already in the Supabase realtime publication
  (added for the web); subscribe so web edits appear on iOS live.

### 2. Generalize the attachments section

`Views/Task/TaskAttachmentsSection.swift` is hardcoded to `entity_type = 'task'`
and takes a `taskId: UUID`. Parametrize it to `(entityType: String, entityId:
String)` (entityId already lowercased by the caller), so:

- Tasks call it with `("task", task.id.uuidString.lowercased())` — unchanged
  behavior.
- Events call it with `("event_note", googleEventId.lowercased())`.

Upload path writes the given `entity_type`/`entity_id`. Everything else (image
JPEG conversion, signed-URL load, hover-✕ remove) is unchanged.

### 3. `EventDetailView`

New `Views/Event/EventDetailView.swift`, styled to match `TaskDetailView`:

- **Header** (read-only): event title, time string, location (with a maps/open
  affordance reusing `TaskDetailView`'s `openLocation`).
- **Notes**: `TextEditor` bound to the `EventNote.notes`, `markDirty()` on
  change (same debounce/save pattern as tasks).
- **Links**: add-link input + list with remove, bound to `EventNote.links`
  (reuse `TaskDetailView`'s `addLink`/`removeLink`/`openURL` logic).
- **Photos**: the generalized attachments section with
  `("event_note", googleEventId.lowercased())`.
- **Skip today**: button that writes `actionable_instances` status `skipped`
  for `("calendar_event", googleEventId)` — the same call the existing swipe
  Skip makes.

The `EventNote` is resolved lazily: fetch all `EventNote`s from the
`modelContext`, find the one matching `googleEventId`; if none and the user
makes a first edit, insert one (setting `event_title`/`event_start_time` from
the passed-in event) and `queueSync` — mirroring `setInstanceStatus`.

Inputs: the view is constructed from the event's `TimelineItem` fields already
in hand (`title`, `startTime`, `location`, `eventKey`) — no network fetch to
open the card.

### 4. Swipe wiring in `TimelineItemCard`

Replace the event `slideActions` (currently `[Skip]`) with:

```
case .event:
    guard let key = item.eventKey else { return [] }
    return [
        SlideAction("Details", ...) { showEventDetail = true },
        SlideAction("Skip", ...) { setInstanceStatus("calendar_event", key, "skipped") },
    ]
```

Add `@State private var showEventDetail = false` and a `.sheet` presenting
`EventDetailView` (constructed from `item`), matching the task detail sheet's
presentation detents. The `guard let key` stays — if an event somehow has no
`eventKey`, it gets no actions (unchanged safety).

The already-shipped `SlideScrollLock` gesture fix (commit `80c226ae`) stays in
place; it is orthogonal and correct.

## Data flow

```
Open card:   event row → swipe → "Details" → sheet(EventDetailView(item))
             EventDetailView fetches EventNote by googleEventId (or none yet)

Edit notes:  TextEditor → EventNote.notes → markDirty → queueSync(event_notes)
             → SyncEngine push (full column set) → event_notes row upsert
             (user_id, google_event_id)

Edit links:  add/remove → EventNote.links → same push path

Add photo:   AttachmentsSection("event_note", eventId) → attachments insert
             + storage upload (existing task path, parametrized)

Web parity:  web useEventNotes reads the same event_notes row + attachments by
             entity_type='event_note' → notes/links/photos appear on web; realtime
             pushes web edits back to iOS.
```

## Error handling

- **No `eventKey`**: event gets no swipe actions (existing behavior); card is
  unreachable. Acceptable — such an event can't be keyed to storage anyway.
- **Sync push fails**: row stays `syncStatus = .pending` and retries on the next
  queueSync flush, same as tasks. No data loss (SwiftData is the local source of
  truth until pushed).
- **Attachment upload fails**: existing `TaskAttachmentsSection` failure handling
  (isUploading reset); no partial DB row without storage object.
- **Duplicate `EventNote` from a race** (iOS insert + web insert before sync):
  natural-key upsert on `(user_id, google_event_id)` collapses them; last write
  wins on `notes`/`links` by `updated_at`, same semantics as the web.

## Testing

- **Sync serialization test** (`SyncSerializationTests`): add an `EventNote`
  round-trip that locks the exact `event_notes` column set, mirroring the
  existing task/instance tests — this is the guard against phantom-column write
  drops.
- **Manual cross-device verification** (the real acceptance test): on the iOS
  build, swipe an event → Details → add a note, a link, and a photo; confirm all
  three appear on the web event panel for the same event, and that a note added
  on the web appears on iOS via realtime.
- **Regression**: task rows and task detail unchanged (the attachments
  generalization keeps the task call site behavior identical); verify a task
  still shows its photos.

## Rollout

Ships on `ios-sliders` → Xcode Cloud → TestFlight, where Scott verifies on his
iOS 27 device. Build number is auto-stamped by `ci_pre_xcodebuild.sh`.
