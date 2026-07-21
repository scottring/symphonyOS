# Rhythm Page — Routines Redesign

**Date:** 2026-07-21
**Status:** Approved by Scott (brainstorm + visual mockup round)
**Replaces:** `RoutinesListRedesign.tsx` (the flat sorted/grouped card list at `/routines`)

## Problem

The routines page renders ~58 top-level routines as a uniform wall of cards with
sort/group dropdowns and no search. It treats routines as database rows. The
data itself is messy (near-duplicate names, 22 routines with null context,
truncated capture names, 14 paused school-year routines hidden in a collapsed
section), and the page hides the mess instead of helping fix it.

## Concept

Routines are the shape of the family's time, not records. The page becomes
**Rhythm** — a picture of the default week that you sculpt. It answers "how does
our family run?" instead of "what routines exist?"

Route stays `/routines`. Masthead title stays **Routines** (the rhythm concept lives in the layout, not the page name); subtitle "How your family runs —
{weekday, date}". The list view is fully replaced; search covers find-one-thing.

## Layout (top to bottom)

1. **Masthead** — "Routines" title + subtitle; type-anywhere search affordance; `+ New` and
   `Build with AI` (existing handlers).
2. **People pills** — Everyone (default) + one pill per family member.
   Filters every zone by assignee.
3. **Daily Arc** — "Every day" zone:
   - A horizontal time ruler (first routine hour → last, roughly 6am–9pm) with
     a dawn→dusk gradient and a NOW marker at the current time.
   - **Rhythm cards** anchored along it: each card is either a real collection
     (parent routine + steps) or an automatic **cluster** of loose daily
     routines. Cards show name, time range, member chips per routine.
   - **Anytime row** — untimed daily routines as small pills.
4. **Week Strip** — "Through the week" zone: 7 columns (Sun–Sat, matching the
   app's Sunday week start). Weekly/biweekly routines appear in their day
   column (biweekly labeled "· every 2 wks"). Today's column highlighted.
   Empty days show "quiet"; days with ≥4 items get a "· full" marker.
   Untimed/unspecified-day weeklies go in a "sometime this week" pocket row.
5. **Sometimes shelf** — monthly / quarterly / yearly / specific-date routines
   as pills with frequency captions.
6. **Seasonal shelf** — all `visibility: 'reference'` routines. Framing adapts:
   grouped by `paused_until` ("Waiting for September" when paused into fall,
   "Resting" when indefinite). Shows a summary line + **Wake all** action
   (sets `visibility: 'active'`, `paused_until: null` on the group).
   Individually expandable to wake/edit one.
7. **Worth tending** — dark card listing heuristic findings (see below).
   Hidden entirely when there's nothing to tend.

Every existing routine maps to exactly one zone:
- daily recurrence → Daily Arc (timed) or Anytime row (untimed)
- weekly/biweekly → Week Strip (day column or "sometime this week")
- monthly/quarterly/yearly/specific_days → Sometimes shelf
- `visibility === 'reference'` → Seasonal shelf (regardless of recurrence)
- steps (`parent_routine_id` set) render inside their parent's card only

## Clustering (the core move)

Loose daily routines (no parent, timed) are greedily clustered by time
proximity: sort by `time_of_day`, start a new cluster when the gap to the
previous routine exceeds **45 minutes**. A cluster of ≥2 renders as one card
with an auto label ("Unnamed cluster · 6:30–7:00"). Clusters of ≥3 get the
"✦ These travel together — name this rhythm?" nudge with a suggested name
(derived from time of day: Morning / After School / Evening / Bedtime).

Naming a cluster calls the existing `onGroupIntoCollection(name, ids)` —
the visual cluster becomes a real parent routine with steps. Real collections
always render as their own card and never merge into auto-clusters.

Single loose routines render as one-line mini-cards at their position.

## People pivot

Pills derive from `familyMembers` (by `display_order`). Selecting one filters
all zones to routines whose `assigned_to_all` (fallback: legacy `assigned_to`)
includes that member. Unassigned routines show only under Everyone. Domain
lens filtering stays as-is (host-level, in `RoutinesApp`).

## Search

A global keydown listener (active when no input/textarea/contenteditable is
focused, and no panel is open): typing opens a floating filter chip showing the
query; matching routines stay lit while non-matches dim (opacity, not removal —
zones keep their shape). Esc or clearing exits. The masthead search affordance
focuses the same filter. Matching is case-insensitive substring over routine
name + step names (a step match lights its parent card).

## Worth tending (v1 — pure heuristics, no AI)

Computed client-side from the loaded routines:

1. **Look-alikes** — normalize names (lowercase, strip stopwords, singularize
   plurals crudely); flag groups sharing ≥2 significant tokens (e.g. the three
   plant-watering routines; the dog feed/water pair). Action: **Merge** —
   pick the survivor in a small dialog, delete the rest (confirm required).
2. **Missing domain** — count of `context === null` routines. Action:
   **Review** — a rapid stamping strip: routine name + three one-tap domain
   buttons, advancing through the list.
3. **Unfinished names** — names ending in a dangling word (the/every/in/a/to)
   or ending mid-word. Action: **Fix** (inline rename) or **Let go** (delete,
   confirm).

The card shows at most 3 suggestions at a time. v2 (out of scope): AI-powered
tend pass via edge function.

## Interactions

- Tap any rhythm card / routine line / pill → existing `TapRoutinePanel` /
  `TapStepPanel` overlay (unchanged wiring from `RoutinesListRedesign`).
- `+ New` → existing create collection flow; `Build with AI` → existing
  `RoutineBuilderModal`.
- Pause/wake uses existing `visibility`/`paused_until` updates and
  `PauseRoutineModal` where a duration is needed.
- The old Sort/Group dropdowns, Select mode, and the Steps/Routines section
  vocabulary are removed. "Combine into a routine" survives as cluster naming.

## Component structure

```
src/components/routine/
  RhythmPage.tsx          — new page (replaces RoutinesListRedesign in lazy.ts)
  rhythm/
    DailyArc.tsx          — ruler + rhythm cards + anytime row
    WeekStrip.tsx         — 7-day grid
    SometimesShelf.tsx    — infrequent pills
    SeasonalShelf.tsx     — paused routines + wake-all
    TendCard.tsx          — heuristics UI
    useRhythmModel.ts     — pure bucketing/clustering selector (testable)
    tendHeuristics.ts     — look-alike/missing-domain/unfinished-name logic
```

`RoutinesApp` keeps its current props/handlers; `RhythmPage` accepts the same
prop contract as `RoutinesListRedesign` (minus sort/group). No schema changes,
no new hooks, no new edge functions.

Styling: Nordic Journal tokens (cream base, forest green primary, serif
display for card names). Lucide icons only — no emoji in shipped UI (the
mockup's 🐾/🍂 become `PawPrint` / `Leaf`).

Mobile (<768px): zones stack; Week Strip becomes horizontally scrollable;
rhythm cards full-width.

## Testing

- `useRhythmModel.test.ts` — bucketing (every recurrence type lands in exactly
  one zone), clustering gaps/thresholds, collection vs cluster precedence,
  person filtering incl. legacy `assigned_to` fallback.
- `tendHeuristics.test.ts` — look-alike grouping on the real dupes, unfinished
  name detection, no false positives on normal names.
- `RhythmPage.test.tsx` — zones render from fixture routines; search dims
  non-matches; wake-all fires correct updates; tap opens panel.
- Existing `RoutinesListRedesign.test.tsx` retired with the component.

## Out of scope (v2 candidates)

- AI tend pass (edge function), load-balance stats per person,
  drag-to-retime on the arc, wall/kiosk adaptation.
