# Phase 3 — Cadence Engine (Design Spec)

> Built overnight 2026-06-08 from `~/Documents/scotts-world/docs/planning-rhythm-requirements.md`
> (the verbatim Scott+Iris requirements) + the renovation plan's Phase-3 hardening
> notes. Decisions made autonomously are marked **[DECISION]** for morning review —
> none are irreversible; all work lands on the `overnight` branch (preview only).

## Goal

Turn the five planning horizons into **real, structured sessions** that each
*review then plan* and *cascade down* — Daily → Weekly → Monthly → Seasonal →
Annual — so the rhythm becomes a guided ritual, not a set of empty buckets. Each
session honors the ⭐ horizon-scoped-pool invariant (shows only its own pool +
carry-over, never the firehose) and feeds the next horizon down.

## What already exists (reuse, don't rebuild)

- **Daily** = `PlanTodaySession` (W5) — anchors + carried-over + pull-from-week.
- **Weekly** = `WeeklyPlanningSession` — 4 steps (week ahead → to-dos → schedule → concerns), already wired with vault save.
- **Adaptive nudge** = `RhythmNudge` + `getDueSession` (W4) — currently weekly-only.
- **Time-block grid** = `PlanningSession` — reusable for any session's "schedule them" step.
- **Horizon pools** = `selectHorizonPool(tasks, horizon, match)` + `selectOverdue`.

## Architecture

### 1. Shared artifact home — `planning_sessions` table  **[DECISION: Supabase, not vault]**

Session substance (what was reviewed, the concerns/hopes-fears text, which items
were selected/cascaded) must be **shared between Scott + Iris**. Vault-write is
Scott-only, so the vault can't be the home for a couple ritual. The renovation
plan already calls for un-deferring a `planning_sessions` table — we build it.

```
planning_sessions (
  id uuid pk default gen_random_uuid(),
  household_id uuid not null,            -- shared visibility via RLS
  author_id uuid not null,              -- who ran it
  horizon text not null check (horizon in ('daily','weekly','monthly','seasonal','annual')),
  period_token text not null,           -- e.g. '2026-W23', '2026-06', '2026-Q2', '2026'
  notes jsonb not null default '{}',    -- { concerns, hopesFears, review, financialDone, ... }
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (household_id, horizon, period_token)
)
```

- **RLS:** members of the household can read/write (mirrors `users_share_household()`).
- One row per (household, horizon, period) → both partners edit the *same* row;
  a session resumes where it was left.
- **[DECISION]** Reflective prose (hopes/fears, conversation topics) lives in
  `notes` jsonb as plain shared text for Phase 3. Linking these to richer **vault
  notes** is explicitly **Phase 4** (why-chain) — not built here, to keep the
  doing-vs-thinking boundary and avoid the Scott-only vault-write problem.

A `usePlanningSession(horizon, periodToken)` hook loads/creates the row and
exposes `notes` + `patchNotes(partial)` (debounced upsert).

### 2. Adaptive "Plan" entry — extend the rhythm to all horizons

`getDueSession` grows from weekly-only to a priority-ordered check:
annual (September anchor) → seasonal (season turn) → monthly (first Saturday) →
weekly (configured day) → none. Returns the **highest-due** session.

- `RhythmNudge` already renders the due session with a "Plan the …" CTA + dismiss.
  It becomes horizon-aware (label + which session it opens).
- **[DECISION]** Cadence anchors default to the requirements: weekly = Sunday,
  monthly = first Saturday, seasonal = first day of each meteorological season,
  annual = September 1. All configurable later; only week-start + weekly toggle
  are surfaced in Settings now (from W4). Monthly/seasonal/annual anchors are
  constants this phase (config UI is a follow-up).

### 3. The five sessions (review → plan → cascade)

Each new session is a full-screen stepped view modeled on `WeeklyPlanningSession`'s
chrome (header + step dots + footer), reusing `StepWeekAhead`-style review and the
horizon pool list for selection. Common shape:

1. **Review** — the horizon's calendar/big-rocks + "the period in review" (last
   period's pool: done vs carried).
2. **Plan** — build this horizon's pool by pulling from the *next-higher* pool
   (the cascade): monthly pulls from seasonal; seasonal from annual; annual from
   goals. Selecting sets the item's `bucket` to this horizon.
3. **Concerns / topics** — free text → `planning_sessions.notes` (shared).
4. **Financial handoff** — **[DECISION]** money is OUT of Symphony, but every
   horizon's requirements list a financial step. So each session shows a calm
   **handoff slot**: "Financial review — do this in your finance tool" with a
   done-checkbox saved to `notes.financialDone`. No numbers, no budget UI.
5. **Hand down** — closes into the next-lower session (monthly → weekly), making
   the cascade a literal flow.

Per-horizon specifics (from the verbatim agenda):

- **Monthly** (`MonthlyPlanningSession`): month big-rocks review; plan monthly
  projects/goals/priorities; routines & delegation review; relationships &
  parenting prompt (text); financial handoff; → weekly.
- **Seasonal** (`SeasonalPlanningSession`): season-in-review; hopes & fears
  (text); seasonal goals/projects; trip & childcare planning prompt; fun & joy
  audit (text); financial handoff; → monthly.
- **Annual** (`AnnualPlanningSession`): year-in-review (wins/opportunities);
  macro hopes & fears; annual goals (links to Goals); annual calendar / trip
  dates (text); financial long-term handoff; → seasonal. (September anchor.)

**[DECISION]** Daily + Weekly are NOT rewritten — they already exist and work.
Monthly/Seasonal/Annual get the shared `notes` artifact + financial handoff;
Weekly's existing vault save is left as-is (Scott-only) and additionally mirrors
its concerns text to the shared `planning_sessions` row so Iris can see it.

### 4. The couple ritual (solo pass → shared pass)  **[DECISION: documented, light]**

The requirements describe a private solo pass then a shared couple pass. With two
accounts and scope-based sharing, Phase 3 keeps it light: each session operates on
the running user's items + shared (couple/compound) items, and the
`planning_sessions` row is shared so both see the same artifact. An explicit
two-phase "now switch to the couple surface" UI is **deferred to Phase 4** (the
"Us" surface) — noted, not built, to avoid speculative UX.

## Out of scope (this phase)

- Vault links for reflective prose (→ Phase 4 why-chain).
- The "Us"/couple surface and the solo→couple two-phase flow (→ Phase 4).
- Financial tooling of any kind (permanently out; handoff slot only).
- Monthly/seasonal/annual anchor config UI (constants now).
- The "map of my day/week/quarter/year" one-pagers (future).

## Testing

- `planning_sessions` migration applied via Management API; RLS spot-check.
- `usePlanningSession` upsert/merge unit-coverable via the notes-patch shape.
- `getDueSession` extended: unit tests for each horizon's anchor + priority order.
- Each session: smoke that review lists the right pool, plan-selection sets the
  right bucket, concerns text persists, financial-done persists, hand-down opens
  the next session.
- Full build (`tsc -b`) + `npx vitest run` green before any push.

## Rollout

All on `overnight` branch → previews only. **No push to `main`** (prod) until
Scott reviews. Migration is additive (new table + policies); no destructive DDL.
