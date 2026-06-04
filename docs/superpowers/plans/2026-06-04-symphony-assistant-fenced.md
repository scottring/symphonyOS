# Symphony Assistant — Fenced-Michael Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Symphony's right-rail assistant a smart, agentic, *Symphony-only* agent — running on the existing Open Brain Agent SDK engine (Opus 4.8, $0 on the Max sub) but fenced so it can only touch `symphony_*` tools, never the vault/Gmail/Granola.

**Architecture:** The engine gains a `scope: 'michael' | 'symphony'` switch. For the `symphony` scope it attaches a `canUseTool` deny-by-default callback (the authoritative fence) and a Symphony-only system prompt; everything else (cwd, model, MCP loading) stays identical to Michael so `symphony_*` tools load exactly as they do today. The route derives the scope from the channel prefix (`symphony:*`). The Symphony app reuses the `assistant-pane` branch's transport (SSE proxy + parser) under a **new** `useSymphonyAssistant` hook on the `symphony:web` channel, leaving full-Michael (`useAgentChat`/`AgentHomeView`) untouched.

**Tech Stack:** Node/Express + `@anthropic-ai/claude-agent-sdk@^0.2.70` + vitest (engine, repo `open-brain-ui`); React 19 + Supabase edge functions + vitest (app, repo `symphonyOS`).

**Repos:** Engine work is in `/Users/scottkaufman/Developer/open-brain-ui`. App work is in this worktree (`symphonyOS`). They are separate git repos — commit in each independently.

---

## Critical design notes (read before starting)

1. **The fence is `canUseTool`, not `allowedTools`.** In this SDK `allowedTools` is an auto-approve list, not a hard restriction, and it is bypassed under `permissionMode: 'bypassPermissions'`. The Symphony scope therefore uses `permissionMode: 'default'` + a `canUseTool` callback that **denies any tool not in `SYMPHONY_ALLOWED_TOOLS`**. `allowedTools`/`disallowedTools` are set too, as secondary signals, but the test and the security guarantee rest on `canUseTool`.
2. **`cwd` stays the vault.** We do NOT use a neutral cwd (that risked breaking `symphony_*` MCP loading). `canUseTool` denies file tools regardless of cwd.
3. **Calendar is OUT of v1.** Google Calendar is a `google-services`/claude.ai connector scoped to the vault project; it is not reliably reachable headless and is not in the v1 whitelist. Calendar = phase 2.
4. **v1 is safe-only:** the whitelist excludes `symphony_delete_task` and any destructive op. No confirm-cards yet (phase 2).
5. **Task 1 is a verification spike on the Mac Mini.** It confirms (a) `symphony_*` tools are reachable by the engine and (b) `canUseTool` actually fires (isn't skipped). Do it first; it de-risks everything after.

## File structure

**Engine (`open-brain-ui`):**
- Modify `server/lib/agent.ts` — add `SYMPHONY_ALLOWED_TOOLS`, `symphonyCanUseTool`, `SYMPHONY_SYSTEM_PROMPT`, `buildAgentOptions(scope, sessionId)`; thread `scope` through `runAgent`/`runAgentStream`.
- Modify `server/routes/agent-chat.ts` — derive `scope` from `channelId` prefix; skip the personal memory prefix for the symphony scope.
- Create `server/lib/agent-scope.test.ts` — the security-critical fence test + options test.

**App (`symphonyOS`):**
- Create `supabase/functions/agent-proxy/index.ts` — copied from `assistant-pane` (JWT gate + SSE passthrough; unchanged).
- Create `src/lib/agentStream.ts` (+ `.test.ts`) — copied from `assistant-pane` (SSE parser + client; unchanged).
- Create `src/hooks/useSymphonyAssistant.ts` (+ `.test.ts`) — the `assistant-pane` `useAgentChat` content, on channel `symphony:web`. (New file; does NOT touch the existing `useAgentChat`.)
- Modify `src/components/chat/ChatPanel.tsx` — add `toolActivity` prop + render line.
- Modify `src/components/layout/AppShell.tsx` — add `chatToolActivity` prop, pass to `ChatPanel`.
- Modify `src/App.tsx` — instantiate `useSymphonyAssistant`, repoint the `AppShell` chat props to it.
- After cutover: delete `src/hooks/useChat.ts` and `supabase/functions/symphony-chat/`.

---

## PHASE 0 — Verification spike (Mac Mini)

### Task 1: Confirm tool reachability + that `canUseTool` fires

**No code commit.** This is a diagnostic on the machine that runs the engine.

- [ ] **Step 1: SSH to the Mini and locate the engine**

Run: `ssh <mac-mini>` then `cd ~/Developer/open-brain-ui` (adjust host/path; see memory `infra_mac_mini_open_brain`). Confirm `pm2 list` shows `open-brain` running.

- [ ] **Step 2: Confirm `symphony_*` tools are configured for the engine's Claude environment**

Run (on the Mini): `claude mcp list` (or inspect the Mini's `~/.claude.json` / the open-brain-ui project `.mcp.json`) and confirm a server named `symphony` is present and its tools are `symphony_list_tasks`, `symphony_create_task`, `symphony_update_task`, `symphony_complete_task`, `symphony_create_project`, `symphony_list_projects`, `symphony_list_contacts`, `symphony_list_household_members`, `symphony_daily_summary` (tool ids surface to the SDK as `mcp__symphony__<tool>`).
Expected: server present. **If absent:** the fenced agent cannot act — STOP and configure the `symphony` MCP server on the Mini before continuing (out of scope for this plan; it is a prerequisite that full-Michael also depends on).

- [ ] **Step 3: Confirm `canUseTool` fires under `permissionMode: 'default'`**

Add a temporary probe to `server/lib/agent.ts` `runAgentStream` options (locally on the Mini or in a scratch script): `permissionMode: 'default'`, `canUseTool: async (name) => { console.log('[canUseTool]', name); return { behavior: 'allow' } }`. Send one message that triggers a tool (e.g. via `curl -XPOST localhost:<port>/api/agent-chat/stream -d '{"message":"list my tasks","channelId":"web:default"}'`).
Expected: `[canUseTool] mcp__symphony__symphony_list_tasks` prints. **If it does NOT print** (callback skipped), fall back to `disallowedTools` as the fence and note it; re-plan Task 2's mechanism. Remove the probe afterward.

- [ ] **Step 4: Record findings**

Write the confirmed tool ids and the `canUseTool`-fires result as a comment at the top of `server/lib/agent-scope.test.ts` (created in Task 2). No commit yet.

---

## PHASE 1 — Engine: the fenced Symphony scope (`open-brain-ui`)

All paths below are under `/Users/scottkaufman/Developer/open-brain-ui`. Run commands from that directory.

### Task 2: The fence — `SYMPHONY_ALLOWED_TOOLS` + `symphonyCanUseTool`

**Files:**
- Modify: `server/lib/agent.ts`
- Test: `server/lib/agent-scope.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/lib/agent-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SYMPHONY_ALLOWED_TOOLS, symphonyCanUseTool } from './agent.js'

describe('symphony fence', () => {
  it('allows whitelisted symphony tools', async () => {
    for (const name of SYMPHONY_ALLOWED_TOOLS) {
      const r = await symphonyCanUseTool(name, {}, {} as any)
      expect(r.behavior).toBe('allow')
    }
  })

  it('denies filesystem, vault, gmail, granola, and destructive tools', async () => {
    const forbidden = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch',
      'mcp__google-services__gmail_send',
      'mcp__granola__search_meetings',
      'mcp__symphony__symphony_delete_task',
    ]
    for (const name of forbidden) {
      const r = await symphonyCanUseTool(name, {}, {} as any)
      expect(r.behavior).toBe('deny')
    }
  })

  it('whitelist contains no destructive or non-symphony-non-calendar tool', () => {
    for (const t of SYMPHONY_ALLOWED_TOOLS) {
      expect(t.startsWith('mcp__symphony__')).toBe(true)
      expect(t).not.toBe('mcp__symphony__symphony_delete_task')
    }
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run server/lib/agent-scope.test.ts`
Expected: FAIL — `SYMPHONY_ALLOWED_TOOLS`/`symphonyCanUseTool` not exported.

- [ ] **Step 3: Implement in `server/lib/agent.ts`**

Add near the top (after `AGENT_MODEL`):

```ts
/** v1 fence: only these (safe, read/create/update) Symphony tools are reachable. */
export const SYMPHONY_ALLOWED_TOOLS: readonly string[] = [
  'mcp__symphony__symphony_list_tasks',
  'mcp__symphony__symphony_create_task',
  'mcp__symphony__symphony_update_task',
  'mcp__symphony__symphony_complete_task',
  'mcp__symphony__symphony_create_project',
  'mcp__symphony__symphony_list_projects',
  'mcp__symphony__symphony_list_contacts',
  'mcp__symphony__symphony_list_household_members',
  'mcp__symphony__symphony_daily_summary',
]

const SYMPHONY_ALLOWED_SET = new Set(SYMPHONY_ALLOWED_TOOLS)

/**
 * Authoritative fence for the Symphony scope: deny any tool not on the
 * v1 whitelist. This is the real boundary (allowedTools is only an
 * auto-approve hint in this SDK). Shape matches the SDK CanUseTool type.
 */
export async function symphonyCanUseTool(
  toolName: string,
  _input: Record<string, unknown>,
  _opts: unknown,
): Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }> {
  if (SYMPHONY_ALLOWED_SET.has(toolName)) return { behavior: 'allow' }
  return { behavior: 'deny', message: `${toolName} is not available to the Symphony assistant.` }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run server/lib/agent-scope.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/agent.ts server/lib/agent-scope.test.ts
git commit -m "feat(agent): symphony fence (canUseTool deny-by-default + whitelist)"
```

### Task 3: Symphony system prompt

**Files:**
- Modify: `server/lib/agent.ts`

- [ ] **Step 1: Add the prompt constant** (after `SYSTEM_PROMPT`)

```ts
/**
 * System prompt for the FENCED Symphony scope. No vault/chief-of-staff
 * framing — this assistant operates only inside Symphony via symphony_* tools.
 */
export const SYMPHONY_SYSTEM_PROMPT = `You are the assistant inside Symphony, Scott's task, project, and routine manager. You help manage tasks, projects, and contacts using the symphony_* tools available to you.

Rules:
- You operate ONLY within Symphony. You have no access to files, email, the vault, or the web. If asked to do something outside Symphony, say so plainly and stop.
- No em dashes. No AI cliches. No sycophancy. Be direct and action-oriented.
- Just do it; don't narrate what you are about to do.

Symphony domain model:
- Tasks have a context: work, family, or personal. An unscheduled task (no date) lives in the inbox.
- contact_id = who the task is ABOUT. assigned_to = who should DO it. They are different.
- When the user asks you to add/complete/reschedule something, use the tools directly.
- When unsure which context or date the user means, ask one short question rather than guessing.

Keep replies tight. Summary first, offer to expand.`
```

- [ ] **Step 2: Commit** (no test — prose constant; covered by Task 4's options test)

```bash
git add server/lib/agent.ts
git commit -m "feat(agent): Symphony-scoped system prompt"
```

### Task 4: `buildAgentOptions(scope, sessionId)`

**Files:**
- Modify: `server/lib/agent.ts`
- Test: `server/lib/agent-scope.test.ts`

- [ ] **Step 1: Add failing test** (append to `agent-scope.test.ts`)

```ts
import { buildAgentOptions } from './agent.js'

describe('buildAgentOptions', () => {
  it('symphony scope fences via canUseTool + default permissions + symphony prompt', () => {
    const o = buildAgentOptions('symphony') as Record<string, any>
    expect(o.permissionMode).toBe('default')
    expect(typeof o.canUseTool).toBe('function')
    expect(o.systemPrompt).toContain('inside Symphony')
    expect(o.permissionMode).not.toBe('bypassPermissions')
  })

  it('michael scope keeps the existing unfenced config', () => {
    const o = buildAgentOptions('michael') as Record<string, any>
    expect(o.permissionMode).toBe('bypassPermissions')
    expect(o.canUseTool).toBeUndefined()
  })

  it('threads resume sessionId when given', () => {
    const o = buildAgentOptions('symphony', 'sess-123') as Record<string, any>
    expect(o.resume).toBe('sess-123')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run server/lib/agent-scope.test.ts`
Expected: FAIL — `buildAgentOptions` not exported.

- [ ] **Step 3: Implement in `server/lib/agent.ts`**

Add (above `runAgent`), then refactor `runAgent`/`runAgentStream` to use it:

```ts
export type AgentScope = 'michael' | 'symphony'

/** Build the SDK query options for a given scope. Pure + testable. */
export function buildAgentOptions(scope: AgentScope, sessionId?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    cwd: VAULT_PATH || process.cwd(),
    model: AGENT_MODEL,
    settingSources: ['project', 'user'],
  }

  if (scope === 'symphony') {
    base.systemPrompt = SYMPHONY_SYSTEM_PROMPT
    base.permissionMode = 'default'          // so canUseTool is consulted
    base.canUseTool = symphonyCanUseTool      // the authoritative fence
    base.allowedTools = [...SYMPHONY_ALLOWED_TOOLS] // secondary hint
  } else {
    base.permissionMode = 'bypassPermissions'
    base.allowDangerouslySkipPermissions = true
  }

  if (sessionId) base.resume = sessionId
  return base
}
```

Then change both `runAgent` and `runAgentStream` to accept `scope` and use it. In `runAgent`, replace its inline `const options = {...}` block with `const options = buildAgentOptions(scope, sessionId)` and update the signature:

```ts
export async function runAgent(
  message: string,
  sessionId?: string,
  onTyping?: () => void,
  scope: AgentScope = 'michael',
): Promise<{ text: string | null; newSessionId?: string }> {
```
(Move the `onTyping` typing-interval logic unchanged; just swap the options source.)

In `runAgentStream`, replace its inline options with `buildAgentOptions(scope, sessionId)` and update the signature:

```ts
export async function* runAgentStream(
  message: string,
  sessionId?: string,
  scope: AgentScope = 'michael',
): AsyncGenerator<AgentStreamEvent, void> {
  const options = buildAgentOptions(scope, sessionId)
  try {
    for await (const event of query({ prompt: message, options })) {
      for (const mapped of mapSdkEvent(event as unknown as Record<string, unknown>)) yield mapped
    }
  } catch (err) {
    logger.error({ err }, 'Agent stream failed')
    yield { type: 'error', message: 'Agent stream failed' }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run server/lib/agent-scope.test.ts && npx tsc -b`
Expected: tests PASS (6 total), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add server/lib/agent.ts server/lib/agent-scope.test.ts
git commit -m "feat(agent): buildAgentOptions(scope) — fenced symphony vs full michael"
```

### Task 5: Route derives scope from channel prefix

**Files:**
- Modify: `server/routes/agent-chat.ts:99-148` (the `/api/agent-chat/stream` handler)

- [ ] **Step 1: Edit the stream handler** to derive scope and skip personal memory for symphony

Replace the body between `const channelId = ...` and the `runAgentStream(...)` call so it reads:

```ts
  const channelId = providedChannelId || 'web:default'
  const scope = channelId.startsWith('symphony:') ? 'symphony' : 'michael'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.flushHeaders?.()

  // Symphony scope is task-only; do not inject Scott's personal/life memory.
  const fullMessage = scope === 'symphony'
    ? message
    : (() => { const p = buildMemoryContext(channelId, message); return p ? `${p}\n${message}` : message })()
  const existingSessionId = getSession(channelId)
```

And update the loop call:

```ts
    for await (const event of runAgentStream(fullMessage, existingSessionId || undefined, scope)) {
```

Leave the session/history persistence below unchanged (channel-scoped, works for `symphony:web`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/routes/agent-chat.ts
git commit -m "feat(agent-chat): derive symphony scope from channel prefix; skip personal memory"
```

### Task 6: Deploy the engine

- [ ] **Step 1: Run the engine test suite + build**

Run: `npx vitest run && npx tsc -b`
Expected: all pass.

- [ ] **Step 2: Deploy to the Mini**

Push/pull this repo to the Mini and `pm2 restart open-brain` (per `infra_mac_mini_open_brain`). Then smoke test:
Run: `curl -N -XPOST <engine>/api/agent-chat/stream -H 'Content-Type: application/json' -d '{"message":"list my tasks","channelId":"symphony:web"}'`
Expected: SSE frames including a `tool` event `mcp__symphony__symphony_list_tasks` and a `done` event. Then:
Run the same with `"message":"read my vault file context/health.md"`.
Expected: the agent declines (fenced); NO file is read; reply says it can't access files.

---

## PHASE 2 — App: wire the pane to the fenced agent (`symphonyOS`)

All paths below are in this worktree. Run commands from the worktree root.

### Task 7: Bring over the SSE transport (proxy + parser)

**Files:**
- Create: `supabase/functions/agent-proxy/index.ts`
- Create: `src/lib/agentStream.ts`
- Create: `src/lib/agentStream.test.ts`

- [ ] **Step 1: Copy the three files verbatim from the `assistant-pane` branch**

```bash
mkdir -p supabase/functions/agent-proxy
git show assistant-pane:supabase/functions/agent-proxy/index.ts > supabase/functions/agent-proxy/index.ts
git show assistant-pane:src/lib/agentStream.ts > src/lib/agentStream.ts
git show assistant-pane:src/lib/agentStream.test.ts > src/lib/agentStream.test.ts
```

(These are self-contained and unchanged for the fenced scope — the proxy forwards `channelId` as-is, so `symphony:web` flows straight through.)

- [ ] **Step 2: Run the parser test**

Run: `npx vitest run src/lib/agentStream.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-proxy/index.ts src/lib/agentStream.ts src/lib/agentStream.test.ts
git commit -m "feat(assistant): SSE proxy + stream parser (from assistant-pane)"
```

### Task 8: `useSymphonyAssistant` hook (new, on `symphony:web`)

**Files:**
- Create: `src/hooks/useSymphonyAssistant.ts`
- Create: `src/hooks/useSymphonyAssistant.test.ts`

- [ ] **Step 1: Confirm the Open Brain helpers exist**

Run: `grep -n "export.*getAgentChatHistory\|export.*resetAgentSession" src/lib/openBrain.ts`
Expected: both present. **If missing**, copy them from `git show assistant-pane:src/lib/openBrain.ts` first (they call `/api/agent-chat/history` and `/api/agent-chat/reset` with the channel id).

- [ ] **Step 2: Create the hook** — the `assistant-pane` `useAgentChat` content, renamed, on the Symphony channel

```bash
git show assistant-pane:src/hooks/useAgentChat.ts > src/hooks/useSymphonyAssistant.ts
```

Then edit `src/hooks/useSymphonyAssistant.ts`:
- Rename the export: `export function useAgentChat()` → `export function useSymphonyAssistant()`.
- Change the channel constant: `const CHANNEL_ID = 'web:default'` → `const CHANNEL_ID = 'symphony:web'`.

(Leaves the existing `src/hooks/useAgentChat.ts` — used by `AgentHomeView` / full Michael — untouched.)

- [ ] **Step 3: Create the test**

```bash
git show assistant-pane:src/hooks/useAgentChat.test.ts > src/hooks/useSymphonyAssistant.test.ts
```

Then edit `src/hooks/useSymphonyAssistant.test.ts`: change the import `from '@/hooks/useAgentChat'` → `from '@/hooks/useSymphonyAssistant'` and the hook call `useAgentChat()` → `useSymphonyAssistant()`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/hooks/useSymphonyAssistant.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSymphonyAssistant.ts src/hooks/useSymphonyAssistant.test.ts src/lib/openBrain.ts
git commit -m "feat(assistant): useSymphonyAssistant hook on symphony:web channel"
```

### Task 9: ChatPanel tool-activity line

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Add the `toolActivity` prop** to `ChatPanelProps` (after `onAddTask?`):

```ts
  toolActivity?: string[]
```

- [ ] **Step 2: Destructure it** in the component params (after `onAddTask,`):

```ts
  toolActivity,
```

- [ ] **Step 3: Render the activity line** — insert just before the `{/* Input */}` block / `<ChatInput`:

```tsx
      {/* Tool activity */}
      {toolActivity && toolActivity.length > 0 && loading && (
        <div className="px-4 py-1.5 text-xs text-neutral-400 border-t border-neutral-200/60">
          {toolActivity[toolActivity.length - 1].replace(/^mcp__symphony__symphony_/, '').replace(/^symphony_/, '').replace(/_/g, ' ')}…
        </div>
      )}
```

(Prefix strip handles the full `mcp__symphony__symphony_create_task` tool id → "create task…".)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "feat(chat): show last tool activity in ChatPanel"
```

### Task 10: AppShell passthrough

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add the prop** to AppShell's props interface (near the other `chat*` props):

```ts
  chatToolActivity?: string[]
```

- [ ] **Step 2: Destructure it** in the component params alongside the other chat props.

- [ ] **Step 3: Pass it to every `<ChatPanel … />`** render site (search the file for `<ChatPanel`; there are wide/narrow/mobile instances). Add to each:

```tsx
        toolActivity={chatToolActivity}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat(shell): pass chatToolActivity through to ChatPanel"
```

### Task 11: Repoint the pane in App.tsx

**Files:**
- Modify: `src/App.tsx`

(Anchor by content — `main` has diverged from `assistant-pane`, so line numbers differ.)

- [ ] **Step 1: Import the hook** — after the `useChat` import line:

```ts
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
```

- [ ] **Step 2: Instantiate it** — right after `const chat = useChat()`:

```ts
  const assistant = useSymphonyAssistant()
```

- [ ] **Step 3: Repoint the `AppShell` chat props.** Find the `<AppShell` props that currently read from `chat.*` and replace with:

```tsx
      chatMessages={assistant.messages}
      chatLoading={assistant.loading}
      chatError={assistant.error}
      chatEntityContext={null}
      chatMode={'chat'}
      onChatSend={assistant.sendMessage}
      onChatClear={assistant.resetSession}
      chatToolActivity={assistant.toolActivity}
```

And hide the session list / new-chat wiring (reconciliation still deferred):

```tsx
      chatSessions={[]}
      chatSessionsLoading={false}
      onChatNewChat={assistant.resetSession}
      activeChatSessionId={null}
```

Leave `onChatDeleteSession={chatSessions.deleteSession}` as-is (harmless with an empty list) unless tsc complains about an unused `chatSessions` — if so, keep `useChatSessions()` only if still referenced; otherwise remove its now-unused bits in Task 13's cleanup.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc -b`
Expected: clean. (If `chat`/`handleChatNewChat`/entityContext become unused, that's expected — they're removed in Task 13.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(assistant): repoint right-rail pane to fenced Symphony agent"
```

### Task 12: Configure secrets + deploy the proxy

- [ ] **Step 1: Set the edge-function secrets** (Supabase project `mwadppyrqzuzgstmwpuy`)

Run:
```bash
npx supabase secrets set OPEN_BRAIN_URL=<engine base url> OPEN_BRAIN_API_KEY=<engine key> --project-ref mwadppyrqzuzgstmwpuy
```
(`SUPABASE_URL`/`SUPABASE_ANON_KEY` are auto-injected.)

- [ ] **Step 2: Deploy the function**

Run: `npx supabase functions deploy agent-proxy --project-ref mwadppyrqzuzgstmwpuy`
Expected: deploy succeeds. (Leave `verify_jwt` at default true — the function also verifies the user JWT itself.)

- [ ] **Step 3: Smoke test from a browser session** — open Symphony locally (`npm run dev`), sign in, open the rail, send "list my tasks".
Expected: streams a grounded answer; the tool-activity line shows "list tasks…"; tasks are correct.

### Task 13: Manual acceptance — prove the fence live

- [ ] **Step 1: Action works** — in the rail: "add a task to call the plumber tomorrow, family context".
Expected: task appears in Today/inbox with `context=family`; assistant confirms.

- [ ] **Step 2: Fence holds** — in the rail: "open my vault note context/health.md and summarize it" and "send an email to Iris".
Expected: the assistant declines both, says it only works inside Symphony; no file read, no email. (This is the user-facing proof of Task 2's test.)

- [ ] **Step 3: Offline degradation** — stop the engine (`pm2 stop open-brain` on the Mini) and send a message.
Expected: rail shows "Assistant offline" (from `agentStream.ts`), no crash. Restart the engine after.

### Task 14: Retire the Haiku path

**Files:**
- Delete: `src/hooks/useChat.ts`
- Delete: `supabase/functions/symphony-chat/` (directory)
- Modify: `src/App.tsx` (remove now-dead `useChat`/`useChatSessions` wiring), and any other importer of `useChat`.

- [ ] **Step 1: Find remaining importers**

Run: `grep -rn "useChat\b\|hooks/useChat\|symphony-chat" src --include=*.ts --include=*.tsx | grep -v useChatSessions`
Expected: only `App.tsx` (and the deleted hook). Resolve each — App.tsx should no longer need `const chat = useChat()`.

- [ ] **Step 2: Delete the files**

```bash
git rm src/hooks/useChat.ts
git rm -r supabase/functions/symphony-chat
```

- [ ] **Step 3: Remove dead wiring in App.tsx** — delete the `useChat` import, `const chat = useChat()`, and any `handleChatNewChat`/entity-context state now unused. Keep `ChatMessage` available: `useSymphonyAssistant` imports `type { ChatMessage } from '@/hooks/useChat'` — **before deleting `useChat.ts`, move the `ChatMessage` type** to a standalone `src/types/chat.ts` (or into `useSymphonyAssistant.ts`) and update both `useSymphonyAssistant.ts` and `ChatPanel.tsx` imports.

- [ ] **Step 4: Typecheck, test, build**

Run: `npx tsc -b && npx vitest run && npm run build`
Expected: all clean. No dangling `useChat`/`symphony-chat` references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(assistant): retire Haiku symphony-chat path; one assistant backend"
```

---

## Self-review

**Spec coverage:**
- Fenced engine scope (allowlist + Symphony prompt + Opus/$0) → Tasks 2-4. ✅ (fence mechanism upgraded to `canUseTool` per the design note.)
- Endpoint/channel isolation (`symphony:web`, separate sessions) → Task 5 (scope from prefix) + Task 8 (channel). ✅
- Reuse assistant-pane plumbing → Tasks 7-8 (copy verbatim), 9-11 (wiring). ✅
- v1 safe-only; calendar/destructive/confirm/multi-user deferred → encoded in `SYMPHONY_ALLOWED_TOOLS` (Task 2) and the design notes. ✅ (Calendar moved fully out of v1 vs the spec's "read-only in v1" — flagged to user.)
- Retire old path → Task 14. ✅
- Fence enforced by a test → Task 2. ✅
- Error handling (offline/auth) → reused from `agentStream.ts`; verified in Task 13 Step 3. ✅
- Verification spike for the Mini-config unknown → Task 1. ✅

**Type consistency:** `AgentScope`, `buildAgentOptions`, `symphonyCanUseTool`, `SYMPHONY_ALLOWED_TOOLS` are used identically across Tasks 2-5. `ChatMessage` import path is explicitly handled in Task 14 Step 3 before its source file is deleted. `toolActivity` prop name matches across ChatPanel (Task 9), AppShell (Task 10), App.tsx (`chatToolActivity`, Task 11). `useSymphonyAssistant` name consistent across Tasks 8/11.

**Open dependency (not a placeholder, a real prerequisite):** Task 1 Step 2 — if the Mini has no `symphony` MCP server, the whole feature is blocked; this is called out as STOP-and-configure.
