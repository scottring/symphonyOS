# Wall Redesign — Warm Nordic Kiosk ("Storybook Wall, restrained")

**Date:** 2026-07-19
**Status:** Approved by Scott (brainstorm session, visual companion iterations v1→v3)
**Source mockup:** `assets/2026-07-19-wall-mockup-chatgpt.jpeg` (ChatGPT "family orchestration" concept, 2026-07-18)
**Approved visual target:** `assets/2026-07-19-wall-mockup-v3.html` (open in a browser at ~922px wide; it is the 90%-scale approved comp)

## 1. Goal

Rebuild the presentation layer of the kitchen kiosk (`/wall-v2`) in the warm/illustrated
aesthetic of the ChatGPT mockup, adapted to the wall's real constraints. Desktop stays
authored/sharp; the wall becomes the warm surface. This is **phase 1: visual rebuild on
existing data** — zero new backend. Phase 2 (Symphony Noticed, Family Note) is specced
in §10 but not built.

## 2. Decisions made (with Scott, 2026-07-19)

| Decision | Choice |
|---|---|
| Build strategy | **Approach B** — keep `WallV2Shell` machinery (data hooks, handlers, overlays, auth recovery, build auto-reload); rebuild presentation components only |
| Layout | **"Current bones, new skin"** — left rail / center timeline / right stack; family strip replaces action dock at bottom |
| Aesthetic level | **v3** — clean Nordic base, serif reserved for display moments, one watercolor treeline |
| Portraits | One-time generated watercolor illustrations as static assets, monogram-medallion fallback built in |
| Night | **Warm-dark twin theme**, manual toggle (no auto-switching) |
| Features | Everything kept and restyled; dock trimmed to the 3 *working* actions + utilities; "coming soon" placeholder buttons retired |
| Scope guard | No new backend, no schema changes, no edge functions in phase 1 |

## 3. Hard constraints (from project memory — do not relearn these)

- Viewport is **exactly 1024×768** (ViewSonic panel). Test at that size, not in a resized window.
- The Pi delivers touch as **mouse events**. Every scrollable region must use
  `src/hooks/useDragScroll.ts`. `overflow-y-auto` alone does nothing on this device.
- No hover, no keyboard, no text input on the wall. Touch targets ≥ 80px where practical,
  never below 48px.
- Grid scroll trap: full-height grids need `grid-rows-[minmax(0,1fr)_auto]` and `min-h-0`
  on every scroll column, or inner scroll silently breaks.
- The timeline must keep rendering the **`unscheduled` bucket ("Anytime")** or non-daily
  routines vanish.
- **No emoji in UI — lucide icons only.** (All emoji in the comps are stand-ins.)
- Wall data visibility requires `context='family'` AND compound/couple scope (RLS); this
  redesign changes nothing about the queries.
- `useBuildAutoReload` and the logged-out `AuthForm` recovery path must survive untouched.

## 4. Visual language

### 4.1 Fonts

Existing app fonts (no new fonts): **Instrument Serif** (`font-display`) + **Satoshi** (body).
Georgia in the comps is a stand-in for Instrument Serif.

Serif appears in exactly six places: **weekday/date, clock, weather temperature, dinner
meal name (italic), family-member names, the quote.** Everything else is Satoshi.
Labels are Satoshi 700, uppercase, letter-spacing ~0.15em, 10–11px equivalent.

### 4.2 Palette — light ("day") theme

New token file (§6). Values from the approved v3 comp:

| Token | Value | Use |
|---|---|---|
| `paper` | `linear-gradient(170deg, #F8F3E9, #F5EFE2)` | shell background |
| `rail` | `#F1EADB` / border `#E1D7C2` | left rail + dock cluster |
| `card` | `#FDFAF3` / border `#E5DAC5` | all standard cards |
| `cardInset` | `#FBF7EE` / border `#EDE3CF` | rows inside cards (events, weather chip) |
| `ink` | `#3D362C`, strong `#2F291F` | primary text |
| `muted` | `#8A7D68`; time-of-day `#6E6252` | secondary text |
| `pine` | `#2E4638`, tint `#E1EBE2` | NOW accent, home/family tint |
| `honey` | `#C9A96B`, tint `#F2E4C4` | second accent |
| `terracotta` | `#D97F5E` (deep `#C9694C`), tint `#F6E1D2` | third accent |
| `slate` | `#7C93A8` | fourth accent |
| `lavender` tint | `#E7E3EF` | evening/night section icons |
| `dinner` | bg `#FCF5E7`, border `#E9D8B4`, label `#A8743F` | dinner card |
| `prepChip` | bg `#F2E4C4`, fg `#7A5A2E` | prep-window chip |
| `treeline` | `#7A8E7E` at 30–40% opacity | watercolor wash |

Person accent order (border-left on strip cards + reusable elsewhere):
pine-sage `#7A8E7E`, honey `#C9A96B`, terracotta `#D97F5E`, slate `#7C93A8`, cycling.

### 4.3 Palette — warm-dark ("night") twin

Same structure, espresso/pine instead of stone-gray. Starting values (tune on device):
paper `linear-gradient(170deg, #262019, #211B14)`; rail `#2C251B` border `#3B3226`;
card `#2E2820` border `#3E362A`; inset `#332C22`; ink `#EFE7D8` strong `#F7F1E4`;
muted `#A79A82`; accents keep hue but lift ~15% lightness (pine `#4E7261`, honey
`#D8BC85`, terracotta `#E29675`, slate `#93A9BC`); tints become 18–24% alpha overlays of
their accent. Dinner card bg `#332A1D` border `#4A3D28`. Treeline stays, opacity 0.18.

The existing manual toggle and `symphony-wall-theme` localStorage key are kept; only the
dark palette changes (from stone to warm-dark).

### 4.4 Card treatment

One treatment everywhere: `card` bg, 1px `card` border, `rounded-2xl` (16px),
shadow `0 1px 4px rgba(90,75,55,.07)`. Rows inside cards use `cardInset` at 12px radius.
Left-accent bars (5px) mark the NOW card (pine) and person cards (person accent).

## 5. Layout — 1024×768

Shell grid: 16px outer padding, 12px gaps,
`grid-cols-[220px_minmax(0,1fr)_264px] grid-rows-[minmax(0,1fr)_116px]`.

```
┌──────────┬──────────────────────────────┬──────────────┐
│ RAIL     │ NOW card (pinned, ~70px)     │ DINNER hero  │
│ date     ├──────────────────────────────┤ TOMORROW AM  │
│ clock    │ THE DAY AHEAD                │ AT A GLANCE  │
│ weather  │ (drag-scroll timeline)       │ [(question)] │
│          ├──────────────────────────────┤ [P2: noticed]│
│ quote    │ KEEP MOVING (~105px)         │ (drag-scroll)│
├──────────┴──────────────────────────────┴──────────────┤
│ FAMILY STRIP (person cards …)            │ DOCK 2×2     │
└─────────────────────────────────────────────────────────┘
```

- **Watercolor treeline** — SVG/PNG wash pinned top-right behind content, non-interactive.
- **Rail** (220px): serif weekday+date (~36px), "Here's the shape of your day" tagline,
  serif clock (~44px), weather chip (serif temp, condition, hi/lo), serif quote pinned to
  bottom. Quote comes from a small static array in code, rotating daily by date hash.
- **NOW card**: pinned, pine left-accent, `NOW` label, item title, countdown chip
  ("47 min"). Reuses `WallV2NowNext` selection logic; new presentation. Falls back to the
  next upcoming item ("UP NEXT") when nothing is current; hidden only when the day is done.
- **The Day Ahead** (drag-scroll): timed agenda first (existing `adaptScheduleBand`
  items rendered inline as rows: time / tinted lucide icon medallion / title / duration
  or attendee note), then remaining rhythm sections (Morning/Afternoon/Evening/Night/
  **Anytime**) with small section labels. Tap behavior unchanged (action sheet).
  Completed items keep strikethrough+fade.
- **Keep Moving** (fixed ~105px, internal drag-scroll): today's incomplete family tasks
  (incl. overdue), circle checkbox (existing complete handler), person/context chip
  right-aligned. Empty state: "Nothing pressing — enjoy the day."
- **Right column** (drag-scroll if content exceeds height):
  - **Dinner hero**: photo band (recipe/meal image if available; otherwise warm
    gradient placeholder), `DINNER PLAN` label, serif-italic meal name, sides line
    (from meal description when present), **prep-window chip** (start = dinner time −
    prep minutes; recipe prep-time metadata if available, else 45 min default). Tap =
    existing recipe-viewer/flash behavior. When no dinner is planned: quiet empty card
    ("No dinner planned — plan on the meals page").
  - **Tomorrow Morning**: tomorrow's first 3 items before noon (from the existing
    upcoming adapter data); falls back to tomorrow's first 3 items of any time; card
    hidden if tomorrow is empty.
  - **At a Glance**: computed rows from data already in hand — events count + next
    event, open tasks count + due-today count, dinner time when planned, and
    "Everyone home tonight" only when no event starts ≥ 6pm.
  - **Tonight's question** (existing `WallV2QuestionCard` data): rendered below At a
    Glance when present.
- **Family strip** (116px row): one card per `familyMembers` entry (cap 5) — portrait
  (§7) in a 60px rounded-square frame, serif name, "next thing" line reusing
  `adaptGlanceForMember` (falls back to "All clear today"). Person accent left bar.
  Tap: none in phase 1 (visual press feedback only).
- **Dock cluster** (~130px, right end of strip row): 2×2 lucide buttons —
  **Plus** (QuickCapture), **MessagesSquare** (discuss queue), **Phone** (kid phone),
  **Settings** (opens a small action-sheet with the four utilities: guest mode, refresh,
  hide daily routines, theme toggle). The floating top-right utility buttons are removed;
  the retired dock placeholders (reminder/grocery/event "coming soon") are dropped.
- **Overlays**: action sheet, recipe viewer, discussion overlay, QuickCapture, guest
  screen, phone screen, caller-ID takeover all unchanged functionally; restyle their
  surfaces to the new tokens (guest screen gets paper + serif clock treatment).
- **Removed**: `WallV2GroceryCard` (was a hardcoded placeholder — no function lost),
  `WallV2AtAGlance` per-person strip (superseded by the family strip), standalone
  `WallV2ActionDock` (superseded by dock cluster).

## 6. Component map

| Component | Fate |
|---|---|
| `WallV2Shell.tsx` | Keep all state/handlers/hooks; new grid + treeline; remove floating utilities; wire new children |
| `wallTheme.ts` (extends/replaces `tints.ts`) | **New** — §4 tokens, light + warm-dark |
| `WallV2DateColumn.tsx` | Rebuild as rail (adds clock prominence, quote) |
| `WallV2NowNext.tsx` | Keep selection logic; re-present as pinned NOW card |
| `WallV2Timeline.tsx` | Restyle; band rendered inline; keeps sections incl. Anytime |
| `WallV2KeepMoving.tsx` | **New** — today's family tasks card |
| `WallV2RightColumn.tsx` | Rebuild: dinner hero, tomorrow morning, at-a-glance, question |
| `WallV2FamilyStrip.tsx` | **New** — person cards + dock cluster; consumes `adaptGlanceForMember` |
| `WallV2UtilitySheet.tsx` | **New** — settings action-sheet (guest/refresh/hide/theme) |
| `WallV2ActionDock.tsx`, `WallV2AtAGlance.tsx`, `WallV2GroceryCard.tsx` | Retire |
| `wallV2Adapter.ts` | Mostly unchanged; add small pure helpers (tomorrow-morning slice, at-a-glance rollup, prep window) |
| Overlays (`WallV2ItemActionSheet`, `WallRecipeViewer`, `WallDiscussionOverlay`, `WallV2GuestScreen`, `WallV2PhoneScreen`, `CallerIdTakeover`) | Token restyle only |

## 7. Static assets

Directory `public/wall/`:

- `treeline.svg` — the watercolor-style treeline (ship the CSS/SVG stand-in from the comp
  first; a real watercolor PNG can replace it later, same filename).
- `portrait-<member_id>.png` — watercolor portrait per family member, 240×240. The strip
  tries this path; on load error it renders the **monogram medallion** (warm radial
  gradient, serif initial, person accent border). Nothing blocks on art existing.

**Portrait generation recipe (for Scott, one ChatGPT sitting):** for each person, prompt —
"Soft watercolor portrait illustration of [description], head and shoulders, warm cream
background, muted earth tones with sage green and honey accents, storybook style, gentle
expression, square crop" — then export square, downscale to 240×240, name by member id
(ids come from the `family_members` query; the implementation plan will list them).

## 8. Testing & verification

- Existing wall tests must keep passing; update snapshots/assertions where presentation
  changed intentionally (`wallV2Adapter.test.ts` logic tests should need no changes).
- New unit tests: prep-window math; at-a-glance rollup (incl. "everyone home tonight"
  cutoff); tomorrow-morning slice; family strip portrait fallback; utility sheet actions.
- Manual: dev server at exactly 1024×768 — verify drag-scroll on timeline, Keep Moving,
  and right column; both themes; guest/phone/discussion/capture/action-sheet round trips.
- Post-deploy: SSH screenshot from the Pi (`grim`) to confirm the real wall picked up the
  build and renders correctly.

## 9. Rollout

Feature branch worktree (`wall-redesign`) → build + tests green → push to `main`
(auto-deploys). No flag: `/wall-v2` is only consumed by the kiosk, and `useBuildAutoReload`
propagates the deploy to the Pi within minutes. If the wall misbehaves, revert the merge
commit — same-day rollback is cheap and total.

## 10. Phase 2 (specced now, built later)

- **Symphony Noticed** — a proactive gap-detection card (e.g. "Only 25 minutes between
  the dentist and soccer — leave by 1:45"). Reserved slot: top of the right column, above
  Dinner; honey-tinted card with a `Sparkles` lucide icon. Needs: an edge function that
  inspects today's timed events for tight transitions + travel-time heuristics. Out of
  phase 1 entirely.
- **Family Note** — a handwritten-style note card ("Movie night tomorrow?"). Reserved
  slot: under At a Glance. Needs an authoring surface on phone/desktop (wall is
  read-only for it) and a small notes source. Out of phase 1.
- **House Pulse** from the mockup is dropped permanently (agreed 2026-07-18).

## 11. Out of scope

New backend/schema/edge functions; desktop or mobile surfaces; per-person tap-through
day views; auto night switching; replacing the quote with AI content; any change to wall
data queries, RLS, or sync.
