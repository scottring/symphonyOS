# Today Redesign — Cohesive Shell-First Rebuild

**Date:** 2026-05-19
**Status:** Approved for planning
**Supersedes:** `docs/superpowers/specs/2026-05-19-today-redesign-design.md` (the additive/layered approach).

> **Revised 2026-05-19 — post-Phase-1 reality check.** An integration survey after Phase 1 found §5's original detail-panel design targeted a **dead component** (`DetailPanelRedesign`) and §6's client-side suggestion generator **cannot exist** (suggestions are engine-only). §5 and §6 are rewritten against the *live* architecture: the **Surface section system** (`Tap*Panel` over reusable `Panel*` sections, governed by `docs/superpowers/specs/2026-05-08-surface-design.md`) and the **existing** `useWeather()` / `useProactiveSuggestions()` hooks. Phase 1 (`useTodayData`) has already shipped to `main`; phases are renumbered R1–R4.

---

## 1. Goal

Make the Today experience faithfully match the approved Image 1 mockup (left main screen **and** right-rail detail panel) by rebuilding the Today view shell-first as a cohesive composition, not additive edits to the legacy `TodaySchedule`. The detail-panel work extends the **existing** Surface section architecture rather than inventing a parallel one.

## 2. Why the previous (additive) approach failed

The additive plan inserted new components *above/around* legacy `TodaySchedule` (1623 lines) without owning the shell: duplicate stats rows, uncontained list, GCal banner crowding the header, untouched meal/detail surfaces. ~70% of the mockup's impact is the *shell* (centered editorial column, contained task card, calm rhythm, declutter) — exactly what additive layering punted. Fix: build the shell as the backbone, behind the seam, one cutover.

## 3. Architecture & seam

`TodaySchedule` is rendered in exactly one place — `HomeView.tsx:276` — with a tidy prop set, reading actions/refs from `ScheduleActionsContext`. The GCal connect banner is injected separately by `ViewRouter` (today branch), not by the Today component.

```
ViewRouter (today branch)
  ├─ CalendarConnect banner  → relocated/compacted out of the main editorial column (declutter)
  └─ HomeView
       └─ TodayView                         ← NEW. Replaces <TodaySchedule>. Same props + ScheduleActionsContext.
            ├─ useTodayData(props)           ← SHIPPED in Phase 1 (on main). Grouping/counts/overdue/week/routines.
            ├─ TodayHeader                   (serif date + ‹ ›, Day·Week·Month segmented, weather toggle)
            ├─ StatsRow                      (salvaged PR#10; the ONLY stats row)
            ├─ TodayFocusRow                 (TodaysFocusCard  +  WeatherCard, true two-up)
            ├─ TodayTaskList                 (one bordered .card container)
            │     └─ TimeGroup × Morning/Afternoon/Evening (salvaged)
            │          ├─ ScheduleItem       (salvaged chrome)
            │          └─ EveningMealCard    (NEW styled meal card)
            ├─ OverdueGroup                  (quiet labeled group above Morning)
            └─ AiSuggestionBanner            (renders existing useProactiveSuggestions output)

Detail rail (live Surface system, selection-driven; see §5):
  App.tsx (SURFACE_PANEL_ENABLED) → TapMealPanel / TapContextPanel / TapEventPanel
    → composed Panel* section components

DELETED at cutover (R4): src/components/schedule/TodaySchedule.tsx + its (skipped) test.
```

**Build strategy — behind the seam.** `TodayView` is built and verified in parallel, NOT wired to the `today` route until complete and matching the mockup. The R4 cutover is one commit: swap `HomeView:276`, declutter the banner in `ViewRouter`, delete legacy `TodaySchedule`. No half-built state ever appears on the live route.

**Base branch.** Phases R1–R4 are built on a fresh branch off `main` (which has Phase 1 and none of the rejected additive Layer 1). The salvageable PR #10 pieces (§8) are all clean new files and are cherry-picked in; the `ScheduleItem`/`TimeGroup` chrome is re-applied as part of building `TodayView`.

## 4. Editorial shell (fidelity is the point)

From Image 1 left. The shell is the backbone — requirements, not polish:

- **Outer column:** centered, generous `max-width` (roomy like the mockup, not the cramped PR #10 column). Comfortable horizontal padding; calm vertical rhythm. Page scrolls as one; no inner dense scroll regions.
- **Header row (one line):** large serif date "Tuesday, May 19, 2026" + `‹ ›` left; **Day · Week · Month** segmented control + weather/sun toggle right. Replaces the legacy `<h1>` + DateNavigator + dense control row. Day = this view; Week/Month invoke the existing view switch unchanged (no Week/Month redesign).
- **Stats line:** single quiet row under the header (salvaged `StatsRow`) — `N tasks due today · N tasks this week · N tasks total · Clarity ‹state› · AI ‹state›`. The **only** stats row; legacy ProgressIndicator/StagingFloat/ClarityIndicator die with the deleted file. Clarity detail opens from the StatsRow Clarity segment (re-host the existing remediation popover content).
- **Two-up cards:** `TodaysFocusCard` (~60%) beside `WeatherCard` as a real two-column row.
- **Task list container:** the day's items inside **one soft bordered card** (`.card` token: border, rounded, gentle shadow, padded). Inside: `TimeGroup` headers ("MORNING 6:00 AM – 12:00 PM" + icon), roomy `ScheduleItem` rows, per-list `+ Add task`.
- **Evening meal card:** warm peach-tinted card — thumbnail, title + sides, "View recipe", attendee avatars, "Add to plan", "Meal prep" tag. New `EveningMealCard`, replacing the plain meal row, within the Evening section.
- **AI-suggestion banner:** full-width calm banner below the list (see §6).
- **Overdue:** quiet labeled group above Morning (not a bare strip).
- **Declutter:** the "Connect Google Calendar" banner moves out of the main column (compact / dismissible / below the fold).
- **Mobile:** existing mobile behavior preserved; this shell is the ≥768px desktop redesign. No mobile regression.

## 5. Detail panel — extend the existing Surface section system

**The Surface system already is the template/module model.** `src/components/surface/` contains `Tap*Panel` per-entity compositions over reusable `Panel*` section components, governed by `docs/superpowers/specs/2026-05-08-surface-design.md` (canonical section order, single-scroll no-tabs, empty sections render nothing). This work **extends** that spec; it must not contradict it.

**Live render path (verified):** `src/App.tsx:1438` (`SURFACE_PANEL_ENABLED = true`) renders `TapMealPanel` for meal events, `TapContextPanel` for tasks, `TapEventPanel` for events. `DetailPanelRedesign` is legacy/unreachable for these and is **not touched**.

**Existing reusable sections** (`src/components/surface/sections/`): `PanelHeader`, `PanelMetaRow`, `PanelActions`, `PanelWhy`, `PanelSubtasks`, `PanelPeople`, `PanelLinked`, `PanelLinks`, `PanelMightBeRelevant`, `PanelFooter`. Each is a focused component with a uniform "props in, render-nothing-when-empty" contract.

**Mockup meal rail → Surface mapping:**

| Mockup section | Implementation |
|---|---|
| Header (title, close) | `PanelHeader` — exists |
| Date/time · "Meal" chip | `PanelMetaRow` — exists |
| Complete · Edit · Move · More | `PanelActions` — exists; compose into `TapMealPanel` |
| ABOUT | `PanelWhy` — exists (section name varies per entity per surface-spec §2.4) |
| WHAT TO BRING | **new `PanelWhatToBring`** (checklist; surface-spec §2.3 anticipates "events get 'What to bring'") |
| INGREDIENTS | **new `PanelIngredients`** (recipe ingredients; meal data already resolved in `TapMealPanel` via `useMealPlan`/`useRecipes`) |
| LINKS & FILES | `PanelLinks` — exists (recipe/source link); files deferred unless trivially available |
| CREATED | `PanelFooter` — exists (createdAt/updatedAt/createdByName) |

**R1 scope (meals-focused):**
- Create `src/components/surface/sections/PanelWhatToBring.tsx` + test. Contract mirrors existing sections: props in (items + add/toggle handlers), renders nothing when empty, uppercase-eyebrow header matching `PanelLinks`/`PanelSubtasks` style. Backed by a lightweight checklist (reuse the subtask-style item shape; persistence path = the existing meal/notes write path available in `TapMealPanel` — define concretely in the plan).
- Create `src/components/surface/sections/PanelIngredients.tsx` + test. Renders the resolved recipe's ingredients (from the `recipe` already looked up in `TapMealPanel`), with an inline "+ Add ingredient" using the existing recipe write path; renders nothing when no recipe/ingredients.
- Recompose `TapMealPanel.tsx` to: `PanelHeader → PanelMetaRow → PanelActions → PanelWhy → PanelWhatToBring → PanelIngredients → PanelLinks → PanelFooter`. `PanelActions` wired to the meal's complete/edit/move/more equivalents (define exact handler mapping in the plan from `TapMealPanel`'s available `useMealPlan` writes + selection clear).
- Tasks/events panels (`TapContextPanel`/`TapEventPanel`) are **unchanged** this round.
- Mobile bottom-sheet behavior preserved (Surface already handles this — no change).

## 6. Weather + AI banner — reuse existing infra

- **`WeatherCard`** (new component) consumes the **existing** `src/hooks/useWeather.ts`: `{ weather: { currentTemp, weatherCode, condition, highTemp, lowTemp, hourlyForecast } | null, loading, error, requestLocation }`. Renders condition icon (lucide, mapped from `weatherCode`), temp, condition, High/Low. On `loading` → skeleton; on `error`/`null` → muted "weather unavailable" (no broken UI). Two-up partner to `TodaysFocusCard`. No new weather fetching/hook.
- **`AiSuggestionBanner`** (new component) consumes the **existing** `src/hooks/useProactiveSuggestions.ts` (`suggestions: ProactiveSuggestion[]`, `actOnSuggestion`, `dismissSuggestion`). Renders the top relevant suggestion as the single styled banner from the mockup (icon + title + detail + an action + dismiss `×`). Dismiss → `dismissSuggestion`; primary action → `actOnSuggestion`. If `suggestions` is empty, the banner renders nothing (no fabricated content). The mockup's exact "weather window" copy is *not* faked — the banner shows whatever real suggestions exist.
- **Out of scope (documented follow-up):** a `weather_window` generator. Suggestions are created **only** by the `proactive-engine` Supabase edge function (no client insert path). A weather-aware `weather_window` rule would extend that Deno edge function (fetch weather server-side, detect outdoor-task windows, upsert `weather_window` suggestions). It is a separately-scoped future task, NOT in this rebuild. The banner is built to render it automatically once the engine produces it (same pipeline) — "infra now, weather rule later."

## 7. Data hook (shipped)

`useTodayData(input)` — the pure, tested extraction of the legacy grouping/counts/overdue/week/routine logic — **already shipped to `main` in Phase 1** (`src/hooks/useTodayData.ts`, `src/lib/today/*`, parity-tested). `TodayView` (R3) composes it; no re-extraction. The R4 cutover relies on the existing Phase-1 parity test as the legacy-equivalence guard.

## 8. Salvaged from PR #10 (reuse, do not rebuild)

Clean new-file pieces, cherry-picked onto the fresh branch:
- Helpers: `src/lib/greeting.ts`, `src/lib/categoryIcon.tsx`, `src/lib/initials.ts`, `src/lib/daySectionMeta.tsx`, `src/lib/focusHeadline.ts`.
- Components: `src/components/layout/HouseIllustration.tsx`, `src/components/schedule/StatsRow.tsx`, `src/components/schedule/TodaysFocusCard.tsx`.
- `ScheduleItem`/`TimeGroup` chrome (lucide category tile, Today pill, note glyph, assignee initials, section icon+range) is re-applied while building `TodayView`/`TodayTaskList` (the new shell owns those files).
- Sidebar PR #10 changes (greeting, illustration, tagline, flat nav) are independent; if wanted on `main`, cherry-picked separately (not part of this rebuild's critical path).
**Discarded:** the additive `StatsRow`/`TodaysFocusCard`/`useSystemHealth` wiring inside `TodaySchedule.tsx` (dies with the file at R4).

## 9. Testing strategy

- **Unit/component (Vitest + RTL):**
  - `PanelWhatToBring`, `PanelIngredients`: render with/without data (empty → renders nothing), add/toggle handler calls. Follow the existing `Panel*.test.tsx` patterns.
  - `TapMealPanel`: composes the new section order; sections appear/omit per data; `PanelActions` handlers fire. Extend existing `TapMealPanel.test.tsx`.
  - `WeatherCard`: loading / error / null / populated states (mock `useWeather`).
  - `AiSuggestionBanner`: empty → nothing; populated → renders + dismiss/act call the hook (mock `useProactiveSuggestions`).
  - `TodayView`: shell renders, **single stats row** (explicit regression guard vs the duplicate-row defect), two-up Focus/Weather, contained list card, evening meal card, overdue group placement; mobile path unchanged (assertion).
- **Carried over unchanged:** all Phase-1 `src/lib/today` + `useTodayData` tests (on `main`); salvaged PR #10 helper/component tests.
- **E2E:** logged-in paths remain unit/component-covered (known missing auth fixture); add specs `.skip`-tagged per the existing pattern.
- **R4 cutover guard:** the existing Phase-1 parity test must pass before the `TodaySchedule` deletion commit.
- **Baseline:** the suite has a pre-existing per-run flaky failure (`NotesPage`/`useSpaces`, mocked-Supabase) unrelated to this work; no NEW failures permitted.

## 10. Non-goals

- Week/Month view redesign (toggle routes to existing views).
- The "Where does this fit?" semantic-placement triage / This Week view (Image 2) — separate spec.
- Propagating new sections beyond `TapMealPanel` (tasks/events panel changes) — future round.
- A client or engine `weather_window` generator (documented §6 follow-up).
- Bucket data-model changes; routing changes beyond the HomeView seam swap + GCal banner relocation.
- Touching `DetailPanelRedesign` (legacy/unreachable).

## 11. Risks & mitigations

- **Surface-spec divergence** → R1 explicitly follows `2026-05-08-surface-design.md` (section order, empty-renders-nothing, uniform contract); reviewers check alignment.
- **Meal write paths for new sections** → `TapMealPanel` already wires `useMealPlan`/`useRecipes`; the plan defines the exact persistence path for WhatToBring/Ingredients before implementation (no invented APIs).
- **`useTodayData`/legacy drift at cutover** → guarded by the Phase-1 parity test (already on `main`); built behind the seam so the live route is unaffected until R4.
- **Mobile regression** → desktop-only shell; explicit mobile-unchanged assertions; Surface mobile bottom-sheet untouched.
- **Large R4 cutover commit** → everything tested behind the seam first; cutover is mechanical (swap import, delete file, relocate banner), gated by full suite + parity.

## 12. Phasing (single spec, one combined plan, continuous execution, one cutover)

Phase 1 (`useTodayData`) is DONE on `main`. The remaining work is one combined plan, executed continuously behind the seam, reaching the live route only at R4:

1. **R1 — Surface sections.** `PanelWhatToBring` + `PanelIngredients` (+ tests); recompose `TapMealPanel` to the mockup order with `PanelActions`/`PanelWhy`/`PanelLinks`/`PanelFooter`. Aligned with the surface spec.
2. **R2 — `WeatherCard` + `AiSuggestionBanner`.** Reuse existing `useWeather` / `useProactiveSuggestions`; graceful empty/error states.
3. **R3 — `TodayView` editorial shell.** Compose `useTodayData` (from `main`) + salvaged StatsRow/TodaysFocusCard/HouseIllustration + TimeGroup/ScheduleItem chrome + new `EveningMealCard` + `OverdueGroup` + `TodayHeader` into the §4 editorial shell. Not wired to the route.
4. **R4 — Cutover.** Swap `HomeView:276` to `TodayView`, declutter the GCal banner in `ViewRouter`, delete legacy `TodaySchedule` + its skipped test. Gated by full suite + the Phase-1 parity test. Single commit; first live-route change.
