# Discuss: one shared AI thread per task — Design + Plan

**Date:** 2026-09-02 · **Status:** Approved by Scott (chat, 2026-09-02) · **Author:** Scott + Claude

## 1. The idea

"Help me plan" becomes **Discuss**. The conversation belongs to the task or routine, not to whoever opened it. On a family item, both partners see the same thread, each message says who wrote it (Scott, Iris, Symphony), it updates live, and the assistant answers whoever asked with the whole thread and the item as context. Private items keep private threads. No new surface: this is the two-peers thesis living on the item, which is why "Between Us" could be cut.

## 2. What exists

- `chat_sessions` (migration 071): one row per conversation, `messages jsonb` array of `{role, content, timestamp, sources?}`, `entity_type`/`entity_id`, `mode`, owner-only RLS, not in the realtime publication.
- `useSymphonyAssistant` (`src/hooks/useSymphonyAssistant.ts`): holds messages in React state, streams the `symphony-agent` edge function via `src/lib/agentStream.ts`, persists every turn by rewriting the whole `messages` array (`persistTurn`), lists past sessions.
- `AssistDrawer` (`src/components/assist/AssistDrawer.tsx`) renders `ChatPanel` with that hook; opened by the `Help me plan` action in `TapContextPanel.tsx:196` and `TapRoutinePanel.tsx:121`.
- `PanelConversations` lists past sessions for the task by `entity_id`.
- `symphony-agent` is stateless: it takes the `messages` array and `taskContext` each turn. No change needed there.
- Scope is derived by `scopeForDomain` in `src/lib/scope.ts`; RLS shares on scope via `users_share_household`. Family members link to logins through `family_members.auth_user_id`.

## 3. Decisions

| Decision | Resolution |
|---|---|
| One thread per item | `mode = 'discuss'`, unique on `(entity_type, entity_id)` for that mode. Old `mode='chat'` sessions stay readable in the history dropdown. |
| Sharing | `chat_sessions.scope` derived from the item with `scopeForDomain` (family → compound; handed to the partner → couple; else individual). Household members read shared threads through the same `users_share_household` rule as tasks. Nothing writes a literal scope. |
| Authorship | Each stored message gains `author: { id: string | null; name: string; kind: 'member' | 'symphony' }`. `id` is the auth user id; `name` is the family member's name when linked, else the email local part. Symphony messages: `{ id: null, name: 'Symphony', kind: 'symphony' }`. |
| Concurrency | Appends go through an atomic RPC (`messages = messages || jsonb_build_array($msg)`), never by rewriting the array, so two people cannot clobber each other. |
| Live updates | `chat_sessions` joins the realtime publication; the drawer subscribes to its thread's row and re-reads on change. Realtime honours RLS. |
| Who is speaking | The client prefixes each member message sent to the model with `Name: ` and starts the model's view with a one-line note listing the participants. No edge-function change. |
| Privacy of the assistant's tool calls | Unchanged: the agent runs as the caller, RLS-scoped. A reply written into a shared thread is visible to the household; that is the point. |

## 4. Data (one migration, `supabase/migrations/2026-09-02_discuss_threads.sql`)

```sql
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
```

Note: a partial unique index cannot be named in `on conflict (...)` with a `where` in all Postgres versions the same way; if the deploy rejects the `on conflict ... where mode='discuss'` form, use `on conflict do nothing` after a `lock table chat_sessions in share row exclusive mode` inside the function instead. Either way, the function must never create two threads for one item.

## 5. Client

### 5.1 `src/hooks/useDiscussThread.ts` (new)

```ts
export interface DiscussEntity { type: 'task' | 'routine'; id: string; title: string; scope: 'individual' | 'couple' | 'compound' }
export interface DiscussAuthor { id: string | null; name: string; kind: 'member' | 'symphony' }
export interface DiscussMessage { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date; author: DiscussAuthor; sources?: AgentSourceNote[] }
export function useDiscussThread(entity: DiscussEntity | null, opts: { taskContext?: AssistantTaskContext; onMutate?: () => void }): {
  threadId: string | null; messages: DiscussMessage[]; loading: boolean; sending: boolean; error: string | null
  send: (content: string) => Promise<void>; participants: string[]
}
```
- On mount with an entity: `rpc('ensure_discuss_thread', { p_entity_type, p_entity_id, p_title, p_scope })` → `threadId`; then `from('chat_sessions').select('id, messages, scope, user_id').eq('id', threadId).single()` → hydrate (messages lacking `author` are legacy: treat as `{ id: null, name: 'You', kind: 'member' }` for role user, Symphony for assistant).
- Subscribe: `supabase.channel(`discuss:${threadId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${threadId}` }, () => reload())`. Unsubscribe on unmount/thread change. Also refetch on tab visibility like other hooks.
- `send(content)`: resolve the caller's author (`getAuthUser()` + `useFamilyMembers` linked member by `auth_user_id`, else email local part); `rpc('append_chat_message', { p_session, p_message: { role:'user', content, timestamp, author } })`; optimistic local add; then call the agent with the thread as history: build `messages` for `agentStream` as `[{ role:'user', content: 'Participants in this discussion: Scott, Iris. Messages are prefixed with the speaker\'s name.' }, ...thread.map(m => m.role==='user' ? { role:'user', content: `${m.author.name}: ${m.content}` } : { role:'assistant', content: m.content })]`, with `taskContext` so the agent keeps its item scope and tools; on completion append the assistant reply via the RPC with the Symphony author and `sources`; call `onMutate` if the agent wrote (mirror how `useSymphonyAssistant` detects that). Streaming text shows locally while in flight, the same way `useSymphonyAssistant` does; the persisted row is appended once at the end.
- `participants`: distinct member names seen in the thread plus the current user.

### 5.2 `ChatPanel` authorship

`ChatMessage` (in `src/components/chat/…`) gains optional `author?: DiscussAuthor`. Rendering rule: a user message by the current user renders as today (right side); a user message by another member renders on the left with `AssigneeAvatar` (member looked up by `auth_user_id`, falling back to initials from the name) and the name in small caps above the bubble; assistant messages render as today with "Symphony" as the label. No tabs, no new chrome.

### 5.3 Drawer and labels

- `AssistDrawer` becomes the Discuss drawer: uses `useDiscussThread` (not `useSymphonyAssistant`) when a `discuss` entity is given; aria-label `Discuss <title>`; the header shows the participants' avatars; the history dropdown still lists older `mode='chat'` sessions read-only (open one → shows it; sending always goes to the Discuss thread).
- `TapContextPanel.tsx:196` label `Help me plan` → `Discuss`; same in `TapRoutinePanel.tsx:121`. The panel passes the derived scope: `scopeForDomain(task.context, [task.assignedTo, ...(task.assignedToAll ?? [])], selfMemberId)` for tasks; for routines use the routine's `scope`.
- `PanelConversations` shows the Discuss thread first, titled "Discussion", then older chats.

### 5.4 Tests

- Hook: ensures the thread on mount with the derived scope; hydrates legacy messages; `send` appends via RPC with the author, calls the agent with name-prefixed history and the participants preface, appends the reply with the Symphony author; realtime UPDATE triggers a reload; no calls when `entity` is null.
- ChatPanel: partner message renders left with avatar and name; own message right; assistant labelled Symphony.
- Panel: action label is Discuss; scope passed is derived (family task → compound; personal task assigned only to self → individual).
- Migration file present; SQL is Scott's to apply (Management API is blocked for the agent).

## 6. Rollout

1. Scott applies the migration.
2. Push the client (no edge-function change). Until the migration is applied the drawer falls back: `ensure_discuss_thread` errors → the hook reports `error` and the drawer shows "Discussion isn't available yet" rather than a broken chat.
3. Verify live: open a family task on two accounts (Scott + Iris) and send from each; both see both, and Symphony answers the second speaker by name.
