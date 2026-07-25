# Next steps — Today redesign, Stages 1 and 2a

**Written:** 2026-07-25 · **Nothing is merged.** `origin/main` = `1f3e23be`.

| Branch | Stage | Tip |
|---|---|---|
| `today-what-time` | 1 — five day divisions, seven collapsible sections | `50d3533f` |
| `today-drag` (stacked on Stage 1) | 2a — ordering data layer, no UI | `049630e6` |

Read first: `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md`
(the design and the three-stage split), and the **Outcome** section of
`docs/superpowers/plans/2026-07-25-today-drag-foundations.md` (the Critical that
Stage 2b must not repeat).

---

## Step 1 — Sign in. This unblocks everything else. (30 seconds)

A dev server is already running on **port 5173**, serving the **Stage 1**
worktree (`.worktrees/today-time`). A browser tab is open at
`http://localhost:5173/today` sitting at the sign-in wall.

Click **Sign In**. That is the whole step.

It must be port 5173 — the browser session is bound to that origin, and any
other port or a preview URL lands on the sign-in wall again.

If the server has since died:

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-time
rm -rf node_modules/.vite && npx vite --port 5173 --strictPort
```

---

## Step 2 — Verify Stage 1 by eye. Do item 1 before anything else.

Three defects in this work were invisible to `tsc` **and** to 4,000+ passing
tests. This step is not a formality; it is the only check that can catch what
remains.

**1. The kitchen wall — the one surface no test covers.**
Open `/wall` and `/wall-v2`, plus `/morning` and `/bedtime`.
- An item scheduled **6:30 AM** must appear (folded into the Morning band).
- An item scheduled **9:30 PM** must appear (folded into Evening).
- **Tap an early-morning item on the touchscreen** and confirm the detail sheet
  opens. `WallCalendar`'s `handleTapEvent` was one of thirteen broken sites — a
  dead tap target is the specific failure to look for.

**2. Today, at desktop and phone width.**
- Seven sections, in order: All day · Early morning · Morning · Afternoon ·
  Evening · Night · Unscheduled.
- **Unscheduled opens collapsed**, showing its count — the ~21-row routine slab
  should be one line.
- Header-to-first-row spacing looks right (a missing margin was fixed late).
- Morning and Afternoon icons are distinguishable.

**3. Collapse round-trip.** Fold two sections, reload the page, confirm they are
still folded. Then find a section where everything is done, click it **open**,
click it **closed**. That exact path was structurally impossible before a
late fix and no test caught it.

**4. Boundary spot-check.** Anything scheduled **5:00–5:59 PM** must appear under
**Evening**, not Afternoon. All three original bands displayed a time range their
own code did not implement; this is the fix.

**5. Empty-section "+" button.** Click "+" inside an empty **Night** section.
The prefilled time should be in that band, and the new item should stay there —
not jump to Morning.

---

## Step 3 — Reproduce the group-render bug (gates Stage 2b)

On Today, select two or more items and group them. **Does the group render
without a page refresh?**

If it does not, capture: what you selected (tasks only, or a mix with
events/routines?), which section they were in, and whether the wrapper appears
at all or only the children scatter.

**Already ruled out — do not re-investigate:**
- `refetch` **is** wired correctly (`HomeViewContainer.tsx:439`, a genuine full
  `fetchTasks`).
- `updateTask` applies an optimistic `setTasks` and calls `announceLocalWrite`.
- The wrapper is bucketed correctly — `useSupabaseTasks.ts:421` sets
  `bucket: scheduledFor ? 'timed' : …` and `groupItems` does pass a date, so it
  passes `selectTimed`'s gate.

Both cheap explanations are dead. This needs a live reproduction, then
`systematic-debugging`.

---

## Step 4 — Merge, once Step 2 passes

**Order matters** — Stage 2a is stacked on Stage 1, so Stage 1 goes first.
Every push to `main` auto-deploys to production.

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-time
git fetch origin && git rebase origin/main      # expect no conflicts
git push origin HEAD:main                        # Stage 1 → deploys

cd ../today-drag
git fetch origin && git rebase origin/main
git push origin HEAD:main                        # Stage 2a → deploys
```

The `pre-push` hook runs `tsc --noEmit` and the unit tests on any push to
`main`. Do not bypass it with `--no-verify`.

Stage 2a is safe to deploy on its own: it adds no UI and nothing calls
`updateTaskOrders`, `reorderTasksByDrag` or `addToGroup` yet.

**If Step 2 finds a problem on the wall, do not merge either branch** — Stage 2a
is stacked on Stage 1 and cannot ship without it.

After merging, clean up:
```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/today-time
git worktree remove .worktrees/today-drag
```

---

## Step 5 — Stage 2b, the actual drag gestures

Blocked on Step 3. Scope, from the spec:

- Drag to a time — the bands become drop targets; `PlanningSession`
  `placementGrain='time'` already exists and is currently unreachable
  (`onOpenPlanning` has zero consumers).
- Drag onto a card = create group · onto a group = add (`addToGroup` is built) ·
  out = remove.
- Drag to reorder — **reordering a timed item rewrites its time**, so the list
  stays chronological because the drag made it so.
- Read-only calendar events must **refuse** the drag visibly, not accept and
  spring back. Dragging a routine writes a **one-day override**, never a
  permanent rule change.
- Empty bands materialise as drop targets during a drag.
- Every gesture keeps a tap equivalent — Today is the mobile-primary surface.

**Four things Stage 2b must honour** (detail in the plan's Outcome section):
1. **Never partial-`upsert` a row in `tasks`** — always 23502. Per-row
   `.update().eq('id', …)`.
2. Pass the **full untimed set** to `reorderTasksByDrag`, not the filtered/
   rendered one, or a renormalise interleaves filtered and unfiltered items.
3. Read `existingMemberRefs` **fresh** at call time — `addToGroup` cannot defend
   itself against a stale array.
4. Decide deliberately whether to wrap `updateTaskOrders`'s `Promise.all` in a
   `catch`.

Then Stage 3: page cap, duplicate sweep, density pass, assistant-proposed
ordering.
