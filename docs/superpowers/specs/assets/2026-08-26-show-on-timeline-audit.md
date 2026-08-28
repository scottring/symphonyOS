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

---

## Scope of the follow-up task (8b) — corrected 2026-08-28

The final whole-system review traced `src/hooks/useWallData.ts` and found the
blocked work is larger than "adopt rung 3". That file answers the visibility
question in three hand-rolled places, and the wall answers it in a fourth
downstream:

- `:268` — `visibility === 'active' && context === 'family'`: a hand-rolled
  **rung 1** plus a **hardcoded rung 4**.
- `:313` — `getRoutinesForDatePure(...)`: a hand-rolled **rung 2**.
- rung 3 — deliberately skipped, which is what this audit unblocks.
- rungs 5/6/7 — answered downstream in `wallGantt.ts` / `wallV2Adapter.ts`.

**Task 8b is therefore "useWallData adopts the ladder", not "adopts rung 3".**
The tripwire's allowlist entry for this file says so, and that entry must not be
removed until all of the above are gone — otherwise three hand-rolled rungs stay
behind an allowlist that claims the file is clean.

Note `:152` and `:263`: a collection parent is deliberately `visibility:
'reference'` and carries the hour its Steps happen at, so `useWallData` reads
parent times BEFORE filtering to active. Any migration must preserve that
ordering or every Step on the wall becomes untimed.

## Two things discovered while this was blocked

1. **A routine collection renders nothing on Today.** Its parent is resting by
   design, rung 1 hides it, the retention layer rescues only `'everyday'`
   parents, and `groupRoutineSteps` drops the orphaned Steps. The same
   collection renders fine on the wall. Pre-existing — the legacy pipeline
   filtered `visibility === 'active'` first too — and deliberately pinned by
   `computeTodayData.test.ts:243-251`. A product question, not a bug to fix
   blind.

2. **Every event and timed-task bar on the wall is a dead tap.**
   `wallV2Adapter.adaptTimelineSections` drops `type === 'event'` and
   `isCommitment` items from `timeline`, which is the only array
   `WallV2Shell.tsx:562` searches, while `wallGantt.itemsFor` draws them
   anyway; `handleTapGanttItem` passes `label = null`, so the flash fallback
   cannot fire either. Pre-existing. Likely one-line mitigation: pass the
   item's title as `label`.
