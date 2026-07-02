# Medication Tracker + Voice Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A timing log for Scott's Parkinson's meds — log each dose's actual time hands-free by voice (iPhone + Apple Watch), review dose intervals on a web page.

**Architecture:** Two new Supabase tables (`medications`, `medication_logs`) plus a durable per-user token table (`med_log_tokens`). One `log-medication` edge function (token-auth, `verify_jwt=false`) does fuzzy name-matching and inserts timestamped log rows, returning a speakable confirmation. A Shortcuts shortcut gives "Hey Siri, Log Meds" on phone + Watch with no app build; a native App Intent on `ios-sliders` is the fast follow. A web `/meds` page (new Shell app) manages meds and renders the dose-interval timing view.

**Tech Stack:** React 19 + TypeScript strict, Vite, Tailwind v4 (Nordic Journal), Supabase (Postgres + RLS + Deno edge functions), Vitest, lucide-react icons.

## Global Constraints

- **Worktree:** all web/edge work happens in `.worktrees/med-tracker` (branch `med-tracker`, off `origin/main`). NEVER edit/commit in the main worktree. iOS work (Task 10) happens in a separate worktree off `origin/ios-sliders`.
- **No emojis in UI** — use lucide-react icons only.
- **Nordic Journal styling** — `.card`, `.btn-primary`, `.input-base`, `font-display` (Fraunces). Edit `components/layout/Sidebar.tsx` (Nordic), not SidebarKinetic.
- **Path alias:** `@/` → `src/`.
- **`useCallback` for all handlers passed as props;** hooks own Supabase CRUD + realtime, following `useContacts.ts` / `useRoutines.ts` patterns.
- **Never `select('*')` on tables with heavy columns** — these tables have none, so `select('*')` is fine here.
- **Supabase project ref:** `mwadppyrqzuzgstmwpuy`. Apply SQL via Management API (migration history is out of sync); token via `security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d`.
- **Tests:** `npx vitest run <file>` (plain `npm test` is watch mode). Run `npm run build` (tsc -b, strict) before any push to `main`.
- **Timezone:** `taken_at` is `timestamptz`; `schedule_times` are local wall-clock `"HH:MM"` strings interpreted in the browser timezone.
- **Deno edge functions** import from `https://esm.sh/@supabase/supabase-js@2`.

---

## File Structure

**Create:**
- `supabase/migrations/2026-07-01_medications.sql` — tables, RLS, token helper
- `supabase/functions/log-medication/index.ts` — logging endpoint
- `supabase/functions/log-medication/index.test.ts` — pure-logic tests (Deno-independent, run via vitest)
- `src/types/medication.ts` — `Medication`, `MedicationLog`, `MedSource` types
- `src/lib/meds/slotMatching.ts` — match logs to nearest schedule slot (pure)
- `src/lib/meds/slotMatching.test.ts`
- `src/lib/meds/intervals.ts` — intervals between consecutive doses (pure)
- `src/lib/meds/intervals.test.ts`
- `src/hooks/useMedications.ts` + `.test.ts`
- `src/hooks/useMedicationLogs.ts` + `.test.ts`
- `src/apps/meds/index.ts` — `medsAppDef`
- `src/apps/meds/MedsApp.tsx` — page (Today strip + Timing + Manage)
- `src/apps/meds/components/MedManageList.tsx` — CRUD list
- `src/apps/meds/components/MedEditor.tsx` — add/edit a med (name, strength, schedule pills)
- `src/apps/meds/components/TodayStrip.tsx` — today's slots vs logs
- `src/apps/meds/components/TimingView.tsx` — 7/30-day interval view
- `docs/meds-shortcut-setup.md` — Watch/phone Shortcut recipe

**Modify:**
- `supabase/config.toml` — add `[functions.log-medication] verify_jwt = false`
- `src/shell/appRegistry.ts` — register `medsAppDef`
- `src/main.tsx` — add `<Route path="/meds/*" element={<Shell />} />`
- `src/components/layout/Sidebar.tsx` — add "Meds" entry in the Library group

---

### Task 1: Database migration — tables, RLS, token bootstrap

**Files:**
- Create: `supabase/migrations/2026-07-01_medications.sql`

**Interfaces:**
- Produces tables `medications`, `medication_logs`, `med_log_tokens` and RPC `ensure_med_log_token()` returning `text` (the caller's token, creating it if absent). Later tasks read these via supabase-js.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Medication tracker — timestamped dose logging for PD meds.
-- Dedicated domain (not routines) so `taken_at` timestamps are first-class and
-- PRN/extra doses are ordinary rows. Owner-only RLS (private health data).

create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  strength text,
  schedule_times jsonb not null default '[]'::jsonb,  -- array of local "HH:MM"
  active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medications_user_idx on medications(user_id);

create table if not exists medication_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  medication_id uuid not null references medications(id) on delete cascade,
  taken_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('siri','shortcut','web','manual')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists medication_logs_user_taken_idx on medication_logs(user_id, taken_at desc);
create index if not exists medication_logs_med_idx on medication_logs(medication_id);

-- Durable per-user secret for the Watch/phone Shortcut (JWTs expire; a static
-- Shortcut needs a stable credential). Same spirit as the vault-sync webhook.
create table if not exists med_log_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table medications enable row level security;
alter table medication_logs enable row level security;
alter table med_log_tokens enable row level security;

-- Owner-only on all three (no household sharing for private meds).
drop policy if exists "own medications" on medications;
create policy "own medications" on medications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own medication_logs" on medication_logs;
create policy "own medication_logs" on medication_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own med_log_tokens" on med_log_tokens;
create policy "own med_log_tokens" on med_log_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Return the caller's logging token, minting one on first call.
-- SECURITY DEFINER so the insert bypasses RLS timing races; still scoped to auth.uid().
create or replace function ensure_med_log_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  select token into t from med_log_tokens where user_id = auth.uid();
  if t is null then
    t := encode(gen_random_bytes(24), 'hex');
    insert into med_log_tokens(user_id, token) values (auth.uid(), t)
      on conflict (user_id) do update set token = excluded.token
      returning token into t;
  end if;
  return t;
end;
$$;

revoke all on function ensure_med_log_token() from public;
grant execute on function ensure_med_log_token() to authenticated;
```

- [ ] **Step 2: Apply to prod via Management API**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data @<(jq -Rs '{query:.}' supabase/migrations/2026-07-01_medications.sql)
```
Expected: JSON `[]` (DDL returns no rows), no `error` key.

- [ ] **Step 3: Verify tables + RPC exist**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"query":"select table_name from information_schema.tables where table_name in ('medications','medication_logs','med_log_tokens') order by table_name;"}'
```
Expected: three rows — `med_log_tokens`, `medication_logs`, `medications`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-01_medications.sql
git commit -m "feat(meds): medications, medication_logs, med_log_tokens tables + token RPC"
```

---

### Task 2: Types + pure lib (slot matching, intervals) — TDD

**Files:**
- Create: `src/types/medication.ts`
- Create: `src/lib/meds/slotMatching.ts`, `src/lib/meds/slotMatching.test.ts`
- Create: `src/lib/meds/intervals.ts`, `src/lib/meds/intervals.test.ts`

**Interfaces:**
- Produces:
  - `Medication { id, userId, name, strength?, scheduleTimes: string[], active, notes?, sortOrder, createdAt: Date, updatedAt: Date }`
  - `MedicationLog { id, medicationId, takenAt: Date, source: MedSource, note?, createdAt: Date }`
  - `MedSource = 'siri' | 'shortcut' | 'web' | 'manual'`
  - `matchLogsToSlots(scheduleTimes: string[], logs: MedicationLog[], windowMin?: number): { slot: string; log: MedicationLog | null }[]` and `{ extras: MedicationLog[] }` — see signature below.
  - `computeIntervals(logs: MedicationLog[]): { from: Date; to: Date; minutes: number }[]`

- [ ] **Step 1: Write the types file**

```typescript
// src/types/medication.ts
export type MedSource = 'siri' | 'shortcut' | 'web' | 'manual'

export interface Medication {
  id: string
  userId: string
  name: string
  strength?: string
  scheduleTimes: string[] // local "HH:MM", sorted ascending by convention
  active: boolean
  notes?: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface MedicationLog {
  id: string
  medicationId: string
  takenAt: Date
  source: MedSource
  note?: string
  createdAt: Date
}
```

- [ ] **Step 2: Write failing tests for slot matching**

```typescript
// src/lib/meds/slotMatching.test.ts
import { describe, it, expect } from 'vitest'
import { matchLogsToSlots } from './slotMatching'
import type { MedicationLog } from '@/types/medication'

function log(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'manual', createdAt: new Date(iso) }
}

// Anchor date used for the schedule day (local time).
const DAY = new Date('2026-07-01T00:00:00')

describe('matchLogsToSlots', () => {
  it('matches a log to the nearest slot within the window', () => {
    const logs = [log('a', '2026-07-01T07:05:00')]
    const { slots, extras } = matchLogsToSlots(['07:00', '11:00'], logs, DAY, 90)
    expect(slots[0]).toEqual({ slot: '07:00', log: logs[0] })
    expect(slots[1]).toEqual({ slot: '11:00', log: null })
    expect(extras).toEqual([])
  })

  it('sends a log with no slot within the window to extras', () => {
    const logs = [log('a', '2026-07-01T14:30:00')]
    const { slots, extras } = matchLogsToSlots(['07:00', '11:00'], logs, DAY, 90)
    expect(slots.every((s) => s.log === null)).toBe(true)
    expect(extras).toEqual(logs)
  })

  it('gives each slot at most one log and puts the second-closest in extras', () => {
    const logs = [log('a', '2026-07-01T06:55:00'), log('b', '2026-07-01T07:10:00')]
    const { slots, extras } = matchLogsToSlots(['07:00'], logs, DAY, 90)
    expect(slots[0].log?.id).toBe('a') // closer to 07:00
    expect(extras.map((l) => l.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 3: Run — expect fail**

Run: `npx vitest run src/lib/meds/slotMatching.test.ts`
Expected: FAIL — `matchLogsToSlots` is not a function.

- [ ] **Step 4: Implement slot matching**

```typescript
// src/lib/meds/slotMatching.ts
import type { MedicationLog } from '@/types/medication'

export interface SlotMatch {
  slot: string // "HH:MM"
  log: MedicationLog | null
}

export interface MatchResult {
  slots: SlotMatch[]
  extras: MedicationLog[]
}

// Build a Date for `HH:MM` on the same local day as `day`.
function slotDate(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * Match each log to the nearest schedule slot within `windowMin` minutes.
 * Greedy by absolute distance; each slot and each log used at most once.
 * Unmatched logs become `extras`. Display-only — logs never store a slot.
 */
export function matchLogsToSlots(
  scheduleTimes: string[],
  logs: MedicationLog[],
  day: Date,
  windowMin = 90,
): MatchResult {
  const slots: SlotMatch[] = scheduleTimes.map((slot) => ({ slot, log: null }))
  const windowMs = windowMin * 60_000
  const used = new Set<string>()

  // Candidate (slotIndex, log, distance) triples within the window, closest first.
  const pairs: { si: number; log: MedicationLog; dist: number }[] = []
  slots.forEach((s, si) => {
    const target = slotDate(day, s.slot).getTime()
    for (const l of logs) {
      const dist = Math.abs(l.takenAt.getTime() - target)
      if (dist <= windowMs) pairs.push({ si, log: l, dist })
    }
  })
  pairs.sort((a, b) => a.dist - b.dist)

  for (const p of pairs) {
    if (slots[p.si].log !== null) continue
    if (used.has(p.log.id)) continue
    slots[p.si].log = p.log
    used.add(p.log.id)
  }

  const extras = logs.filter((l) => !used.has(l.id))
  return { slots, extras }
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npx vitest run src/lib/meds/slotMatching.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write failing tests for intervals**

```typescript
// src/lib/meds/intervals.test.ts
import { describe, it, expect } from 'vitest'
import { computeIntervals } from './intervals'
import type { MedicationLog } from '@/types/medication'

function log(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'manual', createdAt: new Date(iso) }
}

describe('computeIntervals', () => {
  it('returns empty for fewer than two logs', () => {
    expect(computeIntervals([])).toEqual([])
    expect(computeIntervals([log('a', '2026-07-01T07:00:00')])).toEqual([])
  })

  it('computes minutes between consecutive doses in chronological order', () => {
    const logs = [log('b', '2026-07-01T11:30:00'), log('a', '2026-07-01T07:00:00')]
    const res = computeIntervals(logs)
    expect(res).toHaveLength(1)
    expect(res[0].minutes).toBe(270) // 4h30m
    expect(res[0].from.toISOString()).toBe(new Date('2026-07-01T07:00:00').toISOString())
  })
})
```

- [ ] **Step 7: Run — expect fail**

Run: `npx vitest run src/lib/meds/intervals.test.ts`
Expected: FAIL — `computeIntervals` is not a function.

- [ ] **Step 8: Implement intervals**

```typescript
// src/lib/meds/intervals.ts
import type { MedicationLog } from '@/types/medication'

export interface DoseInterval {
  from: Date
  to: Date
  minutes: number
}

/** Minutes between each consecutive pair of doses, sorted chronologically. */
export function computeIntervals(logs: MedicationLog[]): DoseInterval[] {
  const sorted = [...logs].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime())
  const out: DoseInterval[] = []
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].takenAt
    const to = sorted[i].takenAt
    out.push({ from, to, minutes: Math.round((to.getTime() - from.getTime()) / 60_000) })
  }
  return out
}
```

- [ ] **Step 9: Run — expect pass**

Run: `npx vitest run src/lib/meds/intervals.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add src/types/medication.ts src/lib/meds/
git commit -m "feat(meds): types + pure slot-matching and interval helpers (TDD)"
```

---

### Task 3: `log-medication` edge function — TDD on pure logic, then deploy

**Files:**
- Create: `supabase/functions/log-medication/index.ts`
- Create: `supabase/functions/log-medication/index.test.ts`
- Modify: `supabase/config.toml` (add function stanza)

**Interfaces:**
- Consumes: `medications`, `medication_logs`, `med_log_tokens` from Task 1.
- Produces: `POST /functions/v1/log-medication` with header `x-med-token`, body `{ medication: string; taken_at?: string; note?: string }`. Also exports pure `matchMedication(name, meds)` and `parseBody(raw)` for tests.

- [ ] **Step 1: Write failing tests for the pure helpers**

```typescript
// supabase/functions/log-medication/index.test.ts
import { describe, it, expect } from 'vitest'
import { matchMedication, parseBody } from './index.ts'

const MEDS = [
  { id: '1', name: 'Carbidopa/Levodopa' },
  { id: '2', name: 'Rasagiline' },
]

describe('matchMedication', () => {
  it('"all" returns the all sentinel', () => {
    expect(matchMedication('all', MEDS)).toEqual({ kind: 'all' })
  })
  it('case-insensitive substring match returns the single med', () => {
    expect(matchMedication('levodopa', MEDS)).toEqual({ kind: 'one', med: MEDS[0] })
  })
  it('no match returns none', () => {
    expect(matchMedication('aspirin', MEDS)).toEqual({ kind: 'none' })
  })
  it('multiple matches returns ambiguous with candidates', () => {
    const meds = [{ id: '1', name: 'Levodopa AM' }, { id: '2', name: 'Levodopa PM' }]
    expect(matchMedication('levodopa', meds)).toEqual({ kind: 'ambiguous', candidates: meds })
  })
})

describe('parseBody', () => {
  it('rejects missing medication', () => {
    expect(parseBody({}).ok).toBe(false)
  })
  it('accepts a valid body and defaults source', () => {
    const r = parseBody({ medication: 'all', note: 'hi' })
    expect(r).toEqual({ ok: true, medication: 'all', taken_at: undefined, note: 'hi' })
  })
  it('rejects a non-ISO taken_at', () => {
    expect(parseBody({ medication: 'all', taken_at: 'not-a-date' }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run supabase/functions/log-medication/index.test.ts`
Expected: FAIL — cannot find module / functions not exported.

- [ ] **Step 3: Implement the edge function**

```typescript
// supabase/functions/log-medication/index.ts
// LOG-MEDICATION — trusted-device dose logger for the meds tracker.
// Auth: durable per-user token in `x-med-token` (see med_log_tokens / ensure_med_log_token).
// Body: { medication: "all" | <name substring>, taken_at?: ISO8601, note?: string }
// Returns { ok, message } — message is human-readable so Siri can speak it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-med-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export interface MedRow { id: string; name: string }

export type MatchResult =
  | { kind: 'all' }
  | { kind: 'one'; med: MedRow }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: MedRow[] }

export function matchMedication(query: string, meds: MedRow[]): MatchResult {
  if (query.trim().toLowerCase() === 'all') return { kind: 'all' }
  const q = query.trim().toLowerCase()
  const hits = meds.filter((m) => m.name.toLowerCase().includes(q))
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length > 1) return { kind: 'ambiguous', candidates: hits }
  return { kind: 'one', med: hits[0] }
}

export type ParsedBody =
  | { ok: true; medication: string; taken_at?: string; note?: string }
  | { ok: false; error: string }

export function parseBody(raw: unknown): ParsedBody {
  const b = (raw ?? {}) as Record<string, unknown>
  if (typeof b.medication !== 'string' || b.medication.trim() === '') {
    return { ok: false, error: 'medication is required' }
  }
  if (b.taken_at !== undefined) {
    if (typeof b.taken_at !== 'string' || Number.isNaN(Date.parse(b.taken_at))) {
      return { ok: false, error: 'taken_at must be an ISO8601 string' }
    }
  }
  if (b.note !== undefined && typeof b.note !== 'string') {
    return { ok: false, error: 'note must be a string' }
  }
  return {
    ok: true,
    medication: b.medication,
    taken_at: b.taken_at as string | undefined,
    note: b.note as string | undefined,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// @ts-ignore Deno global present at runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const token = req.headers.get('x-med-token')
  if (!token) return json({ ok: false, error: 'missing x-med-token' }, 401)

  let raw: unknown
  try { raw = await req.json() } catch { return json({ ok: false, error: 'invalid JSON' }, 400) }
  const parsed = parseBody(raw)
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400)

  // @ts-ignore Deno env
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: tok } = await admin.from('med_log_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!tok) return json({ ok: false, error: 'invalid token' }, 401)
  const userId = tok.user_id as string

  const { data: meds } = await admin
    .from('medications').select('id, name').eq('user_id', userId).eq('active', true)
  const list = (meds ?? []) as MedRow[]
  const match = matchMedication(parsed.medication, list)

  if (match.kind === 'none') return json({ ok: false, message: `No medication matching "${parsed.medication}"` }, 404)
  if (match.kind === 'ambiguous') {
    return json({ ok: false, message: `Which one? ${match.candidates.map((c) => c.name).join(', ')}` }, 409)
  }

  const takenAt = parsed.taken_at ? new Date(parsed.taken_at) : new Date()
  const targets = match.kind === 'all' ? list : [match.med]
  if (targets.length === 0) return json({ ok: false, message: 'No active medications to log' }, 404)

  const rows = targets.map((m) => ({
    user_id: userId, medication_id: m.id, taken_at: takenAt.toISOString(), source: 'shortcut',
    note: parsed.note ?? null,
  }))
  const { error } = await admin.from('medication_logs').insert(rows)
  if (error) return json({ ok: false, message: 'Could not save log' }, 500)

  const names = targets.map((m) => m.name).join(', ')
  return json({ ok: true, message: `Logged ${names} at ${fmtTime(takenAt)}` })
})
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run supabase/functions/log-medication/index.test.ts`
Expected: PASS (7 tests). (The `Deno.serve` call is not executed by the test — only the exported pure helpers are imported. If vitest tries to evaluate `Deno`, guard is not needed because `Deno.serve` runs only at import time in Deno; in Node the module still imports since `Deno` is referenced lazily inside the callback. If import fails on `Deno.serve`, wrap the serve call: `if (typeof Deno !== 'undefined') Deno.serve(...)`.)

- [ ] **Step 5: Add config.toml stanza**

Add after the `[functions.vault-sync]` block in `supabase/config.toml`:

```toml
[functions.log-medication]
verify_jwt = false
```

- [ ] **Step 6: Deploy the function**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx supabase functions deploy log-medication --project-ref mwadppyrqzuzgstmwpuy --no-verify-jwt
```
Expected: "Deployed Function log-medication".

- [ ] **Step 7: Smoke test with a real token**

Mint a token for Scott (run in Supabase SQL via Management API, as his user) — for the smoke test, fetch any existing user_id + insert a token, then curl. Use the Management API to create a temp med + token:
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
# (Manual) insert a test medication + med_log_token for Scott's user_id, then:
ANON=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2)
curl -sS -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-medication" \
  -H "Authorization: Bearer $ANON" -H "x-med-token: <the-test-token>" \
  -H "Content-Type: application/json" -d '{"medication":"all"}'
```
Expected: `{"ok":true,"message":"Logged ... at ..."}`. Also verify bad token → 401, `{"medication":"zzz"}` → 404.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/log-medication/ supabase/config.toml
git commit -m "feat(meds): log-medication edge function (token auth, speakable reply)"
```

---

### Task 4: Hooks — `useMedications` + `useMedicationLogs`

**Files:**
- Create: `src/hooks/useMedications.ts`, `src/hooks/useMedications.test.ts`
- Create: `src/hooks/useMedicationLogs.ts`, `src/hooks/useMedicationLogs.test.ts`

**Interfaces:**
- Consumes: `Medication`, `MedicationLog` from Task 2; `supabase` from `@/lib/supabase`; `useAuth`.
- Produces:
  - `useMedications() => { medications: Medication[]; loading; error; addMedication(input); updateMedication(id, patch); deleteMedication(id) }`
  - `useMedicationLogs(opts?: { sinceDays?: number }) => { logs: MedicationLog[]; loading; error; logDose(medicationId, takenAt?, note?); updateLog(id, patch); deleteLog(id) }`

- [ ] **Step 1: Write `useMedications` mapping test**

```typescript
// src/hooks/useMedications.test.ts
import { describe, it, expect } from 'vitest'
import { dbMedicationToMedication } from './useMedications'

describe('dbMedicationToMedication', () => {
  it('maps snake_case row + jsonb schedule to the Medication type', () => {
    const med = dbMedicationToMedication({
      id: 'm1', user_id: 'u1', name: 'Levodopa', strength: '25/100 mg',
      schedule_times: ['07:00', '11:00'], active: true, notes: null, sort_order: 0,
      created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    })
    expect(med.name).toBe('Levodopa')
    expect(med.scheduleTimes).toEqual(['07:00', '11:00'])
    expect(med.strength).toBe('25/100 mg')
    expect(med.notes).toBeUndefined()
    expect(med.createdAt).toBeInstanceOf(Date)
  })
}
)
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/hooks/useMedications.test.ts`
Expected: FAIL — `dbMedicationToMedication` not exported.

- [ ] **Step 3: Implement `useMedications`**

```typescript
// src/hooks/useMedications.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Medication } from '@/types/medication'

interface DbMedication {
  id: string; user_id: string; name: string; strength: string | null
  schedule_times: string[]; active: boolean; notes: string | null
  sort_order: number; created_at: string; updated_at: string
}

export function dbMedicationToMedication(r: DbMedication): Medication {
  return {
    id: r.id, userId: r.user_id, name: r.name,
    strength: r.strength ?? undefined,
    scheduleTimes: Array.isArray(r.schedule_times) ? r.schedule_times : [],
    active: r.active, notes: r.notes ?? undefined, sortOrder: r.sort_order,
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  }
}

export interface MedicationInput {
  name: string; strength?: string; scheduleTimes?: string[]; notes?: string; active?: boolean
}

export function useMedications() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setMedications([]); setLoading(false); return
    }
    let active = true
    async function fetchMeds() {
      setLoading(true); setError(null)
      const { data, error: e } = await supabase
        .from('medications').select('*').order('sort_order', { ascending: true })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setMedications((data as DbMedication[]).map(dbMedicationToMedication))
      setLoading(false)
    }
    fetchMeds()
    const channel = supabase
      .channel('medications-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medications' }, fetchMeds)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user])

  const addMedication = useCallback(async (input: MedicationInput) => {
    const { data, error: e } = await supabase.from('medications').insert({
      name: input.name, strength: input.strength ?? null,
      schedule_times: input.scheduleTimes ?? [], notes: input.notes ?? null,
      active: input.active ?? true,
    }).select().single()
    if (e) { setError(e.message); return null }
    return dbMedicationToMedication(data as DbMedication)
  }, [])

  const updateMedication = useCallback(async (id: string, patch: Partial<MedicationInput>) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.strength !== undefined) row.strength = patch.strength
    if (patch.scheduleTimes !== undefined) row.schedule_times = patch.scheduleTimes
    if (patch.notes !== undefined) row.notes = patch.notes
    if (patch.active !== undefined) row.active = patch.active
    row.updated_at = new Date().toISOString()
    const { error: e } = await supabase.from('medications').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteMedication = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('medications').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { medications, loading, error, addMedication, updateMedication, deleteMedication }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/hooks/useMedications.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `useMedicationLogs` mapping test**

```typescript
// src/hooks/useMedicationLogs.test.ts
import { describe, it, expect } from 'vitest'
import { dbLogToLog } from './useMedicationLogs'

describe('dbLogToLog', () => {
  it('maps a log row to MedicationLog', () => {
    const l = dbLogToLog({
      id: 'l1', user_id: 'u1', medication_id: 'm1',
      taken_at: '2026-07-01T14:30:00Z', source: 'shortcut', note: null,
      created_at: '2026-07-01T14:30:01Z',
    })
    expect(l.medicationId).toBe('m1')
    expect(l.source).toBe('shortcut')
    expect(l.takenAt).toBeInstanceOf(Date)
    expect(l.note).toBeUndefined()
  })
})
```

- [ ] **Step 6: Run — expect fail**

Run: `npx vitest run src/hooks/useMedicationLogs.test.ts`
Expected: FAIL — `dbLogToLog` not exported.

- [ ] **Step 7: Implement `useMedicationLogs`**

```typescript
// src/hooks/useMedicationLogs.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { MedicationLog, MedSource } from '@/types/medication'

interface DbLog {
  id: string; user_id: string; medication_id: string; taken_at: string
  source: MedSource; note: string | null; created_at: string
}

export function dbLogToLog(r: DbLog): MedicationLog {
  return {
    id: r.id, medicationId: r.medication_id, takenAt: new Date(r.taken_at),
    source: r.source, note: r.note ?? undefined, createdAt: new Date(r.created_at),
  }
}

export function useMedicationLogs(opts: { sinceDays?: number } = {}) {
  const { user } = useAuth()
  const sinceDays = opts.sinceDays ?? 30
  const [logs, setLogs] = useState<MedicationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setLogs([]); setLoading(false); return
    }
    let active = true
    async function fetchLogs() {
      setLoading(true); setError(null)
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      const { data, error: e } = await supabase
        .from('medication_logs').select('*').gte('taken_at', since).order('taken_at', { ascending: false })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setLogs((data as DbLog[]).map(dbLogToLog))
      setLoading(false)
    }
    fetchLogs()
    const channel = supabase
      .channel('medication-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medication_logs' }, fetchLogs)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user, sinceDays])

  const logDose = useCallback(async (medicationId: string, takenAt?: Date, note?: string) => {
    const { error: e } = await supabase.from('medication_logs').insert({
      medication_id: medicationId, taken_at: (takenAt ?? new Date()).toISOString(),
      source: 'web', note: note ?? null,
    })
    if (e) setError(e.message)
  }, [])

  const updateLog = useCallback(async (id: string, patch: { takenAt?: Date; note?: string }) => {
    const row: Record<string, unknown> = {}
    if (patch.takenAt !== undefined) row.taken_at = patch.takenAt.toISOString()
    if (patch.note !== undefined) row.note = patch.note
    const { error: e } = await supabase.from('medication_logs').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteLog = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('medication_logs').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { logs, loading, error, logDose, updateLog, deleteLog }
}
```

- [ ] **Step 8: Run — expect pass**

Run: `npx vitest run src/hooks/useMedicationLogs.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useMedications.ts src/hooks/useMedications.test.ts src/hooks/useMedicationLogs.ts src/hooks/useMedicationLogs.test.ts
git commit -m "feat(meds): useMedications + useMedicationLogs hooks with realtime"
```

---

### Task 5: `/meds` page scaffold — app def, routing, sidebar

**Files:**
- Create: `src/apps/meds/index.ts`, `src/apps/meds/MedsApp.tsx`
- Modify: `src/shell/appRegistry.ts`, `src/main.tsx`, `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useMedications`, `useMedicationLogs`.
- Produces: `medsAppDef: AppDef` (id `'meds'`, route `/meds`); a working `/meds` page with three tab sections (Today / Timing / Manage) rendering placeholders wired to real hook data counts.

- [ ] **Step 1: Create the app component with tab shell**

```tsx
// src/apps/meds/MedsApp.tsx
import { useState } from 'react'
import { Pill, Clock, ListChecks } from 'lucide-react'
import { useMedications } from '@/hooks/useMedications'
import { useMedicationLogs } from '@/hooks/useMedicationLogs'
import { TodayStrip } from './components/TodayStrip'
import { TimingView } from './components/TimingView'
import { MedManageList } from './components/MedManageList'

type Tab = 'today' | 'timing' | 'manage'

export function MedsApp() {
  const [tab, setTab] = useState<Tab>('today')
  const { medications, loading, addMedication, updateMedication, deleteMedication } = useMedications()
  const { logs, logDose, updateLog, deleteLog } = useMedicationLogs({ sinceDays: 30 })

  const tabs: { id: Tab; label: string; icon: typeof Pill }[] = [
    { id: 'today', label: 'Today', icon: Pill },
    { id: 'timing', label: 'Timing', icon: Clock },
    { id: 'manage', label: 'Manage', icon: ListChecks },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-display mb-4">Medications</h1>
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                tab === t.id ? 'btn-primary' : 'card'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : tab === 'today' ? (
        <TodayStrip medications={medications} logs={logs} onLogDose={logDose} />
      ) : tab === 'timing' ? (
        <TimingView medications={medications} logs={logs} />
      ) : (
        <MedManageList
          medications={medications}
          logs={logs}
          onAdd={addMedication}
          onUpdate={updateMedication}
          onDelete={deleteMedication}
          onLogDose={logDose}
          onUpdateLog={updateLog}
          onDeleteLog={deleteLog}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create placeholder child components (filled in Tasks 6-8)**

Create minimal stubs so the page compiles now; later tasks replace their bodies.

```tsx
// src/apps/meds/components/TodayStrip.tsx
import type { Medication, MedicationLog } from '@/types/medication'
interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
}
export function TodayStrip({ medications }: Props) {
  return <p className="text-neutral-500">{medications.length} medications — today view coming in Task 7.</p>
}
```

```tsx
// src/apps/meds/components/TimingView.tsx
import type { Medication, MedicationLog } from '@/types/medication'
interface Props { medications: Medication[]; logs: MedicationLog[] }
export function TimingView({ logs }: Props) {
  return <p className="text-neutral-500">{logs.length} logged doses — timing view coming in Task 8.</p>
}
```

```tsx
// src/apps/meds/components/MedManageList.tsx
import type { Medication, MedicationLog } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'
interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onAdd: (input: MedicationInput) => Promise<Medication | null>
  onUpdate: (id: string, patch: Partial<MedicationInput>) => void
  onDelete: (id: string) => void
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
  onUpdateLog: (id: string, patch: { takenAt?: Date; note?: string }) => void
  onDeleteLog: (id: string) => void
}
export function MedManageList({ medications }: Props) {
  return <p className="text-neutral-500">{medications.length} medications — manage UI coming in Task 6.</p>
}
```

- [ ] **Step 3: Create the app def**

```typescript
// src/apps/meds/index.ts
import type { AppDef } from '@/shell/types'
import { MedsApp } from './MedsApp'

// Medications tracker (Today / Timing / Manage). Owner-only private health data.
export const medsAppDef: AppDef = {
  id: 'meds',
  route: '/meds',
  Component: MedsApp,
}
```

- [ ] **Step 4: Register in appRegistry**

In `src/shell/appRegistry.ts`, add the import near the other app imports:
```typescript
import { medsAppDef } from '@/apps/meds';
```
and add `medsAppDef,` to the `createRegistry([...])` array (next to `routinesAppDef`).

- [ ] **Step 5: Add the route in main.tsx**

In `src/main.tsx`, add alongside the other Shell routes (e.g. after the `/routines/*` line):
```tsx
<Route path="/meds/*" element={<Shell />} />
```

- [ ] **Step 6: Add the sidebar entry**

In `src/components/layout/Sidebar.tsx`, in the Library group next to the Routines button (search for `navigate('/routines')`), add a Meds button following the exact same markup pattern, importing `Pill` from `lucide-react`:
```tsx
{/* Meds */}
<button onClick={() => navigate('/meds')} className={/* copy the sibling button's className */}>
  <Pill className={/* copy sibling icon className */} />
  {!collapsed && <span>Meds</span>}
</button>
```
(Match the exact className strings used by the adjacent Routines/Contacts buttons — copy them verbatim so styling is identical.)

- [ ] **Step 7: Typecheck + run dev, verify the page loads**

Run: `npm run build`
Expected: PASS (no TS errors).
Then `npm run dev`, open `http://localhost:5173/meds` — three tabs render; Today/Timing/Manage show the count placeholders.

- [ ] **Step 8: Commit**

```bash
git add src/apps/meds/ src/shell/appRegistry.ts src/main.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(meds): /meds page scaffold — app def, route, sidebar, tab shell"
```

---

### Task 6: Manage tab — med CRUD + log editing

**Files:**
- Modify: `src/apps/meds/components/MedManageList.tsx`
- Create: `src/apps/meds/components/MedEditor.tsx`

**Interfaces:**
- Consumes: props from Task 5 (`onAdd`, `onUpdate`, `onDelete`, `onLogDose`, `onUpdateLog`, `onDeleteLog`), `Medication`, `MedicationLog`, `MedicationInput`.
- Produces: full CRUD UI; `MedEditor` for add/edit with schedule-time pills.

- [ ] **Step 1: Build `MedEditor` (name, strength, schedule pills, notes)**

```tsx
// src/apps/meds/components/MedEditor.tsx
import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Medication } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'

interface Props {
  initial?: Medication
  onSave: (input: MedicationInput) => void
  onCancel: () => void
}

export function MedEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [strength, setStrength] = useState(initial?.strength ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [times, setTimes] = useState<string[]>(initial?.scheduleTimes ?? [])
  const [newTime, setNewTime] = useState('')

  function addTime() {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return
    if (times.includes(newTime)) return
    setTimes([...times, newTime].sort())
    setNewTime('')
  }

  return (
    <div className="card p-4 space-y-3">
      <input className="input-base text-2xl font-display w-full" placeholder="Medication name"
        value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input-base w-full" placeholder="Strength (e.g. 25/100 mg)"
        value={strength} onChange={(e) => setStrength(e.target.value)} />
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {times.map((t) => (
            <span key={t} className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary-50 text-sm">
              {t}
              <button onClick={() => setTimes(times.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="time" className="input-base" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          <button className="card px-3 flex items-center gap-1" onClick={addTime}>
            <Plus className="w-4 h-4" /> Add time
          </button>
        </div>
      </div>
      <textarea className="input-base w-full" placeholder="Notes" value={notes}
        onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <button className="card px-4 py-2" onClick={onCancel}>Cancel</button>
        <button className="btn-primary px-4 py-2" disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), strength: strength.trim() || undefined,
            scheduleTimes: times, notes: notes.trim() || undefined })}>
          Save
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build the manage list (add/edit/delete meds, take-now, edit/delete logs)**

```tsx
// src/apps/meds/components/MedManageList.tsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'
import { MedEditor } from './MedEditor'

interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onAdd: (input: MedicationInput) => Promise<Medication | null>
  onUpdate: (id: string, patch: Partial<MedicationInput>) => void
  onDelete: (id: string) => void
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
  onUpdateLog: (id: string, patch: { takenAt?: Date; note?: string }) => void
  onDeleteLog: (id: string) => void
}

export function MedManageList(props: Props) {
  const { medications, onAdd, onUpdate, onDelete, onLogDose } = props
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {medications.map((m) =>
        editingId === m.id ? (
          <MedEditor key={m.id} initial={m}
            onSave={(input) => { onUpdate(m.id, input); setEditingId(null) }}
            onCancel={() => setEditingId(null)} />
        ) : (
          <div key={m.id} className="card p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{m.name} {m.strength && <span className="text-neutral-400">· {m.strength}</span>}</div>
              <div className="text-sm text-neutral-500">{m.scheduleTimes.join(', ') || 'No schedule'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-primary px-3 py-1 flex items-center gap-1 text-sm"
                onClick={() => onLogDose(m.id)} title="Log a dose now">
                <Check className="w-4 h-4" /> Take now
              </button>
              <button className="card px-2 py-1" onClick={() => setEditingId(m.id)}><Pencil className="w-4 h-4" /></button>
              <button className="card px-2 py-1" onClick={() => onDelete(m.id)}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        )
      )}

      {adding ? (
        <MedEditor onSave={async (input) => { await onAdd(input); setAdding(false) }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="card p-4 w-full flex items-center gap-2 justify-center" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Add medication
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `npm run build`
Expected: PASS. In `npm run dev` at `/meds` → Manage: add a med with two times, edit it, "Take now" inserts a log (visible after realtime refresh), delete works.

- [ ] **Step 4: Commit**

```bash
git add src/apps/meds/components/MedManageList.tsx src/apps/meds/components/MedEditor.tsx
git commit -m "feat(meds): Manage tab — med CRUD, schedule pills, take-now"
```

---

### Task 7: Today tab — slots vs logs

**Files:**
- Modify: `src/apps/meds/components/TodayStrip.tsx`

**Interfaces:**
- Consumes: `matchLogsToSlots` (Task 2), `Medication`, `MedicationLog`, `onLogDose`.
- Produces: per-med rows showing each schedule slot as taken (with real time) or pending, plus an "extra doses" line.

- [ ] **Step 1: Implement the Today strip**

```tsx
// src/apps/meds/components/TodayStrip.tsx
import { Check, Circle } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import { matchLogsToSlots } from '@/lib/meds/slotMatching'

interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}
function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function TodayStrip({ medications, logs, onLogDose }: Props) {
  const today = new Date()
  const active = medications.filter((m) => m.active)
  if (active.length === 0) return <p className="text-neutral-500">No active medications. Add one in Manage.</p>

  return (
    <div className="space-y-4">
      {active.map((m) => {
        const todaysLogs = logs.filter((l) => l.medicationId === m.id && isToday(l.takenAt))
        const { slots, extras } = matchLogsToSlots(m.scheduleTimes, todaysLogs, today, 90)
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">{m.name} {m.strength && <span className="text-neutral-400">· {m.strength}</span>}</div>
              <button className="btn-primary px-3 py-1 text-sm" onClick={() => onLogDose(m.id)}>Take now</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <span key={s.slot} className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                  s.log ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  {s.log ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  {s.slot}{s.log ? ` · ${fmt(s.log.takenAt)}` : ''}
                </span>
              ))}
              {extras.map((l) => (
                <span key={l.id} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-700">
                  <Check className="w-3 h-3" /> extra · {fmt(l.takenAt)}
                </span>
              ))}
              {m.scheduleTimes.length === 0 && todaysLogs.length === 0 && (
                <span className="text-sm text-neutral-400">As needed — no doses logged today</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + verify**

Run: `npm run build`
Expected: PASS. At `/meds` → Today: a med scheduled 07:00/11:00 with one dose logged near 07:00 shows the 07:00 slot green with the real time and 11:00 grey; an off-schedule dose shows as amber "extra".

- [ ] **Step 3: Commit**

```bash
git add src/apps/meds/components/TodayStrip.tsx
git commit -m "feat(meds): Today tab — schedule slots matched to actual dose times"
```

---

### Task 8: Timing tab — dose intervals

**Files:**
- Modify: `src/apps/meds/components/TimingView.tsx`

**Interfaces:**
- Consumes: `computeIntervals` (Task 2), `Medication`, `MedicationLog`.
- Produces: a per-day list (last 7 or 30 days) of doses with the interval since the previous dose; a range toggle.

- [ ] **Step 1: Implement the timing view**

```tsx
// src/apps/meds/components/TimingView.tsx
import { useState, useMemo } from 'react'
import type { Medication, MedicationLog } from '@/types/medication'
import { computeIntervals } from '@/lib/meds/intervals'

interface Props { medications: Medication[]; logs: MedicationLog[] }

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtGap(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function TimingView({ medications, logs }: Props) {
  const [days, setDays] = useState<7 | 30>(7)
  const [medId, setMedId] = useState<string>('all')

  const filtered = useMemo(() => {
    const since = Date.now() - days * 86_400_000
    return logs.filter((l) => l.takenAt.getTime() >= since && (medId === 'all' || l.medicationId === medId))
  }, [logs, days, medId])

  const byDay = useMemo(() => {
    const groups = new Map<string, MedicationLog[]>()
    for (const l of [...filtered].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime())) {
      const k = dayKey(l.takenAt)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(l)
    }
    return [...groups.entries()].reverse()
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {([7, 30] as const).map((d) => (
            <button key={d} className={`px-3 py-1 rounded-full text-sm ${days === d ? 'btn-primary' : 'card'}`}
              onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div>
        <select className="input-base" value={medId} onChange={(e) => setMedId(e.target.value)}>
          <option value="all">All meds</option>
          {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {byDay.length === 0 && <p className="text-neutral-500">No doses logged in this range.</p>}
      {byDay.map(([day, dayLogs]) => {
        const intervals = computeIntervals(dayLogs)
        return (
          <div key={day} className="card p-4">
            <div className="font-medium mb-2">{day}</div>
            <div className="space-y-1">
              {dayLogs.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  <span className="w-16 tabular-nums">{fmt(l.takenAt)}</span>
                  {i > 0 && <span className="text-neutral-400">+{fmtGap(intervals[i - 1].minutes)}</span>}
                  {l.source !== 'web' && l.source !== 'manual' && <span className="text-xs text-primary-500">voice</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + verify**

Run: `npm run build`
Expected: PASS. At `/meds` → Timing: doses group by day newest-first, each dose after the first shows `+Xh Ym` since the previous; the 7/30-day toggle and med filter work.

- [ ] **Step 3: Full test suite + commit**

Run: `npx vitest run src/lib/meds src/hooks/useMedications.test.ts src/hooks/useMedicationLogs.test.ts`
Expected: all PASS.
```bash
git add src/apps/meds/components/TimingView.tsx
git commit -m "feat(meds): Timing tab — dose intervals by day with range/med filters"
```

---

### Task 9: Shortcut setup doc — voice logging live on phone + Watch

**Files:**
- Create: `docs/meds-shortcut-setup.md`
- Add a "Get logging token" button to the Manage tab (`MedManageList.tsx`) that calls the `ensure_med_log_token` RPC and shows the token so Scott can paste it into the Shortcut.

**Interfaces:**
- Consumes: `ensure_med_log_token()` RPC (Task 1), deployed `log-medication` fn (Task 3).
- Produces: a copy-pasteable Shortcut recipe + a token reveal in the UI.

- [ ] **Step 1: Add a token reveal to the Manage tab**

In `MedManageList.tsx`, add near the top of the returned JSX:
```tsx
// add imports: import { supabase } from '@/lib/supabase'; import { KeyRound } from 'lucide-react'
// add state: const [token, setToken] = useState<string | null>(null)
// handler:
async function revealToken() {
  const { data, error } = await supabase.rpc('ensure_med_log_token')
  if (!error && typeof data === 'string') setToken(data)
}
```
```tsx
<div className="card p-4">
  <button className="flex items-center gap-2 text-sm" onClick={revealToken}>
    <KeyRound className="w-4 h-4" /> Show voice-logging token
  </button>
  {token && (
    <code className="block mt-2 break-all text-xs bg-neutral-100 p-2 rounded select-all">{token}</code>
  )}
</div>
```

- [ ] **Step 2: Write the shortcut setup doc**

```markdown
# Voice medication logging — Shortcut setup (iPhone + Apple Watch)

This gives you "Hey Siri, Log Meds" on both your iPhone and Apple Watch with no
app build. It POSTs to the `log-medication` edge function.

## One-time setup
1. In Symphony web → Meds → Manage → "Show voice-logging token". Copy the token.
2. On iPhone, open the **Shortcuts** app → **+** → name it exactly **Log Meds**.
3. Add action **Get Contents of URL**. Configure:
   - URL: `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-medication`
   - Method: **POST**
   - Headers:
     - `x-med-token` = *(your token)*
     - `Content-Type` = `application/json`
   - Request Body: **JSON** → key `medication` = `all`
4. Add action **Show Result** with the variable "Contents of URL" (so Siri speaks the confirmation).
5. (Optional, log one specific med) Duplicate the shortcut, name it **Log Levodopa**,
   set the JSON `medication` = `levodopa`.

## Using it
- iPhone or Watch: "Hey Siri, Log Meds" → logs all active meds now, Siri says
  "Logged Carbidopa/Levodopa at 2:47 PM".
- The Watch runs the same shortcut with no watch app required.

## Notes
- To log a past time, add a `taken_at` JSON key (ISO8601). The default is now.
- If the token ever leaks, press "Show voice-logging token" again — it does NOT
  rotate automatically; rotating requires a manual token reset (future).
```

- [ ] **Step 3: Typecheck + manual end-to-end**

Run: `npm run build`
Expected: PASS. Then: reveal token in the UI, build the Shortcut, run "Hey Siri, Log Meds" on the phone, confirm a log row appears in `/meds` Today.

- [ ] **Step 4: Commit**

```bash
git add docs/meds-shortcut-setup.md src/apps/meds/components/MedManageList.tsx
git commit -m "feat(meds): Shortcut setup doc + voice-logging token reveal"
```

- [ ] **Step 5: Push branch → PR (deploys as preview, NOT prod)**

```bash
git fetch origin main && git rebase origin/main
npm run build && npx vitest run src/lib/meds src/hooks/useMedications.test.ts src/hooks/useMedicationLogs.test.ts
git push -u origin med-tracker
```
Then open a PR for review. Merging to `main` auto-deploys to prod, so merge only after Scott has tried the web page + voice path.

---

### Task 10: iOS App Intent (fast follow — separate branch/worktree)

> **Runs on `ios-sliders`, not `med-tracker`.** Main's `apple/` is stale. Create a
> separate worktree: `git worktree add .worktrees/med-ios origin/ios-sliders`.
> Ships via Xcode Cloud → TestFlight (see the iOS TestFlight memory: ensure the
> workflow builds `ios-sliders`, not `main`). This task can proceed in parallel
> with review of Tasks 1-9.

**Files:**
- Create: `apple/SymphonyOS/SymphonyOS/Intents/LogMedicationIntent.swift`
- Create: `apple/SymphonyOS/SymphonyOS/Intents/SymphonyShortcuts.swift`
- Modify: the app target to include App Intents (Xcode: ensure the Intents folder is in the target).

**Interfaces:**
- Consumes: deployed `log-medication` edge function; the durable token (stored in the app or Keychain after first fetch via the RPC).
- Produces: "Log my meds in Symphony" / "Log ${medication} in Symphony" Siri phrases; a home/lock-screen widget button.

- [ ] **Step 1: Create the App Intent**

```swift
// apple/SymphonyOS/SymphonyOS/Intents/LogMedicationIntent.swift
import AppIntents
import Foundation

struct LogMedicationIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Medication"
    static var description = IntentDescription("Logs a medication dose in Symphony.")

    @Parameter(title: "Medication", default: "all")
    var medication: String

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$medication)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let token = try MedTokenStore.load()  // durable token from Keychain
        let url = URL(string: "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-medication")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "x-med-token")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["medication": medication])

        let (data, response) = try await URLSession.shared.data(for: req)
        let http = response as? HTTPURLResponse
        let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        let message = payload?["message"] as? String ?? "Logged"
        guard (http?.statusCode ?? 500) < 300 else {
            throw NSError(domain: "meds", code: http?.statusCode ?? 500,
                          userInfo: [NSLocalizedDescriptionKey: message])
        }
        return .result(dialog: IntentDialog(stringLiteral: message))
    }
}
```

- [ ] **Step 2: Register App Shortcut phrases**

```swift
// apple/SymphonyOS/SymphonyOS/Intents/SymphonyShortcuts.swift
import AppIntents

struct SymphonyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogMedicationIntent(),
            phrases: [
                "Log my meds in \(.applicationName)",
                "Log \(\.$medication) in \(.applicationName)",
            ],
            shortTitle: "Log Meds",
            systemImageName: "pills.fill"
        )
    }
}
```

- [ ] **Step 3: Add a Keychain token store**

```swift
// apple/SymphonyOS/SymphonyOS/Intents/MedTokenStore.swift
import Foundation
import Security

enum MedTokenStore {
    static let account = "med_log_token"
    static func save(_ token: String) throws {
        let data = token.data(using: .utf8)!
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                     kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var add = query; add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }
    static func load() throws -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                     kSecAttrAccount as String: account,
                                     kSecReturnData as String: true]
        var out: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &out)
        guard let d = out as? Data, let s = String(data: d, encoding: .utf8) else {
            throw NSError(domain: "meds", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: "No medication token — open Symphony and sign in"])
        }
        return s
    }
}
```
The app should call `ensure_med_log_token` (Supabase RPC) once after login and `MedTokenStore.save(token)`.

- [ ] **Step 4: Build in Xcode, test the intent**

Build the `ios-sliders` app to a device/simulator. In Shortcuts, confirm "Log Meds in Symphony" appears; run it; confirm a log row lands in `/meds`. Test on Apple Watch (paired) — the App Shortcut surfaces on the Watch once the phone app is installed.

- [ ] **Step 5: Commit on ios-sliders + push for TestFlight**

```bash
git add apple/SymphonyOS/SymphonyOS/Intents/
git commit -m "feat(ios): Log Medication App Intent + Siri shortcut (phone + watch)"
git push origin ios-sliders
```
Confirm Xcode Cloud builds `ios-sliders` (not `main`) and the build reaches TestFlight.

---

## Self-Review

**Spec coverage:**
- Data model (`medications`, `medication_logs`, `med_log_tokens`) → Task 1 ✓
- `log-medication` edge fn (token auth, fuzzy match, "all", speakable reply, 401/404/409) → Task 3 ✓
- Shortcut on phone + Watch → Task 9 ✓
- iOS App Intent on `ios-sliders` → Task 10 ✓
- Web `/meds`: Today strip → Task 7; Timing view → Task 8; Manage CRUD + take-now + edit/delete logs → Task 6 ✓
- Hooks (`useMedications`, `useMedicationLogs`, realtime) → Task 4 ✓
- Slot matching + intervals pure fns + tests → Task 2 ✓
- Error handling (401/404/409/400) → Task 3; timezone note → Tasks 2/7 ✓
- Out of scope (reminders, wall surfacing, family meds) → not built ✓

**Placeholder scan:** Task 5 intentionally ships stub child components, each replaced with real code in Tasks 6-8 — not placeholders in the final deliverable. Sidebar Step 6 says "copy the sibling className verbatim" rather than guessing exact Tailwind strings; that's a deliberate instruction to match live styling, resolved by reading the adjacent button. No TBD/TODO remain.

**Type consistency:** `matchLogsToSlots(scheduleTimes, logs, day, windowMin)` returns `{ slots, extras }` — used identically in Task 7. `computeIntervals(logs) => DoseInterval[]` with `.minutes` — used in Task 8. `MedicationInput` defined in Task 4, consumed in Tasks 5/6. `MedSource` values `'siri'|'shortcut'|'web'|'manual'` match the DB CHECK in Task 1 and the edge fn's `source: 'shortcut'` insert. Hook return shapes match the props threaded through `MedsApp` → child components.
