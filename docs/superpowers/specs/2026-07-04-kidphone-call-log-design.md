# Kid-Phone Call Log / Missed Calls — Design

Date: 2026-07-04
Status: Approved, ready for planning

## Problem

The wall's Phone feature (`WallV2PhoneScreen.tsx`) lets kids tap a contact to place
an outbound call, bridged through Twilio via the separate `kid-phone` Firebase
project. There is no call history anywhere:

- `call_log` (Postgres, `supabase/migrations/2026-06-28_call_log.sql`) inserts a row
  when a call is *requested*, but nothing ever updates it past `status='requested'`.
  `callStatus.ts` in kid-phone receives Twilio's real `DialCallStatus` on call
  completion and discards it (`void status`).
- Inbound calls (someone calling the kid-phone number) are screened by the same
  allowlist + quiet-hours logic as outbound, and every attempt — allowed or
  rejected — is logged to kid-phone's own Firestore (`logCall`), but **none** of
  that reaches Symphony. Rejected inbound calls don't even trigger the existing
  live-call event bridge; only allowed ones do (to show a caller-ID takeover on
  the wall).

Net effect: neither a parent nor a kid can see who called, who was missed, or
whether a call was blocked (wrong number, or during quiet hours).

## Goals

- Unified call log covering **both directions** (kids calling out, others
  calling in), for both **parent** (Symphony app) and **kid** (wall) audiences.
- Fix outcome accuracy: log real terminal states (`completed`, `no_answer`,
  `failed`, `rejected`), not just "a call was attempted."
- Surface quiet-hours rejections (a call was tried and blocked), for both
  directions.
- No raw phone numbers reach any UI — consistent with the existing rule that
  the wall/browser never sees phone numbers.

Explicitly out of scope for this iteration: exposing *disallowed-number*
attempts distinctly from quiet-hours rejections in the UI (both land under a
generic "Rejected" status with a `reason`, but no separate moderation/alerting
flow); log retention/cleanup policy; call recording or transcripts.

## Approach

Extend the **existing live-call event bridge** rather than building a second,
parallel one. Today: kid-phone's `callStatus.ts` (outbound Dial completion) and
`incoming.ts` (inbound, allowed branch only) call `publishCallEvent`, which POSTs
to Symphony's `kid-phone-call` edge function, which upserts the `current_call`
singleton row that the wall's `useCurrentCall` hook subscribes to for the live
caller-ID takeover.

We widen that same event to carry `outcome`/`reason`, and fire it from every
terminal state (including rejections, which today publish nothing). The
`kid-phone-call` edge function keeps writing `current_call` unchanged (live UI
is not touched) and *additionally* writes a durable row to `call_log`.

Rejected alternative: a second, independent logging-only webhook. Lower risk
to the live-call code path, but doubles the secret-gated plumbing between the
two repos for something the existing bridge already does 90% of. Not worth the
duplication.

## Data model changes

`call_log` (new migration, additive):

- `status` check constraint: add `'rejected'`
- `reason` (text, nullable): `'quiet_hours' | 'not_allowed' | null`
- `contact_name` (text, nullable), `contact_photo_url` (text, nullable) —
  denormalized from kid-phone's contact match at write time. This avoids ever
  needing to join back to kid-phone's Firestore contact list at read time, and
  keeps the "no raw numbers to the UI" property: only a name/photo is stored
  for display, never alongside a resolvable number for unmatched calls.
- Inbound and rejected rows are **inserted fresh** (no prior `requested` row
  exists for them, unlike outbound calls which get a `requested` row from
  `place-call` and are later updated by `call_sid`).

## kid-phone changes (`~/Developer/kid-phone`)

- `callStatus.ts`: stop discarding `DialCallStatus`/`CallStatus`; map Twilio's
  value to `completed | no_answer | failed` and include it in the
  `publishCallEvent` payload.
- `incoming.ts`: call `publishCallEvent` on the **reject** branch too (today
  only `result.allow` does), carrying `reason` and any matched name/photo.
- Outbound quiet-hours/allowlist rejection path (`initiateCall.ts` /
  `voiceWebhook.ts` — confirm exact file during planning) gets the same
  treatment: publish a `rejected` event instead of only returning a 409 to
  `place-call`.
- `callEvents.ts`: widen the shared `CallEvent` type with optional
  `outcome`/`reason` fields.

## Symphony changes

- `supabase/functions/kid-phone-call/index.ts`: keep the existing
  `current_call` upsert; add a `call_log` write on every terminal event
  (`ended` → update the outbound row by `call_sid`, or insert a fresh row for
  inbound/rejected).
- New edge function `list-call-log`: returns only
  `direction, contact_name, contact_photo_url, status, reason, created_at` —
  never `to_number`. Used by the wall (kid-facing) so no number can leak to
  the kiosk browser.
- Parent-facing settings page reads `call_log` directly via existing RLS
  (`auth.uid() = user_id`) — no new edge function needed there, since it's the
  account owner viewing their own data, not the wall.

## UI

**Wall** (`WallV2PhoneScreen.tsx`): a small Contacts/Recents toggle at the top.
Recents shows touch-friendly rows: photo, name (or "Unknown" for an unmatched
inbound caller), relative time, and a status icon (answered / missed /
quiet-hours-blocked). Tapping a row for a known contact re-dials via the
existing `placeCall`.

**Parent settings page** (new route, e.g. `/settings/kid-phone`): a table of
direction, name (masked partial number like "•••1234" when unmatched, so an
unrecognized caller is still identifiable at a glance), status/reason pill,
and timestamp. Most-recent-first, simple pagination. Reads `call_log` directly.

## Testing

- kid-phone: unit tests for the outcome-mapping in `handleCallStatus` and for
  the new reject-branch `publishCallEvent` call in `handleIncoming` (Vitest,
  already used in this repo).
- Symphony: unit tests for `kid-phone-call`'s new `call_log` write logic
  (insert vs. update-by-`call_sid` branching).
- Component tests for the wall Recents tab and the new settings page.

## Open questions for planning

- Exact file/function name for the outbound quiet-hours rejection path in
  kid-phone (confirm during implementation — likely `initiateCall.ts`).
- Whether the parent settings page needs its own sidebar entry or lives under
  an existing Settings area — follow current app navigation conventions found
  during planning.
