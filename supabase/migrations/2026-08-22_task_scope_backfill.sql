-- Family-tagged TASKS stranded at 'individual' scope — the same defect already
-- repaired for routines in 2026-08-22_routine_scope_backfill.sql.
--
-- Tasks RLS reads `scope` and nothing else (2026-06-07_scope_axis.sql:34);
-- `context` is a life area no policy consults. Writers that built a payload by
-- hand and named a context without a scope left the column at its
-- `NOT NULL DEFAULT 'individual'`, so the row looked like household work and
-- was readable only by its owner.
--
-- Measured before applying: of the household's open family tasks, Scott could
-- fetch 110 and Iris 82 — a 28-row gap, 47 including completed. No
-- context='family' + scope='individual' rows existed on Iris's side, so the
-- gap was one-directional. After this, both fetch 110.
--
-- Applied to prod 2026-08-22 via the Management API; idempotent, safe to re-run.

UPDATE tasks SET scope = 'compound' WHERE context = 'family' AND scope = 'individual';
