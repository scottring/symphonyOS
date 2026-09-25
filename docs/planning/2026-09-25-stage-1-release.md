# Stage 1 release: connected-planning program, save switch OFF

Prepared 2026-09-25. **Not pushed, merged or deployed.** Pushing to `main`
deploys production and needs Scott's approval. Stage 2 (turning the
transactional save on) is a separate approval, made after watching
production.

## What ships

Branch `claude/onboarding-program`: 108 commits on top of `origin/main`
`ca075d26`, which is current (0 behind). 218 files changed. About 15k lines
are app source; the rest is docs, tests, local database harnesses and
`outputs/` verification harnesses (not part of the build).

User-facing, by area (details: `2026-09-24-implementation-progress.md` §Y and
`onboarding-program-findings.md`):
- **Planning pages** (week/month/season/year): choose-when density tiles, the
  week menu, Shelves, planning sessions and the look-back (Keep, Done, Someday,
  Drop), long lists and narrow layouts, the goal/step hierarchy with month
  goals supporting season goals, and Daily vs Weekly wording.
- **Events:** the inline "when" edit, both weekend days, Delete from the event
  panel (writable calendars only), one ⋯ menu, calendar/prep linkage, and
  prep tasks created all-day.
- **Getting Started** and the printable planning guide; navigation that keeps
  its place; Quick Add closes on navigation.
- **Save ordering:** Drop and Keep write their records first and the row last,
  stopping at the first failure. The transactional save path ships **dormant**
  behind `VITE_PLACEMENT_RPC`.

## Database

**No database change is needed for Stage 1.** All three migrations on the
branch are already applied to production and verified on 2026-09-25:
`goal_supports_goal` (the column plus its guard trigger),
`apply_task_placement`, and `apply_task_placement_conflict_code` (PT409). The
code now on `main` ignores the new column and never calls the function, so
the database already serves both the old and the new client.

## The switch stays off

- `VITE_PLACEMENT_RPC` is not set in Vercel Production (checked with
  `vercel env ls production`) or in `.env` / `.env.production`.
- With the switch off, the build takes the ordinary save path. This was
  checked on :5199: a week change sent PATCH + PATCH + POST, with no RPC.
- **Risk kept deliberately:** until Stage 2, the ordinary path can still
  leave a partial save if a request fails mid-save. Drop and Keep are
  narrowed by the new ordering; updateTask is unchanged (the documented risk).

## Release checks (at `0384c0cc`)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (the pre-push gate) and `-p tsconfig.app.json` | pass |
| `npx vitest run` | 686/686 files; 7229 passed, 3 skipped |
| `npm run lint` (CI) | 0 errors (366 existing warnings). The one error, in a harness file, was fixed in `0d528771` |
| `npm run build`, switch unset | pass |
| Local PG harnesses | 096 11/11, 097 12/12, 098 7/7, 099 23/23, 100 100/100 (earlier today, no DB changes since) |

The local pre-push gate needs `connectors/node_modules`. It is now installed
in this worktree; otherwise the gate fails on the WhatsApp adapter test for
reasons unrelated to this branch.

## Verified vs not verified

Verified in the running app (the demo account, :5199) and by tests: the
journeys in §Y. The transactional save was verified with the switch on in
preview, including the same-household walkthrough (Codex,
`2026-09-25-codex-household-browser-acceptance.md`; fixtures confirmed gone in
the DB) and the cross-household probes.

**Not verified. These ship on the strength of tests and dry runs only:**
- **Real calendar writes:** inline event save, reschedule, drag/resize and
  Delete have never been run against a real calendar ("no real event writes").
  Everything up to the provider call is verified. This is the largest
  functional risk in Stage 1.
- A 200-task list in the running app (harness only).
- A real iPhone keyboard and safe areas; printing the guide on paper.

Open product items, not in this release: S2-22 (goal archive), S1-04/S1-05
(add routes, nav labels), S2-02 (needs a reproduction), and S3-07 (external
calendar creation).

## Release steps (after approval)

1. Push the branch and open a PR to `main`. Note that pushing the branch
   creates a Vercel preview deployment.
2. Wait for CI checks to show COMPLETED + SUCCESS.
3. Merge to `main`; the pre-push gate runs tsc and tests. Vercel deploys
   production.
4. Smoke-test production on the demo account: Today, /week, a planning
   session, a week choice (it should send PATCH/POST with no RPC), and the
   event panel (open it, but do not edit a real event unless approved).

## Rollback

- **Fastest:** in Vercel, roll production back to the current deployment
  (built from `ca075d26`). This takes effect in seconds and needs no rebuild.
- **Then the code:** revert the merge on `main` (`git revert -m 1 <merge>`, or
  revert the squash commit) and push through the normal gate.
- **Database:** nothing to undo. The applied column, trigger and function are
  compatible with the old client. Data written by the new UI (goal-support
  links, period records) stays valid and is ignored by the old code.

## Stage 2 (separate approval, after watching production)

Set `VITE_PLACEMENT_RPC=true` in Vercel Production and redeploy. Watch the
Postgres logs for refusal counts (expect rare PT409s and no repeats), RPC
error rates, and "only partly saved" / stale toasts. To roll back, remove the
setting and redeploy.
