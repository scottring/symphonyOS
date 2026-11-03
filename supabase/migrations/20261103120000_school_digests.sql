-- The daily school digest, kept (Scott, 2026-11-03: "I keep losing the daily
-- school digest and can't find the information").
--
-- The 5pm digest was only an email. A copy used to reach Symphony when the
-- household inbound address was on DIGEST_TO (captures, source 'School
-- digest'), but none has arrived since 2026-09-11, and a capture is raw email
-- text anyway. school-digest now writes each digest it sends here, as the
-- sections it rendered, and More → School digest (web, phone, kitchen wall)
-- reads them back.
--
-- Who reads: the adults who may review school mail (school_mail_can_review:
-- not a child's login, not anonymous) and the household's kitchen wall. A
-- kid's tablet is a display with a family member; it does not.
-- Who writes: only school-digest, with the service role. No write policies.
create table if not exists public.school_digests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- The parent whose Gmail sent it (and whose transcripts these were).
  user_id uuid references auth.users(id) on delete set null,
  -- The household's calendar day it was written for, and the label the email used ("Tue, Nov 3").
  digest_date date not null,
  date_label text not null,
  -- DigestSection[] (supabase/functions/school-digest/lib/digest.ts).
  sections jsonb not null default '[]'::jsonb,
  to_do_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists school_digests_household_created_idx
  on public.school_digests (household_id, created_at desc);

-- An adult who may review school mail, or the household's kitchen wall.
create or replace function public.school_digest_can_read(p_household uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.school_mail_can_review(p_household)
    or exists (select 1 from public.household_displays d
               join public.household_members hm on hm.user_id = d.user_id and hm.household_id = d.household_id
               where d.user_id = auth.uid() and d.household_id = p_household
                 and d.revoked_at is null and d.family_member_id is null
                 and hm.role = 'display' and hm.status = 'active')
$$;
revoke all on function public.school_digest_can_read(uuid) from public;
grant execute on function public.school_digest_can_read(uuid) to authenticated, service_role;

alter table public.school_digests enable row level security;
revoke all on public.school_digests from anon, authenticated;
grant select on public.school_digests to authenticated;

drop policy if exists school_digests_read on public.school_digests;
create policy school_digests_read on public.school_digests
  for select to authenticated using (public.school_digest_can_read(household_id));

notify pgrst, 'reload schema';
