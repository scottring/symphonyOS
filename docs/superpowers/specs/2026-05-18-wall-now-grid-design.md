# Wall Now Card — Day-Mode 2×2 Grid

**Date:** 2026-05-18
**Status:** Spec — pending review
**Branch:** TBD (suggest `feat/wall-now-grid`)
**Surface:** TV-mounted kitchen touchscreen — 8-foot viewing, tap input, glance-able
**Extends:** [`2026-05-17-wall-redesign-design.md`](2026-05-17-wall-redesign-design.md)

---

## Problem

The 2026-05-17 wall redesign commits the Now Card to "one focal thing at a time." That works during active rhythm modes (Morning routine, Dinner flow, Bedtime) where there genuinely *is* one dominant thing. It fails during the **Day** window (9:00–15:00), the longest single mode of the day.

At 1 PM on a quiet Monday there is often no imminent event, no active routine, no recipe. The current spec resolves to row 6 ("Mode default": top uncompleted task) or row 7 ("Empty fallback": a gentle message). Both make the largest surface in the kitchen go nearly blank for ~6 hours a day. The wall stops being worth glancing at exactly when people are walking past it most.

This is a layout problem specific to the **Day mode default**. Every other mode is unchanged.

---

## Decision

During Day mode, when no higher-priority Now Card item is active (priority rows 1–5 from the parent spec all inactive), the Now Card renders as a **2×2 grid of four always-on quadrants** instead of a single focal card. Each quadrant owns one job and never becomes "the wall" on its own — so the surface never reads as empty, and no quadrant has to carry the whole screen.

The grid renders whenever the **resolved mode is Day** — whether reached as the auto default, a rhythm-bar override, or a pin — so tapping/pinning "Day" summons it on demand, not only during the 9a–3p clock window. Higher-priority focus still wins: a tapped Coming-Up item (`override-item`), an imminent event, an active recipe/routine, or a pinned/overridden *non-Day* mode all take precedence and render as the parent spec defines. All other modes keep their single-hero Now Card.

---

## The Four Quadrants

Fixed 2×2 layout. Reading order: top-left → top-right → bottom-left → bottom-right.

| Position | Quadrant | Job | Source |
|---|---|---|---|
| Top-left | **Up Next** | The next timed thing, anywhere this week — never "nothing today" | `useWallData` events, first future timed item |
| Top-right | **Today** | A calm summary of what today still holds | today's remaining timed items (max 3) |
| Bottom-left | **Pending** | What's quietly waiting while there's time to act | overdue tasks + inbox + email count |
| Bottom-right | **Family Question** | The day's dinner-table conversation prompt | `familyDiscussionPrompts.ts` (parent spec) |

Each quadrant always has content because each falls back to a wider window:

- **Up Next** never empties — if nothing today, it shows the next event this week ("THU · Dentist 8a").
- **Today** shows "A quiet afternoon" as its headline when the list is short; the headline carries the quadrant even with zero list items.
- **Pending** shows "All caught up" calm state when there is nothing waiting (no amber, no list).
- **Family Question** is deterministic by `dayOfYear` — always present.

### Refinement 1 — Cross-room readability (ruthless content limits)

The wall is read from 8 feet. Four quadrants on a 1920×1080 panel means each is ~770px wide. Body text inside a quadrant is the readability risk, not the headline.

Per quadrant, hard limits:
- **Eyebrow label:** one line, uppercase, ~11px tracking-wide. (`UP NEXT · IN 4H`)
- **Headline:** Georgia serif, **40–48px**, max two lines, ellipsis after.
- **Body:** **at most 3 list items**, single line each, ellipsis after. Never 4, never 5.
- **Footer (optional):** one line, low-emphasis, only if it earns the space.

If a data source has more than 3 items, show the top 3 by the source's own sort. The **headline carries the overflow signal** (e.g. "6 things waiting" while 3 lines show) — there is no separate `+N more` line. The whole quadrant is the tap target (Refinement 5); the expand overlay shows the full list. The builder returns the full bounded list (≤8) so the expand has everything; the visual 3-line cap is applied by the quadrant shell. No quadrant scrolls.

### Refinement 2 — Family Question quadrant is the prompt, full stop

The brainstorm mockup mixed the conversation prompt with a Jax-walked timestamp and a photo count in the footer. Cut both. The quadrant is: eyebrow (`TONIGHT'S QUESTION`) + the prompt in italic Georgia. Nothing else. Jax care and photo counts are footer noise that dilute a quadrant whose entire value is one clean prompt. (Jax/photos still exist elsewhere in Symphony; they do not belong here.)

### Refinement 3 — Pending uses neutral weight, not alarm color

The mockup styled the whole Pending quadrant amber. Amber/red on a kitchen wall reads as "warning" and gets tuned out fast when it's the steady state. Default the Pending quadrant to the **same neutral grey** as the Today quadrant. Reserve color for the *item*, not the container:

- Truly overdue item → small red `OVERDUE` tag on that line only.
- Time-sensitive item → small amber tag on that line only.
- Everything else → neutral.

So a glance reads "there's a list here" calmly; color only fires when a specific line genuinely warrants it.

---

## Active Modes Are Unchanged

When any priority row 1–5 becomes active — or the clock enters Morning / After-school / Dinner / Bedtime / Wind-down — the 2×2 grid is replaced by the single-hero Now Card exactly as the parent spec defines. The grid is **only** the Day-mode default. Recipe mode, dinner flow, routine checklists: all identical to the parent spec. This spec adds a layout for one cell of the existing priority table; it does not touch the table's logic.

### Refinement 4 — Soft transition between grid and hero

On a desktop a layout swap is instant and fine. On a wall you walk past mid-transition, and an abrupt 2×2 → single-hero jump (or the reverse at 3 PM) is jarring at room scale. On focus/mode change the incoming Now Card content fades in over ~450ms (a CSS keyframe on the keyed content wrapper). There is no separate fade-out; replacement is immediate then fades in, which reads as a smooth dissolve at room scale without the abrupt jump. No layout shift in the surrounding chrome or right column. Respects `prefers-reduced-motion` (no animation).

---

## Refinement 5 — Quadrants are tappable

Glance-only is not enough; the wall should let someone act on what it surfaces. Each quadrant is a single tap target (entire quadrant, ≥48px in every dimension — trivially satisfied at ~770px wide):

| Quadrant tapped | Result |
|---|---|
| **Up Next** | Now Card overrides to that event's detail hero (5-min auto-return, per parent spec override behavior) |
| **Today** | Now Card overrides to a focused today-agenda hero |
| **Pending** | Opens the triage overlay (existing flow) scoped to the pending items |
| **Family Question** | Expands the prompt to a full-screen hero (long-press still dismisses for the day, per parent spec) |

Tapping a quadrant is a "user override" (priority row 2). It inherits the parent spec's 5-minute idle → auto-return behavior. No new override mechanic is introduced.

---

## Layout & Proportions

Fits inside the existing main-grid left column (65% width, ~880px tall) from the parent spec. The right column (Today + Coming Up / timed spine) and the rhythm bar are **unchanged**.

```
┌─────────────────────────────┬─────────────────────────────┐
│  UP NEXT · IN 4H 12M        │  TODAY                      │
│  Soccer practice            │  A quiet afternoon          │
│  5:30p · Mia                │   5:30p  soccer · Mia       │
│  🚗 Leave 5:10 · Riverside  │   6:45p  clean kitchen      │
├─────────────────────────────┼─────────────────────────────┤
│  WHILE IT'S QUIET           │  TONIGHT'S QUESTION         │
│  3 things waiting           │  "What's one good thing     │
│   • Reply to Caitlin        │   about today?"             │
│   • Pay water bill OVERDUE  │                             │
│   • 8 emails waiting        │                             │
└─────────────────────────────┴─────────────────────────────┘
```

- Grid: `1fr 1fr / 1fr 1fr`, 14px gap.
- Quadrant: 12px radius, 18–24px internal padding.
- Up Next: green gradient (matches parent spec's event accent). Today & Pending: neutral grey surface. Family Question: blue gradient.
- Headlines: Georgia serif 40–48px. Eyebrow: 11px, 0.2em tracking, uppercase.

---

## Data & Components

No new data hooks. Reuses parent-spec hooks: `useWallData` (Up Next, Today), `useActionableInstances` / `useOpenListCount` / `useEmailActionItems` (Pending), `familyDiscussionPrompts.ts` (Family Question).

New components (under the existing wall directory, alongside the redesign):
- `WallNowGrid` — the 2×2 container; renders only when Day mode + priority row 6.
- `WallNowQuadrant` — generic quadrant shell (eyebrow / headline / body / footer / tap handler), with the per-quadrant content limits enforced here so each consumer can't overflow.
- Four thin content adapters (Up Next, Today, Pending, Family Question) that map hook data into the quadrant shell, each applying its own 3-item cap and fallback headline.

`WallNowGrid` slots into the priority resolver from the parent spec at row 6 for Day mode only — a single conditional, not a rework of the resolver.

---

## Testing

- **Unit:** each content adapter — empty source → fallback headline (no blank quadrant); >3 items → full bounded list returned (≤8), headline reflects true count, quadrant shell renders only 3; Pending neutral by default, red tag only when an item is overdue.
- **Unit:** `WallNowGrid` renders only for Day mode + priority row 6; rows 1–5 and non-Day modes still render the single hero.
- **Component:** tapping each quadrant triggers the correct override (Up Next → event hero, Pending → triage overlay, etc.) and inherits 5-min auto-return.
- **Visual/manual:** 1920×1080 at 8 feet — every headline and body line legible; no quadrant scrolls or clips; cross-fade is smooth and shifts nothing in chrome/right column; `prefers-reduced-motion` → instant swap.

---

## Out of Scope

- Any change to Morning / After-school / Dinner / Bedtime / Wind-down modes.
- Any change to the right column, rhythm bar, family filter, or chrome.
- Configurable / user-rearrangeable quadrants — the four roles are fixed in V1 (YAGNI).
- New data sources — Pending and Today read from existing hooks only.
- Deleting parent-spec components — same boundary as the parent spec.
