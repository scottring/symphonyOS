# Handoff — the Today redesign, and what's still open

**Written:** 2026-07-25 (evening) · **`main` = `dee5fb5a`, all of it deployed to production.**
Nothing is stranded on a branch.

Read first: `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md` — the
design and its three-stage split. Then the **Outcome** section of
`docs/superpowers/plans/2026-07-25-today-drag-foundations.md`, which records a
production-breaking trap the next stage must not repeat.

---

## What shipped today

Three merges to `main`, each auto-deployed and verified in the live bundle.

| Commit range | What |
|---|---|
| `1f3e23be..50d3533f` | **Stage 1** — five day divisions, seven collapsible sections |
| `50d3533f..203a0fa1` | **Stage 2a** — the drag data layer. No UI. |
| `203a0fa1..dee5fb5a` | **Legacy `/wall` deleted** — 102 files |

### Stage 1 — Today's day divisions

The page had three time bands, and **every one displayed a range its own code did
not implement**: Morning's header said 6 AM while the code took everything under
hour 12; Afternoon claimed to end at 5 but ran to 17:59; Evening was wrong at both
ends. There are now five bands, and labels *and* bucketing both derive from one
table (`DAY_SECTION_BOUNDS` in `src/lib/timeUtils.ts`) so they cannot drift again.

| Section | Hours | Label |
|---|---|---|
| `earlyMorning` | 0–7 | Before 8:00 AM |
| `morning` | 8–11 | 8:00 AM – 12:00 PM |
| `afternoon` | 12–16 | 12:00 PM – 5:00 PM |
| `evening` | 17–20 | 5:00 PM – 9:00 PM |
| `night` | 21–23 | After 9:00 PM |

All seven sections (those five plus All day and Unscheduled) collapse, with state
persisted in localStorage (`src/lib/today/sectionCollapse.ts`, modelled on
`hideRoutinesSignal.ts`). Unscheduled opens collapsed by default because it holds
the untimed-routine slab. Collapsed headers always keep their count and progress.

### Stage 2a — the drag data layer (no UI)

- `tasks.sort_order` — integer, nullable, **live in production, unbackfilled, and
  read by nothing yet.**
- `src/lib/today/taskOrdering.ts` — gap-based ordering, spacing 1000, so a typical
  drag rewrites **one** row. Exports `reorderTasksByDrag`, `nextTaskSortOrder`,
  `sortByManualOrder`, `SORT_ORDER_GAP`, `OrderWrite`.
- `updateTaskOrders` in `useSupabaseTasks.ts` — writes a different `sort_order` per
  row, optimistic with rollback, returns `Promise<boolean>`.
- `addToGroup` in `src/lib/today/groupTasks.ts` — groups were create-once before.

---

## THE NEXT THING: Stage 2b — the drag gestures

**Nothing on Today is draggable.** Stage 2a is only plumbing. This is the piece
that makes the feature real, and it is unblocked.

Scope, from the spec:

- **Drag to a time.** The bands become drop targets.
  `PlanningSession` with `placementGrain='time'` — a full dnd-kit hour grid — is
  **already built and currently unreachable**: it is mounted at
  `HomeViewContainer.tsx` behind `planningOpen`, whose only setter
  `onOpenPlanning` has **zero consumers** outside a test. Wire it up rather than
  rebuilding it.
- **Drag onto a card** = create group · **onto a group** = add (`addToGroup` is
  built) · **out of a group** = remove (`removeFromGroup` exists).
- **Drag to reorder — and reordering a TIMED item rewrites its time.** One gesture
  for timed and untimed alike; the list stays chronological because the drag made
  it so. (An earlier draft forbade reordering timed items; Scott rejected that, and
  he was right.)
- **Read-only calendar events must refuse the drag visibly** — the work calendar is
  a read-only share, so a write fails at Google and the event springs back.
- **Dragging a routine writes a one-day override**, never a permanent rule change.
  The per-date deferral mechanism in `useScheduleFiltering.ts` is the precedent.
- **Empty bands materialise as drop targets during a drag** (they render `null`
  otherwise, which is right for reading and wrong for dropping).
- **Every gesture keeps a tap equivalent** — Today is the mobile-primary surface.

**Stack: dnd-kit.** Two DnD stacks already exist here (dnd-kit and native HTML5,
both inside `PlanningSession`). Do not add a third.

### Four constraints Stage 2b must honour

1. **NEVER partial-`upsert` a row in `tasks`** — it fails 23502 every time. See
   below; this is the big one.
2. **Pass the FULL untimed set to `reorderTasksByDrag`**, not the filtered/rendered
   one. A renormalise on a filtered subset resets it to `0…n×1000` while unfiltered
   siblings keep old values and interleave.
3. **Read `existingMemberRefs` fresh at call time** — `addToGroup` appends to what
   you hand it and cannot defend against a stale array.
4. **Decide deliberately whether to wrap `updateTaskOrders`'s `Promise.all` in a
   `catch`** — a rejecting builder currently escapes with no rollback and no toast.

---

## Traps this session paid for

### Never partial-`upsert` a row in `tasks`

The plan specified `updateTaskOrders` as
`.upsert([{ id, sort_order }], { onConflict: 'id' })`. **PostgreSQL evaluates NOT
NULL constraints and the RLS INSERT `WITH CHECK` against the proposed tuple BEFORE
probing for the conflict** — the row already existing does not save you. `tasks`
has two NOT NULL columns with no default (`title`, `user_id`) which supabase-js
sends as explicit NULLs. Verified against production with a temp table:

```
ERROR: 23502: null value in column "title" … Failing row contains (1, null, 5).
```

Every drag-to-reorder would have failed, 100% of the time. Use per-row
`.update({ … }).eq('id', …)`.

**The deeper lesson: the mock was the thing that could not fail.** The `upsert` test
double accepted any payload, so two green tests passed against something Postgres
rejects outright. Checking that assertions can fail is not enough — check that the
*fixture* can.

### A type widening can be a re-partition

Adding `earlyMorning`/`night` did not merely add sections — it **moved boundaries**:
`00:00–07:59` left morning, `17:00` left afternoon, `21:00+` left evening. So every
consumer looping `['morning','afternoon','evening','allday']` went from covering the
whole day to covering `08:00–20:59`. **Thirteen** hardcoded section lists had to be
fixed, most on the kitchen wall, and `tsc` could see none of them — they were plain
arrays, one behind an `as DaySection[]` cast.

Now guarded by derived `TIMED_SECTIONS` / `emptySections()` plus
`src/lib/today/sectionCoverage.test.ts` — **read that file's header, it is narrow
and says so honestly.**

### Second-order orphans are invisible to `tsc`

Deleting `/wall` orphaned `src/apps/home/kiosk/` — the deleted `WallRoomsView.tsx`
had been its only importer. The build stayed green with four dead files, because a
file that merely stops being imported still compiles. **After a large deletion,
re-trace the files whose imports you removed, not just the directory you targeted.**

### Type-checks are not inspection

Three genuine defects this session were invisible to `tsc` **and** to a 4,000-test
suite: a collapse toggle that could never reopen a section, thirteen silent
drop-sites, and the upsert. All were found by review or by opening the page.

---

## Open, in priority order

1. **Stage 2b — the drag gestures.** Above. This is the actual feature.
2. **Group render bug — intermittent, NOT fixed.** Creating a group on Today
   sometimes doesn't render until refresh. It stopped reproducing with nothing
   shipped that touches that path, which points at **a trailing realtime write
   racing the refetch**. Already ruled out — do not re-investigate: `refetch` IS
   wired (`HomeViewContainer.tsx`), `updateTask` is optimistic and announces, and
   the wrapper is bucketed correctly (`useSupabaseTasks.ts` sets `bucket` from
   `scheduledFor`).
3. **Untimed routines pollute every wall context band.** "After school → Eat
   breakfast" is nonsense but pre-existing: untimed items have no time to exclude
   them by, so they land everywhere. Same disease as Today's 57 rows, one surface
   over.
4. **Never verified by hand:** tapping an early-morning item on the physical
   touchscreen, and the auto-collapse-then-reopen path (no all-complete section
   existed in that day's data).
5. **Stage 3** — page cap, duplicate sweep, density pass (tighter rows; floor is
   ~44px touch targets on mobile), and an assistant that *proposes* an order and
   grouping (needs Stage 2b's times to have any signal, and must propose, never
   auto-apply).

---

## Environment notes that cost real time

- **`node` defaults to v26.5.0 and this repo has a Node-26 test trap.** Prefix every
  command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Never `npm test`** — vitest watch mode, hangs forever. Always `npx vitest run`.
- **Lint baseline is 8 pre-existing errors.** Confirm unchanged before blaming yourself.
- **Fresh worktrees need `npm install` AND a copied `.env`** (missing `.env` = blank screen).
- **The dev server must be on port 5173** — the browser session is bound to that
  origin; any other port lands on the sign-in wall. Check nothing else holds it
  first, and note which worktree it is serving.
- **Migrations are out of sync.** Apply DDL via the Supabase Management API, token
  from the macOS keychain (the on-disk token is stale).
- **The kitchen kiosk runs `/wall-v2`**, hardcoded in `~/kiosk.sh` on the Pi
  (`ssh pi@symphony-wall.local`). Screenshot it with `grim`. **Restarting Chromium
  there drops the session and strands the wall on a sign-in screen** — someone then
  has to physically tap it.
