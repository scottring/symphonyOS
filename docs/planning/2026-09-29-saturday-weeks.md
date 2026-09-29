# Saturday weeks — a household week start

Scott and Iris plan on Friday for the week ahead, weekend first (2026-09-29), so a
household can start its weeks on **Saturday** (or Sunday, the default, or Monday).

## Why it is a household setting

Week records (`task_commitments.level = 'week'`, `tasks.week_start`, weekly
`planning_sessions` tokens) match by their **exact start day**. The week start used
to be per browser while the database stamped every week Sunday-first
(`week_start_of`, `tasks_fill_period_stamps`), so two devices that disagreed each
lost the other's week (already true of the old Monday option).

## What changed

- `households.week_starts_on` (0 / 1 / 6). The three writers that stamp a week now
  ask the task owner's household (`household_week_start`, `week_start_of(day, start)`).
- `set_household_week_start(start)` — owner only (the seasons rule). In one
  transaction it sets the day and moves the household's week records to the new week
  holding each old week's middle day (round-trips exactly: Sun 27 → Sat 26 → Sun 27);
  a dated task's open week then follows its day (a Saturday that ended the old week
  starts the new one); carried history and agreed week plans move too.
- App: Settings → Planning rhythm offers Sunday / Monday / Saturday. In a household
  the owner confirms the switch; members see the household's day, disabled. The shell
  mirrors the household value into the per-device cadence config, which every week
  reader already uses. Alone (no household) it stays a device setting.

## Proof

- `supabase/tests/103_household_week_start.test.sql` — 21 assertions as two
  `authenticated` members with RLS on (member refused, invalid day refused, every
  record moved, dated Saturday follows its day, history and tokens move, new writes
  stamp Saturday, round-trip back to Sunday), ending in ROLLBACK.
- Rollback `supabase/migrations/rollback/2026-09-29_household_week_start.down.sql`
  proven: moves a Saturday household back to Sunday and restores the three writers
  byte-for-byte.
- End to end on the isolated local stack (Rivera household, alex owner / sam member):
  switch, week pages, member view, switch back.

## Release order (needs Scott's OK)

Either order is safe: the app falls back to the device setting until the column
exists, and the migration changes nothing until someone switches.

1. Apply the migration to the shared project. **Done 2026-09-29.**
2. Merge the app.
3. Scott switches to Saturday in Settings → Planning rhythm (as household owner).

Known: a device that had chosen Monday locally follows the household (Sunday) after
this ships. Meal planning keeps its own Sunday weeks (separate feature).
