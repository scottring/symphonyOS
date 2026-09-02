-- Discuss: one shared AI thread per task/routine.
--
-- Design: docs/superpowers/specs/2026-09-02-discuss-thread-design.md (§4).
--
-- The conversation belongs to the ITEM, not to whoever opened it. On a family
-- item both partners see the same chat_sessions row, each message carries its
-- author, appends are atomic (never a whole-array rewrite), and the row joins
-- the realtime publication so the other side sees a message land live.
--
-- Scope is DERIVED client-side by scopeForDomain (src/lib/scope.ts) and passed
-- in; nothing here invents a literal.

alter table chat_sessions
  add column if not exists scope text not null default 'individual'
    check (scope in ('individual','couple','compound'));

-- One Discuss thread per item.
create unique index if not exists chat_sessions_discuss_idx
  on chat_sessions (entity_type, entity_id) where mode = 'discuss';

-- Household members read and (via the RPC) append to shared threads.
drop policy if exists chat_sessions_household_read on chat_sessions;
create policy chat_sessions_household_read on chat_sessions for select
  using (scope in ('couple','compound') and users_share_household(auth.uid(), user_id));

-- Find-or-create the item's Discuss thread. Caller must own the entity's
-- visibility already (they can only see the task through RLS); the thread's
-- scope is passed in by the client after deriving it with scopeForDomain.
create or replace function ensure_discuss_thread(
  p_entity_type text, p_entity_id text, p_title text, p_scope text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_scope not in ('individual','couple','compound') then raise exception 'bad scope'; end if;
  select id into v_id from chat_sessions
   where mode = 'discuss' and entity_type = p_entity_type and entity_id = p_entity_id
   limit 1;
  if v_id is not null then
    -- The caller must be allowed to see it.
    if not exists (select 1 from chat_sessions s where s.id = v_id
                   and (s.user_id = auth.uid() or (s.scope in ('couple','compound') and users_share_household(auth.uid(), s.user_id)))) then
      raise exception 'not a participant';
    end if;
    return v_id;
  end if;
  insert into chat_sessions (user_id, title, entity_type, entity_id, mode, messages, scope)
  values (auth.uid(), p_title, p_entity_type, p_entity_id, 'discuss', '[]'::jsonb, p_scope)
  on conflict (entity_type, entity_id) where mode = 'discuss' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from chat_sessions where mode='discuss' and entity_type=p_entity_type and entity_id=p_entity_id;
  end if;
  return v_id;
end $$;

-- Atomic append. Owner or household member on a shared thread.
create or replace function append_chat_message(p_session uuid, p_message jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from chat_sessions s where s.id = p_session
                 and (s.user_id = auth.uid() or (s.scope in ('couple','compound') and users_share_household(auth.uid(), s.user_id)))) then
    raise exception 'not a participant';
  end if;
  update chat_sessions
     set messages = coalesce(messages, '[]'::jsonb) || jsonb_build_array(p_message),
         updated_at = now()
   where id = p_session;
end $$;

revoke all on function ensure_discuss_thread(text,text,text,text) from public;
revoke all on function append_chat_message(uuid,jsonb) from public;
grant execute on function ensure_discuss_thread(text,text,text,text) to authenticated;
grant execute on function append_chat_message(uuid,jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_sessions') then
    alter publication supabase_realtime add table chat_sessions;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FALLBACK, only if the `on conflict (...) where mode = 'discuss'` arbiter above
-- is rejected by this Postgres version. Re-run ensure_discuss_thread with the
-- insert replaced by a serialised one — the lock is held for the RPC's own
-- transaction (microseconds) and guarantees the same invariant: never two
-- threads for one item.
--
--   lock table chat_sessions in share row exclusive mode;
--   select id into v_id from chat_sessions
--    where mode = 'discuss' and entity_type = p_entity_type and entity_id = p_entity_id
--    limit 1;
--   if v_id is not null then return v_id; end if;
--   insert into chat_sessions (user_id, title, entity_type, entity_id, mode, messages, scope)
--   values (auth.uid(), p_title, p_entity_type, p_entity_id, 'discuss', '[]'::jsonb, p_scope)
--   returning id into v_id;
--   return v_id;
