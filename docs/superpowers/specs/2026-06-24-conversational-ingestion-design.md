# Conversational Ingestion — "Symphony, meet me where I am"

**Date:** 2026-06-24
**Status:** Approved design, ready for implementation plan
**Branch:** `converse-ingest`

## Problem

Scott spends ~90% of his working time conversing with an agent in a terminal and
~5–10% in the Symphony app — despite *loving* the Symphony UI. The friction isn't
the UI; it's that Symphony makes him **click** while the terminal lets him **talk**.

The fix is not to move Symphony into the terminal. It is to give the app he loves
the conversational control the terminal already has, and to double down on
Symphony's core promise: **the right content, at the right time, in the right
amount of detail.** Conversation becomes the *control plane* on top of the
unchanged UI. The UI stays exactly as it looks and works today.

## North-star example (the vertical slice)

Scott drops his shoulder physical-therapy **Home Exercise Program PDF** into the
in-app chat and says "set this up." Symphony:

1. **Reads** the PDF (it understands that the median nerve glide is 2×/day, another
   exercise is 5×/day, etc. — structure *and* cadence from unstructured input).
2. **Creates** a Project "Shoulder HEP" with the source PDF attached, and one
   correctly-dosed Routine per exercise grouped under it.
3. **Surfaces** them on Today the right number of times per day, compact by default
   ("Median nerve glide — 2× today"), each expandable to its instructions and the
   source document.

If this one real case works end-to-end, the magic is proven and we generalize.

## What already exists (reuse, do not rebuild)

Exploration of the live codebase (2026-06-24) found far more in place than expected:

- **The agent is real.** The right-rail drawer (`ChatPanel`) is driven by
  `useSymphonyAssistant` → `supabase/functions/symphony-agent/index.ts`:
  **Claude Sonnet 4.6**, **8 function-calling tools** (list/create/update/complete
  tasks, list/create projects, list contacts, list household, daily summary),
  **RLS-fenced** to the user's own data, **SSE streaming**. This is the "fenced
  Symphony assistant." No brain to build.
- **Attachments infrastructure exists.** `attachments` Storage bucket +
  `useAttachments` + `FileUpload` + `attachments` table already support PDF/PNG/JPG
  upload, signed URLs, and per-entity linking. It is only wired into the *dead*
  `DetailPanelRedesign`, not the live surface.
- **Progressive disclosure exists.** The live detail pane `TapContextPanel`
  (`src/components/surface/`) already has compact→expand sections (`PanelWhy`,
  `PanelLocation`). The expand pattern is reusable for media.
- **Camera capture exists** (`AssetCapture.tsx`, `capture="environment"` →
  `asset-photos` bucket) as a working reference for mobile photo intake.

## The three real gaps

| Gap | Current state | Work |
|---|---|---|
| **Eyes** | `ChatInput.tsx` is a plain text textarea; the agent never receives an image. Sonnet 4.6 is multimodal but blind here. | Add file-drop → upload → pass document to the agent. |
| **Hands for recurrence** | Agent has no `create_routine` tool; routine model is one `time_of_day`, one instance/day; routines can't hold attachments. | New tool + `times_per_day` + multi-instance materialization + routine attachments. |
| **Show the picture** | `TapContextPanel` renders notes/links but has **zero** image rendering. | Small `PanelMedia` section, compact thumbnail → expand. |

## Modeling decision

- **Home Exercise Program → a Project.** Projects already carry notes, links, and
  (via the attachments table) the source PDF.
- **Each exercise → a Routine** under that project, extended with dosing and an
  optional image.

Rejected: a net-new "Protocol" entity (violates reuse); raw tasks (no recurrence,
clutters Today). The Project+Routine shape generalizes for free to any dosed
protocol later (medication 3×/day, stretches, etc.).

## Image fidelity (decided)

**v1 ships fidelity (A):** the **whole source PDF** is attached to the Project;
each exercise shows its extracted text instructions plus a one-tap link to the
source document. The schema includes an `image_url` slot on the routine so
**fidelity (B)** — a per-exercise *cropped* picture inline — drops in later
without a migration. We do not attempt per-exercise image cropping in v1; that is
the genuinely hard CV sub-problem and is explicitly deferred.

## The build — four moves

### 1. Eyes — file intake in chat
- Extend `ChatInput` to accept a file (drag-drop + a paperclip button; reuse
  `accept` types from `attachment.ts`).
- On attach: upload to the `attachments` bucket (reuse `useAttachments`/storage
  helper), get a signed/public URL, show a small preview chip in the composer.
- Pass the document to `symphony-agent`. For images, send as a vision content
  block. For PDFs, send via the Anthropic document content block (Sonnet reads
  PDFs natively) — the edge function fetches the uploaded file and base64-encodes
  it into the message, or passes the URL per the document-block contract.
- **Boundary:** `ChatInput` only collects + uploads + emits `{url, fileType}`;
  the edge function owns turning that into a model content block.

### 2. Hands — dosed routine creation
- Add `symphony_create_routine` to the edge function's tool list, accepting:
  `name`, `description`/instructions, `times_per_day` (e.g. `["09:00","18:00"]`
  or a count the engine spreads), `recurrence_pattern` (default daily),
  `project_id`, optional `image_url`, `context`.
- Add `symphony_create_project` is already present — agent creates the "Shoulder
  HEP" project first, attaches the PDF, then creates routines with that
  `project_id`.
- Tighten the system prompt: when handed a document describing a recurring
  protocol, create a project + dosed routines; confirm the plan in chat before
  writing, then write on confirmation. **Boundary:** all writes remain
  RLS-scoped through the existing per-user Supabase client.

### 3. Data — dosing + routine media
- **Migration:** add `times_per_day jsonb` (array of `HH:MM` strings) to
  `routines`; null = legacy single-instance behavior preserved.
- **Migration:** add `'routine'` to the `attachments.entity_type` CHECK
  constraint; add `image_url text` to `routines` (the fidelity-B slot).
- **Materialization:** extend `getRoutinesForDatePure` /
  `matchesRecurrenceForDate` so a routine with `times_per_day` yields **N Today
  instances** (one per time), each keyed distinctly so completion is per-slot.
  Single-`time_of_day` routines are unchanged.
- **Boundary:** the engine stays a pure function over `(routines, date)` →
  `instances[]`; the Today view consumes instances and need not know about dosing.

### 4. Show it — media in the detail pane
- New `PanelMedia` section in `TapContextPanel`: if the item has an `image_url`,
  render a compact thumbnail; if it has linked attachments (PDF), render a compact
  "Source document" row. Click expands to the full image / opens the PDF, reusing
  the `PanelWhy` expand affordance.
- **Boundary:** `PanelMedia` takes `{imageUrl?, attachments[]}` and renders;
  it does not fetch or own data.

## Data flow

```
user drops PDF in ChatInput
  -> upload to `attachments` bucket (signed URL)
  -> message + document content block -> symphony-agent (Sonnet 4.6, vision)
  -> agent extracts {exercises:[{name, instructions, times_per_day}], programName}
  -> agent confirms plan in chat
  -> on "yes": symphony_create_project("Shoulder HEP") + attach PDF
              symphony_create_routine(...) x N  (with times_per_day, project_id)
  -> routines table + attachments table updated (RLS-scoped)
  -> Today view materializes N instances/day per routine
  -> TapContextPanel renders instructions + source PDF (compact, expandable)
```

## Error handling

- **Unreadable / non-protocol document:** agent says so in chat and offers to file
  it as a plain attachment on a task instead of inventing routines. Never
  fabricate cadence it cannot find — if a frequency is ambiguous, it asks.
- **Upload failure:** composer shows the error inline; no message is sent.
- **Partial extraction:** agent proposes what it found and asks Scott to confirm or
  correct before any write. Confirmation-before-write is mandatory.
- **Materialization safety:** `times_per_day = null` must behave exactly as today
  (regression guard in tests).

## Testing

- **Unit:** `times_per_day` materialization — null → 1 instance (unchanged), 2 times
  → 2 distinctly-keyed instances, per-slot completion independence.
- **Unit:** `PanelMedia` renders thumbnail when `imageUrl` set, PDF row when an
  attachment is present, nothing when neither.
- **Edge function:** `symphony_create_routine` validates inputs and writes
  RLS-scoped; document content block is constructed for image vs PDF.
- **Integration (manual, the real test):** drop Scott's actual shoulder HEP PDF →
  confirm correct exercises, correct per-exercise cadence, project created, PDF
  attached, instances on Today, expandable source. This is the acceptance gate.

## Out of scope (v1)

- Per-exercise cropped images (fidelity B) — schema-ready, deferred.
- Mobile camera capture wired into chat (reuse `AssetCapture` pattern later).
- Generalized ingestion of arbitrary document types beyond protocol/recurring —
  the agent handles what it can, files the rest as attachments; broad
  generalization is move two, after the slice proves out.
- Proactive/push delivery (morning brief). Pull-driven only for now.

## Acceptance

Scott drops his real shoulder PDF into the Symphony chat, confirms the proposed
plan, and sees correctly-dosed exercises on Today — compact, each expandable to
its instructions and the source document — without clicking through a single
picker. The UI looks and works exactly as before; only the path to populate it
changed.
