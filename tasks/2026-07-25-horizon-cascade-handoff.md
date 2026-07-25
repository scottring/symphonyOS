# Handoff — the horizon cascade pass, and what's still open

**Written:** 2026-07-25 · **Branch:** `horizon-design` (worktree `.worktrees/horizon-design`)
**All work is on `origin/main` and deployed to production.** Nothing is stranded.

Read first: `tasks/2026-07-25-horizon-cascade-redesign.md` (the spec — the rule,
the verified data, and what was deliberately excluded).

---

## The rule this pass runs on

> **A rung draws the unit it places into. Never finer.**

| Rung | Draws | Places into |
|---|---|---|
| Year | one axis: 4 season segments, claims, elapsed shading, 52-week density | nothing — look only |
| Season | 3 month strips | a month |
| Month | **5 week columns** | a week |
| Week | 7 day columns | a day |
| Today | the hour grid | a time |

Three rungs were violating it. Phases 3–4 (before this pass) had fixed the
**writes**; nobody had redrawn the **pictures**, so month built 42 day cells and
refused all of them, and week drew a 6 AM–10 PM grid then discarded the hour.
Every `deliberately discarded` comment on the old branch was an apology for a
drawing that lied. They're gone.

## Shipped (on `origin/main`, prod-verified)

| Commit | What |
|---|---|
| `ac2b0ba8` | season: three month strips, shared by page + session |
| `168aae32` | month: draws weeks |
| `678cf075` | week: draws days, stops discarding the hour |
| `c600f4a1` | migrate-or-release + write-month steps |
| `b10793e9` | move-by-pick: two columns |
| `5a62d657` | month: five week COLUMNS; week fits seven days |
| `fe8aef52` | week: the whole day column accepts a drop again |
| `e3d2a509` | place-the-big-rocks: full width + whole week |

Plus, earlier on main: the spec, the implementation plan
(`docs/superpowers/plans/2026-07-25-horizon-cascade-redesign.md`), and the
`cascade-unification` work this branched from.

**Page↔wizard parity is structural.** `mountain-ranges` mounts the same
`YearRibbon` as `/year`; `season-ahead` the same `SeasonMonthStrips` (this pass
closed that gap via a `strips` step prop); `place-on-weeks` and `place-rocks`
the same components as `/month` and `/week`. They cannot drift.

## Bugs found by opening the page — none failed a type-check

This is the headline lesson. Six defects, all green under `tsc`:

1. Horizon pages drew their whole span from the shell's **7-day** event window.
2. First fix was wrong: `fetchEvents` **replaces** the shared provider cache, so
   the shell's week clobbered the year's 291 events *and* left Today holding a
   year. Fix: keep a per-rung copy (what `CalendarStep` already does).
3. That fix then fired **before the calendar connection resolved** and stranded
   on an empty snapshot — past weeks read "nothing claimed yet". Fix: key the
   effect on `calendarConnected`.
4. Dropping the hour grid would have made already-timed tasks **vanish** from
   `/week`. They now render as chips in time order.
5. Removing the hour slots removed the only `slot-*` drop target; the `allday-`
   lane (which *does* have a handler) was a **28px strip on a 220px column** —
   droppable in theory, unhittable in practice. Fix: the lane fills the column.
6. `StepSchedule` never passed `initialDays`, so `PlanningSession` defaulted to
   **one** day while `/week` passed 7 — same component, different day count.

---

## OPEN — start here

### 1. Dropped card doesn't render until refresh (NOT reproduced)

Scott: *"when dragging to column, the card drops but doesn't show unless screen
is refreshed."* Seen in the weekly session's place-the-big-rocks.

**Ruled out by reading — don't re-check these:**
- `updateTask` applies an **optimistic** `setTasks` before the DB call
  (`useSupabaseTasks.ts` ~line 880).
- It calls `announceLocalWrite({kind:'update'})` (~line 985).
- `allDayTasksByDate` recomputes on `[tasks, dateRange]`
  (`PlanningSession.tsx` ~line 324).

**Remaining suspects:** the dropped task momentarily failing
`ScheduleGridStep`'s `priorities` filter, or the guided host handing down a
stale `tasks` reference. **Reproduce before touching anything** — a
`left_click_drag` closed the session rather than dropping, so drive it manually.

### 2. Today is overloaded (design pass, roughly this pass's size)

Verified for Sat 2026-07-25:

| | |
|---|---|
| Open tasks dated today | **28** — **27 of them all-day** |
| Still-open items from earlier in July | **17** |
| Active routines firing on a Saturday | **44** (32 daily) |
| Untimed routines → Unscheduled | **21** |

"Show daily" is currently **off**, hiding 32 — and it's still ~57 rows.

**Diagnosis:** 27 of 28 tasks have no time, so the day has no shape and the
Morning/Afternoon/Evening bands are empty theatre. This is partly *caused* by
this pass: the week rung now correctly writes every placement all-day, because
its decision is "which day". **Today's decision is "what time", and nothing
asks it.** The cascade descends four rungs and stops one short.

**Proposed, not agreed:** (a) Today asks "what time" for the day's few real
rocks, everything else an explicit untimed list; (b) the 17 carried items get
the same Keep · Done · Someday · Let go fates as month review; (c) 21 untimed
routines are a routines-design problem that will flood Unscheduled daily until
they get times or stop claiming a slot.

### 3. Four routines skipped in 29 seconds (cause unknown)

On 2026-07-25 at 12:01:05–12:01:34Z, `Iris weekend workout`, `Kids shower
routine`, `Iris long run`, `Do Kids laundry` were all skipped. Scott didn't
recognise doing it. **The skips were cleared** (set `status='pending'`,
`skipped_at=null` — the app's own undo semantics, not a row delete). The
*cause* is still live: suspect a Tend proposal applied in bulk, or stray taps
on the wall.

### 4. `assigned_to` vs `assigned_to_all`

`Do Kids laundry` has `assigned_to = Iris` but `assigned_to_all = [Iris,
Scott]`. Any filter reading the legacy single field treats it as not-Scott's
despite him being an assignee. Live trap, independent of the above.

### 5. Deliberately not done

- **Duplicate goals and areas** — `get healthy`/`get healthier`, `make lots of
  money`/`money tons of money`, `Home` ×2, `Money & Estate` ×2, `health`/`Health`.
  The ledger shows them honestly; no auto-merge. Own pass.
- **Per-goal timeline lanes on `/year`** (the original design brief's headline).
  **Not buildable yet:** `picked_at` only started being written 2026-07-15, so
  every mark bunches under today. The ledger's columns are lane-shaped so lanes
  slot in later without a rewrite. Revisit after ~2 seasons of history.
- **Calendar gaps on `/year`** (Catskills, Iris on-call weeks absent from the
  live feed while present in `calendar_events`). Scott: *"that's because we're
  in a branch."* Not chased.

---

## Verification recipe — the part that actually matters

`npx tsc -b` · `npx vitest run` (**never `npm test`** — watch mode) ·
`npm run build` · `npm run lint`.

Current baseline: **3,966 tests passing**, build clean, **8 lint errors that are
all pre-existing** (identical count with this branch's changes stashed — verify
that way before blaming yourself).

**Then open the pages.** Traps that cost real time today:

- **Dev server must be port 5173** — Scott's browser holds a session for that
  origin only. Other ports and preview URLs hit the sign-in wall, and you must
  not sign in as him.
- **Vite serves stale modules in this worktree.** Edits appeared not to apply
  three separate times. Cure: `pkill -f vite; rm -rf node_modules/.vite;
  npm run dev`. Verify with
  `curl -s localhost:5173/src/<path> | grep <new-string>` before believing a
  screenshot.
- **Wait for the guided session to finish loading.** It shows *"Gathering your
  session…"*; clicking Next during that does nothing and you'll screenshot the
  wrong step.
- **Scott may be looking at a deployed preview URL**, which lags main by a full
  deploy. Check the URL in his screenshots before diagnosing.
- **The shell's cwd can reset to the main worktree**, which is many commits
  behind. `pwd` before reading or editing — a diagnosis was made from stale code
  today.
