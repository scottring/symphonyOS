-- Guided planning Phase 3: a kept year goal records which goal it came from.
alter table public.goals add column if not exists carried_from uuid null references public.goals(id) on delete set null;
create index if not exists goals_carried_from_idx on public.goals(carried_from);
comment on column public.goals.carried_from is 'The previous year''s goal this one was kept from (guided planning, Phase 3).';
