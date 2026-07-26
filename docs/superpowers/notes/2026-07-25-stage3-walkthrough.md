# Stage 3 walkthrough — cap, sweep, density

**Date:** 2026-07-25 · **Branch:** `today-stage3` (stacked on `today-drag-gestures`).

## Gate

| | |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | **410 files · 4055 passed · 3 skipped** (Stage 2b left 4016 → +39) |
| `npm run build` | clean |
| `npm run lint` | **8 errors** — unchanged baseline |
| `TodayView.tsx` | **1013 lines** (spec ceiling 1185; started the whole redesign at 1185) |

## Verified by hand on :5173

| | Result |
|---|---|
| Morning (19 rows) renders capped | PASS — 8 rows + **"+11 more today"** |
| The section header still reports the FULL count | PASS — "· 19 · 3 done", not "· 8" |
| A group is never split by the cap | PASS — "Yard optimization" + its 3 children stayed whole |
| Duplicate trigger is absent when there are none | PASS — Scott's real day shows no trigger, which is the correct answer |
| Trigger appears with real duplicates | PASS — "1 possible duplicate" after seeding two identical throwaway rows |
| Sweep lists the title once, each copy by its context | PASS |
| "Keep the one with context" deletes exactly the other | PASS — All Day 6 → 5, "7 of 45" → "7 of 44" |
| Sweep empties and the trigger retires | PASS — "Nothing left to sweep." |
| Desktop row density | PASS — **54px → 50px** (padding 8px → 6px) |

All test rows were throwaway `zz*` tasks, deleted afterwards
(`title=like.zz*` → 0 remaining). **No real task was swept.**

## Measured, not eyeballed

- Desktop row height **before 54px, after 50px** at a 1720px viewport.
- The mobile floor holds **by construction**, not by measurement: every density
  change is `md:`-scoped and so cannot apply below 768px, and the mobile branch
  is a separate component (`ScheduleItemMobileCard`, `px-3 py-3`) that these
  edits never touch. **A real device was still never used** — see below.

## Deviations from the plan, stated plainly

- **`TodayView` is 1013, not the ≤996 my own plan demanded.** The sweep's
  component and its hook are both already extracted; the remaining 17 lines are
  the trigger, the mount, and two imports. Contorting further to hit a
  self-imposed number would have produced worse code. The spec's actual
  constraint — never longer than the 1185 it started at — holds comfortably.
- **`capUnits` was not in the plan.** The plan capped by row. Watching the real
  page showed the boundary landing at the end of a 4-row group *by luck*; one
  row earlier would have rendered a group card with no bottom edge, because
  Today derives those borders from adjacency. Capping by group is the fix.
- **`duplicates.ts` gained a parent/child guard that the plan missed.** Stage 2b
  names a group wrapper after the card it was built from, so a wrapper and its
  own child legitimately share a title — pairing them would have offered to
  delete half of a group the user had just made.

## NOT verified

- **Anything on a real touch device.** Today is the mobile-primary surface and
  the density pass is exactly the change most likely to be wrong on a phone. The
  44px floor is argued from the code, not measured on hardware.
- **The cap interacting with a drag.** A capped-away row cannot be a drop
  target, and gap indices are computed against the rendered list. Dropping into
  a capped section was not tried.
- **Sweeping a cross-type (task + routine) pair on the live page.** Unit-tested,
  including that it offers no delete, but never exercised against real data —
  deliberately, since the only way to produce one is to duplicate a real routine.

## Move #8 — the assistant's proposed order — BUILT

Initially deferred on the spec's own reasoning (*"an optimizer needs durations,
fixed anchors and some notion of energy or location to beat a guess"*), then
built because Stage 3's table lists it and completion was the instruction.

The deferral concern is answered by construction rather than ignored: the
proposer is **deterministic and proposes only where a real signal exists**, and
every suggestion carries the reason it was made.

- **Signals used:** a shared project (an explicit statement that things belong
  together) and a shared location (two errands at one place is one trip).
- **No signal → no proposal.** Verified live: Scott's real day produces *no*
  trigger at all, because no two All Day items share a project or a location.
  That silence is the feature, not a gap.
- **Only the untimed pile** is proposed over — a timed item's position already
  means something.
- **Never an auto-apply.** Preview with per-suggestion accept, "Take all of it",
  and Discard. Accepting reuses the very same writers the drag gestures use
  (`onGroupItems`, `onReorderTasks`), so an accepted suggestion is
  indistinguishable from having done it by hand.

Verified on :5173 by seeding two throwaway rows sharing a project: the trigger
read **"2 suggestions"**, the preview showed the group (with its reason and its
member titles) and the reorder, "Make this group" created it and it rendered
immediately **dated All day rather than stamped with the clock time**, and the
preview then correctly emptied. All seeded rows deleted afterwards; the day
returned to "7 of 55 done".

**Not verified:** an LLM-backed proposer. The spec suggested this could ride on
the `symphony-agent` edge function; this is a deterministic heuristic instead,
which is testable, free, and honest about its thin inputs. Swapping in an
agent-backed proposer behind the same `Proposal` type is a later choice.

**Incidents during this walkthrough, both repaired:** a stray click flipped the
domain switcher to `family` (restored to `universal`), and direct REST deletes
left the client cache briefly showing an empty day — a hard reload restored it,
and a DB check confirmed all 28 tasks were intact throughout.
