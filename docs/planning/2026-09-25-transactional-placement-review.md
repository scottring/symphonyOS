# Transactional placement save — migration, code, evidence, and rollout review

**Status (2026-09-25):** prepared for review. **The migration is NOT applied**
to the shared project, and the app does not call it: the client path is behind
`VITE_PLACEMENT_RPC`, **off by default** (unset in `.env` and `.env.production`).
No deployment, no production change. Live calendar checks and two-account
verification remain pending and are listed below.

## What problem it closes

A placement save means Drop, Keep, choosing a week or day, a push, or letting
go to Someday. Each one is several writes: the task row's cached
bucket/stamps, its period records (`task_commitments`) and the day's focus
(`task_focus`). Sent as separate requests, a failure part-way leaves the row
and records disagreeing, and other devices see a split until a retry.
Reordering reduced this for Drop and Keep but cannot remove it, and cannot
serialise two writers. See `2026-09-25-drop-partial-failure-investigation.md`,
`2026-09-25-keep-update-order-investigation.md` and §Y of
`2026-09-24-implementation-progress.md` (the updateTask risk table).

## What is delivered

| Piece | Where |
|---|---|
| Migration: `public.apply_task_placement(p_task_id uuid, p_steps jsonb, p_expected_open jsonb)` | `supabase/migrations/2026-09-25_apply_task_placement.sql` |
| Client switch + plan→steps | `src/lib/placement/placementSteps.ts` |
| Switched paths in Drop, Keep, updateTask | `src/hooks/useSupabaseTasks.ts` (`applyPlacementAtomically`) |
| Hook tests, switch on/off | `src/hooks/useSupabaseTasks.planWrites.test.ts` — "transactional placement" |
| Unit tests (switch, allowlist ↔ migration drift) | `src/lib/placement/placementSteps.test.ts` |
| PG proof, the migration file loaded unchanged | `supabase/tests/100_apply_task_placement.test.sql`, `scripts/test-apply-task-placement-locally.sh` |
| Switch documentation | `.env.example` |

### Design

The client sends the exact writes it would otherwise send one request at a
time, **in its own order**. Drop and Keep send the row last; updateTask sends
it first and re-asserts it after a let-go. The function runs those steps in
one transaction. So a **successful save ends in the same state as today,
trigger for trigger** (PG parity, 9/9), and only failure behaviour changes: it
is rolled back instead of split.

The steps are `row` (placement columns only), `ensure`, `remove`, `carry`,
`focus_set` and `focus_clear`.

**Which saves use it when the switch is on:**
- Drop and Keep, always.
- updateTask, only when a save writes placement columns only and has records
  to write.

**Stale plans are refused (Codex review, round 2).** The client sends the
open period records it planned from (`p_expected_open`). Under the row lock,
the function compares them with the database and refuses with **40001** when
they differ, writing nothing. The lock alone only serialises writes: Codex
showed two clients that both planned from "week of Sep 20" and chose different
weeks left Sep 27 AND Oct 4 open. After a 40001 the client re-reads and says
"This changed somewhere else — it has been refreshed. Try again." The person's
next save is planned from the truth, so the rule is last-writer-wins and never
leaves a split. A task whose records were never read is re-read before
planning.

**Uncertain failures re-read, never restore (Codex review, round 2).** Only a
returned 40001 is known to have written nothing. Any other failure, including
a response lost after the commit, re-reads the records and the row. If that
read fails too, the snapshot stands in and the task is marked unreconciled, so
the next placement save is refused unsent until a read succeeds. This is the
same rule Drop and Keep already follow.

**Recovery restores every placement field (Codex review, round 3).** The
re-read (`reconcileTaskPlacement`) now reads the records, the focus and the
row. It copies back every placement column: bucket and stamps, weekend,
date/time, all-day, planned-on, and the deferral fields. Before this, a dated
move that rolled back kept its rejected date on screen. All three reads must
succeed. A failed focus read counts as an incomplete re-read: the snapshot
stands in and the task stays blocked until a full read.

**Which stay on the ordinary requests even with the switch on, by design:**
- A save that also changes a title, domain, notes or similar. The function
  writes placement only.
- A group move, because its children follow in a separate write.

## Evidence

Evidence types: **PG** is a throwaway local PG17 with the live schema fixture
and the migration file loaded byte-for-byte. **Hook** is the real hook against
the fake database. The fake's function snapshots every table and restores it
if any step fails.

| Claim | Evidence | Result |
|---|---|---|
| Same final state as today's separate requests: Drop, Keep, day + focus, let-go Someday, push, clear | PG parity | 9/9 |
| A failure at **every** step position rolls back row, records, focus and events | PG rollback, 16 injected faults | 10/10 |
| A repeated call, or a retry after a committed call with a lost response, converges; no duplicate rows or events | PG retry | 12/12 |
| Two saves of one task serialise (B waited about 1.5 s for A's lock); the result equals A-then-B | PG concurrency | 4/4 |
| Saves of different tasks do not block each other (8 ms) | PG concurrency | pass |
| Outsider, partner on a private task, or a missing task → 42501, nothing written | PG security | pass |
| Partner on a couple task and the owner are allowed | PG security | pass |
| anon → permission denied | PG security | pass |
| Non-placement columns (`title`, `user_id`, `scope`, `completed`, `id`) → 22023, nothing written | PG security | pass |
| Malformed steps (bad kind, level or date, missing fields, not an array, over 32 steps) → rejected, nothing written | PG security | pass |
| Injection-shaped values stay data | PG security | pass |
| `prosecdef = false`, `search_path` pinned, EXECUTE for `authenticated` only | PG pinning | 3/3 |
| A column-specific trigger fires only for columns sent | PG parity probe | pass, after the fix below |
| Switch on: Drop, Keep and a placement-only updateTask each make **one** call | Hook | pass |
| Switch on: a failure leaves nothing written and the task restored | Hook | pass |
| Switch on: a mixed save (title + week) uses the ordinary requests | Hook | pass |
| Switch off: no call is made; requests are exactly as before | Hook | pass |
| **Stale (Codex's reproduction).** Sequential: A ok; B → 40001; only Sep 27 open | PG stale | pass |
| **Stale, truly concurrent** (two sessions, 3 rounds): B waits ~1.5 s, then 40001; never two weeks open | PG stale | pass |
| After a refusal, re-read and re-plan → only Oct 4 open | PG stale | pass |
| Expected-set rules: an extra, missing or wrong entry → 40001; duplicates, order and date spelling tolerated | PG stale | 15/15 |
| An identical repeat after a commit → 40001, nothing written; re-read + re-plan converges | PG retry | pass |
| Bad `p_expected_open` (null, object, string, bad date) → rejected | PG security | pass |
| No 2-arg overload exists; the migration drops any earlier one | PG pinning | pass |
| Hook: the save states the records it planned from | Hook | pass |
| Hook: a stale plan is refused, writes nothing, the tab shows the other device's week; the next save lands cleanly | Hook | pass |
| Hook: a stale Drop is refused | Hook | pass |
| Hook: a lost response after the commit re-reads and does NOT restore the old snapshot | Hook | pass |
| Hook: lost response + failed re-read → placement saves blocked, unsent, until a read succeeds | Hook | pass |
| Hook: a dated move that rolls back shows no date, no focus, the old bucket (the DB's) | Hook | pass (red on previous hook) |
| Hook: a dated move whose response is lost shows the committed date, all-day and focus | Hook | pass |
| Hook: deferral fields come back from the DB after a rollback | Hook | pass (red on previous hook) |
| Hook: a failed focus read → snapshot stands, saves blocked unsent until a full read | Hook | pass (red on previous hook) |
| The client allowlist matches the migration's `allowed` | Unit | pass |

The PG totals are **99 passed and 0 failed** (parity 9, rollback 10, retry 12, concurrency 4, stale 15, security 45, pinning 4). Rerun with
`./scripts/test-apply-task-placement-locally.sh` (`VERBOSE=1` for detail).

**Defect found and fixed during the proof.** The first draft's UPDATE named
all 11 allowed columns, so `UPDATE OF`-style triggers fired on saves that
never touched those columns. A PATCH names only what it sends. The row step
now builds its SET list from the keys actually sent: they are validated
against the allowlist and quoted with `%I`, and the values are typed by
`jsonb_populate_record` and bound. The parity probe now shows no divergence.

**Known, intended difference.** `{defer_count: null}` is stored as 0, where a
PATCH would store NULL. The app always sends `?? 0`.

## Security review (for sign-off)

- **SECURITY INVOKER.** Every statement runs as the caller under existing RLS.
  The function can do nothing the caller cannot already do request by
  request. `prosecdef = false` is asserted.
- **Row lock first** (`FOR UPDATE`). A caller who cannot update the task gets
  42501 before any write. The lock also serialises writers on one task.
- **Column allowlist.** Only the placement columns and their deferral
  bookkeeping can be written: `bucket`, `week_start`, `month_start`,
  `season_start`, `weekend_start`, `scheduled_for`, `is_all_day`,
  `planned_on`, `defer_count`, `deferred_until` and `week_deferred_at`.
  Everything else is rejected.
- **Dynamic SQL.** It is used only for the SET list of validated column
  names, via `format('%I')`. Values are always bound parameters.
- **Input limits.** At most 32 steps. Kinds and levels are enumerated; dates
  and uuids are cast strictly.
- **Grants.** `REVOKE` from `public` and `anon`, `GRANT EXECUTE` to
  `authenticated`. `service_role` can also execute it under Supabase's
  default privileges. That is expected, since service_role bypasses RLS
  anyway, and the app never uses it.
- **`search_path`** is pinned to `public, pg_temp`.
- **Reviewer to confirm:**
  - that no trigger on `tasks`, `task_commitments` or `task_focus` assumes one
    statement per transaction. PG parity found none on the fixture, but it
    should be checked against the live catalog at apply time;
  - that realtime subscribers cope with the batched commit.

## Rollout plan (each step needs approval; none is authorised here)

1. **Review** this document and the migration; sign off the security review.
2. **Apply the migration** to the shared project. Applying it alone changes
   no behaviour, because the switch is off.
3. **Verify in place.** Run the 100 test file against the project inside a
   rolled-back transaction, the same technique as the 096/goal-support proof.
   Confirm the grants and `pg_proc` flags on the live catalog.
4. **Confirm PostgREST rolls back.** An RPC whose function raises must roll
   back the whole call. That is **inferred** today, not observed; check it
   once against the applied function with a deliberately failing step on a
   disposable task.
5. **Two-account live test.** Owner and partner on a couple task; partner on
   a private task (refused).
6. **Turn the switch on for a local or preview build.** Walk Drop, Keep and a
   week/day choice, and watch the network: one RPC per save.
7. **Staged production turn-on** with Scott's approval, and a rollback plan:
   unset the variable and redeploy. The ordinary path is untouched and
   remains the default.

## Still pending (explicitly not done)

- Applying the migration, and any production change.
- Live calendar edit/save, drag/resize and Delete verification.
- Two-account live verification.
- PostgREST rollback observed against a live function.
- Group moves, and saves mixed with non-placement fields, on the transactional
  path. They stay on the ordinary requests; extending them would need a wider
  function.

## Applied — 2026-09-25 08:30 UTC (Scott approved)

`apply_migration('apply_task_placement')` applied the file **byte-for-byte as
reviewed** at 12a3afc0 (sha256 `d4b4ef73…882b`). The header's "NOT
APPLIED" wording is left as reviewed; this section is the record. The
**switch is still off**, so the app does not call the function yet.

**Read-only preflight, before applying.**
- The function did not exist.
- All 11 written columns exist with the expected types.
- The live triggers on `tasks`, `task_commitments` and `task_focus` are the
  same 6 as the fixture.
- Unique keys match.
- The trigger functions and helpers (10) match the fixture by
  `md5(pg_get_functiondef)`. So the local 99/99 proof ran against the live
  logic.

**Installed.**
- One version, `apply_task_placement(uuid,jsonb,jsonb)`; no 2-argument
  version.
- `prosecdef=false`; `search_path=public, pg_temp`.
- anon cannot execute; authenticated can.
- The body md5 equals the reviewed file's body.

**Live checks: one transaction, rolled back.** Afterwards 0 rows and 0
records remain.

| # | Check | Result |
|---|---|---|
| 1 | Owner's save: remove 09-20, ensure 09-27, row | ok — open = 09-27, row week 09-27 |
| 2 | Stale plan (expected 09-20 after the move) | **40001**, open still 09-27 |
| 3 | A later step fails (`title` in the row step) | **22023**; the earlier remove/ensure rolled back (09-27 still open, no 10-04); title unchanged |
| 4 | Outsider (other household) | **42501** |
| 5 | Household partner on a couple task | ok — open = 10-04 |
| 6 | anon | **42501** permission denied for function |

**Still pending** (each needs approval):
- The PostgREST-level rollback observation (step 4 of the rollout).
- A two-account check from real signed-in sessions.
- Preview with `VITE_PLACEMENT_RPC=true`.
- A staged production turn-on.

## Live rollout step 1 — PostgREST rollback observed, and a retry storm found (2026-09-25 08:32–08:37 UTC)

A throwaway task, `QA-RPC rollback probe`, was captured in the demo account.
Real calls to `/rest/v1/rpc/apply_task_placement` were then made from the
demo's signed-in page.

| Call | Result |
|---|---|
| ensure week 10-11, then a `title` row step | **HTTP 400, 22023**. Afterwards the probe has **0 records and 0 events**: PostgREST rolled the whole call back (**observed**, no longer inferred) |
| ensure week 10-11 + row, expected `[]` | ok: the week opened and the row matches |
| undo (remove + row) | ok |
| **stale call** (expected ≠ current) | **Hung.** PostgREST **retried it ~100 times a second**: 23,899 refusals in the Postgres logs from 08:32 to 08:37 UTC |

**Cause.** The stale refusal used SQLSTATE `40001`, which PostgREST retries as
a serialization failure. The retries continued after the browser tab was
closed. They stopped only when the probe's state was made to match the
pending plan, at 08:37:00. Every retry was refused and rolled back, so no data
was written. The load on the shared database was real but brief.

**Why the local proof missed it.** It calls the function directly, not through
PostgREST.

**Fix (prepared, NOT applied; needs Scott's approval).**
- `supabase/migrations/2026-09-25_apply_task_placement_conflict_code.sql`
  refuses with **PT409**. PostgREST returns HTTP 409 and does not retry it.
  Only that one errcode changes.
- The client recognises PT409.
- The local proof loads both migrations in order: **100/100**, with a new guard
  that fails if the function ever raises 40001 or 40P01.
- New hook test for the refusal code: red with the old code check.

**State now.**
- The live function still has the 40001 refusal. That is harmless while the
  switch is off, because the app never calls it.
- **Do not enable the switch, or call the function directly, until the
  follow-up is applied.**
- The probe is clean: in the Inbox, week record removed.

## Conflict-code fix APPLIED and verified live — 2026-09-25 08:44 UTC (Scott approved)

**Applied.** `apply_migration('apply_task_placement_conflict_code')`, migration
version 20260925084406, the file unchanged (sha256 `fed32ed1…76b9`).

**Installed.**
- One version, `(uuid,jsonb,jsonb)`.
- `prosecdef=false`; `search_path` pinned.
- anon cannot execute; authenticated can.
- The source contains `PT409` and no 40001 or 40P01.
- The body md5 equals the file's (`9a78b35e…`).

**One stale request through PostgREST,** from the demo's signed-in page with a
10-second abort guard. The probe had no open records; the request expected
week 10-11.

| Check | Result |
|---|---|
| Response | **HTTP 409**, code `PT409`, "placement changed since it was read", **322 ms** |
| Data | Unchanged: probe records `[10-11: removed]`, bucket inbox, 4 events (same as before the call) |
| Refusals in the Postgres logs since the fix | **Exactly 1** (08:44:51.524 UTC, `PT409`, via `authenticator`); none in the 27 s after it |

No retries recurred. The switch is still off; the preview is not yet enabled.

## Preview verification with the switch ON — 2026-09-25 (Scott approved, preview only)

Built `VITE_PLACEMENT_RPC=true npm run build` at `f60d52bb`, served on :5199,
demo account. Disposable fixtures `QA-TX1 drop` and `QA-TX2 keep`. Requests
were logged by wrapping `fetch` in the page; the DB was read after each save.

| Journey | Requests | DB after |
|---|---|---|
| Week chip, task with records (TX1 → Sep 27, TX2 → Sep 27) | **1 × `rpc/apply_task_placement` 200** each | old week removed, new week open, row matches |
| Look-back: Drop TX1, Keep TX2, Save | **2 × RPC 200** (one per verdict) + `planning_sessions` 200 | TX1: Sep 27 removed, keeps its Sep 29 date ("stays on its day", as the preview said). TX2: Sep 27 carried → Oct 4, Oct 4 open |
| Week change after another device's write, realtime already delivered | 1 × RPC 200 | Client planned from the fresh state; both old weeks closed, one open |
| **Stale conflict** (competing `task_commitments` insert sent as the demo user immediately before the RPC) | **1 × RPC 409 `PT409`, 207 ms** | Refused plan wrote nothing; UI refreshed to the other write's week and showed "This changed somewhere else — it has been refreshed. Try again." Postgres logs: **exactly 1** refusal, no retries |
| Retry of the same choice | 1 × RPC 200, 370 ms | Exactly one open week (Oct 4); the other three removed |
| Day choice inside the already-open week | 1 × `PATCH tasks` | By design: no record changes, so no RPC (the single PATCH is already atomic) |
| Reload | — | Week, carry and day all persisted as saved |
| Mixed save (Inbox → week via the domain gate, sets context) | legacy PATCH + POST | By design: not placement-only |

**Switch restored OFF.** Rebuilt without `VITE_PLACEMENT_RPC` (unset in
`.env` and `.env.production`); :5199 serves the new bundle. A week change on
TX2 then went out as the ordinary `PATCH tasks` + `PATCH task_commitments` +
`POST task_commitments`, ending with one open week (Oct 11).

**Not covered here.** Two-account verification (needs Scott's second login).
Production enablement: not authorized. Fixtures `QA-TX1 drop` and `QA-TX2 keep`
are left on the demo account for inspection.
