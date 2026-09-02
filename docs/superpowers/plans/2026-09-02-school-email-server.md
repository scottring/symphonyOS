# School Email Ingest — Server Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A forwarded school email reaches Symphony through a per-household address and becomes a dated event task with per-person subtasks, the original attached, with nothing dropped.

**Architecture:** Cloudflare Email Worker (`infra/inbound-mail`) parses the message and POSTs JSON to a new `inbound-email` edge function, which resolves the household by token, stores an idempotent `captures` row, and invokes a new `extract-email` edge function. That function asks Claude for events/items/todos, then a pure, unit-tested `planWrites()` decides exactly which `tasks`/`notes` rows to insert. No client code in this phase; everything is verifiable with curl.

**Tech Stack:** Supabase edge functions (Deno, `esm.sh/@supabase/supabase-js@2`), Postgres migration, Anthropic Messages API (raw fetch, `claude-sonnet-5`), Cloudflare Workers + `postal-mime`, Vitest (root config already includes `supabase/functions/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-02-school-email-to-event-design.md`

## Global Constraints

- Work in a feature worktree off `origin/main`; never edit or commit in the main worktree. Push with `git push origin HEAD:main` (rebase on rejection). Pre-push runs `tsc -p tsconfig.app.json` + the full Vitest suite; never `--no-verify`.
- Node 22.14.0: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`. Run tests with `npx vitest run <path>` (bare `npm test` is watch mode). If pre-push fails in `connectors/src/whatsapp/adapter.test.ts`, run `npm install` inside `connectors/` (known fresh-worktree trap).
- Edge functions: `index.ts` imports from esm.sh and calls `Deno.serve` at module load, so **all testable logic lives in `lib/*.ts`** (pure, no Deno globals) and is imported by `index.ts` with the `.ts` extension. Tests import without the extension (`from './plan'`).
- Auth for both new functions is the existing `x-capture-secret` header checked against `CAPTURE_SHARED_SECRET`. Both need `verify_jwt = false` in `supabase/config.toml`.
- Writes use the service role. Scope is DERIVED: every inserted task/note row has `context: 'family'` and `scope: 'compound'` via the `scopeFor` mirror; nothing writes a literal scope by hand elsewhere.
- Never partial-`upsert` `tasks`. Inserts only; parent first, then children with the returned id.
- `needed_on`, `scheduled_for` for all-day events, and `week_start` are DATE-like: serialize as `YYYY-MM-DD` for `needed_on`, and as a zoned ISO instant (household timezone, midnight) for `scheduled_for`. Never `new Date('2026-03-05')`.
- Extraction model id: `claude-sonnet-5`. Anthropic call shape: copy `callClaude` from `supabase/functions/school-digest/index.ts` (handles `stop_reason === 'refusal'`).
- No emoji anywhere. No outbound email of any kind from the Worker.
- Deploy order at the end: migration (Scott applies by hand) → `npx supabase functions deploy <fn> --project-ref mwadppyrqzuzgstmwpuy --use-api` for both functions → push to main. The Worker deploy and Cloudflare routing rule are Scott's manual step.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-09-02_school_email_ingest.sql` | households.inbound_token + timezone, captures columns, kind check, unique message index, household RLS, `ensure_inbound_token` RPC |
| `supabase/functions/inbound-email/lib/validate.ts` | Validate the Worker payload (pure) |
| `supabase/functions/inbound-email/index.ts` | Auth, token → household/owner, idempotent capture insert, invoke extract |
| `supabase/functions/extract-email/lib/types.ts` | `EmailExtraction`, `Member`, `TaskRow`, `NoteRow`, `ExistingBlock` |
| `supabase/functions/extract-email/lib/prompt.ts` | `buildEmailPrompt`, `parseEmailExtraction` |
| `supabase/functions/extract-email/lib/members.ts` | `matchMembers` — names in the email → member rows |
| `supabase/functions/extract-email/lib/dates.ts` | `zonedIso`, `addDays` |
| `supabase/functions/extract-email/lib/plan.ts` | `planWrites` — extraction → rows (pure) |
| `supabase/functions/extract-email/index.ts` | Load capture + members + existing blocks, call Claude, run plan, insert, mark status |
| `supabase/config.toml` | `verify_jwt = false` for both |
| `infra/inbound-mail/{package.json,wrangler.toml,tsconfig.json,src/handler.ts,src/index.ts,src/handler.test.ts}` | Email Worker: parse → payload → POST |
| `docs/school-mail-setup.md` | Deploy + Cloudflare routing steps, smoke test |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/2026-09-02_school_email_ingest.sql`

**Interfaces:**
- Produces: columns `households.inbound_token text unique`, `households.timezone text not null default 'America/New_York'`, `captures.household_id`, `captures.subject`, `captures.sender`, `captures.reviewed_at`; `captures.kind` accepts `'email'`; RPC `ensure_inbound_token(p_household uuid) returns text`.

- [ ] **Step 1: Write the migration**

```sql
-- School email ingest (spec: docs/superpowers/specs/2026-09-02-school-email-to-event-design.md)
-- A household forwards school mail to <inbound_token>@symphony-os.com; the
-- Worker → inbound-email → extract-email chain turns it into placed rows.

create extension if not exists pgcrypto;

alter table households
  add column if not exists inbound_token text unique,
  add column if not exists timezone text not null default 'America/New_York';

alter table captures drop constraint if exists captures_kind_check;
alter table captures add constraint captures_kind_check
  check (kind in ('text','whatsapp_export','classdojo_thread','image','email'));

alter table captures
  add column if not exists household_id uuid references households(id) on delete cascade,
  add column if not exists subject text,
  add column if not exists sender text,
  add column if not exists reviewed_at timestamptz;

-- One capture per email: source_key = 'email:<Message-ID>'.
create unique index if not exists captures_email_message_idx
  on captures (source_key) where kind = 'email';

-- The partner who did not forward the email can still open it.
drop policy if exists captures_household_read on captures;
create policy captures_household_read on captures for select
  using (household_id is not null and users_share_household(auth.uid(), user_id));

drop policy if exists captures_household_review on captures;
create policy captures_household_review on captures for update
  using (household_id is not null and users_share_household(auth.uid(), user_id))
  with check (household_id is not null and users_share_household(auth.uid(), user_id));

-- Returns the household's forwarding token, generating it on first call.
-- Caller must be an ACTIVE member of the household. Nothing else writes it.
create or replace function ensure_inbound_token(p_household uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from household_members
    where household_id = p_household and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'not a member of this household';
  end if;

  select inbound_token into v_token from households where id = p_household;
  if v_token is null then
    v_token := substr(encode(gen_random_bytes(12), 'hex'), 1, 16);
    update households set inbound_token = v_token where id = p_household;
  end if;
  return v_token;
end;
$$;

revoke all on function ensure_inbound_token(uuid) from public;
grant execute on function ensure_inbound_token(uuid) to authenticated;
```

- [ ] **Step 2: Hand it to Scott to apply**

The Management API curl is blocked for the agent (classifier). Post the file path in the report and ask Scott to run it in the Supabase SQL editor. Until it is applied, Task 2 and Task 6 can be written and unit-tested but not smoke-tested.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-09-02_school_email_ingest.sql
git commit -m "feat(db): school email ingest — household inbound token, captures email columns, household read policy"
```

---

### Task 2: `inbound-email` edge function

**Files:**
- Create: `supabase/functions/inbound-email/lib/validate.ts`
- Create: `supabase/functions/inbound-email/lib/validate.test.ts`
- Create: `supabase/functions/inbound-email/index.ts`
- Modify: `supabase/config.toml` (append a `[functions.inbound-email]` block after `[functions.extract-capture]`)

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: HTTP contract for the Worker (Task 7): `POST /functions/v1/inbound-email`, header `x-capture-secret`, body `InboundPayload`; 202 `{ ok, capture_id }` on new, 200 `{ ok, capture_id, duplicate: true }` on repeat, 404 unknown token, 400 invalid, 401 bad secret.

- [ ] **Step 1: Write the failing validation test**

`supabase/functions/inbound-email/lib/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateInbound, sourceKeyFor } from './validate'

const good = {
  token: 'a1b2c3d4e5f60718',
  message_id: '<abc@hillside.org>',
  from: 'Hillside Elementary <news@hillside.org>',
  subject: 'Weekly Update',
  text: 'Picture Day is Thursday.',
  received_at: '2026-09-02T12:00:00Z',
}

describe('validateInbound', () => {
  it('accepts a full payload', () => {
    const r = validateInbound(good)
    expect(r.ok).toBe(true)
  })
  it('rejects a token that is not 16 lowercase hex chars', () => {
    expect(validateInbound({ ...good, token: 'hello@' }).ok).toBe(false)
    expect(validateInbound({ ...good, token: 'A1B2C3D4E5F60718' }).ok).toBe(false)
  })
  it('rejects empty text', () => {
    const r = validateInbound({ ...good, text: '   ' })
    expect(r).toEqual({ ok: false, status: 400, error: 'text required' })
  })
  it('defaults subject to (no subject) and from to unknown', () => {
    const r = validateInbound({ ...good, subject: undefined, from: undefined })
    expect(r.ok && r.body.subject).toBe('(no subject)')
    expect(r.ok && r.body.from).toBe('unknown')
  })
})

describe('sourceKeyFor', () => {
  it('uses the Message-ID when present', () => {
    expect(sourceKeyFor(good)).toBe('email:<abc@hillside.org>')
  })
  it('falls back to a stable hash of from+subject+received_at', () => {
    const a = sourceKeyFor({ ...good, message_id: undefined })
    const b = sourceKeyFor({ ...good, message_id: undefined })
    expect(a).toBe(b)
    expect(a.startsWith('email:sha:')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/inbound-email/lib/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Implement validate.ts**

```ts
// Payload validation for inbound-email. Pure so it runs under vitest.
export interface InboundPayload {
  token: string
  message_id?: string
  from?: string
  subject?: string
  text: string
  received_at?: string
}

export type InboundValidation =
  | { ok: true; body: Required<Pick<InboundPayload, 'token' | 'from' | 'subject' | 'text'>> & Pick<InboundPayload, 'message_id' | 'received_at'> }
  | { ok: false; status: number; error: string }

const TOKEN = /^[0-9a-f]{16}$/

export function validateInbound(p: Partial<InboundPayload>): InboundValidation {
  if (typeof p.token !== 'string' || !TOKEN.test(p.token)) {
    return { ok: false, status: 400, error: 'invalid token' }
  }
  if (typeof p.text !== 'string' || p.text.trim() === '') {
    return { ok: false, status: 400, error: 'text required' }
  }
  return {
    ok: true,
    body: {
      token: p.token,
      text: p.text,
      subject: typeof p.subject === 'string' && p.subject.trim() ? p.subject.trim() : '(no subject)',
      from: typeof p.from === 'string' && p.from.trim() ? p.from.trim() : 'unknown',
      message_id: typeof p.message_id === 'string' && p.message_id.trim() ? p.message_id.trim() : undefined,
      received_at: typeof p.received_at === 'string' ? p.received_at : undefined,
    },
  }
}

// FNV-1a 32-bit, hex. Enough to make a repeat forward of the same mail collide
// when a client strips Message-ID; not a security boundary.
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function sourceKeyFor(p: Pick<InboundPayload, 'message_id' | 'from' | 'subject' | 'received_at'>): string {
  if (p.message_id && p.message_id.trim()) return `email:${p.message_id.trim()}`
  return `email:sha:${fnv1a(`${p.from ?? ''}|${p.subject ?? ''}|${p.received_at ?? ''}`)}`
}

/** "Hillside Elementary <news@hillside.org>" → "Hillside Elementary"; bare address → its domain. */
export function senderLabel(from: string): string {
  const m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from)
  if (m) return m[1].trim()
  const at = from.indexOf('@')
  return at > -1 ? from.slice(at + 1).replace(/>$/, '').trim() : from.trim()
}
```

- [ ] **Step 4: Add a senderLabel test and run the file**

Append to `validate.test.ts`:
```ts
import { senderLabel } from './validate'
describe('senderLabel', () => {
  it('takes the display name when there is one', () => {
    expect(senderLabel('Hillside Elementary <news@hillside.org>')).toBe('Hillside Elementary')
  })
  it('falls back to the domain', () => {
    expect(senderLabel('news@hillside.org')).toBe('hillside.org')
  })
})
```
Run: `npx vitest run supabase/functions/inbound-email/lib/validate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write index.ts**

```ts
// INBOUND-EMAIL — receives one forwarded email from the Cloudflare Email
// Worker, resolves the household by its inbound token, stores an idempotent
// captures row, and hands off to extract-email. Auth: x-capture-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateInbound, sourceKeyFor, senderLabel, type InboundPayload } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  let raw: Partial<InboundPayload>
  try { raw = await req.json() } catch { return json({ error: 'invalid JSON body' }, 400) }
  const v = validateInbound(raw)
  if (!v.ok) return json({ error: v.error }, v.status)
  const body = v.body

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: hh } = await admin.from('households').select('id').eq('inbound_token', body.token).maybeSingle()
  if (!hh) return json({ error: 'unknown token' }, 404)

  // Owner first, else the earliest active member. The capture's user_id is
  // who the rows are written FOR; the household read policy shares them.
  const { data: members } = await admin
    .from('household_members')
    .select('user_id, role, created_at')
    .eq('household_id', hh.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  const owner = members?.find((m) => m.role === 'owner') ?? members?.[0]
  if (!owner) return json({ error: 'household has no active members' }, 404)

  const sourceKey = sourceKeyFor(body)
  const { data: existing } = await admin
    .from('captures').select('id').eq('kind', 'email').eq('source_key', sourceKey).maybeSingle()
  if (existing) return json({ ok: true, capture_id: existing.id, duplicate: true }, 200)

  const rawText = `Subject: ${body.subject}\nFrom: ${body.from}\n\n${body.text}`
  const { data: cap, error } = await admin
    .from('captures')
    .insert({
      user_id: owner.user_id,
      household_id: hh.id,
      kind: 'email',
      source_key: sourceKey,
      source_label: senderLabel(body.from),
      subject: body.subject,
      sender: body.from,
      raw_text: rawText,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !cap) {
    // A concurrent duplicate loses the unique-index race; report it as such.
    if (error?.code === '23505') {
      const { data: dup } = await admin.from('captures').select('id').eq('kind', 'email').eq('source_key', sourceKey).maybeSingle()
      if (dup) return json({ ok: true, capture_id: dup.id, duplicate: true }, 200)
    }
    return json({ error: `capture insert failed: ${error?.message ?? 'unknown'}` }, 500)
  }

  fetch(`${supabaseUrl}/functions/v1/extract-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-capture-secret': secret },
    body: JSON.stringify({ capture_id: cap.id }),
  }).catch(() => {})

  return json({ ok: true, capture_id: cap.id }, 202)
})
```

- [ ] **Step 6: Register in config.toml**

Append after the `[functions.extract-capture]` block:
```toml
# Called by the Cloudflare Email Worker with the shared secret, not a JWT.
[functions.inbound-email]
verify_jwt = false
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit` (the app config does not include `supabase/`, so this only guards the repo; the Deno file is checked at deploy). Then:
```bash
git add supabase/functions/inbound-email supabase/config.toml
git commit -m "feat(ingest): inbound-email edge function — token → household, idempotent capture"
```

---

### Task 3: `extract-email` types, dates, members

**Files:**
- Create: `supabase/functions/extract-email/lib/types.ts`
- Create: `supabase/functions/extract-email/lib/dates.ts`, `dates.test.ts`
- Create: `supabase/functions/extract-email/lib/members.ts`, `members.test.ts`

**Interfaces:**
- Produces (used by Tasks 4–6):

```ts
// types.ts
export type Who = string[] | 'everyone'
export interface EmailEvent {
  title: string
  date: string            // YYYY-MM-DD
  time?: string           // HH:mm
  location?: string
  for: Who
  items: Array<{ text: string; for: Who; needed: 'night_before' | 'day_of' | string }>
  source_quote: string
  confidence: number
}
export interface EmailTodo { title: string; due?: string; for?: string[]; source_quote: string; confidence: number }
export interface EmailGap { kind: 'unreadable_attachment' | 'truncated' | 'low_confidence'; note: string }
export interface EmailExtraction { events: EmailEvent[]; todos: EmailTodo[]; good_to_know: string[]; gaps: EmailGap[] }

export interface Member { id: string; name: string; isChild: boolean }

export interface TaskRow {
  user_id: string
  title: string
  completed: false
  bucket: 'timed' | 'inbox'
  context: 'family'
  scope: 'compound'
  category: 'event' | 'task'
  scheduled_for: string | null
  is_all_day: boolean | null
  location: string | null
  notes: string | null
  capture_id: string
  assigned_to: string | null
  assigned_to_all: boolean
  parent_task_id: string | null
  needed_on: string | null
}
export interface NoteRow {
  user_id: string; title: string; content: string; context: 'family'; scope: 'compound'; source: 'import'; type: 'general'
}
/** An incomplete email-derived block already in the household, for dedupe. */
export interface ExistingBlock { id: string; title: string; ymd: string; childTitles: string[] }
```

```ts
// dates.ts
export function zonedIso(ymd: string, hm: string | null, tz: string): string  // instant of that wall time in tz
export function addDays(ymd: string, n: number): string                        // YYYY-MM-DD arithmetic, no TZ
export function isYmd(s: unknown): s is string
```

```ts
// members.ts
export interface MemberMatch { matched: Member[]; unmatched: string[] }
export function matchMembers(who: Who, members: Member[]): MemberMatch
```

- [ ] **Step 1: Write types.ts** (exactly the block above).

- [ ] **Step 2: Write the failing dates test**

`dates.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { zonedIso, addDays, isYmd } from './dates'

describe('zonedIso', () => {
  it('midnight New York in March (EST) is 05:00Z', () => {
    expect(zonedIso('2026-03-05', null, 'America/New_York')).toBe('2026-03-05T05:00:00.000Z')
  })
  it('midnight New York in September (EDT) is 04:00Z', () => {
    expect(zonedIso('2026-09-02', null, 'America/New_York')).toBe('2026-09-02T04:00:00.000Z')
  })
  it('a timed event keeps its wall time', () => {
    expect(zonedIso('2026-09-10', '15:30', 'America/New_York')).toBe('2026-09-10T19:30:00.000Z')
  })
  it('works west of the date line', () => {
    expect(zonedIso('2026-09-02', null, 'Pacific/Auckland')).toBe('2026-09-01T12:00:00.000Z')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => { expect(addDays('2026-09-30', 1)).toBe('2026-10-01') })
  it('goes backwards', () => { expect(addDays('2026-03-01', -1)).toBe('2026-02-28') })
})

describe('isYmd', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isYmd('2026-09-02')).toBe(true)
    expect(isYmd('2026-9-2')).toBe(false)
    expect(isYmd('Thursday')).toBe(false)
    expect(isYmd(undefined)).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run supabase/functions/extract-email/lib/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 4: Implement dates.ts**

```ts
const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && YMD.test(s)
}

function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (asUtc - at.getTime()) / 60_000
}

/** The instant at which `ymd hm` occurs on the wall clock of `tz`. */
export function zonedIso(ymd: string, hm: string | null, tz: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = (hm ?? '00:00').split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes: the offset at the naive guess, then at the corrected instant,
  // which settles DST transitions.
  let guess = wall
  for (let i = 0; i < 2; i++) guess = wall - offsetMinutes(new Date(guess), tz) * 60_000
  return new Date(guess).toISOString()
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d + n)
  return new Date(t).toISOString().slice(0, 10)
}
```

- [ ] **Step 5: Run dates tests**

Run: `npx vitest run supabase/functions/extract-email/lib/dates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing members test**

`members.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { matchMembers } from './members'
import type { Member } from './types'

const M: Member[] = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'p2', name: 'Sam', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]

describe('matchMembers', () => {
  it('matches first names case-insensitively', () => {
    const r = matchMembers(['liam', 'MIA'], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1', 'k2'])
    expect(r.unmatched).toEqual([])
  })
  it('"everyone" means the children when there are any', () => {
    expect(matchMembers('everyone', M).matched.map((m) => m.id)).toEqual(['k1', 'k2'])
  })
  it('"everyone" in a household with no children means every member', () => {
    const adults = M.filter((m) => !m.isChild)
    expect(matchMembers('everyone', adults).matched.map((m) => m.id)).toEqual(['p1', 'p2'])
  })
  it('keeps names it cannot match', () => {
    const r = matchMembers(['Liam', "Ms. Reyes' class"], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1'])
    expect(r.unmatched).toEqual(["Ms. Reyes' class"])
  })
  it('matches a full name by its first token and dedupes', () => {
    const r = matchMembers(['Liam Parker', 'Liam'], M)
    expect(r.matched.map((m) => m.id)).toEqual(['k1'])
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run supabase/functions/extract-email/lib/members.test.ts`
Expected: FAIL — cannot resolve `./members`.

- [ ] **Step 8: Implement members.ts**

```ts
import type { Member, Who } from './types.ts'

export interface MemberMatch { matched: Member[]; unmatched: string[] }

const norm = (s: string) => s.trim().toLowerCase()
const first = (s: string) => norm(s).split(/\s+/)[0] ?? ''

/**
 * Resolve the names an email uses to household members. "everyone" is the
 * children when the household has any (school mail addresses students), else
 * every member. Unmatched names are returned, never guessed onto someone.
 */
export function matchMembers(who: Who, members: Member[]): MemberMatch {
  if (who === 'everyone') {
    const kids = members.filter((m) => m.isChild)
    return { matched: kids.length ? kids : [...members], unmatched: [] }
  }
  const byFirst = new Map(members.map((m) => [first(m.name), m]))
  const seen = new Set<string>()
  const matched: Member[] = []
  const unmatched: string[] = []
  for (const name of who) {
    const m = byFirst.get(first(name))
    if (m) {
      if (!seen.has(m.id)) { seen.add(m.id); matched.push(m) }
    } else {
      unmatched.push(name)
    }
  }
  return { matched, unmatched }
}
```

- [ ] **Step 9: Run members tests, then commit**

Run: `npx vitest run supabase/functions/extract-email/lib/`
Expected: PASS (12 tests).
```bash
git add supabase/functions/extract-email/lib
git commit -m "feat(extract-email): types, zoned dates, member matching"
```

---

### Task 4: Prompt + parser

**Files:**
- Create: `supabase/functions/extract-email/lib/prompt.ts`, `prompt.test.ts`

**Interfaces:**
- Consumes: `EmailExtraction`, `Member`, `isYmd` from Task 3.
- Produces: `buildEmailPrompt(input: { subject: string; sender: string; body: string; members: Member[]; todayYmd: string }): string` and `parseEmailExtraction(raw: string): EmailExtraction` (never throws; drops malformed entries; clamps confidence to [0,1]).

- [ ] **Step 1: Write the failing test**

`prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildEmailPrompt, parseEmailExtraction } from './prompt'

const members = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]

describe('buildEmailPrompt', () => {
  it('names the household, the children, and today, and asks for strict JSON', () => {
    const p = buildEmailPrompt({ subject: 'Weekly Update', sender: 'Hillside', body: 'Picture Day Thursday', members, todayYmd: '2026-09-02' })
    expect(p).toContain('Picture Day Thursday')
    expect(p).toContain('Children: Liam, Mia')
    expect(p).toContain('Adults: Jess')
    expect(p).toContain('2026-09-02')
    expect(p).toContain('strict JSON')
  })
})

describe('parseEmailExtraction', () => {
  it('parses a well-formed result and strips a code fence', () => {
    const raw = '```json\n' + JSON.stringify({
      events: [{ title: 'Picture Day', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Payment envelope', for: ['Liam'], needed: 'night_before' }],
        source_quote: 'Picture Day is Thursday.', confidence: 0.92 }],
      todos: [{ title: 'Sign field trip form', due: '2026-09-15', source_quote: 'Forms due', confidence: 0.8 }],
      good_to_know: ['Early dismissal Friday'],
      gaps: [],
    }) + '\n```'
    const r = parseEmailExtraction(raw)
    expect(r.events).toHaveLength(1)
    expect(r.events[0].items[0].needed).toBe('night_before')
    expect(r.todos[0].due).toBe('2026-09-15')
    expect(r.good_to_know).toEqual(['Early dismissal Friday'])
  })
  it('drops an event without a valid date and an item without text', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [
        { title: 'Vague thing', date: 'Thursday', for: 'everyone', items: [], source_quote: 'x', confidence: 0.9 },
        { title: 'Real', date: '2026-09-10', for: ['Mia'], items: [{ text: '', for: 'everyone', needed: 'day_of' }], source_quote: 'y', confidence: 0.9 },
      ], todos: [], good_to_know: [], gaps: [],
    }))
    expect(r.events).toHaveLength(1)
    expect(r.events[0].items).toEqual([])
  })
  it('clamps confidence and normalises needed', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [{ title: 'A', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Bring hat', for: 'everyone', needed: 'whenever' }], source_quote: 'q', confidence: 7 }],
      todos: [], good_to_know: [], gaps: [],
    }))
    expect(r.events[0].confidence).toBe(1)
    expect(r.events[0].items[0].needed).toBe('day_of')
  })
  it('returns an empty extraction on garbage', () => {
    expect(parseEmailExtraction('not json at all')).toEqual({ events: [], todos: [], good_to_know: [], gaps: [] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run supabase/functions/extract-email/lib/prompt.test.ts`
Expected: FAIL — cannot resolve `./prompt`.

- [ ] **Step 3: Implement prompt.ts**

```ts
import type { EmailEvent, EmailExtraction, EmailGap, EmailTodo, Member, Who } from './types.ts'
import { isYmd } from './dates.ts'

export interface PromptInput { subject: string; sender: string; body: string; members: Member[]; todayYmd: string }

export function buildEmailPrompt(i: PromptInput): string {
  const kids = i.members.filter((m) => m.isChild).map((m) => m.name)
  const adults = i.members.filter((m) => !m.isChild).map((m) => m.name)
  return `You read a school or activity email for a busy household and pull out what they must DO, dated and per person.

TODAY: ${i.todayYmd}
HOUSEHOLD — Adults: ${adults.join(', ') || 'none listed'} · Children: ${kids.join(', ') || 'none listed'}
FROM: ${i.sender}
SUBJECT: ${i.subject}

EMAIL:
${i.body}

Return, in this order:
1. "events": each DATED occasion that needs something from the household (picture day, field trip, spirit week day, concert, early dismissal that changes pickup). For each: title; date as YYYY-MM-DD (resolve weekday names relative to TODAY and the email's own dates; if you cannot resolve a date, it is not an event — put it in todos); time as HH:mm only when stated; location if stated; "for": the children's first names it applies to, or "everyone" when it applies to all students; "items": what each person must bring, wear, sign or pay — text, "for" (names or "everyone"), and "needed": "night_before" for things laid out or packed, "day_of" for things that happen that day, or an explicit YYYY-MM-DD; "source_quote": the exact sentence(s) you took it from; "confidence" 0–1.
2. "todos": actions with no occasion date (return a form, pay a fee, sign up) — title, due as YYYY-MM-DD if stated, "for" names if specific, source_quote, confidence.
3. "good_to_know": things to KNOW but not DO — policy, dismissal rules, curriculum notes. One short sentence each. Never repeat these as events or todos.
4. "gaps": what you could not read — unreadable_attachment, truncated, low_confidence — with a note.

Use only names from the HOUSEHOLD list in "for"; any other name goes in the item text. Do not invent dates. Do not invent items.

Respond with strict JSON only, no prose, no markdown fence:
{"events":[{"title":"...","date":"YYYY-MM-DD","time":"HH:mm|omit","location":"...|omit","for":["Name"]|"everyone","items":[{"text":"...","for":["Name"]|"everyone","needed":"night_before|day_of|YYYY-MM-DD"}],"source_quote":"...","confidence":0.0}],"todos":[{"title":"...","due":"YYYY-MM-DD|omit","for":["Name"]|omit,"source_quote":"...","confidence":0.0}],"good_to_know":["..."],"gaps":[{"kind":"unreadable_attachment|truncated|low_confidence","note":"..."}]}`
}

const EMPTY: EmailExtraction = { events: [], todos: [], good_to_know: [], gaps: [] }

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function who(v: unknown): Who | null {
  if (v === 'everyone') return 'everyone'
  if (Array.isArray(v)) {
    const names = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    return names.length ? names : null
  }
  return null
}

function needed(v: unknown): EmailEvent['items'][number]['needed'] {
  if (v === 'night_before' || v === 'day_of') return v
  if (isYmd(v)) return v
  return 'day_of'
}

function event(v: unknown): EmailEvent | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const title = str(o.title)
  if (!title || !isYmd(o.date)) return null
  const w = who(o.for) ?? 'everyone'
  const items = Array.isArray(o.items)
    ? o.items.flatMap((it) => {
        if (!it || typeof it !== 'object') return []
        const io = it as Record<string, unknown>
        const text = str(io.text)
        if (!text) return []
        return [{ text, for: who(io.for) ?? w, needed: needed(io.needed) }]
      })
    : []
  const time = /^\d{2}:\d{2}$/.test(str(o.time)) ? str(o.time) : undefined
  return {
    title, date: o.date, time, location: str(o.location) || undefined, for: w, items,
    source_quote: str(o.source_quote), confidence: clamp01(o.confidence),
  }
}

function todo(v: unknown): EmailTodo | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const title = str(o.title)
  if (!title) return null
  const w = who(o.for)
  return {
    title, due: isYmd(o.due) ? o.due : undefined, for: Array.isArray(w) ? w : undefined,
    source_quote: str(o.source_quote), confidence: clamp01(o.confidence),
  }
}

function gap(v: unknown): EmailGap | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const kind = o.kind
  if (kind !== 'unreadable_attachment' && kind !== 'truncated' && kind !== 'low_confidence') return null
  return { kind, note: str(o.note) }
}

export function parseEmailExtraction(raw: string): EmailExtraction {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const a = trimmed.indexOf('{'), b = trimmed.lastIndexOf('}')
    if (a === -1 || b <= a) return { ...EMPTY }
    try { parsed = JSON.parse(trimmed.slice(a, b + 1)) } catch { return { ...EMPTY } }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  const o = parsed as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    events: list(o.events).map(event).filter((e): e is EmailEvent => e !== null),
    todos: list(o.todos).map(todo).filter((t): t is EmailTodo => t !== null),
    good_to_know: list(o.good_to_know).filter((s): s is string => typeof s === 'string' && s.trim() !== ''),
    gaps: list(o.gaps).map(gap).filter((g): g is EmailGap => g !== null),
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run supabase/functions/extract-email/lib/prompt.test.ts`
Expected: PASS (5 tests).
```bash
git add supabase/functions/extract-email/lib/prompt.ts supabase/functions/extract-email/lib/prompt.test.ts
git commit -m "feat(extract-email): newsletter prompt + defensive parser"
```

---

### Task 5: `planWrites` — the judgment

**Files:**
- Create: `supabase/functions/extract-email/lib/plan.ts`, `plan.test.ts`

**Interfaces:**
- Consumes: Task 3 types + `matchMembers`, `zonedIso`, `addDays`; Task 4 `EmailExtraction`.
- Produces:

```ts
export interface PlanInput {
  extraction: EmailExtraction
  members: Member[]
  todayYmd: string
  tz: string
  capture: { id: string; user_id: string; subject: string; sender_label: string }
  existing: ExistingBlock[]
}
export interface EventPlan {
  /** New parent to insert, or the id of an existing block to attach children to. */
  parent: { row: TaskRow } | { existingId: string }
  children: Omit<TaskRow, 'parent_task_id'>[]   // parent_task_id is filled in after the parent insert
}
export interface WritePlan { events: EventPlan[]; inbox: TaskRow[]; note: NoteRow | null }
export const MIN_EVENT_CONFIDENCE = 0.75
export function planWrites(i: PlanInput): WritePlan
export function normaliseTitle(s: string): string
export function titlesMatch(a: string, b: string): boolean   // ≥ 0.8 token overlap (Jaccard on normalised tokens)
```

- [ ] **Step 1: Write the failing tests**

`plan.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { planWrites, titlesMatch, MIN_EVENT_CONFIDENCE } from './plan'
import type { EmailExtraction, Member } from './types'

const members: Member[] = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'p2', name: 'Sam', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]
const capture = { id: 'cap1', user_id: 'u1', subject: 'Weekly Update', sender_label: 'Hillside Elementary' }
const base = { members, todayYmd: '2026-09-02', tz: 'America/New_York', capture, existing: [] }
const empty: EmailExtraction = { events: [], todos: [], good_to_know: [], gaps: [] }

const pictureDay = (over: Partial<EmailExtraction['events'][number]> = {}) => ({
  title: 'School Picture Day', date: '2026-09-10', for: 'everyone' as const,
  items: [
    { text: 'Payment envelope in backpack', for: ['Liam'], needed: 'night_before' as const },
    { text: 'Wear school colors', for: 'everyone' as const, needed: 'day_of' as const },
  ],
  source_quote: 'Students should bring payment and wear school colors on Thursday.',
  confidence: 0.92, ...over,
})

describe('planWrites — a dated event', () => {
  it('becomes one all-day family block on its date with the source in notes', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events).toHaveLength(1)
    const parent = p.events[0].parent
    expect('row' in parent).toBe(true)
    if (!('row' in parent)) return
    expect(parent.row).toMatchObject({
      user_id: 'u1', title: 'School Picture Day', bucket: 'timed', category: 'event',
      context: 'family', scope: 'compound', is_all_day: true, capture_id: 'cap1',
      assigned_to: null, assigned_to_all: true, parent_task_id: null, needed_on: null,
    })
    expect(parent.row.scheduled_for).toBe('2026-09-10T04:00:00.000Z')
    expect(parent.row.notes).toContain('From Hillside Elementary · Weekly Update')
    expect(parent.row.notes).toContain('Students should bring payment')
  })
  it('keeps a stated time and is not all-day', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ time: '15:30' })] } })
    const parent = p.events[0].parent
    if (!('row' in parent)) throw new Error('expected new row')
    expect(parent.row.scheduled_for).toBe('2026-09-10T19:30:00.000Z')
    expect(parent.row.is_all_day).toBe(false)
  })
  it('fans items out per child with needed_on night-before / day-of', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    const kids = p.events[0].children
    expect(kids.map((c) => [c.title, c.assigned_to, c.needed_on])).toEqual([
      ['Payment envelope in backpack', 'k1', '2026-09-09'],
      ['Wear school colors', 'k1', '2026-09-10'],
      ['Wear school colors', 'k2', '2026-09-10'],
    ])
    for (const c of kids) expect(c).toMatchObject({ bucket: 'inbox', category: 'task', context: 'family', scope: 'compound', capture_id: 'cap1', assigned_to_all: false })
  })
  it('a single named child becomes the parent assignee', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ for: ['Mia'], items: [] })] } })
    const parent = p.events[0].parent
    if (!('row' in parent)) throw new Error('expected new row')
    expect(parent.row.assigned_to).toBe('k2')
    expect(parent.row.assigned_to_all).toBe(false)
  })
  it('an unmatched name stays in the item text, unassigned', () => {
    const ev = pictureDay({ items: [{ text: 'Bring a snack', for: ["Ms. Reyes' class"], needed: 'day_of' }] })
    const p = planWrites({ ...base, extraction: { ...empty, events: [ev] } })
    expect(p.events[0].children).toEqual([expect.objectContaining({ title: "Bring a snack — Ms. Reyes' class", assigned_to: null })])
  })
})

describe('planWrites — what goes to inbox instead', () => {
  it('a low-confidence event goes to inbox with its quote, never dropped', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ confidence: MIN_EVENT_CONFIDENCE - 0.01 })] } })
    expect(p.events).toEqual([])
    expect(p.inbox).toHaveLength(1)
    expect(p.inbox[0]).toMatchObject({ title: 'School Picture Day', bucket: 'inbox', scheduled_for: null, capture_id: 'cap1' })
    expect(p.inbox[0].notes).toContain('2026-09-10')
  })
  it('an event more than a day in the past goes to inbox', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ date: '2026-08-30' })] } })
    expect(p.events).toEqual([])
    expect(p.inbox).toHaveLength(1)
  })
  it('yesterday still places (the email may have arrived late)', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ date: '2026-09-01' })] } })
    expect(p.events).toHaveLength(1)
  })
  it('todos become inbox tasks, assigned when they name one member', () => {
    const p = planWrites({ ...base, extraction: { ...empty, todos: [
      { title: 'Return the field trip form', due: '2026-09-15', for: ['Liam'], source_quote: 'Forms due 9/15', confidence: 0.8 },
    ] } })
    expect(p.inbox[0]).toMatchObject({ title: 'Return the field trip form', assigned_to: 'k1', needed_on: '2026-09-15', bucket: 'inbox' })
  })
})

describe('planWrites — dedupe against existing blocks', () => {
  it('attaches only new items to a matching existing block', () => {
    const existing = [{ id: 'old1', title: 'Picture Day', ymd: '2026-09-10', childTitles: ['Wear school colors'] }]
    const p = planWrites({ ...base, existing, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events[0].parent).toEqual({ existingId: 'old1' })
    expect(p.events[0].children.map((c) => c.title)).toEqual(['Payment envelope in backpack'])
  })
  it('does not match a different date', () => {
    const existing = [{ id: 'old1', title: 'School Picture Day', ymd: '2026-09-17', childTitles: [] }]
    const p = planWrites({ ...base, existing, extraction: { ...empty, events: [pictureDay()] } })
    expect('row' in p.events[0].parent).toBe(true)
  })
})

describe('planWrites — the note', () => {
  it('writes one note with good-to-know and gaps, none when both are empty', () => {
    const p = planWrites({ ...base, extraction: { ...empty, good_to_know: ['Early dismissal Friday'], gaps: [{ kind: 'truncated', note: 'Email cut off' }] } })
    expect(p.note).toMatchObject({ user_id: 'u1', title: 'From Hillside Elementary: Weekly Update', context: 'family', scope: 'compound', source: 'import', type: 'general' })
    expect(p.note?.content).toContain('Good to know:\n- Early dismissal Friday')
    expect(p.note?.content).toContain('Needs another look:\n- Email cut off')
    expect(planWrites({ ...base, extraction: empty }).note).toBeNull()
  })
})

describe('titlesMatch', () => {
  it('ignores case and punctuation and tolerates one extra word', () => {
    expect(titlesMatch('School Picture Day!', 'school picture day')).toBe(true)
    expect(titlesMatch('Picture Day', 'School Picture Day')).toBe(false)   // 2/3 < 0.8
    expect(titlesMatch('Fall Concert', 'Spring Concert')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run supabase/functions/extract-email/lib/plan.test.ts`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 3: Implement plan.ts**

```ts
import type { EmailEvent, EmailExtraction, ExistingBlock, Member, NoteRow, TaskRow } from './types.ts'
import { matchMembers } from './members.ts'
import { addDays, zonedIso } from './dates.ts'

export const MIN_EVENT_CONFIDENCE = 0.75

export interface PlanInput {
  extraction: EmailExtraction
  members: Member[]
  todayYmd: string
  tz: string
  capture: { id: string; user_id: string; subject: string; sender_label: string }
  existing: ExistingBlock[]
}
export interface EventPlan {
  parent: { row: TaskRow } | { existingId: string }
  children: Omit<TaskRow, 'parent_task_id'>[]
}
export interface WritePlan { events: EventPlan[]; inbox: TaskRow[]; note: NoteRow | null }

export function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Jaccard overlap of normalised tokens ≥ 0.8. */
export function titlesMatch(a: string, b: string): boolean {
  const A = new Set(normaliseTitle(a).split(' ').filter(Boolean))
  const B = new Set(normaliseTitle(b).split(' ').filter(Boolean))
  if (A.size === 0 || B.size === 0) return false
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = A.size + B.size - inter
  return inter / union >= 0.8
}

// Mirror of src/lib/scope.ts scopeForDomain for family rows: family → compound.
const FAMILY = { context: 'family' as const, scope: 'compound' as const }

function sourceNote(c: PlanInput['capture'], quote: string, extra?: string): string {
  const head = `From ${c.sender_label} · ${c.subject}`
  const parts = [head]
  if (extra) parts.push(extra)
  if (quote) parts.push(`“${quote}”`)
  return parts.join('\n\n')
}

function baseRow(i: PlanInput, title: string): TaskRow {
  return {
    user_id: i.capture.user_id, title, completed: false, bucket: 'inbox', ...FAMILY, category: 'task',
    scheduled_for: null, is_all_day: null, location: null, notes: null, capture_id: i.capture.id,
    assigned_to: null, assigned_to_all: false, parent_task_id: null, needed_on: null,
  }
}

function neededYmd(needed: EmailEvent['items'][number]['needed'], eventYmd: string): string {
  if (needed === 'night_before') return addDays(eventYmd, -1)
  if (needed === 'day_of') return eventYmd
  return needed
}

function childrenFor(i: PlanInput, ev: EmailEvent, skipTitles: string[]): EventPlan['children'] {
  const out: EventPlan['children'] = []
  for (const item of ev.items) {
    const { matched, unmatched } = matchMembers(item.for, i.members)
    const ymd = neededYmd(item.needed, ev.date)
    const push = (title: string, assigned: string | null) => {
      if (skipTitles.some((t) => titlesMatch(t, title))) return
      const { parent_task_id: _omit, ...row } = baseRow(i, title)
      out.push({ ...row, assigned_to: assigned, needed_on: ymd })
    }
    for (const m of matched) push(item.text, m.id)
    if (unmatched.length) push(`${item.text} — ${unmatched.join(', ')}`, null)
    if (matched.length === 0 && unmatched.length === 0) push(item.text, null)
  }
  return out
}

export function planWrites(i: PlanInput): WritePlan {
  const events: EventPlan[] = []
  const inbox: TaskRow[] = []
  const yesterday = addDays(i.todayYmd, -1)

  for (const ev of i.extraction.events) {
    const placeable = ev.confidence >= MIN_EVENT_CONFIDENCE && ev.date >= yesterday
    if (!placeable) {
      const why = ev.date < yesterday ? `Dated ${ev.date} (already past)` : `Dated ${ev.date} (needs a look — confidence ${ev.confidence.toFixed(2)})`
      const itemLines = ev.items.map((it) => `- ${it.text}${it.for === 'everyone' ? '' : ` (${it.for.join(', ')})`}`).join('\n')
      inbox.push({ ...baseRow(i, ev.title), category: 'event', location: ev.location ?? null,
        notes: sourceNote(i.capture, ev.source_quote, itemLines ? `${why}\n\nItems:\n${itemLines}` : why) })
      continue
    }

    const match = i.existing.find((b) => b.ymd === ev.date && titlesMatch(b.title, ev.title))
    if (match) {
      const children = childrenFor(i, ev, match.childTitles)
      if (children.length) events.push({ parent: { existingId: match.id }, children })
      continue
    }

    const { matched } = matchMembers(ev.for, i.members)
    const single = ev.for !== 'everyone' && matched.length === 1 ? matched[0].id : null
    const row: TaskRow = {
      ...baseRow(i, ev.title), bucket: 'timed', category: 'event',
      scheduled_for: zonedIso(ev.date, ev.time ?? null, i.tz), is_all_day: !ev.time,
      location: ev.location ?? null, notes: sourceNote(i.capture, ev.source_quote),
      assigned_to: single, assigned_to_all: ev.for === 'everyone',
    }
    events.push({ parent: { row }, children: childrenFor(i, ev, []) })
  }

  for (const t of i.extraction.todos) {
    const { matched } = t.for ? matchMembers(t.for, i.members) : { matched: [] as Member[] }
    inbox.push({ ...baseRow(i, t.title), needed_on: t.due ?? null, assigned_to: matched.length === 1 ? matched[0].id : null,
      notes: sourceNote(i.capture, t.source_quote) })
  }

  const gtk = i.extraction.good_to_know
  const gaps = i.extraction.gaps
  const note: NoteRow | null = gtk.length || gaps.length
    ? {
        user_id: i.capture.user_id,
        title: `From ${i.capture.sender_label}: ${i.capture.subject}`,
        content: [
          gtk.length ? 'Good to know:\n' + gtk.map((g) => `- ${g}`).join('\n') : '',
          gaps.length ? 'Needs another look:\n' + gaps.map((g) => `- ${g.note}`).join('\n') : '',
        ].filter(Boolean).join('\n\n'),
        ...FAMILY, source: 'import', type: 'general',
      }
    : null

  return { events, inbox, note }
}
```

- [ ] **Step 4: Run tests until green, then commit**

Run: `npx vitest run supabase/functions/extract-email/lib/plan.test.ts`
Expected: PASS (14 tests). If `'Wear school colors'` ordering differs, the fan-out order is `matched` order = the household member order passed in; keep members sorted by `display_order` in Task 6.
```bash
git add supabase/functions/extract-email/lib/plan.ts supabase/functions/extract-email/lib/plan.test.ts
git commit -m "feat(extract-email): planWrites — events to blocks, items to per-person subtasks, the rest to inbox"
```

---

### Task 6: `extract-email` index.ts + config

**Files:**
- Create: `supabase/functions/extract-email/index.ts`
- Modify: `supabase/config.toml` (append `[functions.extract-email]`)

**Interfaces:**
- Consumes: everything in `lib/`; Task 1 columns; secrets `ANTHROPIC_API_KEY`, `CAPTURE_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `POST { capture_id }` → `{ ok, events, children, inbox, note }`; sets `captures.status` to `extracted` or `failed`.

- [ ] **Step 1: Write index.ts**

```ts
// EXTRACT-EMAIL — given a captures row (kind='email'), asks Claude for the
// events/items/todos in it and writes them via planWrites (lib/plan.ts, pure,
// tested). Parent event rows are auto-placed on their date; per-person items
// are subtasks with needed_on; the rest goes to inbox. Nothing is dropped.
// Auth: x-capture-secret. Called by inbound-email; safe to re-run by hand.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildEmailPrompt, parseEmailExtraction } from './lib/prompt.ts'
import { planWrites } from './lib/plan.ts'
import type { ExistingBlock, Member, TaskRow } from './lib/types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal') throw new Error('Anthropic refused the request')
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

/** Today's YYYY-MM-DD on the household's wall clock. */
function todayIn(tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  const { capture_id } = (await req.json().catch(() => ({}))) as { capture_id?: string }
  if (!capture_id) return json({ error: 'capture_id required' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: capture } = await supabase.from('captures').select('*').eq('id', capture_id).single()
  if (!capture) return json({ error: 'capture not found' }, 404)
  if (capture.kind !== 'email' || !capture.household_id) return json({ error: 'not an email capture' }, 400)

  try {
    const { data: hh } = await supabase.from('households').select('timezone').eq('id', capture.household_id).single()
    const tz = hh?.timezone ?? 'America/New_York'

    // The household roster: every family_members row owned by any active member.
    const { data: hm } = await supabase.from('household_members').select('user_id').eq('household_id', capture.household_id).eq('status', 'active')
    const userIds = (hm ?? []).map((m) => m.user_id)
    const { data: fm } = await supabase
      .from('family_members').select('id, name, role_label, member_type, display_order')
      .in('user_id', userIds).eq('member_type', 'core').order('display_order', { ascending: true })
    const seen = new Set<string>()
    const members: Member[] = (fm ?? []).flatMap((m) => {
      const key = m.name.trim().toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      return [{ id: m.id, name: m.name, isChild: m.role_label === 'child' }]
    })

    // Existing email-derived blocks (for dedupe), with their child titles.
    const { data: blocks } = await supabase
      .from('tasks').select('id, title, scheduled_for')
      .in('user_id', userIds).not('capture_id', 'is', null).is('parent_task_id', null).eq('completed', false).not('scheduled_for', 'is', null)
    const blockIds = (blocks ?? []).map((b) => b.id)
    const { data: kids } = blockIds.length
      ? await supabase.from('tasks').select('parent_task_id, title').in('parent_task_id', blockIds)
      : { data: [] as { parent_task_id: string; title: string }[] }
    const existing: ExistingBlock[] = (blocks ?? []).map((b) => ({
      id: b.id, title: b.title,
      ymd: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.scheduled_for)),
      childTitles: (kids ?? []).filter((k) => k.parent_task_id === b.id).map((k) => k.title),
    }))

    const subject = capture.subject ?? '(no subject)'
    const senderLabel = capture.source_label ?? capture.sender ?? 'email'
    const body = (capture.raw_text ?? '').replace(/^Subject: .*\nFrom: .*\n\n/, '')
    const raw = await callClaude(buildEmailPrompt({ subject, sender: capture.sender ?? senderLabel, body, members, todayYmd: todayIn(tz) }), Deno.env.get('ANTHROPIC_API_KEY')!)
    const extraction = parseEmailExtraction(raw)
    const plan = planWrites({ extraction, members, todayYmd: todayIn(tz), tz, capture: { id: capture.id, user_id: capture.user_id, subject, sender_label: senderLabel }, existing })

    let children = 0
    for (const ev of plan.events) {
      let parentId: string
      if ('existingId' in ev.parent) {
        parentId = ev.parent.existingId
      } else {
        const { data, error } = await supabase.from('tasks').insert(ev.parent.row).select('id').single()
        if (error || !data) throw new Error(`parent insert failed: ${error?.message}`)
        parentId = data.id
      }
      if (ev.children.length) {
        const rows: TaskRow[] = ev.children.map((c) => ({ ...c, parent_task_id: parentId }))
        const { error } = await supabase.from('tasks').insert(rows)
        if (error) throw new Error(`subtask insert failed: ${error.message}`)
        children += rows.length
      }
    }
    if (plan.inbox.length) {
      const { error } = await supabase.from('tasks').insert(plan.inbox)
      if (error) throw new Error(`inbox insert failed: ${error.message}`)
    }
    if (plan.note) {
      const { error } = await supabase.from('notes').insert(plan.note)
      if (error) throw new Error(`note insert failed: ${error.message}`)
    }

    await supabase.from('captures').update({ status: 'extracted', error: null }).eq('id', capture.id)
    return json({ ok: true, events: plan.events.length, children, inbox: plan.inbox.length, note: !!plan.note })
  } catch (e) {
    await supabase.from('captures').update({ status: 'failed', error: String(e) }).eq('id', capture.id)
    return json({ error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Register in config.toml**

```toml
# Internal: called by inbound-email with the shared secret, not a JWT.
[functions.extract-email]
verify_jwt = false
```

- [ ] **Step 3: Run the whole lib suite + tsc, commit**

Run: `npx vitest run supabase/functions/extract-email supabase/functions/inbound-email` → all PASS. `npx tsc -p tsconfig.app.json --noEmit` → clean.
```bash
git add supabase/functions/extract-email/index.ts supabase/config.toml
git commit -m "feat(extract-email): edge function — Claude extraction → planWrites → placed blocks + subtasks"
```

---

### Task 7: Cloudflare Email Worker

**Files:**
- Create: `infra/inbound-mail/package.json`, `wrangler.toml`, `tsconfig.json`, `src/handler.ts`, `src/handler.test.ts`, `src/index.ts`, `.gitignore`

**Interfaces:**
- Consumes: Task 2's HTTP contract.
- Produces: a deployable Worker; `buildPayload(msg: ParsedMail, to: string, receivedAt: Date): InboundPayload | null` and `deliver(payload, env, fetchFn)`.

Note: `infra/` is NOT in the root Vitest include, so this package runs its own tests (`npm test` inside `infra/inbound-mail`). The pre-push hook does not gate it; run it yourself.

- [ ] **Step 1: Scaffold the package**

`package.json`:
```json
{
  "name": "symphony-inbound-mail",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "dependencies": { "postal-mime": "^2.3.2" },
  "devDependencies": { "@cloudflare/workers-types": "^4.20250101.0", "typescript": "^5.6.0", "vitest": "^3.0.0", "wrangler": "^4.0.0" }
}
```
`wrangler.toml`:
```toml
name = "symphony-inbound-mail"
main = "src/index.ts"
compatibility_date = "2025-06-01"
# Secrets (wrangler secret put): SUPABASE_URL, CAPTURE_SHARED_SECRET
```
`tsconfig.json`:
```json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "types": ["@cloudflare/workers-types"], "noEmit": true }, "include": ["src"] }
```
`.gitignore`: `node_modules\n.wrangler\n`

Run `npm install` inside `infra/inbound-mail`.

- [ ] **Step 2: Write the failing handler test**

`src/handler.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { tokenFromAddress, buildPayload, deliver, type ParsedMail } from './handler'

const parsed: ParsedMail = {
  messageId: '<abc@hillside.org>',
  from: { name: 'Hillside Elementary', address: 'news@hillside.org' },
  subject: 'Weekly Update',
  text: 'Picture Day is Thursday.',
  html: '<p>Picture Day is <b>Thursday</b>.</p>',
}
const env = { SUPABASE_URL: 'https://x.supabase.co', CAPTURE_SHARED_SECRET: 's3cret' }

describe('tokenFromAddress', () => {
  it('takes the local part when it is a token', () => {
    expect(tokenFromAddress('a1b2c3d4e5f60718@symphony-os.com')).toBe('a1b2c3d4e5f60718')
  })
  it('rejects anything else, including hello@', () => {
    expect(tokenFromAddress('hello@symphony-os.com')).toBeNull()
    expect(tokenFromAddress('A1B2C3D4E5F60718@symphony-os.com')).toBeNull()
  })
})

describe('buildPayload', () => {
  it('prefers text and carries headers', () => {
    const p = buildPayload(parsed, 'a1b2c3d4e5f60718@symphony-os.com', new Date('2026-09-02T12:00:00Z'))
    expect(p).toEqual({
      token: 'a1b2c3d4e5f60718', message_id: '<abc@hillside.org>',
      from: 'Hillside Elementary <news@hillside.org>', subject: 'Weekly Update',
      text: 'Picture Day is Thursday.', received_at: '2026-09-02T12:00:00.000Z',
    })
  })
  it('falls back to stripped html', () => {
    const p = buildPayload({ ...parsed, text: undefined }, 'a1b2c3d4e5f60718@symphony-os.com', new Date(0))
    expect(p?.text).toBe('Picture Day is Thursday.')
  })
  it('returns null for a non-token recipient', () => {
    expect(buildPayload(parsed, 'hello@symphony-os.com', new Date(0))).toBeNull()
  })
})

describe('deliver', () => {
  const payload = buildPayload(parsed, 'a1b2c3d4e5f60718@symphony-os.com', new Date(0))!
  it('POSTs to inbound-email with the secret', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 202 }))
    await deliver(payload, env, fetchFn)
    expect(fetchFn).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/inbound-email', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-capture-secret': 's3cret' }),
    }))
  })
  it('throws on a 5xx so Cloudflare retries', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }))
    await expect(deliver(payload, env, fetchFn)).rejects.toThrow(/500/)
  })
  it('does not throw on 404 (unknown token is dropped, not retried)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }))
    await expect(deliver(payload, env, fetchFn)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run (inside `infra/inbound-mail`): `npx vitest run`
Expected: FAIL — cannot resolve `./handler`.

- [ ] **Step 4: Implement handler.ts and index.ts**

`src/handler.ts`:
```ts
// Pure Worker logic. index.ts wires postal-mime and the Cloudflare email event.
export interface ParsedMail {
  messageId?: string
  from?: { name?: string; address?: string }
  subject?: string
  text?: string
  html?: string
}
export interface InboundPayload {
  token: string; message_id?: string; from: string; subject: string; text: string; received_at: string
}
export interface Env { SUPABASE_URL: string; CAPTURE_SHARED_SECRET: string }

const TOKEN = /^[0-9a-f]{16}$/

export function tokenFromAddress(to: string): string | null {
  const local = to.split('@')[0]?.trim() ?? ''
  return TOKEN.test(local) ? local : null
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function buildPayload(msg: ParsedMail, to: string, receivedAt: Date): InboundPayload | null {
  const token = tokenFromAddress(to)
  if (!token) return null
  const text = msg.text?.trim() || (msg.html ? htmlToText(msg.html) : '')
  const from = msg.from?.name && msg.from.address
    ? `${msg.from.name} <${msg.from.address}>`
    : msg.from?.address ?? msg.from?.name ?? 'unknown'
  return {
    token, message_id: msg.messageId, from, subject: msg.subject?.trim() || '(no subject)',
    text, received_at: receivedAt.toISOString(),
  }
}

/** POST to inbound-email. 5xx throws (Cloudflare retries); 4xx is final and dropped. */
export async function deliver(payload: InboundPayload, env: Env, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`${env.SUPABASE_URL}/functions/v1/inbound-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-capture-secret': env.CAPTURE_SHARED_SECRET },
    body: JSON.stringify(payload),
  })
  if (res.status >= 500) throw new Error(`inbound-email returned ${res.status}`)
}
```

`src/index.ts`:
```ts
import PostalMime from 'postal-mime'
import { buildPayload, deliver, type Env } from './handler'

// Receive-only. This Worker never calls message.reply() or message.forward():
// a bounce to a spoofed sender is backscatter, and a forward would leak the
// household's mail. Unknown recipients are dropped silently.
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const parsed = await new PostalMime().parse(message.raw)
    const payload = buildPayload(
      { messageId: parsed.messageId, from: parsed.from, subject: parsed.subject, text: parsed.text, html: parsed.html },
      message.to,
      new Date(),
    )
    if (!payload) return
    await deliver(payload, env)
  },
}
```

- [ ] **Step 5: Run tests, type-check, commit**

Inside `infra/inbound-mail`: `npx vitest run` → PASS (8 tests); `npx tsc --noEmit` → clean.
```bash
git add infra/inbound-mail
git commit -m "feat(infra): Cloudflare Email Worker — parse forwarded mail, POST to inbound-email"
```

---

### Task 8: Deploy, smoke test, setup doc

**Files:**
- Create: `docs/school-mail-setup.md`

- [ ] **Step 1: Confirm the migration is applied**

Ask Scott (or check via a client query as him): `select inbound_token, timezone from households limit 1;` must return both columns. Do not proceed to Step 3 before this.

- [ ] **Step 2: Deploy both edge functions**

```bash
npx supabase functions deploy inbound-email --project-ref mwadppyrqzuzgstmwpuy --use-api
npx supabase functions deploy extract-email --project-ref mwadppyrqzuzgstmwpuy --use-api
```
Expected: both report deployed. Secrets `CAPTURE_SHARED_SECRET` and `ANTHROPIC_API_KEY` already exist in the project.

- [ ] **Step 3: Smoke test with a fixture email**

Scott obtains his household token by running in the SQL editor: `select ensure_inbound_token(id) from households where id = '<his household id>';` — or wait for the Settings card (client phase). Then, with the shared secret from the Supabase dashboard:
```bash
curl -s -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/inbound-email" \
  -H "content-type: application/json" -H "x-capture-secret: $CAPTURE_SHARED_SECRET" \
  -d '{"token":"<token>","message_id":"<smoke-1@test>","from":"Hillside Elementary <news@hillside.org>","subject":"Weekly Update","received_at":"2026-09-02T12:00:00Z",
       "text":"Hi families! Picture Day is Thursday September 10. Students should bring their payment envelope and wear school colors. Field trip permission forms are due September 15. Reminder: early dismissal every Friday at 1:30."}'
```
Expected: `202 {"ok":true,"capture_id":"..."}`. Within ~15 s, in Symphony (Scott's account): a "Picture Day" all-day family event on Sep 10 with subtasks for each child, an inbox task "Field trip permission forms due", and a note "From Hillside Elementary: Weekly Update" with the early-dismissal line. Repeat the curl: expect `200 {"duplicate":true}` and no new rows.

If `captures.status = 'failed'`, read `captures.error`; re-run extraction by POSTing `{capture_id}` to `extract-email` with the secret.

- [ ] **Step 4: Write docs/school-mail-setup.md**

```markdown
# School mail → Symphony: setup

Spec: docs/superpowers/specs/2026-09-02-school-email-to-event-design.md

## Deploy order (load-bearing)
1. Apply `supabase/migrations/2026-09-02_school_email_ingest.sql` (SQL editor).
2. `npx supabase functions deploy inbound-email --project-ref mwadppyrqzuzgstmwpuy --use-api`
3. `npx supabase functions deploy extract-email --project-ref mwadppyrqzuzgstmwpuy --use-api`
4. Push main.

## Cloudflare (one time, Scott)
```bash
cd infra/inbound-mail && npm install
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://mwadppyrqzuzgstmwpuy.supabase.co
npx wrangler secret put CAPTURE_SHARED_SECRET # same value as the Supabase secret
npx wrangler deploy
```
Then Cloudflare dashboard → symphony-os.com → Email → Email Routing → Routing rules:
- keep the existing `hello@` rule (custom addresses win over catch-all);
- Catch-all: action **Send to a Worker** → `symphony-inbound-mail`.

## A household's address
`select ensure_inbound_token(id) from households where id = '<household>';` → `<token>@symphony-os.com`.
(The Settings card will expose this in the client phase.)

## Smoke test
See the curl in the plan (Task 8, Step 3). Watch the Worker with `npx wrangler tail` when testing a real forward.

## Failure modes
- `captures.status='failed'` → `captures.error` says why; re-POST `{capture_id}` to `extract-email` with the secret to retry.
- Nothing arrives: `wrangler tail` shows whether the Worker ran; a non-token recipient is dropped by design.
```

- [ ] **Step 5: Commit and push**

```bash
git add docs/school-mail-setup.md
git commit -m "docs: school mail ingest setup + deploy order"
git fetch && git rebase origin/main && git push origin HEAD:main
```
Pre-push runs tsc + full unit suite (the new `lib/*.test.ts` files are included via `supabase/functions/**`).

---

## Self-review

- **Spec coverage:** §4.1 Worker → Task 7. §4.2 inbound-email → Task 2. §4.3 extraction + planWrites incl. dedupe, night-before, unmatched names, inbox fallbacks, note → Tasks 3–6. §5 data model → Task 1 (plus `households.timezone`, added because `scheduled_for` needs a wall clock; noted as a spec addendum). §6 error handling → Task 2 (duplicate race), Task 6 (failed status, parent-then-children), Task 7 (5xx throw, 4xx drop, no reply/forward). §7 Deno/Vitest tests → every lib task; Worker tests → Task 7; manual smoke → Task 8. §8 deploy order → Task 8. Client phases (§4.4–4.7) are deliberately out of this plan.
- **Placeholders:** none; every step carries its code.
- **Type consistency:** `TaskRow`, `NoteRow`, `ExistingBlock`, `Member`, `Who` defined once in Task 3 and used by name in Tasks 4–6; `InboundPayload` field names identical between Task 2 (`validate.ts`) and Task 7 (`handler.ts`); `planWrites` signature in Task 5 matches its call in Task 6.
