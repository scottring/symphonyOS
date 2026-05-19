# Today View Redesign — Design Spec

**Date:** 2026-05-19
**Status:** Approved for planning
**Scope:** Visual + functional redesign of the Day view, detail panel, and sidebar to match the two approved mockups (Image 1: Today/Day; Image 1 right rail: meal detail panel; sidebar). Image 2 (This Week + "Where does this fit?" triage) is **explicitly out of scope** and gets its own spec.

---

## 1. Goal

Make the primary daily screen — sidebar, Today (Day) view, and the entity detail panel — match the approved mockups, **fully functional**, including a live weather card and a working AI-suggestion banner. The design system tokens (Instrument Serif + Satoshi, teal-forest primary, warm cream base) already match the mockups; this is a layout/interaction/sectioning effort plus two live-data widgets, not a token change.

## 2. Non-goals (deferred to their own specs)

- The **This Week** view redesign and the **"Where does this fit?"** semantic-placement triage popover (Today / This Week / This Weekend / Errands / Home Project / Family / Think About / Parked) and the **"Why today?"** reasoning panel — all of Image 2.
- Any change to the bucket data model (`inbox / week / month / quarter / timed` stays as-is).
- A redesigned **Week** or **Month** view. The Day/Week/Month toggle is functional, but Week/Month route to the existing views untouched.
- LLM-generated suggestions (the pipeline is made ready for them; the v1 generator is rule-based).

## 3. Standing constraint: no emoji

Project rule: **every emoji is a lucide-react icon.** The mockups show ☀️ next to the greeting and emoji category glyphs on task cards. The redesign reproduces the exact visual rhythm using **lucide icons inside soft tinted rounded tiles**. No literal emoji is introduced. This applies to the greeting sun, task-card category glyphs, and section headers.

## 4. Build strategy: layered, ship-as-you-go

One spec, three sequential layers. Each layer is independently shippable and visible on screen, and is its own review checkpoint. If time or runway forces a stop, Layers 1–2 already deliver the redesigned screen.

| Layer | Theme | Risk | New data? |
|------|-------|------|-----------|
| 1 | Chrome & layout | Lowest | No — existing data only |
| 2 | Live widgets (weather + AI banner) | Medium | Yes — weather fetch, suggestion pipeline |
| 3 | Detail panel restructure | Medium | No — re-sections existing data |

---

## 5. Layer 1 — Chrome & layout

Pure visual changes over existing data. No new hooks, no network.

### 5.1 Sidebar (`src/components/layout/Sidebar.tsx`)

- **Greeting block** replaces the bare avatar circle: time-of-day-aware text ("Good morning, Scott" / afternoon / evening) with a `<Sun />` lucide icon (no ☀️ emoji), plus the existing avatar.
- **Nav order & labels** to match the mockup, top to bottom:
  `Today, This Week, Meals, Family, Projects, Home, Inbox, Calendar, Notes, Contacts, Lists`, then a divider, then `Settings`, `Sign out`.
  - Every item maps to an **existing route / ViewType key**. No new routes.
  - "This Week" → existing week-bucket view (no redesign in this spec).
  - "Family" → existing Home/family space.
  - "Calendar" and "Notes" are promoted out of the current "Library" group into the main nav list.
  - Domain theming and existing pinned-section behavior are preserved.
- **House illustration + tagline** pinned at the sidebar bottom: an inline SVG house/landscape illustration above the line "Everything in one place, so life flows better." (Satoshi, muted neutral).

### 5.2 Today header + stats + Focus (`src/components/schedule/TodaySchedule.tsx`)

- **Date header**: keep the existing `DateNavigator` (serif "Tuesday, May 19, 2026" with ‹ › controls). Add a new segmented **Day / Week / Month** control to its right and a weather-toggle icon button.
  - Day = this redesigned view.
  - Week / Month = invoke the existing view switch (no redesign). Fully functional, no dead buttons.
- **Stats row** (new sub-component `StatsRow`): inline metrics — `N due today · N this week · N total · Clarity ‹state› · AI ‹state›`.
  - "due today" = tasks with `scheduled_for` == today; "this week" = count of `bucket === 'week'`; "total" = total open tasks. All from existing task hooks.
  - "Clarity ‹state›" reuses the existing Clarity score; the large Clarity banner condenses into this inline stat, and its existing detail **popover is preserved** on click (no loss of the remediation UI).
  - "AI ‹state›" reflects proactive-suggestion availability (Layer 2 makes this live; in Layer 1 it reads the existing — currently empty — suggestion state).
- **Two-up card row**:
  - `TodaysFocusCard` (new): computed counts ("2 priorities • 1 meal • 3 events") derived from today's items, plus a short headline selected from a small **templated set keyed to the Clarity state** (e.g. needs-attention vs. calm). Not LLM-generated.
  - `WeatherCard` (new): placeholder shell in Layer 1, made live in Layer 2.

### 5.3 Task card restyle (`src/components/schedule/ScheduleItem.tsx`, evolved in place)

Evolve the existing component; do not create a parallel card.

- **Category icon tile**: a lucide glyph inside a soft tinted rounded square, color mapped from the item's context/category (replaces the current emoji + text chip). Mapping table lives in a small helper (e.g. `categoryIcon.ts`): context/category → `{ icon, tintClass }`.
- **Title + project chip**: title, with an inline project chip ("Backyard upgrades ×") sourced from the existing project link when present.
- **Right cluster**:
  - "Today" pill when `scheduled_for` is today.
  - Note glyph (`<FileText />`) when the item has notes.
  - Assignee initials badge ("SK") derived from `assigned_to`.
- Existing hover/quick actions are kept but visually quieted (lower contrast, reveal on hover) to match the calm mockup.
- **Section headers** MORNING / AFTERNOON / EVENING: lucide icon + label + time range, rendered over the existing `groupByDaySection` grouping (no grouping-logic change).
- The **Evening meal card** (Pasta e fagioli with image, "View recipe", avatars, "Add to plan") uses the existing meal-event rendering path, restyled to match the mockup. No meal data-model change.

---

## 6. Layer 2 — Live widgets

### 6.1 `useWeather()` hook

- New hook adapting the existing wall weather source (`src/components/wall/` / `weatherMessages.ts` data path) into a main-app hook.
- Returns: current `{ tempF, condition, low, high }` and a multi-day `forecast[]` (enough days to answer "Thursday looks ideal").
- Location: from user settings if present, otherwise a sensible default. Failure mode: hook returns `null`/error state; `WeatherCard` and the AI banner degrade gracefully (card shows a muted "weather unavailable", banner suppresses the weather suggestion).
- Unit-tested with a mocked fetch.

### 6.2 `WeatherCard`

- Consumes `useWeather()`. Renders condition icon (lucide), large temp, condition label, Low/High line — matching the mockup card.

### 6.3 Re-enable the proactive-suggestion pipeline

- `useProactiveSuggestions` and the suggestion render are currently imported-but-commented in `TodaySchedule` (~lines 26–27). Re-enable them, but render as a **single styled `AiSuggestionBanner`** (not the old chips):
  `✦ AI SUGGESTION — You have 3 outdoor tasks. Thursday looks ideal (sunny, 68°F).  [View forecast]  ×`
- `×` → set the suggestion's existing status to `dismissed` (existing pipeline behavior).
- "View forecast" → opens the forecast (reuses weather data / forecast surface).

### 6.4 Rule-based `weather_window` suggestion generator

- New deterministic generator that:
  1. Scans today + this-week tasks for an **outdoor signal** — the existing chore/errand category, an explicit outdoor tag, or a title keyword match against a centralized allowlist (e.g. "yard", "outdoor", "garden", "deck", "fence"). The keyword list lives in the helper and is unit-tested so it can be tuned without UI changes.
  2. Cross-references `useWeather()` forecast.
  3. Picks the best upcoming day and emits a `ProactiveSuggestion` with a **new `suggestionType: 'weather_window'`** into the existing pipeline.
- Because it flows through the existing pipeline, future LLM-generated suggestions render through the **same `AiSuggestionBanner`** with no UI rework. This is the "rules now, infra ready" decision.
- The generator and its outdoor-signal matcher are unit-tested independently of the UI.

---

## 7. Layer 3 — Detail panel restructure (`src/components/detail/DetailPanelRedesign.tsx`)

Re-section the existing panel; do not rewrite it. Mobile bottom-sheet behavior is preserved (this is chrome/sectioning, not a new component).

### 7.1 Header + action row

- Serif title, datetime line, a type chip ("Meal" / etc.).
- Action row: **Complete · Edit · Move · More** (lucide icons) wired to the **existing** complete / skip-defer / edit / overflow handlers already in the component.

### 7.2 Section system

Each section renders only when relevant to the entity type. Implemented via a small `DetailSection` wrapper for consistent header styling.

| Section | Shown for | Source |
|---------|-----------|--------|
| **ABOUT** | all | existing notes / Tiptap (read + edit) |
| **WHAT TO BRING** | events, meals | lightweight checklist (reuses subtask model) |
| **INGREDIENTS** | meal variant only | existing recipe/meal model (`RecipeSection`) + inline add |
| **LINKS & FILES** | all | unifies existing links + `AttachmentList` under one header |
| **CREATED** | all | **new** metadata row: `created_at` + creator ("May 19, 2026 by Scott") |

- **Meal entity** composes: ABOUT + WHAT TO BRING + INGREDIENTS + LINKS & FILES + CREATED.
- **Generic task** composes: ABOUT + LINKS & FILES + CREATED + existing subtasks section (unchanged).

---

## 8. Cross-cutting concerns

- **Desktop-first.** The mockup is the ≥768px full-page layout. Mobile keeps the existing `DetailPanel` bottom sheet and existing mobile schedule layout — verify no regression, do not redesign mobile in this spec.
- **File size / componentization.** `TodaySchedule` (600+ lines) and `DetailPanelRedesign` (2300+ lines) are already large. Each layer **extracts focused sub-components** — `StatsRow`, `TodaysFocusCard`, `WeatherCard`, `AiSuggestionBanner`, `DetailSection`, `categoryIcon` helper — into their own files. This is targeted improvement within the files we're editing, **not** broad unrelated refactoring.
- **No-emoji rule** enforced everywhere (Section 3).
- **Parallel-session safety.** Per repo CLAUDE.md, implementation happens in a dedicated worktree; the main worktree stays on `main`. Remember to `cp .env <worktree>/` (gitignored, causes blank screen otherwise).

## 9. Testing strategy

- **Unit / component (Vitest + RTL):**
  - `TodaySchedule`: stats row values, Today's Focus counts/headline, Day/Week/Month toggle behavior.
  - `ScheduleItem`: Today pill visibility, note glyph presence, assignee badge, project chip, category icon mapping.
  - `useWeather`: success + failure with mocked fetch.
  - `weather_window` generator: outdoor-signal matcher + best-day selection (pure, no UI).
  - `DetailPanel`: section visibility per entity type (meal vs generic task), CREATED row, action row handlers.
- **E2E (Playwright):** logged-in flows are currently **blocked by the known missing auth fixture** (see memory `followup_e2e_auth_fixture`). Today-redesign / detail-panel E2E stays as unit/component coverage until that fixture lands; add the E2E specs but `.skip` them with a reference, mirroring the existing pattern.

## 10. Open risks

- `useWeather()` depends on the wall weather data path being reusable; if it is tightly coupled to the wall, Layer 2 includes a small extraction. Confirmed feasible by exploration (data path exists), validated during Layer 2 planning.
- `weather_window` outdoor-signal heuristic will be imperfect on day one; the keyword/category list is centralized and unit-tested so it can be tuned without UI changes.
- `DetailPanelRedesign` is large; re-sectioning risks touching unrelated rendering. Mitigation: `DetailSection` wrapper + section composition by entity type, with per-type visibility tests.

## 11. Sequencing summary

1. **Layer 1** — sidebar, Today header/stats/Focus, task-card restyle. Ship.
2. **Layer 2** — `useWeather`, `WeatherCard`, re-enable suggestion pipeline, `weather_window` generator, `AiSuggestionBanner`. Ship.
3. **Layer 3** — detail panel header/action row + section system + CREATED. Ship.

Each layer → plan → implement → review → ship before the next.
