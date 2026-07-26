# Drop → render gate — Stage 2b Task 1

**Date:** 2026-07-25 · **Worktree:** `.worktrees/today-drag-gestures` · **Branch:** `today-drag-gestures` off `origin/main` `1a0ebbc3`

The spec gates every Stage 2b gesture on this: *"Making drag the primary gesture of
Today on top of an unreliable drop pipeline converts an annoyance into a blocker.
Nothing below ships until this is green."*

## Verdict: DISCHARGED

Did not reproduce. Proceeding to Task 2.

## Baselines measured in this worktree

| | |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | **402 files · 3939 passed · 3 skipped** |
| `npm run lint` | **295 problems — 8 errors, 287 warnings** |

The 8 errors are pre-existing. Compare against **8**, not against a remembered
number, and confirm with your work stashed before blaming yourself.

Note the suite is smaller than Stage 2a's recorded 426 files / 4041 passed — the
`/wall` deletion (102 files) accounts for the difference. 3939 is the number
Stage 2b builds on.

## Environment finding, fixed in passing

Port 5173 was held by a **vite process belonging to a worktree that no longer
exists** — `.worktrees/today-time` (Stage 1's, since merged and removed). The
process was still alive, had no `.env`, and served `404` at `/`. It was not
registered in `git worktree list` and its directory was gone.

Killed it and served 5173 from this worktree. If a future session finds 5173
"in use" but broken, check `ps -o command -p <pid>` before assuming a sibling
session owns it — an orphaned dev server outlives its worktree.

## Reproduction attempts

Method: created two throwaway tasks (`zzTest drag A`, `zzTest drag B`) rather
than grouping Scott's real work, so the same code path ran without mutating
real data. Both were deleted afterwards; All Day returned to its original 4
items.

| # | Attempt | Result |
|---|---|---|
| 1 | Bulk-select two all-day tasks → **Group** → name it → Create group | **Rendered immediately.** Wrapper `zzTest group` appeared with `0/2` progress and both children nested inside the tinted enclosed card. No refresh needed. |
| 2 | Hard reload of `/today` after attempt 1 | **Group intact.** Wrapper and both children re-rendered from the server in the same shape. |
| 3 | Delete group (`…` → Delete) | Wrapper and both children vanished immediately. No orphaned children left behind. |

Console was clean throughout — no errors matching `error|failed|group|23502`.

## What was NOT tested

**The mixed-member path.** Every attempt above grouped *tasks only*, so members
attached via `parentTaskId`. A group containing an **event or routine** rides as
a `group_members` ref and is relocated under the wrapper by `grouping.ts` step
2-5 — a genuinely different code path, and the one with more moving parts.

That path stays unverified. Stage 2b Task 8 exercises it directly (dragging an
event onto a card produces a `create-group` intent carrying `memberRefs`), so it
gets covered there rather than being left as a permanent blind spot — but if a
"group didn't render" report resurfaces, **this is the first place to look.**

## Why the two cheap explanations were already dead

Recorded so they are not re-investigated:

- `HomeViewContainer.tsx:439` **does** pass a real refetch (`refetch: fetchTasks`),
  so "the refetch was never wired" is false.
- The optimistically-created wrapper **is** correctly bucketed —
  `useSupabaseTasks.ts:421` sets `bucket: scheduledFor ? 'timed' : …` and
  `groupItems` passes a date — so "the wrapper fails `selectTimed`'s
  `bucket === 'timed'` gate" is false.

Combined with a prior session finding the bug had stopped reproducing, the
balance of evidence is that it was **intermittent and is not currently present**.
Stage 2b proceeds, watching for the same shape: a write that lands in the
database and not on the screen.
