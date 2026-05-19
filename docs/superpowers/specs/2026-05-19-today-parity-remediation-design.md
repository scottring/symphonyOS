# Today View — Parity Remediation

**Date:** 2026-05-19
**Status:** Approved for planning
**Remediates:** the shipped `TodayView` rebuild (on `main`). The rebuild was authored from the visual mockup and silently dropped 8 interactive affordances + reintroduced a duplicate Day/Week/Month control. Root-cause investigation (systematic-debugging Phase 1) is complete and is the requirements input for this spec.

> **Root cause (do not re-litigate):** the rebuild spec was *mockup-driven*, not *parity-driven*; review gates checked prop-interface compilation and per-item `ScheduleItem` wiring but never feature-parity against the 1,782-line `TodaySchedule` it replaced. This recurred 3× (PR#10 duplicate stats; this rebuild duplicate D/W/M + 8 drops). The fix is therefore (a) parity-driven requirements with a hard acceptance matrix, and (b) a new legacy-capability parity review gate. Both are part of this spec.

---

## 1. Goal

Restore full functional parity with legacy `TodaySchedule` in the editorial `TodayView`, **integrated into the calm layout** (not the old dense toolbar), and fix three live interaction defects (duplicate D/W/M, dead Focus/Weather cards, cycling-generic AI banner). The editorial visual identity is preserved; the dropped function returns.

## 2. Reference

- Live target: `src/components/schedule/TodayView.tsx` on `main` (the seam is already cut — this edits the live view directly; no behind-the-seam phase).
- Legacy reference (recover read-only via git): `git show 2e61ab5~1:src/components/schedule/TodaySchedule.tsx`. The `ClarityIndicator` (legacy ~lines 46-359) and `ProgressIndicator` (legacy ~lines 360-375) lived **inline** in that file and must be recovered from there. All other affordances are standalone components still on disk.
- On-disk components confirmed present: `src/components/schedule/StagingFloat.tsx`, `src/components/home/AssigneeFilter.tsx`, `src/components/schedule/TodayAddInput.tsx`, `src/components/schedule/OverdueSection.tsx`, `src/components/schedule/EmailActionsBanner.tsx`.

## 3. Capability-parity matrix (HARD acceptance criteria)

Nothing ships until every row is verified. The new review gate (§6) checks this matrix against the implemented `TodayView`, not prop compilation.

| # | Capability | Legacy behavior | Editorial restoration in `TodayView` | Source |
|---|---|---|---|---|
| P0 | Duplicate D/W/M | Legacy had **none** (used `DateNavigator` prev/next/today only). `HomeViewSwitcher` (HomeView.tsx) is the real, pre-existing Today/Week/Month switch. | **Delete** `TodayHeader`'s D/W/M segmented control + its dead `mode` state/props. `TodayHeader` keeps serif date + `‹ ›` only. `HomeViewSwitcher` remains the sole D/W/M. | n/a (deletion) |
| P1 | Clarity remediation | Clickable stat → expandable popover: unassigned tasks, aging, stale, empty projects, inbox count, with assignment multiselect actions. | Extract legacy inline `ClarityIndicator` → `src/components/schedule/ClarityIndicator.tsx` (verbatim behavior). StatsRow "Clarity ‹state›" segment becomes its trigger; popover on click (not always-expanded). | git `2e61ab5~1` ~46-359 |
| P2 | "This Week" pool | `StagingFloat` inline: week-bucket tasks, pull-to-today, quick complete/defer/delete. | StatsRow "N tasks this week" segment triggers on-disk `StagingFloat` (inline mode) in a popover. Wire its callbacks from `ScheduleActionsContext`/props as legacy did. | `StagingFloat.tsx` |
| P3 | Assignee filter | `AssigneeFilter` dropdown (by family member / unassigned) filtering the day. | Quiet right-aligned filter affordance under the stats row hosting on-disk `AssigneeFilter`; wire `selectedAssignee`/`onSelectAssignee` (already props) into it AND into the `useTodayData` input. | `AssigneeFilter.tsx` |
| P4 | Routine show/hide | Toggle button (strikethrough icon) hiding routines. | `hideRoutines` `useState` in `TodayView`, passed into the `useTodayData` input (the hook already accepts `hideRoutines`); a quiet toggle beside the assignee filter. | new state + button (legacy JSX ref ~1257-1267) |
| P5 | Inline / hover-+ add | `TodayAddInput` ("+ Add to today…") below header; per-section hover-"+" timeline insert slots via `onCreateTaskAt`/`onCreateEventAt`/`onCreateRoutineAt`/`onCreateNoteAt`/`onAppendNoteAt`/`onLinkNote`/`timelineNotes`. | Render on-disk `TodayAddInput` below the header. Restore per-section hover-"+" insert slots wired through those props (currently accepted-but-unused in `TodayView`). Confirm `HomeView` forwards them; if not, forward them at the `HomeView` `<TodayView>` call site (parity with what it passed legacy). Mirror legacy slot rendering recovered from git. | `TodayAddInput.tsx` + legacy ref |
| P6 | Rich Overdue | `OverdueSection` component: suggestions, follow-up, full callbacks. | Replace `TodayView`'s static overdue rows with on-disk `OverdueSection`, wired with the same callbacks legacy passed. | `OverdueSection.tsx` |
| P7 | Email actions | `EmailActionsBanner` (acknowledge/snooze/dismiss). | Render on-disk `EmailActionsBanner` at the top of the list area (legacy placement), styled to match the calm banners. | `EmailActionsBanner.tsx` |
| P8 | Completion progress | Inline `ProgressIndicator` "X/Y tasks". | Fold completion into `StatsRow`: change "due today" stat to show "N of M done today" (or add a completed count) — preserves the parity intent without a redundant widget. | StatsRow edit |

## 4. Live interaction defects (also in scope)

| # | Defect | Fix |
|---|---|---|
| D1 | Today's Focus card does nothing on click | Clicking smooth-scrolls to / briefly highlights the first actionable item of the day (first non-overdue section item; if none, the overdue group). Keep it a single clear affordance. |
| D2 | Weather card does nothing on click | Clicking expands an inline hourly-forecast strip from the existing `useWeather().weather.hourlyForecast` (already fetched — no new data). Collapses on second click. Graceful when forecast empty (no expand affordance). |
| D3 | AI banner cycles generic advice | **Investigation-then-remediate** (systematic-debugging): first sample real `proactive_suggestions` rows for the user (read-only query) to confirm *why* generic and *why* cycling. Then client-side only (NO edge-function deploy): in `AiSuggestionBanner`, (a) filter to `status==='active'` AND `confidence >= THRESHOLD` (threshold chosen from the sampled data, named constant) AND `suggestionType` in an actionable allowlist; (b) pick ONE deterministic best (highest confidence, stable tiebreak by `id`) — **no rotation/cycling**; (c) once dismissed, stay dismissed for the session (don't resurface the same `suggestionKey`); (d) if nothing clears the bar, render nothing (no fabricated/generic filler). Document the chosen threshold + allowlist + the investigation findings in the implementation. The server engine generators are explicitly out of scope (separate effort). |

## 5. Architecture & constraints

- Edits the live `TodayView` (and `StatsRow`, `TodayHeader`, `WeatherCard`, `TodaysFocusCard`, `AiSuggestionBanner`, possibly `HomeView` for P5 prop forwarding). No behind-the-seam phase — the seam is already cut.
- Reuse on-disk components as-is; do not re-implement P2/P3/P5/P6/P7. Only `ClarityIndicator` (P1) and the `StatsRow` completion change (P8) are new code; `ClarityIndicator` is a faithful extraction of the recovered legacy inline component (behavior verbatim; restyle only its container to fit a calm popover, not its logic).
- `useTodayData` already accepts `selectedAssignee` + `hideRoutines`; P3/P4 wire real state into that input (memoize the input object — the hook deps on input identity).
- Editorial discipline: restored controls are quiet (count-as-trigger popovers, subtle filter row), NOT the legacy dense stats bar. The calm look from the rebuild is preserved.
- No emoji (project rule) — lucide only, consistent with the rest of `TodayView`.
- `react-hooks/static-components`: any factory-derived icon rendered via `createElement` (the rule already bit this codebase).
- Delivery: worktree off latest `origin/main` → race-safe `git push origin HEAD:main` (parallel sessions move `main`; CLAUDE.md forbids checkout/merge in the shared main worktree). Gated by full suite + the §6 parity check.

## 6. New review gate: legacy-capability parity (the process fix)

In addition to the existing spec-compliance + code-quality reviews, every implementation task and the final review MUST include a **parity check**: the reviewer is given the recovered legacy affordance list (this §3 matrix + the git-recovered legacy `TodaySchedule`) and must confirm each in-scope capability is *functionally present and wired* in `TodayView` (clicking it does the legacy thing), not merely that props compile. A capability that is "accepted as a prop but not rendered/wired" = FAIL. This gate is what was missing and is mandatory for this remediation and any future Today work.

## 7. Testing strategy

- **Component/unit (Vitest + RTL):**
  - `ClarityIndicator` (extracted): popover opens on trigger; renders the recovered remediation sections; assignment action fires. Port/adapt legacy behavior with tests.
  - `StatsRow`: Clarity segment is a button (onClick fires); "this week" segment triggers a handler; completion shows "N of M done today".
  - `TodayView`: renders exactly ONE D/W/M source (regression guard — assert no D/W/M inside `TodayView`/`TodayHeader`; `HomeViewSwitcher` is outside); renders `AssigneeFilter`, routine toggle (toggling sets `hideRoutines` → reflected in `useTodayData` input), `TodayAddInput`, `OverdueSection`, `EmailActionsBanner`, `StagingFloat` trigger; Focus card onClick scrolls (mock scrollIntoView, assert called on first item ref); Weather card expands forecast.
  - `WeatherCard`: click toggles hourly-forecast strip from mocked `useWeather`.
  - `AiSuggestionBanner`: below-threshold/non-allowlisted/empty → renders nothing; multiple actives → renders exactly ONE deterministic best (no cycling across re-renders); dismissed `suggestionKey` stays gone.
- **Parity check (§6):** explicit reviewer cross-check of the §3 matrix.
- **Full suite:** zero NEW failures vs baseline; the known pre-existing flaky (`NotesPage`/`useSpaces`, mocked-Supabase, alternates per run) is allowed and named.
- **E2E:** logged-in paths remain unit/component-covered (known missing auth fixture); add `.skip`-tagged specs per existing pattern.

## 8. Non-goals

- Server `proactive-engine` generator quality (D3 is client-side only; engine fix is a separate effort).
- Week/Month view content (the rebuild's Day view is the scope; `HomeViewSwitcher` already routes to existing `WeekView`/`MonthView`).
- Any further visual redesign — this is parity restoration *within* the shipped editorial layout, not a re-skin.
- Re-introducing the legacy dense stats bar — restored controls are quiet/popover-based by design.

## 9. Risks & mitigations

- **`ClarityIndicator` extraction drift** (314 lines, was inline with closures over legacy state) → extract with its own props for the data it needs (tasks/projects/family/handlers from context), port logic verbatim, cover with tests; the parity reviewer diffs behavior against the git-recovered source.
- **P5 prop forwarding** — if `HomeView` never forwarded `onCreateTaskAt` et al. even to legacy, the hover-+ slots may need those handlers sourced where legacy sourced them; the plan resolves the exact origin before implementing (no invented handlers).
- **D3 investigation reveals a deeper engine problem** → still ship the client quality bar (stops the cycling/generic-noise immediately); record findings; the engine fix is a documented separate effort.
- **`main` moves under us** (parallel sessions) → race-safe `git push origin HEAD:main`; replay onto latest if rejected (established pattern this session).
- **Recurrence of the root cause** → the §6 parity gate is mandatory and explicitly checks function, not compilation.

## 10. Phasing

One spec, one plan, continuous subagent-driven execution, single race-safe push at the end. Suggested task order: P0 (dedupe — fastest, removes the most visible bug) → P8/D2/D1 (StatsRow completion + Weather/Focus interactions — small, self-contained) → P1 (`ClarityIndicator` extraction) → P2/P3/P4 (filters + this-week, share the filter row + `useTodayData` input wiring) → P5 (inline/hover add) → P6/P7 (OverdueSection + EmailActionsBanner drop-ins) → D3 (AI investigate + client quality bar) → final parity-gate review → race-safe push.
