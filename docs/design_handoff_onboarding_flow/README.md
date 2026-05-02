# Handoff · Symphony Onboarding Flow

## Overview

A first-run experience for Symphony — the family meal-planning app for the Whitman household. The flow takes a brand-new user from signup to a real generated meal plan in about 3 minutes. Six core screens plus three supporting surfaces (sample plan, empty state, help panel).

The point: **deliver value, not teach the UI.** The user produces a real plan during onboarding, then lands on a "Now what?" page with three concrete next actions.

## About the Design Files

The HTML files in this bundle are **design references**, not production code. They were built as a React/Babel artboard canvas to explore visual and behavioral decisions side-by-side. **Your job is to recreate these designs in the Symphony codebase** using its existing patterns — React, the existing route system (`ViewRouter.tsx`), the existing hooks (`useWeeklyBrief`, `useGeneratePlan`), the existing token system, and the editorial-calm visual vocabulary already established in the app.

Do **not** copy the JSX from `artboards/Onboarding.jsx` directly. The atoms there (Display, Italic, Kicker, Cta, Chip) are stand-ins for whatever your codebase already has. Use those.

## Fidelity

**High-fidelity.** The mocks specify final colors, typography, spacing, copy, and interaction patterns. The visual system mirrors Symphony's existing tokens (Instrument Serif display, Satoshi body, teal-forest primary, terracotta accent, warm-cream paper). Recreate pixel-close to the artboards.

## Where to find the designs

Open `Meal Planner Designs.html` in a browser. The first section ("Onboarding · First-run experience") contains all 10 onboarding artboards. Each artboard is labeled. The artboard source is `artboards/Onboarding.jsx`.

The screens, in order:
1. `ob-welcome` — Hi Iris (entry point)
2. `ob-household` — Step 1, household composition
3. `ob-goals` — Step 2, season's goals
4. `ob-rhythms` — Step 3, the magic step (free text → structured habits)
5. `ob-brief` — Step 4, first weekly brief
6. `ob-nowwhat` — Now what? (three next actions)
7. `ob-sample` — Sample-plan landing (read-only browse path)
8. `ob-empty` — Empty state of `/meals/plan` for returning users
9. `ob-help` — Help panel anchored to the `?` button (re-entry surface)
10. `ob-rationale` — Design rationale (reference; not a screen to build)

## Routing

```
/onboarding              — gated by `user.onboarding_completed_at == null`; redirects authed-and-completed users to /meals/plan
/onboarding/sample       — public, read-only sample plan (Whitman family fixtures)
/meals/plan              — unchanged route; gains a new EmptyState (artboard B) when no brief + no plan exist
```

The `?` button is a **new addition to the existing topbar**. It opens `HelpPanel` as a floating right-anchored popover (artboard C).

## Data captured & persisted

| Screen | Captured | Persisted to |
|---|---|---|
| 2 — Household | `adults: [{name, role?}]`, `kids: [{name, age}]` | `user_profile.household` (jsonb) |
| 3 — Goals | `goals: string[]` (max 2 from chip set), `custom_goal?: string` | `user_profile.season_goals` |
| 4 — Rhythms | 4–6 free-text answers parsed into `standing_habits` rows | `standing_habits` table |
| 5 — Brief | weekly brief body | `weekly_briefs` table (existing) |
| 6 — Now what? | none — terminal screen | sets `user.onboarding_completed_at = now()` on entry |

**Rhythms parsing** is the only non-trivial piece. The free-text answer "Yogurt with cherry tomatoes for me. Scott skips. Kids: HB eggs + sweet potato." should become 2–3 structured `standing_habits` rows (one per person, tagged by meal slot). Use the same LLM-parse pattern that `useGeneratePlan` uses for brief→plan; the prompt is included below.

## Components to build

All under `src/components/onboarding/` unless noted.

```
OnboardingShell.tsx        — topbar with progress dots (4 numbered steps), back/next footer
WelcomeScreen.tsx          — entry, two paths (Plan my week / See sample)
HouseholdScreen.tsx        — adult + kid editable lists with inline live summary
GoalsScreen.tsx            — 8-chip grid + free-text override
RhythmsScreen.tsx          — split layout: prompts left, "Symphony's read" right (live)
BriefScreen.tsx            — wraps existing InlineBriefComposer with onboarding chrome
NowWhatScreen.tsx          — three action cards
SamplePlanPage.tsx         — separate page at /onboarding/sample
EmptyState.tsx             — mounts in PlannerPage when state.hasBrief = false
HelpPanel.tsx              — floating popover anchored to ? button
```

## Per-screen specs

### 1 · Welcome (`/onboarding`)
- Layout: 2-column grid, copy left (1.1fr), decorative card stack right (1fr)
- Copy: `Hi {firstName}.` (display, 72pt, Instrument Serif). Period is teal-accent.
- Subhead: italic, 26pt, muted-warm-grey. Set tone of editorial calm.
- Primary CTA: "Plan my week →" (teal-filled pill)
- Secondary path: "Just looking? See a sample plan →" (left of footer, underlined link)
- Right side: 4 sample preview cards stacked at decorative angles (-3°, +2°, -1°, +3°). One uses dark fill (the kiosk preview).

### 2 · Household
- Topbar progress: 1 of 4
- Title: `Who's eating?` (display, 48pt)
- Two cards: Adults (left), Kids · optional (right)
- Each card has rows that look like person chips with avatar circle (initial), name, detail line. "Add adult/kid" is a dashed-border row with italic teal label.
- Live summary callout at bottom-left: tealish pill with `S` avatar — "Got it — a household of 2 adults + 2 kids. I'll plan parallel kid plates by default."
- Validation: at least 1 adult required to continue. Kids fully optional.

### 3 · Goals
- Topbar: 2 of 4
- Title: `What's the point this season?`
- 4×2 chip grid of preset goals. Selected = filled with accent (terracotta wash) + checkmark.
- Below: "Or describe it your way" — single italic-styled textarea
- Live count callout bottom-left: "2 selected · 800g challenge + waste less"
- Validation: 0–2 chips selectable. Custom text always allowed. Zero selections OK (skipping = "Symphony picks for you" which the brief composer handles).

### 4 · Rhythms — the heart of the flow
- Topbar: 3 of 4
- 2-column split, equal width
- LEFT: 4 prompts as kicker + answer-textarea pairs:
  - "Breakfast usually looks like…"
  - "Lunch most weekdays…"
  - "Anything you tend to snack on?"
  - "Any nights you don't cook?"
- RIGHT: card titled "Symphony's read" with `S` avatar + meta tag ("5 habits · 1 off-night"). Italic intro line. Then a list of parsed habits, each row: kicker timestamp + display-line + grey detail line. Bottom callout: "These become standing habits."
- **Behavior**: as the user types in left textareas, debounce 600ms then call the rhythm-parser endpoint and update the right side. Show a subtle "thinking…" state during the call.
- The right side is the trust moment. If the parse is off, the user can edit the structured habits inline (they're real form fields, not just preview).

### 5 · Brief
- Topbar: 4 of 4
- Title: `Tell Symphony what this week looks like.`
- 1.2fr/1fr split. Left = composer (paper-textured, 1-line numbered list, lines 1–4 pre-filled from goals + suggestions). Right = "Suggestions" chip rack + "What you'll get" 4-step preview card.
- Pre-filled lines come from goals selected in screen 3. E.g. "800g challenge" → line 1 reads "800g challenge".
- Primary CTA: "Generate my plan →" with `S` glyph. On click: spinner inline, then auto-advance to screen 6 once `useGeneratePlan` resolves.
- Errors: inline below the composer in muted terracotta.

### 6 · Now what?
- No step indicator (terminal screen)
- Hero: "That's it. Now what?" (display, 64pt, "Now what?" is italic teal)
- Right of hero: large italic teal "6" with kicker "DAYS · 27 ITEMS · 5 HABITS" (numbers from the generated plan)
- Three cards in a row:
  1. ① REVIEW — teal-filled primary card → `/meals/plan`
  2. ② SHOP — outlined card → `/meals/plan#groceries`
  3. ③ COOK — outlined card, slightly faded → `/wall/setup`
- Bottom row: muted strip with `S` avatar reminding about the `?` button
- On mount: write `user.onboarding_completed_at = now()`

### A · Sample plan (`/onboarding/sample`)
- Watermark badge centered at top: terracotta pill `SAMPLE PLAN · NOT YOURS · WHITMAN FAMILY`
- Below: condensed read-only week-strip with 6 day cards, plus two summary cards (habits, batch list)
- Bottom: dark CTA bar — "Like what you see?" + "Start your own plan →" (routes to `/onboarding`)
- All meal/grocery actions disabled (read-only)

### B · Empty state (mounted in `/meals/plan`)
- 1.2fr/1fr split. Left = copy + CTAs. Right = dashed-border skeleton preview of "what'll appear here"
- Kicker: "NO PLAN YET FOR THE WEEK OF {sundayDate}"
- Title: "Ready when you are."
- Primary CTA: "Write this week's brief →" (scrolls/focuses the inline brief composer)
- Secondary: "Repeat last week's plan" link
- Footnote line: "Last brief: Apr 27 · '...' · 5 standing habits saved"
- Renders only when: no `weekly_brief` for current week AND `meal_plan_entries` empty for current week

### C · Help panel
- Triggered by `?` button in topbar (new). Button gets a teal ring when panel is open.
- Floating popover, top-right, 360w. Soft shadow, pure-white card.
- Header: "HELP & TOUR" kicker + close ×
- Italic display: "What is this page for?"
- Body paragraph explaining the ritual (top-to-bottom scroll)
- 4 rows (icon + title + sub):
  - Quick tour
  - See a sample plan
  - Re-run setup
  - Keyboard shortcuts
- Footnote: "Stuck? Type ⌘K anywhere to ask Symphony."
- Esc closes. Click-outside closes.

## Interactions & transitions

- Step transitions: fade + 8px slide right. 200ms ease-out.
- Progress dots: animate width from 6→22px on active step, 200ms.
- Rhythms parse: 600ms debounce on input, fade-in new habit rows from below (100ms each, staggered 40ms).
- Generate plan: button shows inline spinner (replace text), full-screen subtle dim until resolved.
- Help panel open: scale-from-0.96 + opacity 0→1, 160ms.
- All easings: `cubic-bezier(0.2, 0.8, 0.2, 1)`.

## State management

```ts
// New context: OnboardingContext
type OnboardingState = {
  step: 1 | 2 | 3 | 4;
  household: { adults: Person[]; kids: Kid[] };
  goals: { selected: string[]; custom?: string };
  rhythms: { answers: Record<string, string>; parsed: StandingHabit[] };
  brief: string; // pre-filled from goals
};
```

Persist on every step transition (forward and back). On screen 6 mount, fire a single mutation that:
1. Writes household → `user_profile`
2. Writes goals → `user_profile.season_goals`
3. Writes parsed rhythms → `standing_habits` rows
4. Sets `user.onboarding_completed_at`

If any write fails, surface a toast, do not block — the user has their plan and can fix profile data later.

## Design tokens (already in Symphony codebase)

Use existing tokens. For reference, the artboards use:

```
--paper-bg:    hsl(45 25% 96%)
--paper-elev:  hsl(48 35% 99%)
--ink-800:     hsl(25 18% 15%)
--ink-500:     hsl(34 8% 42%)
--primary:     hsl(168 45% 30%)   /* teal-forest */
--accent:      hsl(18 55% 45%)    /* terracotta */
--display:     'Instrument Serif'
--body:        'Satoshi'
```

## LLM prompt for rhythms parsing

```
You are Symphony, a meal-planning assistant. The user just answered 4 prompts about their family's eating rhythms. Parse their free-text answers into a structured list of standing habits.

A standing habit has:
- when: one of MORNINGS | WEEKDAY LUNCH | SNACK | OFF-NIGHT | BATCH-DAY | EVENINGS
- what: a short noun phrase (e.g. "Yogurt + tomatoes for Iris")
- detail: optional second line with portion/grams or who-applies-to
- contributesGrams?: optional integer (estimate of fruit+veg grams toward the 800g target)

Be conservative. If an answer is vague, don't invent a habit — return only what's clearly stated. Group by person where given.

Return: { habits: StandingHabit[], note?: string } where note is a one-sentence reflection like "Here's what I'm hearing."
```

## Re-entry tour (the `?` panel "Quick tour")

Out of scope for v1. The Quick tour link in the help panel can be a stub that links back to `/onboarding` with a `?mode=tour` param — for now, treat it like a no-op that shows a "Coming soon" toast. The empty state + help panel cover 90% of returning-user needs.

## Success metrics

- Completion rate: >75%
- Time to plan generated: <4 min median
- Sample-plan → real-plan conversion: >40%
- Standing habits captured per completed user: 3+
- Sunday re-engagement of completers: >60%

## Open questions for the implementer

1. **Topbar component path** — where does the `?` button slot in? (Likely `src/components/layout/AppTopbar.tsx`.)
2. **Onboarding completion flag** — column on `users`, or new `user_profile.onboarded_at`?
3. **`standing_habits` schema** — does it already accept the rhythm shape, or does it need a migration?
4. **Sample plan fixtures** — pull from Whitman family demo data (the 28-entry plan referenced in the broader unification plan), or build a hand-authored fixture file? Hand-authored is probably cleaner and decoupled from real demo data.
5. **Auth-gated routes** — confirm `/onboarding` is reachable post-auth but pre-completion and that the existing route guard is happy with that state.

## Files in this bundle

```
Meal Planner Designs.html        — main canvas, open this in a browser
artboards/Onboarding.jsx         — the 10 onboarding artboards (visual reference)
artboards/*.jsx                  — sibling artboards (Symphony's broader design system; not required for this feature but useful context for visual vocabulary)
design-canvas.jsx                — the canvas runtime that renders the artboards
screenshots/                     — PNG of every onboarding artboard at native resolution
README.md                        — this file
```

## Screenshots

```
screenshots/01-welcome.png       — entry screen
screenshots/02-household.png     — step 1
screenshots/03-goals.png         — step 2
screenshots/04-rhythms.png       — step 3 (the trust moment)
screenshots/05-brief.png         — step 4
screenshots/06-nowwhat.png       — terminal screen
screenshots/A-sample.png         — sample plan landing
screenshots/B-empty.png          — empty state of /meals/plan
screenshots/C-help.png           — help panel anchored to ?
screenshots/D-rationale.png      — design rationale (reference only)
```
