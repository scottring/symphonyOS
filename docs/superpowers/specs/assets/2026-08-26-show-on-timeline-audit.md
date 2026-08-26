# show_on_timeline audit

**Status:** awaiting query results
**Gates:** Task 8 (the wall adopts the resolver) does not start until this file
records a backfill as applied and re-verified.

## Why

`useWallData.ts:299` deliberately skips `show_on_timeline`, with a comment
saying the kids' morning and bedtime routines are marked `false` to keep Today
uncluttered, and the wall needs them anyway. So the flag means two different
things depending on which surface you are standing in front of.

The design's resolution is to fix the data, not the rule: those routines were
never meant to be globally hidden, and the assignee filter is the right
mechanism for keeping them off Scott's Today view.

This audit establishes which routines are in that category before anything
changes.

## Run these

**Do not run these with the service role.** It bypasses RLS and returns rows a
normal session cannot see, which produces a confidently wrong answer. Run them
in the Supabase SQL editor as Scott.

### Query 1 — every routine the flag currently hides

```sql
select
  r.id,
  r.name,
  r.context,
  r.scope,
  r.visibility,
  r.recurrence_pattern->>'type' as recurrence,
  r.parent_routine_id is not null as is_step,
  coalesce(
    nullif(array_length(r.assigned_to_all, 1), 0),
    case when r.assigned_to is not null then 1 else 0 end
  ) > 0 as owners_set,
  r.assigned_to,
  r.assigned_to_all,
  r.default_assignee
from routines r
where r.show_on_timeline = false
order by r.context nulls last, r.name;
```

`owners_set` is the column that matters: it answers whether the assignee filter
could do this routine's hiding instead, which is the whole premise of the fix.

### Query 2 — does the default_assignee fallback change anything?

`routineOwners()` falls back to `default_assignee` when neither `assigned_to`
nor `assigned_to_all` is set. If this returns zero rows, that fallback is a
no-op on real data and rung 5 cannot shift who sees what.

```sql
select id, name, default_assignee
from routines
where default_assignee is not null
  and assigned_to is null
  and coalesce(array_length(assigned_to_all, 1), 0) = 0;
```

## Findings

_Pending. Each row from Query 1 gets classified:_

- **(i) genuinely hidden everywhere** — leave `show_on_timeline = false`.
- **(ii) Today-declutter workaround** — flip to `true`; the assignee filter
  takes over.

_Any row classified (ii) whose `owners_set` is false is a **blocker**: the
assignee filter cannot hide a routine that has no owner, so assignment must be
set first. List those separately._

## Backfill

_Pending Findings. Ids enumerated literally — never a `where name like` predicate._

```sql
update routines
set show_on_timeline = true
where id in (
  -- '<uuid>', -- <routine name>
);
```

## Confirmation

_Pending. Re-run Query 1; the category (ii) ids must no longer appear._
