# Family Feed Connectors — Design

**Date:** 2026-08-25
**Status:** Approved for planning
**Author:** Scott + Claude (brainstorming session)
**Supersedes:** §8 (Hermes fetcher) and §15.5 of `2026-05-31-family-capture-and-extract-design.md`. The rest of that spec stands and is partly shipped.

## 1. Problem

The twins started school the week of 2026-08-24. Two channels now carry the family's school logistics, and both are hostile to reading:

- **ClassDojo** — Class Story posts and teacher messages, locked inside an app nobody wants to open.
- **WhatsApp parent groups** — a handful of genuinely useful messages per week buried in continuous chatter.

The few real items (a permission slip, a bring-this-tomorrow, a party RSVP, a schedule change) are lost in the volume. Scott's requirement, stated directly: **truly hands-off — never log into ClassDojo again, just have the important bits appear in Symphony.**

## 2. Goals / Non-Goals

**Goals**
- Both feeds reach Symphony with **no human action in the loop**.
- Only the signal surfaces: todo items and time-bound facts, plus a one-line summary of the discarded noise so nothing is *silently* dropped.
- Items are attributed to the right twin where the source says so.
- Nothing auto-commits to Today. Confirm-before-commit is preserved.
- The connector cannot send, react, or otherwise write to either service.

**Non-Goals**
- No new extraction pipeline. `extract-capture` is shipped and is reused unchanged.
- No per-message extraction (cost and noise; see §5.2).
- No replies, no outbound anything, on either channel.
- No image/vision path in this phase (still deferred from the 2026-05-31 spec).

## 3. Decisions locked (this session)

| Decision | Resolution |
|---|---|
| Trigger | **Fully automatic.** Reverses the "manual trigger" decision of 2026-05-31. |
| ClassDojo transport | Authenticated HTTP client against the app's own API. **Spike required** (§4.1) before the adapter is designed; Playwright in the same worker is the fallback. |
| ClassDojo via email | **Rejected — verified dead.** Their notification mail is a content-free stub ("Gorby shared a post… View now"). It can signal *that* something happened, never *what*. |
| WhatsApp transport | **Read-only companion device** (Baileys multi-device, QR-linked once). Reverses the 2026-05-31 rejection; Scott accepted the ToS/ban risk on 2026-08-25 for a receive-only client. |
| WhatsApp scope | **Named threads only** — an explicit watchlist. Every other chat, including all 1:1s, is never read. |
| Host | **Fly.io machine (~$5/mo) with a volume.** Not the Mac Mini (§4.2). |
| Cadence | **Batched, twice daily** (midday + evening). No keyword tripwire in v1. |
| Review surface | **One "School · N" dropdown** in Today's controls strip, both feeds merged, chipped by source and by child. |
| Old Hermes/Mac Mini plan | **Dead.** Michael retired 2026-08-04; that path is not resurrected. |

## 4. Rationale for the two contested choices

### 4.1 Why an API client, not DOM scraping

The 2026-05-31 spec assumed Playwright driving the ClassDojo web UI. The ClassDojo clients talk to a REST API (`home.classdojo.com/api/…`) with a session cookie, which — if it holds — is dramatically less brittle than DOM selectors and cheaper to run. **This is an assumption, not a verified fact.** Task 0 of the plan is a one-hour spike that must answer:

1. Does a scripted login succeed, and does it hit 2FA or a captcha?
2. Can class-story and message threads be listed with `since`-style pagination?
3. What identifies a class/thread stably, for use as `source_key`?

If any answer is no, the fallback is Playwright inside the same worker behind the same contract (§6). Nothing downstream changes either way — that isolation is the point.

### 4.2 Why not the Mac Mini

The old plan put this on `scotts-mac-mini-2`. That box has a documented history of exactly the failure this feature cannot tolerate:

- FileVault means it does not come back after a reboot without someone SSHing in to type the account password.
- pm2 boot autostart was never installed — services do not return on their own.
- `open-brain` crash-looped for 17 days with nothing alerting.

School logistics the family depends on should not inherit that. A Fly machine restarts itself, keeps session state on a volume, and holds its secrets outside anyone's laptop.

### 4.3 Why serverless is not an option

A WhatsApp companion device holds a **persistent websocket** and long-lived session state. That cannot live in a Vercel Function or a Supabase Edge Function regardless of package-size limits. The always-on process is a hard requirement, which is what makes the host question real.

## 5. Architecture

```
Fly.io machine "symphony-connectors" (always-on, 1 volume)
  ├─ whatsapp adapter ── Baileys companion device, RECEIVE-ONLY
  │     persistent socket; buffers messages for watched threads only
  └─ classdojo adapter ── authenticated HTTP client, polls on the flush tick
        │
        │  batched flush: midday + evening
        ▼
  POST /functions/v1/capture-to-inbox      [existing, x-capture-secret]
        kind: 'whatsapp_export' | 'classdojo_thread'
        source_key: 'whatsapp:3B Parents' | 'classdojo:3-01-gorby'
        ▼
  extract-capture                          [SHIPPED — unchanged]
        checkpoint dedupe → chunk → Claude → candidates + summary + gaps
        ▼
  tasks  (bucket='inbox', context='family', scope='compound')
  notes  (one "Capture: <source>" summary + gaps note)
        ▼
  "School · N" dropdown in Today's controls strip → TriageRow → commit
```

### 5.1 The reuse that makes this small

The WhatsApp adapter **formats its buffered messages into the same `[date, time] Sender: msg` text that `parseWhatsAppExport` already parses.** The live feed therefore reuses the shipped parser, `filterSince`, and the `capture_checkpoints` dedupe with zero new parsing code. ClassDojo posts as `classdojo_thread`, a value the `captures` CHECK constraint already permits.

Net new code is the worker and its two adapters, a watchlist table, a three-line validator extension, and one UI surface. The extraction brain is untouched.

### 5.2 Why batched, not streamed

A parent group can produce eighty messages in an evening. Extracting per message would multiply LLM spend and hand the noise straight back — the exact failure this feature exists to prevent. The worker buffers per source and flushes on a schedule; school logistics move at day-scale, not minute-scale.

**No urgency tripwire in v1.** A keyword rule ("tomorrow", "bring", "RSVP") sounds smart and reliably produces false alarms. If the twice-daily cadence proves too slow in practice, that is a v2 change made against evidence.

## 6. Connector contract

Both adapters are swappable behind one contract. Neither has any Symphony-specific logic beyond its `source_key` prefix.

```ts
interface FlushPayload {
  user_email: string          // resolved to user_id by CAPTURE_USERS
  kind: 'whatsapp_export' | 'classdojo_thread'
  source_key: string          // stable: "whatsapp:<jid>" | "classdojo:<classId>"
  source_label: string        // human: "3B Parents" | "3-01 Mr. Gorby"
  text: string                // new messages since the local high-water mark,
                              // rendered as [date, time] Sender: msg
}
```

Posted to `capture-to-inbox` with `x-capture-secret`. A failed POST is retried on the next tick; the worker's local high-water mark advances **only after a 2xx**, so a failed flush re-sends rather than loses. `capture_checkpoints` remains the authoritative server-side dedupe, so a duplicate re-send is harmless.

## 7. The send-lockout invariant

The entire low-risk argument for the WhatsApp companion device rests on it never writing. That must be **structural, not conventional**:

- The adapter module exports no send/react/read-receipt/presence function. The paths are absent from the build, not merely unused.
- A unit test asserts no outbound-message symbol is reachable from the adapter's exports.
- The adapter never marks messages read, never joins or leaves a group, never updates presence.

If a future change needs to send anything on WhatsApp, that is a new design conversation with a new risk decision — not an incremental edit.

## 8. Data model

**New:**

```sql
-- capture_sources: the watchlist. Which threads the connector may read.
create table capture_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector in ('whatsapp','classdojo')),
  source_key text not null,          -- matches captures.source_key
  source_label text not null,
  child_member_id uuid references family_members(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);
```

`child_member_id` gives a source-level default attribution (a class feed is about one twin) that a candidate's own `forWho` overrides when the text names a child explicitly.

**Existing, unchanged:** `captures`, `capture_checkpoints`, `tasks`, `notes`.

**Verification required before any of this is built:** confirm `2026-05-31_captures_and_checkpoints.sql` actually ran in production. The migration file exists, but this repo's migrations are known to drift from the deployed database. If those tables are absent, slice 1 has never worked and that is fixed first.

**DDL delivery:** `capture_sources` DDL goes to Scott to run. The Management API curl is blocked by the classifier, and per standing practice the SQL is put in front of him *before* code is written against it.

## 9. Review surface

Candidates already land as `bucket='inbox'`, `context='family'`, `scope='compound'` tasks. What is new is where they are triaged.

**A "School · N" trigger in Today's controls strip**, beside the existing Week/Month `HorizonPoolDropdown` triggers, using the same `TriageRow` + `applyTriageVerdict` machinery. Rows lead with a complete checkbox, matching the pools. Each row is chipped with its source label and, where known, the child.

This placement is deliberate and constrained by two standing rules:

- **Today is a commitment surface.** Nothing from a feed appears on Today until it is triaged there.
- **The daily review is backlog-only, capped at five, and pools must never enter it** — stated twice on 2026-08-19, and a collapsed-pool-in-drawer attempt was rejected. `ReviewDrawer` is therefore untouched by this work.

The summary/gaps note (`Capture: <source>`) remains a note, not a task, and is reachable from the dropdown header rather than occupying a triage row.

Desktop-only, `hidden md:flex`, consistent with the other strip controls.

## 10. Failure modes

| Failure | Behavior |
|---|---|
| ClassDojo login fails / API shape changes | Adapter marks the source failed with a message; the School dropdown header shows "ClassDojo pull failed". WhatsApp is unaffected. |
| WhatsApp session unlinked (phone unlinks the device) | Worker logs it and surfaces the same header state; requires a re-scan. Explicitly alerted — a silently dead connector is the outcome this design exists to avoid. |
| Fly machine down | Health check alerts (§12). Messages are not lost: the local high-water mark did not advance, and both sources retain history. |
| Capture POST fails | Retried next tick; high-water mark unadvanced. Server-side checkpoint makes re-sends idempotent. |
| LLM extraction fails | Existing behavior — `captures.status='failed'` with the error recorded. |
| Nothing new since last flush | Existing behavior — no candidates, summary reads "Nothing new since …". |

## 11. Security & privacy

- WhatsApp session state and ClassDojo credentials live **only in Fly secrets and the machine's volume** — never in Supabase, never in the repo, never on a laptop.
- The watchlist is an allowlist. Threads absent from `capture_sources` are never buffered, never read, never transmitted. Private 1:1 conversations never leave the phone.
- Ingest reuses the existing `x-capture-secret` + `CAPTURE_USERS` model.
- ClassDojo automation is ToS-gray and knowingly accepted; it is confined to one swappable adapter.
- The WhatsApp companion device is unofficial and against WhatsApp's terms. Accepted by Scott on 2026-08-25 for a receive-only client on his personal account, on the reasoning that enforcement overwhelmingly targets *sending* behavior. §7 is what keeps that reasoning true.
- Raw capture text is purged 30 days after triage (default carried from the 2026-05-31 spec).

## 12. Health

The 17-day silent outage is the explicit anti-goal. The worker emits a heartbeat on every flush tick; a missing heartbeat past a threshold surfaces in Symphony rather than requiring anyone to notice an absence of school news. A feed that has gone quiet must be distinguishable from a feed that has gone dead.

## 13. Testing

- **Unit:** WhatsApp message → export-format rendering (multi-line, media placeholders, sender names); high-water-mark advance only on 2xx; watchlist filtering rejects unlisted threads; **the §7 send-lockout assertion**.
- **Unit:** ClassDojo response → `FlushPayload` mapping, including `source_key` stability.
- **Contract:** a `classdojo_thread` payload flows through `capture-to-inbox` → `extract-capture` identically to a WhatsApp one.
- **Existing:** the 12 `extract-capture` tests must stay green (`npx vitest run supabase/functions/extract-capture`).
- **e2e:** a seeded capture-derived candidate appears in the School dropdown; triage commits it; it does not appear on Today before triage, and the ReviewDrawer is unchanged.

## 14. Build order

0. **Spike + verify.** ClassDojo API path (§4.1, ~1h). Confirm the `captures`/`capture_checkpoints` migration is live in prod (§8). Hand Scott the `capture_sources` DDL.
1. **Fly worker skeleton + WhatsApp adapter**, read-only, watchlist-driven, flushing to `capture-to-inbox`. End-to-end on one real parent group.
2. **ClassDojo adapter** behind the same contract.
3. **"School · N" triage surface.**
4. **Retention purge + health alert.**

Steps 1 and 2 each deliver value alone; step 3 is what makes the result pleasant to use.

## 15. Open items deliberately deferred

- **Image/vision path** (flyer photos) — still deferred from 2026-05-31.
- **Apple Share Extension** — no longer needed for these two feeds; remains unbuilt.
- **Urgency tripwire for same-hour surfacing** — v2, only against evidence that twice-daily is too slow.
- **Iris's own connector instance** — this phase links Scott's accounts only; the candidates are `scope='compound'` so she sees the output.
