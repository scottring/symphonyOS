# Family Capture & Extract — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a text or WhatsApp-Export payload (with a source key) into deduped, confirm-before-commit family event/task candidates in the Symphony inbox, plus a one-line noise summary and gap flags.

**Architecture:** A new `extract-capture` Supabase edge function receives a payload via the existing shared-secret auth, dedupes against a per-source checkpoint, calls Anthropic for structured extraction, and writes candidate rows to `tasks` (bucket=`inbox`, context=`family`) plus a triage `note`. All parsing/dedupe/extraction *logic* lives in pure, Deno-free modules under `extract-capture/lib/` so it is unit-testable with vitest; `index.ts` is a thin Deno.serve orchestrator. The existing `capture-to-inbox` is extended to create a `captures` row and invoke `extract-capture`.

**Tech Stack:** Supabase edge functions (Deno), Postgres (SQL migrations), Anthropic Messages API (`claude-haiku-4-5-20251001`), TypeScript, vitest.

**Scope (this slice):** text + `whatsapp_export` inputs only. NOT in this slice: image/vision, triage UI, Apple Share Extension, Hermes/ClassDojo fetcher (each its own later plan). Spec: `docs/superpowers/specs/2026-05-31-family-capture-and-extract-design.md`.

---

## File Structure

- Create `supabase/migrations/2026-05-31_captures_and_checkpoints.sql` — `captures`, `capture_checkpoints` tables + RLS.
- Create `supabase/functions/extract-capture/lib/whatsapp.ts` — pure WhatsApp `_chat.txt` parser.
- Create `supabase/functions/extract-capture/lib/whatsapp.test.ts` — parser tests.
- Create `supabase/functions/extract-capture/lib/dedupe.ts` — pure checkpoint dedupe.
- Create `supabase/functions/extract-capture/lib/dedupe.test.ts` — dedupe tests.
- Create `supabase/functions/extract-capture/lib/extract.ts` — pure prompt build + response parse + schema validate + shared types.
- Create `supabase/functions/extract-capture/lib/extract.test.ts` — extraction-logic tests.
- Create `supabase/functions/extract-capture/index.ts` — Deno.serve orchestrator.
- Modify `supabase/functions/capture-to-inbox/index.ts` — accept `kind`/`text`/`source_key`, create `captures` row, invoke `extract-capture`.

---

## Task 1: Database tables

**Files:**
- Create: `supabase/migrations/2026-05-31_captures_and_checkpoints.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Slice 1 of Family Capture & Extract.
-- captures: one row per ingested payload (text / whatsapp_export).
-- capture_checkpoints: per-source "last processed" timestamp for "since last run" dedupe.

create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text','whatsapp_export','classdojo_thread','image')),
  source_key text,
  source_label text,
  raw_text text,
  status text not null default 'pending' check (status in ('pending','extracted','failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists captures_user_idx on captures (user_id, created_at desc);

create table if not exists capture_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  last_processed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_key)
);

alter table captures enable row level security;
alter table capture_checkpoints enable row level security;

-- Users see only their own rows. Edge functions use the service-role key, which bypasses RLS.
create policy captures_owner on captures
  for select using (auth.uid() = user_id);
create policy checkpoints_owner on capture_checkpoints
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply locally and verify**

Run: `supabase db reset` (or `supabase migration up` against the local stack)
Expected: completes without error; then
Run: `psql "$LOCAL_DB_URL" -c "\d captures" -c "\d capture_checkpoints"`
Expected: both tables listed with the columns above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-05-31_captures_and_checkpoints.sql
git commit -m "feat(capture): captures + capture_checkpoints tables"
```

---

## Task 2: WhatsApp export parser

**Files:**
- Create: `supabase/functions/extract-capture/lib/whatsapp.ts`
- Test: `supabase/functions/extract-capture/lib/whatsapp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseWhatsAppExport } from './whatsapp'

describe('parseWhatsAppExport', () => {
  it('parses ISO-style iOS lines', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: Eleanor's party Saturday!\n[2026-05-30, 09:15:01] Dad: What time?`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs).toEqual([
      { timestamp: '2026-05-30T09:14:23', sender: 'Mom', text: "Eleanor's party Saturday!" },
      { timestamp: '2026-05-30T09:15:01', sender: 'Dad', text: 'What time?' },
    ])
  })

  it('parses 12-hour US lines', () => {
    const txt = `[5/30/26, 9:14:23 AM] Mom: hi\n[5/30/26, 1:05:00 PM] Mom: bye`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].timestamp).toBe('2026-05-30T09:14:23')
    expect(msgs[1].timestamp).toBe('2026-05-30T13:05:00')
  })

  it('folds continuation lines into the previous message', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: line one\nline two\n[2026-05-30, 09:15:00] Dad: ok`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].text).toBe('line one\nline two')
    expect(msgs).toHaveLength(2)
  })

  it('keeps media placeholders as text and strips the LTR mark', () => {
    const txt = `[2026-05-30, 09:14:23] Mom: ‎<attached: flyer.jpg>`
    const msgs = parseWhatsAppExport(txt)
    expect(msgs[0].text).toBe('<attached: flyer.jpg>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/extract-capture/lib/whatsapp.test.ts`
Expected: FAIL — "Failed to resolve import './whatsapp'".

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ParsedMessage {
  timestamp: string // ISO-ish local: YYYY-MM-DDTHH:mm:ss
  sender: string
  text: string
}

// Matches the bracketed prefix WhatsApp puts on the first line of each message.
// Group 1 = datetime substring, Group 2 = sender, Group 3 = first line of text.
const HEAD = /^‎?\[([^\]]+)\]\s([^:]+):\s?‎?(.*)$/

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Accepts "2026-05-30, 09:14:23" and "5/30/26, 9:14:23 AM" -> "YYYY-MM-DDTHH:mm:ss".
export function normalizeTimestamp(raw: string): string {
  const [datePart, timePartRaw] = raw.split(',').map((s) => s.trim())
  let h: number, m: number, s: number
  const ampm = /\b(AM|PM)\b/i.exec(timePartRaw)
  const [hh, mm, ss] = timePartRaw.replace(/\s*(AM|PM)\s*/i, '').split(':')
  h = parseInt(hh, 10); m = parseInt(mm, 10); s = parseInt(ss ?? '0', 10)
  if (ampm) {
    const isPM = ampm[1].toUpperCase() === 'PM'
    if (isPM && h !== 12) h += 12
    if (!isPM && h === 12) h = 0
  }
  let y: number, mo: number, d: number
  if (datePart.includes('-')) {
    const [yy, mm2, dd] = datePart.split('-').map((x) => parseInt(x, 10))
    y = yy; mo = mm2; d = dd
  } else {
    const [mm2, dd, yy] = datePart.split('/').map((x) => parseInt(x, 10))
    mo = mm2; d = dd; y = yy < 100 ? 2000 + yy : yy
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:${pad(s)}`
}

export function parseWhatsAppExport(text: string): ParsedMessage[] {
  const out: ParsedMessage[] = []
  for (const line of text.split('\n')) {
    const head = HEAD.exec(line)
    if (head) {
      out.push({
        timestamp: normalizeTimestamp(head[1]),
        sender: head[2].trim(),
        text: head[3].replace(/‎/g, ''),
      })
    } else if (out.length > 0) {
      out[out.length - 1].text += `\n${line.replace(/‎/g, '')}`
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/extract-capture/lib/whatsapp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-capture/lib/whatsapp.ts supabase/functions/extract-capture/lib/whatsapp.test.ts
git commit -m "feat(capture): WhatsApp export parser"
```

---

## Task 3: Checkpoint dedupe

**Files:**
- Create: `supabase/functions/extract-capture/lib/dedupe.ts`
- Test: `supabase/functions/extract-capture/lib/dedupe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { filterSince } from './dedupe'
import type { ParsedMessage } from './whatsapp'

const m = (timestamp: string, text: string): ParsedMessage => ({ timestamp, sender: 'X', text })

describe('filterSince', () => {
  it('returns all messages and the newest timestamp when no checkpoint', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a'), m('2026-05-30T10:00:00', 'b')]
    expect(filterSince(msgs, null)).toEqual({ fresh: msgs, newestIso: '2026-05-30T10:00:00' })
  })

  it('drops messages at or before the checkpoint', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a'), m('2026-05-30T10:00:00', 'b'), m('2026-05-30T11:00:00', 'c')]
    const r = filterSince(msgs, '2026-05-30T10:00:00')
    expect(r.fresh.map((x) => x.text)).toEqual(['c'])
    expect(r.newestIso).toBe('2026-05-30T11:00:00')
  })

  it('returns empty fresh and preserves checkpoint when nothing is new', () => {
    const msgs = [m('2026-05-30T09:00:00', 'a')]
    expect(filterSince(msgs, '2026-05-30T12:00:00')).toEqual({ fresh: [], newestIso: '2026-05-30T12:00:00' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/extract-capture/lib/dedupe.test.ts`
Expected: FAIL — "Failed to resolve import './dedupe'".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ParsedMessage } from './whatsapp'

export interface DedupeResult {
  fresh: ParsedMessage[]
  newestIso: string | null
}

// Lexicographic comparison is correct because timestamps are zero-padded
// fixed-width "YYYY-MM-DDTHH:mm:ss" strings.
export function filterSince(messages: ParsedMessage[], lastIso: string | null): DedupeResult {
  const fresh = lastIso ? messages.filter((mm) => mm.timestamp > lastIso) : messages.slice()
  const maxInBatch = messages.reduce<string | null>(
    (acc, mm) => (acc === null || mm.timestamp > acc ? mm.timestamp : acc),
    null,
  )
  const newestIso = maxInBatch === null ? lastIso : maxInBatch > (lastIso ?? '') ? maxInBatch : lastIso
  return { fresh, newestIso }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/extract-capture/lib/dedupe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-capture/lib/dedupe.ts supabase/functions/extract-capture/lib/dedupe.test.ts
git commit -m "feat(capture): per-source checkpoint dedupe"
```

---

## Task 4: Extraction prompt, parse, and schema

**Files:**
- Create: `supabase/functions/extract-capture/lib/extract.ts`
- Test: `supabase/functions/extract-capture/lib/extract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildExtractPrompt, parseExtractResponse } from './extract'

describe('buildExtractPrompt', () => {
  it('includes the body and asks for strict JSON', () => {
    const p = buildExtractPrompt('Eleanor party Sat 2pm, RSVP to mom', 'whatsapp:3B Parents')
    expect(p).toContain('Eleanor party Sat 2pm')
    expect(p).toContain('whatsapp:3B Parents')
    expect(p).toContain('strict JSON')
  })
})

describe('parseExtractResponse', () => {
  it('parses a well-formed result', () => {
    const raw = JSON.stringify({
      candidates: [{ category: 'event', title: "Eleanor's birthday", startTime: '2026-06-06T14:00:00',
        location: '123 Main St', rsvp: { needed: true, to: 'mom' }, giftsExpected: 'books',
        cost: null, forWho: 'Ella', confidence: 0.9 }],
      summary: 'Mostly logistics chatter.',
      gaps: [],
    })
    const r = parseExtractResponse(raw)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].title).toBe("Eleanor's birthday")
    expect(r.summary).toBe('Mostly logistics chatter.')
  })

  it('strips code fences', () => {
    const r = parseExtractResponse('```json\n{"candidates":[],"summary":"none","gaps":[]}\n```')
    expect(r.candidates).toEqual([])
    expect(r.summary).toBe('none')
  })

  it('returns an empty result on malformed JSON', () => {
    const r = parseExtractResponse('not json')
    expect(r).toEqual({ candidates: [], summary: '', gaps: [] })
  })

  it('drops candidates missing required fields', () => {
    const raw = JSON.stringify({ candidates: [{ title: 'no category' }, { category: 'task', title: 'ok', confidence: 0.5 }], summary: 's', gaps: [] })
    const r = parseExtractResponse(raw)
    expect(r.candidates.map((c) => c.title)).toEqual(['ok'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/extract-capture/lib/extract.test.ts`
Expected: FAIL — "Failed to resolve import './extract'".

- [ ] **Step 3: Write minimal implementation**

```ts
export type CandidateCategory = 'event' | 'activity' | 'task' | 'errand' | 'chore'

export interface CandidateItem {
  category: CandidateCategory
  title: string
  startTime?: string
  isAllDay?: boolean
  location?: string
  rsvp?: { needed: boolean; by?: string; to?: string; method?: string }
  giftsExpected?: string | null
  cost?: string | null
  forWho?: string
  confidence: number
}

export interface GapFlag {
  kind: 'unreadable_attachment' | 'truncated' | 'partial_thread' | 'low_confidence'
  note: string
}

export interface ExtractionResult {
  candidates: CandidateItem[]
  summary: string
  gaps: GapFlag[]
}

const CATEGORIES: CandidateCategory[] = ['event', 'activity', 'task', 'errand', 'chore']

export function buildExtractPrompt(body: string, sourceLabel: string): string {
  return `You extract family logistics from a noisy message thread or note.

SOURCE: ${sourceLabel}

CONTENT:
${body}

Pull out only the items a busy parent would need to act on: events, activities, tasks, errands, chores. For each, capture what you can find: title, start date-time (ISO 8601 local, omit if unknown), location, RSVP (needed/by/to/method), gifts expected, cost, and who it is for (a child's first name if mentioned). Give a confidence 0-1.

Then write a single-sentence summary of the remaining non-actionable "noise". If anything is unreadable or looks truncated, add a gap flag.

Respond with strict JSON only, no prose, no markdown fence:
{"candidates":[{"category":"event|activity|task|errand|chore","title":"...","startTime":"ISO|omit","isAllDay":false,"location":"...|omit","rsvp":{"needed":true,"by":"...","to":"...","method":"..."}|omit,"giftsExpected":"...|null","cost":"...|null","forWho":"...|omit","confidence":0.0}],"summary":"...","gaps":[{"kind":"unreadable_attachment|truncated|partial_thread|low_confidence","note":"..."}]}`
}

function isCandidate(v: unknown): v is CandidateItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.title === 'string' &&
    typeof o.category === 'string' &&
    (CATEGORIES as string[]).includes(o.category) &&
    typeof o.confidence === 'number'
  )
}

function isGap(v: unknown): v is GapFlag {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.kind === 'string' && typeof o.note === 'string'
}

const EMPTY: ExtractionResult = { candidates: [], summary: '', gaps: [] }

export function parseExtractResponse(raw: string): ExtractionResult {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ...EMPTY }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  const o = parsed as Record<string, unknown>
  return {
    candidates: Array.isArray(o.candidates) ? o.candidates.filter(isCandidate) : [],
    summary: typeof o.summary === 'string' ? o.summary : '',
    gaps: Array.isArray(o.gaps) ? o.gaps.filter(isGap) : [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/extract-capture/lib/extract.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-capture/lib/extract.ts supabase/functions/extract-capture/lib/extract.test.ts
git commit -m "feat(capture): extraction prompt + response parsing + schema"
```

---

## Task 5: `extract-capture` edge function (orchestrator)

**Files:**
- Create: `supabase/functions/extract-capture/index.ts`

- [ ] **Step 1: Write the orchestrator**

```ts
// EXTRACT-CAPTURE — given a captures row id, loads the raw text, dedupes
// against the source checkpoint, runs Anthropic extraction, writes candidate
// tasks (bucket=inbox, context=family) + a triage note, and advances the
// checkpoint. Auth: shared secret (x-capture-secret), same as capture-to-inbox.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseWhatsAppExport } from './lib/whatsapp.ts'
import { filterSince } from './lib/dedupe.ts'
import { buildExtractPrompt, parseExtractResponse, type CandidateItem } from './lib/extract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}`)
  const data = await res.json()
  const text = (data as { content?: { text?: string }[] })?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

function candidateToTaskRow(c: CandidateItem, userId: string, capture: { id: string; source_key: string | null; source_label: string | null }) {
  const notesLines = [
    c.location ? `Location: ${c.location}` : '',
    c.rsvp?.needed ? `RSVP: ${[c.rsvp.to && `to ${c.rsvp.to}`, c.rsvp.by && `by ${c.rsvp.by}`, c.rsvp.method].filter(Boolean).join(', ')}` : '',
    c.giftsExpected ? `Gifts: ${c.giftsExpected}` : '',
    c.cost ? `Cost: ${c.cost}` : '',
    c.forWho ? `For: ${c.forWho}` : '',
    `Source: ${capture.source_label ?? capture.source_key ?? 'capture'} (confidence ${c.confidence.toFixed(2)})`,
    `Proposed time: ${c.startTime ?? 'unknown'}`,
  ].filter(Boolean)
  return {
    user_id: userId,
    title: c.title,
    bucket: 'inbox',
    context: 'family',
    category: c.category,
    completed: false,
    notes: notesLines.join('\n'),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  const { capture_id } = (await req.json()) as { capture_id?: string }
  if (!capture_id) return json({ error: 'capture_id required' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: capture, error: capErr } = await supabase.from('captures').select('*').eq('id', capture_id).single()
  if (capErr || !capture) return json({ error: 'capture not found' }, 404)

  try {
    // 1. Build the body to extract from (deduped for timestamped sources).
    let body = capture.raw_text ?? ''
    let newestIso: string | null = null
    if (capture.kind === 'whatsapp_export' && capture.source_key) {
      const { data: cp } = await supabase.from('capture_checkpoints')
        .select('last_processed_at').eq('user_id', capture.user_id).eq('source_key', capture.source_key).maybeSingle()
      const lastIso = cp?.last_processed_at ? cp.last_processed_at.replace(' ', 'T').slice(0, 19) : null
      const { fresh, newestIso: n } = filterSince(parseWhatsAppExport(body), lastIso)
      newestIso = n
      body = fresh.map((m) => `[${m.timestamp}] ${m.sender}: ${m.text}`).join('\n')
    }

    // 2. Extract.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const result = body.trim()
      ? parseExtractResponse(await callAnthropic(buildExtractPrompt(body, capture.source_label ?? capture.source_key ?? 'capture'), apiKey))
      : { candidates: [], summary: `Nothing new since ${newestIso ?? 'last run'}.`, gaps: [] }

    // 3. Write candidate tasks.
    if (result.candidates.length > 0) {
      const rows = result.candidates.map((c) => candidateToTaskRow(c, capture.user_id, capture))
      const { error } = await supabase.from('tasks').insert(rows)
      if (error) throw new Error(`task insert failed: ${error.message}`)
    }

    // 4. Write a triage note with the summary + gaps.
    const gapText = result.gaps.length ? '\n\nNeeds another look:\n' + result.gaps.map((g) => `- ${g.note}`).join('\n') : ''
    await supabase.from('notes').insert({
      user_id: capture.user_id,
      title: `Capture: ${capture.source_label ?? capture.source_key ?? 'note'}`,
      content: `${result.summary}${gapText}`,
      source: 'inbox_triage',
    })

    // 5. Advance the checkpoint and close out the capture.
    if (capture.kind === 'whatsapp_export' && capture.source_key && newestIso) {
      await supabase.from('capture_checkpoints').upsert({
        user_id: capture.user_id, source_key: capture.source_key, last_processed_at: newestIso, updated_at: new Date().toISOString(),
      })
    }
    await supabase.from('captures').update({ status: 'extracted' }).eq('id', capture.id)
    return json({ ok: true, candidates: result.candidates.length, gaps: result.gaps.length })
  } catch (e) {
    await supabase.from('captures').update({ status: 'failed', error: String(e) }).eq('id', capture.id)
    return json({ error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Verify it deploys/serves locally**

Run: `supabase functions serve extract-capture --no-verify-jwt`
Expected: serves without a startup/import error (Deno resolves the `./lib/*.ts` imports).

- [ ] **Step 3: Manual end-to-end check**

With the local stack running and a `captures` row seeded (see Task 6), run:
```bash
curl -s -X POST "$LOCAL_FUNCTIONS_URL/extract-capture" \
  -H "x-capture-secret: $CAPTURE_SHARED_SECRET" -H 'content-type: application/json' \
  -d '{"capture_id":"<seeded-id>"}'
```
Expected: `{"ok":true,...}`; a new `tasks` row (bucket=inbox, context=family) and an `inbox_triage` note exist; `captures.status='extracted'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/extract-capture/index.ts
git commit -m "feat(capture): extract-capture orchestrator"
```

---

## Task 6: Extend ingest to create a capture and invoke extraction

**Files:**
- Modify: `supabase/functions/capture-to-inbox/index.ts`

- [ ] **Step 1: Extend the request type and validation**

Update the `CaptureBody` interface and `validateRequest` to accept the new optional fields (keep the existing `title` path working for back-compat):

```ts
interface CaptureBody {
  user_email: string
  title?: string                 // legacy quick-capture path
  kind?: 'text' | 'whatsapp_export'
  text?: string
  source_key?: string
  source_label?: string
}
```

In `validateRequest`, after the `user_email` check, replace the hard `title` requirement with:

```ts
  const isExtract = body.kind === 'text' || body.kind === 'whatsapp_export'
  if (isExtract) {
    if (!body.text || typeof body.text !== 'string' || body.text.trim() === '') {
      return { ok: false, status: 400, error: 'text required for kind=text|whatsapp_export' }
    }
  } else if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return { ok: false, status: 400, error: 'title required' }
  }
  return { ok: true, body: body as CaptureBody }
```

- [ ] **Step 2: Branch the handler — create a capture + invoke extraction**

In `Deno.serve`, after resolving `user_id` from `CAPTURE_USERS`, add before the existing legacy insert:

```ts
  if (validated.body.kind === 'text' || validated.body.kind === 'whatsapp_export') {
    const { data: cap, error: capErr } = await supabase.from('captures').insert({
      user_id, kind: validated.body.kind, source_key: validated.body.source_key ?? null,
      source_label: validated.body.source_label ?? null, raw_text: validated.body.text, status: 'pending',
    }).select('id').single()
    if (capErr || !cap) return jsonResponse({ error: 'failed to create capture' }, 500)

    // Fire-and-forget extraction; failures are recorded on the captures row.
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': expectedSecret },
      body: JSON.stringify({ capture_id: cap.id }),
    }).catch(() => {})
    return jsonResponse({ ok: true, capture_id: cap.id }, 202)
  }
  // ...existing legacy title->inbox-task path continues below unchanged...
```

- [ ] **Step 3: Manual check — text path**

```bash
curl -s -X POST "$LOCAL_FUNCTIONS_URL/capture-to-inbox" \
  -H "x-capture-secret: $CAPTURE_SHARED_SECRET" -H 'content-type: application/json' \
  -d '{"user_email":"smkaufman@gmail.com","kind":"text","text":"Eleanor birthday party Sat June 6 2pm at 123 Main St, RSVP to mom, bring books","source_label":"3B Parents"}'
```
Expected: `202` with `{"ok":true,"capture_id":"..."}`; shortly after, a family inbox task titled like "Eleanor's birthday" and an `inbox_triage` note exist.

- [ ] **Step 4: Manual check — legacy path still works**

```bash
curl -s -X POST "$LOCAL_FUNCTIONS_URL/capture-to-inbox" \
  -H "x-capture-secret: $CAPTURE_SHARED_SECRET" -H 'content-type: application/json' \
  -d '{"user_email":"smkaufman@gmail.com","title":"buy milk"}'
```
Expected: `200`/existing behavior — a plain inbox task "buy milk" (context NULL), no capture row.

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run supabase/functions/extract-capture`
Expected: PASS (whatsapp + dedupe + extract = 12 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/capture-to-inbox/index.ts
git commit -m "feat(capture): ingest text/whatsapp_export and invoke extraction"
```

---

## Self-Review

**Spec coverage (Slice 1 scope):**
- Text + WhatsApp-export inputs → Tasks 2, 4, 5, 6. ✓
- "Since last run" dedupe via per-source checkpoint → Tasks 1, 3, 5. ✓
- Structured candidates (date/time/location/RSVP/gifts/cost/forWho) → Task 4 schema + Task 5 task rows. ✓
- One-line noise summary + gap flags → Task 4 + Task 5 triage note. ✓
- Confirm-before-commit → candidates land as `bucket=inbox` (not timed events); promotion is the later Triage-UX plan. ✓
- Reuse existing auth/LLM patterns → Tasks 5, 6 mirror `capture-to-inbox` + `note-match`. ✓
- Out of scope by design (own later plans): image/vision, triage UI, Apple Share Extension, Hermes/ClassDojo. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `ParsedMessage` (whatsapp.ts) consumed by dedupe.ts and index.ts; `CandidateItem`/`ExtractionResult` (extract.ts) consumed by index.ts; `filterSince`/`parseWhatsAppExport`/`buildExtractPrompt`/`parseExtractResponse` names match across tasks. ✓
