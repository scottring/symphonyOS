# Shared Page Container — design

**Date:** 2026-07-17
**Findings addressed:** walkthrough punch-list #1 (`/year` gutter too tight), #2 (library pages float too far off the nav), #4 (`/goals` titles truncate).

## Problem

There is no shared page wrapper. `ShellRoutes` renders each app's `Component` with zero wrapping markup, and `ShellLayout`'s content frame adds no horizontal padding. Every leaf page therefore invents its own column — five different max-widths (672 / 768 / 940 / 1152 px) and six different paddings, split between centered (`mx-auto`) and left-aligned. The result is inconsistent left gutters:

- `/today` — `max-w-[940px]` **centered**, `md:px-8` (the reference Scott likes)
- `/year /week /month /season` — same 940px but **left-aligned**, tight `pl-10` (~40px) → #1
- `/goals /projects /routines` — narrow `max-w-3xl` (768px) **centered** → big side gutter → #2
- `/goals` title uses `truncate`; the guided step renders the same name wrapping → #4

## Approach

**Alignment: left-aligned with a fixed gutter** (decided with Scott). Content pins to one consistent left gutter on every page and never shifts when the right detail/AI pane opens — the pane's space is already reserved by `ShellLayout`'s `marginRight`, so a left-aligned column only reflows its right edge, no horizontal jump. A centered column would re-center (slide left + narrow) each time the pane toggles.

**Mechanism: a shared className constant, not a wrapping component.** The gutter inconsistency lives entirely in each page's *column* className. Wrapping the wildly varying page structures (modals/asides as siblings, multi-return branches, Today's separate header column) in a component would force risky restructuring. Instead, `pageLayout.ts` exports the one column class; each page swaps its bespoke column className for it. Zero structural change; one tuning point.

```ts
// src/components/layout/pageLayout.ts
const PAGE_GUTTER = 'px-6 md:px-10 lg:px-14 py-8'
export const PAGE_COLUMN      = `w-full max-w-[940px]  ${PAGE_GUTTER}`   // rhythm + library lists
export const PAGE_COLUMN_WIDE = `w-full max-w-[1152px] ${PAGE_GUTTER}`   // detail pages
```

Left-aligned (no `mx-auto`); the scroll container, decorative gradients, and modals each page already has stay untouched. Kiosk/full-bleed surfaces (e.g. `/wall`) don't use it.

### Pages converted

`GoalsList`, `GoalView`, `ProjectsListRedesign`, `ProjectViewRedesign` (`wide`), `RoutinesListRedesign`, `ListsList`, `ContactsList`, `MealPlanPage`, the shared `HorizonView` wrapper (year/week/month/season), and `InboxView`.

**Today (`HomeView`/`TodayView`) is intentionally NOT converted this pass.** Its layout is spread across a header column, a nudge, and the content column, each with its own vertical rhythm, and the content wrapper drives the mobile timeline (currently full-bleed `px-0`) — folding it into the shared gutter risks a mobile regression on the most-used page. Today keeps its centered hero treatment; converting it is a flagged follow-up pending Scott's call.

### #4 truncation

In `GoalsList`, the goal-title `<h3>` drops `truncate` so long titles wrap (matching `DomainsGoalsStep`). The wider 940px column reduces the need, but removing `truncate` is the actual fix.

## Testing / verification

- The changes are presentational className swaps + one export; a bare class constant has nothing meaningful to unit-test. The gate is `tsc` + the full existing suite staying green (they do: tsc clean, 3404 pass, eslint 0 errors) and **visual verification**.
- Visual, done in the dev browser: `/goals` and `/projects` render at an identical column left edge (256px, 940px wide, `lg:px-14` gutter); opening the AI rail leaves the column left edge unchanged at 256px — **no horizontal jump** (the core pane requirement). Empty states render without the load flash.
- Not reachable in that browser session: the horizon pages (a route-specific auth artifact on the seed account dropped `/year` to a login screen — unrelated to this CSS change, no console errors), and long-title wrap (`/goals` had no data). Both are covered by the identical shared-constant swap and left for Scott's preview pass.

## Out of scope

- Item-level empty-state flashes (`ListView`, `ProjectViewRedesign`) — separate punch-list item.
- Goal-quality coaching (#3) — separate track.
