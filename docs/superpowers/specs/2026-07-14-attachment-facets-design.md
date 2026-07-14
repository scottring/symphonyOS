# Attachment Facets — the morphing attachment artifact

**Date:** 2026-07-14
**Status:** Approved (Scott, 2026-07-14)
**Precedent:** Google Now cards / Gmail schema.org annotations — AI extracts into a
closed vocabulary of typed facts; deterministic components render each type with
the right affordance. The model never generates UI.

## Problem

Attachments on tasks and events (shipped 2026-07-09: `PanelPhotos`,
`src/lib/taskAttachments.ts`) are dumb blobs. The content inside them — an
Airbnb door code, a party invite's address and RSVP date, a broken part's
specs — is exactly the context Symphony exists to surface, but today it stays
locked in pixels.

The photo-first capture flow already proves the extraction works
(`supabase/functions/analyze-capture/index.ts`: signed URL → Claude vision →
structured JSON → task fields). This design generalizes it to any attachment
on any entity, with typed output instead of freeform notes.

## Decision summary

- **Trigger: automatic** on attach, for images and PDFs only. Personal-scale
  volume; a vision call costs a fraction of a cent; the artifact is the point —
  requiring an "analyze" tap kills it. Failures are silent (the attachment
  stands on its own). docx/csv/txt/mp3 attach fine but are not analyzed.
- **Storage: on the attachment row** (`facets jsonb`, `analyzed_at
  timestamptz`). Chosen over (B) surfacing on Today cards — deferred to v2,
  which the stored facets make possible — and over (C) writing straight into
  entity fields, which is lossy and forecloses proactive use.
- **Promotion, not automation:** each facet offers a one-tap bridge into the
  entity's existing first-class fields (location, links, phone, prep tasks).
  The user decides what becomes durable context.

## Facet vocabulary (v1, closed union)

| type            | shape                          | renderer affordance                          |
|-----------------|--------------------------------|----------------------------------------------|
| `summary`       | `{ text }`                     | one quiet line; always present               |
| `location`      | `{ label?, address }`          | Directions chip (reuse `locationLink`); promote → entity location |
| `access_code`   | `{ label, code }`              | large mono code, copy-to-clipboard button    |
| `phone`         | `{ label?, number }`           | `tel:` link; promote → task `phoneNumber`    |
| `datetime`      | `{ label, iso }`               | display chip ("Check-in 4:00 PM")            |
| `link`          | `{ label?, url }`              | link chip; promote → `onAddLink`             |
| `checklist`     | `{ label?, items[] }`          | per-item "+ add as prep task" (`onAddPrepTask` / subtask) |
| `purchase_item` | `{ name, specs }`              | name + specs text block (broken-part case)   |

Validation is server-side in the edge function: unknown types and malformed
entries are dropped before writing. Content that fits no type lands in
`summary`. Facets are never rendered from unvalidated model output.

## Components

### 1. Migration
`attachments` gains `facets jsonb` (null = not analyzed) and `analyzed_at
timestamptz`. Applied via the Supabase Management API (migrations are out of
sync with the CLI); the migration file is still committed for the record.

### 2. Edge function `analyze-attachment`
Cloned from `analyze-capture`'s bones. Input `{ attachmentId, entityContext }`;
auth is the user JWT, ownership enforced by the attachments RLS select.
`entityContext` is a short string the client builds from what it already has on
screen (event title + start time + location, or task title + first notes line) —
calendar events live in Google, not the DB, so the server cannot look them up
itself. The context steers extraction ("attached to 'Airbnb — Kennebunkport,
check-in Jul 18', pull check-in details"); it is prompt seasoning only and is
capped at ~300 chars server-side.

1. Load the row; no-op if `analyzed_at` is set (idempotent).
2. Sign the storage URL (600 s). Image MIME → `image` content block; PDF →
   `document` block. Same model constant as analyze-capture.
3. Prompt returns JSON `{ facets: [...] }` against the vocabulary above;
   validate, drop invalid entries, write `facets` + `analyzed_at`.
4. On any error: write `analyzed_at` with `facets: []` after one retry — the
   panel shows nothing, never an error state.

### 3. Client trigger
`attachFile` succeeds → if MIME is image/PDF, `PanelPhotos` invokes the
function (awaited, with the session JWT), then reloads the attachment list.
While in flight, that thumbnail shows a quiet "Reading…" shimmer. No queue, no
polling — a panel closed mid-analysis just picks up the stored facets on next
open.

### 4. `AttachmentFacets` renderer
New `src/components/surface/sections/AttachmentFacets.tsx`, rendered by
`PanelPhotos` under each attachment that has non-empty facets. One small
renderer per facet type per the table above. Promotions arrive as an optional
`promotions` prop wired by each panel:

- `TapEventPanel`: `onUpdateEventLocation`, `onAddPrepTask`, `onAddLink`
- `TapContextPanel`: task location update, `onAddSubtask`, `onAddLink`,
  phone-number update

A facet whose promotion handler is absent renders without the promote button.

## Deferred (deliberately)

- Facet surfacing on Today cards at execution time (v2 — the reason facets are
  stored typed).
- EV-route/charging planning — that is the proactive-assistant layer consuming
  facets, not extraction.
- User-preference conditioning of prompts; docx conversion; audio
  transcription.
- Re-analyze / manual retry affordance.

## Testing

- Unit: facet validator (accepts vocabulary, drops junk), one render test per
  facet type, promotion callback tests, auto-trigger test (image attaches →
  analyze invoked; csv attaches → not invoked).
- Manual before ship: a real Airbnb-style PDF and a party-invite image through
  the deployed function; verify door code, address, RSVP checklist come back
  typed and render with working chips.
