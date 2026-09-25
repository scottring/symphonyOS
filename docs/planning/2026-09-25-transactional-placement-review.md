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
| Migration: `public.apply_task_placement(p_task_id uuid, p_steps jsonb)` | `supabase/migrations/2026-09-25_apply_task_placement.sql` |
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
| The client allowlist matches the migration's `allowed` | Unit | pass |

The PG totals are 76 passed and 0 failed. Rerun with
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
