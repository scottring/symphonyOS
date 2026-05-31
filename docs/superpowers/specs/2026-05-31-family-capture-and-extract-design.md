# Family Capture & Extract — Design

**Date:** 2026-05-31
**Status:** Approved for planning
**Author:** Scott + Claude (brainstorming session)

## 1. Problem

Useful family logistics (a birthday party flyer, a permission slip, an RSVP, a schedule change) arrive buried in noisy channels — WhatsApp group chats, ClassDojo, and as photos of paper flyers. Today Scott and Iris read all of it manually and the signal gets lost in the noise. We want to pull the few useful bits out, turn them into confirmed events/tasks in Symphony, and summarize the rest — on a **manual trigger**, missing nothing.

## 2. Goals / Non-Goals

**Goals**
- One pipeline that turns three input types into structured, confirm-before-commit family events/tasks: **photos/screenshots**, **WhatsApp Export-chat files**, and **pasted/typed text**.
- Pull structured event detail: title, date, time, location, RSVP, gifts expected, cost, who it's for.
- Summarize the surrounding noise in one line, and **flag gaps** ("attached flyer I can't read", "thread truncated") so nothing is *silently* missed.
- Read the **full body since the last run** per source (dedupe by checkpoint), not just individual forwarded messages.
- ClassDojo, which has no export, is fetched by a **swappable agent (Hermes) confined behind a narrow contract**.

**Non-Goals**
- No background/automatic capture. Everything is user-triggered.
- No WhatsApp scraping. WhatsApp uses the official Export-chat path only (its agent connectors emulate WhatsApp Web via Baileys = ban risk; rejected).
- No auto-creation of events without human confirmation.
- Hermes is **not** the ingestion orchestrator; Symphony remains the brain.

## 3. Decisions locked (this session)

| Decision | Resolution |
|---|---|
| Trigger | Manual, on demand |
| WhatsApp | **Export Chat → share into Symphony** (complete, ToS-safe). No Baileys/agent. |
| ClassDojo | **Hermes agent fetcher** on the always-on Mac Mini (`scotts-mac-mini-2`), behind a narrow contract. No screenshot stopgap. |
| Flyers/paper | Photo/screenshot → vision extraction |
| Hermes scope | **(a) Focused fetcher only** — log in, return thread text since timestamp T. Swappable. Symphony owns extraction/inbox/events. |
| Confirmation | Candidates land in inbox; user confirms before anything becomes a real event/task. |

## 4. Architecture

```
INPUTS                         INGEST                 EXTRACT                 REVIEW
-----------------------        ---------------        -------------------     ---------------
Photo / screenshot  ─┐
WhatsApp export .txt ─┼─► capture endpoint ──► extract-capture ─────────────► Inbox triage
Pasted / typed text ─┘     (extends            (LLM: vision|text;             (candidates +
                            capture-to-inbox)    dedupe by checkpoint;          summary + gaps;
ClassDojo threads ──► Hermes fetcher ──────────►  → candidates+summary+gaps)    confirm → commit)
 (Mac Mini, swappable, narrow HTTP contract)
                                                                              │
                                                          confirm ───────────┼─► Task (category
                                                                              │   event/activity/…)
                                                                              └─► optional Google
                                                                                  Calendar event
```

**Symphony owns** the capture endpoint, extraction, checkpoints, inbox/triage, and event/task creation. **Hermes owns** only ClassDojo fetching and hands text back through the contract in §8.

## 5. Capture surfaces (inputs)

1. **Apple Share Extension** (extend the existing `apple/SymphonyOS` Extensions target): accept `public.image`, `public.plain-text`/`public.text` (covers WhatsApp's exported `_chat.txt`), and shared text. Posts to the capture endpoint with the shared secret. This is the primary mobile path: photograph a flyer, or in WhatsApp tap **Export chat → Symphony**.
2. **Web paste/upload** (Symphony web app): drag-drop or paste an image, or paste text, into a "Capture" affordance that hits the same endpoint.
3. **ClassDojo** is *not* a manual capture surface — it arrives via the Hermes fetcher (§8).

## 6. Ingest endpoint

Extend `supabase/functions/capture-to-inbox` (or add a sibling `capture-ingest` reusing its auth) to accept a richer payload while keeping the existing shared-secret model (`x-capture-secret` + `CAPTURE_USERS` email→user_id map).

```ts
interface IngestBody {
  user_email: string
  kind: 'image' | 'whatsapp_export' | 'classdojo_thread' | 'text'
  // exactly one of:
  text?: string                 // for kind=text | whatsapp_export | classdojo_thread
  image_base64?: string         // for kind=image (PNG/JPEG; see ALLOWED_FILE_TYPES)
  source_key?: string           // stable id of the conversation/source, for dedupe
                                // e.g. "whatsapp:Parents of 3B", "classdojo:Ms-Lee"
  source_label?: string         // human label for the inbox
  newest_timestamp?: string     // ISO; for fetched sources (ClassDojo)
}
```

Behavior:
1. Validate (reuse `validateRequest` pattern).
2. Persist the raw input: images to Supabase Storage + an `Attachment` row (entityType `note`); text payloads to a `captures` row (§9).
3. Insert a `captures` row (status `pending`) and invoke `extract-capture` (async).
4. Return `{ capture_id }`.

## 7. Extraction function (`extract-capture`)

New edge function following the existing LLM edge-function pattern (`email-scanner`, `note-match`, `meal-plan-generate`).

- **Routing:** `kind=image` → vision model on the image; text kinds → text model on the (deduped) body.
- **Dedupe:** for `whatsapp_export` and `classdojo_thread`, look up the checkpoint for `source_key` (§9), drop everything at/before `last_processed_at` (WhatsApp export lines are timestamped; the parser splits on the `[date, time] Sender: msg` format), extract only the new slice, then advance the checkpoint to the newest processed timestamp.
- **Output (structured, schema-validated):**

```ts
interface ExtractionResult {
  candidates: CandidateItem[]
  summary: string            // one-line summary of the non-actionable "noise"
  gaps: GapFlag[]            // things the model could not fully read
}
interface CandidateItem {
  category: 'event' | 'activity' | 'task' | 'errand' | 'chore'
  title: string
  startTime?: string         // ISO
  isAllDay?: boolean
  location?: string
  rsvp?: { needed: boolean; by?: string; to?: string; method?: string }
  giftsExpected?: string | null
  cost?: string | null
  forWho?: string            // e.g. "Ella" — maps to assignedTo if a household member matches
  confidence: number         // 0–1
  provenance: { capture_id: string; source_key?: string; source_label?: string }
}
interface GapFlag {
  kind: 'unreadable_attachment' | 'truncated' | 'partial_thread' | 'low_confidence'
  note: string               // actionable: "Open the attached PDF flyer and share it"
}
```

- Candidates are written as **inbox tasks** (`bucket='inbox'`, `context='family'`, `category` per above, `assignedTo` resolved against household members when `forWho` matches). The `summary` + `gaps` are written as a triage `Note` (`source='inbox_triage'`) linked to the capture, so gaps surface as actionable review items.
- Mark the `captures` row `extracted`.

## 8. Hermes fetcher contract (ClassDojo)

Hermes runs self-hosted on `scotts-mac-mini-2`, manually triggered. It is treated as **one swappable component** behind an HTTP contract — could be replaced by OpenClaw, a Playwright script, or manual paste without touching anything else.

- **Trigger:** a "Pull ClassDojo" button in Symphony calls a Symphony endpoint that signals the Mini (recommended: Symphony writes a row to an `agent_jobs` table; a small poller on the Mini picks it up — survives the Mini being briefly unreachable and needs no inbound port). Default unless the plan finds a simpler push.
- **Hermes does:** log into ClassDojo (credentials stored **only** in Hermes config on the Mini, never in Symphony), paginate each watched thread, collect messages newer than `since`.
- **Hermes returns** (POST to the capture endpoint, `kind='classdojo_thread'`, one call per thread):

```
{ source_key: "classdojo:<thread>", source_label, text: "<full new messages>",
  newest_timestamp: "<ISO>" }
```

- From there it is identical to any other text capture — extraction, dedupe, triage. Symphony has no ClassDojo-specific logic beyond the `source_key` prefix.
- **Failure modes:** login failure / DOM change / Hermes down → the `agent_jobs` row is marked `failed` with a message; Symphony shows "ClassDojo pull failed — re-run or screenshot manually." The rest of the pipeline is unaffected.

## 9. Data model additions

- **`captures`** — `id, user_id, kind, source_key, source_label, raw_attachment_id?, raw_text?, status ('pending'|'extracted'|'failed'), created_at`.
- **`capture_checkpoints`** — `user_id, source_key (pk), last_processed_at, updated_at`. Drives "since last run" dedupe.
- **`agent_jobs`** (for the Mini poller) — `id, user_id, kind ('classdojo_pull'), since, status ('queued'|'running'|'done'|'failed'), message, created_at, updated_at`.
- Candidates reuse the existing **`tasks`** table (no new entity). Summary/gaps reuse **`notes`** (`source='inbox_triage'`). Raw images reuse **`attachments`** + Storage.

## 10. Triage UX

In the existing inbox: capture-derived candidates are grouped under their `source_label` with a confidence indicator and the one-line summary. Each candidate: **Confirm** (creates the timed Task and, if `category='event'`, optionally a Google Calendar event via `google-calendar-create-event`) or **Dismiss**. Gap flags render as a small "Needs another look" list with the actionable note. Nothing leaves the inbox without a tap.

## 11. Error handling

- Extraction/LLM error → `captures.status='failed'`, surfaced in inbox with retry.
- Vision can't read an image → emit a `gaps` entry, not a silent drop.
- WhatsApp export with no new messages since checkpoint → no candidates, summary "nothing new since <date>".
- Malformed export → parse defensively; fall back to treating the whole file as text and flag `partial_thread`.
- Household-member match ambiguous → leave `assignedTo` null rather than guess.

## 12. Security & privacy

- Reuse the `x-capture-secret` + `CAPTURE_USERS` model for all ingest, including Hermes.
- **ClassDojo credentials live only in Hermes on the Mini**, never in Symphony or Supabase.
- ClassDojo automation is ToS-gray and accepted knowingly (see Decisions); isolated to the swappable fetcher so it can be removed without touching core.
- Family data is sensitive: confirm-before-commit is mandatory; raw captures retained only as needed for review, with a retention policy decided in the plan (default: purge raw text/images 30 days after a capture is triaged).

## 13. Testing

- **Unit:** WhatsApp `_chat.txt` parser (timestamp formats, multi-line messages, media placeholders); checkpoint dedupe; `ExtractionResult` schema validation; household-member resolution.
- **Integration:** capture → extract → inbox for each `kind`; checkpoint advance/no-dupe across two runs of the same export.
- **Vision:** fixture flyer images (birthday flyer, permission slip) assert extracted date/time/location/RSVP.
- **e2e (Playwright):** paste a flyer image → candidate appears in inbox → Confirm → timed family event created.
- **Hermes contract:** mock the fetcher POST; verify ClassDojo text flows through extraction identically to other text.

## 14. Reuse map

| Need | Existing piece |
|---|---|
| Ingest auth + entry | `capture-to-inbox` (shared secret + `CAPTURE_USERS`) |
| LLM call pattern | `email-scanner`, `note-match`, `meal-plan-generate` |
| Mobile capture | `apple/SymphonyOS` Extensions target |
| Files | `Attachment` model + `ALLOWED_FILE_TYPES` + Supabase Storage |
| Candidates | `tasks` (`category` event/activity/task/errand/chore, `assignedTo`, `context='family'`) |
| Summary/gaps | `notes` (`source='inbox_triage'`) |
| Event creation | `google-calendar-create-event` |

## 15. Build order (within this single Phase)

1. `captures` + `capture_checkpoints` tables; extend ingest endpoint; **text + WhatsApp-export** path end-to-end into inbox (no UI polish).
2. **Vision** path (flyer/screenshot image → candidates).
3. **Triage UX** (candidates grouped, confirm→commit, gaps list).
4. **Apple Share Extension** wiring (image + exported `.txt` + text).
5. **Hermes ClassDojo fetcher** + `agent_jobs` poller — last, because it is the ToS-gray, swappable dependency, and the pipeline already works without it.

## 16. Decisions deferred to the implementation plan (with recommended defaults)

- **Vision/text model & provider:** default to the Anthropic model already wired in Symphony's edge functions, with vision for `kind=image`.
- **Confirm creates Task vs. Google Calendar event:** default — `category='event'` confirms to a Google Calendar event (family calendar) *and* a linked timed task; other categories create a timed task only.
- **Mini trigger mechanism:** default — `agent_jobs` table + Mini-side poller (pull), not an inbound push.
- **Raw retention:** default — purge raw text/images 30 days after triage.
