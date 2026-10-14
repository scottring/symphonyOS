-- Discussions v2: a discussion is WITH someone, and it can be settled.
--
-- Scott, 2026-10-14: "I just added a discussion about an item which I intended
-- to be sent to Iris … it's not at all clear who I'm chatting with", and
-- nothing told anyone. Mockup approved the same day ("Talking with Iris").
--
-- - with_user_ids: the people (auth ids) this discussion is with. Choosing
--   someone on a private item opens the THREAD to the household pair
--   (scope 'couple'), never the item: they see the conversation and its
--   title, not the task.
-- - settled_at / settled_by / outcome: "Mark settled". Any new message
--   reopens it.
-- - Read stamps of the people in a shared thread are visible to each other,
--   for "Iris saw this".
-- - A task's needs_discussion flag follows the discussion (on when it starts,
--   off when it is settled), so Today's "To talk about" line and the wall,
--   which read the flag, show it without knowing about threads.

alter table chat_sessions
  add column if not exists with_user_ids uuid[] not null default '{}',
  add column if not exists settled_at timestamptz,
  add column if not exists settled_by uuid references auth.users(id) on delete set null,
  add column if not exists outcome text;

-- The participant rule every RPC below repeats: the owner, or a household
-- member on a shared thread.
create or replace function is_discuss_participant(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_sessions s
     where s.id = p_session
       and (s.user_id = auth.uid()
            or (s.scope in ('couple','compound') and users_share_household(auth.uid(), s.user_id)))
  )
$$;

-- Keep the task's "to talk about" flag in step with its discussion.
create or replace function sync_discussion_flag(p_session uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_type text; v_id text;
begin
  select entity_type, entity_id into v_type, v_id from chat_sessions where id = p_session;
  if v_type = 'task' and v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update tasks set needs_discussion = p_on where id = v_id::uuid and needs_discussion is distinct from p_on;
  end if;
end $$;
revoke all on function sync_discussion_flag(uuid, boolean) from public;

-- Who this discussion is with. Empty = just you (and Symphony when asked).
create or replace function set_discussion_with(p_session uuid, p_with uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_other uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_discuss_participant(p_session) then raise exception 'not a participant'; end if;
  foreach v_other in array coalesce(p_with, '{}') loop
    if v_other = auth.uid() or not users_share_household(auth.uid(), v_other) then
      raise exception 'not someone in your household';
    end if;
  end loop;
  update chat_sessions
     set with_user_ids = coalesce(p_with, '{}'),
         -- Talking with someone opens the thread to the household pair; a
         -- family item's thread is already the household's.
         scope = case when coalesce(array_length(p_with, 1), 0) > 0 and scope = 'individual' then 'couple' else scope end
   where id = p_session;
  if coalesce(array_length(p_with, 1), 0) > 0 then perform sync_discussion_flag(p_session, true); end if;
end $$;

-- Mark settled (with an optional one-line outcome), or reopen.
create or replace function settle_discussion(p_session uuid, p_outcome text default null, p_settled boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_discuss_participant(p_session) then raise exception 'not a participant'; end if;
  update chat_sessions
     set settled_at = case when p_settled then now() else null end,
         settled_by = case when p_settled then auth.uid() else null end,
         outcome = case when p_settled then nullif(trim(coalesce(p_outcome, '')), '') else null end,
         updated_at = now()
   where id = p_session;
  perform sync_discussion_flag(p_session, not p_settled);
end $$;

-- Atomic append, as before, and a new message reopens a settled discussion.
create or replace function append_chat_message(p_session uuid, p_message jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_discuss_participant(p_session) then raise exception 'not a participant'; end if;
  update chat_sessions
     set messages = coalesce(messages, '[]'::jsonb) || jsonb_build_array(p_message),
         settled_at = null, settled_by = null, outcome = null,
         updated_at = now()
   where id = p_session;
end $$;

revoke all on function is_discuss_participant(uuid) from public;
revoke all on function set_discussion_with(uuid, uuid[]) from public;
revoke all on function settle_discussion(uuid, text, boolean) from public;
revoke all on function append_chat_message(uuid, jsonb) from public;
grant execute on function is_discuss_participant(uuid) to authenticated;
grant execute on function set_discussion_with(uuid, uuid[]) to authenticated;
grant execute on function settle_discussion(uuid, text, boolean) to authenticated;
grant execute on function append_chat_message(uuid, jsonb) to authenticated;

-- "Iris saw this": the people in a shared thread can read each other's stamp.
-- Writing stays own-rows only (chat_session_reads_own).
drop policy if exists chat_session_reads_participants on chat_session_reads;
create policy chat_session_reads_participants on chat_session_reads
  for select
  using (exists (
    select 1 from chat_sessions s
     where s.id = chat_session_reads.session_id
       and s.scope in ('couple','compound')
       and users_share_household(auth.uid(), s.user_id)
  ));

-- Read stamps change who has seen what; let the other side hear it live.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_session_reads') then
    alter publication supabase_realtime add table chat_session_reads;
  end if;
end $$;

-- Backfill. Shared threads nobody has touched in two weeks are settled as they
-- stand, so a September test line doesn't arrive as "waiting on you". An open
-- shared task thread where a person wrote to the people (not only asked
-- Symphony) puts its task on the "to talk about" list, as a new one would.
update chat_sessions
   set settled_at = updated_at
 where mode = 'discuss' and settled_at is null and with_user_ids = '{}'
   and scope in ('couple','compound') and updated_at < now() - interval '14 days';

update tasks t
   set needs_discussion = true
  from chat_sessions s
 where s.mode = 'discuss' and s.entity_type = 'task' and s.entity_id = t.id::text
   and s.scope in ('couple','compound') and s.settled_at is null
   and t.completed = false and t.needs_discussion = false
   and exists (select 1 from jsonb_array_elements(coalesce(s.messages, '[]'::jsonb)) m
                where m->>'role' = 'user' and coalesce((m->>'askedSymphony')::boolean, false) = false
                  and length(trim(coalesce(m->>'content', ''))) > 0);
