# Wall V2 — kitchen kiosk redesign

Target: pixel-match the cream/Nordic-Journal mockup; mount at `/wall-v2`
alongside existing `/wall`. Wire real data where the hook already exists; stub
the rest cleanly.

## Decisions (locked with Scott)
- **Parallel route** `/wall-v2`. Don't touch `WallCalendar`.
- **Wire real data** where it exists (useWallData, useWeather, mealEvents).
- **Keep overlays:** mic button, recipe viewer, discussion overlay.
- **Drop:** rhythm bar, quadrant grid, context engine overlays, NowCard.
- **Icons:** lucide-react only — no emoji (memory: `project_no_emoji_use_icons`).

## Layout map (1920×1080 TV)

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│ DATE COLUMN  │ AT A GLANCE (4 cards) + tagline  │ WEATHER      │
│              │──────────────────────────────────│ GROCERY      │
│ Wednesday    │ TODAY'S PLAN                     │ UPCOMING     │
│ May 20, 2026 │   ☀ Afternoon → 2 events         │ AI INSIGHT   │
│              │   ☾ Evening   → 2 events         │              │
│ 72° Sunny    │   ☾ Night     → 1 event          │              │
│ Hi/Lo        │   [View full day]                │              │
├──────────────┴──────────────────────────────────┴──────────────┤
│ Add reminder  Add grocery  Add task  Discuss  Event  Photo     │
└────────────────────────────────────────────────────────────────┘
```

Grid: `grid-cols-[260px_1fr_360px]` with bottom dock as a 7th row.

## File plan (all under `src/apps/wall-v2/` and `src/components/wall-v2/`)

- `src/apps/wall-v2/WallV2App.tsx` — top-level, wraps GeneratePlanProvider
- `src/apps/wall-v2/index.ts` — `wallV2AppDef`, route `/wall-v2`, chromeless
- `src/shell/appRegistry.ts` — register `wallV2AppDef`
- `src/main.tsx` — add `<Route path="/wall-v2/*" element={<Shell />} />`

Layout pieces:
- `components/wall-v2/WallV2Shell.tsx` — orchestrates data + lays out grid
- `components/wall-v2/WallV2DateColumn.tsx` — left rail
- `components/wall-v2/WallV2AtAGlance.tsx` — 4-card top row
- `components/wall-v2/WallV2Timeline.tsx` — sectioned afternoon/evening/night
- `components/wall-v2/WallV2EventCard.tsx` — single timeline card (with optional avatars / chips)
- `components/wall-v2/WallV2RightColumn.tsx` — container for the 4 right widgets
- `components/wall-v2/WallV2WeatherCard.tsx`
- `components/wall-v2/WallV2GroceryCard.tsx`
- `components/wall-v2/WallV2UpcomingCard.tsx`
- `components/wall-v2/WallV2InsightCard.tsx`
- `components/wall-v2/WallV2ActionDock.tsx` — 6 buttons
- `components/wall-v2/WallV2ActionButton.tsx` — colored circular icon + label

## Data sources

| Surface | Source | Status |
|--------|--------|--------|
| Date / weekday | `new Date()` | trivial |
| Weather (date col + right card) | `useWeather()` | existing |
| AT A GLANCE per-kid | `wallData.familyMembers` + `wallData.days[today].items` (first event per member) | derive |
| TODAY'S PLAN timeline | `wallData.days[today].items` grouped by section + `useMealEventsForDate` for dinner | existing |
| Dinner card avatars | `wallData.familyMembers` | existing |
| Recipe URL on dinner tap | `detectRecipeUrl(dinner.description)` → `WallRecipeViewer` | existing |
| Grocery card | **TODO** — no hook yet → static for v1, slot for future `useGroceryList()` |
| Upcoming card | `wallData.days.filter(!isToday).slice(0,2)` first item each | derive |
| AI Insight | **Static placeholder** for v1 |

## Action dock wiring

| Button | v1 behavior |
|--------|-------------|
| Add reminder | Open existing `WallMicButton` flow (voice → inbox) or QuickCapture overlay |
| Add grocery item | TODO — stub (toast "coming soon") in v1 |
| Add task | Open QuickCapture overlay |
| Need to discuss | Open existing `WallDiscussionOverlay` |
| Add event | TODO — stub |
| Add photo | TODO — stub |

## Visual recipe

- Background: `bg-[var(--color-bg-base)]` (warm cream from Nordic Journal)
- Cards: `bg-white border border-black/5 rounded-2xl shadow-sm` (light variant)
- Section labels: `text-[0.7rem] uppercase tracking-[0.18em] text-stone-500 font-bold`
- Display headlines: `font-display` (Fraunces), large weights
- Touch targets: min 80×80 per kiosk-design skill; action dock buttons 96×96
- No scrolling — pin everything to the viewport

## Order of operations

1. Scaffold WallV2App + register route → confirm `/wall-v2` loads with placeholder
2. Build WallV2Shell with static mock data matching the image exactly
3. Wire useWallData, useWeather, mealEvents
4. Wire overlays (mic, recipe, discussion)
5. Add minimal vitest snapshot for WallV2Shell rendering static props
6. Verify with `npm run lint && npm run build` in worktree
