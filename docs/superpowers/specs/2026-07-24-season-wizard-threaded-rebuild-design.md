# Season wizard — threaded rebuild (Phase 1: Year → Season)

**Date:** 2026-07-24
**Status:** design — awaiting mockup approval before build
**Scope:** the **Year→Season seam, end-to-end** — the seasonal guided session
(write side) **and** the `/season` and `/year` horizon pages (read side). Later
seams (Season→Month, Month→Week, Week→Day) are later phases, each covering both
its wizard and its page.

## The systemwide frame: one model, two surfaces

The thread (`goal_id` / `source_id`) is written and read in two places that must
tell the **same** story:

- **Wizards — the write side.** You *create* the thread: pick under goal, move
  under pick, placement under move.
- **Pages — the read side.** The rest of the time you *see and navigate* the
  thread on the standing horizon pages.

If the wizard threads a pick under a goal but `/season` still renders a flat 8-slot
grid, the thread is invisible the moment you leave the wizard. So every phase ships
**wizard + page together**, both sitting on the **same pure helpers** —
`lineageLabel`, `goalRollup`, `goalsWithoutMoves`, `betPulse`/`threadsToBet`. Two
invariants across every page:

1. **Every item shows a one-glance thread breadcrumb** (`← Pick ← Goal`).
2. **Every page shows coverage/gaps** — which parents have nothing under them
   (untouched goals, picks with no move this month). The gap read is what makes the
   flow *obvious* instead of implied.

---

## Why

A cascade audit of Scott's real data (108 open items) found the planning
levels are six parallel flat lists, not a connected cascade:

- Only ~8% of tasks carry the thread (`goal_id` / `source_id`).
- Both current season picks carry **no** `goal_id`.
- 3 of 7 year goals are reached by zero work.
- The "documents" goal's real steps sit stranded in the Inbox.

Root cause is architectural: the season wizard's `look-at-year` step is a
**read-only** reference ("look, don't link"), and `write-season` is free text.
Nothing populates the thread, so goals float disconnected from the work meant to
serve them, and duplicates accumulate because the same idea is re-captured at
multiple altitudes instead of carried down one thread.

## Grounding: Best Laid Plans (Sarah Hart-Unger)

Confirmed against the source (chs. 3–6):

- Her **"nested goals"** = our `goal_id` thread. Central, not optional.
- **No effort sizing.** No S/M/L, no points, no per-item weight anywhere. Seasonal
  priorities are loose intent — "scan your list, write what belongs, don't think
  too much about the rest." She prescribes no number of seasonal priorities.
- **Energy, not effort,** is her one weighting instrument — a "Look Within" beat
  at every horizon.
- **Capacity is resolved at the Week** ("Time Tetris with your 168 hours"), by
  placing items against real calendar time — not by pre-sizing.

Design consequences: **no sizing UI, no load meter.** Season stays directional.
The soft pick cap is explicitly a Symphony backstop, not from the book. Capacity
is deferred to the week's existing "place the big rocks" step.

## Goal (Phase 1)

Rebuild the seasonal session so a pick is **created already anchored** to a year
goal (`goal_id` + `picked_at` set at insert), by walking the goals one at a time,
per-domain filtered, with migrate-or-release discipline for last season's picks.

## Non-goals (Phase 1)

- No changes to Month / Week / Day wizards (later phases reuse this pattern).
- No effort sizing, load meters, or point budgets (rejected per source).
- No schema changes (`goal_id`, `picked_at`, `context`, `scope` all already exist).
- No AI coherence check yet — a deterministic nudge only; AI is later polish.

## The reconfigured seasonal arc

Current (`SESSIONS.seasonal` in `sessions.ts`): welcome → season-review →
look-at-year → projects-in-motion → season-ahead → look-within → write-season →
book-next.

New:

| # | id | type | title | change |
|---|----|------|-------|--------|
| 1 | `welcome` | narration | A fresh season | unchanged |
| 2 | `season-review` | review | Carry, win, or release last season's picks | **enhanced** — migrate-or-release |
| 3 | `pick-by-goal` | **pick-by-goal (new)** | Choose this season, goal by goal | **replaces** `look-at-year` + `write-season` |
| 4 | `standalone-picks` | write-list | Anything that doesn't serve a goal | **new** — skippable escape, goal-less picks |
| 5 | `season-ahead` | calendar | The season ahead | unchanged |
| 6 | `look-within` | reflect | Look within | unchanged (energy check) |
| 7 | `book-next` | book-next | Anchor the next step | unchanged |

`projects-in-motion` is dropped from the seasonal arc (its intent — surfacing
in-motion work — is absorbed by the goal-anchored walk, which shows each goal's
existing picks).

## New step: `pick-by-goal` (the goal-anchored picker)

**Behavior — default-anchored, but skippable.**

- Renders the active year goals **filtered to the current domain** (via the
  canonical `filter*ForDomain` helpers + the per-domain session token).
- Under each goal, inline: the goal's **existing picks this season** (if any) and
  a **"+ Add a pick for this season"** affordance. Typing a title and confirming
  **inserts a `quarter` task with `goal_id` = this goal, `picked_at` = now,
  `context` = current domain**. The thread is a side effect of *where* you add —
  no separate "link" action.
- **Rule 1 — one goal, many picks:** adding a second pick under the same goal is a
  first-class affordance, not an edge case.
- **Skippable:** a goal you're not advancing this season → "Nothing this season,"
  move on. Untouched is a legitimate answer (no write).
- **Rule 2 — coherence nudge:** on add, a quiet, non-blocking coach line checks
  topical fit between the pick and its goal (deterministic keyword overlap for
  Phase 1). Never blocks the write.
- **Re-parent any pick (always available):** every pick chip — green/accepted ones
  included, not only amber-flagged ones — carries a quiet **"Move to…"** control
  that opens a goal picker and re-homes it. Mechanically an update of `goal_id`
  only (no delete/recreate); re-runs the coherence check against the new parent.
  The amber nudge and this manual move share one mechanism — the nudge is just the
  AI proactively surfacing an action that is always there.
- **Soft cap (10):** when total domain picks reach the cap, adding routes through
  the existing swap-at-cap flow. `PICK_CAP` moves 8 → 10 in `betPulse.ts`.
- **Goals-in-focus nudge:** a coach line when the user is advancing more than
  ~5–6 goals in one season ("a full plate for a quarter — anything next season?").
  Replaces effort-budgeting as the focus signal.

**Session-local visibility:** a just-added pick must stay on screen under its goal
even though its bucket/`picked_at` now qualifies it elsewhere — same pattern as
`ReviewStep`'s `movedIds` (remember added ids so the row persists through the step).

## Step 4: `standalone-picks`

A thin `write-list` (bucket `quarter`, `picked_at` set, **no** `goal_id`) for work
that legitimately serves no family goal — job search (NYSRA), admin, one-off fun.
Skippable. Keeps the escape hatch out of the goal-anchored walk so goals never get
polluted with ill-fitting items.

## Step 2: `season-review` (migrate-or-release)

Last season's open picks get an explicit fate, extending the existing `fate` rows:

- **Won** — complete it (existing).
- **Carry into this season** — keep as a `quarter` pick, re-stamp `picked_at` to
  the new season, preserve `goal_id`.
- **Release** — to `someday` (or archive). Enforces the prune Hart-Unger treats as
  the point of the ritual.

## AI assistance on every step (non-negotiable)

AI help must be present on **every** step — reusing the existing two-layer machinery,
not rebuilding it:

- **Layer 1 — deterministic coach lines** (`coachLines.ts` / `CoachLines.tsx`):
  instant, no network — the coherence nudge, goals-in-focus, stale-carry callouts.
- **Layer 2 — session-scoped guide** (`GuideChat.tsx` → `agentStream` →
  `symphony-agent` edge fn): per-step remount, carries `sessionContext` (horizon,
  step, **current goal + its existing picks**, domain, level-above, goals).

Every step exposes **both** the always-present "Ask your guide" chat **and** a
step-appropriate suggest/act affordance:

| Step | AI act |
|------|--------|
| `pick-by-goal` | "✨ Suggest picks for [goal]" (goal-scoped, tap-to-fill); AI coherence read; "sharpen this pick" (reuse `sharpen-goal` edge fn) |
| `season-review` | "which of last season's picks are worth carrying?" |
| `standalone-picks` | "surface inbox items that don't fit a goal" |
| calendar / look-within / book-next | guide chat + light summarize ("what's already claimed?") |

**Invariants:** suggestions are **tap-to-add chips — tapping is the only write
path; AI never writes directly.** `sessionContext` includes the live pick list so
suggestions never duplicate what's already there. Offline → one quiet line; the
ritual is never blocked.

## Horizon pages — read side (Phase 1: `/season` + `/year`)

Both pages render inside `HorizonView`. Today they show the level above as a side
reference panel (`referenceLabel`) with picks in a flat `BetsGrid`. Phase 1 makes
the thread the organizing structure.

**`/season`:**
- `BetCard` shows its **`← Goal`** breadcrumb (data already passed via `goalsById`;
  surface it). Picks group/annotate under their goal rather than reading as a bare
  8-slot grid.
- A **coverage row** — "goals not yet picked this season" — from `goalsWithoutMoves`
  (bucket `quarter`), so untouched goals are visible on the page, not just in the
  wizard. Each is a one-tap "pick this season" that opens the anchored add.
- Each pick card carries the same quiet **"Move to…"** re-parent control as the
  wizard (updates `goal_id` from the page) — re-threading works from the page, not
  only inside a session.
- Bench unchanged, below.

**`/year`:**
- Goals as the spine; under each goal, its **season picks** (coverage) with the
  existing `goalRollup` progress. Untouched goals carry a quiet "0 moves this season"
  flag — the live version of the cascade map's red rows.

Both reads are **domain-filtered** like the rest of the page (follows the app's
domain switcher, as `HorizonView` already does for its pools).

## Files touched

**Write side (wizard):**
- `src/components/planning/guided/sessions.ts` — seasonal arc.
- `src/components/planning/guided/stepTypes/PickByGoalStep.tsx` — **new**.
- `src/components/planning/guided/stepTypes/ReviewStep.tsx` — carry-into-season fate.
- `src/components/planning/guided/GuidedContext.tsx` + host — methods:
  `createAnchoredPick(goalId, title)`, `carryPick(id)`, `releasePick(id)`.

**Read side (pages):**
- `src/apps/tasks/HorizonView.tsx` — season/year blocks: breadcrumb + coverage row.
- `src/components/planning/season/BetCard.tsx` — surface the `← Goal` breadcrumb.
- `src/components/planning/season/BetsGrid.tsx` — goal grouping/annotation.
- Year block: goal-spine coverage read (component TBD — likely extend the existing
  year rendering in `HorizonView` / `YearCalendarGrid` companion list).

**Shared:**
- `src/lib/planning/betPulse.ts` — `PICK_CAP` 8 → 10.
- `src/lib/planning/coachLines.ts` — coherence nudge + goals-in-focus nudge.
- Domain filtering: reuse the canonical `filter*ForDomain` helpers — verify a
  **goals** helper exists; add `filterGoalsForDomain` (same shape) if not.
- Tests alongside each (write side, read side, helpers).

## Data flow

```
active goals ──filter by domain──▶ pick-by-goal step
   user adds pick under goal G
     └▶ insert tasks{ bucket:'quarter', goal_id:G, picked_at:now,
                      context:domain, scope:… }  (announceLocalWrite)
        └▶ /season page: partitionSeason() shows it as a threaded pick under G
```

No new columns; `partitionSeason` already keys picks off `picked_at`, and
`goalRollup` already rolls progress up by `goal_id`.

## Testing

- `pick-by-goal` renders only current-domain goals.
- Adding a pick writes `goal_id` + `picked_at` + `context`; row persists in-step.
- "Nothing this season" writes nothing.
- Standalone pick writes `picked_at` but **no** `goal_id`.
- Cap at 10 routes to swap.
- `season-review`: carry re-stamps `picked_at`, keeps `goal_id`; release moves bucket.
- `coachLines`: coherence nudge fires on low keyword overlap; goals-in-focus nudge
  fires above threshold.

## Rollout / gates

1. **Mockup approval before build** (standing rule for planner surfaces) — after
   this spec is approved, build an HTML mockup of `pick-by-goal` for Scott's sign-off.
2. Implement on this branch; `tsc` + tests green; ship to a **preview** deploy for
   Scott to run against his real data before merging to `main`.
3. Later phases apply the same anchored-write pattern to the remaining seams —
   each a separate spec, but the same reusable component (see roadmap).

## Full roadmap — all horizons (one pattern, four seams)

The `pick-by-goal` step is really **"write-anchored-to-parent."** Every seam reuses
it, pointed at a different parent level, so proving Phase 1 de-risks all of them.
**Each phase ships both surfaces — the wizard (write) and the page (read).**
Vocabulary → bucket mapping: **Goal** (goals table) → **Pick** (`quarter` +
`picked_at`) → **Move** (`month`) → **Placement** (`week` → `timed`).

| Seam | Wizard step (write) | Page (read) | Thread written | Phase |
|------|---------------------|-------------|----------------|-------|
| — (top) | Year: domain-tagged Goals; someday feeds picks | `/year`: goal spine + pick coverage | goals (anchor) | **1 (light)** |
| Year→Season | Pick inside a Goal | `/season`: picks under goals + gap row | `quarter` + `goal_id` + `picked_at` | **1** |
| Season→Month | Move under a Pick (copy-down) | `/month`: moves under picks + starving read | `month` + `source_id`→pick + inherited `goal_id` | 2 |
| Month→Week | Placements from Moves, placed on days | `/week`: placements under moves + grid | `week`→`timed` + `source_id`→move + `goal_id`; **capacity gate** | 3 |
| Week→Day | today's placements, matched to energy | `/today`: breadcrumb up to goal | `timed` + `source_id` + `goal_id` | 4 |

Enablers already in place: `lineage.inheritedLineage()` carries `goal_id` down every
rung (roll-up stays a flat filter); `look-within` (energy) exists at each level;
the week's `place-rocks` schedule grid is Hart-Unger's "Time Tetris" capacity gate.
Downstream phases mainly convert today's read-only `look-above` reference panels
into the anchored-write step and make copy-down the primary write action.

## Open questions

- Confirm a domain filter helper for **goals** exists; if only events/routines
  helpers exist, add `filterGoalsForDomain` following the same shape.
- Coherence nudge: deterministic keyword overlap is assumed sufficient for Phase 1
  (AI version deferred). Confirm.
