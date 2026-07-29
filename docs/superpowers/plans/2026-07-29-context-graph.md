# Context Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the retrieval layer hardcoded inside `proactive-engine` into a shared `assembleContext` module, widen it to read vault notes / lineage / facets / history, and surface the result on four UI surfaces — so any task or event arrives with its full context already assembled.

**Architecture:** A shared Deno module `supabase/functions/_shared/context-graph/` exposes `assembleContext(deps, ref) → ContextBundle` — typed data, never prose. Pure builders (bounding, ranking, prompt rendering) are separated from the DB fetch layer so they get real vitest coverage. `proactive-engine` and `symphony-agent` become the first two consumers. A client hook + `ContextChips` component put suggestions and last-action facts on the detail panel, project view, and overdue section. A pg_cron job warms suggestions each morning.

**Tech Stack:** Supabase Edge Functions (Deno), Postgres (pgvector, pg_cron, pg_net), React 19 + TS strict, vitest (which already runs `supabase/functions/**/*.test.ts`), Anthropic Haiku (`claude-haiku-4-5-20251001` — do not change; see billing memory), OpenAI `text-embedding-3-small` for query embeddings.

**Spec:** `docs/superpowers/specs/2026-07-29-symphony-as-assistant-design.md` (sections 1–3 approved). Spec sections 4 (degradation), 5 (cost), and 9 (testing) are folded into tasks here rather than separately specced.

## Global Constraints

- Work happens in the worktree `.worktrees/assistant-direction`, branch `assistant-direction`. NEVER edit or commit in the main worktree. Do not push to `main` (it auto-deploys prod); push the branch.
- Run tests with `npx vitest run <path>` — plain `npm test` is watch mode and will hang an agent.
- Node: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` if node is missing.
- No emojis anywhere in UI — lucide icons only (`ConceptIcon` or direct lucide imports).
- NEVER partial-`upsert` a row in `tasks` — Postgres checks NOT NULL before the ON CONFLICT arbiter (23502). Use `.update().eq()`.
- Deno edge code imports local files with explicit `.ts` extensions (`from './lib/x.ts'`); test files import without extension (`from './x'`). Both patterns coexist today (see `supabase/functions/extract-capture/`). `tsconfig.app.json` includes only `src/`, so edge `.ts`-extension imports never break `tsc --noEmit`.
- Every DB query in the shared module MUST filter `.eq('user_id', ref.userId)` — consumers use service-role clients that bypass RLS.
- Model for the engine's LLM pass stays `claude-haiku-4-5-20251001` on `ANTHROPIC_API_KEY` (the "symphony-supabase" key). Do not upgrade the model or raise `max_tokens` above 2048.
- Cost bound (spec §5 folded in): AI pass caps at 8 task bundles + 5 events; embeddings only for those 8 tasks (≤8 calls of `text-embedding-3-small` per engine run ≈ $0.0001). Engine cadence stays 6h client-claimed + 1 cron warm/day.
- Edge function deploys: `npx supabase functions deploy <name> --project-ref mwadppyrqzuzgstmwpuy --use-api`.
- Migrations are OUT OF SYNC with prod — do NOT `supabase db push`. Apply DDL via Management API `POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query` (token from macOS keychain per memory `reference_supabase_management_token`; disk token is stale) or paste into the Supabase dashboard SQL editor. Still commit the migration files.
- Commit after every task. Commit messages end with the session trailer (see repo convention in recent `git log`).

## File Structure

```
supabase/functions/_shared/                      (NEW dir — underscore prefix = not deployed as a function)
  facets.ts                                      canonical edge-side facet validator (moved from analyze-attachment's inline twin)
  facets.test.ts
  context-graph/
    types.ts                                     ContextBundle + part types + bounds constants
    build.ts                                     pure: facetsToFacts, boundKnowledge, buildTime, renderBundleForPrompt
    build.test.ts
    assemble.ts                                  assembleContext(deps, ref) — DB fetch layer, degraded-part tracking
    assemble.test.ts                             stub-client tests
supabase/functions/proactive-engine/
  lib/facetRules.ts                              pure rule: facts → suggestions
  lib/facetRules.test.ts
  index.ts                                       MODIFY: facet rules, bundle-fed AI pass, service-mode auth, drop Open Brain
supabase/functions/analyze-attachment/index.ts   MODIFY: delete inline parseFacets, import _shared/facets.ts
supabase/functions/symphony-agent/index.ts       MODIFY: taskContext → assembleContext injection
supabase/migrations/2026-07-29_semantic_search_service.sql   (NEW) service-role semantic RPC
supabase/migrations/2026-07-29_proactive_engine_cron.sql     (NEW) pg_cron morning warm
src/hooks/useEntityContext.ts                    (NEW) suggestions + last action for one entity
src/hooks/useEntityContext.test.ts
src/components/context/ContextChips.tsx          (NEW) suggestions chips + last-action line
src/components/context/ContextChips.test.tsx
src/components/surface/sections/PanelAssistant.tsx      (NEW) detail-panel section hosting ContextChips
src/components/surface/sections/PanelAssistant.test.tsx
src/components/surface/TapContextPanel.tsx       MODIFY: render PanelAssistant
src/components/project/ProjectViewRedesign.tsx   MODIFY: per-task top-1 suggestion chips
src/components/schedule/OverdueSection.tsx       MODIFY: actually render the chips its props already carry
```

---

### Task 1: Shared facet validator (`_shared/facets.ts`)

The facet parser currently exists twice: `src/types/facets.ts` (client) and an inline twin in `supabase/functions/analyze-attachment/index.ts:69`. The context graph needs it server-side too — a third copy would be a maintenance bug. Move the edge-side copy to `_shared` and make analyze-attachment import it, reducing three copies to the original two-sided twin.

**Files:**
- Create: `supabase/functions/_shared/facets.ts`
- Create: `supabase/functions/_shared/facets.test.ts`
- Modify: `supabase/functions/analyze-attachment/index.ts` (delete inline `parseFacets` around line 45–69, import instead)

**Interfaces:**
- Produces: `export type Facet = ...` (union identical to `src/types/facets.ts`) and `export function parseFacets(raw: unknown): Facet[]` — accepts an already-JSON-parsed value OR a string (parse it), returns validated facets, max 12.
- Consumed by: Task 2 (`build.ts` imports `Facet`, `parseFacets` from `../facets.ts`), analyze-attachment.

- [ ] **Step 1: Read both existing validators**

Read `src/types/facets.ts` fully and `supabase/functions/analyze-attachment/index.ts` lines 40–110. Note the difference: the client version takes parsed JSON, the edge version takes the raw model text (strips markdown fences, JSON.parses). The shared version must handle both:

```typescript
export function parseFacets(raw: unknown): Facet[] {
  let value = raw
  if (typeof raw === 'string') {
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    try { value = JSON.parse(jsonStr) } catch { return [] }
  }
  if (!Array.isArray(value)) return []
  // ... per-facet validation identical to src/types/facets.ts parseOne()
}
```

- [ ] **Step 2: Write the failing test**

`supabase/functions/_shared/facets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseFacets } from './facets'

describe('parseFacets', () => {
  it('validates a phone facet from a parsed array', () => {
    const out = parseFacets([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
    expect(out).toEqual([{ type: 'phone', label: 'Front desk', number: '410-555-0100' }])
  })
  it('parses from raw model text with markdown fences', () => {
    const out = parseFacets('```json\n[{"type":"access_code","label":"Gate","code":"4321"}]\n```')
    expect(out).toEqual([{ type: 'access_code', label: 'Gate', code: '4321' }])
  })
  it('drops malformed entries and caps at 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ type: 'summary', text: `s${i}` }))
    expect(parseFacets([{ type: 'phone' }, ...many]).length).toBe(12)
  })
  it('returns [] for garbage', () => {
    expect(parseFacets('not json')).toEqual([])
    expect(parseFacets(null)).toEqual([])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run supabase/functions/_shared/facets.test.ts`
Expected: FAIL — cannot resolve `./facets`

- [ ] **Step 4: Implement `_shared/facets.ts`**

Port the full validation logic (all 8 facet types, `MAX_FACETS = 12`, `MAX_ITEMS = 20`) from `src/types/facets.ts`, with the string-input handling from Step 1. Keep the header comment explaining it is the edge-side twin of `src/types/facets.ts` (update that file's header comment to point here instead of analyze-attachment).

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run supabase/functions/_shared/facets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Point analyze-attachment at the shared copy**

In `supabase/functions/analyze-attachment/index.ts`: delete the inline `parseFacets` function and its comment block; add `import { parseFacets } from '../_shared/facets.ts'`. The two call sites (`facets = parseFacets(await callVision(...))`) keep working because the shared version accepts raw text.

- [ ] **Step 7: Full test sweep + commit**

Run: `npx vitest run supabase/functions/`
Expected: all edge-function tests pass.

```bash
git add supabase/functions/_shared/facets.ts supabase/functions/_shared/facets.test.ts supabase/functions/analyze-attachment/index.ts src/types/facets.ts
git commit -m "refactor: shared edge-side facet validator in _shared"
```

---

### Task 2: Bundle types + pure builders (`context-graph/types.ts`, `build.ts`)

**Files:**
- Create: `supabase/functions/_shared/context-graph/types.ts`
- Create: `supabase/functions/_shared/context-graph/build.ts`
- Create: `supabase/functions/_shared/context-graph/build.test.ts`

**Interfaces:**
- Produces (Task 3, 4, 5, 6, 10 depend on these exact names):

```typescript
// types.ts
import type { Facet } from '../facets.ts'

export type ContextEntityType = 'task' | 'calendar_event' | 'project'
export interface EntityRef { entityType: ContextEntityType; entityId: string; userId: string }

export interface BundlePerson { id: string; name: string; role: 'about' | 'owner'; phone?: string; email?: string; relationship?: string }
export interface BundleLineage { projectId?: string; projectName?: string; projectStatus?: string; goalId?: string; goalTitle?: string }
export interface BundleFact { facet: Facet; attachmentId: string }
export interface BundleNote { id: string; title: string; snippet: string; source: 'linked' | 'semantic'; similarity?: number; vaultPath?: string }
export interface BundleAction { actionType: string; detail?: string; outcome?: string; createdAt: string }
export interface BundleTime { scheduledFor?: string; bucket?: string; isWaiting?: boolean; waitingSince?: string; deferCount?: number; ageDays: number }

export interface ContextBundle {
  ref: EntityRef
  entity: { id: string; title: string; notes?: string; links: { url: string; title?: string }[]; phoneNumber?: string; location?: string }
  people: BundlePerson[]
  lineage: BundleLineage
  facts: BundleFact[]
  knowledge: BundleNote[]
  history: BundleAction[]
  time: BundleTime
  /** Part names that failed to load — consumers degrade gracefully, never throw. */
  degraded: string[]
}

export const KNOWLEDGE_K = 5
export const SIMILARITY_FLOOR = 0.55
export const HISTORY_N = 10
export const SNIPPET_LEN = 200
```

```typescript
// build.ts
export function facetsToFacts(attachments: { id: string; facets: unknown }[]): BundleFact[]
export function boundKnowledge(notes: BundleNote[]): BundleNote[]  // dedupe by id (linked wins), linked first, cap KNOWLEDGE_K, drop semantic < SIMILARITY_FLOOR
export function buildTime(row: { scheduled_for: string | null; bucket: string | null; is_waiting: boolean | null; waiting_since: string | null; defer_count: number | null; created_at: string }, now: Date): BundleTime
export function renderBundleForPrompt(bundle: ContextBundle): string  // compact block, omits empty parts, ≤ ~1500 chars
```

- [ ] **Step 1: Write the failing tests**

`build.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { facetsToFacts, boundKnowledge, buildTime, renderBundleForPrompt } from './build'
import type { BundleNote, ContextBundle } from './types'
import { KNOWLEDGE_K } from './types'

describe('facetsToFacts', () => {
  it('flattens validated facets and keeps the attachment id', () => {
    const out = facetsToFacts([{ id: 'att-1', facets: [{ type: 'phone', number: '410-555-0100' }] }])
    expect(out).toEqual([{ facet: { type: 'phone', number: '410-555-0100' }, attachmentId: 'att-1' }])
  })
  it('skips null facets (never analyzed)', () => {
    expect(facetsToFacts([{ id: 'a', facets: null }])).toEqual([])
  })
})

describe('boundKnowledge', () => {
  const linked = (id: string): BundleNote => ({ id, title: id, snippet: '', source: 'linked' })
  const sem = (id: string, sim: number): BundleNote => ({ id, title: id, snippet: '', source: 'semantic', similarity: sim })
  it('linked notes come first and win dedupe', () => {
    const out = boundKnowledge([sem('a', 0.9), linked('a'), linked('b')])
    expect(out.map(n => n.id)).toEqual(['a', 'b'])
    expect(out[0].source).toBe('linked')
  })
  it('drops semantic notes below the floor and caps at K', () => {
    const notes = [sem('low', 0.3), ...Array.from({ length: 10 }, (_, i) => sem(`s${i}`, 0.9 - i * 0.01))]
    const out = boundKnowledge(notes)
    expect(out.length).toBe(KNOWLEDGE_K)
    expect(out.find(n => n.id === 'low')).toBeUndefined()
  })
})

describe('buildTime', () => {
  it('computes ageDays and passes through waiting state', () => {
    const now = new Date('2026-07-29T12:00:00Z')
    const t = buildTime({ scheduled_for: null, bucket: 'week', is_waiting: true, waiting_since: '2026-07-22T00:00:00Z', defer_count: 3, created_at: '2026-07-01T00:00:00Z' }, now)
    expect(t.ageDays).toBe(28)
    expect(t.isWaiting).toBe(true)
    expect(t.deferCount).toBe(3)
  })
})

describe('renderBundleForPrompt', () => {
  const base: ContextBundle = {
    ref: { entityType: 'task', entityId: 't1', userId: 'u1' },
    entity: { id: 't1', title: 'Call Camp Notre Dame', links: [], phoneNumber: undefined },
    people: [{ id: 'c1', name: 'Camp Notre Dame', role: 'about', phone: '410-555-0100' }],
    lineage: { projectName: 'Summer 2026', goalTitle: 'Kids have a great summer' },
    facts: [{ facet: { type: 'phone', number: '410-555-0199' }, attachmentId: 'a1' }],
    knowledge: [{ id: 'n1', title: 'camp-notes', snippet: 'signed up 6/1, left voicemail', source: 'linked' }],
    history: [{ actionType: 'call', detail: 'Called 410-555-0100', outcome: 'no_answer', createdAt: '2026-07-27T10:00:00Z' }],
    time: { ageDays: 12, isWaiting: true },
    degraded: [],
  }
  it('includes every non-empty part', () => {
    const s = renderBundleForPrompt(base)
    expect(s).toContain('Call Camp Notre Dame')
    expect(s).toContain('410-555-0100')          // person phone
    expect(s).toContain('Summer 2026')           // lineage
    expect(s).toContain('camp-notes')            // knowledge
    expect(s).toContain('no_answer')             // history
  })
  it('omits empty parts entirely', () => {
    const s = renderBundleForPrompt({ ...base, people: [], lineage: {}, facts: [], knowledge: [], history: [] })
    expect(s).not.toContain('PEOPLE')
    expect(s).not.toContain('HISTORY')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run supabase/functions/_shared/context-graph/build.test.ts`
Expected: FAIL — cannot resolve `./build`

- [ ] **Step 3: Implement `types.ts` and `build.ts`**

`types.ts` exactly as the interface block above. `build.ts`:

```typescript
import { parseFacets } from '../facets.ts'
import type { BundleFact, BundleNote, BundleTime, ContextBundle } from './types.ts'
import { KNOWLEDGE_K, SIMILARITY_FLOOR } from './types.ts'

export function facetsToFacts(attachments: { id: string; facets: unknown }[]): BundleFact[] {
  const out: BundleFact[] = []
  for (const att of attachments) {
    if (!att.facets) continue
    for (const facet of parseFacets(att.facets)) out.push({ facet, attachmentId: att.id })
  }
  return out
}

export function boundKnowledge(notes: BundleNote[]): BundleNote[] {
  const seen = new Map<string, BundleNote>()
  for (const n of notes) {
    if (n.source === 'semantic' && (n.similarity ?? 0) < SIMILARITY_FLOOR) continue
    const existing = seen.get(n.id)
    if (!existing || (existing.source === 'semantic' && n.source === 'linked')) seen.set(n.id, n)
  }
  const all = [...seen.values()]
  const linked = all.filter(n => n.source === 'linked')
  const semantic = all.filter(n => n.source === 'semantic').sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  return [...linked, ...semantic].slice(0, KNOWLEDGE_K)
}

export function buildTime(row: { scheduled_for: string | null; bucket: string | null; is_waiting: boolean | null; waiting_since: string | null; defer_count: number | null; created_at: string }, now: Date): BundleTime {
  const ageDays = Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 86400000)
  return {
    scheduledFor: row.scheduled_for ?? undefined,
    bucket: row.bucket ?? undefined,
    isWaiting: row.is_waiting ?? undefined,
    waitingSince: row.waiting_since ?? undefined,
    deferCount: row.defer_count ?? undefined,
    ageDays,
  }
}

export function renderBundleForPrompt(bundle: ContextBundle): string {
  const lines: string[] = [`ITEM [${bundle.entity.id}] "${bundle.entity.title}"`]
  if (bundle.entity.notes) lines.push(`notes: ${bundle.entity.notes.substring(0, 200)}`)
  if (bundle.time.isWaiting) lines.push(`WAITING${bundle.time.waitingSince ? ` since ${bundle.time.waitingSince.substring(0, 10)}` : ''}`)
  lines.push(`age: ${bundle.time.ageDays}d${bundle.time.deferCount ? `, deferred ${bundle.time.deferCount}x` : ''}`)
  if (bundle.people.length) lines.push(`PEOPLE: ${bundle.people.map(p => `${p.name} (${p.role}${p.phone ? ` phone:${p.phone}` : ''}${p.email ? ` email:${p.email}` : ''})`).join('; ')}`)
  if (bundle.lineage.projectName) lines.push(`PROJECT: ${bundle.lineage.projectName}${bundle.lineage.goalTitle ? ` → GOAL: ${bundle.lineage.goalTitle}` : ''}`)
  if (bundle.facts.length) lines.push(`ATTACHED FACTS: ${bundle.facts.map(f => JSON.stringify(f.facet)).join('; ')}`)
  if (bundle.knowledge.length) lines.push(`NOTES: ${bundle.knowledge.map(n => `[${n.title}] ${n.snippet}`).join(' | ')}`)
  if (bundle.history.length) lines.push(`HISTORY (already done — never re-suggest): ${bundle.history.map(h => `${h.actionType}${h.detail ? ` ${h.detail}` : ''}${h.outcome ? ` → ${h.outcome}` : ''} (${h.createdAt.substring(0, 10)})`).join('; ')}`)
  return lines.join('\n')
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run supabase/functions/_shared/context-graph/build.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/context-graph/
git commit -m "feat(context-graph): bundle types and pure builders"
```

---

### Task 3: Service-role semantic search RPC (migration)

`search_notes_semantic` (069_vault_sync.sql) filters on `auth.uid()`, which is NULL for a service-role client — the engine would get zero rows. Add a service-only variant that takes the user id explicitly.

**Files:**
- Create: `supabase/migrations/2026-07-29_semantic_search_service.sql`

**Interfaces:**
- Produces: RPC `search_notes_semantic_for_user(p_user_id uuid, query_embedding vector(1536), match_threshold float, match_count int)` returning the same table shape as `search_notes_semantic`. Task 4 calls it via `client.rpc('search_notes_semantic_for_user', {...})`.

- [ ] **Step 1: Write the migration**

```sql
-- Service-role variant of search_notes_semantic (069_vault_sync.sql).
-- That function scopes by auth.uid(), which is NULL for the service-role
-- clients the proactive engine and symphony-agent use — they'd always get
-- zero rows. This variant takes the user id explicitly and is executable
-- by service_role ONLY (revoked from everyone else), so a leaked anon key
-- cannot read another user's notes through it.
CREATE OR REPLACE FUNCTION search_notes_semantic_for_user(
  p_user_id uuid,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid, title text, content text, vault_path text,
  vault_domain text, context text, similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.title, n.content, n.vault_path, n.vault_domain, n.context,
         1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE n.embedding IS NOT NULL
    AND n.user_id = p_user_id
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_notes_semantic_for_user(uuid, vector, float, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_notes_semantic_for_user(uuid, vector, float, int) TO service_role;
```

- [ ] **Step 2: Apply to prod**

Apply via Management API (`POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`, token from keychain per memory `reference_supabase_management_token`) or the dashboard SQL editor. Verify:

```sql
SELECT proname FROM pg_proc WHERE proname = 'search_notes_semantic_for_user';
```
Expected: 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-07-29_semantic_search_service.sql
git commit -m "feat(db): service-role semantic search RPC for the context graph"
```

---

### Task 4: `assembleContext` fetch layer (`assemble.ts`)

**Files:**
- Create: `supabase/functions/_shared/context-graph/assemble.ts`
- Create: `supabase/functions/_shared/context-graph/assemble.test.ts`

**Interfaces:**
- Consumes: everything from `types.ts` / `build.ts` (Task 2), RPC from Task 3.
- Produces (Tasks 6 and 10 depend on this exact signature):

```typescript
export interface AssembleDeps {
  client: SupabaseClient        // service-role client
  openAiKey?: string            // enables semantic knowledge; absent → linked notes only
  now?: Date                    // injectable for tests; defaults to new Date()
}
export async function assembleContext(deps: AssembleDeps, ref: EntityRef): Promise<ContextBundle>
```

Behavior contract (spec §4 degradation, folded in): each part loads independently; a failed part pushes its name (`'people' | 'lineage' | 'facts' | 'knowledge' | 'history'`) onto `bundle.degraded` and the bundle still returns. Only a missing/unloadable **entity** throws. `calendar_event` and `project` entity types: v1 implements the `task` path fully; `calendar_event` loads the row from `calendar_events` with empty lineage/facts; `project` loads name/status/notes with its tasks' contacts skipped (YAGNI until a consumer needs it) — both still return well-formed bundles.

- [ ] **Step 1: Write the failing tests (stub client)**

`assemble.test.ts` — build a minimal chainable stub, no network:

```typescript
import { describe, it, expect } from 'vitest'
import { assembleContext } from './assemble'

/** Chainable stub: stub({ tasks: { data: {...} }, contacts: { data: [...] } }) */
function stubClient(tables: Record<string, { data: unknown; error?: { message: string } | null }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: { message: `no stub for ${table}` } }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not']) chain[m] = self
      chain.single = () => Promise.resolve(result)
      chain.maybeSingle = () => Promise.resolve(result)
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return chain
    },
    rpc: () => Promise.resolve(tables['__rpc__'] ?? { data: [], error: null }),
  } as never
}

const TASK = {
  id: 't1', title: 'Call Camp Notre Dame', notes: null, links: [], phone_number: null,
  contact_id: 'c1', assigned_to: null, project_id: 'p1', goal_id: 'g1',
  scheduled_for: null, bucket: 'week', is_waiting: true, waiting_since: '2026-07-22T00:00:00Z',
  defer_count: 2, location: null, created_at: '2026-07-01T00:00:00Z', completed: false,
}

describe('assembleContext (task)', () => {
  it('assembles all parts from a fully-stubbed world', async () => {
    const client = stubClient({
      tasks: { data: TASK },
      contacts: { data: [{ id: 'c1', name: 'Camp Notre Dame', phone: '410-555-0100', email: null, relationship: null, category: 'org' }] },
      projects: { data: { id: 'p1', name: 'Summer 2026', status: 'in_progress' } },
      goals: { data: { id: 'g1', title: 'Great summer' } },
      attachments: { data: [{ id: 'a1', facets: [{ type: 'phone', number: '410-555-0199' }] }] },
      note_entity_links: { data: [{ note_id: 'n1' }] },
      notes: { data: [{ id: 'n1', title: 'camp-notes', content: 'left voicemail 7/27', vault_path: null }] },
      action_history: { data: [{ action_type: 'call', detail: 'Called', outcome: 'no_answer', created_at: '2026-07-27T10:00:00Z' }] },
    })
    const b = await assembleContext({ client, now: new Date('2026-07-29T00:00:00Z') }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.entity.title).toBe('Call Camp Notre Dame')
    expect(b.people[0]).toMatchObject({ name: 'Camp Notre Dame', role: 'about', phone: '410-555-0100' })
    expect(b.lineage).toMatchObject({ projectName: 'Summer 2026', goalTitle: 'Great summer' })
    expect(b.facts[0].facet).toMatchObject({ type: 'phone', number: '410-555-0199' })
    expect(b.knowledge[0]).toMatchObject({ id: 'n1', source: 'linked' })
    expect(b.history[0]).toMatchObject({ actionType: 'call', outcome: 'no_answer' })
    expect(b.time.ageDays).toBe(28)
    expect(b.degraded).toEqual([])
  })

  it('degrades a failed part instead of throwing', async () => {
    const client = stubClient({
      tasks: { data: TASK },
      contacts: { data: null, error: { message: 'boom' } },
      projects: { data: { id: 'p1', name: 'Summer 2026', status: 'in_progress' } },
      goals: { data: { id: 'g1', title: 'Great summer' } },
      attachments: { data: [] },
      note_entity_links: { data: [] },
      notes: { data: [] },
      action_history: { data: [] },
    })
    const b = await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.degraded).toContain('people')
    expect(b.entity.title).toBe('Call Camp Notre Dame')
  })

  it('throws only when the entity itself is missing', async () => {
    const client = stubClient({ tasks: { data: null, error: { message: 'not found' } } })
    await expect(assembleContext({ client }, { entityType: 'task', entityId: 'missing', userId: 'u1' }))
      .rejects.toThrow()
  })

  it('skips semantic knowledge when no openAiKey', async () => {
    const client = stubClient({
      tasks: { data: TASK }, contacts: { data: [] }, projects: { data: null }, goals: { data: null },
      attachments: { data: [] }, note_entity_links: { data: [] }, notes: { data: [] }, action_history: { data: [] },
    })
    const b = await assembleContext({ client }, { entityType: 'task', entityId: 't1', userId: 'u1' })
    expect(b.knowledge).toEqual([])
    expect(b.degraded).not.toContain('knowledge')  // absent key is a config choice, not a failure
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run supabase/functions/_shared/context-graph/assemble.test.ts`
Expected: FAIL — cannot resolve `./assemble`

- [ ] **Step 3: Implement `assemble.ts`**

Structure (key requirements, not full listing — implementer writes the straightforward glue):

```typescript
import type { ContextBundle, EntityRef, BundleNote } from './types.ts'
import { HISTORY_N, KNOWLEDGE_K, SIMILARITY_FLOOR, SNIPPET_LEN } from './types.ts'
import { facetsToFacts, boundKnowledge, buildTime } from './build.ts'

export async function assembleContext(deps: AssembleDeps, ref: EntityRef): Promise<ContextBundle> { ... }
```

Requirements:
1. **Entity first, and it may throw.** Task path: `from('tasks').select('id, title, notes, links, phone_number, contact_id, assigned_to, project_id, goal_id, scheduled_for, bucket, is_waiting, waiting_since, defer_count, location, created_at, completed').eq('id', ref.entityId).eq('user_id', ref.userId).maybeSingle()` — null data or error → `throw new Error(\`context-graph: ${ref.entityType} ${ref.entityId} not found\`)`.
2. **Every other part in `Promise.all`, each wrapped** in a helper `part<T>(name, promise, fallback)` that catches/inspects `error` and pushes `name` to `degraded`.
3. **People:** contacts where `id in (contact_id, assigned_to)` (skip nulls) + `user_id` filter; `contact_id` → role `'about'`, `assigned_to` → role `'owner'`.
4. **Lineage:** project by `project_id` (`id, name, status`), goal by `goal_id` (`id, title`) — both `user_id`-filtered, both optional.
5. **Facts:** `from('attachments').select('id, facets').eq('entity_type', 'task').eq('entity_id', ref.entityId).eq('user_id', ref.userId).not('facets', 'is', null)` → `facetsToFacts`.
6. **Knowledge:** (a) explicit — `note_entity_links` where `entity_type='task', entity_id=ref.entityId` → note ids → `notes` (`id, title, content, vault_path`) `user_id`-filtered, `source: 'linked'`, snippet = first `SNIPPET_LEN` chars of content; (b) semantic — only if `deps.openAiKey`: embed `entity.title` via `text-embedding-3-small` (same fetch shape as `semantic-search/index.ts:49-66`, 3s AbortController timeout), then `client.rpc('search_notes_semantic_for_user', { p_user_id: ref.userId, query_embedding: JSON.stringify(embedding), match_threshold: SIMILARITY_FLOOR, match_count: KNOWLEDGE_K })`, `source: 'semantic'`. Merge through `boundKnowledge`. Embedding failure → degrade `'knowledge'`, keep linked notes.
7. **History:** `action_history` where `user_id` + `entity_type='task'` + `entity_id`, `order created_at desc`, `limit HISTORY_N`.
8. **Time:** `buildTime(entityRow, deps.now ?? new Date())`.
9. **calendar_event / project paths:** entity row from `calendar_events` / `projects` respectively (both `user_id`-filtered); reuse facts/knowledge/history fetchers with the matching `entity_type` string; empty lineage for events.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run supabase/functions/_shared/context-graph/`
Expected: PASS (build + assemble suites)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/context-graph/assemble.ts supabase/functions/_shared/context-graph/assemble.test.ts
git commit -m "feat(context-graph): assembleContext fetch layer with per-part degradation"
```

---

### Task 5: Facet rules for the engine's rule tier

A phone-number facet on a task with no `phone_number` of its own IS a call suggestion — no model needed.

**Files:**
- Create: `supabase/functions/proactive-engine/lib/facetRules.ts`
- Create: `supabase/functions/proactive-engine/lib/facetRules.test.ts`

**Interfaces:**
- Consumes: `BundleFact` from `../../_shared/context-graph/types.ts`.
- Produces (Task 6 wires this in):

```typescript
export interface FacetSuggestion {
  entity_type: 'task'; entity_id: string
  suggestion_type: 'call' | 'open_link'
  title: string; detail: string; confidence: number
  action_type: 'call' | 'open_link'
  action_payload: Record<string, unknown>
  suggestion_key: string
}
export function facetRuleSuggestions(task: { id: string; title: string; phone_number: string | null }, facts: BundleFact[]): FacetSuggestion[]
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { facetRuleSuggestions } from './facetRules'
import type { BundleFact } from '../../_shared/context-graph/types'

const task = { id: 't1', title: 'Call the camp', phone_number: null }
const phoneFact: BundleFact = { facet: { type: 'phone', label: 'Front desk', number: '410-555-0100' }, attachmentId: 'a1' }
const linkFact: BundleFact = { facet: { type: 'link', label: 'Booking', url: 'https://example.com/book' }, attachmentId: 'a1' }

describe('facetRuleSuggestions', () => {
  it('phone facet on a task without its own number → call suggestion', () => {
    const out = facetRuleSuggestions(task, [phoneFact])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      suggestion_type: 'call',
      action_payload: { phoneNumber: '410-555-0100' },
      suggestion_key: 'task:t1:rule:facet_call',
    })
  })
  it('no suggestion when the task already has a phone number', () => {
    expect(facetRuleSuggestions({ ...task, phone_number: '555' }, [phoneFact])).toHaveLength(0)
  })
  it('link facet → open_link suggestion, one per task max', () => {
    const out = facetRuleSuggestions(task, [linkFact, { ...linkFact, attachmentId: 'a2' }])
    expect(out).toHaveLength(1)
    expect(out[0].action_payload).toMatchObject({ url: 'https://example.com/book' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run supabase/functions/proactive-engine/lib/facetRules.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

First phone facet → one call suggestion (`confidence: 0.85`, title `` `Call ${label || 'number from attachment'}` ``, detail names the source: `'Number found on an attached photo/document'`). First link facet → one `open_link` (`confidence: 0.7`, key `task:{id}:rule:facet_link`). Nothing else in v1 — access codes and addresses surface as chips client-side (Task 8), they are not "next actions."

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npx vitest run supabase/functions/proactive-engine/lib/`

```bash
git add supabase/functions/proactive-engine/lib/
git commit -m "feat(engine): facet-derived rule suggestions"
```

---

### Task 6: Engine consumes the bundle

**Files:**
- Modify: `supabase/functions/proactive-engine/index.ts`

**Interfaces:**
- Consumes: `assembleContext`, `renderBundleForPrompt`, `facetRuleSuggestions` (exact signatures from Tasks 2/4/5).
- Produces: same `proactive_suggestions` rows as today (no schema change), plus service-mode invocation: `POST` with `Authorization: Bearer <service_role_key>` and JSON body `{ "user_id": "<uuid>" }` (Task 7's cron uses this).

No unit-test cycle here (the handler is untestable glue by design — the logic just gained tests in Tasks 2/4/5). Verification is a live invocation in Step 5.

- [ ] **Step 1: Service-mode auth**

In the auth section (around `index.ts:685-700`), before the `getUser` path:

```typescript
const token = authHeader.replace('Bearer ', '')
let userId: string
if (token === supabaseServiceKey) {
  // Cron/service invocation: trusted caller names the user explicitly.
  const body = await req.json().catch(() => ({}))
  if (typeof body.user_id !== 'string') {
    return new Response(JSON.stringify({ error: 'user_id required for service invocation' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  userId = body.user_id
} else {
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) { /* existing 401 */ }
  userId = user.id
}
```

- [ ] **Step 2: Batch-fetch facets and wire facet rules into the rule tier**

After the existing task fetch, one batch query (NOT per-task):

```typescript
import { facetsToFacts } from '../_shared/context-graph/build.ts'
import { facetRuleSuggestions } from './lib/facetRules.ts'

const taskIds = (tasks || []).map(t => t.id)
const { data: taskAttachments } = taskIds.length > 0
  ? await supabase.from('attachments').select('id, entity_id, facets')
      .eq('user_id', userId).eq('entity_type', 'task').in('entity_id', taskIds).not('facets', 'is', null)
  : { data: [] }
const factsByTask = new Map<string, ReturnType<typeof facetsToFacts>>()
for (const att of taskAttachments || []) {
  const facts = facetsToFacts([att])
  if (facts.length) factsByTask.set(att.entity_id, [...(factsByTask.get(att.entity_id) || []), ...facts])
}
```

Then inside the per-task rule loop: `allSuggestions.push(...facetRuleSuggestions(task, factsByTask.get(task.id) || []))`.

- [ ] **Step 3: Bundle-fed AI pass**

In `runLLMPass` (line ~538): delete `fetchVaultContext` and its Open Brain call entirely (the vault now enters through the bundle's knowledge part, read from the synced `notes` table — Open Brain is a dormant extra hop). Cap `aiTasks` at **8** (was 15). For those 8, assemble bundles concurrently:

```typescript
import { assembleContext } from '../_shared/context-graph/assemble.ts'
import { renderBundleForPrompt } from '../_shared/context-graph/build.ts'

const bundles = await Promise.all(aiTasks.map(t =>
  assembleContext({ client: supabase, openAiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined }, { entityType: 'task', entityId: t.id, userId })
    .catch(() => null)
))
```

Replace the `TASKS:` section of the prompt (the ad-hoc one-liner map) with:

```typescript
TASKS (each with its assembled context):
${bundles.filter(Boolean).map(b => renderBundleForPrompt(b!)).join('\n\n') || 'None'}
```

Keep CONTACTS, CALENDAR EVENTS, EMAIL ACTION ITEMS, and RECENT ACTIONS sections as they are (events/emails keep their thin rendering in v1). `runLLMPass` signature: pass `supabase` and `userId` in (it currently doesn't receive them).

- [ ] **Step 4: Deploy and verify live**

```bash
npx supabase functions deploy proactive-engine --project-ref mwadppyrqzuzgstmwpuy --use-api
```

Invoke as the real user from a logged-in browser session (or curl with a fresh access token) and check the response JSON has `success: true` and `generated > 0`. Then in the dashboard SQL editor:

```sql
SELECT suggestion_key, title, confidence FROM proactive_suggestions
WHERE status = 'active' ORDER BY generated_at DESC LIMIT 20;
```
Expected: rows exist; any task with a phone-bearing attachment shows a `rule:facet_call` key.

- [ ] **Step 5: Full sweep + commit**

Run: `npx vitest run supabase/functions/ && npm run build`

```bash
git add supabase/functions/proactive-engine/index.ts
git commit -m "feat(engine): reason over assembled context bundles; facet rules; service-mode auth"
```

---

### Task 7: pg_cron morning warm

**Files:**
- Create: `supabase/migrations/2026-07-29_proactive_engine_cron.sql`

**Interfaces:**
- Consumes: engine service-mode from Task 6; existing `claim_engine_run` (2026-06-17 migration); pg_net pattern from `029_waitlist_notify_webhook.sql`; graceful-fallback DO blocks from `2026-06-26_cos_action_layer.sql:146-166`.

- [ ] **Step 1: Write the migration**

```sql
-- Morning warm for the proactive engine. The engine is client-claimed
-- (claim_engine_run, every 6h) — which means it goes cold when no Symphony
-- tab is open anywhere. This job runs once each morning server-side so
-- suggestions are warm BEFORE the first glance. It claims through the same
-- claim_engine_run gate, so it can never double-bill against a client run.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION proactive_engine_warm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u RECORD;
  service_role_key text;
BEGIN
  service_role_key := current_setting('app.settings.service_role_key', true);
  IF service_role_key IS NULL THEN
    RAISE NOTICE 'proactive_engine_warm: app.settings.service_role_key not set; skipping';
    RETURN;
  END IF;

  FOR u IN
    SELECT DISTINCT user_id FROM tasks
    WHERE completed = false AND updated_at > now() - interval '14 days'
  LOOP
    -- Same 6h gate the clients use — exactly one runner per interval per user.
    IF claim_engine_run('proactive-engine:' || u.user_id, 21600) THEN
      PERFORM net.http_post(
        url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/proactive-engine',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('user_id', u.user_id)
      );
    END IF;
  END LOOP;
END;
$$;

-- 10:30 UTC = 6:30am US/Eastern in summer — before the first coffee glance,
-- after the quiet-hours window (lib/quietHours.ts ends at 6am local).
DO $$
BEGIN
  PERFORM cron.unschedule('proactive-engine-warm')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'proactive-engine-warm');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('proactive-engine-warm', '30 10 * * *', 'SELECT proactive_engine_warm();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; proactive-engine-warm not scheduled.';
END;
$$;
```

- [ ] **Step 2: Apply to prod and verify the setting exists**

Apply via Management API / dashboard. Then check the prerequisite the 029 pattern relies on:

```sql
SELECT current_setting('app.settings.service_role_key', true) IS NOT NULL AS has_key;
SELECT jobname, schedule FROM cron.job WHERE jobname = 'proactive-engine-warm';
```

If `has_key` is false, set it once (dashboard SQL editor, service key from the project's API settings):
`ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_key>';`

- [ ] **Step 3: Fire it once manually and verify**

```sql
SELECT proactive_engine_warm();
-- then, after ~30s:
SELECT status, created FROM net._http_response ORDER BY created DESC LIMIT 5;
```
Expected: HTTP 200 responses (or a NOTICE-skip if all users were claimed recently — rerun after the 6h window if so).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-29_proactive_engine_cron.sql
git commit -m "feat(db): pg_cron morning warm for the proactive engine"
```

---

### Task 8: Client hook `useEntityContext` + `ContextChips`

**Files:**
- Create: `src/hooks/useEntityContext.ts`
- Create: `src/hooks/useEntityContext.test.ts`
- Create: `src/components/context/ContextChips.tsx`
- Create: `src/components/context/ContextChips.test.tsx`

**Interfaces:**
- Consumes: `ProactiveSuggestion`, `rowToSuggestion` from `@/types/proactiveSuggestion`; `ProactiveSuggestionChips` from `@/components/schedule/ProactiveSuggestionChips` (reused as-is for action handling); `supabase` from `@/lib/supabase` (check the actual export path used by `useProactiveSuggestions.ts` and match it).
- Produces (Task 9 depends on these):

```typescript
// useEntityContext.ts
export interface LastAction { actionType: string; detail?: string; outcome?: string; createdAt: Date }
export interface EntityContextResult {
  suggestions: ProactiveSuggestion[]
  lastAction: LastAction | null
  loading: boolean
  actOnSuggestion: (suggestionId: string, detail?: string, outcome?: string) => Promise<void>
  dismissSuggestion: (suggestionId: string) => Promise<void>
}
export function useEntityContext(entityType: SuggestionEntityType, entityId: string | null): EntityContextResult
```

```tsx
// ContextChips.tsx
export function ContextChips(props: {
  entityType: SuggestionEntityType
  entityId: string | null
  /** 'panel' = all suggestions + last-action line; 'row' = top-1 suggestion only, no last-action */
  variant?: 'panel' | 'row'
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}): JSX.Element | null
```

- [ ] **Step 1: Write the failing hook test**

Follow the mocking style of an existing hook test (read `src/hooks/useEventNotes.test.ts` first and copy its supabase-mock pattern — the repo already has a convention; match it exactly). Test cases:

```typescript
describe('useEntityContext', () => {
  it('returns active suggestions for the entity ordered by confidence', async () => { ... })
  it('returns the most recent action as lastAction', async () => { ... })
  it('returns empty state without querying when entityId is null', async () => { ... })
  it('actOnSuggestion marks the row acted and logs to action_history', async () => { ... })
})
```

The hook queries: (a) `proactive_suggestions` where `entity_type`, `entity_id`, `status='active'`, ordered by `confidence desc`; (b) `action_history` where `entity_type`, `entity_id`, ordered `created_at desc`, `limit 1`. `actOnSuggestion` / `dismissSuggestion`: copy the exact update+insert logic from `useProactiveSuggestions.ts:82-128` (status update, `acted_at`/`dismissed_at`, `action_history` insert) — do not re-derive it.

- [ ] **Step 2: Run to verify failure, implement, run to verify pass**

Run: `npx vitest run src/hooks/useEntityContext.test.ts` (fail → implement → pass)

- [ ] **Step 3: Write the failing component test**

```tsx
describe('ContextChips', () => {
  it('renders suggestion chips and the last-action line in panel variant', () => { ... })
  it('renders only the top suggestion in row variant', () => { ... })
  it('renders nothing when there are no suggestions and no last action', () => { ... })
})
```

Mock `useEntityContext` (vi.mock) rather than supabase. Last-action line format: `Last: {detail || actionType}{outcome ? ` — ${outcome.replace('_', ' ')}` : ''} · {relative time}` with a lucide `History` icon (16px, `text-neutral-400`). Relative time: reuse the repo's existing helper if one exists (grep `formatDistanceToNow\|timeAgo\|relativeTime` in `src/lib/` first); otherwise a local `daysAgo()` returning `today | yesterday | Nd ago`.

- [ ] **Step 4: Implement `ContextChips`**

Panel variant: `<ProactiveSuggestionChips suggestions={suggestions} onAct={actOnSuggestion} onDismiss={dismissSuggestion} onOpenGuidedChat={onOpenGuidedChat} />` followed by the last-action line. Row variant: `suggestions.slice(0, 1)`, no last-action line. Return `null` when empty (both parts). One layout wrinkle: `ProactiveSuggestionChips` hardcodes `ml-[6.5rem]` (Today's checkbox gutter) — add an optional `className?: string` prop to it that replaces that margin wrapper class when provided, defaulting to current behavior so Today is untouched. Pass `className="ml-0"` from ContextChips.

- [ ] **Step 5: Run all four suites, commit**

Run: `npx vitest run src/hooks/useEntityContext.test.ts src/components/context/`

```bash
git add src/hooks/useEntityContext.* src/components/context/ src/components/schedule/ProactiveSuggestionChips.tsx
git commit -m "feat(context): useEntityContext hook + ContextChips component"
```

---

### Task 9: Placements — detail panel, project view, overdue section

Per the spec's density decision: persistent chips everywhere EXCEPT Today's schedule rows (which stay hover-only — no `ScheduleItem` changes in this plan).

**Files:**
- Create: `src/components/surface/sections/PanelAssistant.tsx`
- Create: `src/components/surface/sections/PanelAssistant.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx`
- Modify: `src/components/project/ProjectViewRedesign.tsx`
- Modify: `src/components/schedule/OverdueSection.tsx`

**Interfaces:**
- Consumes: `ContextChips` (Task 8, exact props above).

- [ ] **Step 1: PanelAssistant section — failing test first**

Read `src/components/surface/sections/PanelWhy.tsx` (or `PanelLocation.tsx`) first and mirror its section-wrapper markup/heading style exactly — the panel sections share a visual grammar; do not invent a new one.

```tsx
// PanelAssistant.tsx
import { ContextChips } from '@/components/context/ContextChips'

export function PanelAssistant({ taskId, onOpenGuidedChat }: {
  taskId: string
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}) {
  return <ContextChips entityType="task" entityId={taskId} variant="panel" onOpenGuidedChat={onOpenGuidedChat} />
}
```

Test: renders ContextChips with the task id; renders nothing visible when ContextChips returns null (mock it both ways).

- [ ] **Step 2: Mount in TapContextPanel**

In `TapContextPanel.tsx`: import `PanelAssistant`, render it directly after `<PanelActions .../>` (suggestions are actions — they belong beside the action row, above the Why/notes sections). The panel receives `task` in props; pass `task.id`. Wire `onOpenGuidedChat` from the panel's existing AssistDrawer plumbing if a handler already exists in props; otherwise omit (the prop is optional).

Run: `npx vitest run src/components/surface/TapContextPanel.test.tsx src/components/surface/sections/PanelAssistant.test.tsx`
Expected: existing panel tests still pass + new ones pass.

- [ ] **Step 3: ProjectViewRedesign — per-task row chips**

In `ProjectViewRedesign.tsx` (719 lines): find where individual project tasks render (search for the task list `.map(`). Under each incomplete task row, add:

```tsx
<ContextChips entityType="task" entityId={task.id} variant="row" />
```

This is one `useEntityContext` fetch per rendered task row — acceptable at project scale (projects have tens of tasks, not hundreds), and only active-status rows query.

- [ ] **Step 4: OverdueSection — render what the props already carry**

`OverdueSection.tsx` already receives `suggestionsForTask` / `onActSuggestion` / `onDismissSuggestion` / `onOpenGuidedChat` from TodayView (`TodayView.tsx:965-968`) but never renders them. In the overdue task row render, add below each task title:

```tsx
{suggestionsForTask && (
  <ProactiveSuggestionChips
    suggestions={suggestionsForTask('task', task.id).slice(0, 1)}
    onAct={onActSuggestion ?? (() => {})}
    onDismiss={onDismissSuggestion ?? (() => {})}
    onOpenGuidedChat={onOpenGuidedChat}
    className="ml-0 mt-1"
  />
)}
```

Top-1 only — overdue lives on Today and respects its density budget.

- [ ] **Step 5: Full sweep, visual verification, commit**

Run: `npx vitest run && npm run build`
Expected: all green, build clean.

Then LOOK AT IT (type-checks are not inspection — this repo shipped six green defects once):
1. Ensure the worktree has `.env` (copy from the main worktree if missing — blank screen means it's missing).
2. `npm run dev` (port 5173 — the only allowed dev port), log in as the real account.
3. Open a task detail panel for a task that has suggestions → chips + last-action line render, actions fire (`tel:` link opens).
4. Open a project → row chips on tasks that have suggestions.
5. Today → overdue tasks show one chip; schedule rows still hover-only.

```bash
git add src/components/surface/ src/components/project/ProjectViewRedesign.tsx src/components/schedule/OverdueSection.tsx
git commit -m "feat(context): ContextChips on detail panel, project view, overdue section"
```

---

### Task 10: symphony-agent becomes the second consumer

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts`

**Interfaces:**
- Consumes: `assembleContext` (Task 4), `renderBundleForPrompt` (Task 2).

- [ ] **Step 1: Locate the insertion point**

The agent already accepts `taskContext: { id, title, kind?, notes?, projectName? }` from the client (`index.ts:~1025-1030`) and has a service-role client `service` (`index.ts:1014`). Find where `taskContext` is rendered into the system prompt (search `taskContext` below line 1030).

- [ ] **Step 2: Enrich with the bundle**

Where `taskContext` is currently rendered from its four thin fields, replace with:

```typescript
import { assembleContext } from '../_shared/context-graph/assemble.ts'
import { renderBundleForPrompt } from '../_shared/context-graph/build.ts'

let taskContextBlock = ''
if (taskContext) {
  try {
    const bundle = await assembleContext(
      { client: service, openAiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined },
      { entityType: 'task', entityId: taskContext.id, userId: user.id },
    )
    taskContextBlock = `\nThe user is asking about this item — full assembled context:\n${renderBundleForPrompt(bundle)}`
    if (bundle.degraded.length) taskContextBlock += `\n(context parts unavailable: ${bundle.degraded.join(', ')})`
  } catch (_e) {
    // Fall back to the thin client-provided fields — never fail the chat over context.
    taskContextBlock = `\nThe user is asking about: "${taskContext.title}"${taskContext.notes ? ` — ${taskContext.notes}` : ''}${taskContext.projectName ? ` (project: ${taskContext.projectName})` : ''}`
  }
}
```

Keep whatever prompt position the thin version occupied. `routine`-kind taskContext ids are NOT task rows — guard: only call `assembleContext` when `taskContext.kind` is absent or `'task'`; otherwise use the thin fallback rendering.

- [ ] **Step 3: Deploy and verify live**

```bash
npx supabase functions deploy symphony-agent --project-ref mwadppyrqzuzgstmwpuy --use-api
npx supabase functions deploy analyze-attachment --project-ref mwadppyrqzuzgstmwpuy --use-api   # Task 1's import change ships here too
```

In the app: open a task that has an attached-facet phone number and prior action history, launch its guided chat ("Help me with this"), and ask "what do we know about this?" — the reply should cite the number/history without you pasting anything.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/symphony-agent/index.ts
git commit -m "feat(agent): ground entity chats in assembleContext bundles"
```

---

### Task 11: Final verification + push

- [ ] **Step 1: Full local gate**

```bash
npx vitest run
npm run lint        # CI runs lint; pre-push does not — lint before pushing
npm run build       # pre-push tsc is NOT the Vercel build
```
Expected: all green. Fix anything red before proceeding.

- [ ] **Step 2: Deployed-state checklist**

Confirm each item actually shipped (report honestly — anything unchecked gets said out loud):
- [ ] `search_notes_semantic_for_user` exists in prod (Task 3 Step 2 query)
- [ ] `proactive-engine`, `symphony-agent`, `analyze-attachment` deployed (`npx supabase functions list --project-ref mwadppyrqzuzgstmwpuy` shows updated versions)
- [ ] `cron.job` has `proactive-engine-warm`
- [ ] Fresh engine run produced `facet_call` or bundle-informed suggestions (Task 6 Step 4 query)

- [ ] **Step 3: Push the branch**

```bash
git push origin assistant-direction
```
Do NOT push to `main` — that is Scott's call after browser walkthrough (the spec's "assistant runs the cascade" and remaining sections are still undesigned; this branch ships the substrate).

- [ ] **Step 4: Report**

Tell Scott: what shipped, the deployed-state checklist results, what to look at in the browser (the three surfaces from Task 9 Step 5), and that merging to `main` (= prod deploy) is his call.

---

## Self-review notes

- **Spec coverage:** §1 architecture → Tasks 2/4 (module) + 6/10 (two consumers). §2 bundle parts → Task 2 types (calendar-neighborhood deliberately deferred — the bundle's `time` part carries due/staleness/defer/waiting; events enter via the engine's existing fetch; noted as v1.1). §2 "data not prose" → typed bundle + separate `renderBundleForPrompt`. §2 bounded retrieval → `KNOWLEDGE_K`/`SIMILARITY_FLOOR`/`HISTORY_N` with tests. §3 surfaces → Task 9 (detail panel, project view, overdue; Today untouched per density decision). §3 engine widening → Tasks 5/6. §3 cold start → Task 7. §4 degradation → `degraded[]` contract + agent fallback. §5 cost → global constraints (caps, model pinned). §9 testing → every pure unit TDD'd; handlers verified live.
- **Type consistency:** `BundleFact = { facet, attachmentId }` used identically in Tasks 2/5/6; `EntityRef`/`AssembleDeps` identical in 4/6/10; `ContextChips` props identical in 8/9.
- **Known deferred items (do not silently expand):** ScheduleItem persistent chips, calendar-neighborhood part, project-entity people, `useEntityContext` realtime, Iris, cascade.
