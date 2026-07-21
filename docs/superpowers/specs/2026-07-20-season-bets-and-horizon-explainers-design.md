# Season Bets + Horizon Explainers — Design

**Date:** 2026-07-20
**Origin:** App-audit Session 3. Scott couldn't tell what the season page *is* ("are these season-level activities?"), and his real season list had 19 items. Root cause: the season list renders identically to a task list, and nothing teaches the cascade's vocabulary. Approved direction: give season its own identity ("bets"), cap the list with an overflow tray, and add an animated explainer per horizon.

## Vocabulary (the contract the whole design serves)

| Level | Noun | Grain test | Healthy count |
|---|---|---|---|
| Year | **Goal** | a direction; never "done" this quarter | 3–6 active |
| Season | **Bet** | an outcome true by season's end; measured in weekends | 5–8 |
| Month | **Move** | a concrete chunk; fits in a sitting or two | 10–15 |
| Week | **Placement** | a move on a day/time (the grid) | — |
| Today | the day itself | — | — |

Items soften from outcome-language (goals, bets) to task-language (moves, placements). "Bets" is deliberate: a bet can be lost without shame (matches the review step's carry/achieve/let-go attitude), and "19 bets" is self-evidently absurd — the word polices the count.

## 1. Season page (`/season`) — "Five bets and a shape"

Layout top to bottom (replaces the current list-of-rows body; cascade rail stays):

1. **Masthead:** season name + date range + `week N of 13` progress bar (existing `periodProgress`).
2. **Focus line:** "This season is about: ⟨one editable sentence⟩". Storage: keyed note, same mechanism as the wizard reflect step's `notesKey` (key `season-focus|<seasonToken>|<domain>`). Empty state shows the prompt text.
3. **The season's bets (cards, 2-col grid; 1-col mobile).** A bet card shows:
   - Outcome sentence (wraps, serif display feel — content, not chrome).
   - Provenance chip: `← <goal name>` via existing lineage (`goalId`); "seasonal" (no chip) when goal-less.
   - **Pulse:** per-month dots for the season's 3 months — does this bet have moves (tasks whose `sourceId`/`goalId` thread reaches this bet) on that month's list; filled = has moves, ring = has completed moves. Current month with zero moves renders the **starving state**: `nothing this month` + amber accent.
   - Quiet complete: a small check affordance on the card (sets `completed`, card collapses to a "won" style at grid bottom).
   - Tap card → existing task detail panel (bets are tasks; the panel is unchanged).
4. **Overflow tray — "These aren't bets yet."** Bets are the first 8 open `bucket='quarter'` tasks by `created_at`; items 9+ render in a visually muted tray below the grid with three exits per row: **Make it a month move** (rebucket to `month` — a *move*, not a copy; it was never a real bet), **Shelf it** (bucket `someday`), **Let it go** (delete w/ undo toast). Tray copy: "A season holds 5–8 bets. These are load — turn them into moves, shelf them, or let them go."
   - Soft cap, not hard: adding while ≥8 is allowed but the add lands in the tray with a notice. (Rationale: never block capture.)
5. **Month strip:** the season's 3 months as cells — month name, move count, mini progress — tap → `/month`. Replaces the parked ideal-week idea (deferred, revisit as a wizard step if missed).

**Outcome coach (shared util `looksLikeActivity(title)`):** flags activity-phrasings ("start working on…", "continue…", "work on…", "get a rough outline of…", "plan to…", leading bare verbs w/o object-outcome shape — heuristic list, tested). Where it fires (season inline add + wizard write-season rows): quiet hint + ✨ suggestion via the existing `sharpen-goal` edge fn pattern (new prompt variant `sharpen-bet`: rewrite as an end-state sentence). Never blocks saving.

## 2. Wizard ripples (seasonal session)

- **write-season step** becomes the bets writer: rows render as mini-cards, live counter `N of 8` (amber past 8, copy: "5 is a season; 19 is a backlog"), outcome coach inline. Same `WriteListStep` machinery, `rows: 'bets'` variant.
- **"Start this season"** translation prompt unchanged; the landed line now appears as a card immediately (payoff visible).
- Narration strings unchanged (TTS regen not required this pass); all new copy is on-screen text only.

## 3. Other horizons

- **Month page:** header line under masthead: "Moves — concrete chunks that fit in a sitting. 10–15 is a good month." Plus `serving N of M bets` (count of open bets with ≥1 move this month / total open bets) linking starvation visibility from below. Month rows stay task-shaped on purpose.
- **Goal detail (`/goals/:id`):** "Chapters" strip — one row per season that has a bet threading to this goal (season label + bet title + won/carried state). Same lineage query as rollup; read-only.
- **Week/Today:** no changes (new week grid already shipped).

## 4. Horizon explainers (animated, one per horizon)

**Component:** `HorizonExplainer` — full-screen dismissible overlay (same layer pattern as MonthZoomSheet), pure CSS animation (house style; no new deps). One shared engine + five scene scripts.

**Scene engine:** an explainer is `Scene[]`; a scene = one headline sentence + one animated vignette built from the app's real visual vocabulary (mini goal rows, bet cards, move rows, grid slots — small dedicated components, not screenshots). Scenes advance by tap/click/→ (and an optional auto-advance ~7s with progress dots); ← goes back; Esc/✕ dismisses. Each scene's vignette animates on entry via CSS keyframes (translate/fade/scale — respect `prefers-reduced-motion`: fall back to static frames).

**Scripts (4–6 scenes each; final copy written at build time, tone = Symphony's voice, terse):**
- **Year:** goals are directions → a goal never finishes this quarter → seasons take bets on goals → watch one goal thread down to a day (the signature "cascade drop" scene, reused in every script from its own altitude).
- **Season:** what a bet is (outcome by season's end, weekends test) → 5–8 max → bets feed months as moves → starving bet warning → win/carry/let-go.
- **Month:** moves not bets → a move fits in a sitting → copy-down duplicates on purpose (original stays above) → month calendar places dated moves.
- **Week:** placement — moves land on days/times → the grid refuses the past → placed rocks drain the pool (that's correct, not a bug).
- **Today:** the end of the cascade — today shows what the system already decided; capture goes to inbox, not the plan.

**Entry points:** (a) a quiet `What is this level?` text link in each horizon page header (and the year page); (b) auto-open on first-ever visit to each horizon page — `localStorage` key `symphony.explainerSeen.<horizon>` (per-device is acceptable v1; profile-synced later if it grates); (c) the wizard welcome steps get the same link. No modal nagging: auto-open happens once per horizon per device, ever.

## 5. Data & code map

- No schema changes. Bets/moves are existing `bucket` values re-presented. Focus line + explainer-seen use existing keyed-note mechanism and localStorage respectively.
- New: `src/components/planning/season/` (BetCard, BetsGrid, OverflowTray, MonthStrip, FocusLine), `src/components/planning/explainers/` (HorizonExplainer engine + `scenes/<horizon>.tsx`), `src/lib/planning/betPulse.ts` (pulse/starving derivation, pure + tested), `src/lib/planning/outcomeCoach.ts` (`looksLikeActivity`, pure + tested).
- Touched: `HorizonView` (season body swap, month header line, explainer links/auto-open), `WriteListStep` (`rows:'bets'`), goal detail (chapters strip), `sharpen-goal` edge fn (add `sharpen-bet` prompt variant — deploy with `--use-api`).

## 6. Verify

- Pure logic (pulse, overflow partition, coach heuristics, chapters query) unit-tested.
- `npm run build` + full vitest suite green before push (pre-push hook enforces).
- Visual gate: Scott reviews season page + one explainer (season) on prod demo account before the remaining explainer scripts are called done.
- Scott's real 19-item list is the acceptance test: page must load into 8 cards + 11-item tray with working exits.

## Out of scope (explicitly)

- Ideal-week template (deferred).
- Hard caps that block capture.
- TTS narration for explainers or changed wizard narration.
- Profile-synced explainer-seen state.
