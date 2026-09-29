-- Guided planning progress (decision B, 2026-09-29): where a person is in an
-- optional guided path — route, each step's period, the current step, and
-- whether it is active, paused or finished — so Resume works on any device.
-- Holds dates and step names only, never plan text.
--
-- Additive and nullable. user_profiles is already owner-only (RLS: select,
-- insert and update where auth.uid() = user_id — verified live 2026-09-29),
-- so no policy change is needed. The app falls back to this browser's
-- storage while the column is absent.
--
-- Rollback: alter table public.user_profiles drop column if exists guided_plan;
alter table public.user_profiles add column if not exists guided_plan jsonb;

comment on column public.user_profiles.guided_plan is
  'Guided planning progress (versioned JSON: route, steps, periods, current, done, status). Dates and step names only.';
