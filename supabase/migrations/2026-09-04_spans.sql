-- Spans: a planning container with explicit start and end dates.
--
-- The week is the household's default planning unit, but real life has units
-- the calendar grid can't express — a three-day weekend, a school break, the
-- four days around a trip. Those straddle a week boundary, so planning them
-- "in the week of the 7th" both splits them and buries them.
--
-- A span is the same shape as a week placement, generalised: bucket says WHICH
-- horizon a task is on, and a stamp says WHICH one of that horizon. Week
-- placement stamps `week_start`; a span stamps `span_id`. Nothing else about
-- the placement cascade changes.
--
-- A task belongs to a span OR a week, never both — the span owns the placement,
-- while the days inside it still render normally on Today and the week grid.
-- Two containers claiming one day is what makes pools disagree.

create table if not exists public.spans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  context text check (context is null or context in ('work', 'family', 'personal')),
  -- DERIVED from context + assignment by scopeForDomain, never chosen. RLS
  -- reads this column and nothing else, so a family span left at the default
  -- is invisible to the rest of the household.
  scope text not null default 'individual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spans_end_on_or_after_start check (end_date >= start_date)
);

create index if not exists spans_user_dates_idx on public.spans (user_id, start_date, end_date);

alter table public.spans enable row level security;

-- Mirrors public.tasks' OWN policies verbatim. A container that is readable to
-- fewer people than the tasks inside it shows an empty pool; one readable to
-- more leaks a private plan's name.
drop policy if exists "Users can view spans" on public.spans;
create policy "Users can view spans" on public.spans for select
  using (
    auth.uid() = user_id
    or (scope = any (array['couple', 'compound']) and users_share_household(auth.uid(), user_id))
  );

drop policy if exists "Users can create own spans" on public.spans;
create policy "Users can create own spans" on public.spans for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update spans" on public.spans;
create policy "Users can update spans" on public.spans for update
  using (
    auth.uid() = user_id
    or (scope = any (array['couple', 'compound']) and users_share_household(auth.uid(), user_id))
  );

drop policy if exists "Users can delete spans" on public.spans;
create policy "Users can delete spans" on public.spans for delete
  using (
    auth.uid() = user_id
    or (scope = any (array['couple', 'compound']) and users_share_household(auth.uid(), user_id))
  );

-- The placement stamp, mirroring tasks.week_start. ON DELETE SET NULL so
-- deleting a span never deletes the work planned into it — those tasks fall
-- back to the inbox rather than vanishing.
alter table public.tasks add column if not exists span_id uuid references public.spans(id) on delete set null;
create index if not exists tasks_span_idx on public.tasks (span_id) where span_id is not null;

comment on table public.spans is
  'A planning container with explicit start/end dates (a long weekend, a school break). Tasks join it via tasks.span_id with bucket = ''span''.';
