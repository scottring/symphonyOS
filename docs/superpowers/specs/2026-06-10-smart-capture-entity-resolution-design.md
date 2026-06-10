# Smart Capture v1 — Entity Resolution with Write-Back

**Date:** 2026-06-10
**Status:** Design approved (Scott, 2026-06-10); pending written-spec review
**Repos touched:** `symphonyOS` only
**Relationship to other work:**
- Complements (does not touch) the fenced Symphony chat assistant (`2026-06-03-symphony-assistant-fenced-design.md`, `2026-06-05-symphony-agent-edge-function.md`). That work is the *conversational* surface; this is the *capture* surface. Shared data model, no shared code paths.
- Builds on commit `2dfe86e` (2026-06-10), which wired `parseQuickInput` into the Add-to-Today submit handler. That gave the input explicit-syntax parsing at submit; this spec adds implicit entity resolution, as-you-type suggestions, and durable learning.
- Implements "Milestone 0" of the vault⇄Symphony hand-off brief (`scotts-world/outputs/symphony-task-enrichment-handoff.md`): local entity resolution + write-back, no vault dependency.

## Problem

Typing a bare task that names an entity does nothing smart. Real case (2026-06-10): Scott typed "Call Macmillan Guitars" into Add-to-Today. Macmillan Guitars existed as a contact with a phone number, and prior tasks with that contact established the topic (guitar repair). Symphony linked nothing — Scott had to open the detail pane, search People, and attach the contact by hand.

The existing parser (`src/lib/quickInputParser.ts`) only matches contacts on explicit syntax (`@mention`, `with X`) using naive substring comparison. Plain prose titles get no resolution. Nothing the user does to correct or confirm a match is remembered, so the system never gets smarter.

## Decisions already made (with Scott)

1. **Scope: quick-add only.** The Add-to-Today input is the v1 surface. (Because the resolver lands in the shared `useQuickParse` hook, QuickCapture and TimelineQuickInput inherit implicit resolution with no extra work, but no UI changes are made there in v1.)
2. **UX: inline suggestion as you type.** A suggestion line under the input before submit. Consequence: ~100ms latency budget → resolution must be local.
3. **Brains: local-only.** Fuse.js + history lookup client-side. No LLM in v1.
4. **Architecture: client resolver + DB-backed learning** (Approach B). Learning syncs across devices via Supabase; the resolver is a pure module liftable server-side later.

## Architecture

```
TodayAddInput  ──┐
QuickCapture   ──┼── useQuickParse (existing hook; gains resolver step)
TimelineQuick ──┘        │
                         ├── quickInputParser.ts   (existing — explicit syntax, untouched)
                         ├── entityResolver.ts     (NEW — implicit resolution, pure function)
                         └── ParsedFieldChips      (existing chip UI; gains ghost-suggestion state)

useResolutionLearning (NEW hook) ── Supabase: entity_aliases, resolution_log (NEW tables)
```

### Components

- **`src/lib/entityResolver.ts` (new).** Pure function:
  `resolveEntities(title, { contacts, projects, aliases, recentTasks }) → Suggestion[]`
  No I/O, no React. Purity is the seam: an edge function, the WhatsApp-extract path, or the chat agent can import the same module later without rework.
- **`useQuickParse` (modified).** After the existing explicit parse, if no contact was explicitly matched, run the resolver and expose the top suggestion (with score band) alongside the parsed result. Explicit syntax (`@`, `with`) always wins; the resolver never overrides it.
- **`TodayAddInput` (modified).** Becomes parse-aware like its siblings: uses `useQuickParse`, renders the suggestion line, and submits a structured result instead of a raw string.
- **`HomeViewContainer.onCreateTaskFromValue` (modified).** Gains an overload/branch accepting the structured result from the input. The existing raw-string parse path (added in `2dfe86e`) stays as fallback for any caller still passing a string. No double-parse: if structured input arrives, the handler does not re-parse.
- **`useResolutionLearning` (new hook).** Owns alias loading (once, alongside contacts) and fire-and-forget writes to the two new tables.

## Resolver logic — deterministic tiers

Ordered; first hit wins. All comparison on normalized text (lowercase, punctuation stripped, whitespace collapsed — reuse the parser's `normalizeStr`).

Before matching, a leading action verb (call, text, phone, email, visit, see, pick up) is stripped from the title; the remainder is the candidate text. Verb identity is kept for the phone-attach rule.

| Tier | Mechanism | Score |
|---|---|---|
| 1 | Learned alias: candidate n-gram matches `entity_aliases` row | 1.0 |
| 2 | Name containment: candidate text contains a contact's full normalized name | 0.95 |
| 3 | Fuzzy: Fuse.js over candidate n-grams vs contact names, threshold 0.35 | 1 − Fuse distance |
| — | No match | — |

Behavior is governed by the score band (below), regardless of tier — a tier-3 fuzzy hit scoring ≥ 0.9 pre-applies just like a tier-2 hit.

Confidence bands:
- **≥ 0.9 → pre-applied chip.** Linked by default; one tap (✕) unlinks.
- **0.6–0.9 → ghost suggestion.** Grayed, "tap to link"; ignored if untouched.
- **Tie at the top score → never pre-apply**; show ghost of the best candidate only.

Supporting rules:
- **History inference (display-only).** When a contact resolves, look up their most recent task in the already-loaded task store and render it in the suggestion line: `Macmillan Guitars · last: guitar repair follow-up (May 26)`. Never written into the new task.
- **Phone attach.** If the resolved contact has a phone and the title starts with a call-intent verb (call / phone / text), set `phoneNumber` on the created task → tap-to-call works immediately. This is the only intent rule in v1.
- Fuse instance memoized on contacts identity; resolution debounced 150ms in the input.

## Suggestion UX (TodayAddInput)

One suggestion line below the input — top candidate only, no list:

```
┌──────────────────────────────────────────┐
│ + Call Macmillan Guitars            Add │
├──────────────────────────────────────────┤
│ ✔ Macmillan Guitars · 410-555-0142      │   ← pre-applied: ✕ to unlink
│   last: guitar repair follow-up · May 26 │
└──────────────────────────────────────────┘
```

- High confidence: chip rendered checked; **Enter creates the task already linked** (zero extra interaction on the happy path).
- Medium confidence: same line grayed, "tap to link"; Enter without tapping creates unlinked.
- **Esc cascade:** first press dismisses the suggestion, second clears/collapses the input (preserving current behavior).
- Mobile: the suggestion line is a tap target ≥44px tall.

## Learning schema + write-back

Two tables; RLS `user_id = auth.uid()` on both.

```sql
create table entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  alias_normalized text not null,
  entity_type text not null check (entity_type in ('contact','project')),
  entity_id uuid not null,
  source text not null check (source in ('accepted','corrected')),
  hit_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, alias_normalized, entity_type)
);

create table resolution_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  input_text text not null,
  suggested_entity_type text,
  suggested_entity_id uuid,
  score real,
  tier text,
  action text not null check (action in ('auto_applied','accepted','dismissed','ignored')),
  task_id uuid,
  created_at timestamptz not null default now()
);
```

Write-back rules (all fire-and-forget; a failed write never blocks task creation):

| Event | Writes |
|---|---|
| Tier-1/3 match kept at submit | alias upsert (`hit_count + 1`, bump `last_used_at`) + log `auto_applied`/`accepted` |
| Tier-2 (containment) kept at submit | log only — no alias row; containment already finds it |
| Ghost tapped | alias upsert (`source: accepted`) + log `accepted` |
| Pre-applied chip ✕'d | log `dismissed` |
| Suggestion shown, ignored, task created | log `ignored` |

`resolution_log` is the labeled-example corpus from the hand-off brief — the substrate any future smarter layer (LLM pass, chat agent, cross-source enrichment) reads or trains on. Negative caching (suppressing repeatedly-dismissed matches) is deliberately deferred; the log already captures the data to add it as a v1.1 rule.

Aliases load once with contacts at app start. The table only grows when fuzzy matches are accepted, so it stays small; no pagination needed.

## Edge cases & failure behavior

- Explicit `@mention` / `with` present → resolver skipped for contacts entirely.
- Candidate text under 5 characters after verb stripping → tier 3 (fuzzy) disabled; tiers 1–2 still run.
- Family member names (`-name` namespace) excluded from contact fuzzy candidates.
- Contacts not yet loaded (cold start) → resolver returns nothing; capture behaves exactly as today. **Degradation is always "dumb capture," never blocked capture.**
- Offline → alias/log writes fail silently; suggestions still work from cached contacts.

## Testing

- **Unit (vitest), `entityResolver.test.ts`:** the Macmillan case verbatim; alias-tier hits; fuzzy threshold boundaries; tie → no pre-apply; verb stripping; explicit-syntax precedence; short-title guard.
- **Unit, learning:** alias upsert (new row vs increment); one log row per action path.
- **Component:** TodayAddInput — suggestion renders after debounce; Enter creates linked; ✕ unlinks and logs; Esc cascade; update `TodayView.test.tsx` expectations.
- **Repo process:** feature worktree off `origin/main`; `tsc --noEmit` + unit tests gate the push (pre-push hook); push to `main` auto-deploys.

## Out of scope (deliberate)

- Project fuzzy-inference (same mechanism; flip on in v1.1).
- Topic/notes seeding from history (display-only in v1).
- Any LLM involvement; deeper enrichment (call scripts, durations) per the hand-off brief's payload question — still open with the counterpart effort.
- Other capture surfaces: inbox triage, WhatsApp-extract candidates, MCP-created tasks.
- Negative caching of dismissed matches.
- Vault→Symphony enrichment pipeline.
