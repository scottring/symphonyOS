# Plan from paper — design

**Date:** 2026-08-17
**Context:** The analog-planning pivot (see `context/symphony-os.md` in the vault,
and the de-nav commit `dce28fdc`). Planning happens on paper; Symphony holds the
commitments. This feature is the transfer step: photograph the written plan page,
review what was read, and land the items as placed tasks — without typing.

## Flow

1. **Entry:** "Plan from paper" in Today's ··· overflow menu (web only for v1).
2. **Capture:** reuse `CameraCaptureModal` (Continuity Camera on desktop) with a
   file-picker fallback. Image is downscaled to JPEG (existing `toJpeg` pattern)
   and uploaded to the `attachments` bucket at `{uid}/plan/{id}.jpg`.
   **No task rows are written at this stage.**
3. **Parse:** new edge function `parse-plan` (user-JWT auth, RLS-scoped client,
   same skeleton as `analyze-capture`). The client sends the placement window
   explicitly — `placeStart` = today, `placeEnd` = today + 13 days — plus the
   household members (`{id, name}`) and today's date. The Tend lesson applies:
   the client owns the window; the function never re-derives it. The prompt
   includes the window as an explicit weekday↔date calendar so the model never
   does date arithmetic. Claude vision returns structured items:
   `{ title, day: 'YYYY-MM-DD' | 'week' | 'inbox', assignee_id, note }`.
   The function validates (dates inside the window, assignee ids real, ≤40
   items) and returns them. **It writes nothing.**
4. **Review sheet:** items render as an editable checklist — retitle, change
   placement (a date in the window / This week / Inbox), change assignee,
   uncheck misreads. One "Add N tasks" button commits; Cancel discards.
5. **Commit:** each checked item becomes ONE `addTask` INSERT carrying its full
   placement (no follow-up writes — the addTask-then-setBucket race):
   - date → `scheduledFor` (local date) + `isAllDay: true` → bucket `timed`
   - This week → `bucket: 'week'` + **`weekStart`** (current week per
     `weekStartAnchor`) — `AddTaskOptions` gains `weekStart` and the INSERT
     gains `week_start` (localYmd; DATE column, never toISOString)
   - else → `bucket: 'inbox'`
   Unassigned items default to the current user (it's their plan page); items
   naming a member get that member. Context = the active domain (null when
   Universal), matching photo capture.

## Components

- `supabase/functions/parse-plan/index.ts` — vision parse, no writes
- `src/lib/planParse.ts` — response validation + item→addTask mapping (pure,
  unit-tested)
- `src/hooks/usePlanFromPaper.ts` — upload + invoke + validate
- `src/components/capture/PlanReviewSheet.tsx` — the editable checklist modal
- `src/components/capture/PlanFromPaperFlow.tsx` — camera → parsing → review
  state machine, mounted in `HomeViewContainer`
- Wiring: `HomeViewContainer` → `HomeView` → `TodayView` overflow item

## Error handling

- Parse/API failure → error state in the flow with Retry (re-invokes with the
  same uploaded image; no re-upload).
- Unreadable page → `items: []` → "Couldn't read anything on this page" state.
- Commit is sequential `addTask` calls; a failure surfaces the built-in toast
  and leaves already-created tasks in place (each is independently valid).

## Out of scope (v2 candidates)

iOS entry point (separate build pipeline), recurring-routine detection,
multi-page plans, month/quarter placements, project/goal linking.

## Testing

- `planParse.test.ts` — validation (window clamp, unknown assignee, item cap,
  malformed rows) and mapping (date/week/inbox → addTask args; week stamps
  `weekStart`).
- `PlanReviewSheet.test.tsx` — rows render, uncheck excludes, commit payload
  reflects edits.
- `deno check` on the edge function; `tsc`; full vitest run.
- Manual: real handwritten page through the deployed function.
