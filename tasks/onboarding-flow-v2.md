# Onboarding flow v2 — meal-first first-run experience

Spec: `docs/design_handoff_onboarding_flow/README.md`
Replaces: `tasks/onboarding-flow.md` (the old generic onboarding wizard, now obsolete).

Decisions confirmed:
1. **(c)** Replace the old `OnboardingWizard` and retire its files.
2. Add the `?` button directly to `AppShell.tsx` in place (no extraction).
3. Migration adds rhythm fields to `standing_habits`; keeps `slot` constraint.
4. Hand-authored Whitman fixture for `/onboarding/sample`.
5. `/onboarding` is gated post-auth; `/onboarding/sample` is public.

## Architectural correction

The README says "add `/onboarding` and `/onboarding/sample` routes to `ViewRouter.tsx`." That's wrong for our architecture: `ViewRouter` only routes views *inside* `AppShell`. Onboarding has no sidebar/topbar. The right pattern is the one already used for `/wall` in `main.tsx`: a top-level `<Route>` mapping to a dedicated component that bypasses `AppShell`.

`/meals/plan`'s `EmptyState` *does* belong in the meals tree — it mounts inside `MealPlanRitualPage` (which is what `PlannerPage` re-exports), not `ViewRouter`.

## Steps

### 1. Migration `090_onboarding_v2_meal_rhythms.sql`
- `user_profiles.household jsonb default '{}'::jsonb` — `{ adults: [{name, role?}], kids: [{name, age}] }`
- `user_profiles.season_goals jsonb default '{}'::jsonb` — `{ selected: string[], custom?: string }`
- `standing_habits.detail text` (nullable) — second-line ("kids: HB eggs + sweet potato")
- `standing_habits.contributes_grams integer` (nullable)
- `standing_habits.when_label text` (nullable) — display label ("Mornings", "Off-night", "Batch-day"). Keeps `slot` constraint untouched. Plan integration uses `slot`; `when_label` is the rhythm display label.

Parser slot mapping: MORNINGS→breakfast, WEEKDAY LUNCH→lunch, SNACK→snack, EVENINGS→dinner, OFF-NIGHT/BATCH-DAY→dinner with `when_label` set (display only, no plan integration v1).

### 2. Edge function `supabase/functions/rhythms-parse/index.ts`
- Input: `{ answers: { breakfast?, lunch?, snack?, off_nights? } }`
- Calls Anthropic with the prompt from README §"LLM prompt for rhythms parsing"
- Returns: `{ habits: StandingHabitDraft[], note?: string }`
- Reuses Anthropic client pattern from `meal-plan-generate`.

### 3. State container `src/contexts/OnboardingContext.tsx`
```ts
type OnboardingState = {
  step: 1 | 2 | 3 | 4
  household: { adults: Person[]; kids: Kid[] }
  goals: { selected: string[]; custom?: string }
  rhythms: { answers: Record<string,string>; parsed: StandingHabitDraft[]; parseStatus: 'idle'|'thinking'|'ok'|'error' }
  brief: string
}
```
- Persists `household` + `goals` to `user_profiles` on each forward transition.
- `parsed` stays in memory; final `standing_habits` insert happens on screen 6 mount alongside `onboarding_completed_at`.

### 4. Onboarding pages — `src/components/onboarding/v2/`
Subfolder so the old wizard files can be deleted in a clean follow-up step without name collisions.

- `OnboardingShell.tsx` — Symphony logo top-left, progress dots top-center (4 numbered, 6→22px on active), back below, step transitions 200ms fade + 8px right slide.
- `WelcomeScreen.tsx` (`/onboarding`) — 2-col grid, "Hi {firstName}." with teal-accent period, italic subhead, "Plan my week →" CTA, secondary "See a sample plan →" link, decorative card stack right.
- `HouseholdScreen.tsx` (step 1) — Adults + Kids cards, editable rows, live summary callout. Validation: ≥1 adult.
- `GoalsScreen.tsx` (step 2) — 4×2 chip grid (8 presets), 0–2 selectable (terracotta wash + check), italic textarea for custom, live count callout.
- `RhythmsScreen.tsx` (step 3) — split layout. Left: 4 prompts as kicker + textarea pairs. Right: "Symphony's read" card with parsed habits. 600ms debounced call to `rhythms-parse`. Inline-editable rows. "Thinking…" state, 100ms staggered fade-in.
- `BriefScreen.tsx` (step 4) — wraps `InlineBriefComposer` with onboarding chrome, pre-fills body from `goals.selected.join(' · ')`, "What you'll get" 4-step preview right side. CTA reuses `useGeneratePlan`. On success → advance to NowWhat.
- `NowWhatScreen.tsx` — terminal screen, no progress dots. "That's it. Now what?" hero. Right: kicker stat block ("6 DAYS · 27 ITEMS · 5 HABITS") from `useMealPlan` + `useStandingHabits`. Three cards: REVIEW (teal, →`/meals/plan`), SHOP (outlined, →`/meals/plan#groceries`), COOK (faded, →`/wall/setup`). On mount: Promise.all writes household/goals/standing_habits then `onboarding_completed_at`. Toast on partial failure; do not block.
- `SamplePlanPage.tsx` (`/onboarding/sample`) — public, no auth. Watermark pill, condensed read-only week strip with 6 day cards from `whitmanFixture`, 2 summary cards. Bottom dark CTA bar.
- `EmptyState.tsx` — split layout, kicker "NO PLAN YET FOR THE WEEK OF {sundayDate}", title "Ready when you are.", primary CTA scrolls/focuses InlineBriefComposer, secondary "Repeat last week's plan" (stub for v1), footnote with last-brief metadata.
- `HelpPanel.tsx` — floating right-anchored popover, 360w. Esc + click-outside close. Link rows: Quick tour (no-op toast), See a sample plan → `/onboarding/sample`, Re-run setup → `/onboarding`. Skip Keyboard shortcuts row in v1 (no existing modal).
- `sample/whitmanFixture.ts` — hand-authored 6-day plan + habits + grocery summary.

### 5. Routing changes
- `src/main.tsx`: add
  - `<Route path="/onboarding" element={<OnboardingFlow />} />`
  - `<Route path="/onboarding/sample" element={<SamplePlanPage />} />`
- `OnboardingFlow` is a wrapper that handles auth check, mounts `OnboardingShell` + active screen, owns `OnboardingContext`.
- Lazy: add `OnboardingFlow`, `SamplePlanPage`, `HelpPanel` to `src/components/lazy.ts`.

### 6. Auth gate change in `App.tsx` (lines 181–189)
- Replace the swap-the-app `<OnboardingWizard>` block with `<Navigate to="/onboarding" replace />`.
- `/onboarding/sample` reachable while logged out by virtue of being a top-level route with no auth check.

### 7. PlannerPage empty state mount
- In `MealPlanRitualPage.tsx` after the loading guard: if `!brief?.body?.trim() && (plan?.entries.length ?? 0) === 0`, render `<EmptyState weekStart={weekStart} brief={brief} />` *above* the day stack — keeps `MealsTabs`, doc title, status indicator, and `InlineBriefComposer` visible. EmptyState's primary CTA scrolls to `#brief`.

### 8. Topbar `?` button
- `AppShell.tsx`: add `?` button to mobile header (alongside search/sign-out) and to the desktop floating area near `DomainSwitcher` (line 280). When `HelpPanel` open: `ring-2 ring-primary-500/30`.
- `helpOpen` state in `AppShell`.

### 9. Old wizard cleanup
- Delete `src/components/onboarding/OnboardingWizard.tsx`, `OnboardingProgress.tsx`, `index.ts`, `steps/*`.
- Remove `OnboardingWizard` lazy export.
- Remove related App.tsx imports.
- Verify nothing else imports them.

### 10. Tests (light, where boundaries warrant)
- `OnboardingContext.test.tsx`: state transitions, persistence trigger.
- `RhythmsScreen.test.tsx`: debounce → parse → render pipeline (mock fetch).
- `EmptyState.test.tsx`: renders under correct conditions.

### 11. Verify
- `npm run build`
- `npm run lint`
- Local smoke (manual): walk the 6 screens with `user_profiles.onboarding_completed_at = null`. Confirm `/onboarding/sample` works logged-out. Confirm `?` button toggles `HelpPanel` and rings.

## Out of scope
- Quick tour mode (`?mode=tour`) — stub toast.
- Keyboard-shortcut modal — omit row in v1.
- Functional OFF-NIGHT/BATCH-DAY plan integration — display only.

## Files touched
```
NEW  supabase/migrations/090_onboarding_v2_meal_rhythms.sql
NEW  supabase/functions/rhythms-parse/index.ts
NEW  src/contexts/OnboardingContext.tsx
NEW  src/components/onboarding/v2/OnboardingFlow.tsx
NEW  src/components/onboarding/v2/OnboardingShell.tsx
NEW  src/components/onboarding/v2/WelcomeScreen.tsx
NEW  src/components/onboarding/v2/HouseholdScreen.tsx
NEW  src/components/onboarding/v2/GoalsScreen.tsx
NEW  src/components/onboarding/v2/RhythmsScreen.tsx
NEW  src/components/onboarding/v2/BriefScreen.tsx
NEW  src/components/onboarding/v2/NowWhatScreen.tsx
NEW  src/components/onboarding/v2/SamplePlanPage.tsx
NEW  src/components/onboarding/v2/EmptyState.tsx
NEW  src/components/onboarding/v2/HelpPanel.tsx
NEW  src/components/onboarding/v2/sample/whitmanFixture.ts
NEW  src/components/onboarding/v2/index.ts

EDIT src/main.tsx                          (add routes)
EDIT src/App.tsx                           (gate → Navigate; remove old wizard)
EDIT src/components/lazy.ts                (add new lazies; remove OnboardingWizard)
EDIT src/components/layout/AppShell.tsx    (? button + helpOpen state)
EDIT src/components/meals/plan/MealPlanRitualPage.tsx  (mount EmptyState)

DEL  src/components/onboarding/OnboardingWizard.tsx
DEL  src/components/onboarding/OnboardingProgress.tsx
DEL  src/components/onboarding/index.ts
DEL  src/components/onboarding/steps/  (entire folder)
```

## Review (after execution)
_to be filled in_
