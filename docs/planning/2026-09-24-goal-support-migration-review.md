# Goal-supports-goal: migration review and deployment order

Status: **written, proved locally, NOT applied.** Nothing has touched the
shared Supabase project. `dist` on :5199 is the pre-migration build and stays
compatible with the current schema.

## What the schema change is

`supabase/migrations/2026-09-24_goal_supports_goal.sql` — one column, one
partial index, one trigger function, one trigger.

```
alter table public.tasks
  add column if not exists supports_goal_task_id uuid
  references public.tasks(id) on delete set null;

create index if not exists tasks_supports_goal_task_id_idx
  on public.tasks(supports_goal_task_id) where supports_goal_task_id is not null;
```

Plus `public.guard_goal_support()` and `tasks_guard_goal_support`, a BEFORE
INSERT OR UPDATE OF (supports_goal_task_id, is_goal, bucket) row trigger.

## Why a new column rather than `goal_task_id`

`goal_task_id` means "is a step of". `keepForward` reads it through
`stepsThatCarryForward` and carries a goal's open steps along when the goal
moves. Putting goal→goal in that column would make a parent goal drag its
child goals across periods the moment a task was carried forward — the exact
coupling this is meant to prevent.

The other half of the pair needs no column: a season goal's parent is a YEAR
goal, which is a `goals` row, so it is already `tasks.goal_id`.

```
month goal  --supports_goal_task_id-->  season goal   (tasks row, is_goal)
season goal --goal_id---------------->  year goal     (goals row)
task        --goal_task_id----------->  its goal      (a STEP; carried)
```

The link points UP only. Nothing above holds a pointer down, so moving or
carrying forward a task cannot move a goal.

## What the trigger refuses

| Rejected | Why |
| --- | --- |
| self-link | a goal cannot support itself |
| a link on a non-goal row | a step belongs under `goal_task_id` |
| a link on anything but a month goal | a season goal records its year goal on `goal_id` |
| a link to a row that is not an `is_goal` season row | the parent must be the rung above |
| a link to a goal in another household | `users_share_household`, as every sharing predicate on tasks judges it |
| a link to a row that does not exist | — |

A cycle is impossible without checking for one: a child must be
`bucket='month'` and a parent `bucket='quarter'`, so a row that HAS a parent
can never BE one.

Validation runs **only when the value is set** (insert with a non-null, or an
update that changes it). An unrelated write to a linked row — a keep, a
rename, a completion — is never blocked, and no existing row is invalidated
retroactively. A row whose hierarchy stops holding later keeps its stored link
and the readers ignore it, because the value records a decision and a repair
can still read it.

## Data safety

- Additive. One nullable column; every existing row reads `null`.
- No backfill, no rewrite, no default. Nothing existing is touched.
- `on delete set null`: deleting a season goal leaves its supporters in place,
  unlinked, rather than cascading them away.
- Reversible: `drop trigger`, `drop function`, `drop column`. The only loss on
  a revert is links created after it was applied.

## Test evidence

`./scripts/test-goal-support-locally.sh` — spins up a throwaway local
Postgres 17, seeds the minimum fixture (the `tasks` columns the test writes,
`household_members`, and `users_share_household` verbatim from the live
definition), and runs `supabase/tests/095_goal_supports_goal.test.sql`, which
is byte-identical to the file that will run against the project.

```
— before the migration (the column does not exist) —
the proof fails, as it must
— applying supabase/migrations/2026-09-24_goal_supports_goal.sql —
— after the migration —
NOTICE:  goal supports goal: all 12 assertions passed
```

Nothing in that script reaches Supabase; the cluster is created and destroyed
inside the run.

Application side: 6760 tests passing (the only failure is the pre-existing
`connectors/src/whatsapp/adapter.test.ts` collection error), `tsc -p
tsconfig.app.json` clean, `eslint src/` 0 errors. Carry-forward independence
is pinned in `src/lib/planning/goalSupport.test.ts` and again as assertions 10
and 11 of the SQL proof.

**Not verified:** the link has not been created through the real UI against a
real database, because that needs the migration. That is the first check after
it lands.

## Deployment order

1. **Review this file and the migration.** Nothing below happens without that.
2. Apply the migration to the shared project — DDL via the Management API
   (`docs`: the token is in the keychain; the classifier blocks the plain
   curl), or `supabase db push`.
3. Run `supabase/tests/095_goal_supports_goal.test.sql` against the project
   through the Management API or the Supabase MCP. It ends in `ROLLBACK`, so
   it leaves zero rows. Expect `all 12 assertions passed`.
4. Only then rebuild the preview (`npm run build`) so :5199 picks up the app
   code that writes the column. Until this step the preview must stay on its
   current build — the code omits the column unless a link is set, so the only
   thing that would break beforehand is creating a linked month goal, but
   there is no reason to risk it.
5. Codex walks it live on the demo account: create a season goal for a year
   goal and a month goal for that season goal, reload, and read both ends on
   /month, /season, /year and the goal page. Then carry a task forward out of
   the month goal and confirm both goals stay exactly where they were.
6. Merge and deploy only after 5 passes — pushing to main deploys production,
   and that is Scott's call, separately.

Rollback, if step 3 or 5 fails:

```sql
drop trigger if exists tasks_guard_goal_support on public.tasks;
drop function if exists public.guard_goal_support();
alter table public.tasks drop column if exists supports_goal_task_id;
```
