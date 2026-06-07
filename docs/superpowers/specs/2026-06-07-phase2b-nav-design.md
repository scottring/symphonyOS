# Phase 2b — Radical-Collapse Nav (Rhythm Spine) Design

> Brainstormed 2026-06-07 (visual companion). Builds directly on the shipped
> registry Shell (Phase 2a) + the scope axis (Phase 1). North-star: `~/.claude/plans/i-want-b-cozy-shannon.md`.

## Context — why

Symphony's planning-horizon system *existed* (the `week/month/quarter/someday`
buckets) but was **illegible** — it surfaced as scattered, disconnected doors
("this week" icon, "this month", "someday") you couldn't keep straight, which is
what made Scott feel lost ("how am I supposed to keep track… I'd throw it away").
Phase 2b makes the horizon rhythm the **legible backbone you navigate by**, while
honoring the **anti-overwhelm invariant**: each horizon shows only its own pool +
carry-over, never the firehose of all todos.

Two requirements everything below serves:
1. **Legible** — you always know which horizon you're in; moving between horizons is
   deliberate (a planning session), not an accidental wander.
2. **Scoped** — each horizon's view = that horizon's pool + carry-over only.

## 1. Nav shape — the rhythm spine

The left nav **is** the horizon ladder. The rhythm you plan by *is* the thing you
navigate by — one coherent time-axis replacing the old ~30 scattered doors.

```
▢ Inbox (n)                  ← capture catch-all, above the rhythm
── THE RHYTHM ──
  Today
  This Week
  This Month
  This Season
  This Year
  Someday                    ← no-horizon pool
──
▸ Library                    ← Projects · Goals · Routines · Meals · Contacts · Lists · House
⚙ Settings  ·  ◐ Assistant
```

- The current rung is **highlighted** (legibility). Selecting a rung shows that
  horizon's **scoped pool + carry-over** — nothing wider.
- Each rung exposes **"Plan the [horizon]"** which launches that horizon's planning
  session *from within the rung* — there is **no separate "Plan" door**; planning is
  contextual to where you are.
- The finer triage buckets (This Weekend, Next Weekend, Next Week, This Season) are
  **not** nav rungs — they are triage destinations that roll up into these rungs.

## 2. Filters — WHO × WHAT atop WHEN

Every horizon's pool is lensed by two orthogonal filters:
- **Scope lens (primary):** `Just me · Us · Everyone` — the main daily control
  ("whose items"). There is **one rhythm**; the couple ("us") planning view is the
  lens flipped to **Us** (both partners see the same Us-scoped pool; castable). The
  kitchen **wall remains its own dedicated "Everyone" device** — not a nav mode here.
- **Area (secondary):** `Work · Personal · Family · All` — tucked, reached when
  needed.

These compose: a horizon view = `WHEN (rung) × WHO (scope lens) × WHAT (area)`,
implemented via the unified `area × scope × assignee` filter from Foundation.

## 3. Today landing (the daily home)

Top to bottom:
1. **Rhythm nudge banner** — appears *only when a session is due* ("It's Sunday —
   plan the week →", or the morning "plan your day"). Otherwise absent.
2. **Carried over** — incomplete past-due items (calm framing, not red).
3. **Today** — today's committed/timed items (the set chosen in the daily session).
4. **Coming up (quiet peek)** — tomorrow's dated items · "N this week" · "N to sort
   (inbox)". The reassurance-so-nothing-slips from Scott's original "b" request.

## 4. Proactive model — rhythm nudges only

The app is proactive about **time/rhythm** only: "it's Sunday, plan the week", "3
things now", "the month turns Tuesday". **No per-task AI suggestion chips** (the
noise Scott deliberately stripped before). The Symphony-only assistant is available
**on demand** (a tap), never auto-popping on rows. (Vault/Open-Brain are out — #22.)

## 5. The daily planning session — "Plan today"

Daily is a first-class session (the bottom of the cascade Year→Season→Month→Week→
**Today**), opened by the morning rhythm nudge or the Today rung's "Plan today". Its
core job: **choose the day's working set by pulling from This Week's pool +
deciding carried-over.** ≈5-minute flow:
1. **Fixed anchors** shown for context (today's calendar events).
2. **Carried over** — for each: *do today* / *push to this week* / done.
3. **Pull from This Week's pool** — check the few to do today (added to Today). Only
   the week pool is shown here — never all todos (the invariant).
4. **Start** — optional time-block onto the day grid (reuse the existing
   `PlanningSession` drag grid), or just go.

**Pick-the-list is the core; time-blocking is optional** (most tasks are a list, not
a calendar entry). After the session, the Today rung shows exactly the committed set.

**The daily session is OPTIONAL by design.** Today is fully usable without it —
carried-over + today's items render whether or not you "plan." "Plan today" is an
*invitation* (the dismissible morning nudge + a button on the Today rung), never a
gate. The same holds for every session: tools you reach for, not walls.

## 5b. Cadence configuration & irregular periods

- **Horizon buckets are curated pools, not rigid date ranges.** "This Week" is
  whatever you triaged into the `week` bucket — not a strict Sun–Sat query. So an
  **irregular week absorbs naturally** (travel, a holiday stretch, a week planned
  late = just "what's in the pool"). There is no auto-rollover that fights you — the
  **weekly session *is* the rollover** (review what's left = carry-over, add new).
- **Sessions run on demand.** The rhythm nudge is a *default reminder*, not a lock —
  open "Plan the [horizon]" any day, and **dismiss/snooze** the nudge when a period
  is off-pattern.
- **Configurable anchors (Settings):** the **week-start day** (default Sunday, per
  the current Sunday-start convention) and the **nudge timing** per session (e.g.
  weekly Sun 7:15, monthly first Saturday, annual September — from the vault's
  planning-rhythm-requirements). These drive the date math (Today / overdue /
  coming-up) and *when* nudges fire; they do **not** constrain the pools.
- **Not building:** per-instance custom date ranges ("make this one week 10 days").
  Buckets-as-pools already handles irregularity; custom ranges = complexity (YAGNI).

## 6. Inbox → triage (the on-ramp)

Capture stays zero-friction (the `+`/Cmd-K FAB from anywhere → lands in Inbox, no
categorizing). Triage's one prominent decision is **WHEN** (the horizon):
- **Inline horizon chips** on each inbox row for one-tap routing: `Today · This week
  · This month · Someday`, with **"more ▾"** revealing the finer rungs (This weekend,
  Next weekend, Next week, This season). Area→scope is **auto-defaulted**; assignee
  (`👤`) and area (`🏷`) are optional quick-sets.
- **A focused "Process inbox" mode** — walks items one-at-a-time, full-focus, for
  daily/weekly clear-outs.

## 7. Library

A **collapsible section in the spine** (not daily clutter) holding the non-horizon
surfaces: Projects, Goals, Routines, Meals, Contacts, Lists, House. These are the
**existing Shell apps** (already registered `AppDef`s) — the Library just groups
their sidebar entries under one expandable header, reached during planning.

## 8. Mobile

The spine collapses to a **bottom bar**: a horizontal **horizon switcher**
(Today · Week · Month · …) + **Inbox** + **More** (Library) + the capture **FAB**.
Touch-friendly per the kiosk constraints (large targets; the wall is unaffected — it
runs its own chromeless app).

## Architecture (how it sits on what's shipped)

- The rhythm spine **replaces the current `Sidebar` groups** (TODAY/PLAN/HOME/MORE)
  in `ShellLayout`'s `Sidebar`. The Library = the existing registry apps grouped.
- Each rung is a **horizon-filtered view of the tasks data** — reuse
  `lib/today/` selectors + the bucket field (`inbox/week/month/quarter/timed` +
  the refined `someday`/`next-week`/weekend rungs from the Foundation bucket-enum
  work) and the unified `area × scope × assignee` filter.
- "Plan the [horizon]" reuses the already-wired daily `PlanningSession` (grid) and
  `WeeklyPlanningSession`; Monthly/Seasonal/Annual sessions are **Phase 3** (the
  spine launches them as stubs until then).
- Tap-to-detail uses the global `DetailPanel` + `TapContextPanel` (shipped 2a).

## Scope

**In Phase 2b:** the rhythm spine + rungs + horizon-scoped views; the scope-lens +
area filters; the Today landing (rhythm nudge + scoped pool + coming-up peek); the
proactive rhythm-nudge layer; the **daily "Plan today" session** (carried-over +
pull-from-week, optional time-block); the **Inbox/triage rework** (inline chips +
Process mode); the Library section; the mobile bottom bar. Also: the **temporal
bucket-enum refinement** it depends on (split `someday` from `quarter`, add
`next-week` + weekend rungs) if not already done in Foundation cleanup.

**Out (later):** Monthly/Seasonal/Annual session internals (**Phase 3**); the
Goal→Project→Task why-chain + the deeper "Us" surface (**Phase 4**); stripping
vault/Open-Brain (**#22**); migrating the wall's `context='family'` read to scope.

## Verification (how we'll know it works)

- `npm run build` + `npx vitest run` green.
- Day-in-the-life smoke (on a preview, both logins): land on Today → the right
  scoped pool shows; capture via FAB → lands in Inbox; one-tap triage routes into a
  horizon; "Plan today" pulls from the week pool into Today; switching rungs shows
  each horizon's scoped pool only; the scope lens (Just me/Us/Everyone) re-filters;
  rhythm nudge appears when a session is due; mobile bottom bar works.
- The anti-overwhelm invariant holds: no horizon view ever shows the full task list.
