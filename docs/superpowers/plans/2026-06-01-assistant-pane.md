# Assistant Pane — Window onto Michael — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Symphony's right-rail chat pane stream from the existing agentic "Michael" engine (Agent SDK on the Mac Mini, Max-subscription auth, full tools) through an authenticated edge-function seam, replacing the weak tool-less Haiku path.

**Architecture:** Right-rail `ChatPanel` → `useAgentChat` (SSE client, Supabase JWT) → Supabase edge fn `agent-proxy` (verifies JWT, holds engine secret, streams through) → Open Brain `POST /api/agent-chat/stream` on the Mac Mini → `@anthropic-ai/claude-agent-sdk` `query()` with vault cwd + MCP tools. The engine already exists; this plan adds a streaming endpoint, the secure proxy, the client stream, the hook rework, and the app wiring.

**Tech Stack:** TypeScript, React 19, Vitest (Symphony), Express + `@anthropic-ai/claude-agent-sdk` ^0.2.70 (Open Brain), Supabase Edge Functions (Deno), SSE.

**Two repos:**
- **Engine:** `/Users/scottkaufman/Developer/open-brain-ui` (branch: work directly; this repo is not deploy-gated like Symphony, but commit per task).
- **Symphony:** `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane` (branch `assistant-pane`).

**Shared event contract (used by every layer):**
```typescript
// One SSE "data:" line carries one JSON-encoded AgentStreamEvent.
type AgentStreamEvent =
  | { type: 'session'; sessionId: string }      // engine session id (from system/init)
  | { type: 'text'; text: string }              // a chunk of assistant prose
  | { type: 'tool'; name: string }              // a tool the agent just invoked
  | { type: 'done'; reply: string; sessionId: string | null } // final result
  | { type: 'error'; message: string }
```

---

## File Structure

**Open Brain (`open-brain-ui`):**
- `server/lib/agent.ts` — add `runAgentStream()` async generator + `mapSdkEvent()` pure helper (modify).
- `server/lib/sse.ts` — new: `formatSSE(event)` pure helper.
- `server/lib/agent.test.ts` — new: tests for `mapSdkEvent`.
- `server/lib/sse.test.ts` — new: tests for `formatSSE`.
- `server/routes/agent-chat.ts` — add `POST /api/agent-chat/stream` (modify).
- `package.json` / `vitest.config.ts` — add vitest (modify/new).

**Symphony (`assistant-pane` worktree):**
- `supabase/functions/agent-proxy/index.ts` — new edge fn (JWT gate + streaming passthrough).
- `src/lib/agentStream.ts` — new: `parseSSEChunk()` pure helper + `streamAgentChat()` fetch client.
- `src/lib/agentStream.test.ts` — new: tests for `parseSSEChunk`.
- `src/hooks/useAgentChat.ts` — rework to stream, emit `ChatMessage[]`, surface tool activity (modify).
- `src/hooks/useAgentChat.test.ts` — new: hook tests with a mocked stream.
- `src/App.tsx` — repoint the right-rail `ChatPanel` props from `useChat` to `useAgentChat` (modify).
- `src/components/chat/ChatPanel.tsx` — render a tool-activity line (modify, small).

---

## Task 0: Add a test runner to Open Brain

**Files:**
- Modify: `/Users/scottkaufman/Developer/open-brain-ui/package.json`
- Create: `/Users/scottkaufman/Developer/open-brain-ui/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run (in `/Users/scottkaufman/Developer/open-brain-ui`):
```bash
npm install -D vitest@^2.1.9
```

- [ ] **Step 2: Add a Node-environment vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add a test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (or runs 0 tests). Confirms vitest resolves.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner for server unit tests"
```

---

## Task 1: SSE formatting helper (Open Brain)

**Files:**
- Create: `/Users/scottkaufman/Developer/open-brain-ui/server/lib/sse.ts`
- Test: `/Users/scottkaufman/Developer/open-brain-ui/server/lib/sse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/lib/sse.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { formatSSE } from './sse.js'

describe('formatSSE', () => {
  it('encodes an event as a single data line terminated by a blank line', () => {
    const out = formatSSE({ type: 'text', text: 'hello' })
    expect(out).toBe('data: {"type":"text","text":"hello"}\n\n')
  })

  it('escapes newlines inside the JSON payload (no premature frame end)', () => {
    const out = formatSSE({ type: 'text', text: 'a\nb' })
    // The literal newline must be JSON-escaped to \n, so only the trailing
    // \n\n terminates the frame.
    expect(out).toBe('data: {"type":"text","text":"a\\nb"}\n\n')
    expect(out.endsWith('\n\n')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/sse.test.ts`
Expected: FAIL — cannot find module `./sse.js`.

- [ ] **Step 3: Write minimal implementation**

Create `server/lib/sse.ts`:
```typescript
export type AgentStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; reply: string; sessionId: string | null }
  | { type: 'error'; message: string }

/** Encode one event as a single SSE frame. JSON.stringify escapes newlines. */
export function formatSSE(event: AgentStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/sse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/sse.ts server/lib/sse.test.ts
git commit -m "feat(agent): SSE event encoder + shared AgentStreamEvent type"
```

---

## Task 2: Map SDK events → AgentStreamEvent (Open Brain)

**Files:**
- Modify: `/Users/scottkaufman/Developer/open-brain-ui/server/lib/agent.ts`
- Test: `/Users/scottkaufman/Developer/open-brain-ui/server/lib/agent.test.ts`

The Agent SDK `query()` yields `SDKMessage`s. We only act on three:
- `{ type: 'system', subtype: 'init', session_id }` → `session`
- `{ type: 'assistant', message: { content: [...] }, session_id }` → one `text` per text block, one `tool` per tool_use block
- `{ type: 'result', subtype: 'success', result, session_id }` → `done`

- [ ] **Step 1: Write the failing test**

Create `server/lib/agent.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mapSdkEvent } from './agent.js'

describe('mapSdkEvent', () => {
  it('maps system/init to a session event', () => {
    expect(mapSdkEvent({ type: 'system', subtype: 'init', session_id: 's1' } as never))
      .toEqual([{ type: 'session', sessionId: 's1' }])
  })

  it('maps an assistant message to text + tool events in order', () => {
    const msg = {
      type: 'assistant',
      session_id: 's1',
      message: { content: [
        { type: 'text', text: 'Working on it.' },
        { type: 'tool_use', name: 'symphony_create_task', input: {} },
      ] },
    }
    expect(mapSdkEvent(msg as never)).toEqual([
      { type: 'text', text: 'Working on it.' },
      { type: 'tool', name: 'symphony_create_task' },
    ])
  })

  it('maps a successful result to a done event', () => {
    const msg = { type: 'result', subtype: 'success', result: 'Done.', session_id: 's1' }
    expect(mapSdkEvent(msg as never)).toEqual([
      { type: 'done', reply: 'Done.', sessionId: 's1' },
    ])
  })

  it('ignores empty text blocks and unrelated message types', () => {
    expect(mapSdkEvent({ type: 'assistant', session_id: 's1', message: { content: [{ type: 'text', text: '' }] } } as never)).toEqual([])
    expect(mapSdkEvent({ type: 'stream_event' } as never)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/agent.test.ts`
Expected: FAIL — `mapSdkEvent` is not exported.

- [ ] **Step 3: Implement `mapSdkEvent` in `server/lib/agent.ts`**

Add these imports at the top of `server/lib/agent.ts` (next to the existing `query` import):
```typescript
import type { AgentStreamEvent } from './sse.js'
```

Add the exported helper (place it above `runAgent`):
```typescript
/**
 * Translate a single Agent SDK message into zero or more AgentStreamEvents.
 * Pure + synchronous so it is unit-testable without the SDK.
 */
export function mapSdkEvent(event: Record<string, unknown>): AgentStreamEvent[] {
  const type = event.type as string

  if (type === 'system' && (event as Record<string, unknown>).subtype === 'init') {
    return [{ type: 'session', sessionId: event.session_id as string }]
  }

  if (type === 'assistant') {
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined
    const blocks = message?.content ?? []
    const out: AgentStreamEvent[] = []
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        out.push({ type: 'text', text: block.text as string })
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        out.push({ type: 'tool', name: block.name as string })
      }
    }
    return out
  }

  if (type === 'result' && (event as Record<string, unknown>).subtype === 'success') {
    return [{ type: 'done', reply: (event.result as string) ?? '', sessionId: (event.session_id as string) ?? null }]
  }

  return []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/agent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/agent.ts server/lib/agent.test.ts
git commit -m "feat(agent): map SDK messages to AgentStreamEvents"
```

---

## Task 3: `runAgentStream` async generator (Open Brain)

**Files:**
- Modify: `/Users/scottkaufman/Developer/open-brain-ui/server/lib/agent.ts`

This mirrors `runAgent`'s `query()` options exactly (vault cwd, bypassPermissions, settingSources, resume), but yields events instead of returning only the final result.

- [ ] **Step 1: Add `runAgentStream` below `runAgent` in `server/lib/agent.ts`**

```typescript
/**
 * Streaming variant of runAgent. Yields AgentStreamEvents as the agent works.
 * Same query options as runAgent so behavior/auth/tools are identical.
 */
export async function* runAgentStream(
  message: string,
  sessionId?: string,
): AsyncGenerator<AgentStreamEvent, void> {
  const options: Record<string, unknown> = {
    cwd: VAULT_PATH || process.cwd(),
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['project', 'user'],
  }
  if (sessionId) options.resume = sessionId

  try {
    for await (const event of query({ prompt: message, options })) {
      for (const mapped of mapSdkEvent(event as unknown as Record<string, unknown>)) {
        yield mapped
      }
    }
  } catch (err) {
    logger.error({ err }, 'Agent stream failed')
    yield { type: 'error', message: 'Agent stream failed' }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If `tsconfig.json` is a composite root, run `npx tsc -b` instead and expect success.)

- [ ] **Step 3: Commit**

```bash
git add server/lib/agent.ts
git commit -m "feat(agent): runAgentStream async generator"
```

---

## Task 4: `POST /api/agent-chat/stream` SSE route (Open Brain)

**Files:**
- Modify: `/Users/scottkaufman/Developer/open-brain-ui/server/routes/agent-chat.ts`

The route reuses the same memory + michael-db calls as the existing non-stream route, but writes SSE and persists the final reply on `done`.

- [ ] **Step 1: Add imports + the streaming route to `server/routes/agent-chat.ts`**

Add to the existing imports:
```typescript
import { runAgentStream } from '../lib/agent.js'
import { formatSSE } from '../lib/sse.js'
```
(The file already imports `getSession, setSession, saveChatMessage` and `buildMemoryContext, saveConversationTurn`.)

Add this route (before `export default router`):
```typescript
/**
 * POST /api/agent-chat/stream
 * Same as /api/agent-chat but streams AgentStreamEvents as SSE.
 */
router.post('/api/agent-chat/stream', async (req: Request, res: Response) => {
  const { message, channelId: providedChannelId } = req.body as {
    message?: string
    channelId?: string
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const channelId = providedChannelId || 'web:default'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const memoryPrefix = buildMemoryContext(channelId, message)
  const fullMessage = memoryPrefix ? `${memoryPrefix}\n${message}` : message
  const existingSessionId = getSession(channelId)

  let finalReply = ''
  let finalSessionId: string | null = existingSessionId || null

  try {
    for await (const event of runAgentStream(fullMessage, existingSessionId || undefined)) {
      if (event.type === 'session') finalSessionId = event.sessionId
      if (event.type === 'done') {
        finalReply = event.reply
        if (event.sessionId) finalSessionId = event.sessionId
      }
      res.write(formatSSE(event))
    }
  } catch (err) {
    logger.error({ err }, 'Agent stream route failed')
    res.write(formatSSE({ type: 'error', message: 'Agent stream failed' }))
  }

  // Persist session + history once, mirroring the non-stream route.
  if (finalSessionId) setSession(channelId, finalSessionId)
  if (finalReply) {
    saveConversationTurn(channelId, message, finalReply)
    saveChatMessage(channelId, 'user', message)
    saveChatMessage(channelId, 'assistant', finalReply)
  }

  res.end()
})
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npx tsc -b`)
Expected: no errors.

- [ ] **Step 3: Smoke-test the route locally against the live agent**

Start the server: `npm run dev:server`
In another shell (replace `$KEY` with `OPEN_BRAIN_API_KEY` from `.env`):
```bash
curl -N -X POST http://localhost:8787/api/agent-chat/stream \
  -H "Content-Type: application/json" -H "X-Api-Key: $KEY" \
  -d '{"message":"Say hello in five words.","channelId":"web:smoke"}'
```
Expected: a stream of `data: {...}` frames ending with `data: {"type":"done",...}`. (Confirm the port matches `server/index.ts`; adjust if not 8787.)

- [ ] **Step 4: Commit**

```bash
git add server/routes/agent-chat.ts
git commit -m "feat(agent): SSE streaming endpoint /api/agent-chat/stream"
```

- [ ] **Step 5: Deploy the engine to the Mac Mini**

The engine runs under pm2 on the Mac Mini (per infra notes). After pushing/pulling on the Mini, restart it:
```bash
# on the Mac Mini (or via ssh):
pm2 restart open-brain
```
Verify the new route is live by running the Step 3 curl against `https://brain.symphony-os.com`.

---

## Task 5: `agent-proxy` edge function (Symphony) — the secure seam

**Files:**
- Create: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/supabase/functions/agent-proxy/index.ts`

This verifies the caller's Supabase JWT, then forwards to the engine with the server-side `X-Api-Key`, streaming the SSE body straight through. The engine secret never reaches the browser.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/agent-proxy/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify the JWT: getUser with the caller's token.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { message, channelId } = await req.json().catch(() => ({}))
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const engineUrl = Deno.env.get('OPEN_BRAIN_URL')!
  const engineKey = Deno.env.get('OPEN_BRAIN_API_KEY')!

  const upstream = await fetch(`${engineUrl}/api/agent-chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': engineKey },
    body: JSON.stringify({ message, channelId: channelId ?? 'web:default' }),
  })

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: 'Engine unreachable' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Stream the SSE body straight through to the browser.
  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
})
```

- [ ] **Step 2: Set the engine secrets (server-side only, NOT VITE_)**

Run (from the worktree; uses the project ref `mwadppyrqzuzgstmwpuy`):
```bash
npx supabase secrets set OPEN_BRAIN_URL="https://brain.symphony-os.com" \
  OPEN_BRAIN_API_KEY="<the engine key>" --project-ref mwadppyrqzuzgstmwpuy
```
(`SUPABASE_URL`/`SUPABASE_ANON_KEY` are injected into edge functions automatically.)

- [ ] **Step 3: Deploy the function (keep verify_jwt ON)**

Run:
```bash
npx supabase functions deploy agent-proxy --project-ref mwadppyrqzuzgstmwpuy
```
We *want* `verify_jwt` here (unlike `vault-sync`): the whole point is to authenticate Scott's session. Do not pass `--no-verify-jwt`.

- [ ] **Step 4: Manual auth-gate verification**

```bash
# Without a token → 401:
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/agent-proxy" \
  -H "Content-Type: application/json" -d '{"message":"hi"}'
# Expected: 401
```
(Authenticated streaming is exercised end-to-end in Task 8's acceptance test.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/agent-proxy/index.ts
git commit -m "feat(assistant): agent-proxy edge fn (JWT gate + SSE passthrough)"
```

---

## Task 6: Client SSE parser + stream client (Symphony)

**Files:**
- Create: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/lib/agentStream.ts`
- Test: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/lib/agentStream.test.ts`

- [ ] **Step 1: Write the failing test for the parser**

Create `src/lib/agentStream.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseSSEChunk } from './agentStream'

describe('parseSSEChunk', () => {
  it('extracts complete events and returns the remainder buffer', () => {
    const input =
      'data: {"type":"text","text":"hi"}\n\n' +
      'data: {"type":"tool","name":"symphony_create_task"}\n\n' +
      'data: {"type":"done"'
    const { events, rest } = parseSSEChunk(input)
    expect(events).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool', name: 'symphony_create_task' },
    ])
    expect(rest).toBe('data: {"type":"done"')
  })

  it('returns no events when no full frame is present', () => {
    const { events, rest } = parseSSEChunk('data: {"type":"te')
    expect(events).toEqual([])
    expect(rest).toBe('data: {"type":"te')
  })

  it('skips malformed JSON frames without throwing', () => {
    const { events } = parseSSEChunk('data: not-json\n\ndata: {"type":"text","text":"ok"}\n\n')
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agentStream.test.ts`
Expected: FAIL — cannot find module `./agentStream`.

- [ ] **Step 3: Implement the parser + stream client**

Create `src/lib/agentStream.ts`:
```typescript
import { supabase } from '@/lib/supabase'

export type AgentStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; reply: string; sessionId: string | null }
  | { type: 'error'; message: string }

/**
 * Parse a growing SSE buffer. Returns the complete events found and the
 * leftover (incomplete) tail to prepend to the next chunk. Pure + testable.
 */
export function parseSSEChunk(buffer: string): { events: AgentStreamEvent[]; rest: string } {
  const frames = buffer.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: AgentStreamEvent[] = []
  for (const frame of frames) {
    const line = frame.trim()
    if (!line.startsWith('data:')) continue
    const json = line.slice(line.indexOf(':') + 1).trim()
    try {
      events.push(JSON.parse(json) as AgentStreamEvent)
    } catch {
      // skip malformed frame
    }
  }
  return { events, rest }
}

export interface StreamHandlers {
  onText?: (text: string) => void
  onTool?: (name: string) => void
  onSession?: (sessionId: string) => void
  onDone?: (reply: string, sessionId: string | null) => void
  onError?: (message: string) => void
}

/**
 * Open the agent-proxy SSE stream for one message and drive the handlers.
 * Uses the caller's Supabase JWT; the engine secret stays server-side.
 */
export async function streamAgentChat(
  message: string,
  channelId: string,
  handlers: StreamHandlers,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    handlers.onError?.('Not signed in')
    return
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-proxy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, channelId }),
    },
  )

  if (!res.ok || !res.body) {
    handlers.onError?.(res.status === 401 ? 'Session expired' : 'Assistant offline')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSSEChunk(buffer)
    buffer = rest
    for (const ev of events) {
      if (ev.type === 'text') handlers.onText?.(ev.text)
      else if (ev.type === 'tool') handlers.onTool?.(ev.name)
      else if (ev.type === 'session') handlers.onSession?.(ev.sessionId)
      else if (ev.type === 'done') handlers.onDone?.(ev.reply, ev.sessionId)
      else if (ev.type === 'error') handlers.onError?.(ev.message)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agentStream.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agentStream.ts src/lib/agentStream.test.ts
git commit -m "feat(assistant): SSE parser + streamAgentChat client"
```

---

## Task 7: Rework `useAgentChat` to stream and emit ChatMessage[] (Symphony)

**Files:**
- Modify: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/hooks/useAgentChat.ts`
- Test: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/hooks/useAgentChat.test.ts`

`ChatPanel` renders `ChatMessage` (from `useChat`: `id`, `role`, `content`, `sources?`, `vaultDraft?`, `mealRequest?`, `timestamp: Date`). The hook must return that shape (not `AgentChatMessage`) and append streamed text to the in-flight assistant message. Tool activity is surfaced via a separate `toolActivity` field the panel renders.

- [ ] **Step 1: Write the failing test (mock the stream client)**

Create `src/hooks/useAgentChat.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/agentStream', () => ({
  streamAgentChat: vi.fn(),
}))
vi.mock('@/lib/openBrain', () => ({
  getAgentChatHistory: vi.fn().mockResolvedValue([]),
  resetAgentSession: vi.fn().mockResolvedValue(true),
}))

import { streamAgentChat } from '@/lib/agentStream'
import { useAgentChat } from './useAgentChat'

describe('useAgentChat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends streamed text to a single assistant message and clears loading on done', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onText?.('Hello ')
      h.onText?.('Scott.')
      h.onDone?.('Hello Scott.', 's1')
    })

    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('hi') })

    await waitFor(() => expect(result.current.loading).toBe(false))
    const msgs = result.current.messages
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].content).toBe('Hello Scott.')
  })

  it('records tool activity from onTool', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onTool?.('symphony_create_task')
      h.onText?.('Created.')
      h.onDone?.('Created.', 's1')
    })
    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('add a task') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.toolActivity).toContain('symphony_create_task')
  })

  it('surfaces errors', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onError?.('Assistant offline')
    })
    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.error).toBe('Assistant offline'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAgentChat.test.ts`
Expected: FAIL — current hook has no `toolActivity` and uses `AgentChatMessage`/`agentChat`.

- [ ] **Step 3: Rewrite `src/hooks/useAgentChat.ts`**

```typescript
import { useState, useCallback, useEffect, useRef } from 'react'
import { getAgentChatHistory, resetAgentSession } from '@/lib/openBrain'
import { streamAgentChat } from '@/lib/agentStream'
import type { ChatMessage } from '@/hooks/useChat'

const CHANNEL_ID = 'web:default'

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolActivity, setToolActivity] = useState<string[]>([])
  const loadedRef = useRef(false)

  // Load prior history (engine SQLite) on mount, adapted to ChatMessage shape.
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    getAgentChatHistory(CHANNEL_ID, 50).then((history) => {
      if (history && history.length > 0) {
        setMessages(history.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp * 1000),
        })))
      }
    })
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
    ])
    setLoading(true)
    setError(null)
    setToolActivity([])

    const appendText = (chunk: string) =>
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, content: m.content + chunk } : m))

    await streamAgentChat(text.trim(), CHANNEL_ID, {
      onText: appendText,
      onTool: (name) => setToolActivity((prev) => [...prev, name]),
      onDone: (reply) => {
        // Prefer the authoritative final reply if streamed text was empty.
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId && m.content.length === 0
            ? { ...m, content: reply } : m))
      },
      onError: (message) => setError(message),
    })

    setLoading(false)
  }, [loading])

  const resetSession = useCallback(async () => {
    await resetAgentSession(CHANNEL_ID)
    setMessages([])
    setError(null)
    setToolActivity([])
  }, [])

  return { messages, loading, error, toolActivity, sendMessage, resetSession }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAgentChat.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAgentChat.ts src/hooks/useAgentChat.test.ts
git commit -m "feat(assistant): stream useAgentChat into ChatMessage[] + tool activity"
```

---

## Task 8: Repoint the right-rail ChatPanel + render tool activity (Symphony)

**Files:**
- Modify: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/App.tsx`
- Modify: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/components/chat/ChatPanel.tsx`

The right-rail pane is fed by `const chat = useChat()` and `onChatSend={chat.sendMessage}`. Repoint those props to `useAgentChat`. The agentic hook does not provide `entityContext`/`mode`/session-list features, so pass inert defaults for those props (the pane treats them as optional). Keep `useChat` imported/used elsewhere if any other surface needs it; only the right-rail props change.

- [ ] **Step 1: Add the agentic hook alongside the existing one in `App.tsx`**

Find `const chat = useChat()` (near the top of the component, ~line 218) and add below it:
```typescript
const agent = useAgentChat()
```
Add the import near the other hook imports:
```typescript
import { useAgentChat } from '@/hooks/useAgentChat'
```

- [ ] **Step 2: Repoint the AppShell chat props to `agent`**

In the `AppShell` props block (~lines 1525-1545), change the chat-feeding props from `chat.*` to `agent.*`:
```tsx
chatMessages={agent.messages}
chatLoading={agent.loading}
chatError={agent.error}
chatEntityContext={null}
chatMode={'chat'}
onChatSend={agent.sendMessage}
onChatClear={agent.resetSession}
chatToolActivity={agent.toolActivity}
```
Leave the session-list props (`chatSessions`, `onChatLoadSession`, etc.) as they are for now — they are addressed in Task 9. The pane tolerates them; they simply won't reflect agent sessions yet.

- [ ] **Step 3: Thread `toolActivity` through AppShell to ChatPanel**

In `src/components/layout/AppShell.tsx`, add an optional prop `chatToolActivity?: string[]` to the props interface and to both `<ChatPanel ... />` render sites pass `toolActivity={chatToolActivity}`.

In `src/components/chat/ChatPanel.tsx`, add to `ChatPanelProps`:
```typescript
  toolActivity?: string[]
```
Render it just above the input, only while present (map raw tool names to friendly labels):
```tsx
{toolActivity && toolActivity.length > 0 && loading && (
  <div className="px-4 py-1.5 text-xs text-neutral-400 border-t border-neutral-200/60">
    {toolActivity[toolActivity.length - 1].replace(/^symphony_/, '').replace(/_/g, ' ')}…
  </div>
)}
```
Add `toolActivity` to the destructured props in the `ChatPanel({ ... })` signature.

- [ ] **Step 4: Type-check the whole app**

Run (from the worktree): `npm run build`
Expected: `tsc -b` passes and Vite builds. (Per repo note, `tsc -b` is stricter than `--noEmit`; this is the real gate.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/AppShell.tsx src/components/chat/ChatPanel.tsx
git commit -m "feat(assistant): right-rail pane streams from Michael, shows tool activity"
```

- [ ] **Step 6: End-to-end acceptance test (the spec's definition of done)**

Prereq: copy env into the worktree (gitignored `.env` is not in worktrees):
```bash
cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env \
   /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/.env
```
Run `npm run dev`, sign in, open the right-rail AI tab, and verify:
1. "what should I focus on today?" streams a reply that reflects vault/Symphony/calendar context.
2. "add a task to follow up with the Watershed recruiter" creates a task (check Symphony), with a visible tool-activity line during the run.
3. Text appears progressively (streaming), not all-at-once.
4. Kill the tunnel/engine and confirm a clean "Assistant offline" error, not a hung spinner.

---

## Task 9: Minimal session handling (Symphony)

**Files:**
- Modify: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/assistant-pane/src/App.tsx`

Full multi-session reconciliation between the Supabase `chat_sessions` list and the engine's per-channel SQLite history is a larger effort. For this plan, deliver the coherent minimum: a working "New chat" that resets the engine session, and hide the (now-mismatched) `useChat`-backed session list from the agent pane so it does not show stale Haiku-era sessions. Full reconciliation (channel-per-session) is a tracked follow-up.

- [ ] **Step 1: Point "New chat" at the agent reset and clear the session list for the AI pane**

In `App.tsx`, set the AppShell props:
```tsx
onChatNewChat={agent.resetSession}
chatSessions={[]}
chatSessionsLoading={false}
activeChatSessionId={null}
```
(The session-history UI in `ChatPanel` already renders nothing when `sessions` is empty.)

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Manual check**

In the running app: click "New chat" in the AI pane → messages clear and the next message starts a fresh agent session (the agent does not reference the prior turn). No stale session list shows.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(assistant): wire New chat to agent reset; hide stale session list"
```

- [ ] **Step 5: Record the follow-up**

Append to the spec's out-of-scope list (in `docs/superpowers/specs/2026-06-01-assistant-pane-design.md`) a one-line note: "Follow-up: full session reconciliation = map each Symphony session to an engine channel (`web:<sessionId>`) so the session list drives engine history." Commit:
```bash
git add docs/superpowers/specs/2026-06-01-assistant-pane-design.md
git commit -m "docs(assistant): note full session reconciliation as follow-up"
```

---

## Task 10: Ship

- [ ] **Step 1: Run the full Symphony unit suite**

Run (from the worktree): `npx vitest run`
Expected: green (the new `agentStream`, `useAgentChat` tests pass; nothing regressed).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (CI gates on lint; pre-push does not).

- [ ] **Step 3: Rebase onto origin/main and push (auto-deploys to prod)**

```bash
git fetch origin main && git rebase origin/main
git push origin HEAD:main
```
The pre-push hook runs `tsc --noEmit` + unit tests before the `main` push. If rejected as non-fast-forward, re-`fetch`/`rebase` and push again.

- [ ] **Step 4: Confirm prod**

After Vercel deploys, open prod, sign in, and re-run the Task 8 acceptance test against the live engine.

- [ ] **Step 5: Remove the worktree when merged**

```bash
git worktree remove .worktrees/assistant-pane
```

---

## Notes / Risks carried from the spec

- **`bypassPermissions`:** the agent can act destructively (send email, rewrite vault). The JWT seam gates *who* can invoke it; a per-action confirm/allow gate is deferred to the future action-queue spec.
- **Engine system prompt** in `agent.ts` carries a stale priority stack and old kid names; it self-corrects by reading `context/scott-overview.md` at runtime. Cleanup is out of scope here.
- **Supabase egress:** the assistant is on-demand (no polling), so it does not add to the wall's overnight floor; the edge-fn streaming hop is per-message only.
- **Engine availability:** Open Brain is the single point of failure; if the tunnel/Mac Mini is down, the pane shows "Assistant offline" (acceptable for the personal phase).
- **`useChat`/`symphony-chat`** are intentionally left in place as a possible fallback; not deleted in this plan.
```
