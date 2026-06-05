# Symphony Assistant — Edge-Function Engine (supersedes fenced-Michael)

**Date:** 2026-06-05
**Supersedes:** `2026-06-04-symphony-assistant-fenced.md` (the Agent-SDK/Mini path). We pivoted because the Mini lacks the Symphony task MCP (it's the Supabase admin MCP), wiring it in needs Scott's password on the always-on box, and that MCP connection has been chronically flaky in Scott's captures. The edge function removes the Mini, the MCP, and the password from the equation.

## Decision
The assistant runs as a **Supabase edge function `symphony-agent`** that:
- Verifies the caller's JWT, then runs all tool queries with a **user-JWT-scoped Supabase client** (RLS is the fence — scoped to Symphony, scoped to the user, by construction).
- Runs an **Anthropic tool-use loop** (model `claude-sonnet-4-6`, prompt caching on system + tools), executing `symphony_*` tools as Supabase queries ported from `tools/symphony-mcp-server.ts`.
- Streams the **same `AgentStreamEvent` SSE shape** (`session`/`text`/`tool`/`done`/`error`) the client already parses.
- Uses **existing secrets** (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — no new credentials, no Mini.

v1 tools (safe-only): `list_tasks`, `create_task`, `update_task`, `complete_task`, `create_project`, `list_projects`, `list_contacts`, `list_household_members`, `daily_summary`. (No `delete_task` — phase 2 with confirm.)

## What changes vs what's reused
- **New:** `supabase/functions/symphony-agent/index.ts` (the engine).
- **Adapt:** `src/lib/agentStream.ts` — add `streamSymphonyAgent(messages, handlers)` that POSTs `{messages}` to `symphony-agent` (keeps `parseSSEChunk` as-is).
- **Adapt:** `src/hooks/useSymphonyAssistant.ts` — drop the Mini history/reset calls (`getAgentChatHistory`/`resetAgentSession`); keep the conversation in React state and send it with each request; `resetSession` clears local state. Same return interface.
- **Reused unchanged:** ChatPanel tool-activity, AppShell passthrough, App.tsx pane wiring (they only depend on the hook's interface).
- **Remove:** `supabase/functions/agent-proxy/` (Mini-specific) and, at final cutover, `useChat`/`symphony-chat`.

## Engine design (`symphony-agent/index.ts`)
1. CORS + OPTIONS.
2. Auth: `serviceSupabase.auth.getUser(token)` → 401 if invalid. Build `userSupabase = createClient(url, anon, { global: { headers: { Authorization: bearer } } })` for RLS-scoped queries.
3. Body: `{ messages: {role:'user'|'assistant', content:string}[] }`.
4. SSE `ReadableStream`. Loop (max 8 turns):
   - POST `https://api.anthropic.com/v1/messages` (non-streaming) with `model`, cached `system`, cached `tools`, `messages`, `max_tokens: 2048`.
   - For each `content` block: `text` → emit `{type:'text',text}` + accumulate; `tool_use` → emit `{type:'tool',name}`, run the tool, collect `tool_result`.
   - Append the assistant turn + a user turn of `tool_result`s. If `stop_reason==='tool_use'` continue, else emit `{type:'done',reply}` and end.
   - On any throw: emit `{type:'error'}`.
5. Tools executed via a `switch(name)` over `userSupabase` queries (ported from the MCP server; `create_task` derives `bucket='timed'` when `scheduled_for` is set).

## Testing
- `agentStream.test.ts` (parse) stays green.
- `useSymphonyAssistant.test.ts` updated to the new send shape (mock `streamSymphonyAgent`).
- Manual: "what's on today" reads; "add a task to call the plumber tomorrow, family" creates it (visible in Today); RLS prevents touching another user's rows.

## Deploy
`supabase functions deploy symphony-agent --project-ref mwadppyrqzuzgstmwpuy` (no new secrets). Then repoint the client and ship.

## Status
Pivot recorded 2026-06-05. Mini reset to crash-fix (`9be96c5`); fenced-Michael engine code abandoned (branch `symphony-fenced-agent` can be deleted). Building now.
