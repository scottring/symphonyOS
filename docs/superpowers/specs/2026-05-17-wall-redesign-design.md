# Wall (Kitchen Kiosk) Redesign

**Date:** 2026-05-17
**Status:** Spec — pending review
**Branch:** TBD (suggest `feat/wall-redesign`)
**Surface:** TV-mounted touchscreen in the kitchen — 8-foot viewing, tap input, glance-able

---

## Problem

The wall has grown organically into a 743-line `WallCalendar.tsx` with 30+ widget imports and two tabs (Calendar + Rooms). Scott's review:

- **Not interactive enough** — most things you'd want to tap (chores, tasks, "open this recipe") are passive or buried.
- **Wrong rhythm** — the same screen shows at 7am breakfast scramble and 7pm dinner cleanup. No time-of-day awareness shaping the focus.
- **Family-specific gaps** — Iris, Mia, Liam can't easily see what's theirs vs. someone else's; kids have no obvious way to tap chores done.
- **Dead tab** — Rooms tab is never used in practice; takes up screen and decision space.

Content is roughly right; the redesign is about restructuring layout, adding interactivity, and introducing a time-of-day rhythm.

---

## Design Philosophy

**The wall is a family command center, not a dashboard.** Anyone in the family walks up, sees the single most important thing right now, taps to act, leaves. One person interacts at a time; the screen optimizes for that.

**Three principles:**
1. **One focal thing at a time.** A single large "Now Card" commits to the most important context. Don't try to show everything.
2. **Touch-first, glance-readable.** Tap targets ≥48×48px. Type readable from 8 feet. No hover, no fine pointer.
3. **Rhythm over uniformity.** What the Now Card shows shifts by time of day. The user can override; auto resumes after idle.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  5:34 PM                                                       68° clear │  ← Chrome: clock + weather
│  SUN · MAY 17                                              72/54 · clear │
├─────────────────────────────────────────────────┬────────────────────────┤
│                                                 │  [Scott] [Iris] [Mia]  │  ← Family filter (left of right col)
│         TONIGHT'S DINNER                        │  [Liam] [ALL]          │
│                                                 │                        │
│   Sheet-pan chicken & veggies                   │  TODAY                 │
│   35 min · serves 4 · 6:30 PM                   │  ◯ Set table       🟠  │
│                                                 │  ◯ Soccer bag      🟢  │
│   Preheat 425°F. Toss bell peppers,             │  ◐ Run with Jax    🔵  │
│   zucchini & cherry tomatoes in olive oil…      │  ✓ Reply Kemira    🔵  │
│                                                 │  ⏰ 7p Soccer      🟢  │
│   [👨‍🍳 Scott cooks]  [🛒 Missing tomatoes]    │  ⏰ 8:30p Bedtime      │
│                                                 │                        │
│   [📖 Open recipe] [⏱ Start timer] [📌 Pin]    │  COMING UP             │
│                                                 │  TOMORROW · Dentist 8a │
├─────────────────────────────────────────────────┤  TUE · Soccer 7p       │
│  6–9a · 9a–3p · 3–5p · [5–7p Dinner] · 7–9p · 9+│  WED · Dinner w/Grandma│
└─────────────────────────────────────────────────┴────────────────────────┘
                                                                       [🎤] ← Floating mic (existing)
```

**Proportions (16:9 TV at 1920×1080):**
- Chrome strip: 80px
- Main grid: ~880px tall
  - Left column (Now Card): 65% width
  - Right column (Today + Coming Up): 35% width
- Rhythm bar: 56px (bottom)
- Touch targets in the Today list: 64px row height; checkbox 44×44px

---

## Time-of-Day Rhythm

Six modes mapped to clock windows. The current mode controls what fills the Now Card.

| Mode | Window | Default Now-Card content (when nothing higher-priority active) |
|---|---|---|
| **Morning** | 6:00–9:00 | Kids' morning routine checklist (huge, kid-tap-friendly) |
| **Day** | 9:00–15:00 | Top uncompleted task of the day, or "agenda preview" if all clear |
| **After school** | 15:00–17:00 | Pickup / snack reminders, after-school routine |
| **Dinner** | 17:00–19:00 | Tonight's dinner plan (recipe-ready, action buttons) |
| **Bedtime** | 19:00–21:00 | Kids' bedtime routine checklist |
| **Wind down** | 21:00–05:59 | Tomorrow's first event preview; dim mode (40% brightness) |

Boundaries are inclusive of the lower bound, exclusive of the upper. 6:00:00 sharp falls into Morning.

**The Rhythm Bar** at the bottom shows all six modes; the current one is highlighted. **Tapping any mode overrides** the auto selection — e.g., tap "Dinner" at 2 PM to pull up the dinner card with recipe to do prep. Tapping the highlighted "Now" indicator (or the current mode again) returns to auto.

**Override timeout:** 5 minutes idle → snap back to auto. Or tap "Now" pill.

---

## Priority Hierarchy for Now Card

Within any rhythm mode, the Now Card resolves to the highest active item from this list. Higher rows beat lower rows.

1. **Pinned card** — if user pressed 📌 Pin, that card holds until unpinned
2. **User override** — if user tapped a Coming Up item or rhythm bar mode (5-min timeout)
3. **Active recipe** — someone tapped "Open recipe" or "Start timer" on dinner (sticky for that meal)
4. **Imminent timed event** — happening in next 30 minutes (soccer, dentist)
5. **Active routine window** — kids' morning routine (during Morning), bedtime routine (during Bedtime)
6. **Mode default** — the per-mode content from the rhythm table above
7. **Empty fallback** — gentle message ("All quiet · here's tomorrow at a glance")

---

## Right Column: Today + Coming Up

The right column is the family agenda + checklist.

### Family filter avatar row (top of right column)

A horizontal strip: `[Scott] [Iris] [Mia] [Liam] [ALL]`. Each avatar is 48×48px. Tapping filters the Today section to that person; tapping "ALL" (default) shows everyone. Selected avatar has a colored ring.

### TODAY section (most of the column)

A vertical list of today's actionable items, sorted by time, then by status (uncompleted first, completed faded last).

**Item types:**
- **Task** — round checkbox; tap to complete (200ms strike-through animation, then 500ms before it moves to the bottom faded)
- **Chore** — same as task but with a small recurring 🔁 icon
- **Routine step** — like a task, but checkbox is square (distinguishes recurring-by-time-of-day from one-off)
- **Event** — clock icon ⏰ instead of checkbox; not checkable, but tappable → opens detail overlay or focuses Now Card

**Row anatomy:**
```
[ ◯ ]  Task title here                    🟠
[44px] [flex, 18px font]                  [28px avatar]
```

64px row height. Tap target = entire row.

**Filter behavior:** filter applies in real time. If no items for selected person, show "No items for Mia today · tap any other avatar".

### TO DISCUSS section (middle of column)

Items flagged with `needsDiscussion: true` (from the triage Discussion picker — set elsewhere in Symphony when an item needs Scott + Iris to talk about it). The kiosk is exactly where they should appear: both adults are nearby at dinner / cleanup.

**Row anatomy:** same shape as Today rows, but with a 💬 icon instead of a checkbox. The icon doubles as the check-off button — tap it to set `needsDiscussion: false` (and clear `discussionNote`), which makes the row fade out and remove.

```
[ 💬 ]  Summer camp dates                💬
[ 💬 ]  Mia's piano teacher payment      💬
```

Each row is also tappable on the title to see the `discussionNote` (if any) — opens a small inline expansion or a brief detail overlay.

Hidden entirely when no items flagged. Header label: `TO DISCUSS (3)` with count.

This section is distinct from the daily Family Conversation Prompt — the prompt rotates by date and is a dinner-table conversation starter; "to discuss" items are real action items between adults.

### COMING UP section (bottom of column)

A compressed week preview — one line per day. Uses existing `WallLookAhead` component, simplified to: `DAY · top 2 items joined with comma`.

```
TOMORROW · Dentist 8a, Camp pickup 3p
TUE · Soccer 7p, Iris travel
WED · Family dinner with Grandma 5:30p
```

Tap a day → expands inline to a fuller list; tap again to collapse. Tap any item → makes it the focus card (with 5-min auto-return).

---

## Family Discussion Topic

Daily-rotating family dinner conversation prompt. Source: a curated list of ~80 prompts in a new file `src/data/familyDiscussionPrompts.ts`, indexed by `dayOfYear % prompts.length`. Predictable, no AI, easy to edit.

**Surfacing:**
- During Dinner mode (5–7pm), the discussion prompt appears as a **subtle chip** below the recipe in the Now Card: `💬 Tonight's question: "What was the best part of today?"`
- During other modes, it lives in **Coming Up** as a `TONIGHT · 💬 Family question` item that can be tapped to surface as a Now Card overlay.
- Once dismissed for the day (long-press to dismiss), it stays gone until the next day's roll.

**Sample prompts** (placeholder; final list in implementation):
- "What's something that made you laugh today?"
- "If you could invent one new holiday, what would it be?"
- "What's a small thing someone did for you this week that you appreciated?"
- "If we could go anywhere together tomorrow, where would we go?"
- "What's a skill you'd like to learn this year?"

The list is editable by anyone; new prompts can be appended without breaking the rotation.

---

## Interactivity Catalog

| User action | Result |
|---|---|
| Tap rhythm bar mode | Now Card overrides to that mode; "Now" pill appears for quick return |
| Tap "Now" pill or current-mode indicator | Return to auto rhythm |
| Tap Coming Up item | Now Card becomes that event/task detail; 5-min auto-return |
| Tap 📌 Pin on Now Card | Pin locks the card; tap again to unpin |
| Tap checkbox in Today list | Mark task/chore/routine-step complete; optimistic update + Supabase write |
| Tap event row in Today list | Open detail overlay (existing `WallItemDetail`) |
| Tap 💬 button on a "To Discuss" row | Sets `needsDiscussion: false` on the task; row fades out |
| Tap title in a "To Discuss" row | Inline expansion showing `discussionNote` |
| Long-press a family discussion chip | Dismiss daily family conversation prompt for today |
| Tap family avatar | Filter Today section to that person |
| Tap floating 🎤 button | Existing mic input flow |

---

## Preserved features

- **Mic input** (`WallMicButton`) — floats bottom-right corner, unchanged.
- **Recipe viewer** (`WallRecipeViewer`) — opens as overlay when "Open recipe" tapped on dinner Now Card.
- **Discussion overlay** (`WallDiscussionOverlay`) — opens for existing "needs-discussion" items (different from family conversation prompt).
- **Travel day banner** (`WallTravelDay`) — when active, slides in across the top of the screen.
- **Email actions overlay** (`WallEmailActions`) — surfaces when there are urgent emails; tap to act. Available via a chip in Coming Up.
- **Weather effects** (`WeatherEffects`) — subtle background visuals; unchanged.
- **Night mode** (existing `nightWake` state) — wake on touch, dim after timeout. Wind Down mode integrates with this.
- **`useContextEngine`** — already provides time-of-day context detection; we wire its output to the rhythm bar's current-mode highlight.
- **All existing data hooks:** `useWallData`, `useActionableInstances`, `useMealPlan`, `useRecipes`, `useOpenListCount`, `useFamilyDiscussionItems`, `useWeather`, `useKioskCards`, `useEmailActionItems`.

## Removed features

- **Rooms tab and the `RoomsKioskView` reference** in `WallCalendar.tsx`. (`RoomsKioskView` itself is not deleted — other surfaces in `apps/home/kiosk/` may still use it; the wall just no longer renders it.)
- **The tab toggle** between calendar and rooms — there's only one view now.
- **`WallSwimlane`** as the dominant layout — its job is now split: events go into the Today section of the right column; recipe/dinner detail goes into the Now Card. The `WallSwimlane` component file may be removed if no other surface uses it (verify before deleting).
- **Widget cluster on the main canvas:** `WallJaxWidget`, `WallJaxCareWidget`, `WallChoresWidget`, `WallDinnerWidget` (separate from `WallDinnerPromptWidget`), `WallScreenTimeWidget`, `WallScribbleWidget`, `WallProgressRing`, `WallRewardWidget`, `WallRoadMap`, `WallRunningTipOverlay`, `WallSoccerTipOverlay`, `WallEmailActionCard`, `WallTodayTimeline` (as a separate component — its data feeds Today section), `WallScratchpad` — these are no longer rendered by `WallCalendar`. Files can stay in the repo (out of scope to delete), but they're unused after this redesign.

## Out of scope

- Multi-user authentication on the wall (assumes a single shared family context, as today).
- Custom layouts per user.
- Voice-driven navigation (separate effort).
- Kid-mode UI lockdown (e.g., preventing accidental task creation by toddlers).
- Mobile/laptop rendering of the wall view — wall is a fixed-orientation surface.
- Migrating `RoomsKioskView` elsewhere.

---

## Component changes

```
src/components/wall/
├── WallCalendar.tsx              ← REWRITE: drop tabs, drop swimlane main canvas, mount new layout
├── WallNowCard.tsx               ← NEW: top-level focus-card component (replaces / wraps WallNowFocusCard)
├── WallRhythmBar.tsx             ← NEW: bottom strip with 6 mode buttons + Now pill
├── WallRightColumn.tsx           ← NEW: family filter + Today list + Coming Up
├── WallTodayList.tsx             ← NEW: checkable list of today's tasks/chores/routines/events
├── WallDiscussList.tsx           ← NEW: needs-discussion items with inline check-off
├── WallFamilyFilter.tsx          ← NEW: avatar strip with selected-state
├── WallChrome.tsx                ← NEW: clock + weather header strip (extracted from current code)
├── WallLookAhead.tsx             ← MODIFY: compressed mode (1-line per day) when not expanded
├── WallNowFocusCard.tsx          ← REUSE (becomes the default fallback content for WallNowCard)
└── now/useImminentEntity.ts      ← REUSE (drives priority #4 "imminent timed event")

src/hooks/
├── useWallRhythm.ts              ← NEW: current rhythm mode + override + auto-return logic
└── useDailyDiscussionPrompt.ts   ← NEW: rotates daily prompt from the curated list

src/data/
└── familyDiscussionPrompts.ts    ← NEW: 80+ curated prompts (TypeScript const array)

src/components/wall/views/
└── (existing files unchanged)
```

### Shared `RhythmMode` type

```tsx
type RhythmMode = 'morning' | 'day' | 'after-school' | 'dinner' | 'bedtime' | 'wind-down'
```

### `WallRhythmBar` API

```tsx
interface WallRhythmBarProps {
  modes: RhythmMode[]            // 6 modes from rhythm spec above
  currentMode: RhythmMode        // detected from clock (via useWallRhythm)
  overrideMode: RhythmMode | null // set by user tap
  onSelectMode: (mode: RhythmMode | null) => void  // null = clear override
}
```

### Shared `TodayItem` type

```tsx
type TodayItemKind = 'task' | 'chore' | 'routine-step' | 'event'

interface TodayItem {
  id: string
  kind: TodayItemKind
  title: string
  completed: boolean
  ownerId: string | null         // family member id; null = unowned / whole-family
  startTime: Date | null         // null = no specific time (chore, task)
  sourceId: string               // backing Supabase row id (task/routineInstance/event)
}
```

### `WallTodayList` API

```tsx
interface WallTodayListProps {
  items: TodayItem[]             // tasks + chores + routine steps + events
  selectedMemberId: string | null  // null = ALL
  onCheckItem: (id: string, completed: boolean) => void
  onTapEvent: (id: string) => void  // opens detail overlay
}
```

### `useWallRhythm` API

```tsx
function useWallRhythm(): {
  mode: RhythmMode               // resolved (override if set, else auto)
  autoMode: RhythmMode           // raw clock-driven
  overrideMode: RhythmMode | null
  setOverride: (mode: RhythmMode | null) => void  // resets 5-min idle timer
}
```

The 5-minute idle timer resets on any tap interaction within the wall surface.

---

## Visual style

- Background: deep neutral (`#1a1f1a` ish) with subtle weather-effects gradient — preserves the "ambient" feel.
- Now Card: warm green gradient (`#2d4f3a → #1a2e22`) with rounded corners and soft shadow.
- Right column: glass-card (`bg-white/4` over the dark base) with subtle border.
- Type: Fraunces (display) for big card titles and clock; system sans for body.
- Font sizes calibrated for 8-foot viewing:
  - Clock: 28pt
  - Now Card title: 30pt
  - Now Card body: 13pt
  - Today list rows: 18pt title, 13pt meta
  - Coming Up rows: 13pt
  - Rhythm bar mode labels: 11pt + 9pt sub-label

Colors and design tokens reuse the existing Nordic Journal palette where applicable.

---

## Testing strategy

**Unit tests** (Vitest):
- `useWallRhythm.test.ts` — auto-mode for each hour; override + auto-return after 5 min; idle-timer reset on activity.
- `useDailyDiscussionPrompt.test.ts` — rotation logic; same prompt all day; rolls over at midnight; dismissed state persists for the day.
- `WallRhythmBar.test.tsx` — renders 6 modes; current highlighted; tap fires onSelectMode; "Now" pill behavior.
- `WallTodayList.test.tsx` — renders tasks/chores/routines/events; family filter; checkbox toggles; event tap fires correct callback.
- `WallFamilyFilter.test.tsx` — avatar selection; "ALL" resets filter.
- `WallNowCard.test.tsx` — renders priority hierarchy correctly (mock different active states); pin button toggles; tap returns the right callback.

**Integration tests**:
- `WallCalendar` integrates rhythm + override flow — tap rhythm mode → Now Card content changes; idle 5 min → auto returns.
- `WallTodayList` checkbox tap → optimistic update + persistence.
- Family filter → only relevant rows visible.

**E2E** (Playwright, optional given testbed constraints):
- Open wall route → see clock, Now Card, Today, Coming Up.
- Tap "Dinner" rhythm mode at any clock hour → recipe card appears.
- Tap a chore checkbox → it strikes through and moves to bottom.

---

## Migration / rollout

- **No data migration needed.** All consumed data already exists in Supabase via existing hooks.
- **No new database tables.** Discussion prompts are static TypeScript data.
- **Single PR.** Feature-flag not necessary — wall is currently broken-enough that strictly-better is OK. If anything regresses badly, revert is one commit.
- **`RoomsKioskView`** is not removed from the repo, only from `WallCalendar`. Anyone wanting to bring it back as a separate route can wire it independently.

---

## Open questions

1. **Touch calibration** — the current display may have touch lag or palm-rejection issues. We'll discover this in manual testing on the actual TV; tap-target tuning is a follow-up.
2. **Sleep / screensaver behavior in Wind Down mode** — should it dim to a clock-only view after no activity for X minutes? Proposed: dim to 30% brightness with just clock + tomorrow's first event after 10 min idle; full sleep at 11pm or after 30 min idle.
3. **What if a family member isn't in `familyMembers` data** (e.g., a guest) — they won't appear in the filter. Acceptable; not a blocker.

These are minor; resolve during implementation.
