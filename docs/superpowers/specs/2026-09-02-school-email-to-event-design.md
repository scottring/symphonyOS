# School Email → Event with Per-Person Items — Design

**Date:** 2026-09-02
**Status:** Draft for Scott's review
**Author:** Scott + Claude
**Supersedes:** the "email is the product" stance of 2026-08-29 (`school-digest` stays as-is for the ClassDojo/WhatsApp feeds; this spec covers **forwarded email** only). Reuses the capture/extract pattern of `2026-05-31-family-capture-and-extract-design.md`.

## 1. The promise this has to keep

The landing page's anatomy section, verbatim: *"The Hillside Weekly Update was 900 words. Symphony read it and turned the part that matters into one block — dated, assigned, and ready the night before."* Four claims: **extracted event**, **per-person items**, **source attached**, **everywhere at once** (both phones + the wall). Plus the hero's *"Tomorrow, assembled"* evening block.

Today none of that exists: `school-digest` emails a summary and writes nothing; `email-scanner` writes `email_action_items` that no client reads; `extract-capture` turns threads into a pile of inbox candidates — the "School pool" that was deleted on 2026-08-29 because a pile of candidates is a landfill, not a plan.

## 2. Goals / Non-goals

**Goals**
- A household forwards a school email once (or sets a Gmail filter). Nothing else to do.
- Each dated, actionable event in the email becomes **one block on its day** with **per-person items** underneath, the **original email one tap away**.
- Items surface **the night before** and **on the day** on Today, on both phones, and on the wall's per-kid day view.
- Wrong extractions are cheap to fix or dismiss, and nothing is silently dropped.
- Works for a stranger's household: no Google scopes, no per-user secrets, no Scott-only env maps.

**Non-goals**
- No Gmail read scope (Google verification blocks strangers). Forwarding only.
- No replies, no bounces, no outbound email of any kind.
- ClassDojo/WhatsApp feeds are unchanged (still the daily digest).
- No PDF/image attachments in v1 — the text body only; an unreadable attachment becomes a gap flag, not a guess.

## 3. Decisions locked (2026-09-02)

| Decision | Resolution |
|---|---|
| How email gets in | **Per-household forwarding address** on symphony-os.com via Cloudflare Email Routing → Email Worker → edge function. The domain's MX is already Cloudflare. |
| Address identity | A **secret token per household**: `<token>@symphony-os.com`. The token is the auth (like Slack's email-to-channel). The `From` header is NOT checked — Gmail auto-forward filters keep the school's From. |
| Commit policy | **Auto-place, review after.** Dated events with confidence ≥ 0.75 land on their day immediately, badged "From an email". Undated or low-confidence items go to Inbox. A quiet review affordance lists what arrived. |
| Per-person items | **Subtasks** (`parent_task_id`) with `assigned_to` = the household member and `needed_on` = the day the item is needed. No new table. |
| Source attached | The capture row (`captures`) holds subject, sender, and body; the task panel shows the quote and opens the original. |
| Extraction model | `claude-sonnet-5` — one call per email, accuracy matters more than the haiku cost saving. |

## 4. Architecture

```
School → parent's inbox → forward (or Gmail filter) → <token>@symphony-os.com
        │
        ▼  Cloudflare Email Routing (catch-all → Worker; hello@ keeps its own rule)
  infra/inbound-mail (Email Worker)
        parses MIME (postal-mime), html → text, POSTs JSON + x-capture-secret
        │
        ▼
  edge fn inbound-email            [NEW]  token → household → owner user
        captures.insert(kind='email', household_id, subject, sender, raw_text,
                        source_key='email:<Message-ID>')   ← idempotent
        ▼ invokes
  edge fn extract-email            [NEW]  Claude → {events[], todos[], good_to_know[], gaps[]}
        planWrites(extraction, members, today)  ← PURE, unit-tested
        ▼
  tasks: parent event row (+ per-person subtasks)    ← auto-placed on its date
         undated/low-confidence → bucket='inbox'
  notes: one "From <sender>: <subject>" note with good-to-know + gaps
        ▼
  Today / This Week / wall render the rows; task panel shows the source;
  "New from email" review sheet lists what arrived, with fix / dismiss.
```

### 4.1 Inbound (Cloudflare)

`infra/inbound-mail/` — `wrangler.toml` + `src/index.ts`. The `email()` handler:
1. Reads the recipient local-part → `token`. Reject (drop, no bounce) if it doesn't look like a token.
2. Parses the raw message with `postal-mime`; prefers `text/plain`, else strips `text/html` (same reduction `email-scanner` already does).
3. POSTs `{ token, message_id, from, subject, text, received_at }` to `${SUPABASE_URL}/functions/v1/inbound-email` with `x-capture-secret`.
4. On non-2xx, `throw` so Cloudflare retries; on 2xx, done. Never `message.reply()` or `forward()`.

Deploy is a one-time manual step for Scott: `npx wrangler login && npx wrangler deploy` inside `infra/inbound-mail/`, then Cloudflare → Email → Routing → catch-all → *Send to Worker*. The `hello@` rule stays above it. Secrets via `wrangler secret put`.

### 4.2 `inbound-email` (edge, Deno)

Auth: `x-capture-secret` (existing `CAPTURE_SHARED_SECRET`). Steps:
1. `households where inbound_token = $token` → `household_id`, owner `user_id` (the `household_members` row with role owner, else the earliest member).
2. Idempotency: `captures.source_key = 'email:' || message_id` has a partial unique index; a duplicate returns 200 with the existing id and does nothing.
3. Insert `captures` row: `kind='email'`, `household_id`, `user_id` (owner), `subject`, `sender`, `raw_text`, `source_label` = sender display name or domain, `status='pending'`.
4. Fire-and-forget `extract-email` with `capture_id` (same pattern as `capture-to-inbox`).

### 4.3 `extract-email` (edge, Deno)

Prompt asks for **events first, items per event, then loose todos, then good-to-know**, strict JSON. Shape:

```ts
interface EmailExtraction {
  events: Array<{
    title: string                     // "School Picture Day"
    date: string                      // YYYY-MM-DD, required for an event
    time?: string                     // HH:mm local, omit for all-day
    location?: string
    for: string[] | 'everyone'        // first names as written in the email
    items: Array<{
      text: string                    // "Payment envelope in backpack"
      for: string[] | 'everyone'
      needed: 'night_before' | 'day_of' | string /* YYYY-MM-DD */
    }>
    source_quote: string              // the sentence(s) this came from, verbatim
    confidence: number                // 0–1
  }>
  todos: Array<{ title: string; due?: string; for?: string[]; source_quote: string; confidence: number }>
  good_to_know: string[]
  gaps: Array<{ kind: 'unreadable_attachment' | 'truncated' | 'low_confidence'; note: string }>
}
```

The prompt is given the household's member first names and which are children, so "each student" resolves to the children, "parents" to the adults, and a name it can't match stays as text on the item ("for Ms. Reyes' class").

`planWrites()` is a pure function (`lib/plan.ts`, Deno-tested) from `(extraction, members, todayYmd, capture)` to `{ parents: TaskRow[]; children: (parentIndex, TaskRow)[]; inbox: TaskRow[]; note: NoteRow }`:

- **Event → parent task** when `date` present and `confidence ≥ 0.75` and `date ≥ today − 1`:
  `title, category='event', context='family', scope='compound', bucket='timed', scheduled_for=date(+time), is_all_day=!time, location, capture_id, assigned_to = the one matched member if `for` is a single name, assigned_to_all = the matched member ids (a uuid[] column, not a flag) if 'everyone', notes = "From <sender> · <subject>\n\n“<source_quote>”"`.
- **Item → subtask** per matched member (an 'everyone' item becomes one subtask per child; an item with no match becomes one unassigned subtask): `parent_task_id, title=text, assigned_to=member, needed_on = date − 1 | date | explicit, context='family', scope='compound', bucket='inbox', capture_id`.
- **Todos, low-confidence events, past events** → `bucket='inbox'` family tasks with `capture_id` (today's `extract-capture` shape). Never dropped.
- **Dedupe across emails**: before inserting a parent, look for an incomplete task in the household with `capture_id IS NOT NULL`, same `scheduled_for` date, and a normalized-title match (lowercased, punctuation stripped, ≥ 0.8 token overlap). If found: skip the parent, and add only subtasks whose text isn't already under it. Newsletters repeat Picture Day three weeks running; the block must not.
- `good_to_know` + `gaps` → one `notes` row (`source='import'`, `type='general'`, family/compound), like `extract-capture`.

Writes use the service role (same as every ingest function) and the derived-scope rule (`scopeFor`) copied from `extract-capture` — nothing writes a literal scope.

Failure → `captures.status='failed', error=…`, surfaced in Settings (§4.6). The Worker's retry only covers delivery; a failed extraction is retried by a "Retry" button in Settings, not automatically.

### 4.4 Today: the block and the items (the landing's hero row)

`ScheduleItem` already renders `originalTask.subtasks` — but only when `stepsOpen` and only at `md:` and up. Change:

- **Per-person items render inline, always, on every width** when the row's subtasks have an `assignedTo` OR the row has a `captureId`. Each item: a check circle that completes the subtask, the member's pill (initials + color from `family_members`), the text. Plain subtasks keep today's collapsed behaviour.
- **Badge**: rows with `captureId` get a small "From an email" label in the subtitle slot (the `rowSubtitle` position), matching the landing.
- **Evening "Tomorrow, assembled"**: `neededToday()` gains a second group. From 17:00 local, the Needed Today note also lists items with `needed_on = viewedDate + 1`, under a "Tomorrow" heading, each with its member pill. Same rendering caps; same "a date expires" semantics (nothing is cleared, the match just moves).
- **This Week** already renders timed family tasks on their day; the parent shows as a block on the grid with no change. Subtasks stay hidden there (the day is the unit at that rung).

### 4.5 Source attached (task panel)

`TapContextPanel` gets a `PanelSource` section, rendered only when `task.captureId` is set: sender · subject · received date, the `source_quote` in a quiet quote style, and "Open original" which expands the capture's `raw_text` inline (plain text, scrollable, no HTML rendering). Reads `captures` through a small `useCapture(id)` hook. `captures` RLS gains a household-read policy (§5) so the partner who didn't forward the email can still open it.

### 4.6 Review after (quiet, not a scoreboard)

- **Today footer**: next to the existing backlog "Review" link, a second quiet link "New from email" appears only while the household has captures with `status='extracted'` and `reviewed_at IS NULL`. No counts on Today (house rule).
- **Review sheet**: one capture per section (sender · subject), its rows underneath: the event (date, time), its items, inbox todos. Per row: **Keep** (default, no action), **Fix date** (opens `SchedulePopover`), **Dismiss** (deletes the row + its subtasks, with undo, same pattern as the To-buy list). Closing the sheet stamps `reviewed_at` on every capture shown.
- **Settings → General → "School mail" card**: the household's forwarding address with a copy button, the one-line instruction, and the last five captures (subject · received · status), with **Retry** on a failed one. This is also where a founding household is shown the address during hand-onboarding.

### 4.7 Wall

`KidDayView` builds from `buildMemberDayModel`. Add a "Needed today" card at the top of a member's day listing their subtasks with `needed_on = today` (and, after 17:00, a "Tomorrow" card for `today + 1`), each a checkbox row like assigned tasks. Same rows, same completes, so ticking on the wall ticks on the phone.

## 5. Data model (one migration, `2026-09-02_school_email_ingest.sql`)

```sql
alter table households add column if not exists inbound_token text unique;
-- ensure_inbound_token(p_household uuid) returns text: security definer; asserts
-- the caller is an ACTIVE household_members row for p_household; returns the
-- existing token or generates one (16 chars from a-z2-7, via gen_random_bytes)
-- and stores it. The Settings card calls it; nothing else writes the token.

alter table captures drop constraint captures_kind_check;
alter table captures add constraint captures_kind_check
  check (kind in ('text','whatsapp_export','classdojo_thread','image','email'));
alter table captures
  add column if not exists household_id uuid references households(id) on delete cascade,
  add column if not exists subject text,
  add column if not exists sender text,
  add column if not exists reviewed_at timestamptz;
create unique index if not exists captures_email_message_idx
  on captures (source_key) where kind = 'email';

-- Read: the owner (existing) OR any member of the capture's household.
create policy captures_household_read on captures for select
  using (household_id is not null and users_share_household(auth.uid(), user_id));
create policy captures_household_review on captures for update
  using (household_id is not null and users_share_household(auth.uid(), user_id))
  with check (household_id is not null and users_share_household(auth.uid(), user_id));
```

`tasks` needs nothing: `parent_task_id`, `assigned_to`, `assigned_to_all`, `needed_on`, `capture_id`, `is_all_day`, `category`, `scope` all exist. The `tasks_capture_idx` partial index already covers the review query.

**Trap to honour:** never partial-`upsert` `tasks`; inserts are plain inserts, subtask inserts happen after the parent insert returns its id.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| Unknown / malformed token | Worker drops silently (no bounce — backscatter is worse than a lost forward). Logged to Worker tail. |
| Edge fn down | Worker throws → Cloudflare retries delivery. |
| Duplicate Message-ID | `inbound-email` returns 200, no-op. |
| Extraction throws / refusal | `captures.status='failed'`; Settings shows it with Retry. Nothing partial is written: `planWrites` runs before any insert; inserts are parent-then-children per event, and a failed child insert marks the capture failed with the parent left in place (visible, fixable) rather than rolled back invisibly. |
| Member name not matched | Item becomes an unassigned subtask with the name kept in its text. Never guessed onto a child. |
| Email with nothing actionable | Note only ("Nothing to do — good to know: …"); capture marked extracted; the review link still lists it once. |

## 7. Testing

- **Deno**: `extract-email/lib/plan.test.ts` — the pure `planWrites` against fixtures: Picture Day with two kids; "each student" fan-out; night-before vs day-of `needed_on`; low-confidence → inbox; past event → inbox; dedupe against an existing block; unmatched name stays unassigned. `prompt.test.ts` — parser rejects malformed JSON and clamps confidence.
- **Vitest**: `ScheduleItem` inline items on mobile width with member pills and completion; "From an email" badge; `neededToday` Tomorrow group before/after 17:00 and across the date boundary; review sheet Keep/Fix/Dismiss + undo + `reviewed_at`; Settings card copy + Retry; `PanelSource` renders quote and expands the original; `KidDayView` Needed-today card.
- **Worker**: `infra/inbound-mail/src/index.test.ts` (vitest, node) — token parsing, html→text fallback, non-2xx throws, never calls reply/forward (structural test like the WhatsApp send-lockout).
- **Manual, before the first founder**: forward a real Hillside newsletter to the household address; confirm the block, the items on both phones, the wall's kid card, and the original in the panel.

## 8. Phases

1. **Server** — migration; `inbound-email`; `extract-email` + `planWrites`; Worker code. Deployable and testable by curl before any UI exists.
2. **Today** — inline per-person items; badge; Tomorrow group; panel source section.
3. **Review + Settings** — review sheet + footer link; School mail card; token RPC.
4. **Wall** — Needed-today card in `KidDayView`.
5. **Landing** — no copy change needed; the anatomy section becomes literally true.

Deploy order (load-bearing, as with `parse-page`): run the migration, deploy both edge functions with `--use-api`, THEN push the client. The Worker + Cloudflare routing step is Scott's; until it's done the address simply doesn't deliver, and nothing else breaks.

## 9. Open items (not blockers)

- Whether the token address lives on the apex (`<token>@symphony-os.com`) or a subdomain (`@in.symphony-os.com`). Apex is fewer DNS steps; subdomain keeps `hello@` cleanly separate. Default: apex.
- Attachments (PDF flyers) — v2, via `analyze-attachment` which already exists.
- iOS shows the block via the mirrored Today; the inline items need an `ios-sliders` follow-up.
