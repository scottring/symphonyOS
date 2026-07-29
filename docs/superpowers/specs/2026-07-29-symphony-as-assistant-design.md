# Symphony as Personal Assistant — direction + design

*2026-07-29 — brainstorm handoff. Sections 1–3 approved by Scott. Sections 4+ not yet presented.*

---

## Status

This is an **in-progress brainstorm**, not a finished spec. Do not start implementing.
Resume by presenting section 4 (see "Not yet designed") and getting approval, then
finish the spec and hand to `superpowers:writing-plans`.

---

## Why this exists

Scott opened with: *"it is becoming clear to me that what I want is for Symphony to be my
personal assistant, as well as my family's personal assistant. it seems like that's the
direction i've been trying to head in."*

This is the third time he's landed here. Two prior vision notes say the same thing in
different words — the March "capture → intelligence → action → knowledge" loop and the
March 27 "proactive contextual assistant" note whose worked example was *Camp Notre Dame*.
Both times the direction was recorded and then planning-surface work was built instead.

---

## Direction decisions (from Q&A, one question at a time)

| Question | Scott's answer |
|---|---|
| What does "assistant" do that Symphony doesn't? | **Holds all the context.** Knows every person, project, thread — vault, email, calendar, Symphony — and you ask in plain language instead of hunting through pages. |
| Where does context live? | **Two-way, each authoritative.** Vault owns notes and thinking; Symphony owns time and doing; they sync both directions; the assistant reads across both and can write into either. |
| Whose assistant is it? | **Iris gets her own.** A real second user with her own private context plus a shared family layer. Requires actual multi-user privacy boundaries, not a domain filter. |
| Go to it, or comes to you? | **Ambient on every surface.** Present wherever he is — wall, phone, desktop. Not an "assistant page." |
| What happens to the built pages? | **The assistant runs the cascade.** Horizon planning stops being something he navigates and becomes something it walks him through. Pages become the record; the assistant is how you move through them. The horizon work becomes the assistant's playbook. |
| Proof moment | **Mid-task, everything already there.** Open "Call Camp Notre Dame" and the number, the history, what was already tried, and what to say next are all sitting there — without having assembled it. |
| Scope vs. priority #5 | **Re-rank it.** Symphony moves up the stack deliberately rather than being built guiltily at #5. |

**Approach chosen: A — context graph first.** Build one shared retrieval layer; every other
piece becomes a consumer. Rejected: B (ambient shell first — he already has three
half-ambient surfaces; a fourth shallow one is what got him here) and C (one entity all the
way down — kept as the *delivery* method, not the architecture).

**Iris is explicitly phase 2.** Scott's call. Flagged risk: multi-user privacy
infrastructure only pays off if she'll use it — worth confirming with her before it shapes
the schema.

---

## The finding that reframed everything

**Most of this is already built.** Verified in the tree at `179f2b41`:

- **`supabase/functions/proactive-engine/index.ts`** — 906 lines. Rule-based tier plus an AI
  tier (`claude-haiku-4-5-20251001`, line 640) that only fires for tasks the rules didn't
  already cover (line 545). Emits the single best next action per item with
  call / text / email / open_link / guided_chat / camera / create_task payloads. This *is*
  the Camp Notre Dame vision, implemented.
- **`src/types/proactiveSuggestion.ts`** — `proactive_suggestions` with confidence, action
  payloads, and an `active → acted → dismissed → expired` lifecycle.
- **`action_history`** — records what was tried and the outcome.
- **`supabase/functions/vault-write/index.ts`** (322 lines) + **`src/hooks/useVaultWrite.ts`** —
  the vault write-back path exists. Two-way sync is half-built.
- **`supabase/functions/vault-sync/index.ts`** — writes `notes`, `projects`, `tasks`,
  `contacts`, `note_entity_links`.
- **`supabase/functions/semantic-search/index.ts`** — `search_notes_semantic` RPC (line 79).
- **`supabase/functions/symphony-agent/index.ts`** — 1,146 lines.
- **`supabase/migrations/2026-06-17_ai_engine_runs_claim.sql`** — `claim_engine_run(key,
  interval)`, an atomic cross-device gate so exactly one client runs the engine per interval.

So the question is not "how do I build an assistant." It is **why the one he built doesn't
feel like one.** Three verifiable reasons:

1. **Reach.** `useProactiveSuggestions` is consumed in exactly one place —
   `TodayView.tsx:342`. `ScheduleItem.tsx:154` renders suggestions *"shown on hover."*
   `ProactiveSuggestionChips.tsx` (165 lines, the nicest component of the set) **is imported
   by nothing**. Projects, goals, week, month, wall, mobile detail panels: none.
2. **Depth.** The engine queries six tables — `tasks`, `contacts`, `calendar_connections`,
   `email_action_items`, `action_history`, `proactive_suggestions`. It never reads vault
   notes, projects, goals, routines, meals, family members, or attachment facets. It reasons
   about a task with roughly a quarter of what Symphony knows.
3. **Cold start only.** *(Corrected mid-conversation — an earlier claim that "nothing
   schedules it" was wrong.)* It does run on an interval, claimed cross-device
   (`useProactiveSuggestions.ts:149`, `:160`). It only goes cold when no Symphony client is
   open anywhere. Cadence is largely solved.

---

## Approved design

### Section 1 — Architecture *(approved)*

Extract retrieval out of `proactive-engine` into a shared module,
`supabase/functions/_shared/context-graph/`, with one entry point:

```
assembleContext(entityType, entityId, userId) -> ContextBundle
```

The engine becomes a *consumer* that reasons over the bundle instead of assembling it.
`symphony-agent` becomes the second consumer, so chat and suggestions finally see the same
world. The bundle is the contract; the two sides evolve independently.

The vault stays authoritative for notes: `vault-sync` in, `vault-write` out. The graph reads
the **synced copy** in Postgres, never reaching for GitHub live.

### Section 2 — The context bundle *(approved)*

| Part | Source | Why |
|---|---|---|
| **Entity** | `tasks` / `calendar_events` / `projects` / `goals` | The thing itself — notes, links, phone, location |
| **People** | `contacts` via `contact_id`, `assigned_to`, attendees | Who it's about and who owns it, with numbers and email |
| **Lineage** | `project_id` → project → goal | *Why* it exists. The engine currently can't see a task belongs to Sappi Alfeld |
| **Attached facts** | `attachments` → `facets` (`src/types/facets.ts`) | Already-extracted phone numbers, access codes, addresses, checklists, purchase specs — built, validated, and invisible to the engine |
| **Knowledge** | `note_entity_links` (explicit) + `search_notes_semantic` (implicit) | Where the vault enters. Explicit links first, then top-k semantic |
| **History** | `action_history` | Turns "call them" into "you left a message Tuesday; follow up" |
| **Time** | Calendar neighborhood, due dates, staleness, `defer_count`, `waiting_since` | Whether *now* is the moment |

Two rules stated explicitly:

- **The bundle is data, not prose.** Typed structures, never a pre-rendered prompt string.
  The engine turns it into a prompt; the agent turns it into chat grounding; a future UI can
  render it with no model call at all. Prose would restrict consumption to an LLM.
- **Retrieval is bounded and ranked.** Semantic matches capped at top-k with a similarity
  floor; history capped at most-recent-N. Otherwise a task on a large project pulls in half
  the vault and every consumer gets slower *and* worse. Cost and quality point the same way.

Testing: `assembleContext` is pure-ish over the DB, so it takes real unit tests against
fixture rows — which the current engine effectively cannot have, retrieval and reasoning
being fused inside one 906-line handler.

### Section 3 — Reach *(approved)*

**One component, many surfaces.** `<ContextChips entityType entityId />` — self-fetching,
rendering suggestions plus the facts the bundle surfaced (the number, the access code, the
address, the last thing tried). This is `ProactiveSuggestionChips.tsx` given a data source
and a home. V1 placements:

1. **Task detail panel** (`TapContextPanel`) — the deepest version of the proof moment; has none today
2. **Today's `ScheduleItem`** — wired but hover-only
3. **`ProjectView`** — zero today; where lineage context pays off most
4. **Overdue section** — already accepts the prop, just isn't passed one

**Widen the engine's read to the bundle.** `proactive-engine` swaps its six hardcoded
queries for `assembleContext`, so it reasons over vault notes, lineage, and facets. Same
prompt structure, much better input. The rule tier gains new rules needing no model at all —
an attached facet with a phone number *is* a call action; an access code *is* a chip.

**One cold-start fix.** A `pg_cron` job running the engine server-side each morning so
suggestions are warm before he opens anything. Reuses `claim_engine_run` so it can't
double-bill against a client run, and respects the `src/lib/quietHours.ts` window that fixed
the Supabase egress problem.

**Density tension, named not papered over.** Today is already overloaded (27 of 28 tasks
all-day, ~57 rows). Persistent chips add vertical weight to the page that most needs less.
**Decision: persistent chips everywhere except Today**, where they stay hover/tap-reveal
until the Today density work lands. The detail panel is the honest home for depth; Today
stays a list.

---

## Not yet designed

Resume here. Present as sections, one at a time, approval after each:

4. **Error handling and degradation** — what a chip shows when retrieval partially fails,
   when the vault sync is stale (see the GITHUB_PAT silent-failure precedent), when the AI
   tier is rate-limited or the key is unbilled. Freshness signalling: how does he know a
   suggestion is based on week-old vault state?
5. **Cost and billing bounds** — the engine widens its input substantially; token cost per
   run rises. Which key pays (`symphony-supabase`), what the ceiling is, whether the AI tier
   should shrink as the rule tier gets better inputs.
6. **"Assistant runs the cascade"** — Scott approved this as direction but it has no design.
   The largest unscoped piece. Probably its own spec after the context graph lands.
7. **Two-way vault sync, completed** — `vault-write` exists; what's missing, conflict
   handling, what Symphony is allowed to write into the vault.
8. **Iris as phase 2** — privacy boundaries, shared layer, schema implications. Confirm she
   wants it before it shapes the schema.
9. **Testing strategy** — fixture rows for `assembleContext`; how the engine's output gets
   evaluated at all today.

---

## Open questions for Scott

- Does Iris actually want her own assistant? Asked once, deferred to phase 2 — but it should
  be answered before schema work, not after.
- "Re-rank it" was decided in the abstract. Against what — the job search, or Sappi? The
  vault's priority stack needs an explicit edit, not a quiet drift.

---

## Constraints that apply

- `CLAUDE.md`: never edit or commit in the main worktree; feature worktree off `origin/main`;
  push the moment a unit of work is done. Pushes to `main` auto-deploy to production.
- `npm test` is vitest **watch** mode — use `npx vitest run`.
- Pre-push `tsc` is not the same as the Vercel build; run `npm run build` before
  type-sensitive pushes.
- Type-checks are not inspection. Open port 5173 and look at the thing.
- No emojis in UI — lucide icons.
