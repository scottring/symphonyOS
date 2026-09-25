# Drop partial failure: investigation (2026-09-25)

**Seen live:** a review Drop with an injected 500 on the commitment write left the task row at `bucket='inbox'` while its week commitment stayed `open`. A retry fixed it.

**Recommendation:** send commitment ops **first** and the row write **last**, with the final row write replacing the separate let-go re-assert. The live triggers already rewrite the row after every commitment write, so under the reordered sequence the row and the records agree after every possible failure (PG-proven). A single transactional RPC (option c) is the only fully atomic design. Consider it later if multi-op writes need all-or-nothing behavior, because it needs a migration and a security review.

Rerun (local only, throwaway PG17, never touches Supabase):

```
./scripts/investigate-drop-partial-failure.sh            # PASS / OBSERVE lines
VERBOSE=1 ./scripts/investigate-drop-partial-failure.sh  # full psql output
```

Files: `supabase/tests/097_drop_partial_failure.investigation.sql` and `scripts/investigate-drop-partial-failure.sh`. Schema: `supabase/tests/fixtures/planning_commitments_schema.sql`, the live catalog as reconstructed 2026-09-25. Last run: 12 blocks passed, 0 failed.

**Evidence labels** used below:

- **[PG]** means an assertion in 097 proved it against the live schema.
- **[code]** means it was read from source and not executed.
- **[inferred]** means it is reasoning that was not tested.

## How the harness models a failure

Each client request runs in its own subtransaction (`inv.step`), matching PostgREST's one transaction per request. A test-only BEFORE UPDATE trigger (`inv.fault`, driven by the GUC `inv.fail`) raises on the chosen request. That request is rolled back and nothing else is, which is the same end state as a 500 or a request that never arrived.

Faults fire only at trigger depth 1. They hit the client's own statement and never the writes that the live triggers make.

Every sequence runs as the **household partner** (`role authenticated`, JWT `sub`) on alex's `couple` task, under the live RLS. Fidelity gaps are the same as in `scripts/test-planning-commitments-locally.sh`: there is no PostgREST, no realtime, and no concurrent writers.

## What the triggers do at each step

These are the live functions, verbatim in the fixture:

| Client step | Trigger(s) that fire | Effect |
|---|---|---|
| `PATCH tasks {bucket, week/month/season_start}` | BEFORE: `tasks_fill_period_stamps` (on `bucket`) fills a missing stamp for a period bucket. AFTER: `tasks_mirror_to_commitments` | The mirror only **ensures** the commitment for the bucket's own level, and only when the new bucket is week/month/quarter and a bucket or stamp changed. On conflict it reopens a `removed` row, and a reopen logs no event. **It never closes a commitment.** A PATCH to `inbox`/`someday` leaves every commitment as it was **[PG 1.2]**. It does not re-derive the row. |
| `UPDATE task_commitments` (remove/carry), or an ensure upsert at depth 1 | AFTER: `task_commitments_after_change`, which logs through `log_placement_event` and then calls **`tasks_sync_from_commitments(task)`** | Sync rewrites `bucket`/`week_start`/`month_start`/`season_start` from the open commitments. The bucket is the lowest open level. With no open commitment, `inbox`/`someday` stay as they are and any other bucket becomes `inbox`. It runs on **every** row-level UPDATE, even one that changes nothing **[PG 1.5]**. It never touches `weekend_start` **[PG a4]**. |
| The tasks UPDATE made by sync (depth 2) | The mirror and the align/fill triggers | Each returns early at `pg_trigger_depth() > 1`, so there is no loop. |
| The commitment write made by the mirror (depth 2) | `task_commitments_after_change` | Returns early, so no sync runs and no event is logged. The mirror logs `committed` itself, and only on a true insert. |

In short, **a commitment write re-derives the row, and a row write never closes a commitment.** Only the row-first order can therefore produce the "row says inbox, commitment open" split.

## Boundaries in the live order (row, then remove, then let-go re-assert)

`dropCommitment` always has exactly one `remove`. The multi-remove cases are the let-go path (`updateTask`/`setBucket` to `inbox`/`someday`), which uses the same row-then-ops shape.

| # | Failing request | DB after failure [PG] | Row and records agree? | Client re-read (`reconcileCommitments`) | Retry of the same sequence [PG] |
|---|---|---|---|---|---|
| 1.1 | row write | untouched (week/09-20, week open) | yes | the client restores `before`; no ops were sent [code] | n/a |
| 1.2 | remove (Drop of the only week) | **row `inbox/-/-/-`, week `open`** | **no (the live bug)** | derives week/09-20 from the records, as the partner under RLS [PG]. The local view is right. | converges to inbox + week removed. A second remove is a no-op. One `removed` event in total. |
| 1.2b | remove (Drop week, month stays) | row `month/-/Sep`, week `open` | **no** | derives week | converges |
| 1.3 | let-go re-assert (Drop → Inbox) | inbox, week removed | yes (sync already kept `inbox`) | — | n/a (harmless) |
| 1.3b | let-go re-assert (Someday, 2 commitments) | row **`inbox`**. The first remove's sync set `month`; the second found `month` and fell back to `inbox`. | yes by the DB rule, but **Someday is lost** | shows **someday**, because `deriveCache` uses the local bucket as its base [code+PG] | a re-issued Someday has no ops; the row write converges to someday |
| 1.4 | the second of two removes | row `month/-/Sep`, week removed, month open | **yes**. The first remove's sync healed the row. | derives month | converges to someday, 2 `removed` events |

**Persistence [PG 1.2]:** after a 1.2 split, nothing in the database repairs the row. A title edit fires no sync. The split lasts until a retry or until any other commitment write on that task, including a no-op `set status = status` **[PG 1.5]**.

**What other readers see [PG state + code reading]:** a fresh load (`loadTasks`) takes `bucket` from the row (`dbTaskToTask`) and list membership from the records (`committedTo`, which counts any non-removed commitment). In state 1.2 the task therefore appears **both** in the Inbox and on the week list:

- The Inbox reads `t.bucket === 'inbox'` in `InboxView.tsx:432`, `ShellLayout.tsx:150` and `taskPools.ts:127`.
- The week list reads the records.

Realtime commitment events (`applyCommitmentEvent`) patch the records but do not re-derive the bucket [code]. The acting tab's own view is correct only because `reconcileCommitments` re-derives the bucket locally. Other tabs, devices, the partner, the wall and iOS read the row [inferred for iOS and the wall].

**Which source is authoritative:** the records. List membership uses `committedTo`, and after a failure `reconcileCommitments` derives the cache from the records with `deriveCache` (model.ts:67, which mirrors `tasks_sync_from_commitments`). The row is a cache that the Inbox, Today pools and every non-acting reader trust [code].

## Candidate fixes

| | (a) ops first, row last | (b) row first + compensate with `before` | (c) one RPC (ops, then row, in one transaction) | (d) keep the order, rely on reconcile/retry |
|---|---|---|---|---|
| Op fails | nothing written [PG a1]; a later op failing leaves a consistent row [PG a5] | consistent **only if the compensating write succeeds** [PG b1]. If it fails too, the split stays [PG b2]. | everything rolled back [PG c2, c5] | split persists [PG 1.2, 1.2b] |
| Row write fails after ops | sync already wrote exactly `plan.row` for Drop [PG a2, a3]. Residue: `weekend_start` not cleared [PG a4], `someday` becomes `inbox` [PG a6]. | n/a | removes rolled back too [PG c3] | 1.3 harmless, 1.3b Someday lost |
| Multi-op | consistent at every step (sync after each op) [PG a5] | **order-dependent**. With [remove week, remove month] and month failing, the mirror's ensure silently reopens the week, leaving a `removed` event for an open week [PG b3]. With [remove month, remove week] and week failing, `month_start` points at a removed month and the split is new [PG b4]. Commitment order is DB load order. | atomic [PG c4, c5] | self-heals after partial success [PG 1.4] |
| Is the explicit row write needed? | For Drop, only for the weekend reset. For a let-go, to keep `someday`. It replaces the separate re-assert. | yes | inside the RPC, as the final statement | yes |
| Triggers | fine: row write after the ops is a no-op for the mirror, with no extra events [PG a7] | the mirror's reopen fights the removals (b3) | same triggers, one transaction | — |
| RLS | partner on a couple task works; all statements run as the caller [PG] | same | SECURITY INVOKER. The outsider and the partner-on-an-individual-task are refused, and nothing changes [PG c7, c8]. | same |
| Retry | idempotent; `remove` matches `status='open'` [PG a5, a6] | compensation must itself be retried | idempotent after a lost response, one event [PG c1] | converges [PG 1.2, 1.3b, 1.4] |
| Cost | reorder in `dropCommitment`, `keepForward`, `updateTask`; drop the re-assert | extra write per failure path, plus order bugs | migration, grant, security review, client rewrite of four callers | none, but the split is visible to everyone except the acting tab until retry |

### Notes and limits

- **(a) and `updateTask` [inferred, not run]:** the sync reads `scheduled_for` from the row. When a placement also changes the day, ops-first derives against the *old* day until the final row write lands. If that row write fails, the row is still consistent with the records and the old day, which satisfies the invariant but is not the intended move. Test this before reordering `updateTask`.
- **(a) and `keepForward` [inferred, not run]:** carry and ensure each trigger a sync, and the ensure's sync lands on the destination period. The 096 Keep cases still run in row-first order.
- **(a) keeps one boundary:** if every op lands but the final row write fails, a let-go to Someday reads `inbox` (the same as today's 1.3b) and a weekend stamp can linger. Both are cosmetic cache values, not a disagreement between row and records.
- **(c):** PostgREST runs an RPC in one transaction and rolls it back on RAISE [inferred; standard PostgREST behavior, not exercised here]. The function lives only in schema `inv` of the throwaway DB. `SELECT … FOR UPDATE` on the task also serializes concurrent placements, which the separate requests cannot do.
- **Cheap self-heal inside (d) [PG 1.5]:** any commitment UPDATE re-syncs the row. That only helps once the network is back, and a retry already does it.

## Recommendation

1. **Now:** reorder `dropCommitment` to send the commitment ops first and the row write last, and stop sending the row when an op failed. Make the final row write the let-go re-assert, so the separate re-assert goes. This removes the live split at every boundary and costs one reorder. Apply the same order to `keepForward`. Do `updateTask` after a harness case for the day-change note above.
2. **Keep** `reconcileCommitments` and `ensureReconciled` as they are. They still cover a failed re-read.
3. **Later, if needed:** option (c), for all-or-nothing placements and serialized concurrent writers, as a reviewed migration.
4. **Rejected:** (b), because it is order-dependent and rewrites history. (d) alone is rejected because the split is visible to every other reader until a retry.
