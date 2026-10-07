-- The wall's scratchpad (Scott, 2026-10-07): quick notes and things to talk
-- about, jotted at the kitchen wall and later triaged to Done or to someone's
-- Inbox. Every note is household-shared — it lives on the family's wall — so
-- RLS follows the tasks policy's shared leg (users_share_household) with no
-- scope column. Resolved notes are kept (status + resolved_at), never deleted
-- by triage, so the wall's "Done this week" and any later review have history.

create table if not exists public.scratchpad_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  kind text not null default 'note' check (kind in ('note', 'talk')),
  -- Who wrote it, when someone tapped their face (kids included).
  author_member_id uuid references public.family_members(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done', 'sent')),
  -- Done: "what we decided" (optional). Sent: unused.
  resolution text,
  sent_to_member_id uuid references public.family_members(id) on delete set null,
  sent_task_id uuid references public.tasks(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scratchpad_notes_user_status_idx
  on public.scratchpad_notes (user_id, status, created_at desc);

alter table public.scratchpad_notes enable row level security;

drop policy if exists "Household reads scratchpad" on public.scratchpad_notes;
create policy "Household reads scratchpad" on public.scratchpad_notes
  for select using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Users write own scratchpad notes" on public.scratchpad_notes;
create policy "Users write own scratchpad notes" on public.scratchpad_notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Household updates scratchpad" on public.scratchpad_notes;
create policy "Household updates scratchpad" on public.scratchpad_notes
  for update using (auth.uid() = user_id or users_share_household(auth.uid(), user_id))
  with check (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop policy if exists "Household deletes scratchpad" on public.scratchpad_notes;
create policy "Household deletes scratchpad" on public.scratchpad_notes
  for delete using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));

drop trigger if exists scratchpad_notes_updated_at on public.scratchpad_notes;
create trigger scratchpad_notes_updated_at before update on public.scratchpad_notes
  for each row execute function update_updated_at_column();

do $$ begin
  alter publication supabase_realtime add table public.scratchpad_notes;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
