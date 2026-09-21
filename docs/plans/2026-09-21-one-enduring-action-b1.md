# B1 — one enduring action (implementation plan, 2026-09-21)

Decisions: vault `briefs/2026-09-20-d1-sitting.md` §6 (Scott, verbatim) and §8 (shape).
Schema: `supabase/migrations/2026-09-21_one_enduring_action.sql` (applied first) and
`2026-09-21_fold_source_chains.sql` (applied second).

## The rule

A task is one row for its whole life. It carries:

| Record | Meaning | Where |
|---|---|---|
| commitments | "committed for" a season / month / week, each with its own status | `task_commitments` |
| the day | scheduled on a day (+ time or all-day) | `tasks.scheduled_for`, `is_all_day` |
| focus | this PERSON chose it for this day | `task_focus` |
| history | every commitment and schedule change | `task_placement_events` (trigger-written) |

`tasks.bucket` / `week_start` / `month_start` / `season_start` are a **cache** of the
lowest open commitment (or `timed` when dated), maintained by DB triggers and mirrored
locally by `deriveCache()`. `tasks.planned_on` is no longer written for tasks; it is read
only as a legacy fallback when a task has no focus rows at all (iOS still writes it —
parity is a follow-up).

Equivalent intentions produce identical state. Scheduling, week planning and focus are
distinct operations:

| Intention | Writes | Never touches |
|---|---|---|
| commit to a period (descend) | + commitment at that level | higher commitments, the day, focus |
| move UP a level (week → month) | + commitment; open lower commitments → removed | the day, focus |
| plan for a week | + week commitment | month/season, the day, focus |
| schedule a day | `scheduled_for` (+ week cache aligned by trigger) | commitments, focus |
| unschedule | `scheduled_for` = null | commitments, focus |
| focus / unfocus | own `task_focus` row | everything else |
| keep into next period | current commitment → carried (carried_to); + next open | id, day, focus |
| let go (inbox / someday) | open commitments → removed; day cleared | history |
| complete / reopen | `completed` (+ trigger marks commitments done/open) | |

## Phases

1. `src/lib/placement/model.ts` — types, `deriveCache`, selectors (`onPeriod`, `onWeek`,
   `toSchedule`, `lowerPlacement`, `placementFateOf`, `isFocused`). Pure, tested.
2. `src/lib/placement/intentions.ts` — `planPlacement(task, updates, ctx)`: the one
   translation of a legacy `Partial<Task>` placement write into row updates + commitment
   ops + focus ops + the optimistic local task. Pure, tested. Every writer goes through it.
3. `useSupabaseTasks` — load `task_commitments` + `task_focus` alongside tasks; realtime on
   both; `updateTask` / `updateTasksBulk` / `pushTask` / `setBucket` / `scheduleTask` route
   through `planPlacement`; `keepForward` keeps the id; `copyDown` and the descent branch
   are deleted; `lineage.ts` is deleted.
4. Readers — `selectPeriodTasks` and `WeekMonthRail` read commitments (a task on the
   season AND the month list); chips read off the row; `dayPlan` / `computeTodayData` /
   `WeekViewV2` / `WeekPlanColumn` read focus for the signed-in user; `copyDownExplainer`
   retired from `PeriodPlanPage`.
5. Verify: vitest, tsc (`-p tsconfig.app.json`), lint, build; `docs/item-pathways.md`
   updated; draft PR.

Out of scope here (later batches): vocabulary (B5), row contract (B3), week layout (B4),
iOS parity for focus, wall/MCP writers (covered by the DB mirror trigger).
