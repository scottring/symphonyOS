# Symphony Assistant — Fenced-Michael (Symphony-scoped agent)

**Date:** 2026-06-03
**Status:** Design approved; pending written-spec review
**Repos touched:** `open-brain-ui` (engine) + `symphonyOS` (app)
**Supersedes direction of:** `2026-06-01-assistant-pane-design.md` (which pointed the pane at *full* Michael). This narrows that to a *fenced, Symphony-only* agent and reuses ~90% of that branch's plumbing.

## Problem

The right-rail assistant in Symphony is wired to the weak path: `ChatPanel` → `useChat` → the `symphony-chat` edge function (Haiku, retrieval-only, **read-only**, costs API tokens). It can talk about your tasks but can't *do* anything.

The powerful path — "Michael" (`useAgentChat` → Open Brain Agent SDK, Opus 4.8 on Scott's Max subscription, $0/token, fully agentic) — has the *whole life surface* as its toolset: vault read/write, Gmail, Calendar, Granola, plus `symphony_*`. Pointing the Symphony pane at full Michael re-blurs the vault/Symphony boundary we just deliberately drew (the notes-viewer removal).

We want **a really smart assistant FOR Symphony**: keep the intelligence and agency, but scope its tools and knowledge to Symphony's domain (tasks, projects, routines, contacts, calendar) — nothing else.

## Decision summary

- **Engine: fenced-Michael.** Run on the Open Brain Agent SDK (Opus 4.8, **$0 on the Max sub**) as a *restricted* agent, not as a new paid edge-function agent. The paid, multi-user edge-function version is a deliberate *future* path, flipped on when there are beta users to justify the spend.
- **Scope: Symphony-only, agentic.** It can take actions, but only within Symphony's domain. No vault, no Gmail, no general-life reach.
- **v1 is safe-only.** Only non-destructive tools are reachable; destructive/bulk ops + live confirm-cards are phase 2.

## Architecture

```
ChatPanel (right rail)
  └─ useAgentChat (Symphony channel)        [symphonyOS]
       └─ streamAgentChat() / agentStream.ts (SSE client)
            └─ POST /functions/v1/agent-proxy  (Supabase edge fn: JWT gate, holds engine key)
                 └─ POST /api/symphony-agent/stream  (Open Brain)   [open-brain-ui]
                      └─ runAgentStream(message, { scope: 'symphony', sessionId })
                           └─ Agent SDK query() — Opus 4.8, FENCED toolset
                                └─ symphony_* MCP + Google Calendar (read)
```

Two clean halves: the **engine** gains a fenced scope; the **app** reuses the `assistant-pane` branch's transport/UI, retargeted at the Symphony channel.

### Part A — Engine: the Symphony scope (`open-brain-ui`)

In `server/lib/agent.ts`, add a Symphony-scoped configuration alongside Michael. Implementation shape: a `scope: 'michael' | 'symphony'` parameter (default `'michael'`) threaded into `runAgent`/`runAgentStream`, selecting the options below.

**Fenced SDK options for `scope: 'symphony'`:**

```ts
const options = {
  model: AGENT_MODEL,                 // 'claude-opus-4-8' — same, free on Max sub
  systemPrompt: SYMPHONY_SYSTEM_PROMPT,
  settingSources: ['project', 'user'], // still the source of MCP defs...
  allowedTools: SYMPHONY_ALLOWED_TOOLS, // ...but ONLY these are reachable
  disallowedTools: SYMPHONY_DENIED_TOOLS, // belt-and-suspenders
  cwd: NEUTRAL_DIR,                     // NOT the vault — e.g. a tmp/empty dir
  permissionMode: 'bypassPermissions',  // safe here: the allowlist contains nothing destructive
  ...(sessionId ? { resume: sessionId } : {}),
}
```

`permissionMode: 'bypassPermissions'` is acceptable for this scope *specifically because* `allowedTools` exposes only safe operations — there is nothing dangerous to gate. (When destructive tools arrive in phase 2, this changes to a `canUseTool` confirm flow.)

**`SYMPHONY_ALLOWED_TOOLS` (v1 — safe-only):**
- `symphony_list_tasks`
- `symphony_create_task`
- `symphony_update_task`
- `symphony_complete_task`
- `symphony_create_project`
- `symphony_list_projects`
- `symphony_list_contacts`
- `symphony_list_household_members`
- Google Calendar **read** tools (`list_events`, `get_event`)

Explicitly **not** included in v1: `symphony_delete_task`, any bulk operation, Google Calendar *writes*.

**`SYMPHONY_DENIED_TOOLS` (defense-in-depth):** `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, all `Gmail` tools, all `granola` tools, any vault/filesystem MCP. (Whitelist already excludes them; the denylist is a second wall in case `settingSources` surfaces a new tool later.)

**`SYMPHONY_SYSTEM_PROMPT` (new constant):** A concise prompt establishing the assistant as *Symphony's* assistant — manages tasks/projects/routines/contacts/calendar via the `symphony_*` tools. Encodes the domain model: the work/family/personal context axis; `contact_id` (who a task is *about*) vs `assigned_to` (who should *do* it); inbox = `scheduled_for = null`. **No** chief-of-staff persona, **no** vault conventions, **no** Gmail/general-life framing. Action-oriented, no em-dashes/clichés (matching house voice).

### Part B — Endpoints & session isolation (`open-brain-ui`, `server/routes/`)

- New routes: `POST /api/symphony-agent/stream`, `POST /api/symphony-agent/reset`, `GET /api/symphony-agent/history`. These call the engine with `scope: 'symphony'`. (Thin wrappers over the existing `agent-chat` route logic.)
- **Channel isolation:** the Symphony pane uses a distinct channel prefix (`symphony:web`, vs Michael's `web:default` / Telegram's `tg:*`). Because sessions are keyed by `channel_id` in SQLite, the Symphony assistant's conversation/session memory is **fully separate** from Michael's and Telegram's. The two assistants never share context.

### Part C — Symphony app (`symphonyOS`) — adapt the `assistant-pane` branch

The `assistant-pane` branch already built the transport and UI. Bring those pieces onto this branch and retarget them:

- **`supabase/functions/agent-proxy/`** — reuse. JWT-verifies the caller, holds the engine key server-side, SSE-passthrough. Point its forward URL at `/api/symphony-agent/stream` (via env/config).
- **`src/lib/agentStream.ts`** (`parseSSEChunk` + `streamAgentChat`) — reuse as-is. Engine emits the same `AgentStreamEvent` contract.
- **`src/hooks/useAgentChat.ts`** — reuse logic; set the channel to `symphony:web`. (May rename to `useSymphonyAssistant` for clarity; not required.)
- **`ChatPanel` tool-activity line + `AppShell` passthrough + `App.tsx` repointing** (`chat.*` → `agent.*`) — reuse. Session list stays hidden (`chatSessions=[]`); session reconciliation remains deferred.

### Streaming protocol (unchanged from the branch)

```ts
type AgentStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; reply: string; sessionId: string | null }
  | { type: 'error'; message: string }
```
SSE, one JSON event per `data:` frame. The pane appends `text`, shows the latest `tool` name ("creating task…"), and finalizes on `done`.

## Retirement (after cutover)

Once the fenced pane is verified working, **delete `src/hooks/useChat.ts` and `supabase/functions/symphony-chat/`** plus their wiring, so Symphony has exactly one assistant backend. The Haiku path is kept only as a fallback *through* cutover, then removed in the same PR series.

## Data flow (happy path)

1. User types in the rail → `useAgentChat.sendMessage(text)`.
2. `streamAgentChat` POSTs `{ message, channelId: 'symphony:web' }` to `agent-proxy` with the Supabase JWT.
3. `agent-proxy` verifies the JWT, adds the engine key, forwards to `/api/symphony-agent/stream`.
4. Engine runs `runAgentStream(message, { scope: 'symphony', sessionId })`; the fenced Opus agent reasons and calls only `symphony_*`/calendar-read tools.
5. SSE events stream back: `session`, then interleaved `text`/`tool`, then `done`.
6. The pane renders streaming text + the live tool line; on `done` it persists the final reply and engine `sessionId` for that channel.

## Error handling

- **Engine offline / tunnel down:** `agent-proxy` returns 502 → pane shows an "assistant offline" state (already built on the branch). No crash, no half-written actions.
- **SSE drop mid-stream:** mark the in-flight assistant message interrupted; user can retry.
- **Auth failure (no/expired JWT):** `agent-proxy` 401 → pane prompts re-auth.
- **Tool error inside the loop** (e.g. Supabase write fails): the agent receives the tool error and reports it in prose; nothing is silently dropped.
- **A tool outside the whitelist is somehow requested:** SDK refuses it (allowlist) — and the engine unit test guarantees the whitelist never includes a non-Symphony tool.

## Testing

- **Engine (security-critical):** a unit test asserting the Symphony scope's effective tool set is a subset of `SYMPHONY_ALLOWED_TOOLS` and contains **none** of: filesystem tools, Gmail, Granola, vault MCP, `symphony_delete_task`. This is the test that enforces the fence.
- **Engine:** a smoke test that `scope: 'symphony'` selects `SYMPHONY_SYSTEM_PROMPT` and the neutral `cwd`.
- **Symphony app:** reuse the branch's `agentStream.test.ts` (frame parsing) and `useAgentChat.test.ts` (streamed text → message, tool activity, error), retargeted to the Symphony channel.
- **Manual acceptance:** "what should I focus on today?" streams a grounded answer; "add a task to call the plumber tomorrow, family context" creates the task (visible in Today) and the agent confirms; "what's on my calendar today?" reads calendar; the assistant cannot read a vault file or send an email if asked (it declines, in-scope).

## Out of scope (future)

- **Destructive/bulk ops + live confirm-cards** (delete, batch reschedule) via a `canUseTool` pause-and-confirm flow. (Phase 2.)
- **Calendar writes** (create/move events). (Phase 2.)
- **Multi-user / paid edge-function engine** — the rail can't run on Scott's personal Max sub for other users. Flip to the API-keyed edge-function agent when beta users exist.
- **Session reconciliation** — auto-save + visible session list for the rail (deferred on the original branch; stays deferred).
- **Proactive/background runs + action queue** — separate spec.

## Risks

- **Single point of failure:** the Mac Mini + Cloudflare tunnel must be up. Mitigated by graceful "offline" degradation; not eliminated.
- **Single-user by construction:** acceptable and intended for now; the multi-user path is named above.
- **Calendar MCP availability:** the claude.ai Google Calendar MCP must be authenticated in the engine's environment; if absent, calendar-read tools no-op (the agent reports it).
- **Fence drift:** a future change to Scott's `~/.claude/settings.json` could surface a new tool; the allowlist + the engine unit test contain this.
