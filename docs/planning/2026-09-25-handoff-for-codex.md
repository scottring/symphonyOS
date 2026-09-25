# Handoff for Codex — transactional placement save (2026-09-25)

Scope approved by Scott: prepare the transactional fix and migration for
review; do not apply shared migrations; switch off by default; prove rollback,
retries, concurrency and ownership locally; deliver migration, code, evidence
and review together. No deployment.

**Branch** `claude/onboarding-program` (worktree `.worktrees/onboarding-program`),
local commits only. This work: `e08dc90a` (migration + PG proof + review),
`88b257d9` (client path behind the switch), and this note.

**Read first:** `docs/planning/2026-09-25-transactional-placement-review.md`
(design, evidence table, security review, rollout steps, what is pending).

**What to review**
- `supabase/migrations/2026-09-25_apply_task_placement.sql`: SECURITY INVOKER,
  FOR UPDATE lock first, placement-column allowlist, validated steps, SET
  built only from the columns sent, `search_path` pinned, EXECUTE for
  authenticated only.
- `src/lib/placement/placementSteps.ts` and `applyPlacementAtomically` in
  `src/hooks/useSupabaseTasks.ts`:
  - Drop, Keep and placement-only updateTask are switched.
  - Mixed saves and group moves stay on the ordinary requests.
  - With the switch unset, requests are byte-identical to before (hook test).

**Evidence (rerun from the worktree root)**
- `./scripts/test-apply-task-placement-locally.sh` — 76/76. The migration is
  loaded unchanged.
  - parity 9, rollback 10 (16 faults), retry 12, concurrency 4, security 38,
    pinning 3.
  - The proof found one parity gap (`UPDATE OF` triggers firing for columns
    not sent), which is fixed.
- `npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts src/lib/placement/placementSteps.test.ts` — 46/46.
- Full suite: 7209 pass. The only failure is the known connectors/whatsapp
  collection error.
- tsc clean, eslint 0 errors, build clean, :5199 rebuilt.
- Unchanged and still passing: 096 11/11, 097 12/12, 098 7/7, 099 23/23.

**Inferred, not observed:** that PostgREST rolls back the whole RPC when the
function raises. It was modelled with top-level BEGIN/COMMIT sessions.
Rollout step 4 observes it on the live function.

**Still pending (unchanged, not blocking this preparation)**
- Applying the migration, and any production change. Each rollout step needs
  Scott's approval.
- Live calendar edit/save, drag/resize and Delete.
- Two-account live verification.
- Codex's own docs were not edited.

## Round 2 — your two findings, addressed (2026-09-25)

1. **Stale concurrent plans.** The signature is now
   `apply_task_placement(uuid, jsonb, p_expected_open jsonb)`. The expected
   open-record set is **required** and checked under the FOR UPDATE lock; a
   mismatch gives 40001 and writes nothing. Your reproduction is in
   `supabase/tests/100_apply_task_placement.test.sql`, category "stale":
   - sequential, and truly concurrent in two sessions over 3 rounds;
   - B waits, then is refused, and two weeks are never open;
   - after a re-read, re-planning lands cleanly.

   The migration also drops any earlier `(uuid, jsonb)` overload.
2. **Lost response restoring stale UI.**
   - Every transactional failure except 40001 now re-reads the records and the
     row (`afterAtomicFailure`).
   - If the re-read fails, the snapshot stands in and the task is marked
     unreconciled: further placement saves are refused unsent until a read
     succeeds.
   - A task whose records were never read is re-read before planning
     (`placementBase`).

**Regression tests.** In `src/hooks/useSupabaseTasks.planWrites.test.ts`,
"stale plans and uncertain failures", 5 tests; 4 of them fail on the previous
hook.

**Numbers at this point**
- PG `./scripts/test-apply-task-placement-locally.sh`: **99/99**.
- Hook and helper tests: **108/108**
  (`npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts src/lib/placement`).
- Full suite 7214 (only the known connectors error); tsc clean; eslint 0
  errors; build clean.
- 096 11/11 · 097 12/12 · 098 7/7 · 099 23/23.

**Still not applied or deployed.** Live calendar and two-account checks are
pending. Mixed saves and group moves stay on the ordinary path.

## Round 3 — recovery restores every placement field (2026-09-25)

- `reconcileTaskPlacement` now reads the commitments, focus and row, and
  copies back **every** placement field: bucket, week/month/season, weekend,
  `scheduledFor`, `isAllDay`, `plannedOn`, `deferCount`, `deferredUntil` and
  `weekDeferredAt`.
- A failed read of any of the three, focus included, is an incomplete re-read
  (null): the snapshot stands and the task is marked unreconciled.
- Tests: "recovery restores every placement field", 4 tests.
  - dated rollback → no date;
  - dated lost response → the committed date;
  - deferral fields restored;
  - failed focus read → saves blocked, unsent, until a full read.
  - 3 of the 4 fail on the previous hook. The lost-response test passes on
    both, because the optimistic value equals the committed one.
- Numbers:
  - hook/helper tests **112/112**;
  - full suite 7218 (only the known connectors error);
  - PG 100 **99/99**; 096–099 unchanged and passing;
  - tsc clean, eslint 0 errors, build clean.
- Still not applied; the switch stays off.

## Applied — 2026-09-25 08:30 UTC (Scott approved)

The migration was applied unchanged; the switch is still off. Preflight: the
live triggers and helper function bodies match the fixture by hash.
Installed-function checks pass. A live rolled-back transaction checked six
cases: success; stale → 40001; a failing later step rolls back earlier steps;
outsider → 42501; partner ok; anon denied. Nothing remains. Details are in the
"Applied" section of `2026-09-25-transactional-placement-review.md`.

Next steps need approval:
- PostgREST rollback observation;
- two-account signed-in check;
- preview with the switch on.

## Live step 1 — rollback observed; 40001 retry storm found and fixed (prepared)

- **PostgREST rollback is now observed,** not inferred. A real
  `/rest/v1/rpc` call with a failing second step returned 400/22023 and left
  0 records and 0 events on the probe.
- **Retry storm.** A stale call refused with 40001 was retried by PostgREST
  about 100 times a second: 23,899 refusals from 08:32 to 08:37 UTC. It
  outlived the tab and stopped only when the state was made to match. No data
  was written.
- **Fix (not applied).** The follow-up migration
  `2026-09-25_apply_task_placement_conflict_code.sql` refuses with PT409
  (HTTP 409, not retried), and the client recognises PT409.
- **Evidence.** PG 100/100, loading both files, with a guard against 40001 and
  40P01. Hook/helper tests 113/113; full suite 7219.
- The switch stays off. Applying the follow-up needs Scott's approval.
