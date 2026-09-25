# Keep and updateTask write order: investigation (2026-09-25)

**Question.** Drop now sends its commitment ops first and the row last, skips the row when an op failed, and re-reads records and row on failure (097, option a). Is the same order safe for `keepForward` and for `updateTask`'s placement path?

**Answer.**

- **keepForward: yes, but only in the form tested as candidate-C.** That form sends `ensure` before `carry`, sends nothing after the first failed request, and writes the row last. In the planner's order (`carry` then `ensure`), a failed ensure leaves the task in the Inbox or on the month, with "carried to October" pointing at nothing (K1, K2 [PG]). The current order leaves the row and records disagreeing (a SPLIT) when the Keep is at a level other than the row's bucket (K3, K4 [PG]). One cost remains: a weekend Keep whose final row write fails keeps a stale `weekend_start` (K2w [PG]).
- **updateTask: partially.** Ops-first with the candidate-C rules removes every SPLIT the current order produces: moving up (U7), let-go to Someday (U5), removing the day and week (U4b), and moving back a week (U3c) [PG]. Plans with no commitment ops (U1, U2, U3a, U4a) have nothing to reorder. Ops-first does **not** give a clean result for two paths:
  - A weekend-clearing move (U6c) can leave `weekend_start` outside the task's week.
  - A dated task sent to another week (U3b) can stay on its old day while its week record has moved.

  Neither path produces a SPLIT, the current order is not clean there either (the task sits on two weeks), and a retry fixes both [PG].

Rerun (local only, throwaway PG17, never touches Supabase):

```
./scripts/investigate-keep-update-order.sh            # SUMMARY / PASS lines
VERBOSE=1 ./scripts/investigate-keep-update-order.sh  # + TRACE / RESULT / OBSERVE lines
```

Files: `supabase/tests/099_keep_update_order.investigation.sql` and `scripts/investigate-keep-update-order.sh`. Schema: `supabase/tests/fixtures/planning_commitments_schema.sql`, the same live-catalog fixture as 097. Last run: 23 blocks passed, 0 failed; 441 boundary runs.

**Evidence labels:**

- **[PG]** means an assertion or recorded state in 099 against the live schema.
- **[code]** means it was read from source. The plans were produced by *running* `planKeep` and `planPlacement`, noted below.
- **[inferred]** means it is reasoning that was not tested.

## Method

- **Requests come from the app's own plans [code, executed].** `planKeep` and `planPlacement` from `src/lib/placement/intentions.ts` were run under `vite-node` with `TZ=America/New_York` and now = Fri 2026-09-25. Each scenario was fed the updates object its real caller sends: `chooseTaskDay`, `pushTask`, `timingRemoval`, `taskDayRemoval`, `setBucket`, `weekendPlacement`, `onPickWeek` and `keepForward`. The printed row keys and ops were then mapped to the columns `useSupabaseTasks.ts` sends: `keepOne`'s `dbRow`, and `updateTask`'s `dbUpdates`, which carry every `plan.row` key. That mapping was done by reading the code.
- **Client policies** run over the same request list:
  - **current**: the row goes first, and a row error stops the sequence. Every commitment op is then attempted even after one fails (`writeCommitmentOps` "stops at nothing"). The let-go re-assert runs only when all ops succeeded. Focus ops follow.
  - **candidate-A**: the ops in the planner's order, then focus, then the row, sent only if everything before it wrote. This is Drop's shape today.
  - **candidate-B**: A, with every `ensure` moved before the `carry`/`remove` ops.
  - **candidate-C**: B, but nothing is sent after the first failed request.
- **Boundaries:** every request × three modes:
  - **fail**: rolled back, like a 500.
  - **lost**: committed, but the client takes the failure path.
  - **down**: that request and every later one fail, like a network drop.
- **After each boundary** the harness records the row cache, day, weekend, records, focus and anomaly flags. Then the same request list is resent (the retry) and compared with a clean run's end state and placement-event counts.
- **Setup:** the actor is the household partner on alex's `couple` task, as `authenticated` under the live RLS, the same setup as 097.

**Anomaly flags:**

| Flag | Meaning |
|---|---|
| **SPLIT** | The row is not what the open records imply under `tasks_sync_from_commitments`' rule. This is 097's bug class. |
| **2×level** | Two open commitments at one level, so the task shows on two lists. |
| **day∉wk** | The task is dated, but its open week commitment is a different week. |
| **weekend∉week** | `weekend_start` lies outside the row's week, or the row has no week. |
| **carried→none** | A carried commitment whose destination is not open. |
| **part** | The state is neither the untouched seed nor the finished result. |

## What the triggers do on these paths

1. **The mirror opens only the bucket's own level [PG, fixture].** A row-first Keep at the bucket's level opens the destination before the carry, as in K1 and K2 (`TRACE after #1 row`). At another level it does not: K3 is a month Keep on a week task, and K4 is a season Keep on a month task. There the row write alone creates a SPLIT, **even in a run with no failure**, which every other reader can see between requests (K3 and K4 current `TRACE after #1`). The same transient SPLIT appears in clean current runs of U3c, U4b and U5 [PG TRACE].
2. **The sync derives from records after every commitment write [PG, 097].** In the planner's order a `carry` or `remove` comes before its `ensure`, so the sync briefly finds nothing open at that level:
   - In K1 (`candidate-A TRACE after #1`) the task drops to `inbox` with "carried to Oct" and no October.
   - In K2 it drops to the month.
   - In U3c it drops off every week.

   If the ensure then fails, that state stays (S2, S5).
3. **Ensure first, then stop at the first failure (C) avoids both problems [PG S2, S5].** The only partial state left is 2×level: the old period is still open next to the new one. The row still agrees with the records, because the sync takes the latest open period.
4. **Dated tasks: the old day wins until the row write [PG S4].** For a dated row, the sync sets `week_start` to the week of `scheduled_for` and the bucket to `timed`, whatever the records say. With ops first, the row stays `timed` on the **old** day's week through every op, as in the U3b, U4b and U5 candidate TRACE lines. It never contradicts `scheduled_for`. What goes out of step is the day and the records: in U3b, W2 is open while the task is still dated Thursday in W1 (day∉wk). If the final row write fails, that state stays until a retry. Where the plan removes the day's week or everything (U4b, U5), the leftover is a dated task with fewer commitments, which is consistent but unfinished.
5. **The mirror and day moves: the row does not need to go first [PG].**
   - A `timed` row never makes the mirror ensure anything.
   - A pure date move (U2, U3a) sends no commitment op at all.
   - In U3b the explicit `ensure W2` op opens the right week, and the final row write is a no-op for the mirror.

   The clean-run event counts are identical under every order (S).
6. **Only the row clears `weekend_start` [PG S3; 097 a4].** The sync never touches it. With the row last, any failure after the ops leaves the old weekend attached to the new week (U6c, K2w). The current order never does this.
7. **Focus has no trigger [PG F4].** Focus order therefore cannot affect whether the row and records agree:
   - `set` must stay insert-or-ignore. A merge-duplicates upsert on an existing focus row is refused: `new row violates row-level security policy (USING expression) for table "task_focus"`, because there is no UPDATE policy [PG F2].
   - `clear` deletes only the caller's rows and is idempotent. The partner clearing alex's focus deletes 0 rows without an error [PG F3].
   - A failed focus op leaves a coherent half: a dated task that is not chosen (current order), or a chosen task with no day (candidate order) [PG U1].

## Per path: current vs candidate (worst states seen at any boundary)

Full per-boundary tables are in the appendix.

| Path | Ops the plan emits [code, executed] | Current order | Candidate-A (planner order) | Candidate-C (ensure first, stop) |
|---|---|---|---|---|
| **K1** Keep month Sep→Oct | carry Sep, ensure Oct | 2×month | **carried→none, row `inbox`** | 2×month |
| **K2** Keep week W1→W2 (+Sep) | carry W1, ensure W2 | 2×week | **carried→none, row `month`** | 2×week |
| **K2w** same, weekend task | carry, ensure; row clears weekend | 2×week | carried→none, weekend∉week | 2×week, **weekend∉week** |
| **K3** Keep month on a week task | carry Sep, ensure Oct | **SPLIT** (row response lost, or network down from the first op), carried→none (ensure fails) | carried→none | 2×month |
| **K4** Keep season on a month task | carry Fall, ensure Winter | **SPLIT**, carried→none | carried→none | 2×season |
| **U1** week task given today | focus set (no commitment op) | clean (dated, not chosen) | clean (chosen, no day) | — |
| **U2** day moved in the week | none | clean | — | — |
| **U3a** day moved to another week by date | **none** | day∉wk *(the designed end state, see below)* | — | — |
| **U3b** dated → week W2 (`onPickWeek`) | remove W1, ensure W2 | 2×week | **day∉wk** (+2×week) | **day∉wk** (+2×week) |
| **U3c** week W2 → W1 | remove W2, ensure W1 | **SPLIT** | 2×week, **dropped off every week** | 2×week |
| **U4a** remove day, keep week | focus clear | clean | clean | — |
| **U4b** remove day and week | remove W1, ensure Sep; focus clear | **SPLIT** | clean | clean |
| **U5** dated, week+month → Someday | remove W1, remove Sep | **SPLIT**; a failed re-assert leaves `inbox` | clean (a failed row leaves it dated, no commitments) | clean |
| **U6a** weekend set on an Inbox task | ensure W1; focus clear-all | clean | clean (a failed row leaves it on the week, no weekend) | — |
| **U6c** weekend task → W2 | remove W1, ensure W2; row clears weekend | 2×week | **weekend∉week**, dropped to month | **weekend∉week** (+2×week) |
| **U7** week → month (up) | ensure Sep, remove W1 | **SPLIT** | clean | clean |

A dash means the policy is identical to one already shown, because the plan has one op or none. Candidate-B is in the appendix. It is A's failure set with the ensure moved first, and it still produces carried→none and demotion (S2, S5).

**Where the current order splits [PG S1]:** K3, K4, U3c, U4b, U5 and U7. It happens only when the row landed and no op after it did: the row's response was lost, or the network dropped right after the row write.

- On a lost row response, `keepOne` and `updateTask` restore `before` locally and neither re-reads nor marks the task unreconciled [code]. The acting tab is then wrong too, not just other readers, until realtime or a reload arrives [inferred].
- The candidate never splits at any boundary [PG S].

**Retry [PG S].** Every boundary × mode × policy converges to the clean run's end state when the same request list is resent, with the same placement-event counts.

A real retry re-plans from the re-read, and that re-plan is a subset of the original list:

- `planKeep(from)` skips a carry whose source is no longer open.
- `planPlacement` only removes what is still open.

The extra requests in a full resend are no-ops: `remove`/`carry` are guarded by `status='open'` and return 0 rows [097 1.2], `ensure` is an upsert, and focus `set` is insert-or-ignore [code for the re-plan; the no-op behaviour is PG]. The re-plan itself was not executed [inferred].

## Where ops-first is safe, and where it is not

**Safe, with the proving blocks:**

- **keepForward in form C**: K1, K2, K3, K4 under `candidate-C`. There is no SPLIT and no carried→none at any of 36 boundaries, and every retry converges (S, S2).
- **updateTask plans with commitment ops**, in form C: U3c, U4b, U5, U7. There is no SPLIT and no demotion (S, S5). For U7 and U4b, form A behaves the same as C.

**Not safe as-is:**

- **Ops in the planner's order (form A), or continuing after a failed op (form B).** A `carry`/`remove` that lands without its `ensure` drops the task a level or into the Inbox. That is S2 (K1 `candidate-A #2 fail` → `inbox`, carried→none) and S5 (U3c `candidate-A #2 fail` → month; `candidate-B #1 fail` → month). `writeCommitmentOps` currently attempts every op. That is harmless for Drop's single op, but it produces exactly A/B behaviour on multi-op plans [code].
- **Plans that clear `weekend_start`** (U6c, K2w): after any failure past the first op, the weekend stays attached to a week it is not in (S3). The weekend list reads `task.weekendStart`, as in `WeekList.tsx:64` and `weekList.ts:42`, so the task would show under "Weekend · Sep 26–27" on W2's list [code for the readers, inferred for the display].
- **A dated task moved to another week** (U3b): ops-first leaves it on its old day while its week record has moved (S4). The current order leaves it undated on two weeks. Both converge on retry. Neither is a SPLIT, so choosing between them is a UX question, not a consistency one [PG states, inferred UX].

**A finding independent of order (U3a) [PG + code].** A date move into another week by `pushTask` or a drag to a date sends **no** week op, because `planPlacement` treats "schedule" as touching only `scheduledFor`. The mirror never ensures for `timed`, so W1 stays open and nothing opens for W2. W1's list (via `committedTo`) keeps a task dated in W2, while the row's `week_start` says W2. Reordering cannot change this, and a retry leaves it as is. Whether that is intended belongs to the planning spec, not to this fix.

## Recommendation (limited to what the evidence supports)

1. **keepForward:** send `ensure(dest)` → `carry(source)` → row. Stop at the first failed request. On failure, re-read records and row (`reconcileTaskPlacement`, as Drop does). This is form C (K1–K4). Either `planKeep` emits the ensure first or the writer reorders; `applyCommitmentOps` gives the same local result in both orders for these two ops [code, inferred]. Accept, or separately handle, the weekend residue in K2w.
2. **updateTask, plans with commitment ops:** use the same form C, which removes the U3c, U4b, U5 and U7 SPLITs. The final row write replaces the let-go re-assert, as in Drop. Do this only with a stop-on-first-failure writer, not the current `writeCommitmentOps`.
3. **updateTask, U6c and U3b shapes:** do not claim a fix. Ops-first trades 2×week for weekend∉week or day∉wk.
   - Clearing `weekend_start` in a separate request *before* the ops would remove the U6c residue [inferred, not tested].
   - Keeping the current order for plans that clear a day or a weekend is also defensible, because those plans do not split under it (U3b, U6c current: no SPLIT) [PG].
4. **Plans with no commitment ops** (U1, U2, U3a, U4a) need no change for consistency. Focus order is free, and `set` must stay insert-or-ignore (F2).
5. Unchanged from 097: only a single transactional RPC is atomic.

## Limits

- This has the same fidelity gaps as 097: there is no PostgREST, no realtime and no concurrent writers, and each request is a subtransaction.
- The request payloads come from executed plans, but the translation into HTTP requests was transcribed by reading `useSupabaseTasks.ts`, not executed.
- The candidate policies are models of a client that does not exist yet.
- These parts were not covered:
  - Goals and a goal's steps under Keep.
  - `updateTask`'s group-children move.
  - A Keep of a dated task. `planKeep` leaves the day, so the row stays `timed` on the old week while the week record moves [code, executed plan]. Not run.
  - Two writers at once.
- What other devices show in each state is inferred from the readers named above, not observed.

## Appendix: every boundary (generated from the last run)

Each cell shows `outcome flags [row cache, day, weekend]`, where the outcome is:

- `none`: the untouched seed.
- `done`: the clean run's end state.
- `part`: anything else.

Dates are MM-DD in 2026. `#` is the request's position in that policy's list. `op` is a commitment op, `focus` is a focus op, and `row`/`reassert` are the tasks PATCHes.

#### K1 keep month Sep→Oct

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part 2×month [month/-/10-01/-] | none |
| current | 2 | op | part 2×month [month/-/10-01/-] | done | part 2×month [month/-/10-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×month [month/-/10-01/-] | done | none |
| candidate-A | 2 | op | part carried→none [inbox/-/-/-] | done | part carried→none [inbox/-/-/-] |
| candidate-A | 3 | row | done | done | done |
| candidate-B | 1 | op | part carried→none [inbox/-/-/-] | done | none |
| candidate-B | 2 | op | part 2×month [month/-/10-01/-] | done | part 2×month [month/-/10-01/-] |
| candidate-B | 3 | row | done | done | done |
| candidate-C | 1 | op | none | part 2×month [month/-/10-01/-] | none |
| candidate-C | 2 | op | part 2×month [month/-/10-01/-] | done | part 2×month [month/-/10-01/-] |
| candidate-C | 3 | row | done | done | done |

#### K2 keep week W1→W2 (+Sep)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part 2×week [week/09-27/09-01/-] | none |
| current | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×week [week/09-27/09-01/-] | done | none |
| candidate-A | 2 | op | part carried→none [month/-/09-01/-] | done | part carried→none [month/-/09-01/-] |
| candidate-A | 3 | row | done | done | done |
| candidate-B | 1 | op | part carried→none [month/-/09-01/-] | done | none |
| candidate-B | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| candidate-B | 3 | row | done | done | done |
| candidate-C | 1 | op | none | part 2×week [week/09-27/09-01/-] | none |
| candidate-C | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| candidate-C | 3 | row | done | done | done |

#### K2w keep week W1→W2, weekend task

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part 2×week [week/09-27/09-01/-] | none |
| current | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-A | 2 | op | part weekend∉week carried→none [month/-/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week carried→none [month/-/09-01/- we09-26] |
| candidate-A | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-B | 1 | op | part weekend∉week carried→none [month/-/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-B | 2 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part 2×week weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-B | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-C | 1 | op | none | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-C | 2 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part 2×week weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-C | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |

#### K3 keep month Sep→Oct, on week W1

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** [week/09-20/10-01/-] | none |
| current | 2 | op | part 2×month [week/09-20/10-01/-] | done | part **SPLIT** [week/09-20/10-01/-] |
| current | 3 | op | part carried→none [week/09-20/-/-] | done | part carried→none [week/09-20/-/-] |
| candidate-A | 1 | op | part 2×month [week/09-20/10-01/-] | done | none |
| candidate-A | 2 | op | part carried→none [week/09-20/-/-] | done | part carried→none [week/09-20/-/-] |
| candidate-A | 3 | row | done | done | done |
| candidate-B | 1 | op | part carried→none [week/09-20/-/-] | done | none |
| candidate-B | 2 | op | part 2×month [week/09-20/10-01/-] | done | part 2×month [week/09-20/10-01/-] |
| candidate-B | 3 | row | done | done | done |
| candidate-C | 1 | op | none | part 2×month [week/09-20/10-01/-] | none |
| candidate-C | 2 | op | part 2×month [week/09-20/10-01/-] | done | part 2×month [week/09-20/10-01/-] |
| candidate-C | 3 | row | done | done | done |

#### K4 keep season Fall→Winter, on Sep

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** [month/-/09-01/12-01] | none |
| current | 2 | op | part 2×season [month/-/09-01/12-01] | done | part **SPLIT** [month/-/09-01/12-01] |
| current | 3 | op | part carried→none [month/-/09-01/-] | done | part carried→none [month/-/09-01/-] |
| candidate-A | 1 | op | part 2×season [month/-/09-01/12-01] | done | none |
| candidate-A | 2 | op | part carried→none [month/-/09-01/-] | done | part carried→none [month/-/09-01/-] |
| candidate-A | 3 | row | done | done | done |
| candidate-B | 1 | op | part carried→none [month/-/09-01/-] | done | none |
| candidate-B | 2 | op | part 2×season [month/-/09-01/12-01] | done | part 2×season [month/-/09-01/12-01] |
| candidate-B | 3 | row | done | done | done |
| candidate-C | 1 | op | none | part 2×season [month/-/09-01/12-01] | none |
| candidate-C | 2 | op | part 2×season [month/-/09-01/12-01] | done | part 2×season [month/-/09-01/12-01] |
| candidate-C | 3 | row | done | done | done |

#### U1 week task given today (+focus)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part [timed/09-20/09-01/- d09-25] | none |
| current | 2 | focus | part [timed/09-20/09-01/- d09-25] | done | part [timed/09-20/09-01/- d09-25] |
| candidate-A | 1 | focus | none | part [week/09-20/09-01/-] | none |
| candidate-A | 2 | row | part [week/09-20/09-01/-] | done | part [week/09-20/09-01/-] |

#### U2 day Thu→Sat same week

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | done | none |

#### U3a day Thu W1→Wed W2 by date

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | done day∉wk | none |

#### U3b dated W1 → week W2 (onPickWeek)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part 2×week [week/09-27/09-01/-] | none |
| current | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×week day∉wk [timed/09-20/09-01/- d09-24] | part day∉wk [timed/09-20/09-01/- d09-24] | none |
| candidate-A | 2 | op | part [timed/09-20/09-01/- d09-24] | part day∉wk [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-A | 3 | row | part day∉wk [timed/09-20/09-01/- d09-24] | done | part day∉wk [timed/09-20/09-01/- d09-24] |
| candidate-B | 1 | op | part [timed/09-20/09-01/- d09-24] | part day∉wk [timed/09-20/09-01/- d09-24] | none |
| candidate-B | 2 | op | part 2×week day∉wk [timed/09-20/09-01/- d09-24] | part day∉wk [timed/09-20/09-01/- d09-24] | part 2×week day∉wk [timed/09-20/09-01/- d09-24] |
| candidate-B | 3 | row | part day∉wk [timed/09-20/09-01/- d09-24] | done | part day∉wk [timed/09-20/09-01/- d09-24] |
| candidate-C | 1 | op | none | part 2×week day∉wk [timed/09-20/09-01/- d09-24] | none |
| candidate-C | 2 | op | part 2×week day∉wk [timed/09-20/09-01/- d09-24] | part day∉wk [timed/09-20/09-01/- d09-24] | part 2×week day∉wk [timed/09-20/09-01/- d09-24] |
| candidate-C | 3 | row | part day∉wk [timed/09-20/09-01/- d09-24] | done | part day∉wk [timed/09-20/09-01/- d09-24] |

#### U3c week W2 → W1 (back)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** 2×week [week/09-20/09-01/-] | none |
| current | 2 | op | part 2×week [week/09-27/09-01/-] | done | part **SPLIT** 2×week [week/09-20/09-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×week [week/09-27/09-01/-] | done | none |
| candidate-A | 2 | op | part [month/-/09-01/-] | done | part [month/-/09-01/-] |
| candidate-A | 3 | row | done | done | done |
| candidate-B | 1 | op | part [month/-/09-01/-] | done | none |
| candidate-B | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| candidate-B | 3 | row | done | done | done |
| candidate-C | 1 | op | none | part 2×week [week/09-27/09-01/-] | none |
| candidate-C | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| candidate-C | 3 | row | done | done | done |

#### U4a remove day, keep week

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part [week/09-20/09-01/-] | none |
| current | 2 | focus | part [week/09-20/09-01/-] | done | part [week/09-20/09-01/-] |
| candidate-A | 1 | focus | none | part [timed/09-20/09-01/- d09-24] | none |
| candidate-A | 2 | row | part [timed/09-20/09-01/- d09-24] | done | part [timed/09-20/09-01/- d09-24] |

#### U4b remove day and week

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** [month/-/09-01/-] | none |
| current | 2 | op | part [week/09-20/09-01/-] | done | part **SPLIT** [month/-/09-01/-] |
| current | 3 | op | done | done | part [month/-/09-01/-] |
| current | 4 | focus | part [month/-/09-01/-] | done | part [month/-/09-01/-] |
| candidate-A | 1 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | none |
| candidate-A | 2 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-A | 3 | focus | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-A | 4 | row | part [timed/09-20/09-01/- d09-24] | done | part [timed/09-20/09-01/- d09-24] |
| candidate-B | 1 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | none |
| candidate-B | 2 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | none |
| candidate-B | 3 | focus | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-B | 4 | row | part [timed/09-20/09-01/- d09-24] | done | part [timed/09-20/09-01/- d09-24] |
| candidate-C | 1 | op | none | none | none |
| candidate-C | 2 | op | none | part [timed/09-20/09-01/- d09-24] | none |
| candidate-C | 3 | focus | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-C | 4 | row | part [timed/09-20/09-01/- d09-24] | done | part [timed/09-20/09-01/- d09-24] |

#### U5 dated, week+month → Someday

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** [someday/-/-/-] | none |
| current | 2 | op | part [week/09-20/-/-] | part [inbox/-/-/-] | part **SPLIT** [someday/-/-/-] |
| current | 3 | op | part [month/-/09-01/-] | part [inbox/-/-/-] | part [month/-/09-01/-] |
| current | 4 | reassert | part [inbox/-/-/-] | done | part [inbox/-/-/-] |
| candidate-A | 1 | op | part [timed/09-20/-/- d09-24] | part [timed/09-20/-/- d09-24] | none |
| candidate-A | 2 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/-/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-A | 3 | row | part [timed/09-20/-/- d09-24] | done | part [timed/09-20/-/- d09-24] |
| candidate-C | 1 | op | none | part [timed/09-20/09-01/- d09-24] | none |
| candidate-C | 2 | op | part [timed/09-20/09-01/- d09-24] | part [timed/09-20/-/- d09-24] | part [timed/09-20/09-01/- d09-24] |
| candidate-C | 3 | row | part [timed/09-20/-/- d09-24] | done | part [timed/09-20/-/- d09-24] |

#### U6a weekend set (inbox task)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part [week/09-20/-/- we09-26] | none |
| current | 2 | op | done | done | part [week/09-20/-/- we09-26] |
| current | 3 | focus | part [week/09-20/-/- we09-26] | done | part [week/09-20/-/- we09-26] |
| candidate-A | 1 | op | part [inbox/-/-/-] | part [week/09-20/-/-] | none |
| candidate-A | 2 | focus | part [week/09-20/-/-] | part [week/09-20/-/-] | part [week/09-20/-/-] |
| candidate-A | 3 | row | part [week/09-20/-/-] | done | part [week/09-20/-/-] |

#### U6c weekend task → week W2 (weekend cleared)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part 2×week [week/09-27/09-01/-] | none |
| current | 2 | op | part 2×week [week/09-27/09-01/-] | done | part 2×week [week/09-27/09-01/-] |
| current | 3 | op | done | done | done |
| candidate-A | 1 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-A | 2 | op | part weekend∉week [month/-/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [month/-/09-01/- we09-26] |
| candidate-A | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-B | 1 | op | part weekend∉week [month/-/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-B | 2 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part 2×week weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-B | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-C | 1 | op | none | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | none |
| candidate-C | 2 | op | part 2×week weekend∉week [week/09-27/09-01/- we09-26] | part weekend∉week [week/09-27/09-01/- we09-26] | part 2×week weekend∉week [week/09-27/09-01/- we09-26] |
| candidate-C | 3 | row | part weekend∉week [week/09-27/09-01/- we09-26] | done | part weekend∉week [week/09-27/09-01/- we09-26] |

#### U7 week → month (up)

| policy | # | request | fail | lost | down |
|---|---|---|---|---|---|
| current | 1 | row | none | part **SPLIT** [month/-/09-01/-] | none |
| current | 2 | op | done | done | part **SPLIT** [month/-/09-01/-] |
| current | 3 | op | none | done | none |
| candidate-A | 1 | op | done | done | none |
| candidate-A | 2 | op | none | done | none |
| candidate-A | 3 | row | done | done | done |
| candidate-C | 1 | op | none | none | none |
| candidate-C | 2 | op | none | done | none |
| candidate-C | 3 | row | done | done | done |

## Decision (Claude, 2026-09-25, under Codex's instruction)

- **keepForward — applied** in the one form the evidence supports: ensure the
  destination first, then the carry, stop at the first failure, row write last,
  failure = re-read records AND row and report failed; the retry (idempotent
  ensure) writes the row. Hook tests in
  `src/hooks/useSupabaseTasks.planWrites.test.ts` ("Keep: destination first…",
  4 tests, all failing on the previous hook). `writeCommitmentOps` gained
  `stopOnFailure`; Drop uses it too.
- **updateTask — NOT changed.** The ops-first pattern is safe only for some
  placements (U4b, U5, U7, U3c) and leaves a different, retry-repairable
  leftover for others (U6c weekend→other week, U3b dated→other week). Applying
  it per placement kind would mean classifying plans inside the core writer —
  the core rewrite Codex ruled out. Which leftover is preferable for U3b/U6c is
  a design call for Codex/Scott.
- **Open spec question (not a write-order issue):** moving a task's DATE into
  another week sends no week op; the old week's commitment stays open and none
  opens for the new week. Needs a planning-spec decision.
- **Concurrency limit (all orders):** these are separate PostgREST requests,
  not one transaction. A second writer (another tab, the partner, the wall)
  can interleave between them; ordering bounds what a *single* client's
  failure leaves behind, it does not serialise writers. Only the RPC option
  (097 option c; migration + security review) is atomic.
