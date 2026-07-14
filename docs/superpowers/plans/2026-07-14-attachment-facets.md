# Attachment Facets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-extract typed, actionable facets (door codes, addresses, checklists…) from image/PDF attachments and render them as a morphing card with one-tap promotion into entity fields.

**Architecture:** New `analyze-attachment` edge function (clone of analyze-capture's auth/vision skeleton) writes a validated closed-vocabulary `facets` jsonb onto the attachments row; `PanelPhotos` auto-triggers it on image/PDF attach and renders a new `AttachmentFacets` component whose per-type renderers offer promotions wired by each panel.

**Tech Stack:** React 19 + TS strict, Vitest/RTL, Supabase (Deno edge fn, Management API for DDL), Anthropic vision (`claude-sonnet-4-6`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-attachment-facets-design.md` — closed facet vocabulary; model never generates UI; failures silent.
- Repo rules: work in `.worktrees/facet-spec`; push to main only when green (`npm run build`, changed-file eslint, `npx vitest run`); no emojis in UI — lucide icons only.
- DDL via Management API (`curl -X POST https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query`, token from keychain: `security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d`); migration file still committed.
- Section styling in surface panels: heading `text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2`; chips `rounded-lg bg-white shadow-[inset_0_0_0_1px_#e5e7eb]`.

---

### Task 1: Migration — facets columns + UPDATE policy

**Files:**
- Create: `supabase/migrations/107_attachment_facets.sql` (check `ls supabase/migrations | tail -1` and use next number)

**Interfaces:**
- Produces: `attachments.facets jsonb`, `attachments.analyzed_at timestamptz`, and an UPDATE RLS policy (the table only has SELECT/INSERT/DELETE — without UPDATE the user-scoped edge-function client cannot write results).

- [ ] **Step 1: Write the migration file**

```sql
-- Attachment facets: typed, validated extraction results from analyze-attachment.
-- null facets = never analyzed; analyzed_at set with facets '[]' = analyzed, nothing found (or failed quietly).
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS facets jsonb;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- 023 defined SELECT/INSERT/DELETE but no UPDATE; analyze-attachment updates rows as the caller.
CREATE POLICY "Users can update own attachments"
  ON attachments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply via Management API**

```bash
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(jq -Rs . < supabase/migrations/107_attachment_facets.sql)}"
```
Expected: `[]` (DDL returns empty). Verify: query `information_schema.columns` for `facets`/`analyzed_at` and `pg_policies` for the UPDATE policy.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/107_attachment_facets.sql
git commit -m "feat(db): attachments.facets + analyzed_at + UPDATE policy"
```

---

### Task 2: Facet types + client-side parser

**Files:**
- Create: `src/types/facets.ts`
- Test: `src/types/facets.test.ts`

**Interfaces:**
- Produces: `type Facet` (discriminated union below) and `parseFacets(raw: unknown): Facet[]` — defensive re-validation used by the renderer so stored junk can never render raw.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { parseFacets } from './facets'

describe('parseFacets', () => {
  it('accepts every vocabulary type', () => {
    const raw = [
      { type: 'summary', text: 'Airbnb confirmation for Kennebunkport' },
      { type: 'location', label: 'The house', address: '4 Beach Ave, Kennebunkport ME' },
      { type: 'access_code', label: 'Door code', code: '4482#' },
      { type: 'phone', number: '+1 207 555 0101' },
      { type: 'datetime', label: 'Check-in', iso: '2026-07-18T16:00:00' },
      { type: 'link', url: 'https://airbnb.com/trips/x' },
      { type: 'checklist', items: ['RSVP by Friday', 'Bring a gift'] },
      { type: 'purchase_item', name: 'T8 bulb', specs: '18W 4-pin' },
    ]
    expect(parseFacets(raw)).toHaveLength(8)
  })
  it('drops unknown types, malformed entries, and non-arrays', () => {
    expect(parseFacets([{ type: 'evil_html', html: '<script>' }, { type: 'location' }, 'x', null])).toEqual([])
    expect(parseFacets('not an array')).toEqual([])
    expect(parseFacets(null)).toEqual([])
  })
  it('drops empty strings and empty checklists, trims values', () => {
    expect(parseFacets([{ type: 'access_code', label: 'Door', code: '  ' }])).toEqual([])
    expect(parseFacets([{ type: 'checklist', items: [] }])).toEqual([])
    expect(parseFacets([{ type: 'summary', text: '  hi  ' }])).toEqual([{ type: 'summary', text: 'hi' }])
  })
  it('caps at 12 facets and 20 checklist items', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ type: 'summary', text: `s${i}` }))
    expect(parseFacets(many)).toHaveLength(12)
    const items = Array.from({ length: 30 }, (_, i) => `item ${i}`)
    const [cl] = parseFacets([{ type: 'checklist', items }]) as [{ type: 'checklist'; items: string[] }]
    expect(cl.items).toHaveLength(20)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/types/facets.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** Closed vocabulary of typed facts extracted from an attachment
 *  (docs/superpowers/specs/2026-07-14-attachment-facets-design.md).
 *  The model proposes; this parser disposes — nothing renders unvalidated. */
export type Facet =
  | { type: 'summary'; text: string }
  | { type: 'location'; label?: string; address: string }
  | { type: 'access_code'; label: string; code: string }
  | { type: 'phone'; label?: string; number: string }
  | { type: 'datetime'; label: string; iso: string }
  | { type: 'link'; label?: string; url: string }
  | { type: 'checklist'; label?: string; items: string[] }
  | { type: 'purchase_item'; name: string; specs: string }

const MAX_FACETS = 12
const MAX_ITEMS = 20

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseOne(raw: unknown): Facet | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const label = str(f.label) ?? undefined
  switch (f.type) {
    case 'summary': { const text = str(f.text); return text ? { type: 'summary', text } : null }
    case 'location': { const address = str(f.address); return address ? { type: 'location', label, address } : null }
    case 'access_code': { const code = str(f.code); return code ? { type: 'access_code', label: label ?? 'Code', code } : null }
    case 'phone': { const number = str(f.number); return number ? { type: 'phone', label, number } : null }
    case 'datetime': { const iso = str(f.iso); return iso && label ? { type: 'datetime', label, iso } : null }
    case 'link': { const url = str(f.url); return url && /^https?:\/\//.test(url) ? { type: 'link', label, url } : null }
    case 'checklist': {
      const items = Array.isArray(f.items) ? f.items.map(str).filter((s): s is string => !!s).slice(0, MAX_ITEMS) : []
      return items.length ? { type: 'checklist', label, items } : null
    }
    case 'purchase_item': { const name = str(f.name); const specs = str(f.specs); return name && specs ? { type: 'purchase_item', name, specs } : null }
    default: return null
  }
}

export function parseFacets(raw: unknown): Facet[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseOne).filter((f): f is Facet => f !== null).slice(0, MAX_FACETS)
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/types/facets.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/types/facets.ts src/types/facets.test.ts && git commit -m "feat(facets): typed facet vocabulary + defensive parser"`

---

### Task 3: Edge function `analyze-attachment` + deploy

**Files:**
- Create: `supabase/functions/analyze-attachment/index.ts`

**Interfaces:**
- Consumes: `attachments` row (`storage_path`, `file_type`, `analyzed_at`), Task 1 columns/policy.
- Produces: POST `{ attachmentId: string, entityContext?: string }` with user JWT → analyzes and writes `facets` + `analyzed_at`; responses `{ status: 'done' | 'skipped' | 'already' }`. Client wrapper comes in Task 4.

- [ ] **Step 1: Write the function**

```ts
// ANALYZE-ATTACHMENT — given an attachments row (image or PDF), runs Claude
// vision and writes a validated, closed-vocabulary facet list onto the row
// (spec: docs/superpowers/specs/2026-07-14-attachment-facets-design.md).
// Idempotent: analyzed_at set → no-op. Failures write facets [] + analyzed_at
// after one retry so the panel quietly shows nothing. Auth: user JWT; row
// reads/writes go through the caller-scoped client so RLS enforces ownership.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'
const MAX_FACETS = 12
const MAX_ITEMS = 20
const MAX_CONTEXT = 300

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

function buildPrompt(entityContext: string): string {
  return `You extract actionable facts from a file the user attached to an item in Symphony, their personal task/calendar app.
Attached to: ${entityContext || '(no context)'}

Respond with ONLY a JSON object (no markdown fences, no prose): {"facets":[...]}. Each facet is one of:
{"type":"summary","text":"one sentence: what this file is"}
{"type":"location","label":"Party address","address":"full address, complete enough to navigate to"}
{"type":"access_code","label":"Door code","code":"exactly as printed"}
{"type":"phone","label":"Host","number":"+1 ..."}
{"type":"datetime","label":"Check-in","iso":"2026-07-18T16:00:00"}
{"type":"link","label":"Registry","url":"https://..."}
{"type":"checklist","label":"To do","items":["RSVP by Friday","Bring a bathing suit"]}
{"type":"purchase_item","name":"item to buy","specs":"size, model, wattage — everything visible or inferable"}

Rules:
- Exactly one summary, first.
- Only facets plainly supported by the file — never invent or pad.
- Prefer fewer, higher-value facets; skip trivia.
- datetime iso is the file's local time; no timezone guessing.
- A photo of a broken/burned-out part or product → purchase_item with buy-ready specs.
- A document/screenshot → transcribe the load-bearing facts into typed facets, not prose.`
}

// Same validation as src/types/facets.ts parseFacets — duplicated because edge
// functions can't import from src/. Keep the two in sync.
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function parseOne(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const label = str(f.label) ?? undefined
  switch (f.type) {
    case 'summary': { const text = str(f.text); return text ? { type: 'summary', text } : null }
    case 'location': { const address = str(f.address); return address ? { type: 'location', label, address } : null }
    case 'access_code': { const code = str(f.code); return code ? { type: 'access_code', label: label ?? 'Code', code } : null }
    case 'phone': { const number = str(f.number); return number ? { type: 'phone', label, number } : null }
    case 'datetime': { const iso = str(f.iso); return iso && label ? { type: 'datetime', label, iso } : null }
    case 'link': { const url = str(f.url); return url && /^https?:\/\//.test(url) ? { type: 'link', label, url } : null }
    case 'checklist': {
      const items = Array.isArray(f.items) ? f.items.map(str).filter((s): s is string => !!s).slice(0, MAX_ITEMS) : []
      return items.length ? { type: 'checklist', label, items } : null
    }
    case 'purchase_item': { const name = str(f.name); const specs = str(f.specs); return name && specs ? { type: 'purchase_item', name, specs } : null }
    default: return null
  }
}
function parseFacets(text: string): Record<string, unknown>[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { facets?: unknown }
  if (!Array.isArray(parsed.facets)) throw new Error('No facets array')
  return parsed.facets.map(parseOne).filter((f): f is Record<string, unknown> => f !== null).slice(0, MAX_FACETS)
}

async function callVision(fileUrl: string, isPdf: boolean, prompt: string, apiKey: string): Promise<string> {
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !serviceKey) return json({ error: 'Missing server config' }, 500)

  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(authHeader.slice('Bearer '.length))
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })

  let body: { attachmentId?: string; entityContext?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const { attachmentId } = body
  if (!attachmentId) return json({ error: 'attachmentId required' }, 400)
  const entityContext = (body.entityContext ?? '').slice(0, MAX_CONTEXT)

  const { data: row, error: rowErr } = await db
    .from('attachments')
    .select('id, storage_path, file_type, analyzed_at')
    .eq('id', attachmentId)
    .maybeSingle()
  if (rowErr) return json({ error: `Attachment lookup failed: ${rowErr.message}` }, 500)
  if (!row) return json({ error: 'Attachment not found' }, 404)
  if (row.analyzed_at) return json({ status: 'already' })

  const isImage = row.file_type?.startsWith('image/')
  const isPdf = row.file_type === 'application/pdf'
  const finish = async (facets: unknown[]) => {
    const { error } = await db.from('attachments')
      .update({ facets, analyzed_at: new Date().toISOString() })
      .eq('id', attachmentId)
    if (error) console.error('facets write failed:', error.message)
  }
  if (!isImage && !isPdf) { await finish([]); return json({ status: 'skipped' }) }

  const { data: signed, error: signErr } = await service.storage
    .from('attachments')
    .createSignedUrl(row.storage_path, 600)
  if (signErr || !signed?.signedUrl) return json({ error: `Could not sign URL: ${signErr?.message}` }, 500)

  const prompt = buildPrompt(entityContext)
  let facets: Record<string, unknown>[] = []
  try {
    facets = parseFacets(await callVision(signed.signedUrl, isPdf, prompt, apiKey))
  } catch (err) {
    console.error('first analysis attempt failed, retrying once:', err instanceof Error ? err.message : err)
    try {
      facets = parseFacets(await callVision(signed.signedUrl, isPdf, prompt, apiKey))
    } catch (err2) {
      console.error('analysis failed after retry:', err2 instanceof Error ? err2.message : err2)
    }
  }
  await finish(facets)
  return json({ status: 'done', facetCount: facets.length })
})
```

- [ ] **Step 2: Deploy**

```bash
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d) \
  npx supabase functions deploy analyze-attachment --project-ref mwadppyrqzuzgstmwpuy
```
Expected: "Deployed Function analyze-attachment". (ANTHROPIC_API_KEY is already set project-wide for analyze-capture.)

- [ ] **Step 3: Smoke-test against a real row** — pick any existing image attachment id (`select id from attachments where file_type like 'image/%' and analyzed_at is null limit 1` via Management API; if none, defer to Task 6's end-to-end pass) and invoke with a real user JWT is impractical from curl — instead verify deploy health: `curl -sS -X POST https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/analyze-attachment -H 'Content-Type: application/json' -d '{}'` → expect `{"error":"Missing Authorization"}` (proves the function is live and parsing).
- [ ] **Step 4: Commit** — `git add supabase/functions/analyze-attachment && git commit -m "feat(facets): analyze-attachment edge function — vision → typed facets"`

---

### Task 4: Client lib — facets on Attachment, id from attachFile, invoke wrapper

**Files:**
- Modify: `src/lib/taskAttachments.ts`
- Test: extend `src/components/surface/sections/PanelPhotos.test.tsx` mocks only if signatures change (they do — see Task 6); lib itself is exercised through PanelPhotos tests.

**Interfaces:**
- Consumes: Task 2 `Facet`/`parseFacets`; Task 3 endpoint.
- Produces:
  - `interface Attachment { id; fileName; fileType; url; facets: Facet[]; analyzedAt: string | null }`
  - `attachFile(...): Promise<{ id: string; contentType: string } | null>` (was boolean — null = failure)
  - `analyzeAttachment(attachmentId: string, entityContext?: string): Promise<boolean>`

- [ ] **Step 1: Modify the lib**

In `listAttachments`: select the new columns and parse defensively.

```ts
import { parseFacets, type Facet } from '@/types/facets'

export interface Attachment {
  id: string
  fileName: string
  fileType: string
  url: string
  facets: Facet[]
  analyzedAt: string | null
}
```

```ts
  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, file_name, file_type, storage_path, facets, analyzed_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
  if (error || !rows) return []

  const attachments: Attachment[] = []
  for (const row of rows) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.storage_path, 3600)
    if (data?.signedUrl) {
      attachments.push({
        id: row.id,
        fileName: row.file_name,
        fileType: row.file_type,
        url: data.signedUrl,
        facets: parseFacets(row.facets),
        analyzedAt: row.analyzed_at ?? null,
      })
    }
  }
  return attachments
```

In `attachFile`: return the inserted id + contentType instead of boolean.

```ts
    const { data: inserted, error: insertErr } = await supabase.from('attachments').insert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      file_name: fileName || `attachment.${extension}`,
      file_type: contentType,
      file_size: upload.size,
      storage_path: storagePath,
    }).select('id').single()
    if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Insert returned nothing')
    return { id: inserted.id as string, contentType }
  } catch (err) {
    console.error('attachFile failed:', err)
    return null
  }
```

Append the wrapper:

```ts
/** Fire the vision extraction for an attachment (image/PDF). Fire-and-forget
 *  friendly: returns false on any error; the attachment stands on its own. */
export async function analyzeAttachment(attachmentId: string, entityContext?: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('analyze-attachment', {
      body: { attachmentId, entityContext },
    })
    return !error
  } catch (err) {
    console.error('analyzeAttachment failed:', err)
    return false
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → PanelPhotos errors expected (attachFile truthiness now always-true object/null — fixed in Task 6). If only PanelPhotos call-site errors appear, proceed; commit lands with Task 6 if tsc blocks, otherwise commit now:
- [ ] **Step 3: Commit (with Task 6 if tsc red)** — `git add src/lib/taskAttachments.ts && git commit -m "feat(facets): attachment facets in lib — id-returning attachFile + analyze wrapper"`

---

### Task 5: `AttachmentFacets` renderer

**Files:**
- Create: `src/components/surface/sections/AttachmentFacets.tsx`
- Test: `src/components/surface/sections/AttachmentFacets.test.tsx`

**Interfaces:**
- Consumes: `Facet` from Task 2.
- Produces:
  ```ts
  export interface FacetPromotions {
    onUseLocation?: (address: string) => void   // event/task location
    onAddPrepTask?: (title: string) => void     // prep task / subtask
    onAddLink?: (url: string) => void
    onSetPhone?: (number: string) => void       // task phoneNumber
  }
  export function AttachmentFacets({ facets, promotions }: { facets: Facet[]; promotions?: FacetPromotions })
  ```
  Renders null when `facets` is empty. Promotion buttons render only when their handler exists.

- [ ] **Step 1: Write failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AttachmentFacets } from './AttachmentFacets'
import type { Facet } from '@/types/facets'

const all: Facet[] = [
  { type: 'summary', text: 'Airbnb confirmation' },
  { type: 'location', label: 'The house', address: '4 Beach Ave, Kennebunkport ME' },
  { type: 'access_code', label: 'Door code', code: '4482#' },
  { type: 'phone', label: 'Host', number: '+1 207 555 0101' },
  { type: 'datetime', label: 'Check-in', iso: '2026-07-18T16:00:00' },
  { type: 'link', label: 'Trip page', url: 'https://airbnb.com/trips/x' },
  { type: 'checklist', label: 'Before you go', items: ['Bring towels'] },
  { type: 'purchase_item', name: 'T8 bulb', specs: '18W 4-pin' },
]

describe('AttachmentFacets', () => {
  it('renders nothing for empty facets', () => {
    const { container } = render(<AttachmentFacets facets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders every facet type', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.getByText('Airbnb confirmation')).toBeInTheDocument()
    expect(screen.getByText('4 Beach Ave, Kennebunkport ME')).toBeInTheDocument()
    expect(screen.getByText('4482#')).toBeInTheDocument()
    expect(screen.getByText('+1 207 555 0101')).toBeInTheDocument()
    expect(screen.getByText(/Check-in/)).toBeInTheDocument()
    expect(screen.getByText('Trip page')).toBeInTheDocument()
    expect(screen.getByText('Bring towels')).toBeInTheDocument()
    expect(screen.getByText(/T8 bulb/)).toBeInTheDocument()
  })

  it('location gets a maps href; phone gets tel:; link gets its url', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.getByRole('link', { name: /4 Beach Ave/ }).getAttribute('href')).toContain('maps')
    expect(screen.getByRole('link', { name: /555 0101/ })).toHaveAttribute('href', 'tel:+1 207 555 0101')
    expect(screen.getByRole('link', { name: 'Trip page' })).toHaveAttribute('href', 'https://airbnb.com/trips/x')
  })

  it('copies an access code', async () => {
    const { user } = render(<AttachmentFacets facets={[all[2]]} />)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('4482#')
  })

  it('offers promotions only when handlers exist, and calls them', async () => {
    const onUseLocation = vi.fn(); const onAddPrepTask = vi.fn(); const onAddLink = vi.fn(); const onSetPhone = vi.fn()
    const { user } = render(<AttachmentFacets facets={all} promotions={{ onUseLocation, onAddPrepTask, onAddLink, onSetPhone }} />)
    await user.click(screen.getByRole('button', { name: 'Use as location' }))
    expect(onUseLocation).toHaveBeenCalledWith('4 Beach Ave, Kennebunkport ME')
    await user.click(screen.getByRole('button', { name: 'Add "Bring towels" as prep task' }))
    expect(onAddPrepTask).toHaveBeenCalledWith('Bring towels')
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    expect(onAddLink).toHaveBeenCalledWith('https://airbnb.com/trips/x')
    await user.click(screen.getByRole('button', { name: 'Save phone number' }))
    expect(onSetPhone).toHaveBeenCalledWith('+1 207 555 0101')
  })

  it('renders no promotion buttons without handlers', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.queryByRole('button', { name: 'Use as location' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save link' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/surface/sections/AttachmentFacets.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react'
import { Check, Copy, KeyRound, Link2, MapPin, Phone, Plus, ShoppingBag, CalendarClock, ListChecks } from 'lucide-react'
import type { Facet } from '@/types/facets'

export interface FacetPromotions {
  onUseLocation?: (address: string) => void
  onAddPrepTask?: (title: string) => void
  onAddLink?: (url: string) => void
  onSetPhone?: (number: string) => void
}

const chip = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white shadow-[inset_0_0_0_1px_#e5e7eb] text-sm text-neutral-700'
const promoteBtn = 'text-[11px] text-primary-600 hover:text-primary-700 font-medium'

function fmtDatetime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${code}`}
      onClick={() => { void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-600"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary-600" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
    </button>
  )
}

/** The morphing artifact: one deterministic renderer per facet type
 *  (spec: 2026-07-14-attachment-facets-design.md). Model output never
 *  reaches here unvalidated — parseFacets is the gate. */
export function AttachmentFacets({ facets, promotions }: { facets: Facet[]; promotions?: FacetPromotions }) {
  if (facets.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 w-full">
      {facets.map((f, i) => {
        switch (f.type) {
          case 'summary':
            return <p key={i} className="text-[12px] text-neutral-500 italic">{f.text}</p>
          case 'location':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`} target="_blank" rel="noopener noreferrer" className={chip}>
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span>{f.label ? `${f.label}: ` : ''}{f.address}</span>
                </a>
                {promotions?.onUseLocation && (
                  <button type="button" className={promoteBtn} onClick={() => promotions.onUseLocation!(f.address)}>Use as location</button>
                )}
              </div>
            )
          case 'access_code':
            return (
              <div key={i} className={chip}>
                <KeyRound className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                <span className="text-neutral-500">{f.label}:</span>
                <span className="font-mono font-semibold text-[15px] tracking-wide">{f.code}</span>
                <CopyCode code={f.code} />
              </div>
            )
          case 'phone':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a href={`tel:${f.number}`} className={chip}>
                  <Phone className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span>{f.label ? `${f.label}: ` : ''}{f.number}</span>
                </a>
                {promotions?.onSetPhone && (
                  <button type="button" aria-label="Save phone number" className={promoteBtn} onClick={() => promotions.onSetPhone!(f.number)}>Save phone number</button>
                )}
              </div>
            )
          case 'datetime':
            return (
              <div key={i} className={chip}>
                <CalendarClock className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                <span>{f.label}: {fmtDatetime(f.iso)}</span>
              </div>
            )
          case 'link':
            return (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className={chip}>
                  <Link2 className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                  <span className="truncate max-w-[16rem]">{f.label ?? f.url}</span>
                </a>
                {promotions?.onAddLink && (
                  <button type="button" aria-label="Save link" className={promoteBtn} onClick={() => promotions.onAddLink!(f.url)}>Save link</button>
                )}
              </div>
            )
          case 'checklist':
            return (
              <div key={i} className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
                  <ListChecks className="w-3.5 h-3.5" aria-hidden />{f.label ?? 'Checklist'}
                </span>
                {f.items.map((item) => (
                  <div key={item} className="flex items-center gap-2 pl-5">
                    <span className="text-sm text-neutral-700">{item}</span>
                    {promotions?.onAddPrepTask && (
                      <button type="button" aria-label={`Add "${item}" as prep task`} className={promoteBtn} onClick={() => promotions.onAddPrepTask!(item)}>
                        <Plus className="w-3 h-3 inline" aria-hidden /> prep task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          case 'purchase_item':
            return (
              <div key={i} className={`${chip} items-start`}>
                <ShoppingBag className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" aria-hidden />
                <span><span className="font-medium">{f.name}</span> — {f.specs}</span>
              </div>
            )
        }
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/components/surface/sections/AttachmentFacets.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `git add src/components/surface/sections/AttachmentFacets.* && git commit -m "feat(facets): AttachmentFacets morphing renderer + promotions"`

---

### Task 6: PanelPhotos wiring + panel call sites

**Files:**
- Modify: `src/components/surface/sections/PanelPhotos.tsx`
- Modify: `src/components/surface/TapEventPanel.tsx` (PanelPhotos call site)
- Modify: `src/components/surface/TapContextPanel.tsx` (PanelPhotos call site)
- Test: `src/components/surface/sections/PanelPhotos.test.tsx`

**Interfaces:**
- Consumes: Task 4 `attachFile` (id-returning), `analyzeAttachment`, `Attachment.facets`; Task 5 `AttachmentFacets`/`FacetPromotions`.
- Produces: `PanelPhotosProps` gains `entityContext?: string` and `promotions?: FacetPromotions`.

- [ ] **Step 1: Update PanelPhotos test mocks and add failing tests**

Update the module mock (attachFile now returns `{ id, contentType }`) and add:

```tsx
const analyzeAttachment = vi.fn()
// in vi.mock factory: analyzeAttachment: (...args: unknown[]) => analyzeAttachment(...args),
// beforeEach: attachFile.mockReset().mockResolvedValue({ id: 'att-1', contentType: 'image/jpeg' })
//             analyzeAttachment.mockReset().mockResolvedValue(true)

  it('auto-analyzes an attached image with the entity context', async () => {
    const { container } = render(
      <PanelPhotos entityType="event_note" entityId="e1" entityContext="Birthday party — Sat 2pm" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'invite.png', { type: 'image/png' })
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(analyzeAttachment).toHaveBeenCalledWith('att-1', 'Birthday party — Sat 2pm'))
  })

  it('does not analyze a csv attachment', async () => {
    attachFile.mockResolvedValue({ id: 'att-2', contentType: 'text/csv' })
    const { container } = render(<PanelPhotos entityType="task" entityId="t1" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await waitFor(() => expect(listAttachments).toHaveBeenCalled())
    Object.defineProperty(input, 'files', { value: [new File(['a,b'], 'data.csv', { type: 'text/csv' })] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(attachFile).toHaveBeenCalled())
    expect(analyzeAttachment).not.toHaveBeenCalled()
  })

  it('renders facets under an attachment', async () => {
    listAttachments.mockResolvedValue([{
      id: 'a1', fileName: 'x.jpg', fileType: 'image/jpeg', url: 'https://signed/x.jpg',
      facets: [{ type: 'access_code', label: 'Door code', code: '4482#' }], analyzedAt: '2026-07-14T00:00:00Z',
    }])
    render(<PanelPhotos entityType="event_note" entityId="e1" />)
    await waitFor(() => expect(screen.getByText('4482#')).toBeInTheDocument())
  })
```

Existing `listAttachments` mock rows need `facets: [], analyzedAt: null` added.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/surface/sections/PanelPhotos.test.tsx` → new tests FAIL.

- [ ] **Step 3: Implement in PanelPhotos**

Props: add `entityContext?: string; promotions?: FacetPromotions`. In `attach`:

```ts
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())

  const attach = useCallback(async (blob: Blob, fileName?: string) => {
    setBusy(true)
    try {
      const result = await attachFile(entityType, entityId, blob, fileName)
      if (!result) { flashNotice("Couldn't attach that file"); return }
      await reload()
      if (result.contentType.startsWith('image/') || result.contentType === 'application/pdf') {
        setAnalyzingIds((prev) => new Set(prev).add(result.id))
        void analyzeAttachment(result.id, entityContext).then(async () => {
          await reload()
          setAnalyzingIds((prev) => { const next = new Set(prev); next.delete(result.id); return next })
        })
      }
    } finally {
      setBusy(false)
    }
  }, [entityType, entityId, entityContext, reload, flashNotice])
```

Rendering: images keep the thumbnail grid; below the grid (and below the doc-chip row) render, per attachment with facets or in-flight analysis:

```tsx
      {attachments.map((att) => (
        <div key={`facets-${att.id}`}>
          {analyzingIds.has(att.id) && !att.analyzedAt && (
            <p className="text-[11px] text-neutral-400 mt-1.5 animate-pulse">Reading {att.fileName}…</p>
          )}
          <AttachmentFacets facets={att.facets} promotions={promotions} />
        </div>
      ))}
```

- [ ] **Step 4: Wire the panels**

`TapEventPanel.tsx` (has `eventId`, `startTime`, `event.location`, and handlers already in scope):

```tsx
      <PanelPhotos
        entityType="event_note"
        entityId={eventId}
        entityContext={[event.title, startTime && new Date(startTime).toLocaleString(), event.location].filter(Boolean).join(' — ')}
        promotions={{
          onAddPrepTask: props.onAddPrepTask,
          onAddLink: props.onAddLink,
          onUseLocation: props.onUpdateEventLocation && canEdit
            ? (address) => props.onUpdateEventLocation!(eventId, address, calendarId)
            : undefined,
        }}
      />
```

`TapContextPanel.tsx`:

```tsx
      <PanelPhotos
        entityType="task"
        entityId={task.id}
        entityContext={[task.title, task.notes?.split('\n')[0]].filter(Boolean).join(' — ')}
        promotions={{
          onAddPrepTask: props.onAddSubtask,
          onAddLink: props.onAddLink,
          onUseLocation: (address) => props.onUpdateLocation(address),
        }}
      />
```

(No `onSetPhone` in v1 wiring unless `TapContextPanel` exposes a phone updater — check props; if `onContextChange`-style phone handler is absent, leave it off. The facet still renders as tap-to-call.)

- [ ] **Step 5: Run the full surface suite** — `npx vitest run src/components/surface` → PASS. Then `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit** — `git add -u && git commit -m "feat(facets): auto-analyze on attach + facet rendering with promotions in panels"`

---

### Task 7: Ship + end-to-end verification on prod

**Files:** none new.

- [ ] **Step 1: Full gate** — `npm run build`, `npx eslint <changed files>`, `npx vitest run` → all green.
- [ ] **Step 2: Rebase + push** — `git fetch origin && git rebase origin/main && git push origin HEAD:main`; confirm deployment for the new sha reaches `success` via `gh api repos/scottring/symphonyOS/deployments`.
- [ ] **Step 3: End-to-end on prod (browser)** — render a synthetic party-invite (HTML page with address, date, "RSVP to 555-0101", "bring a bathing suit") in a tab, screenshot to disk, attach it to a scratch task via the file picker, wait for "Reading…" to clear, verify: summary line, location chip with maps href, datetime chip, checklist with "+ prep task", phone chip. Then promote one checklist item and confirm the prep task appears. Delete the scratch attachment + task afterwards (✕ affordance + task delete).
- [ ] **Step 4: Memory + worktree cleanup** — update MEMORY.md attachments line with facets summary; `git worktree remove .worktrees/facet-spec`.
