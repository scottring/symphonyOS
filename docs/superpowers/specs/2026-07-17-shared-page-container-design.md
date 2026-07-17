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

A single `<PageContainer>` component that owns the gutter, max-width, and vertical rhythm. Every rhythm/library page renders its content inside it instead of a bespoke wrapper. Kiosk/full-bleed surfaces (e.g. `/wall`, which is `chromeless`) simply don't use it.

**Alignment: left-aligned with a fixed gutter** (decided with Scott). Content pins to one consistent left gutter on every page and never shifts when the right detail/AI pane opens — the pane's space is already reserved by `ShellLayout`'s `marginRight`, so a left-aligned column only reflows its right edge, no horizontal jump. A centered column would re-center (slide left + narrow) each time the pane toggles.

### Component

```tsx
// src/components/layout/PageContainer.tsx
interface PageContainerProps {
  children: ReactNode
  /** 'default' = 940px (rhythm + library lists); 'wide' = 1152px (detail pages). */
  width?: 'default' | 'wide'
  /** Extra classes on the inner column. */
  className?: string
}
```

- Outer: `h-full overflow-auto bg-[var(--color-bg-base)]` (the scroll container each page has today).
- Inner column: left-aligned (no `mx-auto`), responsive horizontal padding, `py-8`, `w-full` with `max-w-[940px]` (or `max-w-[1152px]` for `wide`).
- The exact gutter value is tuned **visually in the browser** against `/today` (pane open + closed) rather than guessed. Starting point ≈ `px-6 md:px-10`.

### Pages converted

`GoalsList`, `GoalView`, `ProjectsListRedesign`, `ProjectViewRedesign` (`wide`), `RoutinesListRedesign`, `ListsList`, `ContactsList`, `MealPlanPage`, the shared `HorizonView` wrapper (covers year/week/month/season), and `HomeView` (Today). Decorative absolute layers (e.g. GoalsList's gradient) stay; only the column wrapper is swapped.

### #4 truncation

In `GoalsList`, the goal-title `<h3>` drops `truncate` so long titles wrap (matching `DomainsGoalsStep`). The wider 940px column reduces the need, but removing `truncate` is the actual fix.

## Testing

- Unit: a `PageContainer` render test (renders children; applies `wide` max-width when asked; left-aligned = no `mx-auto`).
- Existing page/list tests must stay green (wrapper swap is presentational).
- **Visual verification** in the browser is the real gate here: confirm every converted page shares the same left gutter, that it's stable across the pane opening, and that `/goals` long titles wrap. Tune the gutter to match Today.

## Out of scope

- Item-level empty-state flashes (`ListView`, `ProjectViewRedesign`) — separate punch-list item.
- Goal-quality coaching (#3) — separate track.
