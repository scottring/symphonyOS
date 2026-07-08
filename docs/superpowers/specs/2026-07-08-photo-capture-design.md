# Photo-first capture (v1, iOS) — design

**Date:** 2026-07-08
**Origin:** Walkthrough of a real miss — burned-out kitchen light fixture. Scott photographed it with ChatGPT (not Symphony) because Symphony had no path from "photo of a thing in my hand" to "AI-extracted context on the right task, readable on my phone at the store."

## The flow

1. **Capture (iOS, kitchen):** Camera button on QuickCaptureBar → snap → phone goes in pocket. The app downscales/JPEGs the photo, uploads it to the `attachments` storage bucket (`{userId}/capture/{ts}.jpg`), creates an inbox task titled "Analyzing photo…" with `capture_meta = {status:'pending', storage_path}`, and fires one call to the `analyze-capture` edge function.
2. **Enrichment (server, background):** `analyze-capture` signs a URL for the image, sends it to Claude Sonnet vision with the user's open-task list, and gets back JSON: an identifying **title** ("Replacement bulb — T8 18W 4-pin"), a plain-text **note** (What it is / Specs / Where to buy / At the store, say / Notes), and an optional **suggested_task_id** match. It updates the task (title, notes, `capture_meta.status='done'` + suggestion) and inserts an `attachments` row so the photo is filed on the task. Realtime sync pushes the enriched item back to every client.
3. **Triage (iOS inbox):** The enriched item shows a destination chip — "→ Buy replacement light bulbs?" One tap merges: note appended to the target task's notes, attachment repointed to the target, capture task deleted. Ignoring the chip is fine; the item is a complete task on its own.
4. **Execution (store):** iOS TaskDetailView shows the note (existing field) **and the photo** (new attachments section) — hold the picture up to the store employee.

## Decisions (from the walkthrough)

- **Camera-first**, not chat-first or paste-first: the ideal gesture is snap-and-pocket.
- **Fire-and-forget to inbox** with a suggested-destination chip — never force a decision at capture time (Symphony's capture→triage philosophy), but smart routing is one tap away.
- **iOS only for v1** (capture happens on the phone; store execution happens on the phone). Web inbox still shows the enriched item + photo via existing DetailPanel attachments; chip UI on web is a fast follow.
- **Note + photo at the store** (B over note-only): showing the picture is half the value.
- **Client-triggered edge function** (over DB-webhook or reusing symphony-agent chat): simplest, debuggable; the function takes `{taskId, storagePath}` and doesn't care who called it, so DB-triggering later is trivial. Retry: on app foreground, re-invoke for own tasks stuck in `capture_meta.status='pending'`.
- **Cost:** one Sonnet vision call per capture ≈ 1–2¢. The ChatGPT detour costs more in friction.

## Schema / backend changes (applied 2026-07-08 via Management API)

- `tasks.capture_meta jsonb` — `{status: 'pending'|'done'|'failed', storage_path, suggested_task_id, analyzed_at, error?}`.
- `attachments` UPDATE RLS policy (`auth.uid() = user_id`) — needed for the merge to repoint `entity_id`.
- New edge function `supabase/functions/analyze-capture/` — user-JWT auth (symphony-agent pattern), model `claude-sonnet-4-6`, idempotent (done → no-op; attachment insert skipped if storage_path row exists), failure writes `status='failed'` so the client can retry or surface it.

## iOS changes (branch `ios-sliders`)

- `QuickCaptureBar`: camera button → `UIImagePickerController` (camera) sheet → `PhotoCaptureService` (resize to ≤1600px JPEG, upload, create task via existing insert path, call edge function with session token).
- `SymphonyTask` + `RowMapper` + push serializer: `capture_meta` round-trip (serialization tests updated — column sets are test-locked).
- `InboxView`: suggestion chip when `suggestedTaskId` resolves to a live task; tap = merge (append notes, repoint attachment, delete capture task).
- `TaskDetailView`: attachments section — fetch `attachments` rows for the task, render via signed URL.
- Foreground retry pass for stuck `pending` captures.

## Out of scope (v1)

Web capture/camera, wall, chip on web inbox, voice annotation at snap time, multi-photo captures, Share Extension (snap in Camera app → share to Symphony — natural v2).
