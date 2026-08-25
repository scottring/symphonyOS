# Supernote scratchpad → Symphony ingest

**Date:** 2026-08-25
**Status:** design, approved for planning
**Branch:** `feat/supernote-ingest`

## Goal

Scott writes a daily scratchpad by hand on a Supernote e-ink tablet. That page
holds a mix of registers — actions, reference, half-thoughts, names. Symphony
should read the page and offer its contents back as tasks and notes, without
Scott retyping anything and without anything being written to his data that he
did not confirm.

## Non-goals

- Handwriting recognition of our own. Claude vision reads the page; we never
  call Supernote's on-device OCR or ship an OCR dependency.
- Syncing `.note` files. See "Export is the trigger" below.
- Two-way sync. Symphony never writes back to the Supernote.
- Multi-user. This is a single-user pipeline (Scott). The design notes exactly
  where that assumption is hard-coded so it can be lifted later.

## What already exists

Most of this pipeline is built. The gaps are narrower than they look.

| Piece | Status |
|---|---|
| `parse-plan` edge fn — photo of a handwritten page → Claude vision → placeable tasks | ships |
| `PlanReviewSheet` — editable review, commits only checked rows | ships |
| `PlanFromPaperFlow` — camera *or file picker* → parse → review → commit | ships |
| `planParse.ts` — pure placement mapping, unit-tested | ships |
| `captures` / `capture_checkpoints` — ingest rows + "since last run" dedupe | ships |
| `tasks.capture_meta` jsonb — capture state + storage path | ships |
| `pg_cron` + `pg_net` + Vault service key — server-side scheduled invoke | ships (`proactive_engine_warm`) |

**No table or column changes are required.** `captures.kind` already permits
`'image'`; `captures.raw_text` (nullable text) holds the parse result as JSON;
`capture_checkpoints.last_processed_at` is exactly the Dropbox dedupe key we
need; `notes.source` already permits `'import'`.

Two pieces of SQL are needed, both hand-run by Scott (the Management API curl
is blocked by the request classifier):

1. **One RLS policy.** `captures` ships with a SELECT policy only, so the
   review sheet cannot delete a reviewed page:
   `CREATE POLICY captures_owner_delete ON captures FOR DELETE USING (auth.uid() = user_id);`
2. Phase 2's `CREATE FUNCTION` + `cron.schedule`.

## Two decisions the design rests on

**Export is the trigger, not sync.** Supernote's Dropbox integration syncs
`.note` notebook files that rewrite on every stroke — watching those means
every doodle becomes a task and we inherit a page-level dedup problem. Instead
we watch `/Supernote/EXPORT/`, which only receives files when Scott
deliberately exports a page. The export gesture *is* "process this." Each
export is a distinct file, so dedupe reduces to "newer than the last run."

**Server-side poll, not a local watcher.** The Mac Mini's Open Brain is
dormant; a poll from a Supabase edge function on `pg_cron` runs whether or not
any machine of Scott's is awake, and works from wherever he happens to be
writing.

## Architecture

```
Supernote ──export page──> Dropbox /Supernote/EXPORT/
                                 │
              pg_cron (*/15) ──> dropbox-poll (edge fn)
                                 │  lists path, picks files newer than checkpoint
                                 │  downloads, uploads to `attachments` bucket
                                 │  inserts captures row (kind='image')
                                 ▼
                            parse-page (edge fn)
                                 │  Claude vision → {items, notes, unclear}
                                 │  WRITES NOTHING to tasks/notes
                                 ▼
                     captures.raw_text = result JSON, status='extracted'
                                 │
                       Symphony inbox ──> "Supernote page · Review"
                                 ▼
                            PageReviewSheet
                                 │  edit / uncheck / dismiss
                                 ▼
                    tasks + notes + the page as an attachment
```

## Phase 0 — spike (Scott, no code)

Export a scratchpad page as PNG (the existing picker is `accept="image/*"`;
PDF support arrives in Phase 1), let it sync, then Symphony → Today → ⋯ → Plan
from paper → pick file. This answers the only question that can kill the
project: does Claude read *this* handwriting? Everything below assumes yes.
If extraction is poor, the fix is prompt work and page-hygiene habits (write
actions as a bulleted column, strike completed items), not more plumbing.

## Phase 1 — `parse-page`

### Why `parse-plan` is the wrong shape

`parse-plan` reads a *week plan*: every output is a task, and every task is
placed inside a 14-day window. A scratchpad page is not that. Roughly half of
any given page is not actionable, and forcing prose into task titles produces
a landfill of unactionable rows — the exact failure mode the Today surface
spent months undoing.

### Contract

`POST /functions/v1/parse-page`

Request:
```jsonc
{
  "storagePath": "…/supernote/uuid.png",  // in the `attachments` bucket
  "captureId": "uuid | null",             // set by the poller, null for manual upload
  "userId": "uuid | null",                // required for service-role calls, ignored for JWT calls
  "placeStart": "2026-08-25",             // the window, computed ONCE by the caller
  "placeEnd": "2026-09-07",
  "today": "2026-08-25",
  "members": [{ "id": "…", "name": "…" }]
}
```

Response:
```jsonc
{
  "items":  [{ "title": "…", "day": "2026-08-27|week|inbox", "assignee_id": null, "note": null }],
  "notes":  [{ "title": "Short heading", "content": "verbatim-ish prose" }],
  "unclear": ["best guess at an illegible line"],
  "window": ["2026-08-25", "…"]   // echoed so the review sheet never recomputes it
}
```

Auth: accepts either a user JWT (manual upload from the client) or the service
role key plus an explicit `userId` (the poller) — the `analyze-capture` /
`proactive-engine` split. Writes nothing either way.

Media: accepts PNG/JPEG via an `image` block and PDF via a `document` block,
the way `analyze-attachment` already branches. A multi-page PDF export is one
capture whose pages the model sees together.

### Prompt rules (beyond `parse-plan`'s)

- An imperative line, or a line naming a thing to obtain/decide/contact → **task**.
- A paragraph, a list of facts, a sketch caption, a piece of reasoning → **note**.
- A line that cannot be read confidently → **`unclear`**, verbatim best guess.
  Never promote a guess to a task.
- A struck-through or ticked line → **skip**. It was done on paper.
- Day words and dates resolve through the explicit weekday↔date calendar
  `parse-plan` already embeds. The model never does date arithmetic.
- Undated actions → `week`. Actions with no clear home → `inbox`.

### The window is derived once

`parse-plan`'s comment records the Tend lesson: two derivations of the same
window will disagree. The caller computes the window, the function embeds it in
the prompt, and the response **echoes it back**. The review sheet offers the
dates from the response, never from a fresh `planWindowDates(new Date())` —
which matters here because a page may sit parsed overnight before Scott reviews
it.

The poller has no browser timezone. It uses a `SUPERNOTE_TZ` constant
(`America/New_York`) — the single-user assumption, isolated to one line.

### Client changes

- `src/lib/pageParse.ts` — `validatePageResult(raw, windowDates, memberIds)`,
  pure, returning `{ items: PlanItem[]; notes: PageNote[]; unclear: string[] }`.
  Reuses `planParse`'s placement clamping rather than duplicating it.
- `PlanReviewSheet` → gains a notes section and an `unclear` section (read-only,
  each line promotable to a task or a note with one tap). Renamed
  `PageReviewSheet`; `PlanFromPaperFlow` keeps using it. 146 lines today, so
  this is an extension, not a rewrite.
- `PlanFromPaperFlow`'s file input accepts `image/*,application/pdf`.

### Commit behaviour

- Each checked item → one `addTask` INSERT via `planItemToAddTaskArgs`
  (everything rides the insert — never `addTask`-then-`setBucket`).
- Each checked note → one `notes` INSERT (`type='quick_capture'`,
  `source='import'`), title from the model, content verbatim.
- The page image → one `attachments` row against the first created note (or the
  first task if there are no notes), so the original page is always reachable
  from whatever came off it.

## Phase 2 — `dropbox-poll`

### Dropbox app

Supernote syncs to `/Supernote/` in the Dropbox account root and offers no way
to target an app folder, so the Symphony Dropbox app needs **Full Dropbox**
access with `files.metadata.read` + `files.content.read`. The token is broad;
the poller is not — the path is a module constant, never a parameter, never
read from a row. That asymmetry is the mitigation, and it is worth stating
plainly: this is the one genuinely broad credential in the system.

Refresh token obtained with `token_access_type=offline`, exchanged for a
short-lived access token on each run.

Secrets (`supabase secrets set`, read via `Deno.env`):
`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`,
`SUPERNOTE_USER_ID`.

### Run loop

1. Read `capture_checkpoints` for `source_key = 'supernote:export'`. Absent →
   treat as `now()`, i.e. a first run ingests nothing and simply arms the
   checkpoint. A cold start must never sweep in a year of old exports.
2. `files/list_folder` on `/Supernote/EXPORT` (non-recursive).
3. `selectNewFiles(entries, lastProcessedAt, cap)` — pure, unit-tested: files
   with `server_modified > lastProcessedAt`, ascending, `.png/.jpg/.pdf` only,
   under 10 MB, capped at **10 per run**.
4. Per file: `files/download` → upload to `attachments` at
   `${userId}/supernote/${uuid}.${ext}` → insert `captures`
   (`kind='image'`, `source_key='supernote:export'`, `source_label=<filename>`,
   `status='pending'`) → invoke `parse-page` → write the result JSON to
   `raw_text` and set `status='extracted'`. On failure: `status='failed'`,
   `error` set, and **continue to the next file**.
5. Advance the checkpoint to the **max `server_modified` of the files attempted**
   this run — succeeded or failed, so long as a `captures` row exists for it —
   and never to `now()`. Files that arrive mid-run, or that fall past the per-run cap,
   are picked up on the next tick instead of being silently skipped.

### Schedule

`cron.schedule('supernote-poll', '*/15 * * * *', …)` calling a
`SECURITY DEFINER` function that reads the service key from Vault and
`net.http_post`s the edge function — a direct copy of `proactive_engine_warm`,
including its `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (otherwise
PostgREST exposes an LLM-billed endpoint to the anon key).

**Scott runs this SQL by hand** in the Supabase SQL editor. The Management API
curl is blocked by the request classifier, and the migration files are already
out of sync with the deployed database.

Cost ceiling: 10 pages/run × 1 Sonnet vision call ≈ bounded at 40 pages/hour
worst case, and in practice one or two pages a day.

## Review surface

`usePendingPages()` queries `captures` where `kind='image'`,
`source_key='supernote:export'`, `status='extracted'`. When any exist, the
inbox shows a single quiet line — `Supernote page · Aug 25 · Review` — that
opens `PageReviewSheet` with the stored result and its echoed window.

On commit **or** dismiss, the `captures` row is deleted. The page has been
triaged; the image survives as an attachment (on commit) or in Dropbox
(always), and the tasks and notes stand on their own. The tradeoff is that a
page cannot be re-parsed from Symphony after review — re-export it. This buys
a zero-DDL terminal state instead of a new `status` value on a CHECK
constraint that only Scott can alter.

## Error handling

| Failure | Behaviour |
|---|---|
| Dropbox token expired/revoked | poll logs and exits; checkpoint unchanged; next tick retries |
| A file fails to download or parse | that `captures` row goes `status='failed'` with `error`; the loop continues; the checkpoint still advances past it so it is not retried forever |
| Vision returns unparseable JSON | one retry, then `status='failed'` (the `analyze-attachment` pattern) |
| Model reads the page as empty | `captures` row deleted rather than surfacing an empty review |
| Bulk export of 200 pages | per-run cap of 10 drains it over ~50 minutes rather than in one bill |

## Testing

Pure functions carry the logic; nothing in the unit suite touches the network.

- `pageParse.test.ts` — window clamping, out-of-window dates falling back to
  `week`, unknown assignee ids nulled, malformed notes dropped, `unclear`
  passed through untouched.
- `selectNewFiles.test.ts` — boundary equality on `server_modified`, extension
  and size filters, ordering, cap behaviour, empty-checkpoint cold start.
- `parse-page`'s prompt builder and response parser live in a `lib/` module
  (the `extract-capture` layout) and are unit-tested away from Deno.serve.
- `PageReviewSheet.test.tsx` — notes render, unchecked rows do not commit,
  `unclear` promotion produces the right item.
- Manual: Phase 0's file-picker path is the end-to-end check for Phase 1;
  a single hand-placed file in `/Supernote/EXPORT/` is the check for Phase 2.

## Risks

1. **Handwriting legibility is unproven.** Phase 0 gates everything. If it is
   marginal, the answer is page hygiene plus prompt tuning, not more code.
2. **The Dropbox token is full-account.** Unavoidable given how Supernote
   syncs. Mitigated only by the poller's hard-coded path.
3. **Single-user assumptions** — `SUPERNOTE_USER_ID`, `SUPERNOTE_TZ`. Both are
   constants in the poller, liftable to a per-user settings row later.
4. **Register-splitting is a judgment call the model makes.** A page where
   everything lands in `notes` is a prompt problem that will only show up on
   real pages; expect one round of tuning after the first week of use.

## Scott's provisioning checklist

1. Supernote → Settings → Sync → link Dropbox.
2. Dropbox App Console → new app → Scoped access → **Full Dropbox** → add
   `files.metadata.read` and `files.content.read` → generate a refresh token
   with `token_access_type=offline`.
3. `supabase secrets set DROPBOX_APP_KEY=… DROPBOX_APP_SECRET=… DROPBOX_REFRESH_TOKEN=… SUPERNOTE_USER_ID=…`
4. Run the Phase 2 cron SQL in the Supabase SQL editor.

Steps 2–4 are only needed for Phase 2. Phase 1 is usable with the file picker
and a file pulled from the Dropbox folder by hand.
