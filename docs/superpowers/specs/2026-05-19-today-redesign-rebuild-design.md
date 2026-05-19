# Today Redesign — Cohesive Shell-First Rebuild

**Date:** 2026-05-19
**Status:** Approved for planning
**Supersedes:** `docs/superpowers/specs/2026-05-19-today-redesign-design.md` (the additive/layered approach). PR #10 (Layer 1) produced individually-correct pieces bolted into the old dense shell — duplicate stats row, uncontained list, no editorial feel. This spec replaces the layered approach with one cohesive shell-first rebuild. PR #10's helpers/components are salvaged (see §8).

---

## 1. Goal

Make the Today experience faithfully match the approved Image 1 mockup (left main screen **and** right-rail detail panel) by rebuilding the Today view shell-first as a cohesive composition, not additive edits to the legacy `TodaySchedule`. The detail panel becomes a **template/module composition surface** so future module types are a first-class extension, not a rewrite.

## 2. Why the previous approach failed

The additive plan inserted new components *above/around* the legacy `TodaySchedule` (1623 lines) without owning the shell. Result on the live route: the new `StatsRow` rendered on top of the old ProgressIndicator/Clarity row (duplicate stats), the task list stayed in the old cramped uncontained layout, the GCal connect banner crowded the header, and the meal/detail surfaces were untouched. ~70% of the mockup's impact is the *shell* (centered editorial column, contained task card, calm rhythm, declutter) — exactly what additive layering punted. Fix: build the shell as the backbone.

## 3. Architecture & seam

`TodaySchedule` is rendered in exactly one place — `HomeView.tsx:276` — with a tidy prop set, and reads actions/refs from `ScheduleActionsContext`. The GCal connect banner is injected separately by `ViewRouter` (today branch), not by the Today component.

```
ViewRouter (today branch)
  ├─ CalendarConnect banner  → relocated/compacted out of the main editorial column (declutter)
  └─ HomeView
       └─ TodayView                         ← NEW. Replaces <TodaySchedule>. Same props + ScheduleActionsContext.
            ├─ useTodayData(props)           ← NEW tested hook. Lifts grouping / counts / overdue /
            │                                  weekTasks / routine-instance logic out of the legacy file.
            ├─ TodayHeader                   (serif date + ‹ ›, Day·Week·Month segmented, weather toggle)
            ├─ StatsRow                      (salvaged; the ONLY stats row)
            ├─ TodayFocusRow                 (TodaysFocusCard  +  WeatherCard, true two-up)
            ├─ TodayTaskList                 (one bordered .card container)
            │     └─ TimeGroup × Morning/Afternoon/Evening (salvaged)
            │          ├─ ScheduleItem       (salvaged chrome)
            │          └─ EveningMealCard    (NEW styled meal card)
            ├─ OverdueGroup                  (quiet labeled group above Morning)
            └─ AiSuggestionBanner            (re-enabled proactive pipeline + weather_window rule)

Detail panel (selection-driven, right rail / mobile bottom sheet):
  DetailPanel shell  →  resolveModules(entity, ctx)  →  ordered DetailSection-wrapped modules

DELETED at cutover: src/components/schedule/TodaySchedule.tsx + its (skipped) test.
```

**Build strategy — behind the seam.** `TodayView` is built and verified in parallel and is NOT wired to the `today` route until complete and matching the mockup. The cutover is one final commit: swap `HomeView:276`, declutter the banner in `ViewRouter`, delete legacy `TodaySchedule`. No half-built state ever appears on the live route (the opposite of PR #10).

## 4. Editorial shell (fidelity is the point)

From Image 1 left. The shell is the backbone — these are requirements, not polish:

- **Outer column:** centered, generous `max-width` (roomy like the mockup, not the cramped narrow column in the PR #10 build). Comfortable horizontal padding; calm vertical rhythm between blocks. Page scrolls as one; no inner dense scroll regions.
- **Header row (one line):** large serif date "Tuesday, May 19, 2026" + `‹ ›` on the left; **Day · Week · Month** segmented control + weather/sun toggle on the right. Replaces the legacy `<h1>` + DateNavigator + dense control row entirely. Day = this view; Week/Month invoke the existing view switch unchanged (no Week/Month redesign).
- **Stats line:** a single quiet row under the header (salvaged `StatsRow`) — `N tasks due today · N tasks this week · N tasks total · Clarity ‹state› · AI ‹state›`. It is the **only** stats row; the legacy ProgressIndicator/StagingFloat/ClarityIndicator row is gone with the deleted file. Clarity detail opens from the StatsRow Clarity segment (preserve the existing remediation popover content, re-hosted).
- **Two-up cards:** `TodaysFocusCard` (~60%) beside `WeatherCard` as a real two-column row.
- **Task list container:** the day's items live inside **one soft bordered card** (subtle border, rounded, gentle shadow, padded). Inside: `TimeGroup` headers ("MORNING 6:00 AM – 12:00 PM" + icon), roomy `ScheduleItem` rows with comfortable padding, a per-list `+ Add task` affordance.
- **Evening meal card:** warm peach-tinted card — thumbnail, title + sides, "View recipe", attendee avatars, "Add to plan", "Meal prep" tag. New `EveningMealCard`, replacing the plain meal row, rendered within the Evening section.
- **AI-suggestion banner:** full-width calm banner below the list (suggestion text + "View forecast" + dismiss).
- **Overdue:** a quiet labeled group above Morning (not a bare jarring strip).
- **Declutter:** the "Connect Google Calendar" banner moves out of the main column (compact, dismissible, or below the fold) so it never crowds the editorial header.
- **Mobile:** existing mobile behavior preserved. This shell is the ≥768px desktop redesign; the mobile compact path is unchanged and must not regress.

## 5. Detail panel — template/module model

The selection-driven panel (`DetailPanelRedesign`'s surface) becomes a thin composition shell with zero per-type logic.

- **Module contract:**
  ```ts
  interface DetailModule {
    id: string
    shouldRender(entity: DetailEntity, ctx: DetailCtx): boolean
    Component: FC<{ entity: DetailEntity; ctx: DetailCtx }>
  }
  ```
- **Registry:** `Record<EntityKind, ModuleId[]>` — ordered module ids per entity kind. EntityKind ∈ `meal | task | event | routine | project` (extend later).
  - `meal → [actions, about, whatToBring, ingredients, linksFiles, created]`
  - `task → [actions, about, subtasks?, linksFiles, created]`
  - `event → [actions, about, whatToBring, linksFiles, created]`
  - `routine → [actions, about, routineSettings, created]`
  - `project → [actions, about, linksFiles, created]`
  (Per-row `shouldRender` still gates within a template, e.g. subtasks only when present.)
- **Resolver:** `resolveModules(entity, ctx): DetailModule[]` → ordered, `shouldRender`-filtered list. The shell maps it to `DetailSection`-wrapped components. Adding a module or entity template never edits the shell.
- **Modules built now (mockup):** `ActionsModule` (Complete · Edit · Move · More — wired to existing handlers), `AboutModule` (existing notes/description, read+edit), `WhatToBringModule` (lightweight checklist reusing the subtask model), `IngredientsModule` (existing recipe/meal model + inline "+ Add ingredient"), `LinksFilesModule` (existing links + attachments unified), `CreatedModule` (`created_at` + creator, new metadata row).
- **`LegacyModule`:** wraps the remaining existing panel content (subtasks, notes/Tiptap, routine settings, project context, attachments) behind one module id, slotted where needed in templates, migrated opportunistically later. This establishes the model without a 2300-line rewrite.
- **Header:** serif title, datetime line, type chip — part of the shell chrome above the module list (not a module).
- Mobile bottom-sheet behavior preserved (same module list, sheet container).

## 6. Weather + AI banner (real)

- **`useWeather()`:** adapts the existing wall weather source into a main-app hook → current `{ tempF, condition, low, high }` + multi-day `forecast[]`. Location from settings, sensible default. Failure → `WeatherCard` shows a muted "unavailable"; the weather-driven suggestion suppresses (no broken UI).
- **`WeatherCard`:** consumes `useWeather()`; condition icon (lucide), temp, condition, Low/High. Two-up partner to `TodaysFocusCard`.
- **AI-suggestion banner:** re-enable the currently commented-out proactive-suggestion pipeline; render as the single styled banner. Add a deterministic **`weather_window`** generator: scans today/this-week tasks for an outdoor signal (chore/errand category, explicit outdoor tag, or a centralized title-keyword allowlist, e.g. "yard", "outdoor", "garden", "deck", "fence"), cross-refs `useWeather()` forecast, picks the best upcoming day, emits a `ProactiveSuggestion` of new type `weather_window` **through the existing pipeline** (so future LLM suggestions use the same banner with no rework). Dismiss → existing `dismissed` status; "View forecast" → opens forecast.

## 7. Data hook

**`useTodayData(props)`** lifts the sound logic out of legacy `TodaySchedule` (it is the chrome, not the logic, that was wrong):

- Morning/Afternoon/Evening grouping (via existing `groupByDaySection`).
- `weekTasks`, overdue set, routine-instance resolution.
- Counts feeding `StatsRow` and `TodaysFocusCard` (due today, this week, total, focus priorities/meals/events).
- Returns a typed, serializable-ish shape; `TodayView` is a thin composition over it.
- **Cutover parity check:** before deleting `TodaySchedule`, a test asserts `useTodayData` yields the same groups/counts the legacy memos produced for representative fixtures.

## 8. Salvaged from PR #10 (reuse, do not rebuild)

Helpers: `greetingForHour`, `categoryIcon`, `initialsFor`, `daySectionMeta`, `focusHeadline`. Components: `HouseIllustration`, `StatsRow`, `TodaysFocusCard`, `TimeGroup` (icon+range), and the `ScheduleItem` chrome changes (lucide category tile, Today pill, note glyph, assignee initials). The sidebar changes from PR #10 (greeting, illustration, tagline, flat nav) are independent and remain. **Discarded:** the additive `StatsRow`/`TodaysFocusCard`/`useSystemHealth` wiring inside `TodaySchedule.tsx` (dies with the file).

## 9. Testing strategy

- **Unit:** `useTodayData` (grouping/counts/overdue with fixtures), `useWeather` (mocked fetch, success + failure), `weather_window` generator (outdoor matcher + best-day pick, pure), `resolveModules` (each entity kind → correct ordered modules; `shouldRender` gating), each new detail module's render conditions.
- **Component:** `TodayView` — shell renders, **single stats row** (explicit regression guard against the duplicate-row defect), two-up Focus/Weather, contained list card, evening meal card, overdue group placement; detail panel renders the correct template per entity kind.
- **Carried over unchanged:** all salvaged PR #10 helper/component tests.
- **E2E:** logged-in paths remain unit/component-covered (known missing auth fixture); add specs `.skip`-tagged per the existing pattern.
- **Cutover parity:** §7 parity test must pass before the `TodaySchedule` deletion commit.
- **Baseline:** pre-existing failure `src/hooks/useSpaces.test.ts` is unrelated and out of scope; no NEW failures permitted.

## 10. Non-goals

- Week/Month view redesign (toggle routes to existing views).
- The "Where does this fit?" semantic-placement triage / This Week view (Image 2) — separate spec.
- Full migration of all legacy panel content into modules (LegacyModule wrapper now; opportunistic later).
- Bucket data-model changes; routing changes beyond the HomeView seam swap + GCal banner relocation.
- LLM-generated suggestions (pipeline made ready; v1 generator is the rule-based `weather_window`).

## 11. Risks & mitigations

- **`useTodayData` extraction drift** from the 1623-line legacy memos → §7 parity test against fixtures before cutover; build behind the seam so the live route is unaffected until parity holds.
- **Detail module model under-abstracted or over-abstracted** → contract is minimal (`id`/`shouldRender`/`Component`); `LegacyModule` absorbs the long tail so scope stays bounded.
- **`useWeather` coupling to the wall implementation** → if tightly coupled, the plan includes a small extraction; `WeatherCard`/banner degrade gracefully on failure.
- **Mobile regression** → desktop-only shell; explicit mobile-unchanged assertions in `TodayView` tests.
- **Large cutover commit** → everything is tested behind the seam first; the cutover commit is mechanical (swap import, delete file, relocate banner) and gated by the full suite + parity test.

## 12. Phasing (single spec, phased plan)

One spec, one approval. The implementation plan sequences it as: (1) `useTodayData` + parity test, (2) detail module contract/registry/resolver + mockup modules + LegacyModule, (3) `useWeather` + `WeatherCard` + `weather_window` + re-enabled banner, (4) `TodayView` editorial shell composing salvaged pieces + EveningMealCard + OverdueGroup, (5) cutover (HomeView swap, ViewRouter declutter, delete legacy) gated by full suite + parity. All built behind the seam; the live route changes only at phase 5.
