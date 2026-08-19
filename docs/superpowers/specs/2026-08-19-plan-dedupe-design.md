# Plan-from-paper: duplicate detection

**Date:** 2026-08-19
**Status:** Design approved, ready for implementation plan

## Problem

`parse-plan` is a pure transcriber. It sends the vision model the photo, the date
window, and the household member list — and nothing else. It never sees what is
already in Symphony, and `PlanReviewSheet` commits every parsed row as a brand
new task.

So a line that already exists as a task becomes a second copy of it.

This hurts the analog loop specifically. Planning on paper means re-writing the
things still nagging you; carried-over items are exactly what lands on the page.
Left alone, the second or third real use of plan-from-paper silently doubles a
handful of tasks, and the feature stops being trustworthy — which is fatal for a
flow whose entire value is that you can photograph a page and stop thinking about
it.

## Decisions

**A match re-places the existing task; it does not create a second one.** Writing
"call roofer" under Wednesday moves the task you already have to Wednesday. Paper
re-decides, Symphony follows. This is the loop working as designed, not a
de-duplication convenience.

**Duplicates only.** No project hints, no near-miss warnings. Soft overlaps are
where a matcher gets noisy, and a false positive is worse than a miss: it
silently re-dates something the user did not mean to touch. Fuzzier signals can
come later, once real pages have been seen.

**The comparison pool is every open task, across all domains.** Paper does not
know about the work/family/personal split. A task filed `personal` written onto a
family page must still match, or it duplicates anyway. Completed tasks are
excluded — re-writing something finished last week means you want it again.

## Architecture

The matcher is a module, `supabase/functions/_shared/planMatch.ts`, called as a
second step inside `parse-plan`'s existing request. It mirrors the existing
`_shared/documents.ts` convention (shared module + colocated Deno test).

Two properties drive this shape:

- **The vision prompt is not modified.** Transcription is the thing that must not
  regress, and a busier prompt asking one call to both transcribe and match is
  how it would. The matcher never touches that prompt.
- **One round trip.** A separate edge function would be cleaner on paper but costs
  a second network hop on mobile, after the user has already waited on vision.

### Flow

1. `parse-plan` transcribes the page exactly as it does today.
2. It reads the caller's open tasks using a **JWT-scoped client** — the
   `Authorization` header is forwarded so RLS applies. The service-role client
   must not be the reader; it bypasses RLS and would surface other members' rows.
   Select `id, title, scheduled_for, bucket, week_start` where
   `completed = false`, newest 300 by `created_at`.
3. `matchPlanItems()` makes one text-only Haiku call: parsed titles in,
   `[{ index, task_id }]` out.

   The bar for a match is explicit, because "confident" is not a specification:
   **the written line and the existing task must name the same action.**
   Paraphrase and shorthand count — "bank" matches "call bank re: the wire
   transfer". A different action on the same subject does not — "call roofer"
   must not match "pay roofer invoice". When the model is unsure, it returns no
   match; a miss costs a duplicate the user can delete, a false positive
   silently re-dates real work.
4. Returned ids are validated against the set actually sent — the same
   hallucination guard `validateItems` already applies to `assignee_id`. An id
   that was not sent is dropped.
5. The response becomes `{ ok, items, matches }`.

### Client

`PlanItem` gains `existing: { taskId, currentLabel } | null`, where
`currentLabel` is the matched task's present placement rendered for display —
`"Inbox"`, `"This week"`, or a short date like `"Wed Aug 20"`.
`validatePlanItems` merges the matches onto their items and re-validates
client-side, as it already does for placement — a stale or hand-rolled response
must not be able to move a task the user was never shown.

### Review sheet

A matched row keeps its checkbox on and stays fully editable. It gains a subline:

> already in Symphony (This week) → will move to Wed

The commit button counts both actions: **"Add 1, move 2."**

Unchecking a matched row does nothing at all — no add, and no move.

If the matched task already sits on the day the page says, there is nothing to
do. The row reads "already in Symphony (Wed)" with no arrow, and commit skips the
write rather than issuing a no-op update.

### Commit path

`handleCommitPlanItems` splits by `existing`: matched items call
`updateTask(id, placement)`, unmatched ones call `addTask` as today.

Three constraints carried from prior incidents:

- Use `.update().eq()`. A partial `upsert` on `tasks` is a guaranteed 23502.
- A `bucket: 'week'` write must stamp `week_start`. An unstamped row reads as
  "the current week" only by legacy accident.
- `updateTask` already calls `announceLocalWrite`, so same-tab sync is handled.
  No new bus wiring, but any new write path must keep announcing.

A rejected update (a shared task the user cannot write) surfaces as a toast. It
must not fail silently, and it must not abort the remaining items in the batch.

## Error handling

The matcher fails soft. Any error, timeout, or malformed response logs and
returns `matches: []` — the user still gets their parsed page and a working
review sheet, just without flags. A matcher problem must never take down a parse
that already succeeded.

If the user has no open tasks, the matcher is skipped entirely and no API call is
made.

## Testing

**`planMatch.test.ts`** (Deno)
- A returned id that was not in the candidate set is dropped.
- Empty candidates short-circuit without making an API call.
- Malformed JSON returns `[]` rather than throwing.

**`planParse.test.ts`**
- Matches merge onto the correct items by index.
- An out-of-range index is ignored.

**`PlanReviewSheet.test.tsx`**
- A matched row renders the flag and its target placement.
- The commit button counts adds and moves separately.
- Unchecking a matched row excludes it from both lists.

**Commit path**
- A matched item calls `updateTask`, not `addTask`.
- A match whose placement is unchanged calls neither.

## Risk

The failure mode that matters is a false positive silently re-dating a task the
user did not mean to touch. Three things contain it: the matcher returns only
confident matches, every flag is visible and reversible before commit, and the
scope is duplicates only — no soft-overlap guessing.

## Out of scope

Project hints, near-miss warnings, matching against completed tasks, and matching
against events or routines. All deferred until real pages show whether they are
needed.
