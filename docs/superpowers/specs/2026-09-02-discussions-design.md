# Discussions: human-first threads on items, an inbox, and unread — Design

**Date:** 2026-09-02 · **Status:** Approved by Scott (chat, 2026-09-02) · **Author:** Scott + Claude
**Builds on:** `2026-09-02-discuss-thread-design.md` (one shared `chat_sessions` row per item, `mode='discuss'`).

## 1. The idea

Today's Discuss thread is an AI chat that a partner can watch: every message
you type triggers a Symphony reply, nothing tells the other person a message
landed, and only tasks and routines have one. This turns it into a
conversation between the two peers that lives on the item, with Symphony as a
third participant who speaks only when invited, plus the two things that make
it feel like messaging: an inbox of threads with activity, and unread state.

It is deliberately not a chat app. iMessage exists. What iMessage cannot do is
hold the conversation *on the thing*, with the task's notes, links, dates and
assignee already in the room, and with Symphony one tap away. No free-floating
threads without an item (cheap to add later; same table).

## 2. Decisions

| Decision | Resolution |
|---|---|
| Posting vs asking | `post(text)` appends the message and nothing else. `ask(text)` appends the message (marked `askedSymphony: true`) and runs one agent turn whose reply is appended as Symphony. The hook's old `send` is gone. |
| How you invite Symphony | A quieter "Ask Symphony" button beside Send, or a message that starts with `@Symphony` (case-insensitive; the mention is stripped before storing). Enter = Send. Nothing is automatic. |
| Items with a thread | Task, routine, calendar event. Lists later. |
| Event thread identity | `entity_type='event'`, `entity_id` = the event's **base** id (same key `event_discussion_flags` uses), so a recurring series has one thread, not one per instance. |
| Event thread scope | `'compound'`. Events are not private in Symphony: the kitchen wall already shows them to the household and the For Discussion flag is a household list. No calendar→domain mapping exists to do better; noted as the thing to revisit when one does. |
| Task/routine scope | Unchanged: derived with `scopeForDomain` by the caller. |
| Who's in the room | Drawer header states it: "Shared with Iris" (names of household members who hold a login, excluding the viewer) when scope is couple/compound; "Only you" when individual. Nothing is picked. |
| Unread | New table `chat_session_reads (session_id, user_id, last_read_at)`. A thread is unread for you when its last message is by someone else (member with another auth id, or Symphony) and its timestamp is after your `last_read_at` (or you have no row). Marked read whenever the drawer is open in a visible tab and the message list changes. |
| Inbox | New app at `/discussions`, sidebar row "Discussions" between This Week and Library, badge = number of unread threads (messages addressed to you, not a scoreboard of work). Rows: kind icon, item title, "Iris: last message…", relative time, unread dot. Click opens the item's panel with the drawer already open (`?detail=<kind>:<id>&discuss=1`). Live via realtime on `chat_sessions`. |
| Drawer contents | New `DiscussionThread` component replaces `ChatPanel` in discuss mode. No history dropdown, no Clear, no New chat. Old `mode='chat'` sessions stay visible in the panel's Conversations section. Suggestion chips become Symphony asks. Empty state: "Talk it through with Iris, or ask Symphony." |
| Panel action | Label "Discussion", lucide `MessageCircle`, unread dot when the thread has something unread for the viewer. The sparkle stays for solo AI surfaces only. |
| Event flag chip rename | The existing wall-list flag on events is retitled "Bring up" / "On the list" so only the thread is called Discussion. |
| Notifications | None beyond the badge and inbox. Nothing in the repo sends push (web or iOS); that is its own project. |
| iOS | Out of scope; the app has no discussion code today. |
| Attachments | Text only in v1. |

## 3. Data (one migration, `supabase/migrations/2026-09-02_chat_session_reads.sql`, applied by Scott)

```sql
create table if not exists chat_session_reads (
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table chat_session_reads enable row level security;
create policy chat_session_reads_own on chat_session_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Nothing else changes server-side. `append_chat_message` already bumps
`chat_sessions.updated_at`; `chat_sessions` is already in the realtime
publication; household read is already `users_share_household` on shared scope.

Stored message shape gains one optional field: `askedSymphony?: true` on a
member message that invited Symphony.

## 4. Client

### 4.1 `useDiscussThread` (`src/hooks/useDiscussThread.ts`)
- `DiscussEntity.type` widens to `'task' | 'routine' | 'event'`.
- `send` → `post(text)` and `ask(text)`. `post` appends and reloads. `ask` appends with `askedSymphony`, streams the agent turn (unchanged `runAgentTurn` path), appends Symphony's reply, reloads.
- Returns `sharedWith: string[]` (login-holding members other than self, see §2) alongside the existing fields.
- Marks read: when `opts.markRead` is true and the tab is visible, upserts `chat_session_reads` after every messages change.

### 4.2 `src/lib/discussions/`
Pure helpers with unit tests:
- `parseComposer(text) → { kind: 'post' | 'ask', text }` — `@Symphony` prefix detection and stripping.
- `isUnread(messages, selfAuthId, lastReadAt) → boolean`.
- `sharedWithNames(members, selfAuthId, scope) → string[]`.
- `buildInboxRows(sessions, reads, selfAuthId) → InboxRow[]` — newest first, skips empty threads, derives last-message preview and unread.

### 4.3 `DiscussionThread` (`src/components/discussion/DiscussionThread.tsx`)
Header: "Discussion" · item title · shared-with line · close. Body: messages via
the existing `ChatMessage` (it already renders partner messages left with a
face); a small "asked Symphony" tag on `askedSymphony` messages. Composer:
textarea (Enter sends, Shift+Enter newline), a hint chip when `@Symphony` is
detected, buttons **Ask Symphony** (sparkle, secondary) and **Send** (primary).
Empty state with three Symphony-ask chips.

`AssistDrawer` renders `DiscussionThread` when given a `discuss` entity, and
keeps `ChatPanel` for the solo fallback. Accepts `autoOpen` no longer needed —
the panels own open state.

### 4.4 Panels
- `TapContextPanel`, `TapRoutinePanel`: action becomes "Discussion" with `MessageCircle` + unread dot (from a light `useThreadUnread(entity)` read, or from the inbox hook by entity). Accept `autoOpenDiscussion?: boolean`.
- `TapEventPanel`: new "Discussion" action + `AssistDrawer` mount with `{ type: 'event', id: baseId, title, scope: 'compound' }`; flag chip retitled.
- `TaskDetailPanel` reads `discuss=1` from the search params, passes `autoOpenDiscussion`, and strips the param once consumed.

### 4.5 Inbox app (`src/apps/discussions/`)
`index.ts` (`route: '/discussions'`), `DiscussionsApp.tsx`, `useDiscussionInbox.ts`
(select `id, entity_type, entity_id, title, messages, updated_at, scope, user_id`
where `mode='discuss'`, plus own `chat_session_reads`; realtime on
`chat_sessions` INSERT/UPDATE; `useRefreshOnVisible`). Registered in
`appRegistry`. Sidebar row + badge in `Sidebar.tsx`; the More sheet on mobile
gets the same entry.

### 4.6 Error handling
Unchanged from the existing hook: RPC failures show the "isn't available yet"
state; a failed read-mark is silent (it only affects the dot); a failed agent
turn shows the error line and leaves the member's message in the thread.

## 5. Testing
- Unit: the four pure helpers; `useDiscussThread` — `post` never calls `runAgentTurn`, `ask` does and appends Symphony's reply with `askedSymphony` on the ask; `DiscussionThread` — Send posts, Ask asks, `@Symphony …` routes to ask with the mention stripped; `TapEventPanel` shows the Discussion action; `buildInboxRows` ordering/unread.
- Live: both sides. Sign in as Scott and as a second household login; post from one, confirm the badge, inbox row, unread dot and drawer update on the other; ask Symphony from the partner side and confirm the reply lands for both.
- Gate: `npx tsc -p tsconfig.app.json --noEmit`, `npx vitest run`, then push to `main` after the migration is applied.
