# Discussions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the per-item Discuss thread into a human-first conversation between household members with Symphony invited explicitly, add a Discussions inbox with unread state, and extend threads to calendar events.

**Architecture:** The `chat_sessions` row per item (`mode='discuss'`) and its RPCs stay exactly as they are. The hook splits `send` into `post` (append only) and `ask` (append + one agent turn). A new `chat_session_reads` table carries per-person last-read stamps; four pure helpers in `src/lib/discussions/` derive unread, shared-with names, composer routing, and inbox rows. A new `DiscussionThread` component replaces `ChatPanel` inside `AssistDrawer` in discuss mode; a new `discussions` app lists threads; the sidebar gets a row with an unread badge.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase (RPC, realtime on `chat_sessions`), Tailwind v4 Nordic Journal, lucide icons via `ConceptIcon`.

**Spec:** `docs/superpowers/specs/2026-09-02-discussions-design.md`

## Global Constraints

- Scope is always derived (`scopeForDomain`) or the literal `'compound'` for events; never from a picker.
- Nothing invokes the agent unless the member pressed Ask Symphony or wrote `@Symphony`.
- No emoji; lucide icons through `ConceptIcon` (`discussion` = MessageCircle, `ai` = sparkle).
- Badge counts are unread *threads*, never counts of work.
- Node 22.14.0; run tests with `npx vitest run <file>`; type-check with `npx tsc -p tsconfig.app.json --noEmit`.
- Work happens in `.worktrees/discussions` on branch `discussions`; push to `main` only after the migration is applied and everything is green.

---

### Task 1: Migration + pure helpers

**Files:**
- Create: `supabase/migrations/2026-09-02_chat_session_reads.sql`
- Create: `src/lib/discussions/composer.ts`, `src/lib/discussions/unread.ts`, `src/lib/discussions/sharedWith.ts`, `src/lib/discussions/inbox.ts`
- Test: `src/lib/discussions/composer.test.ts`, `unread.test.ts`, `sharedWith.test.ts`, `inbox.test.ts`

**Interfaces (Produces):**
```ts
// composer.ts
export type ComposerIntent = { kind: 'post' | 'ask'; text: string }
export function parseComposer(raw: string): ComposerIntent   // '@Symphony plan this' → { kind:'ask', text:'plan this' }
export function mentionsSymphony(raw: string): boolean       // live hint for the composer

// unread.ts
export interface ReadableMessage { timestamp: Date; author: { id: string | null; kind: 'member' | 'symphony' } }
export function isUnread(messages: ReadableMessage[], selfAuthId: string | null, lastReadAt: Date | null): boolean

// sharedWith.ts
export interface SharedWithMember { name: string; auth_user_id?: string | null; user_id?: string | null; is_full_user?: boolean }
export function sharedWithNames(members: SharedWithMember[], selfAuthId: string | null, scope: 'individual'|'couple'|'compound'): string[]
export function sharedWithLabel(names: string[], scope): string   // 'Only you' | 'Shared with Iris' | 'Shared with Iris and Nana'

// inbox.ts
export interface InboxSession { id; entity_type; entity_id; title; messages: unknown; updated_at: string; scope }
export interface InboxRow { sessionId; entityType: 'task'|'routine'|'event'; entityId; title; lastAuthor: string; lastText: string; lastAt: Date; unread: boolean }
export function buildInboxRows(sessions: InboxSession[], reads: Record<string, string>, selfAuthId: string | null): InboxRow[]
```

- [ ] Write the migration exactly as in spec §3.
- [ ] Write failing tests: `parseComposer('@symphony  what next?')` → ask/'what next?'; plain text → post; `isUnread` false when last message is mine, true when partner's message is after lastReadAt, true when Symphony's message and no read row, false when empty; `sharedWithNames` excludes self (matched by `auth_user_id`, or `user_id` when the row has no `auth_user_id`), includes only login-holding members (`auth_user_id` set or `is_full_user`), returns `[]` for individual; `buildInboxRows` skips empty threads, orders by `updated_at` desc, previews the last message with author name, marks unread using reads map.
- [ ] Implement, run `npx vitest run src/lib/discussions`, commit `feat(discussions): reads migration + pure helpers`.

### Task 2: Hook — post/ask split, events, sharedWith, mark-read

**Files:**
- Modify: `src/hooks/useDiscussThread.ts`
- Test: `src/hooks/useDiscussThread.test.ts` (extend; the supabase mock already records `rpcCalls`)

**Interfaces (Produces):**
```ts
export interface DiscussEntity { type: 'task' | 'routine' | 'event'; id: string; title: string; scope: Scope }
export interface DiscussMessage { …; askedSymphony?: true }
export interface UseDiscussThreadOptions { taskContext?; onMutate?; markRead?: boolean }
return { threadId, messages, loading, sending, error, toolActivity, post, ask, participants, sharedWith, reload, selfAuthId }
```

- [ ] Tests: `post('hi')` appends one `append_chat_message` call with `author` and no `askedSymphony`, and `runAgentTurn` (mock `@/lib/agentTurn`) is never called; `ask('plan')` appends a user message with `askedSymphony: true`, calls `runAgentTurn` once, then appends Symphony's reply; `sharedWith` lists the partner from `db.members` for scope `compound` and is `[]` for `individual`; with `markRead: true` an upsert to `chat_session_reads` happens after messages load (extend the `from` mock to record `upsert` calls for that table).
- [ ] Implement: hydrate `askedSymphony`; split `send`; `sharedWith = sharedWithNames(members, selfAuthId, entityScope)`; mark-read effect (`document.visibilityState === 'visible'`, `supabase.from('chat_session_reads').upsert({ session_id, user_id: selfAuthId, last_read_at: now })`, keyed on `messages.length`).
- [ ] Update `AssistDrawer` call site (`thread.send` → `thread.post`) so tsc stays green; run the hook tests; commit `feat(discussions): post/ask split, event entity, sharedWith, mark-read`.

### Task 3: `DiscussionThread` component + drawer switch

**Files:**
- Create: `src/components/discussion/DiscussionThread.tsx`, `src/components/discussion/DiscussionComposer.tsx`
- Modify: `src/components/assist/AssistDrawer.tsx` (discuss mode renders `DiscussionThread`; solo keeps `ChatPanel`), `src/types/chat.ts` (`askedSymphony?: true` on `ChatMessage`), `src/components/chat/ChatMessage.tsx` (small "asked Symphony" tag)
- Test: `src/components/discussion/DiscussionThread.test.tsx`, adjust `src/components/assist/AssistDrawer.test.tsx`

**Interfaces:**
```ts
interface DiscussionThreadProps {
  title: string; sharedWithLabel: string
  messages: ChatMessage[]; loading: boolean; sending: boolean; error: string | null; toolActivity: string[]
  currentUserId: string | null; familyMembers: FamilyMember[]
  suggestions: string[]                 // rendered as Symphony asks
  onPost: (text: string) => void; onAsk: (text: string) => void; onClose: () => void
}
```

- [ ] Tests: header shows title + shared-with label; typing "hi" + Enter calls `onPost('hi')`; clicking "Ask Symphony" with text calls `onAsk`; typing `@Symphony plan` + Enter calls `onAsk('plan')` and never `onPost`; the hint chip appears when `@Symphony` is typed; empty state text present; suggestion chip click calls `onAsk`.
- [ ] Implement composer: textarea (auto-grow 2–6 lines), Enter sends / Shift+Enter newline, buttons `Ask Symphony` (`ConceptIcon name="ai"`, `ACTION_CHIP`-style secondary) and `Send` (`btn-primary` small). Thread body reuses `ChatMessage` with `currentUserId`/`familyMembers`; Symphony messages already render left with the assistant styling. Typing indicator only while `sending`.
- [ ] AssistDrawer: when `discuss` is set render `DiscussionThread`; drop history/clear/new-chat wiring for that branch; `useSymphonyAssistant` stays mounted only for the solo branch (guard with `discuss ? undefined : …` where the hook must still be called unconditionally — keep the call, ignore its output).
- [ ] Run the two test files; commit `feat(discussions): DiscussionThread + composer; drawer switches in discuss mode`.

### Task 4: Panels — Discussion action, unread dot, events, auto-open

**Files:**
- Modify: `src/components/surface/sections/PanelActions.tsx` (`dot?: boolean` → small primary dot after the label), `src/components/surface/TapContextPanel.tsx`, `src/components/surface/TapRoutinePanel.tsx`, `src/components/surface/TapEventPanel.tsx`, `src/apps/tasks/TaskDetailPanel.tsx`
- Create: `src/hooks/useThreadUnread.ts` — `useThreadUnread(entityType, entityId): boolean` (one select on `chat_sessions` by entity + own read row; realtime UPDATE on that row; `useRefreshOnVisible`)
- Test: `src/components/surface/TapContextPanel.discuss.test.tsx` (label now "Discussion"), `src/components/surface/TapEventPanel.test.tsx` (new Discussion action opens the drawer; flag chip reads "Bring up" / "On the list"), `src/hooks/useThreadUnread.test.ts`

- [ ] TapContextPanel: action `{ id:'assist', label:'Discussion', icon:'discussion', dot: unread }`; prop `autoOpenDiscussion?: boolean` → `useState(props.autoOpenDiscussion ?? false)` plus an effect that opens when it flips true.
- [ ] TapRoutinePanel: same label/icon/dot; same prop.
- [ ] TapEventPanel: new props `onOpenDiscussion?` is NOT needed — the panel owns the drawer like the task panel: add `assistOpen` state, a `Discussion` action, and mount `AssistDrawer` with `item={{ id: eventId, title, notes: null }}` and `discuss={{ type:'event', id: getRecurringBaseId(eventId), title, scope:'compound' }}`. Requires `eventId` and `onAssistMutate?: () => void` props (TaskDetailPanel passes `refetch`). Rename flag chip labels to `'Bring up'` / `'On the list'`.
- [ ] TaskDetailPanel: `const autoDiscuss = searchParams.get('discuss') === '1'`; pass `autoOpenDiscussion={autoDiscuss}` to the three panels; after first render with it true, `setSearchParams(prev => { prev.delete('discuss'); return prev }, { replace: true })`.
- [ ] Run the panel tests + `tsc`; commit `feat(discussions): Discussion action with unread dot; event threads; deep-link auto-open`.

### Task 5: Inbox app + sidebar row + badge

**Files:**
- Create: `src/apps/discussions/index.ts`, `src/apps/discussions/DiscussionsApp.tsx`, `src/hooks/useDiscussionInbox.ts`
- Modify: `src/shell/appRegistry.ts` (register), `src/components/layout/Sidebar.tsx` (row after This Week; `MessageCircle` from lucide; badge like Inbox), `src/components/layout/MoreSheet.tsx` (entry), `src/shell/ShellLayout.tsx` (pass `discussionsUnread` to Sidebar)
- Test: `src/hooks/useDiscussionInbox.test.ts`, `src/apps/discussions/DiscussionsApp.test.tsx`, extend `src/components/layout/Sidebar.test.tsx`

**Interfaces:**
```ts
export function useDiscussionInbox(): { rows: InboxRow[]; unreadCount: number; loading: boolean; reload: () => void }
```
Selects `id, entity_type, entity_id, title, messages, updated_at, scope` from `chat_sessions` where `mode='discuss'` order `updated_at desc` limit 200, and `session_id, last_read_at` from `chat_session_reads`; realtime channel `discussions-inbox` on `chat_sessions` INSERT/UPDATE → reload; `useRefreshOnVisible`.

- [ ] Tests: hook returns rows via `buildInboxRows` and `unreadCount`; page renders rows ("Iris: …", title, unread dot), empty state "Nothing to talk about yet", click navigates to `/today?detail=task:<id>&discuss=1` (`routine:`/`event:` for the others); Sidebar shows "Discussions" with the badge when `discussionsUnread > 0` and none when 0.
- [ ] Implement page in the Nordic Journal style: masthead `font-display` "Discussions", list rows `px-3 py-3 border-b border-neutral-200/60`, kind icon via `ConceptIcon` (`task`/`routine`/`calendar` names — check `conceptIcons.tsx` for exact keys), unread dot `w-2 h-2 rounded-full bg-primary-500`, relative time via the existing date helper used on Notes (`formatRelative` or equivalent in `src/lib/`).
- [ ] Run tests + `tsc`; commit `feat(discussions): inbox page, sidebar row with unread badge`.

### Task 6: Verify and ship

- [ ] `npx tsc -p tsconfig.app.json --noEmit` clean; `npx vitest run` green (note any pre-existing red that is a wall-clock date).
- [ ] Hand the migration to Scott to apply (classifier blocks DDL from here). Until applied, the thread still works; only the unread dot/badge stay off.
- [ ] Live: dev server from the worktree; as Scott open a family task → Discussion → post; second login (Iris or the demo household member) sees badge, inbox row, unread dot, drawer content; partner asks Symphony; reply visible on both sides. Screenshots to the vault, not /tmp.
- [ ] `git fetch && git rebase origin/main`, `git push origin HEAD:main`; confirm the deploy with `gh api` per memory; remove the worktree.
- [ ] Update memory `discuss_thread_shipped.md` → point at this spec and record `post/ask`, `chat_session_reads`, the inbox route.
