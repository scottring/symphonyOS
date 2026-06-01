# Assistant Pane — Window onto Michael (Spec #1)

**Date:** 2026-06-01
**Status:** Design approved, pending written-spec review
**Branch/worktree:** `assistant-pane` (`.worktrees/assistant-pane`)

## Summary

Make Symphony's right-rail chat pane a true window onto the existing agentic
assistant ("Michael") that already runs on the Mac Mini. Today the prominent
pane is wired to a weak, tool-less path; the full-powered agent sits unused in a
side component. This spec repoints the pane, makes it feel live (streaming +
tool activity), and closes a real security gap — without building a new engine
or a new chat UI, because both already exist.

This is the first of four sub-projects. The others (existing-channel adapters,
proactive/background + action queue, and live terminal-session mirroring) are
out of scope here and get their own spec → plan → build cycles.

## Goal

> The same Claude that is Scott's all-day companion — same vault memory, same
> tools, same powers — reachable from inside Symphony's right-rail pane.

Day-one definition of done (acceptance test):
- From the right-rail AI pane, "what should I focus on today?" reads the vault +
  Symphony tasks + calendar and answers.
- "Add a task to follow up with the Watershed recruiter" creates it via the
  Symphony MCP tool.
- Both stream live, showing tool activity ("creating task…") as it works.

## Scope decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Audience | Me now (Scott), others later. Build on the Max subscription; design the auth seam so it can swap to the Anthropic API for multi-user without touching the engine. |
| Canonical surface | The **right-rail `ChatPanel`** (the AI tab in `AppShell`). Not a new full-screen view. |
| "Window onto" meaning | "Same brain, new doorway" now. Live terminal-session mirroring is a future stretch spec, explicitly deferred. |
| Pane scope | A **general doorway** — it can do anything the tools allow. Job-search / health / planning are NOT hard-coded features; they emerge from what you ask plus the data and skills available. |

## Current state (verified on `origin/main` @ 0d96b60, 2026-06-01)

Two chat backends exist, and the prominent pane is on the wrong one:

| Path | Backend | Agentic? | Wired to |
|------|---------|----------|----------|
| `useChat` (`src/hooks/useChat.ts`) | `symphony-chat` edge fn → Anthropic API, **Haiku, single-shot RAG** (stuffs tasks + OpenAI embeddings into one prompt). Costs API tokens. | No tools, cannot act | **The live right-rail `ChatPanel`** (`App.tsx`: `const chat = useChat()` → `onChatSend={chat.sendMessage}`) |
| `useAgentChat` (`src/hooks/useAgentChat.ts`) | Open Brain `/api/agent-chat` → **Michael**, `@anthropic-ai/claude-agent-sdk`, **Max subscription**, full tools | Yes — reads/writes vault, Symphony MCP | Only `src/components/agent/AgentHomeView.tsx` (not the main pane) |

The engine already exists: `open-brain-ui/server/lib/agent.ts` `runAgent()`:
- runs `query()` from `@anthropic-ai/claude-agent-sdk`,
- `cwd` = vault, `settingSources: ['project','user']` → inherits Scott's Claude
  Code login (**Max sub backs it; no `ANTHROPIC_API_KEY` set**) and his
  configured MCP servers,
- has Symphony MCP tools (`symphony_*`) per its system prompt,
- session resumption via `options.resume = sessionId`,
- runs `permissionMode: 'bypassPermissions'`.

The chat UI already exists: `src/components/chat/ChatPanel.tsx`, with sessions,
save-to-vault, add-task, and source-click support, rendered in `AppShell`'s
right `aside` (wide + narrow render sites).

The client transport already exists: `src/lib/openBrain.ts` `agentChat()` /
`getAgentChatHistory()` / `resetAgentSession()` calling `/api/agent-chat*` via
`callOpenBrain()`.

So the work is **wiring, streaming, and a security seam** — not engine, not UI.

## The four changes

### 1. Repoint the canonical pane to the agentic engine

In `App.tsx`, feed the right-rail `ChatPanel` from the agentic path instead of
`useChat`. Concretely: the props passed to `AppShell`
(`chatMessages`/`chatLoading`/`chatError`/`onChatSend`/…) source from the
agentic hook (an evolved `useAgentChat`) rather than `useChat`.

- `useChat` / `symphony-chat` are retired as the assistant backend. Keep the
  edge function in the repo for now (do not delete) as a possible offline
  fallback, but it is no longer the pane's backend.
- One assistant, in the place Scott already expects it.

### 2. Make it feel live (streaming + tool activity)

`runAgent()` currently collects only the final `result` event and returns one
string; the route is a blocking POST (120s client timeout). Replace with
streaming so the pane shows progress like terminal Claude does.

- Engine: add a streaming variant that relays the `query()` event loop —
  assistant text deltas and `tool_use` / `tool_result` events — over **SSE**.
- Transport: a streaming endpoint (e.g. `POST /api/agent-chat/stream`) returning
  `text/event-stream`.
- Client: `useAgentChat` consumes the SSE stream, appending text tokens and
  rendering a compact tool-activity line per `tool_use` ("creating task…",
  "searched 3 emails…"). `ChatPanel` already has the message-rendering surface;
  add a lightweight tool-activity affordance.
- Keep the existing non-streaming endpoint working during the transition.

### 3. Close the security gap (authenticated edge-function seam)

Today the pane calls Open Brain with `VITE_OPEN_BRAIN_API_KEY` — a **build-time
inlined, browser-exposed key** to a `bypassPermissions` agent that can send
email and rewrite the vault. Route the assistant traffic through a Supabase
**edge function** instead:

- New edge fn (e.g. `agent-proxy`) that:
  1. verifies the caller's Supabase JWT (rejects anon),
  2. holds the Open Brain `X-Api-Key` server-side (never shipped to the browser),
  3. forwards to the engine and **streams** the SSE response back through.
- `useAgentChat` calls the edge fn (with the user's Supabase session), not Open
  Brain directly. The `VITE_OPEN_BRAIN_API_KEY` is removed from the assistant
  path.
- **This is the multi-user seam.** The edge fn knows which authenticated user is
  calling, so the "others, eventually" build passes that identity to the engine
  and flips engine auth to `ANTHROPIC_API_KEY` (`AGENT_AUTH_MODE = subscription |
  api`) — no rewrite of the pane or the engine logic.

Note: edge functions that stream and use a shared secret to the engine must be
deployed with the correct `verify_jwt` posture. We *want* `verify_jwt` here
(unlike `vault-sync`) because the whole point is to authenticate Scott's session;
the engine secret is the second factor between the edge fn and the Mac Mini.

### 4. Reconcile sessions

The pane shows a Supabase-backed session list (`useChatSessions`); the engine
tracks its own conversation via the Agent SDK `session_id` on the `web:default`
channel plus SQLite memory.

- Make the pane's session list the front end for the engine's session
  resumption: a Symphony "conversation" maps to an engine `session_id`
  (and channel). Selecting a session resumes that SDK session; "new chat"
  starts a fresh one (`resetAgentSession`-style).
- Persist the mapping where the existing session list already lives
  (`useChatSessions` storage), extended with the engine `session_id`/channel.
- Result: history is consistent, resumable, and survives reloads/devices.

## Architecture (after this spec)

```
Right-rail ChatPanel (AppShell, AI tab)
  → useAgentChat (SSE client, Supabase JWT)
    → Supabase edge fn `agent-proxy`  [verifies JWT, holds engine X-Api-Key, streams]
      → Open Brain `/api/agent-chat/stream` on Mac Mini  [X-Api-Key]
        → runAgent() / @anthropic-ai/claude-agent-sdk query()
            cwd = vault, Max-sub auth, MCP tools (symphony_*, vault, Gmail, Calendar, Granola)
```

Shared memory = the vault (already the cross-agent memory). No new memory store.

## Components / boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `ChatPanel` (existing) | Render messages, sessions, tool-activity, input | props from `App.tsx` |
| `useAgentChat` (evolve) | SSE client; optimistic messages; session id; tool-activity events | edge fn `agent-proxy` |
| `useChatSessions` (extend) | Session list ↔ engine `session_id`/channel mapping | Supabase |
| `agent-proxy` edge fn (new) | AuthN (JWT) + secret-holding + SSE passthrough | engine endpoint, `OPEN_BRAIN_API_KEY` |
| `/api/agent-chat/stream` (new, engine) | Relay `query()` events as SSE | `runAgent` streaming variant |
| `runAgent` streaming (evolve) | Yield text/tool events instead of only final result | Agent SDK |

## Error handling

- Engine unreachable / Mac Mini down → pane shows a clear "assistant offline"
  state (not a silent spinner). `callOpenBrain` already returns null on failure;
  surface it.
- SSE drop mid-stream → mark the in-flight assistant message as interrupted,
  allow retry; do not lose the user's turn.
- Edge fn rejects (no/invalid JWT) → pane prompts re-auth, does not fall back to
  an unauthenticated call.
- Tool failure inside the agent → surfaced in the tool-activity line, agent
  continues per its own handling.

## Testing

- `useAgentChat`: unit tests for SSE parsing (text deltas, tool events, done),
  interruption, and error states (mock the stream).
- `agent-proxy` edge fn: rejects anon; forwards with secret; streams through.
- `useChatSessions`: session↔`session_id` mapping round-trips; new/resume/delete.
- Manual acceptance: run the day-one acceptance test end to end against the live
  Mac Mini engine (focus-today read; create-task write; visible streaming).
- Out of scope for automated tests: the engine itself (separate repo).

## Explicitly out of scope (future specs)

- Existing-channel adapters (Telegram/Michael already exists; iMessage bridge).
- Proactive/background runs + action queue (email triage, auto-drafting). This is
  the highest-value, highest-complexity follow-on; needs its own spec.
- Live terminal-session mirroring / hand-off ("both, eventually" stretch goal).
- Deleting `symphony-chat` / `useChat` (kept as possible fallback this round).
- Multi-user rollout (the seam is built here; the rollout is not).

## Risks / watch-items

- `bypassPermissions`: the agent can act destructively. The JWT seam gates *who*
  can invoke it; consider a future allow/confirm step for high-impact tool calls
  (deferred to the action-queue spec).
- Engine system prompt (`agent.ts`) carries a stale priority stack and old kid
  names; it self-corrects by reading `context/scott-overview.md` at runtime, but
  worth a cleanup pass (out of scope, note for engine maintenance).
- Supabase egress: streaming SSE through an edge fn adds traffic; keep the wall
  quiet-hours gating unaffected (assistant is on-demand, not a poller).
- Open Brain is the single point of failure for the assistant; if the tunnel or
  Mac Mini is down, the pane is offline (acceptable for the personal phase).
```
