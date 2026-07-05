# Symphony Call Log / Recents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate Symphony's existing `call_log` Postgres table with real outcomes (including missed/rejected calls, both directions), and surface it as (a) a "Recents" quick-redial row on the wall's Phone screen and (b) a full call-log table on a new parent settings page.

**Architecture:** Extends the existing kid-phone → Symphony call-event bridge (`kid-phone-call` edge function) rather than building a second one. Depends on the companion plan `~/Developer/kid-phone/docs/superpowers/plans/2026-07-05-call-log-event-bridge-plan.md`, which widens the event payload with `contactId`/`outcome`/`reason` — that plan should be implemented and deployed first (it's backward-compatible to run alone, so no harm if this plan's schema work happens first, but this plan's edge-function changes won't do anything useful until the kid-phone side is sending the new fields).

**Tech Stack:** React 19 + TypeScript, Vite, Supabase (Postgres + Deno edge functions), Vitest + Testing Library, React Router (via the Shell's `AppDef`/`ShellRoutes` system).

## Global Constraints

- No raw phone numbers reach the wall kiosk UI, ever — only `contact_name`/`contact_photo_url`/a masked partial number.
- Every existing test must keep passing (`npx vitest run`) after each task.
- `npx tsc --noEmit` (this repo uses `tsc -b` for the real Vercel build — see Task 8) must be clean after each task.
- New Deno edge-function tests follow this repo's existing convention: pure logic in `lib/*.ts`, tested with `lib/*.test.ts` (Deno-native `Deno.test`/`assertEquals`) — see `supabase/functions/list-contacts/lib/validate.ts` — OR, for logic embedded directly in `index.ts` (like `kid-phone-call`'s `buildRow`), an `index_test.ts` file (see `supabase/functions/kid-phone-call/index_test.ts`).
- New React hooks/components follow this repo's existing Vitest conventions: mock `@/lib/supabase` with a chainable `from()` (see `src/hooks/useContacts.test.ts`), `renderHook`/`waitFor` from `@testing-library/react`.
- A new page is added as a nested route inside an existing Shell `AppDef`'s Component (see `src/apps/contacts/ContactsApp.tsx` for the pattern), never as a new top-level React Router route or a new `App.tsx` `stateView` case (that system is retired).

---

### Task 1: Migration — widen `call_log` for outcomes, reasons, and contact identity

**Files:**
- Create: `supabase/migrations/2026-07-05_call_log_outcomes.sql`

**Interfaces:**
- Produces: `call_log.status` now allows `'rejected'`; new nullable columns `reason text`, `contact_id text`, `contact_name text`, `contact_photo_url text`.

- [ ] **Step 1: Write the migration**

```sql
-- call_log_outcomes — widens call_log to track real terminal outcomes
-- (including missed/rejected, both directions) and the contact involved,
-- denormalized at write time so the UI never needs a cross-system join back
-- to kid-phone's Firestore contact list, and no raw phone number needs to
-- travel alongside a resolvable number for unmatched calls.

alter table public.call_log
  add column if not exists reason text check (reason in ('quiet_hours','not_allowed')),
  add column if not exists contact_id text,
  add column if not exists contact_name text,
  add column if not exists contact_photo_url text;

-- Widen the status check constraint to add 'rejected'. The original
-- 2026-06-28 migration didn't name this constraint, so Postgres auto-named
-- it — look it up rather than guessing, in case the auto-generated name
-- differs from the usual <table>_<column>_check convention.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.call_log'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.call_log drop constraint %I', con_name);
  end if;
end $$;

alter table public.call_log add constraint call_log_status_check
  check (status in ('requested','ringing','connected','completed','failed','no_answer','rejected'));

create index if not exists call_log_contact_id_idx on public.call_log (contact_id);
```

- [ ] **Step 2: Apply the migration**

Per this project's established practice (see memory: "Migration history out of sync — use Management API for SQL"), apply via the Supabase Management API rather than `supabase migration up`:
```bash
SUPABASE_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @supabase/migrations/2026-07-05_call_log_outcomes.sql
```
Expected: a JSON success response (empty array or similar), not an error object.

- [ ] **Step 3: Verify the schema change**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"query":"select column_name, data_type from information_schema.columns where table_name = '"'"'call_log'"'"' order by ordinal_position"}'
```
Expected: the result includes rows for `reason`, `contact_id`, `contact_name`, `contact_photo_url`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-05_call_log_outcomes.sql
git commit -m "feat(db): widen call_log for rejected/missed outcomes and contact identity"
```

---

### Task 2: `kid-phone-call` writes a durable `call_log` row on every terminal event

**Files:**
- Modify: `supabase/functions/kid-phone-call/index.ts`
- Modify: `supabase/functions/kid-phone-call/index_test.ts`

**Interfaces:**
- Consumes: `contactId`/`outcome`/`reason` fields on the incoming `CallEventBody` (sent by the companion kid-phone plan — safe to consume even before that plan ships, since they'll just be `undefined` until then, and this task's new logic already treats them as optional).
- Produces: nothing new for other tasks — `list-call-log` (Task 3) reads `call_log` directly, not through this function.
- A new required secret this task depends on for inbound/rejected rows to be attributed to the household: `KIDPHONE_HOUSEHOLD_USER_ID` (see Step 5 for how to find the value and where to set it — outbound rows continue to get their `user_id` from `place-call`, which already has an authenticated Symphony user; inbound/rejected rows have no such user, since Twilio — not a logged-in Symphony session — triggers them).

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/kid-phone-call/index_test.ts` (this file already imports `validateRequest`/`buildRow` from `./index.ts` — add the new function to that import):
```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRequest, buildRow, buildCallLogRow } from './index.ts'

Deno.test('buildCallLogRow — outbound ringing: a fresh requested-style insert is not needed (place-call already inserted one); returns an update-by-call_sid patch', () => {
  const now = new Date('2026-07-05T10:00:00.000Z')
  const patch = buildCallLogRow(
    { callSid: 'CA1', direction: 'outbound', state: 'ringing', contactId: 'grandma', name: 'Grandma', number: '+13015551234' },
    'household-user-id',
    now,
  )
  assertEquals(patch.mode, 'update')
  assertEquals(patch.match, { call_sid: 'CA1' })
  assertEquals(patch.row.status, 'ringing')
  assertEquals(patch.row.contact_id, 'grandma')
  assertEquals(patch.row.contact_name, 'Grandma')
})

Deno.test('buildCallLogRow — outbound ended with an outcome: updates status to the outcome', () => {
  const now = new Date('2026-07-05T10:00:05.000Z')
  const patch = buildCallLogRow(
    { callSid: 'CA1', direction: 'outbound', state: 'ended', outcome: 'completed' },
    'household-user-id',
    now,
  )
  assertEquals(patch.mode, 'update')
  assertEquals(patch.row.status, 'completed')
  assertEquals(patch.row.ended_at, now.toISOString())
})

Deno.test('buildCallLogRow — outbound rejected: updates status to rejected with a reason', () => {
  const now = new Date('2026-07-05T10:00:00.000Z')
  const patch = buildCallLogRow(
    { callSid: '', direction: 'outbound', state: 'ended', outcome: 'rejected', reason: 'quiet_hours', contactId: 'grandma', name: 'Grandma' },
    'household-user-id',
    now,
  )
  // No call_sid (initiateCall's quiet-hours gate fires before Twilio ever
  // creates a call) → this must be a fresh insert, not an update-by-call_sid.
  assertEquals(patch.mode, 'insert')
  assertEquals(patch.row.status, 'rejected')
  assertEquals(patch.row.reason, 'quiet_hours')
  assertEquals(patch.row.user_id, 'household-user-id')
  assertEquals(patch.row.direction, 'outbound')
  assertEquals(patch.row.contact_name, 'Grandma')
})

Deno.test('buildCallLogRow — inbound ringing (allowed): a fresh insert (no prior requested row exists for inbound)', () => {
  const now = new Date('2026-07-05T10:00:00.000Z')
  const patch = buildCallLogRow(
    { callSid: 'CA2', direction: 'inbound', state: 'ringing', contactId: 'grandma', name: 'Grandma', number: '+13015551234' },
    'household-user-id',
    now,
  )
  assertEquals(patch.mode, 'insert')
  assertEquals(patch.row.direction, 'inbound')
  assertEquals(patch.row.status, 'ringing')
  assertEquals(patch.row.to_number, '+13015551234')
  assertEquals(patch.row.user_id, 'household-user-id')
})

Deno.test('buildCallLogRow — inbound rejected: a fresh insert with reason', () => {
  const now = new Date('2026-07-05T10:00:00.000Z')
  const patch = buildCallLogRow(
    { callSid: 'CA3', direction: 'inbound', state: 'ended', outcome: 'rejected', reason: 'not_allowed' },
    'household-user-id',
    now,
  )
  assertEquals(patch.mode, 'insert')
  assertEquals(patch.row.status, 'rejected')
  assertEquals(patch.row.reason, 'not_allowed')
  assertEquals(patch.row.to_number, '')
})
```

**Known, accepted race (not a bug to fix here):** for a kiosk-initiated outbound call, kid-phone's `initiateCall` publishes its `ringing` event *before* Symphony's `place-call` has finished inserting the initial `'requested'` row (place-call awaits `initiateCall`'s HTTP response, then inserts — but `initiateCall` fires the `ringing` webhook to Symphony from inside that same request, before responding). So the `ringing` update-by-`call_sid` can land on a row that doesn't exist yet and silently affect 0 rows. This is fine: the row still gets created moments later by `place-call` (status `'requested'`), and the later terminal (`ended`) event is guaranteed to arrive well after that insert completes (a real phone call takes seconds/minutes, the insert takes milliseconds), so it reliably updates. Net effect: some rows skip the cosmetic `'ringing'` intermediate state and jump straight from `'requested'` to a terminal status — acceptable, since `current_call` (not `call_log`) is what drives the live "ringing" UI.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd supabase/functions/kid-phone-call && deno test index_test.ts
```
Expected: FAIL — `buildCallLogRow` is not exported from `./index.ts`.

- [ ] **Step 3: Implement `buildCallLogRow` and wire it into the handler**

In `supabase/functions/kid-phone-call/index.ts`, widen `CallEventBody` and add the new pure function (add these right after the existing `CallEventBody` interface and before `validateRequest`):
```ts
export interface CallEventBody {
  callSid?: string
  direction?: 'inbound' | 'outbound'
  state?: 'ringing' | 'connected' | 'ended'
  name?: string
  number?: string
  photoURL?: string
  contactId?: string
  outcome?: 'completed' | 'no_answer' | 'failed' | 'rejected'
  reason?: 'quiet_hours' | 'not_allowed'
}

type CallLogPatch =
  | { mode: 'update'; match: { call_sid: string }; row: Record<string, unknown> }
  | { mode: 'insert'; row: Record<string, unknown> }

/**
 * Pure: decide how to durably record this event in call_log.
 *
 * Outbound calls placed via the kiosk/app already get a 'requested' row from
 * place-call (which has the real Symphony user_id and a call_sid up front),
 * so outbound events with a call_sid are UPDATEs keyed on that call_sid.
 * Everything else (inbound calls, and outbound calls rejected before Twilio
 * ever created a call — e.g. initiateCall's quiet-hours gate, which has no
 * call_sid) has no prior row to update, so it's a fresh INSERT stamped with
 * the household's fixed user_id (Twilio, not a logged-in Symphony session,
 * triggers these).
 */
export function buildCallLogRow(
  body: CallEventBody,
  householdUserId: string,
  now: Date,
): CallLogPatch {
  const status = body.state === 'ended' ? (body.outcome ?? 'completed') : (body.state ?? 'requested')
  const baseRow: Record<string, unknown> = {
    status,
    contact_id: body.contactId ?? null,
    contact_name: body.name ?? null,
    contact_photo_url: body.photoURL ?? null,
  }
  if (body.reason) baseRow.reason = body.reason
  if (body.state === 'ended') baseRow.ended_at = now.toISOString()
  if (body.state === 'ringing') baseRow.started_at = now.toISOString()

  const hasOutboundCallSid = body.direction === 'outbound' && !!body.callSid
  if (hasOutboundCallSid) {
    return { mode: 'update', match: { call_sid: body.callSid! }, row: baseRow }
  }
  return {
    mode: 'insert',
    row: {
      ...baseRow,
      user_id: householdUserId,
      call_sid: body.callSid || null,
      direction: body.direction ?? 'inbound',
      mode: 'bridge',
      to_number: body.number ?? '',
    },
  }
}
```

Then, in the `Deno.serve` handler, after the existing `current_call` upsert (and its own error check), add:
```ts
  const householdUserId = Deno.env.get('KIDPHONE_HOUSEHOLD_USER_ID') ?? ''
  if (householdUserId) {
    const patch = buildCallLogRow(v.body, householdUserId, new Date())
    if (patch.mode === 'update') {
      await admin.from('call_log').update(patch.row).eq('call_sid', patch.match.call_sid)
    } else {
      await admin.from('call_log').insert(patch.row)
    }
    // Never let a call_log write failure affect the response — the live
    // current_call takeover (already written above) is what matters in the
    // moment; call_log is a durable record, not part of the live call path.
  }
```
(Deliberately not checking the error here and failing the request on it — matches this function's existing "the wall's live takeover must never be blocked by a secondary write" philosophy already applied to `current_call`.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd supabase/functions/kid-phone-call && deno test index_test.ts
```
Expected: PASS.

- [ ] **Step 5: Find and set `KIDPHONE_HOUSEHOLD_USER_ID`**

Look up the household owner's Supabase auth user id:
```bash
SUPABASE_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" -H "Content-Type: application/json" \
  --data-binary '{"query":"select id, email from auth.users order by created_at asc limit 5"}'
```
Pick the row for the household owner's account (the one already used for `place-call`-initiated calls). Set it as an edge function secret:
```bash
npx supabase secrets set KIDPHONE_HOUSEHOLD_USER_ID=<the-uuid-from-above> --project-ref mwadppyrqzuzgstmwpuy
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/kid-phone-call/index.ts supabase/functions/kid-phone-call/index_test.ts
git commit -m "feat: write a durable call_log row from every kid-phone call event"
```

---

### Task 3: New `list-call-log` edge function (wall-facing, no raw numbers)

**Files:**
- Create: `supabase/functions/list-call-log/index.ts`
- Create: `supabase/functions/list-call-log/lib/serialize.ts`
- Create: `supabase/functions/list-call-log/lib/serialize.test.ts`

**Interfaces:**
- Produces: `serializeCallLogRow(row): CallLogListItem` — `{ direction, contactId, contactName, contactPhotoURL, status, reason, createdAt }`, never `to_number`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/list-call-log/lib/serialize.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { serializeCallLogRow } from './serialize.ts'

Deno.test('serializeCallLogRow strips to_number and keeps display fields', () => {
  const out = serializeCallLogRow({
    direction: 'outbound', contact_id: 'grandma', contact_name: 'Grandma',
    contact_photo_url: 'https://x/g.jpg', status: 'completed', reason: null,
    created_at: '2026-07-05T10:00:00Z', to_number: '+13015551234',
  })
  assertEquals(out, {
    direction: 'outbound', contactId: 'grandma', contactName: 'Grandma',
    contactPhotoURL: 'https://x/g.jpg', status: 'completed', reason: null,
    createdAt: '2026-07-05T10:00:00Z',
  })
  assertEquals((out as Record<string, unknown>).to_number, undefined)
})

Deno.test('serializeCallLogRow tolerates missing optional fields', () => {
  const out = serializeCallLogRow({
    direction: 'inbound', contact_id: null, contact_name: null,
    contact_photo_url: null, status: 'rejected', reason: 'not_allowed',
    created_at: '2026-07-05T10:00:00Z', to_number: '+15551234567',
  })
  assertEquals(out.contactId, null)
  assertEquals(out.contactName, null)
  assertEquals(out.reason, 'not_allowed')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd supabase/functions/list-call-log/lib && deno test serialize.test.ts
```
Expected: FAIL — `serialize.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/list-call-log/lib/serialize.ts
// Strips call_log rows down to display-safe fields for the wall kiosk — no
// raw phone number ever leaves this function, matching the existing rule
// that the wall/browser never sees a dialable number.

export interface CallLogRow {
  direction: string
  contact_id: string | null
  contact_name: string | null
  contact_photo_url: string | null
  status: string
  reason: string | null
  created_at: string
  to_number: string
}

export interface CallLogListItem {
  direction: string
  contactId: string | null
  contactName: string | null
  contactPhotoURL: string | null
  status: string
  reason: string | null
  createdAt: string
}

export function serializeCallLogRow(row: CallLogRow): CallLogListItem {
  return {
    direction: row.direction,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactPhotoURL: row.contact_photo_url,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
  }
}
```

```ts
// supabase/functions/list-call-log/index.ts
// LIST-CALL-LOG — authenticated read of the caller's own call_log, stripped
// to display-safe fields. Unlike list-contacts, this does NOT proxy to any
// secret-gated bridge: call_log already lives in Symphony's own Postgres,
// and RLS ("call_log owner can read") already scopes rows to auth.uid(),
// so we just query with the caller's own JWT and re-shape the result.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serializeCallLogRow, type CallLogRow } from './lib/serialize.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'missing bearer token' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)

  const { limit } = (await req.json().catch(() => ({}))) as { limit?: number }

  const { data, error } = await userClient
    .from('call_log')
    .select('direction, contact_id, contact_name, contact_photo_url, status, reason, created_at, to_number')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit ?? 50, 100))

  if (error) return jsonResponse({ error: error.message }, 502)

  return jsonResponse({ calls: (data as CallLogRow[]).map(serializeCallLogRow) })
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd supabase/functions/list-call-log/lib && deno test serialize.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/list-call-log
git commit -m "feat: add list-call-log edge function (no raw numbers to the wall)"
```

---

### Task 4: `useRecentCalls` hook + client lib (wall-facing, redialable only)

**Files:**
- Create: `src/lib/telephony/listCallLog.ts`
- Create: `src/hooks/useRecentCalls.ts`
- Create: `src/hooks/useRecentCalls.test.ts`

**Interfaces:**
- Consumes: `list-call-log` edge function (Task 3).
- Produces: `useRecentCalls(enabled: boolean): { recents: RecentCallContact[], loading: boolean, error?: string }`, where `RecentCallContact = { contactId: string; name: string; photoURL?: string }` — deduplicated to the most recent call per contact, capped at 4, and **only** entries with a `contactId` (unmatched/blocked calls aren't redialable and are filtered out here so `WallV2PhoneScreen` never has to reason about that).

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useRecentCalls.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const invokeMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}))

import { useRecentCalls } from './useRecentCalls'

describe('useRecentCalls', () => {
  beforeEach(() => invokeMock.mockReset())

  it('dedupes to the most recent call per contact, capped at 4, redialable only', async () => {
    invokeMock.mockResolvedValue({
      data: {
        calls: [
          { direction: 'outbound', contactId: 'grandma', contactName: 'Grandma', contactPhotoURL: null, status: 'completed', reason: null, createdAt: '2026-07-05T10:03:00Z' },
          { direction: 'inbound', contactId: null, contactName: null, contactPhotoURL: null, status: 'rejected', reason: 'not_allowed', createdAt: '2026-07-05T10:02:00Z' },
          { direction: 'outbound', contactId: 'grandma', contactName: 'Grandma', contactPhotoURL: null, status: 'completed', reason: null, createdAt: '2026-07-05T10:01:00Z' },
          { direction: 'inbound', contactId: 'uncle-bob', contactName: 'Uncle Bob', contactPhotoURL: 'https://x/b.jpg', status: 'completed', reason: null, createdAt: '2026-07-05T10:00:00Z' },
        ],
      },
      error: null,
    })
    const { result } = renderHook(() => useRecentCalls(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recents).toEqual([
      { contactId: 'grandma', name: 'Grandma', photoURL: undefined },
      { contactId: 'uncle-bob', name: 'Uncle Bob', photoURL: 'https://x/b.jpg' },
    ])
  })

  it('does not fetch when disabled', () => {
    renderHook(() => useRecentCalls(false))
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('surfaces an error and keeps recents empty', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useRecentCalls(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.recents).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/useRecentCalls.test.ts
```
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/lib/telephony/listCallLog.ts
// Client for the call-log feed (list-call-log edge fn). Display fields only.

import { supabase } from '@/lib/supabase'

export interface CallLogListItem {
  direction: 'inbound' | 'outbound'
  contactId: string | null
  contactName: string | null
  contactPhotoURL: string | null
  status: string
  reason: string | null
  createdAt: string
}

export interface CallLogResult {
  ok: boolean
  calls: CallLogListItem[]
  error?: string
}

export async function fetchCallLog(limit?: number): Promise<CallLogResult> {
  const { data, error } = await supabase.functions.invoke('list-call-log', { body: { limit } })
  if (error) return { ok: false, calls: [], error: error.message }
  const calls = (data as { calls?: CallLogListItem[] })?.calls ?? []
  return { ok: true, calls }
}
```

```ts
// src/hooks/useRecentCalls.ts
import { useEffect, useState } from 'react'
import { fetchCallLog } from '@/lib/telephony/listCallLog'

export interface RecentCallContact {
  contactId: string
  name: string
  photoURL?: string
}

const RECENTS_LIMIT = 4

/** Most-recent-first, deduped to one entry per contact, redialable only (has a contactId). */
export function dedupeRedialable(calls: Array<{ contactId: string | null; contactName: string | null; contactPhotoURL: string | null }>): RecentCallContact[] {
  const seen = new Set<string>()
  const out: RecentCallContact[] = []
  for (const c of calls) {
    if (!c.contactId || seen.has(c.contactId)) continue
    seen.add(c.contactId)
    out.push({ contactId: c.contactId, name: c.contactName ?? '', photoURL: c.contactPhotoURL ?? undefined })
    if (out.length >= RECENTS_LIMIT) break
  }
  return out
}

/** Fetches once when `enabled` becomes true — mirrors useKidPhoneContacts's shape. */
export function useRecentCalls(enabled: boolean) {
  const [recents, setRecents] = useState<RecentCallContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    fetchCallLog(50).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setRecents(dedupeRedialable(r.calls))
      } else {
        setError(r.error)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { recents, loading, error }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/useRecentCalls.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/telephony/listCallLog.ts src/hooks/useRecentCalls.ts src/hooks/useRecentCalls.test.ts
git commit -m "feat: add useRecentCalls hook for the wall's quick-redial row"
```

---

### Task 5: Recents row on `WallV2PhoneScreen`

**Files:**
- Modify: `src/components/wall-v2/WallV2PhoneScreen.tsx`
- Modify: `src/components/wall-v2/WallV2PhoneScreen.test.tsx`

**Interfaces:**
- Consumes: `useRecentCalls` (Task 4), reuses the existing `ContactButton` component and `confirm()`/`pending` flow already in this file (tapping a recent contact opens the same confirm dialog as tapping a favorite/other contact — no new call-placing code path).

- [ ] **Step 1: Write the failing test**

Add to `src/components/wall-v2/WallV2PhoneScreen.test.tsx`. First add a mock for the new hook near the top of the file (alongside the existing `useKidPhoneContacts` mock):
```ts
const mockRecents = vi.fn();
vi.mock('@/hooks/useRecentCalls', () => ({
  useRecentCalls: (...args: unknown[]) => mockRecents(...args),
}));
```
Then add tests:
```ts
  it('shows a Recents row above favorites when there are recent calls', () => {
    mockRecents.mockReturnValue({ recents: [{ contactId: 'uncle-bob', name: 'Uncle Bob', photoURL: undefined }], loading: false });
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.getByText(/Recent/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Uncle Bob/ })).toBeInTheDocument();
  });

  it('omits the Recents row when there are none', () => {
    mockRecents.mockReturnValue({ recents: [], loading: false });
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.queryByText(/Recent/i)).not.toBeInTheDocument();
  });

  it('tapping a recent contact opens the same confirm-and-call flow', async () => {
    mockRecents.mockReturnValue({ recents: [{ contactId: 'uncle-bob', name: 'Uncle Bob', photoURL: undefined }], loading: false });
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Uncle Bob/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(placeCall).toHaveBeenCalledWith({ contactId: 'uncle-bob', source: 'kiosk' }));
  });
```
(Add `mockRecents.mockReset()` to the existing `beforeEach`, and add `waitFor` to the `@testing-library/react` import at the top of the file if it isn't already imported.)

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/wall-v2/WallV2PhoneScreen.test.tsx
```
Expected: FAIL — `@/hooks/useRecentCalls` doesn't exist as a module the component imports yet, and there's no "Recent" text/row.

- [ ] **Step 3: Implement**

In `src/components/wall-v2/WallV2PhoneScreen.tsx`, add the import:
```ts
import { useRecentCalls } from '@/hooks/useRecentCalls'
```
Inside `WallV2PhoneScreen`, add the hook call right after the existing `useKidPhoneContacts` line:
```ts
  const { recents } = useRecentCalls(true)
```
Add a Recents row right above the existing favorites `<div>` (i.e., right after the closing `</div>` of the sticky header, before `{favorites.length > 0 && (`):
```tsx
        {recents.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-bold text-stone-500 uppercase tracking-wide mb-4">Recent</h2>
            <div className="flex flex-wrap gap-4 justify-center">
              {recents.map((c) => (
                <ContactButton
                  key={c.contactId}
                  c={{ contactId: c.contactId, name: c.name, photoURL: c.photoURL, favorite: false, enabled: true }}
                  onTap={(x) => setPending({ state: 'confirm', contact: x })}
                />
              ))}
            </div>
          </div>
        )}
```
(`ContactButton` expects a `KidPhoneContact`-shaped prop — `favorite`/`enabled` aren't read by `ContactButton` itself, but are part of the `KidPhoneContact` type from `@/lib/telephony/listContacts`, so this literal keeps TypeScript happy without changing `ContactButton`'s signature.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/wall-v2/WallV2PhoneScreen.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2PhoneScreen.tsx src/components/wall-v2/WallV2PhoneScreen.test.tsx
git commit -m "feat(wall): add a Recents quick-redial row to the phone book"
```

---

### Task 6: `useCallLog` hook (parent-facing, full history, progressive "load more")

**Files:**
- Create: `src/hooks/useCallLog.ts`
- Create: `src/hooks/useCallLog.test.ts`

**Interfaces:**
- Consumes: `call_log` table directly via Supabase (RLS-scoped to `auth.uid()` — this is the account owner viewing their own data, so no edge function needed, matching the design spec's "Symphony changes" section).
- Produces: `useCallLog(): { calls: CallLogEntry[], loading: boolean, error: string | null, visibleCount: number, showMore: () => void, hasMore: boolean }`, where `CallLogEntry` includes a masked `maskedNumber` field (e.g. `"•••1234"`) for entries with no `contact_name` — this hook is the one place in the whole feature allowed to see `to_number`, since it's for the account owner, not the wall.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useCallLog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockUser = { id: 'test-user-id' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))

const mockOrder = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), order: mockOrder })) },
}))

import { useCallLog, maskNumber } from './useCallLog'

describe('maskNumber', () => {
  it('keeps only the last 4 digits, masking the rest', () => {
    expect(maskNumber('+13015551234')).toBe('•••1234')
  })
  it('handles a short/malformed number gracefully', () => {
    expect(maskNumber('12')).toBe('•••12')
    expect(maskNumber('')).toBe('•••')
  })
})

describe('useCallLog', () => {
  beforeEach(() => mockOrder.mockReset())

  it('loads calls and masks numbers for entries with no matched contact', async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: '1', direction: 'inbound', contact_name: null, contact_photo_url: null, status: 'rejected', reason: 'not_allowed', to_number: '+12025550000', created_at: '2026-07-05T10:00:00Z' },
        { id: '2', direction: 'outbound', contact_name: 'Grandma', contact_photo_url: null, status: 'completed', reason: null, to_number: '+13015551234', created_at: '2026-07-05T09:00:00Z' },
      ],
      error: null,
    })
    const { result } = renderHook(() => useCallLog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.calls[0]).toMatchObject({ contactName: null, maskedNumber: '•••0000' })
    expect(result.current.calls[1]).toMatchObject({ contactName: 'Grandma' })
  })

  it('paginates progressively via showMore', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: String(i), direction: 'outbound', contact_name: 'Grandma', contact_photo_url: null,
      status: 'completed', reason: null, to_number: '+13015551234',
      created_at: new Date(2026, 6, 5, 10, i).toISOString(),
    }))
    mockOrder.mockResolvedValue({ data: rows, error: null })
    const { result } = renderHook(() => useCallLog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.calls).toHaveLength(20)
    expect(result.current.hasMore).toBe(true)
    act(() => result.current.showMore())
    expect(result.current.calls).toHaveLength(40)
    expect(result.current.hasMore).toBe(false)
  })

  it('surfaces a fetch error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useCallLog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/useCallLog.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/hooks/useCallLog.ts
// Parent-facing call log: the account owner reading their own call_log rows
// directly (RLS already scopes to auth.uid()). Unlike the wall's
// useRecentCalls, this DOES see to_number — but only ever exposes a masked
// partial number for entries with no matched contact, so an unrecognized
// caller is still identifiable at a glance without displaying a full,
// dialable number in the UI.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface CallLogEntry {
  id: string
  direction: 'inbound' | 'outbound'
  contactName: string | null
  contactPhotoURL: string | null
  status: string
  reason: string | null
  maskedNumber: string
  createdAt: string
}

interface DbCallLogRow {
  id: string
  direction: 'inbound' | 'outbound'
  contact_name: string | null
  contact_photo_url: string | null
  status: string
  reason: string | null
  to_number: string
  created_at: string
}

const PAGE_SIZE = 20

/** Last 4 digits visible, everything else replaced with a bullet marker. */
export function maskNumber(raw: string): string {
  const last4 = raw.slice(-4)
  return `•••${last4}`
}

function toEntry(row: DbCallLogRow): CallLogEntry {
  return {
    id: row.id,
    direction: row.direction,
    contactName: row.contact_name,
    contactPhotoURL: row.contact_photo_url,
    status: row.status,
    reason: row.reason,
    maskedNumber: maskNumber(row.to_number ?? ''),
    createdAt: row.created_at,
  }
}

export function useCallLog() {
  const { user } = useAuth()
  const [allEntries, setAllEntries] = useState<CallLogEntry[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setAllEntries([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('call_log')
      .select('id, direction, contact_name, contact_photo_url, status, reason, to_number, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }: { data: DbCallLogRow[] | null; error: { message: string } | null }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setLoading(false)
          return
        }
        setAllEntries((data ?? []).map(toEntry))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const showMore = useCallback(() => {
    setVisibleCount((n) => n + PAGE_SIZE)
  }, [])

  return {
    calls: allEntries.slice(0, visibleCount),
    loading,
    error,
    hasMore: visibleCount < allEntries.length,
    showMore,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/useCallLog.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCallLog.ts src/hooks/useCallLog.test.ts
git commit -m "feat: add useCallLog hook for the parent settings page"
```

---

### Task 7: Parent settings page at `/settings/kid-phone`

**Files:**
- Create: `src/components/settings/KidPhoneCallLog.tsx`
- Create: `src/components/settings/KidPhoneCallLog.test.tsx`
- Modify: `src/apps/settings/SettingsApp.tsx`
- Modify: `src/components/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `useCallLog` (Task 6).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/settings/KidPhoneCallLog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseCallLog = vi.fn()
vi.mock('@/hooks/useCallLog', () => ({ useCallLog: () => mockUseCallLog() }))

import { KidPhoneCallLog } from './KidPhoneCallLog'

describe('KidPhoneCallLog', () => {
  beforeEach(() => mockUseCallLog.mockReset())

  it('shows a loading state', () => {
    mockUseCallLog.mockReturnValue({ calls: [], loading: true, error: null, hasMore: false, showMore: vi.fn() })
    render(<KidPhoneCallLog onBack={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    mockUseCallLog.mockReturnValue({ calls: [], loading: false, error: null, hasMore: false, showMore: vi.fn() })
    render(<KidPhoneCallLog onBack={() => {}} />)
    expect(screen.getByText(/no calls yet/i)).toBeInTheDocument()
  })

  it('shows a contact name when matched, and a masked number when not', () => {
    mockUseCallLog.mockReturnValue({
      calls: [
        { id: '1', direction: 'outbound', contactName: 'Grandma', contactPhotoURL: null, status: 'completed', reason: null, maskedNumber: '•••1234', createdAt: '2026-07-05T10:00:00Z' },
        { id: '2', direction: 'inbound', contactName: null, contactPhotoURL: null, status: 'rejected', reason: 'not_allowed', maskedNumber: '•••0000', createdAt: '2026-07-05T09:00:00Z' },
      ],
      loading: false, error: null, hasMore: false, showMore: vi.fn(),
    })
    render(<KidPhoneCallLog onBack={() => {}} />)
    expect(screen.getByText('Grandma')).toBeInTheDocument()
    expect(screen.getByText('•••0000')).toBeInTheDocument()
  })

  it('calls showMore when "Load more" is clicked', () => {
    const showMore = vi.fn()
    mockUseCallLog.mockReturnValue({
      calls: [{ id: '1', direction: 'outbound', contactName: 'Grandma', contactPhotoURL: null, status: 'completed', reason: null, maskedNumber: '•••1234', createdAt: '2026-07-05T10:00:00Z' }],
      loading: false, error: null, hasMore: true, showMore,
    })
    render(<KidPhoneCallLog onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(showMore).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/settings/KidPhoneCallLog.test.tsx
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the page**

```tsx
// src/components/settings/KidPhoneCallLog.tsx
import { PhoneIncoming, PhoneOutgoing, ArrowLeft } from 'lucide-react'
import { useCallLog, type CallLogEntry } from '@/hooks/useCallLog'

const STATUS_LABEL: Record<string, string> = {
  completed: 'Connected',
  no_answer: 'Missed',
  failed: 'Failed',
  rejected: 'Blocked',
  ringing: 'Ringing',
  connected: 'Connected',
  requested: 'Requested',
}

function relativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ReasonNote({ reason }: { reason: string | null }) {
  if (!reason) return null
  return <span className="text-neutral-400"> · {reason === 'quiet_hours' ? 'Quiet hours' : 'Not allowed'}</span>
}

function CallLogRow({ call }: { call: CallLogEntry }) {
  const inbound = call.direction === 'inbound'
  const Icon = inbound ? PhoneIncoming : PhoneOutgoing
  return (
    <li className="flex items-center gap-4 py-3 border-b border-neutral-100 last:border-0">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 shrink-0">
        <Icon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-neutral-800 truncate">{call.contactName ?? call.maskedNumber}</p>
        <p className="text-sm text-neutral-500">
          {STATUS_LABEL[call.status] ?? call.status}
          <ReasonNote reason={call.reason} />
        </p>
      </div>
      <span className="text-sm text-neutral-400 shrink-0">{relativeTime(call.createdAt)}</span>
    </li>
  )
}

export function KidPhoneCallLog({ onBack }: { onBack: () => void }) {
  const { calls, loading, error, hasMore, showMore } = useCallLog()

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </button>
      <h1 className="text-2xl font-semibold text-neutral-800 mb-6">Kid Phone — Call Log</h1>

      {loading && <p className="text-neutral-500">Loading call history…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && calls.length === 0 && <p className="text-neutral-500">No calls yet.</p>}

      {!loading && calls.length > 0 && (
        <>
          <ul>
            {calls.map((call) => <CallLogRow key={call.id} call={call} />)}
          </ul>
          {hasMore && (
            <button onClick={showMore} className="mt-4 text-sm font-medium text-forest-600 hover:underline">
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/settings/KidPhoneCallLog.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Wire the route**

Change `src/apps/settings/SettingsApp.tsx` from:
```tsx
import { useNavigate } from 'react-router-dom'
import { SettingsPage } from '@/components/settings/SettingsPage'

export function SettingsApp() {
  const navigate = useNavigate()
  return <SettingsPage onBack={() => navigate('/today')} />
}
```
to:
```tsx
import { Routes, Route, useNavigate } from 'react-router-dom'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { KidPhoneCallLog } from '@/components/settings/KidPhoneCallLog'

function SettingsIndex() {
  const navigate = useNavigate()
  return <SettingsPage onBack={() => navigate('/today')} />
}

function KidPhoneCallLogRoute() {
  const navigate = useNavigate()
  return <KidPhoneCallLog onBack={() => navigate('/settings')} />
}

export function SettingsApp() {
  return (
    <Routes>
      <Route index element={<SettingsIndex />} />
      <Route path="kid-phone" element={<KidPhoneCallLogRoute />} />
    </Routes>
  )
}
```

- [ ] **Step 6: Add an entry point from the existing Settings page**

Find the `general` tab's content in `src/components/settings/SettingsPage.tsx` (search for `Tab = 'general'`), and add a link/button near the top of that tab's rendered content:
```tsx
<a
  href="/settings/kid-phone"
  className="block rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50 transition-colors mb-4"
>
  <p className="font-medium text-neutral-800">Kid Phone — Call Log</p>
  <p className="text-sm text-neutral-500">See recent calls to and from the kid phone.</p>
</a>
```
(Read the surrounding JSX in `SettingsPage.tsx`'s general tab first to match its exact existing card/section styling rather than inventing new classes — this repo's `.card`-style conventions from `src/index.css` should be preferred if the general tab already uses a `.card` wrapper pattern for its sections.)

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```
Expected: all pass, including the new `KidPhoneCallLog.test.tsx`, `useCallLog.test.ts`, `useRecentCalls.test.ts`, and `WallV2PhoneScreen.test.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/KidPhoneCallLog.tsx src/components/settings/KidPhoneCallLog.test.tsx src/apps/settings/SettingsApp.tsx src/components/settings/SettingsPage.tsx
git commit -m "feat: add parent-facing Kid Phone call log settings page at /settings/kid-phone"
```

---

### Task 8: Full verification, then explicit hand-off before pushing to `main`

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

```bash
npx vitest run
```
Expected: all pass.

- [ ] **Step 2: Typecheck (matches the real Vercel build, not just `tsc --noEmit`)**

```bash
npm run build
```
Expected: clean build (this repo's `pre-push` hook runs `tsc --noEmit`, which is weaker than the real Vercel build's `tsc -b` — run the full `npm run build` here to catch anything the hook would miss, per this repo's own documented gotcha).

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no new errors introduced by this plan's files (pre-existing warnings elsewhere in the repo are not this plan's concern).

- [ ] **Step 4: Do NOT push yet**

This repo's `main` branch auto-deploys to production on every push (`vercel.json` → `git.deploymentEnabled: true`). Per this repo's CLAUDE.md, this worktree (`.worktrees/kidphone-call-log`) should be rebased onto current `origin/main` before merging, and the actual push/merge to `main` is a deliberate, explicit step — stop here and confirm with the user before merging this branch into `main`, exactly as was done for the earlier `fix/wall-phone-hangup` and `feat/handset-pending-call` work in this same repo.
