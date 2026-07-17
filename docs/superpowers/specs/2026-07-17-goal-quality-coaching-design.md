# Goal-quality coaching on raw entry — design

**Date:** 2026-07-17
**Finding:** walkthrough #3 — raw goal entry (`/goals` "+ Add Goal", and the guided inline add) lets you commit a vague goal ("Make home into home") with no finish line. The guided flow *teaches* quality (past tense, a finish line, the 2:1 fun ratio) but raw entry reuses none of it.

## Decisions (with Scott)

- **Passive coaching + on-demand AI sharpen** (not an auto-check on save).
- **Conservative** deterministic vague-flag (rare, gentle) — the ✨ Sharpen button is always available regardless.
- Invariant throughout: **AI proposes; only the user's tap writes.**

## Layer 1 — Passive coaching (deterministic, no network)

**Teaching placeholder.** The goal add input placeholder becomes copy reused from the guided narration (`sessions.ts`): *"What's true by next year? Past tense — 'shipped…', 'finally…'"*. Applied in both `GoalsList` (the /goals inline add) and `DomainsGoalsStep` (guided add) so they match.

**Conservative vague-flag.** A quiet, dismissible hint appears under a saved goal *only* when it reads clearly vague. Heuristic (deterministic, unit-tested), all three required:
- ≤ 3 words, AND
- no digit, AND
- no past-tense / outcome verb (small suffix + keyword check: `-ed` words, "shipped/finished/launched/hit/reached/…").

Copy: a single line, e.g. *"name what's true by next year"*, with a dismiss ✗ and a Sharpen affordance. Never blocks; dismiss is per-goal (session-local). Deliberately narrow — most goals show no hint.

Lives in a pure helper `src/lib/planning/goalQuality.ts` → `looksVague(name: string): boolean`, so the heuristic is testable and reusable.

## Layer 2 — On-demand AI "Sharpen" (✨)

**Affordance.** A small ✨ Sharpen control on each goal row in `GoalsList` (always present, not gated on vagueness).

**Edge function** `supabase/functions/sharpen-goal` — mirrors `analyze-capture`'s one-shot shape (single small Claude call, no tools, JSON out). Input `{ name, areaName?, context? }`; output `{ suggestion: string, why: string }`. Prompt encodes the guided rules: rewrite as a past-tense outcome with a concrete finish line, keep the user's intent, one sentence.

**Client hook** `useGoalSharpen` mirrors `useNoteSuggestion`: session-scoped cache keyed by goal id (no re-bill on re-open), in-flight dedup, and it only fetches when invoked (a tap), never on render.

**Suggestion UI.** Tapping ✨ fetches, then shows the rewrite inline with **[Use this]** / **[Keep mine]** and the one-line "why". `Use this` = `updateGoal(id, { name: suggestion })`. `Keep mine` dismisses. Nothing writes until the tap.

## Surfaces & scope

- Primary: `GoalsList` (`/goals`) — placeholder, vague-flag, ✨ Sharpen.
- `DomainsGoalsStep` (guided) — the teaching placeholder only (guided already has narration coaching; ✨ optional there, add if trivial).
- **Out of scope:** the 2:1 fun ratio (task-level, already in guided `WriteListStep`); areas (categories, not goals); the auto-check-on-save variant (rejected as naggy).

## Testing

- Unit: `looksVague` heuristic (sharp goals pass, the three vague conditions flag, boundary cases).
- Unit: `useGoalSharpen` with a mocked edge fn (cache hit skips refetch; dedup; accept calls `updateGoal`).
- Component: `GoalsList` shows the vague hint only when `looksVague`, hides on dismiss; ✨ renders; accepting a suggestion calls `onUpdateGoal`.
- Existing GoalsList tests stay green.
- Edge fn: a light request/response shape test if the repo has an edge-fn test harness; otherwise manual verify + `supabase functions deploy sharpen-goal`.

## Rollout

- Client changes ship via the normal push-to-main deploy.
- The `sharpen-goal` edge function must be deployed separately (`supabase functions deploy sharpen-goal`) — the ✨ button no-ops gracefully (shows an error toast, keeps the goal) until it's live.
