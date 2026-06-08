# Phase 4 — Why-Chain + "Us" Surface (Design Spec)

> Built overnight 2026-06-08. The why-chain is concrete + low-risk and gets built.
> The "Us" surface is opinionated UI that warrants Scott's eyes first — it's
> **specced here, not built**, with the safe groundwork noted. All on `overnight`.

## A. Why-chain — "you can always see why"

**Goal:** from any task you can see the intention it serves — its project and the
goal that project advances — without leaving the task. Optional, never required;
absent gracefully when a task has no project/goal.

**Data (all native Symphony objects, already in the DB):**
`Task.projectId → Project`; `Goal.actions[].projectId === project.id → Goal`.
No vault, no prose — purely the structural ancestry. (The plan's "links to vault,
not native prose" caveat is about goal *content*, not this structural link.)

**Component:** `src/components/why/WhyChain.tsx` — pure, props
`{ task, projects, goals, onOpenProject?, onOpenGoal? }`. Resolves the chain and
renders a calm one-line ancestry: `▸ <Project>  ·  ◎ <Goal>`. Renders nothing
when there's no project. Built + unit-tested this phase.

**Wiring (the one step deferred to morning review):** drop `<WhyChain>` into the
live task detail panel (`TapContextPanel`, surface/) below the title. Deferred
because the panel is the most-used surface and the placement wants a visual check
— the component is ready; wiring is a ~3-line addition once approved.

## B. "Us" surface — the couple view  **[SPEC ONLY — not built overnight]**

**Goal:** a shared surface for the two of you — division of labor, shared
calendar, what needs joint attention — distinct from the compound (whole-
household) wall.

**Reuse the existing coordination kernel:** `needs_discussion` already flags an
item for joint attention (and the Today view already has a discussion badge). The
Us surface is a filtered view of **couple/compound-scoped** items, foregrounding
those with `needs_discussion`, plus the shared calendar. No new mechanic.

**Why not built tonight:** scope=couple vs compound currently resolve to the same
"household members" set (the plan's open decision — `scope_groups` deferred), so a
*distinct* couple surface needs either `scope_groups` pulled forward or an
accepted UI-only distinction. That's a product call for Scott. Building it blind
risks the wrong cut. Groundwork that IS safe and already exists: scope axis
(Phase 1), `needs_discussion`, the discussion badge.

**Proposed (for review):** a `/us` route in the Library showing (1) shared
calendar week, (2) "Needs us" — couple/compound items flagged needs_discussion,
(3) delegation at-a-glance (who owns what). Build after Scott confirms the
couple-vs-compound distinction.

## Out of scope
- Goal/hopes-fears as vault-linked notes (the reflective-prose half) — stays in
  Phase 3's shared `planning_sessions` text for now; vault linking is a later call.
- `scope_groups` (couple ≠ compound data distinction) — pull forward only if the
  Us surface needs it.

## Testing
- `WhyChain`: unit tests — resolves project-only, project+goal, and no-project
  (renders null); click handlers fire.
- Full build + vitest green before push. Preview only; no `main`.
