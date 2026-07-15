# Planning guide: lineage + coach lines + session AI

Built 2026-07-15 (cloud session, Best Laid Plans work). Branch: `feat/planning-guide`.

## What this adds

**1. Cascade lineage (`2026-07-15_task_lineage.sql`)**
- `tasks.source_id` — the task a copy was copied down from (season→month, month→week).
- `tasks.goal_id` — the annual goal a task serves; stamped on promotion, inherited by every copy, so roll-up is a flat filter.
- `tasks.is_fun` — the fun-audit mark.
- All additive/nullable: existing rows and code paths untouched; pre-existing copies simply have no thread.

Wired through: `Task` type, `useSupabaseTasks` (map/insert/update ×2), copy-down in
`LookAboveStep` + `HorizonView` (reference panel and Copy-to-week), and a new
**"Start this season"** promote chip on year goals in the seasonal look-above step.

Visible as: breadcrumbs on horizon rows ("← Ship auth layer ← Firebase rebuild",
`lineageLabel`), lineage-aware "on this list" checks, and per-goal progress bars on
the Year rung (`goalRollup` — "3 of 7 moves done").

**2. Layer 1 — deterministic coach lines (`lib/planning/coachLines.ts`)**
Pure functions over GuidedHost data, rendered between narration and step body
(`CoachLines.tsx`): stale-carry callouts (deferCount ≥ 3) on review steps, year-goal
season coverage on the seasonal look-above, live fun tally (2:1 target) on write-list
steps (with per-row ✨ toggle in `WriteListStep`), idle in-motion projects on the
projects step. No network, no model, no latency.

**3. Layer 2 — session-scoped AI guide (`GuideChat.tsx`)**
"Ask your guide" + "Suggest moves" (write-list only), collapsed by default, per-step
remount. Every turn carries `sessionContext` (horizon, step, live list titles, level
above, goals) via `agentStream.ts` → `symphony-agent` edge fn, which injects it as a
coaching preamble next to the existing `taskContext` block. Suggestions come back as
tap-to-add chips — tapping is the only write path. Agent offline ⇒ one quiet line;
the ritual is never blocked.

## Verification
- `tsc --noEmit` clean; eslint: 0 errors, warnings at baseline (new-file warnings fixed).
- Full vitest: 3381 passed / 3 skipped (baseline 3351 — +30 new tests: lineage 12,
  coachLines 12, parseSuggestions 6).

## To ship (manual steps)
1. Review branch, then apply the migration: `supabase db push` (or run
   `2026-07-15_task_lineage.sql` against prod) **before** merging to main — the
   client inserts write `source_id`/`goal_id`/`is_fun`.
2. Deploy the edge fn: `supabase functions deploy symphony-agent`.
3. Push the branch; merge to main when happy (pre-push hook runs tsc + tests).
4. Housekeeping: delete `.clone/_to_delete/` (a fat repo tarball from the transfer)
   and `.clone/symphony-lean.tgz`; `git worktree remove .worktrees/planning-guide`
   after merge.

## Review notes
- `createTaskInBucket` signature changed (positional projectId → opts object); all
  callers + tests updated.
- Narration variant text for the new promote/fun affordances not added — the existing
  scripts still read correctly; coach lines are visual-only by design.
- Backfill of historical lineage deliberately skipped (would be fabrication);
  title-match fallbacks keep old copies showing "on this list" correctly.
