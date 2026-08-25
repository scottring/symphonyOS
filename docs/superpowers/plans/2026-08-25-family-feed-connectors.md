# Family Feed Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the twins' school logistics out of ClassDojo and the WhatsApp parent groups automatically, cull the noise, and land only the actionable items in Symphony for triage — with no human ever opening either app.

**Architecture:** One always-on Fly.io worker runs two read-only source adapters. Each buffers new messages for allowlisted threads, renders them into the WhatsApp-export text format the shipped `extract-capture` pipeline already parses, and POSTs them to the existing `capture-to-inbox` edge function twice a day. Everything downstream — checkpoint dedupe, Claude extraction, candidate tasks, the noise summary — is already built and is reused unchanged except for two small edits. Candidates surface in a new "School · N" dropdown in Today's controls strip, beside the existing Week/Month pools.

**Tech Stack:** TypeScript, Node 22 (worker), `@whiskeysockets/baileys` (WhatsApp multi-device), Supabase (Postgres + Deno edge functions), React 19 + Tailwind v4 (UI), Vitest, Fly.io.

**Spec:** `docs/superpowers/specs/2026-08-25-family-feed-connectors-design.md`

## Global Constraints

- **Node version:** run `node -v` FIRST. This repo requires **22.14.0**; the machine defaults to a newer Node that breaks the test environment. Before any npm/npx command:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Tests:** `npm test` is WATCH mode. Always use `npx vitest run <path>`.
- **Type-check:** `npx tsc --noEmit` at the root is a NO-OP. Use `npx tsc --noEmit -p tsconfig.app.json` for app code and `npx tsc --noEmit -p connectors/tsconfig.json` for the worker.
- **Worktree:** all work happens in `.worktrees/family-feeds` on branch `feat/family-feed-connectors`. Never edit or commit in the main worktree.
- **No emojis in code or UI.** Use lucide icons.
- **The worker never sends.** No message, reaction, read receipt, presence update, group join or leave, on either service. This is enforced by tests in Task 9 and is the entire basis of the risk decision — it is not negotiable and not refactorable away.
- **DDL cannot be run by an agent.** The Management API curl is blocked by the classifier. Migration SQL is written to a file and handed to Scott to run. Do not write code that depends on a column until Scott confirms it exists.
- **`scope` must always be set explicitly on `tasks` and `notes` writes.** RLS shares on `scope`, not `context`. A `context='family'` row left at the `individual` default looks shared and is not.
- **Never partial-`upsert` the `tasks` table.** Use `.update().eq()`.
- **Timestamps rendered for the parser are naive local time** in the household's IANA zone (`America/New_York`), never UTC. `filterSince` compares them as lexicographic strings, so a zone mismatch silently drops or replays messages.

---

## File Structure

**New — the worker (deployed to Fly, not to Vercel):**

| File | Responsibility |
|---|---|
| `connectors/package.json` | Worker deps and scripts. Separate from the root package. |
| `connectors/tsconfig.json` | Type-check config for the worker. |
| `connectors/Dockerfile` | Fly build. |
| `connectors/fly.toml` | Fly app + volume config. |
| `connectors/README.md` | Deploy + QR-link runbook. |
| `connectors/src/types.ts` | `ConnectorMessage`, `FlushPayload`, `WatchedSource`. Shared vocabulary. |
| `connectors/src/config.ts` | Environment parsing, fail-fast on missing secrets. |
| `connectors/src/render.ts` | `ConnectorMessage[]` → WhatsApp-export text. **Pure.** The format contract with `parseWhatsAppExport`. |
| `connectors/src/buffer.ts` | Per-source in-memory message buffer. **Pure.** |
| `connectors/src/highWater.ts` | Per-source high-water marks persisted to the volume. |
| `connectors/src/capture.ts` | POST to `capture-to-inbox`; advance the mark only on 2xx. |
| `connectors/src/watchlist.ts` | Read `capture_sources` from Supabase. |
| `connectors/src/health.ts` | Heartbeat upsert to `connector_health`. |
| `connectors/src/whatsapp/adapter.ts` | Baileys wiring. **Receive-only.** |
| `connectors/src/classdojo/map.ts` | ClassDojo API response → `ConnectorMessage[]`. **Pure.** |
| `connectors/src/classdojo/client.ts` | Authenticated ClassDojo HTTP client. |
| `connectors/src/scheduler.ts` | The flush tick. |
| `connectors/src/index.ts` | Composition root. |
| `connectors/docs/classdojo-api.md` | Task 0's recorded findings. Task 12 implements against this. |

**Modified — Supabase:**

| File | Change |
|---|---|
| `supabase/migrations/2026-08-25_family_feed_connectors.sql` | New: `capture_sources`, `connector_health`, `tasks.capture_id`. |
| `supabase/functions/capture-to-inbox/index.ts` | Accept `kind='classdojo_thread'`. |
| `supabase/functions/extract-capture/index.ts` | Dedupe both timestamped kinds; stamp `capture_id` on candidate tasks. |

**Modified — app:**

| File | Change |
|---|---|
| `src/types/task.ts` | `captureId?: string`. |
| `src/hooks/useSupabaseTasks.ts` | `DbTask.capture_id` + mapper line. |
| `src/lib/today/schoolPool.ts` | New: `selectSchoolPool`, `parseCaptureMeta`. |
| `src/hooks/useCaptureLabels.ts` | New: capture id → source label. |
| `src/components/schedule/HorizonPoolDropdown.tsx` | New optional `metaFor` prop. |
| `src/components/schedule/TodayView.tsx` | Render the School dropdown. |
| `vitest.config.ts` | Include `connectors/src/**`. |

---

## Task 0: Spike and prod verification (GATE — no production code)

Nothing else in this plan may start until this task's three answers are recorded. Two of them can invalidate later tasks.

**Files:**
- Create: `connectors/docs/classdojo-api.md`

**Interfaces:**
- Produces: `connectors/docs/classdojo-api.md`, containing the four headings listed in Step 3. Task 12 reads it as its only source of ClassDojo endpoint truth.

- [ ] **Step 1: Verify the `captures` migration is actually live in production**

The migration file `supabase/migrations/2026-05-31_captures_and_checkpoints.sql` exists in the repo, but this repo's migrations are known to drift from the deployed database. If those tables are absent, slice 1 of the capture pipeline has never worked and this entire plan is built on nothing.

Ask Scott to run this in the Supabase SQL editor and report the output:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('captures', 'capture_checkpoints');
```

Expected: two rows. **If either is missing, STOP** — the fix is to run `2026-05-31_captures_and_checkpoints.sql` first, and that is a prerequisite, not part of this plan.

- [ ] **Step 2: Confirm the ClassDojo transport**

Log into ClassDojo in a browser as Scott, open DevTools → Network, and load the class story for one of the twins' classes. Record what you observe. Do not guess and do not write code yet.

- [ ] **Step 3: Write the findings file**

Create `connectors/docs/classdojo-api.md` with exactly these four headings, each filled with observed fact (not assumption):

```markdown
# ClassDojo transport — observed 2026-08-25

## Login
<!-- Endpoint, method, request body shape, what a success response sets
     (cookie name(s), expiry). Whether 2FA or a captcha is involved.
     If login cannot be scripted, say so plainly — that selects the
     Playwright fallback in Task 12. -->

## Listing a class story
<!-- Endpoint, method, query params. Whether it supports a since/cursor
     parameter or only page/offset. -->

## Response shape
<!-- A real (redacted) JSON sample of one post: id, created-at field name
     and format, author name field, body text field, attachment fields. -->

## Stable identifiers
<!-- What identifies a class/thread across sessions — this becomes
     source_key as "classdojo:<id>". -->
```

- [ ] **Step 4: Record the verdict**

Append one of these two lines to the file:

- `VERDICT: API path viable. Task 12 implements the HTTP client.`
- `VERDICT: API path not viable (<reason>). Task 12 implements the Playwright fallback against the same contract in connectors/src/types.ts.`

- [ ] **Step 5: Hand Scott the DDL**

Task 1 writes the migration file. Tell Scott it needs running before Task 13 and after Task 1, and that Tasks 2–12 do not depend on it.

- [ ] **Step 6: Commit**

```bash
git add connectors/docs/classdojo-api.md
git commit -m "docs(connectors): record observed ClassDojo transport"
```

---

## Task 1: Migration file and the `captureId` field

**Files:**
- Create: `supabase/migrations/2026-08-25_family_feed_connectors.sql`
- Modify: `src/types/task.ts`
- Modify: `src/hooks/useSupabaseTasks.ts` (`DbTask` interface ~line 44, `dbTaskToTask` ~line 107)
- Test: `src/hooks/dbTaskToTask.captureId.test.ts`

**Interfaces:**
- Produces: `Task.captureId?: string`, mapped from `DbTask.capture_id`. Tasks 13–15 depend on it.
- Produces: tables `capture_sources`, `connector_health`, and column `tasks.capture_id`. Tasks 8, 10, 13, 14, 16 depend on them.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/2026-08-25_family_feed_connectors.sql`:

```sql
-- Family Feed Connectors (2026-08-25 spec).
-- capture_sources: the allowlist of threads the connectors may read.
-- connector_health: heartbeat, so a dead feed is distinguishable from a quiet one.
-- tasks.capture_id: which capture produced a candidate, for the School pool.

create table if not exists capture_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector in ('whatsapp','classdojo')),
  source_key text not null,
  source_label text not null,
  child_member_id uuid references family_members(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create table if not exists connector_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector in ('whatsapp','classdojo')),
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, connector)
);

alter table tasks add column if not exists capture_id uuid
  references captures(id) on delete set null;

-- The School pool reads incomplete inbox tasks that came from a capture.
create index if not exists tasks_capture_idx
  on tasks (user_id, capture_id) where capture_id is not null;

alter table capture_sources enable row level security;
alter table connector_health enable row level security;

-- Read-own. The connectors use the service-role key, which bypasses RLS.
create policy capture_sources_owner on capture_sources
  for select using (auth.uid() = user_id);
create policy connector_health_owner on connector_health
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Write the failing test**

Create `src/hooks/dbTaskToTask.captureId.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dbTaskToTask, type DbTask } from './useSupabaseTasks'

// A capture-derived candidate carries the id of the capture that produced it.
// The School pool selects on exactly this field, so it must survive the mapper.
const row = (over: Partial<DbTask>): DbTask => ({
  id: 't1', user_id: 'u1', title: 'Bring a white t-shirt', completed: false,
  bucket: 'inbox', scheduled_for: null, deferred_until: null, defer_count: null,
  is_all_day: null, is_someday: null, context: 'family', scope: 'compound',
  category: 'task', notes: null, links: null, phone_number: null, email: null,
  contact_id: null, assigned_to: null, assigned_to_all: null, project_id: null,
  parent_task_id: null, group_members: null, linked_event_id: null,
  link_type: null, linked_activity_type: null, linked_activity_id: null,
  estimated_duration: null, location: null, location_place_id: null,
  directions: null, is_waiting: null, waiting_since: null, waiting_for: null,
  needs_discussion: null, created_at: '2026-08-25T12:00:00Z',
  updated_at: '2026-08-25T12:00:00Z',
  ...over,
} as DbTask)

describe('dbTaskToTask captureId', () => {
  it('maps capture_id through', () => {
    expect(dbTaskToTask(row({ capture_id: 'cap-1' } as Partial<DbTask>)).captureId).toBe('cap-1')
  })

  it('leaves captureId undefined for an ordinary task', () => {
    expect(dbTaskToTask(row({ capture_id: null } as Partial<DbTask>)).captureId).toBeUndefined()
  })
})
```

Note: the `row()` helper spreads a full `DbTask`; if the interface has fields this fixture omits, add them with `null` — the fixture must use the RAW column values, not the app-side shape.

- [ ] **Step 3: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/hooks/dbTaskToTask.captureId.test.ts
```

Expected: FAIL — `captureId` is `undefined` in the first case.

- [ ] **Step 4: Add the field to the Task type**

In `src/types/task.ts`, in the `Task` interface, after the `notes?: string` line:

```typescript
  /** Set when this task was extracted from a capture (WhatsApp/ClassDojo feed).
   * Drives the School pool and its source chip. */
  captureId?: string
```

- [ ] **Step 5: Add the column to `DbTask` and the mapper**

In `src/hooks/useSupabaseTasks.ts`, in the `DbTask` interface after `notes: string | null`:

```typescript
  capture_id: string | null
```

In `dbTaskToTask`, after the `notes: dbTask.notes ?? undefined,` line:

```typescript
    captureId: dbTask.capture_id ?? undefined,
```

The task query uses `.select('*')`, so no query change is needed.

- [ ] **Step 6: Run the test to verify it passes**

```bash
npx vitest run src/hooks/dbTaskToTask.captureId.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no new errors in `src/types/task.ts` or `src/hooks/useSupabaseTasks.ts`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/2026-08-25_family_feed_connectors.sql src/types/task.ts src/hooks/useSupabaseTasks.ts src/hooks/dbTaskToTask.captureId.test.ts
git commit -m "feat(capture): capture_sources + connector_health schema, tasks.capture_id"
```

- [ ] **Step 9: Hand the SQL to Scott**

Tell Scott the migration file is ready and needs running in the Supabase SQL editor before Task 13. Paste the file contents into the message so he does not have to go find it.

---

## Task 2: `extract-capture` dedupes both feeds and stamps the capture

**Files:**
- Modify: `supabase/functions/extract-capture/index.ts` (lines ~32-77, ~95-108, ~157-164)
- Test: `supabase/functions/extract-capture/lib/kinds.test.ts`
- Create: `supabase/functions/extract-capture/lib/kinds.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isTimestampedKind(kind: string): boolean` exported from `lib/kinds.ts`. Used only inside this function.
- Produces: candidate task rows now carry `capture_id`. Task 13's selector depends on this.

Today `extract-capture` applies checkpoint dedupe only when `kind === 'whatsapp_export'`. A `classdojo_thread` capture falls into the `else` branch, which re-extracts the entire payload every time and never advances the checkpoint. Since both connectors render the same timestamped format, both kinds must take the dedupe path — this is what makes a retried flush idempotent, which Task 7's retry logic relies on.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/extract-capture/lib/kinds.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isTimestampedKind } from './kinds'

describe('isTimestampedKind', () => {
  it('includes both connector-rendered kinds', () => {
    expect(isTimestampedKind('whatsapp_export')).toBe(true)
    expect(isTimestampedKind('classdojo_thread')).toBe(true)
  })

  it('excludes free text and images, which have no message timeline', () => {
    expect(isTimestampedKind('text')).toBe(false)
    expect(isTimestampedKind('image')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run supabase/functions/extract-capture/lib/kinds.test.ts
```

Expected: FAIL — "Failed to resolve import './kinds'".

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/extract-capture/lib/kinds.ts`:

```typescript
// Kinds whose raw_text is a timestamped message transcript in the
// "[YYYY-MM-DD, HH:mm:ss] Sender: text" format parseWhatsAppExport reads.
// These get checkpoint dedupe; everything else is extracted whole.
const TIMESTAMPED = new Set(['whatsapp_export', 'classdojo_thread'])

export function isTimestampedKind(kind: string): boolean {
  return TIMESTAMPED.has(kind)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run supabase/functions/extract-capture/lib/kinds.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Use it in the two branch conditions**

In `supabase/functions/extract-capture/index.ts`, add to the imports (after the `chunkMessages` import):

```typescript
import { isTimestampedKind } from './lib/kinds.ts'
```

Change the dedupe branch (currently `if (capture.kind === 'whatsapp_export' && capture.source_key) {`) to:

```typescript
    if (isTimestampedKind(capture.kind) && capture.source_key) {
```

Change the checkpoint-advance branch (currently `if (capture.kind === 'whatsapp_export' && capture.source_key && newestIso) {`) to:

```typescript
    if (isTimestampedKind(capture.kind) && capture.source_key && newestIso) {
```

- [ ] **Step 6: Stamp `capture_id` on candidate rows**

In the same file, in `candidateToTaskRow`, add to the returned object after the `notes: notesLines.join('\n'),` line:

```typescript
    // Which capture produced this candidate — the School pool selects on it,
    // and it is how a triage row finds its source label.
    capture_id: capture.id,
```

- [ ] **Step 7: Run the whole extract-capture suite**

```bash
npx vitest run supabase/functions/extract-capture
```

Expected: PASS — the pre-existing 12 tests plus the 2 new ones = 14.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/extract-capture/lib/kinds.ts supabase/functions/extract-capture/lib/kinds.test.ts supabase/functions/extract-capture/index.ts
git commit -m "feat(capture): dedupe classdojo_thread like whatsapp_export; stamp capture_id"
```

---

## Task 3: `capture-to-inbox` accepts a ClassDojo thread

**Files:**
- Modify: `supabase/functions/capture-to-inbox/index.ts` (`CaptureBody` ~line 22, `validateRequest` ~line 44, dispatch ~line 102)
- Test: `supabase/functions/capture-to-inbox/validate.test.ts`

**Interfaces:**
- Consumes: `isTimestampedKind` is NOT reused here — this function has its own validation vocabulary and must not import across function boundaries (each edge function deploys independently).
- Produces: `capture-to-inbox` accepts `kind: 'classdojo_thread'` with a `text` body. Task 7 posts against this.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/capture-to-inbox/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateRequest } from './index'

const headers = (secret: string) => new Headers({ 'x-capture-secret': secret })
const SECRET = 's3cret'

describe('validateRequest — classdojo_thread', () => {
  it('accepts a classdojo_thread with text', () => {
    const r = validateRequest(
      headers(SECRET),
      { user_email: 'a@b.com', kind: 'classdojo_thread', text: '[2026-08-25, 09:00:00] Gorby: Picture day Friday' },
      SECRET,
    )
    expect(r.ok).toBe(true)
  })

  it('rejects a classdojo_thread with no text', () => {
    const r = validateRequest(
      headers(SECRET),
      { user_email: 'a@b.com', kind: 'classdojo_thread' },
      SECRET,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('still accepts the legacy title-only quick capture', () => {
    const r = validateRequest(headers(SECRET), { user_email: 'a@b.com', title: 'buy milk' }, SECRET)
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run supabase/functions/capture-to-inbox/validate.test.ts
```

Expected: FAIL — the first case returns `ok: false`, because `classdojo_thread` is not in `isExtract` so it falls through to the title check.

- [ ] **Step 3: Widen the kind union and the validator**

In `supabase/functions/capture-to-inbox/index.ts`, change the `CaptureBody` interface line:

```typescript
  kind?: 'text' | 'whatsapp_export' | 'classdojo_thread'
```

In `validateRequest`, change the `isExtract` line:

```typescript
  const isExtract = body.kind === 'text' || body.kind === 'whatsapp_export' || body.kind === 'classdojo_thread'
```

and the error message on the next line:

```typescript
      return { ok: false, status: 400, error: 'text required for kind=text|whatsapp_export|classdojo_thread' }
```

- [ ] **Step 4: Route the new kind down the extract path**

In the `Deno.serve` handler, change the dispatch condition (currently `if (v.body.kind === 'text' || v.body.kind === 'whatsapp_export') {`) to:

```typescript
  if (v.body.kind === 'text' || v.body.kind === 'whatsapp_export' || v.body.kind === 'classdojo_thread') {
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run supabase/functions/capture-to-inbox/validate.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/capture-to-inbox/index.ts supabase/functions/capture-to-inbox/validate.test.ts
git commit -m "feat(capture): capture-to-inbox accepts classdojo_thread"
```

---

## Task 4: Worker scaffold and shared vocabulary

**Files:**
- Create: `connectors/package.json`, `connectors/tsconfig.json`, `connectors/.gitignore`
- Create: `connectors/src/types.ts`, `connectors/src/config.ts`
- Modify: `vitest.config.ts`
- Test: `connectors/src/config.test.ts`

**Interfaces:**
- Produces: the types every later worker task consumes —

```typescript
export interface ConnectorMessage { timestamp: Date; sender: string; text: string }
export interface WatchedSource { connector: 'whatsapp' | 'classdojo'; sourceKey: string; sourceLabel: string }
export interface FlushPayload { user_email: string; kind: 'whatsapp_export' | 'classdojo_thread'; source_key: string; source_label: string; text: string }
export interface Config { supabaseUrl: string; serviceRoleKey: string; captureSecret: string; userEmail: string; timezone: string; stateDir: string; flushHoursLocal: number[] }
export function loadConfig(env: Record<string, string | undefined>): Config
```

- [ ] **Step 1: Create the worker package**

`connectors/package.json`:

```json
{
  "name": "symphony-connectors",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node --experimental-strip-types src/index.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.86.0",
    "@whiskeysockets/baileys": "^6.7.9"
  }
}
```

`connectors/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`connectors/.gitignore`:

```
node_modules/
state/
```

- [ ] **Step 2: Make the root test runner see the worker**

In `vitest.config.ts`, add one entry to `test.include`, after the `supabase/functions/...` line:

```typescript
      'connectors/src/**/*.{test,spec}.{ts,mts,cts}',
```

This puts the worker's pure-logic tests in the same suite the pre-push hook runs, so a broken connector blocks a push.

- [ ] **Step 3: Write the shared types**

Create `connectors/src/types.ts`:

```typescript
/** One message from a watched source, normalized across connectors. */
export interface ConnectorMessage {
  timestamp: Date
  sender: string
  text: string
}

/** A thread the connector is allowed to read. Sourced from capture_sources —
 * anything absent from this list is never buffered, read, or transmitted. */
export interface WatchedSource {
  connector: 'whatsapp' | 'classdojo'
  sourceKey: string
  sourceLabel: string
}

/** The body posted to capture-to-inbox. Mirrors that function's CaptureBody. */
export interface FlushPayload {
  user_email: string
  kind: 'whatsapp_export' | 'classdojo_thread'
  source_key: string
  source_label: string
  text: string
}

export interface Config {
  supabaseUrl: string
  serviceRoleKey: string
  captureSecret: string
  userEmail: string
  /** IANA zone the household lives in. Rendered timestamps are naive local
   * time in this zone — extract-capture compares them as strings. */
  timezone: string
  /** Volume mount path for WhatsApp auth state and high-water marks. */
  stateDir: string
  /** Local hours at which a flush runs. */
  flushHoursLocal: number[]
}
```

- [ ] **Step 4: Write the failing config test**

Create `connectors/src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadConfig } from './config'

const full = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  CAPTURE_SHARED_SECRET: 'sec',
  CAPTURE_USER_EMAIL: 'a@b.com',
}

describe('loadConfig', () => {
  it('reads the required secrets', () => {
    const c = loadConfig(full)
    expect(c.supabaseUrl).toBe('https://x.supabase.co')
    expect(c.userEmail).toBe('a@b.com')
  })

  it('defaults zone, state dir and flush hours', () => {
    const c = loadConfig(full)
    expect(c.timezone).toBe('America/New_York')
    expect(c.stateDir).toBe('/data')
    expect(c.flushHoursLocal).toEqual([12, 20])
  })

  it('parses a custom flush schedule', () => {
    expect(loadConfig({ ...full, FLUSH_HOURS_LOCAL: '8,15,21' }).flushHoursLocal).toEqual([8, 15, 21])
  })

  it('throws naming the missing variable rather than starting half-configured', () => {
    expect(() => loadConfig({ ...full, CAPTURE_SHARED_SECRET: undefined }))
      .toThrow(/CAPTURE_SHARED_SECRET/)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/config.test.ts
```

Expected: FAIL — "Failed to resolve import './config'".

- [ ] **Step 6: Write the implementation**

Create `connectors/src/config.ts`:

```typescript
import type { Config } from './types.ts'

function required(env: Record<string, string | undefined>, name: string): string {
  const v = env[name]
  if (!v || v.trim() === '') {
    // Fail loudly at boot. A connector that starts with a missing secret
    // looks alive and silently never delivers — the exact failure this
    // whole feature exists to avoid.
    throw new Error(`missing required env var: ${name}`)
  }
  return v
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return {
    supabaseUrl: required(env, 'SUPABASE_URL'),
    serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    captureSecret: required(env, 'CAPTURE_SHARED_SECRET'),
    userEmail: required(env, 'CAPTURE_USER_EMAIL'),
    timezone: env.HOUSEHOLD_TIMEZONE ?? 'America/New_York',
    stateDir: env.STATE_DIR ?? '/data',
    flushHoursLocal: (env.FLUSH_HOURS_LOCAL ?? '12,20')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23),
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
npx vitest run connectors/src/config.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add connectors/ vitest.config.ts
git commit -m "feat(connectors): worker scaffold, shared types, config loader"
```

---

## Task 5: Render messages into the format the parser reads

This is the contract between the worker and the shipped `parseWhatsAppExport`. Get it wrong and every message is silently dropped or replayed.

**Files:**
- Create: `connectors/src/render.ts`
- Test: `connectors/src/render.test.ts`

**Interfaces:**
- Consumes: `ConnectorMessage` from `./types.ts`.
- Produces: `renderTranscript(messages: ConnectorMessage[], timezone: string): string`. Tasks 7 and 9 consume it.

- [ ] **Step 1: Write the failing test**

Create `connectors/src/render.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderTranscript } from './render'
import { parseWhatsAppExport } from '../../supabase/functions/extract-capture/lib/whatsapp.ts'

const TZ = 'America/New_York'
const msg = (iso: string, sender: string, text: string) => ({ timestamp: new Date(iso), sender, text })

describe('renderTranscript', () => {
  it('renders the bracketed local-time format the parser expects', () => {
    // 2026-08-25T13:14:23Z is 09:14:23 in New York (EDT).
    const out = renderTranscript([msg('2026-08-25T13:14:23Z', 'Ms Rozanc', 'Picture day Friday')], TZ)
    expect(out).toBe('[2026-08-25, 09:14:23] Ms Rozanc: Picture day Friday')
  })

  it('round-trips through parseWhatsAppExport with the timestamp intact', () => {
    const out = renderTranscript([msg('2026-08-25T13:14:23Z', 'Ms Rozanc', 'Picture day Friday')], TZ)
    const parsed = parseWhatsAppExport(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].timestamp).toBe('2026-08-25T09:14:23')
    expect(parsed[0].sender).toBe('Ms Rozanc')
    expect(parsed[0].text).toBe('Picture day Friday')
  })

  it('keeps multi-line message bodies attached to their message', () => {
    const out = renderTranscript([msg('2026-08-25T13:00:00Z', 'Amy', 'Party Sat\n2pm\nBring a gift')], TZ)
    const parsed = parseWhatsAppExport(out)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('Party Sat\n2pm\nBring a gift')
  })

  it('neutralizes a body line that would otherwise parse as a new message', () => {
    // A parent pasting a transcript inside a message must not be able to
    // forge message boundaries — the parser anchors its header regex at ^.
    const out = renderTranscript([msg('2026-08-25T13:00:00Z', 'Amy', 'see below\n[2020-01-01, 00:00:00] Fake: hi')], TZ)
    expect(parseWhatsAppExport(out)).toHaveLength(1)
  })

  it('renders messages in ascending time order', () => {
    const out = renderTranscript([
      msg('2026-08-25T15:00:00Z', 'B', 'second'),
      msg('2026-08-25T13:00:00Z', 'A', 'first'),
    ], TZ)
    const parsed = parseWhatsAppExport(out)
    expect(parsed.map((p) => p.text)).toEqual(['first', 'second'])
  })

  it('returns an empty string for no messages', () => {
    expect(renderTranscript([], TZ)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/render.test.ts
```

Expected: FAIL — "Failed to resolve import './render'".

- [ ] **Step 3: Write the implementation**

Create `connectors/src/render.ts`:

```typescript
import type { ConnectorMessage } from './types.ts'

// The exact shape parseWhatsAppExport reads:
//   [YYYY-MM-DD, HH:mm:ss] Sender: first line
//   continuation lines, appended to the message above
//
// normalizeTimestamp() splits the bracketed part on a comma and produces a
// NAIVE local ISO string. filterSince() then compares those strings
// lexicographically against the stored checkpoint. So the zone used here is
// load-bearing: render in UTC and every message jumps hours, which either
// replays a batch or drops it.

function formatLocal(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  // en-CA gives hour "24" for midnight in some runtimes; normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}, ${hour}:${get('minute')}:${get('second')}`
}

/** A continuation line starting with "[" would be read as a new message
 * header. One leading space defeats the parser's ^ anchor without changing
 * what a human reads. */
function neutralize(text: string): string {
  return text
    .split('\n')
    .map((line, i) => (i > 0 && line.startsWith('[') ? ` ${line}` : line))
    .join('\n')
}

export function renderTranscript(messages: ConnectorMessage[], timezone: string): string {
  return [...messages]
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m) => `[${formatLocal(m.timestamp, timezone)}] ${m.sender}: ${neutralize(m.text)}`)
    .join('\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run connectors/src/render.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add connectors/src/render.ts connectors/src/render.test.ts
git commit -m "feat(connectors): render messages into the transcript format the parser reads"
```

---

## Task 6: Message buffer and high-water marks

**Files:**
- Create: `connectors/src/buffer.ts`, `connectors/src/highWater.ts`
- Test: `connectors/src/buffer.test.ts`, `connectors/src/highWater.test.ts`

**Interfaces:**
- Consumes: `ConnectorMessage` from `./types.ts`.
- Produces:

```typescript
// buffer.ts
export class MessageBuffer {
  add(sourceKey: string, message: ConnectorMessage): void
  drain(sourceKey: string): ConnectorMessage[]
  restore(sourceKey: string, messages: ConnectorMessage[]): void
  keys(): string[]
}
// highWater.ts
export class HighWaterStore {
  constructor(filePath: string)
  load(): Promise<void>
  get(sourceKey: string): Date | null
  set(sourceKey: string, at: Date): Promise<void>
}
```

Tasks 7, 9, 10 and 12 consume both.

- [ ] **Step 1: Write the failing buffer test**

Create `connectors/src/buffer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MessageBuffer } from './buffer'

const msg = (iso: string, text: string) => ({ timestamp: new Date(iso), sender: 'A', text })

describe('MessageBuffer', () => {
  it('collects per source and drains only that source', () => {
    const b = new MessageBuffer()
    b.add('whatsapp:one', msg('2026-08-25T12:00:00Z', 'a'))
    b.add('whatsapp:two', msg('2026-08-25T12:01:00Z', 'b'))
    expect(b.drain('whatsapp:one').map((m) => m.text)).toEqual(['a'])
    expect(b.drain('whatsapp:two').map((m) => m.text)).toEqual(['b'])
  })

  it('empties on drain so a delivered batch is never sent twice', () => {
    const b = new MessageBuffer()
    b.add('s', msg('2026-08-25T12:00:00Z', 'a'))
    b.drain('s')
    expect(b.drain('s')).toEqual([])
  })

  it('restores a batch when delivery failed, ahead of anything that arrived since', () => {
    const b = new MessageBuffer()
    const failed = [msg('2026-08-25T12:00:00Z', 'older')]
    b.add('s', msg('2026-08-25T12:05:00Z', 'newer'))
    b.restore('s', failed)
    expect(b.drain('s').map((m) => m.text)).toEqual(['older', 'newer'])
  })

  it('lists only sources holding messages', () => {
    const b = new MessageBuffer()
    b.add('s', msg('2026-08-25T12:00:00Z', 'a'))
    expect(b.keys()).toEqual(['s'])
    b.drain('s')
    expect(b.keys()).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/buffer.test.ts
```

Expected: FAIL — "Failed to resolve import './buffer'".

- [ ] **Step 3: Write the buffer**

Create `connectors/src/buffer.ts`:

```typescript
import type { ConnectorMessage } from './types.ts'

/** Messages accumulate here between flush ticks. In memory on purpose: a
 * worker restart loses at most one tick's buffer, and both sources still
 * hold their own history, so the next tick re-reads from the high-water
 * mark rather than losing anything permanently. */
export class MessageBuffer {
  private readonly bySource = new Map<string, ConnectorMessage[]>()

  add(sourceKey: string, message: ConnectorMessage): void {
    const list = this.bySource.get(sourceKey)
    if (list) list.push(message)
    else this.bySource.set(sourceKey, [message])
  }

  drain(sourceKey: string): ConnectorMessage[] {
    const list = this.bySource.get(sourceKey) ?? []
    this.bySource.delete(sourceKey)
    return list
  }

  /** Put a failed batch back at the FRONT, so time order survives a retry. */
  restore(sourceKey: string, messages: ConnectorMessage[]): void {
    if (messages.length === 0) return
    const current = this.bySource.get(sourceKey) ?? []
    this.bySource.set(sourceKey, [...messages, ...current])
  }

  keys(): string[] {
    return [...this.bySource.keys()]
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run connectors/src/buffer.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing high-water test**

Create `connectors/src/highWater.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HighWaterStore } from './highWater'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'hw-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('HighWaterStore', () => {
  it('returns null for a source it has never seen', async () => {
    const s = new HighWaterStore(join(dir, 'marks.json'))
    await s.load()
    expect(s.get('whatsapp:one')).toBeNull()
  })

  it('persists a mark across instances', async () => {
    const path = join(dir, 'marks.json')
    const a = new HighWaterStore(path)
    await a.load()
    await a.set('whatsapp:one', new Date('2026-08-25T12:00:00Z'))

    const b = new HighWaterStore(path)
    await b.load()
    expect(b.get('whatsapp:one')?.toISOString()).toBe('2026-08-25T12:00:00.000Z')
  })

  it('tolerates a missing file on first boot', async () => {
    const s = new HighWaterStore(join(dir, 'nested', 'marks.json'))
    await expect(s.load()).resolves.toBeUndefined()
  })

  it('never moves a mark backwards', async () => {
    const s = new HighWaterStore(join(dir, 'marks.json'))
    await s.load()
    await s.set('s', new Date('2026-08-25T12:00:00Z'))
    await s.set('s', new Date('2026-08-24T12:00:00Z'))
    expect(s.get('s')?.toISOString()).toBe('2026-08-25T12:00:00.000Z')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run connectors/src/highWater.test.ts
```

Expected: FAIL — "Failed to resolve import './highWater'".

- [ ] **Step 7: Write the high-water store**

Create `connectors/src/highWater.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Per-source "newest message we have successfully DELIVERED" marks, on the
 * Fly volume. Distinct from capture_checkpoints, which is the server's own
 * dedupe: this one exists so a failed POST re-sends instead of vanishing.
 * The two together make delivery at-least-once and extraction exactly-once. */
export class HighWaterStore {
  private marks = new Map<string, Date>()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, string>
      this.marks = new Map(Object.entries(parsed).map(([k, v]) => [k, new Date(v)]))
    } catch {
      // No file yet (first boot) or unreadable — start empty. An empty mark
      // means "everything is new", which over-delivers rather than losing;
      // capture_checkpoints absorbs the duplicate.
      this.marks = new Map()
    }
  }

  get(sourceKey: string): Date | null {
    return this.marks.get(sourceKey) ?? null
  }

  async set(sourceKey: string, at: Date): Promise<void> {
    const current = this.marks.get(sourceKey)
    if (current && current.getTime() >= at.getTime()) return
    this.marks.set(sourceKey, at)
    const obj = Object.fromEntries([...this.marks].map(([k, v]) => [k, v.toISOString()]))
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf8')
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

```bash
npx vitest run connectors/src/highWater.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add connectors/src/buffer.ts connectors/src/buffer.test.ts connectors/src/highWater.ts connectors/src/highWater.test.ts
git commit -m "feat(connectors): message buffer and persisted high-water marks"
```

---

## Task 7: Delivery to `capture-to-inbox`

**Files:**
- Create: `connectors/src/capture.ts`
- Test: `connectors/src/capture.test.ts`

**Interfaces:**
- Consumes: `Config`, `FlushPayload`, `ConnectorMessage` from `./types.ts`; `renderTranscript` from `./render.ts`; `MessageBuffer` from `./buffer.ts`; `HighWaterStore` from `./highWater.ts`.
- Produces:

```typescript
export async function deliver(
  args: {
    source: WatchedSource
    messages: ConnectorMessage[]
    config: Config
    fetchImpl?: typeof fetch
  },
): Promise<{ delivered: boolean; newest: Date | null; error?: string }>
```

Tasks 10 and 12 consume it.

- [ ] **Step 1: Write the failing test**

Create `connectors/src/capture.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { deliver } from './capture'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co',
  serviceRoleKey: 'svc',
  captureSecret: 'sec',
  userEmail: 'a@b.com',
  timezone: 'America/New_York',
  stateDir: '/tmp',
  flushHoursLocal: [12, 20],
}
const source: WatchedSource = { connector: 'whatsapp', sourceKey: 'whatsapp:one', sourceLabel: '3B Parents' }
const messages = [
  { timestamp: new Date('2026-08-25T13:00:00Z'), sender: 'Amy', text: 'Picture day Friday' },
  { timestamp: new Date('2026-08-25T14:00:00Z'), sender: 'Ben', text: 'thanks!' },
]

const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }))

describe('deliver', () => {
  it('posts the transcript with the right kind, secret and source key', async () => {
    const f = okFetch()
    await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })

    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/functions/v1/capture-to-inbox')
    expect((init.headers as Record<string, string>)['x-capture-secret']).toBe('sec')
    const body = JSON.parse(init.body as string)
    expect(body.kind).toBe('whatsapp_export')
    expect(body.source_key).toBe('whatsapp:one')
    expect(body.source_label).toBe('3B Parents')
    expect(body.user_email).toBe('a@b.com')
    expect(body.text).toContain('[2026-08-25, 09:00:00] Amy: Picture day Friday')
  })

  it('uses the classdojo kind for a classdojo source', async () => {
    const f = okFetch()
    await deliver({
      source: { connector: 'classdojo', sourceKey: 'classdojo:3-01', sourceLabel: '3-01 Mr. Gorby' },
      messages, config, fetchImpl: f as unknown as typeof fetch,
    })
    expect(JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string).kind).toBe('classdojo_thread')
  })

  it('reports the newest delivered timestamp on success', async () => {
    const r = await deliver({ source, messages, config, fetchImpl: okFetch() as unknown as typeof fetch })
    expect(r.delivered).toBe(true)
    expect(r.newest?.toISOString()).toBe('2026-08-25T14:00:00.000Z')
  })

  it('does NOT report a newest timestamp when the post fails', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.newest).toBeNull()
    expect(r.error).toContain('500')
  })

  it('treats a thrown network error as a failed delivery, not a crash', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const r = await deliver({ source, messages, config, fetchImpl: f as unknown as typeof fetch })
    expect(r.delivered).toBe(false)
    expect(r.newest).toBeNull()
    expect(r.error).toContain('ECONNREFUSED')
  })

  it('posts nothing at all when there are no messages', async () => {
    const f = okFetch()
    const r = await deliver({ source, messages: [], config, fetchImpl: f as unknown as typeof fetch })
    expect(f).not.toHaveBeenCalled()
    expect(r.delivered).toBe(true)
    expect(r.newest).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/capture.test.ts
```

Expected: FAIL — "Failed to resolve import './capture'".

- [ ] **Step 3: Write the implementation**

Create `connectors/src/capture.ts`:

```typescript
import type { Config, ConnectorMessage, FlushPayload, WatchedSource } from './types.ts'
import { renderTranscript } from './render.ts'

const KIND: Record<WatchedSource['connector'], FlushPayload['kind']> = {
  whatsapp: 'whatsapp_export',
  classdojo: 'classdojo_thread',
}

/** POST one source's new messages to capture-to-inbox.
 *
 * `newest` is returned ONLY on a 2xx. The caller advances its high-water mark
 * from that value, so a failure leaves the mark where it was and the batch is
 * re-sent next tick. Re-sending is safe: capture_checkpoints dedupes
 * server-side by timestamp, so a duplicate batch extracts nothing twice. */
export async function deliver({
  source,
  messages,
  config,
  fetchImpl = fetch,
}: {
  source: WatchedSource
  messages: ConnectorMessage[]
  config: Config
  fetchImpl?: typeof fetch
}): Promise<{ delivered: boolean; newest: Date | null; error?: string }> {
  if (messages.length === 0) return { delivered: true, newest: null }

  const payload: FlushPayload = {
    user_email: config.userEmail,
    kind: KIND[source.connector],
    source_key: source.sourceKey,
    source_label: source.sourceLabel,
    text: renderTranscript(messages, config.timezone),
  }

  try {
    const res = await fetchImpl(`${config.supabaseUrl}/functions/v1/capture-to-inbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': config.captureSecret },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      return { delivered: false, newest: null, error: `capture-to-inbox returned ${res.status}` }
    }
    const newest = messages.reduce<Date>(
      (acc, m) => (m.timestamp.getTime() > acc.getTime() ? m.timestamp : acc),
      messages[0]!.timestamp,
    )
    return { delivered: true, newest }
  } catch (e) {
    return { delivered: false, newest: null, error: String(e) }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run connectors/src/capture.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add connectors/src/capture.ts connectors/src/capture.test.ts
git commit -m "feat(connectors): deliver batches to capture-to-inbox, advance only on 2xx"
```

---

## Task 8: The watchlist

**Files:**
- Create: `connectors/src/watchlist.ts`
- Test: `connectors/src/watchlist.test.ts`

**Interfaces:**
- Consumes: `WatchedSource` from `./types.ts`.
- Produces:

```typescript
export interface SourceRow { connector: string; source_key: string; source_label: string; is_active: boolean }
export function toWatchedSources(rows: SourceRow[]): WatchedSource[]
export function isWatched(sources: WatchedSource[], connector: string, sourceKey: string): boolean
export async function loadWatchlist(config: Config, client?: SupabaseLike): Promise<WatchedSource[]>
```

Tasks 9, 10 and 12 consume `isWatched` and `loadWatchlist`.

`capture_sources` is an **allowlist**, not a filter. A thread absent from it is never buffered, never read, never transmitted. That is the privacy boundary for every 1:1 conversation on Scott's phone, so it is enforced at the point of receipt in Task 9, not at flush time.

- [ ] **Step 1: Write the failing test**

Create `connectors/src/watchlist.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { toWatchedSources, isWatched, loadWatchlist, type SourceRow } from './watchlist'
import type { Config } from './types'

const rows: SourceRow[] = [
  { connector: 'whatsapp', source_key: 'whatsapp:120@g.us', source_label: '3B Parents', is_active: true },
  { connector: 'classdojo', source_key: 'classdojo:3-01', source_label: '3-01 Mr. Gorby', is_active: true },
  { connector: 'whatsapp', source_key: 'whatsapp:999@g.us', source_label: 'Old group', is_active: false },
]

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', timezone: 'America/New_York', stateDir: '/tmp', flushHoursLocal: [12, 20],
}

describe('toWatchedSources', () => {
  it('drops inactive rows', () => {
    expect(toWatchedSources(rows).map((s) => s.sourceKey))
      .toEqual(['whatsapp:120@g.us', 'classdojo:3-01'])
  })

  it('drops rows with an unrecognized connector rather than trusting them', () => {
    const bad = [{ connector: 'signal', source_key: 'x', source_label: 'y', is_active: true }]
    expect(toWatchedSources(bad)).toEqual([])
  })
})

describe('isWatched — the allowlist', () => {
  const watched = toWatchedSources(rows)

  it('admits a listed active thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:120@g.us')).toBe(true)
  })

  it('refuses an unlisted thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:private@s.whatsapp.net')).toBe(false)
  })

  it('refuses a deactivated thread', () => {
    expect(isWatched(watched, 'whatsapp', 'whatsapp:999@g.us')).toBe(false)
  })

  it('refuses a key listed under a different connector', () => {
    expect(isWatched(watched, 'classdojo', 'whatsapp:120@g.us')).toBe(false)
  })
})

describe('loadWatchlist', () => {
  it('queries active capture_sources and maps them', async () => {
    const eq = vi.fn(async () => ({ data: rows.filter((r) => r.is_active), error: null }))
    const select = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ select })) }

    const out = await loadWatchlist(config, client as never)
    expect(client.from).toHaveBeenCalledWith('capture_sources')
    expect(eq).toHaveBeenCalledWith('is_active', true)
    expect(out.map((s) => s.sourceLabel)).toEqual(['3B Parents', '3-01 Mr. Gorby'])
  })

  it('returns an empty list on a query error rather than reading everything', async () => {
    const eq = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    const select = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ select })) }

    expect(await loadWatchlist(config, client as never)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/watchlist.test.ts
```

Expected: FAIL — "Failed to resolve import './watchlist'".

- [ ] **Step 3: Write the implementation**

Create `connectors/src/watchlist.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Config, WatchedSource } from './types.ts'

export interface SourceRow {
  connector: string
  source_key: string
  source_label: string
  is_active: boolean
}

const CONNECTORS = new Set<WatchedSource['connector']>(['whatsapp', 'classdojo'])

function isConnector(v: string): v is WatchedSource['connector'] {
  return CONNECTORS.has(v as WatchedSource['connector'])
}

export function toWatchedSources(rows: SourceRow[]): WatchedSource[] {
  return rows
    .filter((r) => r.is_active && isConnector(r.connector))
    .map((r) => ({
      connector: r.connector as WatchedSource['connector'],
      sourceKey: r.source_key,
      sourceLabel: r.source_label,
    }))
}

/** The allowlist gate. Called at the moment a message is RECEIVED, before it
 * is buffered — so an unlisted conversation never enters the worker's memory,
 * let alone the network. */
export function isWatched(sources: WatchedSource[], connector: string, sourceKey: string): boolean {
  return sources.some((s) => s.connector === connector && s.sourceKey === sourceKey)
}

type SupabaseLike = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => Promise<{ data: SourceRow[] | null; error: unknown }>
    }
  }
}

export async function loadWatchlist(config: Config, client?: SupabaseLike): Promise<WatchedSource[]> {
  const db = client ?? (createClient(config.supabaseUrl, config.serviceRoleKey) as unknown as SupabaseLike)
  // No user filter: this worker serves exactly one household and reads
  // capture_sources with the service-role key. is_active is the only gate,
  // and since it IS the privacy boundary it belongs in the query rather
  // than in a caller that might forget to apply it.
  const { data, error } = await db
    .from('capture_sources')
    .select('connector, source_key, source_label, is_active')
    .eq('is_active', true)
  // A failed watchlist read must fail CLOSED. Returning [] means nothing is
  // read this tick; returning everything would read chats nobody allowlisted.
  if (error || !data) return []
  return toWatchedSources(data)
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run connectors/src/watchlist.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add connectors/src/watchlist.ts connectors/src/watchlist.test.ts
git commit -m "feat(connectors): capture_sources allowlist, failing closed"
```

---

## Task 9: WhatsApp adapter — receive only

This task carries the invariant the whole risk decision rests on. Two tests enforce it: one behavioral (a mock socket whose write methods throw), one structural (the source file contains no write-method token). Both must exist.

**Files:**
- Create: `connectors/src/whatsapp/adapter.ts`
- Test: `connectors/src/whatsapp/adapter.test.ts`

**Interfaces:**
- Consumes: `ConnectorMessage`, `WatchedSource` from `../types.ts`; `MessageBuffer` from `../buffer.ts`; `isWatched` from `../watchlist.ts`.
- Produces:

```typescript
export interface SocketLike { ev: { on: (event: string, handler: (arg: unknown) => void) => void } }
export interface UpsertEvent { messages: RawMessage[]; type: string }
export interface RawMessage {
  key: { remoteJid?: string | null; fromMe?: boolean | null }
  pushName?: string | null
  messageTimestamp?: number | Long | null
  message?: { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null } | null
}
export function toConnectorMessage(raw: RawMessage): ConnectorMessage | null
export function attachReceiver(sock: SocketLike, args: { buffer: MessageBuffer; sources: () => WatchedSource[] }): void
export function makeReceiveOnlySocket(stateDir: string): Promise<SocketLike>
```

Task 10 consumes `attachReceiver` and `makeReceiveOnlySocket`.

- [ ] **Step 1: Write the failing test**

Create `connectors/src/whatsapp/adapter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { attachReceiver, toConnectorMessage, type RawMessage, type SocketLike } from './adapter'
import { MessageBuffer } from '../buffer'
import type { WatchedSource } from '../types'

const WATCHED: WatchedSource[] = [
  { connector: 'whatsapp', sourceKey: 'whatsapp:120@g.us', sourceLabel: '3B Parents' },
]

const raw = (over: Partial<RawMessage> = {}): RawMessage => ({
  key: { remoteJid: '120@g.us', fromMe: false },
  pushName: 'Amy',
  messageTimestamp: 1787746800, // 2026-08-25T13:00:00Z
  message: { conversation: 'Picture day Friday' },
  ...over,
})

/** A socket that explodes if anything tries to write. Any send, receipt or
 * presence call fails the test loudly instead of silently shipping. */
function trapSocket(): SocketLike & { handlers: Map<string, (a: unknown) => void> } {
  const handlers = new Map<string, (a: unknown) => void>()
  const boom = (name: string) => () => { throw new Error(`FORBIDDEN WRITE: ${name}`) }
  return {
    ev: { on: (e, h) => { handlers.set(e, h) } },
    handlers,
    sendMessage: boom('sendMessage'),
    readMessages: boom('readMessages'),
    sendPresenceUpdate: boom('sendPresenceUpdate'),
    chatModify: boom('chatModify'),
    groupLeave: boom('groupLeave'),
  } as never
}

describe('toConnectorMessage', () => {
  it('reads a plain conversation message', () => {
    const m = toConnectorMessage(raw())
    expect(m?.sender).toBe('Amy')
    expect(m?.text).toBe('Picture day Friday')
    expect(m?.timestamp.toISOString()).toBe('2026-08-25T13:00:00.000Z')
  })

  it('reads an extended text message', () => {
    const m = toConnectorMessage(raw({ message: { extendedTextMessage: { text: 'Party Sat' } } }))
    expect(m?.text).toBe('Party Sat')
  })

  it('returns null for a message with no text body (media, sticker, reaction)', () => {
    expect(toConnectorMessage(raw({ message: {} }))).toBeNull()
  })

  it('falls back to the jid when pushName is absent', () => {
    expect(toConnectorMessage(raw({ pushName: null }))?.sender).toBe('120@g.us')
  })
})

describe('attachReceiver', () => {
  it('buffers a message from a watched group', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'notify' })
    expect(buffer.drain('whatsapp:120@g.us').map((m) => m.text)).toEqual(['Picture day Friday'])
  })

  it('IGNORES a message from an unlisted chat — the allowlist is the privacy boundary', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({
      messages: [raw({ key: { remoteJid: 'private@s.whatsapp.net', fromMe: false } })],
      type: 'notify',
    })
    expect(buffer.keys()).toEqual([])
  })

  it("ignores Scott's own messages", () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({
      messages: [raw({ key: { remoteJid: '120@g.us', fromMe: true } })],
      type: 'notify',
    })
    expect(buffer.keys()).toEqual([])
  })

  it('ignores history-sync batches, which would replay the whole group', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'append' })
    expect(buffer.keys()).toEqual([])
  })

  it('never calls a write method on the socket', () => {
    const buffer = new MessageBuffer()
    const sock = trapSocket()
    attachReceiver(sock, { buffer, sources: () => WATCHED })

    // Any forbidden call throws; a throw here fails the test.
    expect(() => sock.handlers.get('messages.upsert')!({ messages: [raw()], type: 'notify' })).not.toThrow()
  })
})

describe('the send lockout is structural', () => {
  it('the adapter source contains no outbound-write call', async () => {
    const src = await readFile(fileURLToPath(new URL('./adapter.ts', import.meta.url)), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') // strip comments
    for (const forbidden of [
      'sendMessage', 'sendPresenceUpdate', 'readMessages',
      'chatModify', 'groupLeave', 'groupAcceptInvite', 'updateProfileStatus',
    ]) {
      expect(code, `adapter must never reference ${forbidden}`).not.toContain(forbidden)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/whatsapp/adapter.test.ts
```

Expected: FAIL — "Failed to resolve import './adapter'".

- [ ] **Step 3: Install Baileys**

```bash
cd connectors && npm install && cd ..
```

Expected: `@whiskeysockets/baileys` and `@supabase/supabase-js` installed under `connectors/node_modules`.

- [ ] **Step 4: Write the adapter**

Create `connectors/src/whatsapp/adapter.ts`:

```typescript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { join } from 'node:path'
import type { ConnectorMessage, WatchedSource } from '../types.ts'
import type { MessageBuffer } from '../buffer.ts'
import { isWatched } from '../watchlist.ts'

// ════════════════════════════════════════════════════════════════
// WHATSAPP ADAPTER — RECEIVE ONLY.
//
// This module must never gain the ability to write to WhatsApp: no
// messages, reactions, read receipts, presence updates, group joins or
// leaves. That restraint is the entire basis on which linking a companion
// device to Scott's personal account was judged acceptable. Two tests
// enforce it — a trap socket whose write methods throw, and a source scan
// for forbidden tokens. If you need to send something, that is a new design
// conversation, not an edit to this file.
// ════════════════════════════════════════════════════════════════

type Long = { toNumber: () => number }

export interface SocketLike {
  ev: { on: (event: string, handler: (arg: unknown) => void) => void }
}

export interface RawMessage {
  key: { remoteJid?: string | null; fromMe?: boolean | null }
  pushName?: string | null
  messageTimestamp?: number | Long | null
  message?: {
    conversation?: string | null
    extendedTextMessage?: { text?: string | null } | null
  } | null
}

export interface UpsertEvent {
  messages: RawMessage[]
  type: string
}

function seconds(ts: RawMessage['messageTimestamp']): number | null {
  if (typeof ts === 'number') return ts
  if (ts && typeof (ts as Long).toNumber === 'function') return (ts as Long).toNumber()
  return null
}

export function toConnectorMessage(raw: RawMessage): ConnectorMessage | null {
  const text = raw.message?.conversation ?? raw.message?.extendedTextMessage?.text ?? null
  if (!text || text.trim() === '') return null
  const ts = seconds(raw.messageTimestamp)
  if (ts === null) return null
  return {
    timestamp: new Date(ts * 1000),
    sender: raw.pushName?.trim() || raw.key.remoteJid || 'unknown',
    text,
  }
}

/** Subscribe to incoming messages. `sources` is a getter, not a snapshot, so
 * a watchlist edit takes effect without a reconnect. */
export function attachReceiver(
  sock: SocketLike,
  { buffer, sources }: { buffer: MessageBuffer; sources: () => WatchedSource[] },
): void {
  sock.ev.on('messages.upsert', (arg: unknown) => {
    const ev = arg as UpsertEvent
    // 'notify' is a live message. 'append'/'prepend' are history sync, which
    // would replay an entire group's backlog through extraction.
    if (ev.type !== 'notify') return

    for (const raw of ev.messages) {
      const jid = raw.key.remoteJid
      if (!jid || raw.key.fromMe) continue
      const sourceKey = `whatsapp:${jid}`
      // The allowlist gate, applied at RECEIPT. An unlisted conversation
      // never reaches the buffer, so it never reaches memory or the network.
      if (!isWatched(sources(), 'whatsapp', sourceKey)) continue

      const msg = toConnectorMessage(raw)
      if (msg) buffer.add(sourceKey, msg)
    }
  })
}

/** Build the companion-device socket.
 *
 * markOnlineOnConnect: false is load-bearing — a linked device that marks
 * itself online takes over notification delivery from the phone, so Scott
 * would stop getting WhatsApp notifications on his own handset.
 * syncFullHistory: false keeps the link from dragging every past message
 * through the pipeline on first connect. */
export async function makeReceiveOnlySocket(stateDir: string): Promise<SocketLike> {
  const { state, saveCreds } = await useMultiFileAuthState(join(stateDir, 'wa-auth'))
  const sock = makeWASocket({
    auth: state,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: true,
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u: { connection?: string; lastDisconnect?: { error?: unknown } }) => {
    if (u.connection === 'close') {
      const status = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
      // loggedOut means the phone unlinked this device — a human must re-scan
      // the QR. Anything else is transient; the supervisor restarts us.
      console.error(
        status === DisconnectReason.loggedOut
          ? 'whatsapp: device unlinked — re-run the QR link (see connectors/README.md)'
          : `whatsapp: connection closed (${status}) — restarting`,
      )
      process.exit(1)
    }
  })
  return sock as unknown as SocketLike
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run connectors/src/whatsapp/adapter.test.ts
```

Expected: PASS (10 tests), including the two lockout tests.

- [ ] **Step 6: Type-check the worker**

```bash
cd connectors && npx tsc --noEmit -p tsconfig.json; cd ..
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add connectors/src/whatsapp/ connectors/package.json connectors/package-lock.json
git commit -m "feat(connectors): receive-only WhatsApp adapter with an enforced send lockout"
```

---

## Task 10: Scheduler, health, and the composition root

**Files:**
- Create: `connectors/src/health.ts`, `connectors/src/scheduler.ts`, `connectors/src/index.ts`
- Test: `connectors/src/scheduler.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–9.
- Produces:

```typescript
// scheduler.ts
export function dueNow(now: Date, timezone: string, flushHoursLocal: number[], lastFiredHour: number | null): boolean
export async function flushAll(args: {
  buffer: MessageBuffer; sources: WatchedSource[]; config: Config;
  highWater: HighWaterStore; deliverImpl?: typeof deliver
}): Promise<{ delivered: number; failed: number }>
// health.ts
export async function recordHealth(config: Config, connector: 'whatsapp' | 'classdojo', result: { ok: boolean; error?: string }, client?: unknown): Promise<void>
```

Task 12 calls `flushAll` for ClassDojo too.

- [ ] **Step 1: Write the failing test**

Create `connectors/src/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { dueNow, flushAll } from './scheduler'
import { MessageBuffer } from './buffer'
import { HighWaterStore } from './highWater'
import type { Config, WatchedSource } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', timezone: 'America/New_York', stateDir: '/tmp', flushHoursLocal: [12, 20],
}
const sources: WatchedSource[] = [
  { connector: 'whatsapp', sourceKey: 'whatsapp:120@g.us', sourceLabel: '3B Parents' },
]
const msg = (iso: string, text: string) => ({ timestamp: new Date(iso), sender: 'A', text })

describe('dueNow', () => {
  it('fires at a configured local hour', () => {
    // 16:00Z = 12:00 in New York (EDT).
    expect(dueNow(new Date('2026-08-25T16:00:00Z'), config.timezone, [12, 20], null)).toBe(true)
  })

  it('does not fire at an unconfigured hour', () => {
    expect(dueNow(new Date('2026-08-25T14:00:00Z'), config.timezone, [12, 20], null)).toBe(false)
  })

  it('does not fire twice within the same hour', () => {
    expect(dueNow(new Date('2026-08-25T16:30:00Z'), config.timezone, [12, 20], 12)).toBe(false)
  })

  it('fires again at the next configured hour', () => {
    expect(dueNow(new Date('2026-08-26T00:00:00Z'), config.timezone, [12, 20], 12)).toBe(true)
  })
})

describe('flushAll', () => {
  const store = () => {
    const s = new HighWaterStore('/tmp/ignored.json')
    vi.spyOn(s, 'set').mockResolvedValue(undefined)
    return s
  }

  it('delivers each source that has messages and advances its mark', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    const highWater = store()
    const deliverImpl = vi.fn(async () => ({ delivered: true, newest: new Date('2026-08-25T13:00:00Z') }))

    const r = await flushAll({ buffer, sources, config, highWater, deliverImpl: deliverImpl as never })

    expect(r).toEqual({ delivered: 1, failed: 0 })
    expect(highWater.set).toHaveBeenCalledWith('whatsapp:120@g.us', new Date('2026-08-25T13:00:00Z'))
    expect(buffer.keys()).toEqual([])
  })

  it('restores the batch and leaves the mark alone when delivery fails', async () => {
    const buffer = new MessageBuffer()
    buffer.add('whatsapp:120@g.us', msg('2026-08-25T13:00:00Z', 'Picture day'))
    const highWater = store()
    const deliverImpl = vi.fn(async () => ({ delivered: false, newest: null, error: '500' }))

    const r = await flushAll({ buffer, sources, config, highWater, deliverImpl: deliverImpl as never })

    expect(r).toEqual({ delivered: 0, failed: 1 })
    expect(highWater.set).not.toHaveBeenCalled()
    // The batch is still queued for the next tick — nothing was lost.
    expect(buffer.drain('whatsapp:120@g.us')).toHaveLength(1)
  })

  it('skips a source with nothing buffered without calling out', async () => {
    const deliverImpl = vi.fn()
    const r = await flushAll({
      buffer: new MessageBuffer(), sources, config, highWater: store(), deliverImpl: deliverImpl as never,
    })
    expect(deliverImpl).not.toHaveBeenCalled()
    expect(r).toEqual({ delivered: 0, failed: 0 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/scheduler.test.ts
```

Expected: FAIL — "Failed to resolve import './scheduler'".

- [ ] **Step 3: Write the scheduler**

Create `connectors/src/scheduler.ts`:

```typescript
import type { Config, WatchedSource } from './types.ts'
import type { MessageBuffer } from './buffer.ts'
import type { HighWaterStore } from './highWater.ts'
import { deliver } from './capture.ts'

/** Local hour in the household's zone. */
function localHour(now: Date, timeZone: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
    10,
  )
}

/** True when `now` falls in a configured flush hour we have not already
 * fired for. The tick loop runs every few minutes; this keeps one flush per
 * scheduled hour regardless of tick jitter. */
export function dueNow(
  now: Date,
  timezone: string,
  flushHoursLocal: number[],
  lastFiredHour: number | null,
): boolean {
  const hour = localHour(now, timezone)
  if (!flushHoursLocal.includes(hour)) return false
  return lastFiredHour !== hour
}

export async function flushAll({
  buffer,
  sources,
  config,
  highWater,
  deliverImpl = deliver,
}: {
  buffer: MessageBuffer
  sources: WatchedSource[]
  config: Config
  highWater: HighWaterStore
  deliverImpl?: typeof deliver
}): Promise<{ delivered: number; failed: number }> {
  let delivered = 0
  let failed = 0

  for (const source of sources) {
    const messages = buffer.drain(source.sourceKey)
    if (messages.length === 0) continue

    const result = await deliverImpl({ source, messages, config })
    if (result.delivered && result.newest) {
      await highWater.set(source.sourceKey, result.newest)
      delivered += 1
    } else if (!result.delivered) {
      // Put it back, mark unmoved. Next tick re-sends; capture_checkpoints
      // makes the duplicate harmless.
      buffer.restore(source.sourceKey, messages)
      failed += 1
      console.error(`flush failed for ${source.sourceKey}: ${result.error ?? 'unknown'}`)
    }
  }

  return { delivered, failed }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run connectors/src/scheduler.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Write the health heartbeat**

Create `connectors/src/health.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Config } from './types.ts'

/** A feed that has gone quiet and a feed that has gone dead look identical
 * from the app. This is what tells them apart — the 17-day silent outage on
 * the old Mac Mini is the failure this exists to prevent. */
export async function recordHealth(
  config: Config,
  connector: 'whatsapp' | 'classdojo',
  result: { ok: boolean; error?: string },
  client?: { from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }> } },
): Promise<void> {
  const db = client ?? (createClient(config.supabaseUrl, config.serviceRoleKey) as never)
  const now = new Date().toISOString()
  const { error } = await db.from('connector_health').upsert(
    result.ok
      ? { connector, last_ok_at: now, last_error: null, last_error_at: null, updated_at: now }
      : { connector, last_error: result.error ?? 'unknown', last_error_at: now, updated_at: now },
    { onConflict: 'user_id,connector' },
  )
  if (error) console.error('health upsert failed', error)
}
```

Note: `connector_health` is keyed on `(user_id, connector)`. The service-role client does not infer `user_id`, so add it to both branches once Task 10 Step 6 resolves the id from `CAPTURE_USERS`-style config. If a simpler single-household constant is acceptable, add `CAPTURE_USER_ID` to `Config` in Task 4's `loadConfig` and include it here.

- [ ] **Step 6: Add `userId` to the config**

In `connectors/src/types.ts`, add to `Config`:

```typescript
  /** The Supabase auth user id these feeds belong to. */
  userId: string
```

In `connectors/src/config.ts`, add to the returned object:

```typescript
    userId: required(env, 'CAPTURE_USER_ID'),
```

In `connectors/src/config.test.ts`, add `CAPTURE_USER_ID: 'u-1'` to the `full` fixture and one assertion:

```typescript
  it('reads the user id', () => {
    expect(loadConfig(full).userId).toBe('u-1')
  })
```

In `connectors/src/health.ts`, include `user_id: config.userId` in both upsert branches. In `connectors/src/capture.test.ts` and `connectors/src/scheduler.test.ts`, add `userId: 'u-1'` to the `config` fixtures.

- [ ] **Step 7: Re-run every worker test**

```bash
npx vitest run connectors/src
```

Expected: PASS — config (5), render (6), buffer (4), highWater (4), capture (6), watchlist (8), whatsapp adapter (10), scheduler (7).

- [ ] **Step 8: Write the composition root**

Create `connectors/src/index.ts`:

```typescript
import { loadConfig } from './config.ts'
import { MessageBuffer } from './buffer.ts'
import { HighWaterStore } from './highWater.ts'
import { loadWatchlist } from './watchlist.ts'
import { attachReceiver, makeReceiveOnlySocket } from './whatsapp/adapter.ts'
import { dueNow, flushAll } from './scheduler.ts'
import { recordHealth } from './health.ts'
import { join } from 'node:path'
import type { WatchedSource } from './types.ts'

const TICK_MS = 5 * 60 * 1000

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const buffer = new MessageBuffer()
  const highWater = new HighWaterStore(join(config.stateDir, 'high-water.json'))
  await highWater.load()

  let sources: WatchedSource[] = await loadWatchlist(config)
  console.log(`watching ${sources.length} source(s): ${sources.map((s) => s.sourceLabel).join(', ') || 'none'}`)

  const sock = await makeReceiveOnlySocket(config.stateDir)
  attachReceiver(sock, { buffer, sources: () => sources })
  await recordHealth(config, 'whatsapp', { ok: true })

  let lastFiredHour: number | null = null
  setInterval(() => {
    void (async () => {
      const now = new Date()
      if (!dueNow(now, config.timezone, config.flushHoursLocal, lastFiredHour)) return
      lastFiredHour = parseInt(
        new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', hour12: false }).format(now),
        10,
      )

      // Re-read the allowlist each flush so adding a thread needs no restart.
      sources = await loadWatchlist(config)
      const whatsappSources = sources.filter((s) => s.connector === 'whatsapp')
      const r = await flushAll({ buffer, sources: whatsappSources, config, highWater })
      console.log(`flush: ${r.delivered} delivered, ${r.failed} failed`)
      await recordHealth(config, 'whatsapp', r.failed === 0 ? { ok: true } : { ok: false, error: `${r.failed} source(s) failed` })
    })()
  }, TICK_MS)
}

void main().catch((e) => {
  console.error('connector failed to start:', e)
  process.exit(1)
})
```

- [ ] **Step 9: Type-check and commit**

```bash
cd connectors && npx tsc --noEmit -p tsconfig.json; cd ..
git add connectors/src/scheduler.ts connectors/src/scheduler.test.ts connectors/src/health.ts connectors/src/index.ts connectors/src/types.ts connectors/src/config.ts connectors/src/config.test.ts connectors/src/capture.test.ts
git commit -m "feat(connectors): flush scheduler, health heartbeat, composition root"
```

---

## Task 11: Fly deployment and the link runbook

**Files:**
- Create: `connectors/Dockerfile`, `connectors/fly.toml`, `connectors/README.md`

**Interfaces:**
- Consumes: `connectors/src/index.ts` from Task 10.
- Produces: a deployable worker. Task 12 redeploys the same app.

- [ ] **Step 1: Write the Dockerfile**

Create `connectors/Dockerfile`:

```dockerfile
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

# The volume holds WhatsApp auth state and high-water marks.
ENV STATE_DIR=/data

CMD ["node", "--experimental-strip-types", "src/index.ts"]
```

- [ ] **Step 2: Write the Fly config**

Create `connectors/fly.toml`:

```toml
app = "symphony-connectors"
primary_region = "ewr"

[build]

[env]
  STATE_DIR = "/data"
  HOUSEHOLD_TIMEZONE = "America/New_York"
  FLUSH_HOURS_LOCAL = "12,20"

[mounts]
  source = "connector_state"
  destination = "/data"

# One machine only. Two would hold two WhatsApp sessions and double-deliver.
[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"

[deploy]
  strategy = "immediate"
```

- [ ] **Step 3: Write the runbook**

Create `connectors/README.md`:

```markdown
# Symphony Connectors

An always-on worker that reads two family feeds and posts them to Symphony's
capture pipeline. It **never writes** to either service — see
`src/whatsapp/adapter.ts` for why that is enforced rather than assumed.

## What it does

Buffers new messages from allowlisted threads, renders them into the
transcript format `extract-capture` parses, and POSTs them to
`capture-to-inbox` at the configured local hours (default noon and 8pm).
Candidates land in Symphony's inbox and surface in the "School" dropdown on
Today.

## Which threads it reads

Only rows in the `capture_sources` table with `is_active = true`. Anything
absent is never buffered, read, or transmitted. To add a WhatsApp group,
insert a row with `source_key = 'whatsapp:<jid>'` — the jid is printed in the
worker log the first time a message arrives from a group you are in.

## First deploy

```bash
fly launch --no-deploy --name symphony-connectors
fly volumes create connector_state --size 1 --region ewr

fly secrets set \
  SUPABASE_URL=https://mwadppyrqzuzgstmwpuy.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  CAPTURE_SHARED_SECRET=... \
  CAPTURE_USER_EMAIL=smkaufman@gmail.com \
  CAPTURE_USER_ID=...

fly deploy
```

## Linking WhatsApp (one time)

The first boot has no saved session, so it prints a QR code.

```bash
fly logs
```

On the phone: WhatsApp → Settings → Linked Devices → Link a Device, and scan
the QR from the log output. The session persists on the volume across
deploys and restarts.

If the log says `device unlinked`, the phone dropped the link — repeat the
scan. Nothing is lost; the high-water marks stay on the volume.

## Why the phone still gets notifications

`markOnlineOnConnect: false`. A linked device that marks itself online takes
over notification delivery from the handset. Do not change it.

## Operational checks

- `fly logs` — flush lines report delivered/failed counts per tick.
- `connector_health` in Supabase — `last_ok_at` per connector. A stale
  timestamp means the feed is dead, not quiet.
- `fly status` — one machine, always. Two machines would hold two WhatsApp
  sessions and deliver everything twice.
```

- [ ] **Step 4: Commit**

```bash
git add connectors/Dockerfile connectors/fly.toml connectors/README.md
git commit -m "feat(connectors): Fly deployment config and link runbook"
```

- [ ] **Step 5: Deploy and link (with Scott)**

Deploying and scanning the QR requires Scott's phone and his Fly account. Hand him the runbook, deploy together, and confirm the log shows `watching N source(s)` and a successful WhatsApp connection before moving on.

---

## Task 12: ClassDojo adapter

**Interfaces:**
- Consumes: `connectors/docs/classdojo-api.md` from Task 0 — its only source of endpoint truth. `ConnectorMessage` from `../types.ts`; `deliver` from `../capture.ts`; `flushAll` from `../scheduler.ts`.
- Produces:

```typescript
// classdojo/map.ts
export interface DojoPost { id: string; createdAt: string; author: string; body: string }
export function toConnectorMessages(posts: DojoPost[], since: Date | null): ConnectorMessage[]
// classdojo/client.ts
export function makeClassDojoClient(creds: { email: string; password: string }): {
  login(): Promise<void>
  fetchPosts(classId: string, since: Date | null): Promise<DojoPost[]>
}
```

**Files:**
- Create: `connectors/src/classdojo/map.ts`, `connectors/src/classdojo/client.ts`
- Test: `connectors/src/classdojo/map.test.ts`
- Modify: `connectors/src/index.ts`

**Read `connectors/docs/classdojo-api.md` before starting.** If its VERDICT line says the API path is not viable, implement `client.ts` with Playwright instead — the `makeClassDojoClient` signature above stays identical, and `map.ts` is unaffected either way. That isolation is why the contract is defined here rather than inside the client.

- [ ] **Step 1: Write the failing mapper test**

Create `connectors/src/classdojo/map.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { toConnectorMessages, type DojoPost } from './map'

const post = (over: Partial<DojoPost> = {}): DojoPost => ({
  id: 'p1',
  createdAt: '2026-08-25T13:00:00Z',
  author: 'Mr. Gorby',
  body: 'Picture day is Friday. Wear school colors.',
  ...over,
})

describe('toConnectorMessages', () => {
  it('maps a post to a connector message', () => {
    const [m] = toConnectorMessages([post()], null)
    expect(m.sender).toBe('Mr. Gorby')
    expect(m.text).toBe('Picture day is Friday. Wear school colors.')
    expect(m.timestamp.toISOString()).toBe('2026-08-25T13:00:00.000Z')
  })

  it('drops posts at or before the since mark', () => {
    const posts = [
      post({ id: 'old', createdAt: '2026-08-24T13:00:00Z', body: 'old' }),
      post({ id: 'new', createdAt: '2026-08-25T13:00:00Z', body: 'new' }),
    ]
    expect(toConnectorMessages(posts, new Date('2026-08-24T13:00:00Z')).map((m) => m.text)).toEqual(['new'])
  })

  it('returns everything when there is no since mark', () => {
    expect(toConnectorMessages([post(), post({ id: 'p2' })], null)).toHaveLength(2)
  })

  it('drops a post with an empty body rather than sending a blank line', () => {
    expect(toConnectorMessages([post({ body: '   ' })], null)).toEqual([])
  })

  it('drops a post with an unparseable date rather than sending epoch zero', () => {
    expect(toConnectorMessages([post({ createdAt: 'not a date' })], null)).toEqual([])
  })

  it('orders posts oldest first', () => {
    const posts = [
      post({ id: 'b', createdAt: '2026-08-25T15:00:00Z', body: 'second' }),
      post({ id: 'a', createdAt: '2026-08-25T13:00:00Z', body: 'first' }),
    ]
    expect(toConnectorMessages(posts, null).map((m) => m.text)).toEqual(['first', 'second'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run connectors/src/classdojo/map.test.ts
```

Expected: FAIL — "Failed to resolve import './map'".

- [ ] **Step 3: Write the mapper**

Create `connectors/src/classdojo/map.ts`:

```typescript
import type { ConnectorMessage } from '../types.ts'

/** One class-story post, normalized from whatever shape the transport
 * returns. The field names here are OURS — client.ts adapts the wire format
 * to this, so a ClassDojo API change touches one file. */
export interface DojoPost {
  id: string
  createdAt: string
  author: string
  body: string
}

export function toConnectorMessages(posts: DojoPost[], since: Date | null): ConnectorMessage[] {
  return posts
    .map((p) => ({ p, at: new Date(p.createdAt) }))
    .filter(({ p, at }) => {
      if (Number.isNaN(at.getTime())) return false
      if (p.body.trim() === '') return false
      if (since && at.getTime() <= since.getTime()) return false
      return true
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ p, at }) => ({ timestamp: at, sender: p.author, text: p.body }))
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run connectors/src/classdojo/map.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Write the client against the recorded contract**

Create `connectors/src/classdojo/client.ts`, implementing `login()` and `fetchPosts()` against the endpoints, request shapes and field names recorded in `connectors/docs/classdojo-api.md`. Requirements that hold regardless of which transport Task 0 selected:

- Credentials come from `CLASSDOJO_EMAIL` / `CLASSDOJO_PASSWORD` (Fly secrets). They are never read from Supabase and never logged.
- `login()` is called lazily and its session reused; a 401 from `fetchPosts` triggers exactly one re-login, then fails.
- `fetchPosts` maps the wire response to `DojoPost[]` and does nothing else — no filtering, no ordering. That is `map.ts`'s job and is already tested.
- Every failure path throws with a message naming the step (`classdojo login failed: <status>`), because that string lands in `connector_health.last_error` and is what tells Scott what broke.
- Add `classdojoEmail` / `classdojoPassword` to `Config` and `loadConfig`, using an `optional()` helper rather than `required()` — the worker must still boot with WhatsApp alone if ClassDojo is unconfigured.

- [ ] **Step 6: Wire ClassDojo into the flush tick**

In `connectors/src/index.ts`, inside the interval callback after the WhatsApp flush, add a ClassDojo pull. It polls on the same tick rather than holding a socket:

```typescript
      const dojoSources = sources.filter((s) => s.connector === 'classdojo')
      if (dojoSources.length > 0 && config.classdojoEmail) {
        try {
          const client = makeClassDojoClient({ email: config.classdojoEmail, password: config.classdojoPassword! })
          await client.login()
          for (const source of dojoSources) {
            const classId = source.sourceKey.replace(/^classdojo:/, '')
            const since = highWater.get(source.sourceKey)
            const posts = await client.fetchPosts(classId, since)
            for (const m of toConnectorMessages(posts, since)) buffer.add(source.sourceKey, m)
          }
          const dr = await flushAll({ buffer, sources: dojoSources, config, highWater })
          await recordHealth(config, 'classdojo', dr.failed === 0 ? { ok: true } : { ok: false, error: `${dr.failed} source(s) failed` })
        } catch (e) {
          // A ClassDojo failure must never take WhatsApp down with it.
          console.error('classdojo pull failed:', e)
          await recordHealth(config, 'classdojo', { ok: false, error: String(e) })
        }
      }
```

Add the imports at the top of `index.ts`:

```typescript
import { makeClassDojoClient } from './classdojo/client.ts'
import { toConnectorMessages } from './classdojo/map.ts'
```

- [ ] **Step 7: Run the full worker suite and type-check**

```bash
npx vitest run connectors/src
cd connectors && npx tsc --noEmit -p tsconfig.json; cd ..
```

Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add connectors/src/classdojo/ connectors/src/index.ts connectors/src/config.ts connectors/src/types.ts connectors/src/config.test.ts
git commit -m "feat(connectors): ClassDojo adapter behind the same delivery contract"
```

---

## Task 13: The School pool selector

**Files:**
- Create: `src/lib/today/schoolPool.ts`
- Test: `src/lib/today/schoolPool.test.ts`

**Interfaces:**
- Consumes: `Task.captureId` from Task 1.
- Produces:

```typescript
export function selectSchoolPool(tasks: Task[]): Task[]
export function parseCaptureMeta(notes: string | undefined): { source?: string; forWho?: string }
export function formatCaptureMeta(meta: { source?: string; forWho?: string }): string | undefined
```

Task 15 consumes all three.

`parseCaptureMeta` reads the `Source:` and `For:` lines that `candidateToTaskRow` writes into `tasks.notes`. Both sides of that format live in this repo, and this test locks the contract — if the edge function's note format changes, this test fails and tells you why.

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/schoolPool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { selectSchoolPool, parseCaptureMeta, formatCaptureMeta } from './schoolPool'
import type { Task } from '@/types/task'

const t = (p: Partial<Task>): Task => ({ id: 'x', title: 'thing', completed: false, ...p } as Task)

describe('selectSchoolPool', () => {
  it('takes incomplete inbox tasks that came from a capture', () => {
    const out = selectSchoolPool([
      t({ id: 'a', bucket: 'inbox', captureId: 'c1' }),
      t({ id: 'b', bucket: 'inbox' }),                       // typed by hand
      t({ id: 'c', bucket: 'week', captureId: 'c2' }),       // already placed
      t({ id: 'd', bucket: 'inbox', captureId: 'c3', completed: true }),
    ])
    expect(out.map((x) => x.id)).toEqual(['a'])
  })

  it('orders oldest first, so the stalest school item is dealt with first', () => {
    const out = selectSchoolPool([
      t({ id: 'new', bucket: 'inbox', captureId: 'c', createdAt: new Date('2026-08-25') }),
      t({ id: 'old', bucket: 'inbox', captureId: 'c', createdAt: new Date('2026-08-20') }),
    ])
    expect(out.map((x) => x.id)).toEqual(['old', 'new'])
  })

  it('is empty when nothing has been captured', () => {
    expect(selectSchoolPool([t({ bucket: 'inbox' })])).toEqual([])
  })
})

describe('parseCaptureMeta', () => {
  // The exact note body candidateToTaskRow writes.
  const notes = [
    'Location: Room 12',
    'RSVP: to Ms Rozanc, by Thursday',
    'For: Kaleb',
    'Source: 3-01 Mr. Gorby (confidence 0.90)',
    'Proposed time: 2026-08-28T09:00:00',
  ].join('\n')

  it('pulls the source label out, without the confidence', () => {
    expect(parseCaptureMeta(notes).source).toBe('3-01 Mr. Gorby')
  })

  it('pulls the child out', () => {
    expect(parseCaptureMeta(notes).forWho).toBe('Kaleb')
  })

  it('returns nothing for notes that are not capture-shaped', () => {
    expect(parseCaptureMeta('just a normal note')).toEqual({})
  })

  it('returns nothing for undefined notes', () => {
    expect(parseCaptureMeta(undefined)).toEqual({})
  })
})

describe('formatCaptureMeta', () => {
  it('joins source and child with a separator', () => {
    expect(formatCaptureMeta({ source: '3B Parents', forWho: 'Kaleb' })).toBe('3B Parents · Kaleb')
  })

  it('shows the source alone when no child is named', () => {
    expect(formatCaptureMeta({ source: '3B Parents' })).toBe('3B Parents')
  })

  it('returns undefined when there is nothing to show', () => {
    expect(formatCaptureMeta({})).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/lib/today/schoolPool.test.ts
```

Expected: FAIL — "Failed to resolve import './schoolPool'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/today/schoolPool.ts`:

```typescript
import type { Task } from '@/types/task'

/** The School pool: candidates the feed connectors extracted, waiting for a
 * fate. Not a horizon — these sit in the inbox bucket, so selectHorizonPool
 * cannot serve them. Oldest first, matching the backlog's ordering: the
 * stalest school item is the one most likely to be about to expire.
 *
 * Unfiltered by assignee on purpose, like the week/month pools — a pool is a
 * census, not a view. */
export function selectSchoolPool(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.completed && t.bucket === 'inbox' && !!t.captureId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
}

/** Read the provenance lines extract-capture writes into tasks.notes.
 *
 * Both ends of this format live in this repo — supabase/functions/
 * extract-capture/index.ts writes it, this reads it — and the test above
 * pins it. If the edge function's note body changes, that test fails and
 * names the reason, which is the point of parsing it here rather than
 * adding two more columns. */
export function parseCaptureMeta(notes: string | undefined): { source?: string; forWho?: string } {
  if (!notes) return {}
  const out: { source?: string; forWho?: string } = {}
  // "Source: <label> (confidence 0.90)" — the label is everything before the
  // trailing parenthetical.
  const source = /^Source:\s*(.+?)(?:\s*\(confidence[^)]*\))?$/m.exec(notes)
  if (source?.[1]) out.source = source[1].trim()
  const forWho = /^For:\s*(.+)$/m.exec(notes)
  if (forWho?.[1]) out.forWho = forWho[1].trim()
  return out
}

export function formatCaptureMeta(meta: { source?: string; forWho?: string }): string | undefined {
  const parts = [meta.source, meta.forWho].filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(' · ') : undefined
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/lib/today/schoolPool.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/schoolPool.ts src/lib/today/schoolPool.test.ts
git commit -m "feat(today): School pool selector and capture provenance parsing"
```

---

## Task 14: `HorizonPoolDropdown` can label its rows

**Files:**
- Modify: `src/components/schedule/HorizonPoolDropdown.tsx`
- Test: `src/components/schedule/HorizonPoolDropdown.test.tsx` (append)

**Interfaces:**
- Consumes: `TriageRow`'s existing `meta?: string` prop — no change needed there.
- Produces: `HorizonPoolDropdownProps.metaFor?: (task: Task) => string | undefined`. Task 15 passes it.

- [ ] **Step 1: Write the failing test**

Append to `src/components/schedule/HorizonPoolDropdown.test.tsx`, inside the existing top-level `describe`:

```typescript
  it('labels each row when given metaFor — a pool row can say where it came from', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="School"
      offer={['today', 'tomorrow', 'someday', 'deleted']}
      tasks={[task({ id: 's1', title: 'Bring a white t-shirt', bucket: 'inbox' })]}
      metaFor={(t) => (t.id === 's1' ? '3-01 Mr. Gorby · Kaleb' : undefined)}
    />)
    await user.click(screen.getByRole('button', { name: /School/ }))
    expect(screen.getByText('3-01 Mr. Gorby · Kaleb')).toBeInTheDocument()
  })

  it('renders rows unlabelled when metaFor is not given', async () => {
    const { user } = render(<HorizonPoolDropdown {...base} label="Week"
      offer={['today']}
      tasks={[task({ id: 'w1', title: 'Week thing', bucket: 'week' })]}
    />)
    await user.click(screen.getByRole('button', { name: /Week/ }))
    expect(screen.getByText('Week thing')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/components/schedule/HorizonPoolDropdown.test.tsx
```

Expected: FAIL — the first new test cannot find the meta text.

- [ ] **Step 3: Add the prop**

In `src/components/schedule/HorizonPoolDropdown.tsx`, add to `HorizonPoolDropdownProps`:

```typescript
  /** Optional per-row label — the School pool uses it to say which feed a
   * candidate came from and which child it is about. */
  metaFor?: (task: Task) => string | undefined
```

Add `metaFor` to the destructured parameter list, and pass it through to `TriageRow`:

```tsx
                  <TriageRow key={t.id} task={t} offer={offer} meta={metaFor?.(t)}
                    verdict={verdicts.get(t.id)} canDelete={!!onDeleteTask}
                    onVerdict={onVerdict} onComplete={onComplete} />
```

- [ ] **Step 4: Run the whole file to verify it passes**

```bash
npx vitest run src/components/schedule/HorizonPoolDropdown.test.tsx
```

Expected: PASS — the pre-existing tests plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/HorizonPoolDropdown.tsx src/components/schedule/HorizonPoolDropdown.test.tsx
git commit -m "feat(today): pool rows can carry a provenance label"
```

---

## Task 15: The School dropdown on Today

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (imports ~line 53-60, pool memos ~line 300-313, controls strip ~line 836-864)

**Interfaces:**
- Consumes: `selectSchoolPool`, `parseCaptureMeta`, `formatCaptureMeta` from Task 13; `metaFor` from Task 14.
- Produces: the rendered surface. Nothing consumes it.

Placement is constrained by two standing decisions: Today is a commitment surface, so nothing appears on the day until it is triaged; and the pools live in the controls strip, never inside `ReviewDrawer`. This task touches neither the drawer nor the agenda.

- [ ] **Step 1: Add the imports**

In `src/components/schedule/TodayView.tsx`, beside the existing `selectHorizonPool` import:

```typescript
import { selectSchoolPool, parseCaptureMeta, formatCaptureMeta } from '@/lib/today/schoolPool'
```

- [ ] **Step 2: Add the pool memo**

After the existing `monthPool` memo, add:

```typescript
  // Candidates the feed connectors extracted from ClassDojo and the parent
  // WhatsApp groups. Same treatment as the week/month pools: a place to look,
  // deliberately outside the review, and never on the day until triaged.
  const schoolPool = useMemo(() => selectSchoolPool(tasks), [tasks])
  const schoolMetaFor = useCallback(
    (t: Task) => formatCaptureMeta(parseCaptureMeta(t.notes)),
    [],
  )
```

If `useCallback` is not already imported in this file, add it to the React import.

- [ ] **Step 3: Render the dropdown**

In the `data-testid="today-controls"` strip, after the Month `HorizonPoolDropdown` and before the `AssigneeFilter` block:

```tsx
        {schoolPool.length > 0 && (
          <HorizonPoolDropdown
            label="School"
            tasks={schoolPool}
            offer={['today', 'tomorrow', 'week', 'someday', 'deleted']}
            viewedDate={viewedDate}
            onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
            onPushTask={ctx.onPushTask}
            onDeleteTask={ctx.onDeleteTask}
            onCompleteTask={onToggleTask}
            metaFor={schoolMetaFor}
          />
        )}
```

Unlike Week and Month, this trigger is gated on a non-empty pool. Those two are always rendered because they are permanent rungs of the planning rhythm; School is a feed that may legitimately have nothing in it for days, and an always-present "School · 0" would be furniture.

- [ ] **Step 4: Type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no new errors.

- [ ] **Step 5: Run the schedule test suite**

```bash
npx vitest run src/components/schedule
```

Expected: PASS. `ReviewDrawer.test.tsx` in particular must be untouched and green — if it changed, the School pool has leaked into the review and that is a defect.

- [ ] **Step 6: Look at it in the browser**

A type-check is not an inspection. Start the dev server and open Today.

```bash
npm run dev
```

Confirm: with no capture-derived tasks the strip looks exactly as before; with some, a "School · N" trigger appears beside Month, opens to triage rows carrying their source label, and a verdict removes the row. Confirm the ReviewDrawer still contains only the backlog.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): the School pool — school feed candidates, triaged from the strip"
```

---

## Task 16: Raw capture retention

**Files:**
- Create: `supabase/migrations/2026-08-25_capture_retention.sql`

**Interfaces:**
- Consumes: the `captures` table.
- Produces: nothing code-facing.

The spec's default: raw text is kept only as long as it is useful for review. A month of parent-group chatter and school messages sitting in the database forever is a privacy liability with no upside.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-08-25_capture_retention.sql`:

```sql
-- Raw captures are review material, not an archive. Thirty days after a
-- capture was extracted, the raw text goes; the candidates and the summary
-- note it produced are unaffected. Family chat transcripts should not
-- accumulate in the database indefinitely.

CREATE OR REPLACE FUNCTION purge_old_capture_text()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE captures
  SET raw_text = NULL
  WHERE raw_text IS NOT NULL
    AND status = 'extracted'
    AND created_at < now() - interval '30 days';
$$;

-- SECURITY DEFINER functions in public default to EXECUTE TO PUBLIC, which
-- PostgREST exposes to the anon key. This is called only by pg_cron.
REVOKE EXECUTE ON FUNCTION purge_old_capture_text() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-capture-text')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-capture-text');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('purge-old-capture-text', '0 4 * * *', 'SELECT purge_old_capture_text();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; purge-old-capture-text not scheduled.';
END;
$$;
```

- [ ] **Step 2: Commit and hand to Scott**

```bash
git add supabase/migrations/2026-08-25_capture_retention.sql
git commit -m "feat(capture): purge raw capture text 30 days after extraction"
```

Paste the SQL to Scott to run alongside the Task 1 migration.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §2 hands-off both feeds | 9 (WhatsApp receive), 12 (ClassDojo poll), 10 (flush tick) |
| §2 only signal surfaces, noise summarized | Reused `extract-capture`, unchanged; Task 2 extends dedupe to the second kind |
| §2 attribution to the right twin | 13 (`parseCaptureMeta` reads `For:`), 15 (rendered as row meta) |
| §2 nothing auto-commits to Today | 15 (pool is triage-only; agenda untouched) |
| §2 connector cannot send | 9 (two enforcing tests), Global Constraints |
| §4.1 ClassDojo spike before design | 0 |
| §4.2 not the Mac Mini | 11 (Fly) |
| §5.1 reuse the shipped parser | 5 (`renderTranscript` round-trip test against `parseWhatsAppExport`) |
| §5.2 batched twice daily, no tripwire | 4 (`flushHoursLocal` default `12,20`), 10 (`dueNow`) |
| §6 connector contract, advance only on 2xx | 7 (`deliver`), 6 (`HighWaterStore`), 10 (`flushAll` restore-on-failure) |
| §7 send-lockout invariant | 9 |
| §8 `capture_sources`, `connector_health`, `tasks.capture_id` | 1 |
| §8 verify the 2026-05-31 migration is live | 0 Step 1 (a hard STOP) |
| §8 DDL goes to Scott | 0 Step 5, 1 Step 9, 16 Step 2 |
| §9 School dropdown, ReviewDrawer untouched | 13, 14, 15 |
| §10 failure modes | 9 (unlink), 10 (flush failure), 12 (ClassDojo isolated in try/catch) |
| §11 secrets only on Fly; allowlist | 11 (README/secrets), 8 (`isWatched`, fails closed), 9 (gate at receipt) |
| §11 30-day retention | 16 |
| §12 health | 10 (`recordHealth`), 11 (README check) |
| §13 testing | Every task is TDD; the existing 12 `extract-capture` tests are re-run in Task 2 Step 7 |
| §14 build order | Tasks follow it: 0 → 1-3 → 4-11 → 12 → 13-15 → 16 |

**Deviations from the spec, deliberate:**

1. **§13's Playwright e2e is not in this plan.** The repo has no e2e auth fixture (a known open gap), so an authenticated Today e2e cannot be written without first building that fixture — which is its own piece of work. Substituted: the component test in Task 14 and the browser inspection in Task 15 Step 6. Flagged rather than silently dropped.
2. **§9's child chip is parsed from `tasks.notes`, not from `capture_sources.child_member_id`.** Resolving a child to `family_members` and writing it to `assigned_to` would set `scope` to `couple` on a `compound` family task — assignment shares, it does not label — which would narrow who can see the item. Parsing the `For:` line the extractor already writes avoids that entirely. `child_member_id` stays in the schema for a later use that needs it.

**Placeholder scan:** Task 12 Step 5 specifies `client.ts` by contract and constraints rather than by literal code, because its endpoints are Task 0's deliverable — the signature, error strings, and config handling are all fixed here. Everything else contains the actual content.

**Type consistency:** `ConnectorMessage`, `WatchedSource`, `FlushPayload`, `Config` are defined once in Task 4 and consumed by Tasks 5–12. `Config` gains `userId` in Task 10 Step 6 and `classdojoEmail`/`classdojoPassword` in Task 12 Step 5, with every fixture updated in the same step. `renderTranscript(messages, timezone)`, `deliver({source, messages, config, fetchImpl})`, `flushAll({buffer, sources, config, highWater, deliverImpl})`, `isWatched(sources, connector, sourceKey)`, `toConnectorMessages(posts, since)`, `selectSchoolPool(tasks)`, `metaFor(task)` are spelled identically in their defining and consuming tasks.
