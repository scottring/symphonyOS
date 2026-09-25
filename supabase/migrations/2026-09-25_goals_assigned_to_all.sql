-- Year goals can be assigned to household members, as tasks already can.
--
-- PREPARED FOR REVIEW — NOT APPLIED. Apply only with Scott's approval.
--
-- WHY. Planning rows now carry an "Assign people" control (goals and steps on
-- the Season and Month pages). Season and month goals are `tasks` rows and
-- already have `assigned_to_all`; a YEAR goal is a `goals` row and has no
-- assignee column, so its row offers no picker. This adds the same column,
-- with the same type and default as tasks.assigned_to_all, events and
-- routines — one assignment model, not a parallel one.
--
-- SHAPE. `assigned_to_all uuid[]` of family_members ids, like the other three
-- tables (an array cannot carry a foreign key; the others have none either).
-- There is no single `assigned_to` companion: goals never had one, and the
-- app reads the list.
--
-- PRIVACY. Nothing here changes who can read a goal. goals RLS shares on
-- `scope` ('couple'/'compound' plus users_share_household), exactly as tasks
-- do. The client derives scope when assignees change, with the task rule
-- (lib/scope.ts scopeForDomain): someone else assigned → 'couple'; nobody
-- else → 'individual'; a family goal stays 'compound'. Context is never
-- changed. Existing goals keep their scope: the default is an empty list.
--
-- CLIENT. The app detects the column (useGoals: a row without the key
-- offers no picker), so the client can ship before or after this migration
-- without errors.
--
-- ROLLBACK. `alter table public.goals drop column assigned_to_all;` — the
-- client goes back to offering no picker on year goals.

alter table public.goals
  add column if not exists assigned_to_all uuid[] default '{}'::uuid[];

comment on column public.goals.assigned_to_all is
  'Household member ids (family_members.id) this year goal is assigned to. Same model as tasks.assigned_to_all. Sharing is by scope, derived client-side (lib/scope.ts).';
