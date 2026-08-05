# Documents Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Symphony a private-by-default shelf of durable documents (driver's license, passport, insurance card), proposed automatically by the existing attachment vision pass, findable in one obvious place, and surfacing before they expire.

**Architecture:** Extend the existing `attachments` row rather than adding a `documents` table — the file, its RLS, its storage path and its facets already live there, and attachments already survive their parent (`entity_id` is TEXT with no FK). `analyze-attachment` gains a classification step that proposes a document; a validator (`stripSensitive`) guarantees that sensitive kinds never persist their own numbers into `facets`, because facets flow into the context graph and on to the assistant. A `/documents` app renders the shelf; a rule in `proactive-engine` surfaces upcoming expiries.

**Tech Stack:** React 19 + TypeScript (strict), Vite 7, Tailwind v4, Supabase (Postgres + RLS + Storage + Deno edge functions), Vitest + React Testing Library, react-router-dom.

**Spec:** `docs/superpowers/specs/2026-08-05-documents-shelf-design.md`

## Global Constraints

- **Work in the worktree** `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/documents-shelf` on branch `documents-shelf`. Never edit or commit in the main worktree. Verify with `pwd` before every `git` command.
- **Node version matters.** Run `node -v` first; it must be `v22.14.0`. If not:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **`npm test` is watch mode.** Always use `npx vitest run <path>`.
- **Root `npx tsc --noEmit` is a no-op.** Type-check with `npx tsc --noEmit -p tsconfig.app.json`.
- **Migrations are out of sync with the DB.** DDL is applied via the Supabase Management API, not the CLI:
  `POST https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query` with `{"query": "..."}`.
  Get the token first — the on-disk `~/.supabase/access-token` is stale, the live one is in the keychain:
  ```bash
  export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
  ```
  The `.sql` file in `supabase/migrations/` is still committed as the record.
- **Twin validators must stay in sync.** `src/types/facets.ts` (client) and `supabase/functions/_shared/facets.ts` (edge) are hand-maintained copies — edge functions cannot import from `src/`. Every change to one is made to the other in the same commit.
- **Never `.upsert()` partial rows into `tasks`** — always `.update().eq()`. (Not used in this plan, but holds if a task edit sneaks in.)
- **No emojis in UI.** Use `lucide-react` icons.
- **Sensitive kinds are enforced in code, never by prompt.** Any change that moves redaction into the prompt alone is a defect.
- **Do not push to `main`.** Pushes to `main` auto-deploy to production. Push `documents-shelf` only.

## Vocabulary (used by every task)

```ts
export type DocumentKind =
  | 'drivers_license' | 'passport' | 'birth_certificate' | 'social_security_card'
  | 'insurance_card' | 'vehicle_registration' | 'vehicle_title' | 'medical_record'
  | 'tax_document' | 'bank_document' | 'warranty' | 'receipt' | 'contract' | 'other'

export type DocumentStatus = 'proposed' | 'kept' | 'dismissed'
export type DocumentScope = 'private' | 'household'
```

SENSITIVE kinds: `drivers_license`, `passport`, `birth_certificate`, `social_security_card`, `insurance_card`, `vehicle_title`, `medical_record`, `tax_document`, `bank_document`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-08-05_documents_shelf.sql` | Columns, constraints, indexes, restrictive RLS policy, `entity_type` CHECK extension |
| `src/types/document.ts` | `DocumentKind`/`Status`/`Scope`, `SENSITIVE_KINDS`, `stripSensitive`, `parseDocumentProposal`, `documentKindLabel`, row↔model mapping |
| `src/types/document.test.ts` | Table-driven tests for `stripSensitive` + proposal parsing |
| `supabase/functions/_shared/documents.ts` | Edge twin of the above (no React, no `@/` imports) |
| `supabase/functions/_shared/documents.test.ts` | Edge twin tests |
| `supabase/functions/analyze-attachment/index.ts` | Classification step + redaction before the row write |
| `src/hooks/useDocuments.ts` | Query kept documents + proposals; keep/dismiss/update/scope/delete |
| `src/hooks/useDocuments.test.ts` | Hook behavior against a mocked supabase client |
| `src/components/surface/sections/DocumentProposal.tsx` | The "Looks like a driver's license" confirm/dismiss row |
| `src/components/surface/sections/DocumentProposal.test.tsx` | Proposal row rendering + callbacks |
| `src/components/surface/sections/PanelPhotos.tsx` | Renders `DocumentProposal` alongside `AttachmentFacets` |
| `src/apps/documents/DocumentsApp.tsx` | The shelf: grouped list, expiry warnings, scope toggle, view, delete |
| `src/apps/documents/DocumentRow.tsx` | One document row |
| `src/apps/documents/DocumentsApp.test.tsx` | Shelf behavior |
| `src/apps/documents/index.ts` | `documentsAppDef` |
| `src/shell/appRegistry.ts` | Register the app |
| `src/components/layout/Sidebar.tsx` | Library-group entry |
| `supabase/functions/proactive-engine/lib/documentRules.ts` | Expiry → suggestion |
| `supabase/functions/proactive-engine/lib/documentRules.test.ts` | Threshold boundaries |
| `supabase/functions/proactive-engine/index.ts` | Call the expiry rule |
| `scripts/backfill-documents.ts` | One-time re-classification + facet strip of existing rows |

---

### Task 1: Database schema, constraints, and the restrictive RLS policy

This is the task that makes private-by-default real. `2026-08-03_attachments_household_visibility.sql` grants SELECT through the parent entity, and Postgres OR's permissive policies — so a document promoted off a family task stays household-visible unless a **restrictive** policy clamps it.

**Files:**
- Create: `supabase/migrations/2026-08-05_documents_shelf.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `document_status`, `document_kind`, `document_label`, `document_owner`, `document_expires_on`, `document_scope` on `attachments`; `entity_type` now accepts `'document'`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/2026-08-05_documents_shelf.sql`:

```sql
-- Documents shelf: durable documents promoted out of attachments.
-- Spec: docs/superpowers/specs/2026-08-05-documents-shelf-design.md
--
-- document_status null  = ordinary attachment, not a document (the vast majority)
--                'proposed'  = analyze-attachment thinks it is one, awaiting the user
--                'kept'      = on the shelf
--                'dismissed' = user said no; never propose again

alter table attachments
  add column if not exists document_status     text,
  add column if not exists document_kind       text,
  add column if not exists document_label      text,
  add column if not exists document_owner      text,
  add column if not exists document_expires_on date,
  add column if not exists document_scope      text not null default 'private';

do $$ begin
  alter table attachments add constraint attachments_document_status_check
    check (document_status is null or document_status in ('proposed','kept','dismissed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table attachments add constraint attachments_document_scope_check
    check (document_scope in ('private','household'));
exception when duplicate_object then null; end $$;

-- Direct uploads into the shelf hang off the user themselves (entity_id = user_id),
-- so a passport can be added without inventing a fake task.
alter table attachments drop constraint if exists attachments_entity_type_check;
alter table attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','project','event_note','instance_note','note','routine','document'));

create index if not exists attachments_document_status_idx
  on attachments (user_id, document_status) where document_status is not null;

create index if not exists attachments_document_expiry_idx
  on attachments (user_id, document_expires_on) where document_status = 'kept';

-- THE privacy control. Permissive policies OR together, so the household
-- visibility policy from 2026-08-03 would otherwise still expose a private
-- document promoted off a family-scoped task. A restrictive policy ANDs with
-- the permissive set and clamps every grant path.
drop policy if exists "private documents are owner-only" on attachments;
create policy "private documents are owner-only"
  on attachments as restrictive for select
  using (
    document_status is distinct from 'kept'
    or document_scope is distinct from 'private'
    or user_id = auth.uid()
  );
```

- [ ] **Step 2: Check the current `entity_type` constraint before replacing it**

The migration drops and recreates `attachments_entity_type_check`. Confirm the real constraint name first — if it differs, fix the migration to match.

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = '"'"'attachments'"'"'::regclass;"}'
```
Expected: a row whose definition contains `entity_type = ANY`. Note its `conname`. If it is not `attachments_entity_type_check`, update both the `drop` and `add` lines in the migration to that name.

- [ ] **Step 3: Apply the migration**

Run the same `curl` with the file contents as the `query` value:
```bash
python3 -c "import json,sys;print(json.dumps({'query':open('supabase/migrations/2026-08-05_documents_shelf.sql').read()}))" > /tmp/mig.json
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data @/tmp/mig.json
```
Expected: `[]` or a success payload, no `error` key.

- [ ] **Step 4: Verify the columns and the restrictive policy landed**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select column_name from information_schema.columns where table_name='"'"'attachments'"'"' and column_name like '"'"'document%'"'"' order by 1;"}'
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select policyname, permissive from pg_policies where tablename='"'"'attachments'"'"';"}'
```
Expected: six `document_*` columns; a policy named `private documents are owner-only` with `permissive = RESTRICTIVE`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-08-05_documents_shelf.sql
git commit -m "feat(db): documents shelf columns + restrictive private-document policy"
```

---

### Task 2: Client-side document vocabulary and `stripSensitive`

This is the security control. It must exist before anything writes a proposal.

**Files:**
- Create: `src/types/document.ts`
- Test: `src/types/document.test.ts`

**Interfaces:**
- Consumes: `Facet` from `src/types/facets.ts`.
- Produces:
  - `DocumentKind`, `DocumentStatus`, `DocumentScope` types
  - `SENSITIVE_KINDS: ReadonlySet<DocumentKind>`
  - `isDocumentKind(v: unknown): v is DocumentKind`
  - `stripSensitive(facets: Facet[], kind: DocumentKind): Facet[]`
  - `documentKindLabel(kind: DocumentKind): string`
  - `DocumentProposal = { kind: DocumentKind; label: string; owner: string | null; expiresOn: string | null }`
  - `parseDocumentProposal(raw: unknown): DocumentProposal | null`

- [ ] **Step 1: Write the failing tests**

Create `src/types/document.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Facet } from '@/types/facets'
import {
  SENSITIVE_KINDS,
  isDocumentKind,
  stripSensitive,
  documentKindLabel,
  parseDocumentProposal,
  type DocumentKind,
} from '@/types/document'

const everyFacetType: Facet[] = [
  { type: 'summary', text: 'Maryland driver license for Scott Kaufman, DLN S-123-456' },
  { type: 'location', address: '742 Evergreen Terrace, Baltimore MD' },
  { type: 'access_code', label: 'DLN', code: 'S-123-456-789' },
  { type: 'phone', label: 'MVA', number: '+1 410 555 0100' },
  { type: 'datetime', label: 'Expires', iso: '2029-03-14T00:00:00' },
  { type: 'link', url: 'https://mva.maryland.gov' },
  { type: 'checklist', label: 'Bring', items: ['proof of address'] },
  { type: 'purchase_item', name: 'nothing', specs: 'n/a' },
]

describe('stripSensitive', () => {
  it('reduces a sensitive kind to a single kind-derived summary', () => {
    const out = stripSensitive(everyFacetType, 'drivers_license')
    expect(out).toEqual([{ type: 'summary', text: "Driver's license" }])
  })

  it.each([...SENSITIVE_KINDS])('drops every non-summary facet for %s', (kind) => {
    const out = stripSensitive(everyFacetType, kind as DocumentKind)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('summary')
  })

  it.each([...SENSITIVE_KINDS])('leaks no original value for %s', (kind) => {
    const serialized = JSON.stringify(stripSensitive(everyFacetType, kind as DocumentKind))
    for (const needle of ['S-123-456', '742 Evergreen', '410 555 0100', 'mva.maryland.gov', '2029-03-14']) {
      expect(serialized).not.toContain(needle)
    }
  })

  it('leaves non-sensitive kinds untouched', () => {
    expect(stripSensitive(everyFacetType, 'receipt')).toEqual(everyFacetType)
    expect(stripSensitive(everyFacetType, 'warranty')).toEqual(everyFacetType)
  })

  it('returns a summary even when the input had none', () => {
    const out = stripSensitive([{ type: 'phone', number: '+1 410 555 0100' }], 'passport')
    expect(out).toEqual([{ type: 'summary', text: 'Passport' }])
  })

  it('does not mutate its input', () => {
    const input = [...everyFacetType]
    stripSensitive(input, 'passport')
    expect(input).toHaveLength(everyFacetType.length)
  })
})

describe('isDocumentKind', () => {
  it('accepts known kinds and rejects everything else', () => {
    expect(isDocumentKind('passport')).toBe(true)
    expect(isDocumentKind('nuclear_codes')).toBe(false)
    expect(isDocumentKind(null)).toBe(false)
    expect(isDocumentKind(7)).toBe(false)
  })
})

describe('documentKindLabel', () => {
  it('renders human labels', () => {
    expect(documentKindLabel('drivers_license')).toBe("Driver's license")
    expect(documentKindLabel('social_security_card')).toBe('Social Security card')
    expect(documentKindLabel('other')).toBe('Document')
  })
})

describe('parseDocumentProposal', () => {
  it('parses a well-formed proposal', () => {
    expect(
      parseDocumentProposal({
        kind: 'drivers_license',
        label: "Scott's driver's license",
        owner: 'Scott',
        expires_on: '2029-03-14',
      })
    ).toEqual({
      kind: 'drivers_license',
      label: "Scott's driver's license",
      owner: 'Scott',
      expiresOn: '2029-03-14',
    })
  })

  it('defaults a missing label to the kind label', () => {
    expect(parseDocumentProposal({ kind: 'passport' })).toEqual({
      kind: 'passport',
      label: 'Passport',
      owner: null,
      expiresOn: null,
    })
  })

  it('rejects unknown kinds, non-objects, and null', () => {
    expect(parseDocumentProposal({ kind: 'grimoire' })).toBeNull()
    expect(parseDocumentProposal(null)).toBeNull()
    expect(parseDocumentProposal('passport')).toBeNull()
    expect(parseDocumentProposal({})).toBeNull()
  })

  it('drops a malformed expiry rather than failing the whole parse', () => {
    const out = parseDocumentProposal({ kind: 'passport', expires_on: 'next tuesday' })
    expect(out?.expiresOn).toBeNull()
    expect(out?.kind).toBe('passport')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/types/document.test.ts`
Expected: FAIL — `Failed to resolve import "@/types/document"`.

- [ ] **Step 3: Write the implementation**

Create `src/types/document.ts`:

```ts
/** Durable-document vocabulary for the Documents shelf.
 *  Spec: docs/superpowers/specs/2026-08-05-documents-shelf-design.md
 *
 *  A twin lives in supabase/functions/_shared/documents.ts (edge functions
 *  cannot import from src/) — keep the two in sync. */
import type { Facet } from '@/types/facets'

export const DOCUMENT_KINDS = [
  'drivers_license', 'passport', 'birth_certificate', 'social_security_card',
  'insurance_card', 'vehicle_registration', 'vehicle_title', 'medical_record',
  'tax_document', 'bank_document', 'warranty', 'receipt', 'contract', 'other',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export type DocumentStatus = 'proposed' | 'kept' | 'dismissed'
export type DocumentScope = 'private' | 'household'

/** Kinds whose own contents must never be transcribed into `facets`.
 *  Facets flow into the context graph and on to the assistant prompt
 *  (supabase/functions/_shared/context-graph/build.ts), so an extracted
 *  ID number would become a durable, searchable fact. */
export const SENSITIVE_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  'drivers_license', 'passport', 'birth_certificate', 'social_security_card',
  'insurance_card', 'vehicle_title', 'medical_record', 'tax_document', 'bank_document',
])

const KIND_LABELS: Record<DocumentKind, string> = {
  drivers_license: "Driver's license",
  passport: 'Passport',
  birth_certificate: 'Birth certificate',
  social_security_card: 'Social Security card',
  insurance_card: 'Insurance card',
  vehicle_registration: 'Vehicle registration',
  vehicle_title: 'Vehicle title',
  medical_record: 'Medical record',
  tax_document: 'Tax document',
  bank_document: 'Bank document',
  warranty: 'Warranty',
  receipt: 'Receipt',
  contract: 'Contract',
  other: 'Document',
}

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v)
}

export function documentKindLabel(kind: DocumentKind): string {
  return KIND_LABELS[kind]
}

/** Reduce a sensitive document's facets to a single kind-derived summary.
 *  Non-sensitive kinds pass through untouched.
 *
 *  Applied server-side BEFORE the row write, not at render time — the
 *  guarantee is that the value never lands in the database at all. The model
 *  is asked to withhold; this is what enforces it. */
export function stripSensitive(facets: Facet[], kind: DocumentKind): Facet[] {
  if (!SENSITIVE_KINDS.has(kind)) return facets
  return [{ type: 'summary', text: KIND_LABELS[kind] }]
}

export interface DocumentProposal {
  kind: DocumentKind
  label: string
  owner: string | null
  expiresOn: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Parse the `document` block the vision model returns. Anything malformed
 *  degrades to null ("not a document") rather than throwing. */
export function parseDocumentProposal(raw: unknown): DocumentProposal | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (!isDocumentKind(d.kind)) return null
  const expiresOn = str(d.expires_on)
  return {
    kind: d.kind,
    label: str(d.label) ?? KIND_LABELS[d.kind],
    owner: str(d.owner),
    expiresOn: expiresOn && ISO_DATE.test(expiresOn) ? expiresOn : null,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/types/document.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/document.ts src/types/document.test.ts
git commit -m "feat(documents): document vocabulary + stripSensitive redaction control"
```

---

### Task 3: Edge twin of the document vocabulary

Edge functions run in Deno and cannot import from `src/`. This is a hand-maintained copy, exactly as `_shared/facets.ts` is a copy of `src/types/facets.ts`.

**Files:**
- Create: `supabase/functions/_shared/documents.ts`
- Test: `supabase/functions/_shared/documents.test.ts`

**Interfaces:**
- Consumes: `Facet` from `supabase/functions/_shared/facets.ts`.
- Produces: the same exports as Task 2, importable by edge functions.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/documents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Facet } from './facets.ts'
import {
  SENSITIVE_KINDS,
  stripSensitive,
  parseDocumentProposal,
  documentKindLabel,
  type DocumentKind,
} from './documents.ts'

const loaded: Facet[] = [
  { type: 'summary', text: 'Passport for Scott Kaufman, no. 123456789' },
  { type: 'access_code', label: 'Passport no', code: '123456789' },
  { type: 'location', address: '742 Evergreen Terrace' },
  { type: 'datetime', label: 'Expires', iso: '2031-01-02T00:00:00' },
]

describe('edge stripSensitive', () => {
  it.each([...SENSITIVE_KINDS])('reduces %s to one summary and leaks nothing', (kind) => {
    const out = stripSensitive(loaded, kind as DocumentKind)
    expect(out).toEqual([{ type: 'summary', text: documentKindLabel(kind as DocumentKind) }])
    expect(JSON.stringify(out)).not.toContain('123456789')
    expect(JSON.stringify(out)).not.toContain('Evergreen')
  })

  it('passes non-sensitive kinds through', () => {
    expect(stripSensitive(loaded, 'receipt')).toEqual(loaded)
  })
})

describe('edge parseDocumentProposal', () => {
  it('parses and rejects symmetrically with the client twin', () => {
    expect(parseDocumentProposal({ kind: 'passport', expires_on: '2031-01-02' })?.expiresOn).toBe('2031-01-02')
    expect(parseDocumentProposal({ kind: 'not_a_kind' })).toBeNull()
    expect(parseDocumentProposal(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/documents.test.ts`
Expected: FAIL — cannot resolve `./documents.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/documents.ts` with the **identical body** of `src/types/document.ts` from Task 2, changing only the import line at the top:

```ts
/** Edge-side document vocabulary — twin of src/types/document.ts.
 *  Keep the two in sync. */
import type { Facet } from './facets.ts'
```

Everything below that line — `DOCUMENT_KINDS`, `DocumentKind`, `DocumentStatus`, `DocumentScope`, `SENSITIVE_KINDS`, `KIND_LABELS`, `isDocumentKind`, `documentKindLabel`, `stripSensitive`, `DocumentProposal`, `ISO_DATE`, `str`, `parseDocumentProposal` — is copied verbatim from Task 2 Step 3.

- [ ] **Step 4: Run both twins' tests to verify they pass together**

Run: `npx vitest run supabase/functions/_shared/documents.test.ts src/types/document.test.ts`
Expected: PASS, both files green.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/documents.ts supabase/functions/_shared/documents.test.ts
git commit -m "feat(documents): edge twin of the document vocabulary"
```

---

### Task 4: Classification in `analyze-attachment`

**Files:**
- Modify: `supabase/functions/analyze-attachment/index.ts`

**Interfaces:**
- Consumes: `stripSensitive`, `parseDocumentProposal` from `../_shared/documents.ts`.
- Produces: rows with `document_status = 'proposed'` and populated `document_*` columns; `facets` already redacted for sensitive kinds.

- [ ] **Step 1: Add the import**

At the top of `supabase/functions/analyze-attachment/index.ts`, next to the existing facets import:

```ts
import { tryParseFacets, type Facet } from '../_shared/facets.ts'
import { parseDocumentProposal, stripSensitive } from '../_shared/documents.ts'
```

- [ ] **Step 2: Extend the prompt**

In `buildPrompt`, append to the end of the returned template string (after the existing `Rules:` block):

```
Also decide whether this file is a DURABLE DOCUMENT — something the user will need again later, independent of whatever it is attached to (an ID, a passport, an insurance card, a registration, a title, a policy, a warranty, a contract, a tax or bank statement, a medical record).

If it is, add a sibling key to the JSON object:
"document": {"kind":"<one of: drivers_license, passport, birth_certificate, social_security_card, insurance_card, vehicle_registration, vehicle_title, medical_record, tax_document, bank_document, warranty, receipt, contract, other>","label":"short human name, e.g. Scott's driver's license","owner":"whose document it is, if visible","expires_on":"YYYY-MM-DD if an expiry is printed"}

Omit the "document" key entirely for ordinary files (a party invite, a photo of a broken part, a screenshot). A receipt is only a document when it is proof of a purchase worth keeping — not a grocery receipt.
```

- [ ] **Step 3: Parse the document block alongside facets**

`tryParseFacets` already unwraps `{facets: [...]}`, so the raw model text must be parsed once for the document block. Replace the existing parse block:

```ts
  const prompt = buildPrompt(entityContext)
  let facets: Facet[] = []
  let proposal: ReturnType<typeof parseDocumentProposal> = null
  try {
    const raw = await callVision(signed.signedUrl, isPdf, prompt, apiKey)
    const result = tryParseFacets(raw)
    if (result === null) throw new Error('Invalid facets structure from model')
    facets = result

    // The document block rides alongside `facets` in the same object.
    // A parse failure here must not lose the facets we already have.
    try {
      const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      const obj = JSON.parse(stripped) as Record<string, unknown>
      proposal = parseDocumentProposal(obj.document)
    } catch {
      proposal = null
    }

    // Redaction happens BEFORE the write: a sensitive document's own numbers
    // never reach the row, and therefore never reach the context graph.
    if (proposal) facets = stripSensitive(facets, proposal.kind)
  } catch (err) {
```

- [ ] **Step 4: Write the document columns in `finish`**

Replace the `finish` helper so it also persists the proposal:

```ts
  const finish = async (facets: unknown[], proposal: ReturnType<typeof parseDocumentProposal> = null) => {
    const patch: Record<string, unknown> = { facets, analyzed_at: new Date().toISOString() }
    if (proposal) {
      patch.document_status = 'proposed'
      patch.document_kind = proposal.kind
      patch.document_label = proposal.label
      patch.document_owner = proposal.owner
      patch.document_expires_on = proposal.expiresOn
    }
    const { error } = await db.from('attachments').update(patch).eq('id', attachmentId)
    if (error) console.error('facets write failed:', error.message)
  }
```

Then update the success call site to pass it: `await finish(facets, proposal)`.

Note: `document_scope` is deliberately not set here — the column default (`'private'`) is the intended value, and letting the default apply is what guarantees a proposal can never arrive pre-shared.

- [ ] **Step 5: Type-check the edge function**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. (Edge functions are excluded from the app tsconfig; this confirms nothing in `src/` broke. Deno type errors surface at deploy.)

- [ ] **Step 6: Deploy the function**

Run: `npx supabase functions deploy analyze-attachment --project-ref mwadppyrqzuzgstmwpuy --use-api`
Expected: `Deployed Function analyze-attachment`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/analyze-attachment/index.ts
git commit -m "feat(documents): classify durable documents and redact sensitive facets pre-write"
```

---

### Task 5: `useDocuments` hook

**Files:**
- Create: `src/hooks/useDocuments.ts`
- Test: `src/hooks/useDocuments.test.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`, `useAuth` from `@/hooks/useAuth`, types from `@/types/document`.
- Produces:
  - `SymphonyDocument` = `{ id, fileName, fileType, fileSize, storagePath, kind, label, owner, expiresOn, scope, status, sourceEntityType, sourceEntityId, createdAt }`
  - `useDocuments(): { documents, proposals, isLoading, error, keepDocument, dismissDocument, updateDocument, setScope, deleteDocument, reload }`
  - `daysUntil(expiresOn: string | null, today?: Date): number | null`
  - `EXPIRY_WARNING_DAYS = 60`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useDocuments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { daysUntil, EXPIRY_WARNING_DAYS, useDocuments } from '@/hooks/useDocuments'

const rows = [
  {
    id: 'a1', entity_type: 'task', entity_id: 't1',
    file_name: 'license.jpg', file_type: 'image/jpeg', file_size: 1024,
    storage_path: 'u1/task/t1/license.jpg',
    document_status: 'kept', document_kind: 'drivers_license',
    document_label: "Scott's driver's license", document_owner: 'Scott',
    document_expires_on: '2029-03-14', document_scope: 'private',
    created_at: '2026-08-05T10:00:00Z',
  },
  {
    id: 'a2', entity_type: 'task', entity_id: 't2',
    file_name: 'passport.pdf', file_type: 'application/pdf', file_size: 2048,
    storage_path: 'u1/task/t2/passport.pdf',
    document_status: 'proposed', document_kind: 'passport',
    document_label: 'Passport', document_owner: null,
    document_expires_on: null, document_scope: 'private',
    created_at: '2026-08-05T11:00:00Z',
  },
]

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: rows, error: null }),
          })),
        })),
      })),
      update,
    })),
  },
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

beforeEach(() => {
  update.mockClear()
  updateEq.mockClear()
})

describe('daysUntil', () => {
  const today = new Date('2026-08-05T12:00:00Z')

  it('counts forward to a future date', () => {
    expect(daysUntil('2026-08-15', today)).toBe(10)
  })

  it('returns 0 on the day itself', () => {
    expect(daysUntil('2026-08-05', today)).toBe(0)
  })

  it('goes negative once expired', () => {
    expect(daysUntil('2026-08-01', today)).toBe(-4)
  })

  it('returns null when there is no expiry', () => {
    expect(daysUntil(null, today)).toBeNull()
  })
})

describe('useDocuments', () => {
  it('splits kept documents from proposals', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.documents.map((d) => d.id)).toEqual(['a1'])
    expect(result.current.proposals.map((d) => d.id)).toEqual(['a2'])
    expect(result.current.documents[0].label).toBe("Scott's driver's license")
    expect(result.current.documents[0].sourceEntityType).toBe('task')
  })

  it('keepDocument promotes to kept', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.keepDocument('a2') })
    expect(update).toHaveBeenCalledWith({ document_status: 'kept' })
    expect(updateEq).toHaveBeenCalledWith('id', 'a2')
  })

  it('dismissDocument marks dismissed', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.dismissDocument('a2') })
    expect(update).toHaveBeenCalledWith({ document_status: 'dismissed' })
  })

  it('setScope writes the requested scope', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.setScope('a1', 'household') })
    expect(update).toHaveBeenCalledWith({ document_scope: 'household' })
  })

  it('exposes a 60-day warning threshold', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(60)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useDocuments.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useDocuments`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useDocuments.ts`:

```ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentKind, DocumentScope, DocumentStatus } from '@/types/document'

/** How far ahead an expiry starts mattering — used by the shelf's warning
 *  styling and mirrored by the proactive-engine expiry rule. */
export const EXPIRY_WARNING_DAYS = 60

const MS_PER_DAY = 86_400_000

/** Whole days from today to `expiresOn`. Negative once past. Null when absent.
 *  Both sides are floored to UTC midnight so the result never depends on the
 *  time of day the function happens to be called. */
export function daysUntil(expiresOn: string | null, today: Date = new Date()): number | null {
  if (!expiresOn) return null
  const then = Date.parse(`${expiresOn}T00:00:00Z`)
  if (Number.isNaN(then)) return null
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((then - now) / MS_PER_DAY)
}

export interface SymphonyDocument {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  kind: DocumentKind
  label: string
  owner: string | null
  expiresOn: string | null
  scope: DocumentScope
  status: DocumentStatus
  /** Where the file was originally attached; null for direct shelf uploads. */
  sourceEntityType: string | null
  sourceEntityId: string | null
  createdAt: Date
}

interface DbRow {
  id: string
  entity_type: string
  entity_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  document_status: string
  document_kind: string
  document_label: string | null
  document_owner: string | null
  document_expires_on: string | null
  document_scope: string
  created_at: string
}

function toDocument(row: DbRow): SymphonyDocument {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    kind: row.document_kind as DocumentKind,
    label: row.document_label ?? row.file_name,
    owner: row.document_owner,
    expiresOn: row.document_expires_on,
    scope: row.document_scope as DocumentScope,
    status: row.document_status as DocumentStatus,
    sourceEntityType: row.entity_type === 'document' ? null : row.entity_type,
    sourceEntityId: row.entity_type === 'document' ? null : row.entity_id,
    createdAt: new Date(row.created_at),
  }
}

export function useDocuments() {
  const { user } = useAuth()
  const [rows, setRows] = useState<SymphonyDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) { setIsLoading(false); return }
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('attachments')
      .select('id, entity_type, entity_id, file_name, file_type, file_size, storage_path, document_status, document_kind, document_label, document_owner, document_expires_on, document_scope, created_at')
      .eq('user_id', user.id)
      .in('document_status', ['kept', 'proposed'])
      .order('created_at', { ascending: false })
    setIsLoading(false)
    if (err) { setError(err.message); return }
    setError(null)
    setRows(((data ?? []) as DbRow[]).map(toDocument))
  }, [user])

  useEffect(() => { void reload() }, [reload])

  const patch = useCallback(
    async (id: string, values: Record<string, unknown>): Promise<boolean> => {
      setRows((prev) => prev.filter((d) => d.id !== id || values.document_status !== 'dismissed'))
      const { error: err } = await supabase.from('attachments').update(values).eq('id', id)
      if (err) { setError(err.message); await reload(); return false }
      await reload()
      return true
    },
    [reload]
  )

  const keepDocument = useCallback((id: string) => patch(id, { document_status: 'kept' }), [patch])
  const dismissDocument = useCallback((id: string) => patch(id, { document_status: 'dismissed' }), [patch])
  const setScope = useCallback(
    (id: string, scope: DocumentScope) => patch(id, { document_scope: scope }),
    [patch]
  )
  const updateDocument = useCallback(
    (id: string, values: { label?: string; owner?: string | null; expiresOn?: string | null }) =>
      patch(id, {
        ...(values.label !== undefined ? { document_label: values.label } : {}),
        ...(values.owner !== undefined ? { document_owner: values.owner } : {}),
        ...(values.expiresOn !== undefined ? { document_expires_on: values.expiresOn } : {}),
      }),
    [patch]
  )

  const deleteDocument = useCallback(
    async (doc: SymphonyDocument): Promise<boolean> => {
      setRows((prev) => prev.filter((d) => d.id !== doc.id))
      const { error: storageErr } = await supabase.storage.from('attachments').remove([doc.storagePath])
      if (storageErr) { setError(storageErr.message); await reload(); return false }
      const { error: delErr } = await supabase.from('attachments').delete().eq('id', doc.id)
      if (delErr) { setError(delErr.message); await reload(); return false }
      return true
    },
    [reload]
  )

  return {
    documents: rows.filter((d) => d.status === 'kept'),
    proposals: rows.filter((d) => d.status === 'proposed'),
    isLoading,
    error,
    keepDocument,
    dismissDocument,
    updateDocument,
    setScope,
    deleteDocument,
    reload,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/useDocuments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDocuments.ts src/hooks/useDocuments.test.ts
git commit -m "feat(documents): useDocuments hook with expiry math"
```

---

### Task 6: The promotion row on attachment panels

**Files:**
- Create: `src/components/surface/sections/DocumentProposal.tsx`
- Test: `src/components/surface/sections/DocumentProposal.test.tsx`
- Modify: `src/components/surface/sections/PanelPhotos.tsx`

**Interfaces:**
- Consumes: `documentKindLabel` from `@/types/document`.
- Produces: `<DocumentProposalRow kind label onKeep onDismiss />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/surface/sections/DocumentProposal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentProposalRow } from './DocumentProposal'

describe('DocumentProposalRow', () => {
  it('names the kind it recognized', () => {
    render(<DocumentProposalRow kind="drivers_license" label="Scott's driver's license" onKeep={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/driver's license/i)).toBeInTheDocument()
  })

  it('calls onKeep when kept', () => {
    const onKeep = vi.fn()
    render(<DocumentProposalRow kind="passport" label="Passport" onKeep={onKeep} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /keep in documents/i }))
    expect(onKeep).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when rejected', () => {
    const onDismiss = vi.fn()
    render(<DocumentProposalRow kind="passport" label="Passport" onKeep={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /not a document/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/surface/sections/DocumentProposal.test.tsx`
Expected: FAIL — cannot resolve `./DocumentProposal`.

- [ ] **Step 3: Write the component**

Create `src/components/surface/sections/DocumentProposal.tsx`:

```tsx
import { FileBadge } from 'lucide-react'
import { documentKindLabel, type DocumentKind } from '@/types/document'

interface Props {
  kind: DocumentKind
  label: string
  onKeep: () => void
  onDismiss: () => void
}

/** One binary decision: is this a document worth keeping? Editing its label,
 *  owner, and expiry happens on the shelf, not here. */
export function DocumentProposalRow({ kind, label, onKeep, onDismiss }: Props) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-primary-50/50 shadow-[inset_0_0_0_1px_var(--color-primary-200,#c9dcc9)]">
      <FileBadge className="w-4 h-4 shrink-0 text-primary-600" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-800 truncate">
          Looks like a <span className="font-medium">{documentKindLabel(kind).toLowerCase()}</span>
        </div>
        <div className="text-[12px] text-neutral-500 truncate">{label}</div>
      </div>
      <button onClick={onKeep} className="text-[12px] font-medium text-primary-700 hover:text-primary-800 whitespace-nowrap">
        Keep in Documents
      </button>
      <button onClick={onDismiss} className="text-[12px] text-neutral-500 hover:text-neutral-700 whitespace-nowrap">
        Not a document
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/surface/sections/DocumentProposal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire it into `PanelPhotos`**

In `src/components/surface/sections/PanelPhotos.tsx`:

Add imports:
```tsx
import { DocumentProposalRow } from './DocumentProposal'
import { isDocumentKind } from '@/types/document'
import { supabase } from '@/lib/supabase'
```

Extend the attachment select so the document columns come back. Find the `.select(...)` that loads attachments in this file and add `document_status, document_kind, document_label` to the column list (this file selects explicit columns — do not switch it to `*`).

Add a handler above the return:
```tsx
  const setDocumentStatus = useCallback(
    async (attachmentId: string, status: 'kept' | 'dismissed') => {
      await supabase.from('attachments').update({ document_status: status }).eq('id', attachmentId)
      await reload()
    },
    [reload]
  )
```

In the facets block near line 332, render the proposal above the facet chips:
```tsx
        <div key={`facets-${att.id}`}>
          {att.document_status === 'proposed' && isDocumentKind(att.document_kind) && (
            <DocumentProposalRow
              kind={att.document_kind}
              label={att.document_label ?? att.file_name}
              onKeep={() => void setDocumentStatus(att.id, 'kept')}
              onDismiss={() => void setDocumentStatus(att.id, 'dismissed')}
            />
          )}
          <AttachmentFacets facets={att.facets} promotions={promotions} />
        </div>
```

Add the three fields to whatever local attachment type this file uses so `tsc` stays green.

- [ ] **Step 6: Run the panel tests and type-check**

Run: `npx vitest run src/components/surface/sections/PanelPhotos.test.tsx src/components/surface/sections/DocumentProposal.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/surface/sections/DocumentProposal.tsx src/components/surface/sections/DocumentProposal.test.tsx src/components/surface/sections/PanelPhotos.tsx
git commit -m "feat(documents): propose keeping a recognized document from the attachment panel"
```

---

### Task 7: The shelf — `/documents`

**Files:**
- Create: `src/apps/documents/DocumentRow.tsx`
- Create: `src/apps/documents/DocumentsApp.tsx`
- Create: `src/apps/documents/index.ts`
- Test: `src/apps/documents/DocumentsApp.test.tsx`
- Modify: `src/shell/appRegistry.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `useDocuments`, `daysUntil`, `EXPIRY_WARNING_DAYS` from Task 5; `documentKindLabel` from Task 2.
- Produces: `documentsAppDef: AppDef` at route `/documents`.

- [ ] **Step 1: Write the failing test**

Create `src/apps/documents/DocumentsApp.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentsApp } from './DocumentsApp'
import type { SymphonyDocument } from '@/hooks/useDocuments'

function doc(over: Partial<SymphonyDocument> = {}): SymphonyDocument {
  return {
    id: 'a1', fileName: 'license.jpg', fileType: 'image/jpeg', fileSize: 1024,
    storagePath: 'u1/task/t1/license.jpg', kind: 'drivers_license',
    label: "Scott's driver's license", owner: 'Scott', expiresOn: null,
    scope: 'private', status: 'kept', sourceEntityType: 'task',
    sourceEntityId: 't1', createdAt: new Date('2026-08-05'), ...over,
  }
}

const state = {
  documents: [] as SymphonyDocument[],
  proposals: [] as SymphonyDocument[],
  isLoading: false,
  error: null as string | null,
  keepDocument: vi.fn(), dismissDocument: vi.fn(), updateDocument: vi.fn(),
  setScope: vi.fn(), deleteDocument: vi.fn(), reload: vi.fn(),
}

vi.mock('@/hooks/useDocuments', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDocuments')>('@/hooks/useDocuments')
  return { ...actual, useDocuments: () => state }
})

describe('DocumentsApp', () => {
  it('shows an empty state when the shelf is bare', () => {
    state.documents = []
    render(<DocumentsApp />)
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
  })

  it('lists a kept document with its kind', () => {
    state.documents = [doc()]
    render(<DocumentsApp />)
    expect(screen.getByText("Scott's driver's license")).toBeInTheDocument()
    expect(screen.getByText(/driver's license/i)).toBeInTheDocument()
  })

  it('groups by owner', () => {
    state.documents = [doc({ owner: 'Scott' }), doc({ id: 'a2', owner: 'Iris', label: 'Iris passport' })]
    render(<DocumentsApp />)
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })

  it('warns when an expiry is inside the threshold', () => {
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    state.documents = [doc({ expiresOn: soon })]
    render(<DocumentsApp />)
    expect(screen.getByText(/expires in 20 days/i)).toBeInTheDocument()
  })

  it('marks an already-expired document', () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    state.documents = [doc({ expiresOn: past })]
    render(<DocumentsApp />)
    expect(screen.getByText(/expired/i)).toBeInTheDocument()
  })

  it('shows pending proposals above the shelf', () => {
    state.documents = []
    state.proposals = [doc({ id: 'p1', status: 'proposed', label: 'Passport', kind: 'passport' })]
    render(<DocumentsApp />)
    expect(screen.getByRole('button', { name: /keep in documents/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/apps/documents/DocumentsApp.test.tsx`
Expected: FAIL — cannot resolve `./DocumentsApp`.

- [ ] **Step 3: Write `DocumentRow`**

Create `src/apps/documents/DocumentRow.tsx`:

```tsx
import { useState } from 'react'
import { FileText, Lock, Users, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { documentKindLabel } from '@/types/document'
import { daysUntil, EXPIRY_WARNING_DAYS, type SymphonyDocument } from '@/hooks/useDocuments'

interface Props {
  document: SymphonyDocument
  onToggleScope: () => void
  onDelete: () => void
}

function expiryNote(expiresOn: string | null): { text: string; tone: 'warn' | 'expired' | 'quiet' } | null {
  const days = daysUntil(expiresOn)
  if (days === null) return null
  if (days < 0) return { text: 'Expired', tone: 'expired' }
  if (days === 0) return { text: 'Expires today', tone: 'warn' }
  if (days <= EXPIRY_WARNING_DAYS) return { text: `Expires in ${days} days`, tone: 'warn' }
  return { text: `Expires ${expiresOn}`, tone: 'quiet' }
}

export function DocumentRow({ document, onToggleScope, onDelete }: Props) {
  const [opening, setOpening] = useState(false)
  const note = expiryNote(document.expiresOn)

  async function open() {
    setOpening(true)
    const { data } = await supabase.storage.from('attachments').createSignedUrl(document.storagePath, 3600)
    setOpening(false)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white shadow-[inset_0_0_0_1px_#e5e7eb]">
      <FileText className="w-5 h-5 shrink-0 text-neutral-400" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] text-neutral-800 truncate">{document.label}</div>
        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
          <span>{documentKindLabel(document.kind)}</span>
          {note && (
            <>
              <span aria-hidden>·</span>
              <span className={note.tone === 'expired' ? 'text-red-600 font-medium' : note.tone === 'warn' ? 'text-amber-700 font-medium' : ''}>
                {note.text}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={onToggleScope}
        title={document.scope === 'private' ? 'Private to you' : 'Shared with household'}
        aria-label={document.scope === 'private' ? 'Private to you' : 'Shared with household'}
        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
      >
        {document.scope === 'private' ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
      </button>
      <button onClick={() => void open()} disabled={opening} aria-label="Open document" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
        <ExternalLink className="w-4 h-4" />
      </button>
      <button onClick={onDelete} aria-label="Delete document" className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Write `DocumentsApp`**

Create `src/apps/documents/DocumentsApp.tsx`:

```tsx
import { useMemo } from 'react'
import { useDocuments, type SymphonyDocument } from '@/hooks/useDocuments'
import { DocumentRow } from './DocumentRow'
import { DocumentProposalRow } from '@/components/surface/sections/DocumentProposal'

function groupByOwner(docs: SymphonyDocument[]): [string, SymphonyDocument[]][] {
  const groups = new Map<string, SymphonyDocument[]>()
  for (const d of docs) {
    const key = d.owner?.trim() || 'Unassigned'
    const bucket = groups.get(key)
    if (bucket) bucket.push(d)
    else groups.set(key, [d])
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )
}

export function DocumentsApp() {
  const { documents, proposals, isLoading, error, keepDocument, dismissDocument, setScope, deleteDocument } = useDocuments()
  const groups = useMemo(() => groupByOwner(documents), [documents])

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-display text-neutral-900 mb-1">Documents</h1>
      <p className="text-[14px] text-neutral-500 mb-6">
        Things you'll need again. Private unless you share them.
      </p>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {proposals.length > 0 && (
        <section className="mb-8 space-y-2">
          <h2 className="text-[12px] uppercase tracking-wide text-neutral-400 mb-2">Suggested</h2>
          {proposals.map((p) => (
            <DocumentProposalRow
              key={p.id}
              kind={p.kind}
              label={p.label}
              onKeep={() => void keepDocument(p.id)}
              onDismiss={() => void dismissDocument(p.id)}
            />
          ))}
        </section>
      )}

      {isLoading ? (
        <div className="text-sm text-neutral-400">Loading…</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No documents yet. When you attach something like a license or an insurance card,
          Symphony will offer to keep it here.
        </div>
      ) : (
        groups.map(([owner, docs]) => (
          <section key={owner} className="mb-8">
            <h2 className="text-[12px] uppercase tracking-wide text-neutral-400 mb-2">{owner}</h2>
            <div className="space-y-2">
              {docs.map((d) => (
                <DocumentRow
                  key={d.id}
                  document={d}
                  onToggleScope={() => void setScope(d.id, d.scope === 'private' ? 'household' : 'private')}
                  onDelete={() => void deleteDocument(d)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the app definition**

Create `src/apps/documents/index.ts`:

```ts
import type { AppDef } from '@/shell/types'
import { DocumentsApp } from './DocumentsApp'

// Documents shelf. No selection kind — documents open via signed URL in a new
// tab rather than through the global DetailPanel.
export const documentsAppDef: AppDef = {
  id: 'documents',
  route: '/documents',
  Component: DocumentsApp,
}
```

- [ ] **Step 6: Register the app**

In `src/shell/appRegistry.ts`, add the import next to `contactsAppDef`:
```ts
import { documentsAppDef } from '@/apps/documents';
```
and add `documentsAppDef,` to the `createRegistry([...])` array, after `contactsAppDef,`.

- [ ] **Step 7: Add the sidebar entry**

In `src/components/layout/Sidebar.tsx`, add `FileText` to the existing `lucide-react` import, then add this button inside the `SidebarGroup label="Library"` block, immediately after the Contacts button:

```tsx
          {/* Documents */}
          <button
            onClick={() => navigate('/documents')}
            className={navItemClass(location.pathname.startsWith('/documents'))}
          >
            {createElement(FileText, { className: 'w-5 h-5 shrink-0' })}
            {!collapsed && <span>Documents</span>}
          </button>
```

- [ ] **Step 8: Run the tests and type-check**

Run: `npx vitest run src/apps/documents/DocumentsApp.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/apps/documents src/shell/appRegistry.ts src/components/layout/Sidebar.tsx
git commit -m "feat(documents): /documents shelf in the Library sidebar group"
```

---

### Task 8: Direct upload into the shelf

Without this, adding a passport requires inventing a fake task.

**Files:**
- Modify: `src/types/attachment.ts`
- Modify: `src/lib/taskAttachments.ts`
- Modify: `src/apps/documents/DocumentsApp.tsx`
- Test: `src/apps/documents/DocumentsApp.test.tsx`

**Interfaces:**
- Consumes: `uploadAttachment` from `src/lib/taskAttachments.ts`, `useDocuments().reload`.
- Produces: rows with `entity_type = 'document'`, `entity_id = user_id`, `document_status = 'proposed'`.

- [ ] **Step 1: Write the failing test**

Add to `src/apps/documents/DocumentsApp.test.tsx`:

```tsx
  it('offers a direct upload control', () => {
    state.documents = []
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByLabelText(/add a document/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/apps/documents/DocumentsApp.test.tsx -t "direct upload"`
Expected: FAIL — unable to find a label matching `/add a document/i`.

- [ ] **Step 3: Widen the entity type**

In `src/types/attachment.ts` line 2, add `'document'`:
```ts
export type AttachmentEntityType = 'task' | 'project' | 'event_note' | 'instance_note' | 'note' | 'routine' | 'document'
```

In `src/lib/taskAttachments.ts`, find the parallel entity-kind list described in its line-4 comment ("Entity kinds the `attachments` table accepts (its CHECK constraint)") and add `'document'` there too. The two lists must agree with the DB constraint from Task 1.

- [ ] **Step 4: Add the upload control**

In `src/apps/documents/DocumentsApp.tsx`, add imports:
```tsx
import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { uploadAttachment } from '@/lib/taskAttachments'
```

Inside the component, above the return:
```tsx
  const { user } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setUploading(true)
    // entity_id = the user themselves: a shelf document has no parent entity.
    await uploadAttachment('document', user.id, file)
    setUploading(false)
    await reload()
  }
```

Add `reload` to the `useDocuments()` destructure. Render the control next to the heading:
```tsx
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-display text-neutral-900">Documents</h1>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-label="Add a document"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] text-primary-700 hover:bg-primary-50"
        >
          <Plus className="w-4 h-4" />
          {uploading ? 'Uploading…' : 'Add'}
        </button>
      </div>
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => void onPick(e)} />
```
(replacing the standalone `<h1>` from Task 7 Step 4).

Verify `uploadAttachment`'s real exported name and signature in `src/lib/taskAttachments.ts` before wiring — if it differs, match the existing call site used by `PanelPhotos.tsx`.

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run src/apps/documents/DocumentsApp.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/attachment.ts src/lib/taskAttachments.ts src/apps/documents/DocumentsApp.tsx src/apps/documents/DocumentsApp.test.tsx
git commit -m "feat(documents): upload straight into the shelf"
```

---

### Task 9: Expiry surfacing through `proactive-engine`

Deliberately **not** a new row type on Today — Today is a commitment surface with a space invariant. This routes through the existing suggestion layer instead.

**Files:**
- Create: `supabase/functions/proactive-engine/lib/documentRules.ts`
- Test: `supabase/functions/proactive-engine/lib/documentRules.test.ts`
- Modify: `supabase/functions/proactive-engine/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime (it reads the DB columns from Task 1).
- Produces: `documentExpirySuggestions(docs, today): DocumentSuggestion[]`, shaped to match the existing `Suggestion` interface in `proactive-engine/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/proactive-engine/lib/documentRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { documentExpirySuggestions, EXPIRY_WARNING_DAYS } from './documentRules.ts'

const today = new Date('2026-08-05T12:00:00Z')

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    document_label: "Scott's driver's license",
    document_kind: 'drivers_license',
    document_expires_on: '2026-09-01',
    ...over,
  }
}

describe('documentExpirySuggestions', () => {
  it('suggests renewing a document inside the window', () => {
    const out = documentExpirySuggestions([doc()], today)
    expect(out).toHaveLength(1)
    expect(out[0].title).toMatch(/driver's license/i)
    expect(out[0].suggestion_key).toBe('document:a1:expiry')
    expect(out[0].entity_type).toBe('document')
  })

  it('ignores a document expiring beyond the window', () => {
    expect(documentExpirySuggestions([doc({ document_expires_on: '2029-03-14' })], today)).toHaveLength(0)
  })

  it('ignores a document with no expiry', () => {
    expect(documentExpirySuggestions([doc({ document_expires_on: null })], today)).toHaveLength(0)
  })

  it('includes the boundary day exactly', () => {
    const boundary = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10)
    expect(documentExpirySuggestions([doc({ document_expires_on: boundary })], today)).toHaveLength(1)
  })

  it('excludes the day after the boundary', () => {
    const past = new Date(today.getTime() + (EXPIRY_WARNING_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
    expect(documentExpirySuggestions([doc({ document_expires_on: past })], today)).toHaveLength(0)
  })

  it('still surfaces an already-expired document, with higher urgency', () => {
    const out = documentExpirySuggestions([doc({ document_expires_on: '2026-08-01' })], today)
    expect(out).toHaveLength(1)
    expect(out[0].title).toMatch(/expired/i)
    expect(out[0].urgency).toBeGreaterThan(0.8)
  })

  it('never puts the document number or any facet content in the suggestion', () => {
    const out = documentExpirySuggestions([doc()], today)
    expect(JSON.stringify(out)).not.toMatch(/\d{6,}/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/proactive-engine/lib/documentRules.test.ts`
Expected: FAIL — cannot resolve `./documentRules.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/proactive-engine/lib/documentRules.ts`:

```ts
/** Expiry rule for shelf documents. Deliberately carries only the label and
 *  the date — never facet content — so a renewal nudge can never become a
 *  vector for the document's own contents. */

export const EXPIRY_WARNING_DAYS = 60
const MS_PER_DAY = 86_400_000

export interface DocumentRow {
  id: string
  document_label: string | null
  document_kind: string | null
  document_expires_on: string | null
}

export interface DocumentSuggestion {
  entity_type: 'document'
  entity_id: string
  suggestion_type: 'renew'
  title: string
  detail: string
  confidence: number
  action_type: 'open_documents'
  action_payload: Record<string, unknown>
  suggestion_key: string
  urgency: number
}

function daysUntil(expiresOn: string, today: Date): number | null {
  const then = Date.parse(`${expiresOn}T00:00:00Z`)
  if (Number.isNaN(then)) return null
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((then - now) / MS_PER_DAY)
}

export function documentExpirySuggestions(
  docs: DocumentRow[],
  today: Date = new Date()
): DocumentSuggestion[] {
  const out: DocumentSuggestion[] = []
  for (const d of docs) {
    if (!d.document_expires_on) continue
    const days = daysUntil(d.document_expires_on, today)
    if (days === null || days > EXPIRY_WARNING_DAYS) continue

    const label = d.document_label ?? 'A document'
    const expired = days < 0
    out.push({
      entity_type: 'document',
      entity_id: d.id,
      suggestion_type: 'renew',
      title: expired ? `${label} has expired` : `${label} expires in ${days} days`,
      detail: expired ? 'Renew it when you get a chance.' : `Expires ${d.document_expires_on}.`,
      confidence: 0.9,
      action_type: 'open_documents',
      action_payload: { documentId: d.id },
      suggestion_key: `document:${d.id}:expiry`,
      // Expired outranks expiring; inside the window urgency rises as the date nears.
      urgency: expired ? 0.95 : 0.5 + 0.3 * (1 - days / EXPIRY_WARNING_DAYS),
    })
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run supabase/functions/proactive-engine/lib/documentRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Call the rule from the engine**

In `supabase/functions/proactive-engine/index.ts`, add the import beside the existing `facetRuleSuggestions` import:

```ts
import { documentExpirySuggestions } from './lib/documentRules.ts'
```

Find where the engine collects rule suggestions for a user (the site that calls `facetRuleSuggestions` and pushes into the suggestion array). Alongside it, fetch kept documents and push their suggestions:

```ts
  const { data: documentRows } = await db
    .from('attachments')
    .select('id, document_label, document_kind, document_expires_on')
    .eq('document_status', 'kept')
    .not('document_expires_on', 'is', null)
  suggestions.push(...documentExpirySuggestions(documentRows ?? []))
```

Use the same user-scoped client (`db`) the surrounding code uses so RLS applies. If the surrounding code scopes by `user_id` explicitly, add `.eq('user_id', userId)` to match.

- [ ] **Step 6: Deploy and verify the whole suite**

Run: `npx supabase functions deploy proactive-engine --project-ref mwadppyrqzuzgstmwpuy --use-api`
Expected: `Deployed Function proactive-engine`.

Run: `npx vitest run`
Expected: PASS, whole suite green.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/proactive-engine/lib/documentRules.ts supabase/functions/proactive-engine/lib/documentRules.test.ts supabase/functions/proactive-engine/index.ts
git commit -m "feat(documents): surface upcoming document expiries via proactive-engine"
```

---

### Task 10: Backfill existing attachments

Repairs rows written before this feature existed — including the license that prompted the work — without anyone reading the data.

**Files:**
- Create: `scripts/backfill-documents.ts`

**Interfaces:**
- Consumes: the deployed `analyze-attachment` from Task 4.
- Produces: nothing new; mutates existing rows.

- [ ] **Step 1: Write the script**

Create `scripts/backfill-documents.ts`:

```ts
/** One-time backfill: re-run classification over already-analyzed attachments
 *  so documents uploaded before the shelf existed get proposed, and so any
 *  sensitive facets already persisted get stripped.
 *
 *  Idempotent: clearing analyzed_at makes analyze-attachment reprocess the row,
 *  and it rewrites both facets and the document_* columns.
 *
 *  Run with a USER JWT, not the service role — service role bypasses RLS and
 *  would sweep every user's rows.
 *
 *    SUPABASE_URL=... SUPABASE_ANON_KEY=... USER_JWT=... \
 *      npx tsx scripts/backfill-documents.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const jwt = process.env.USER_JWT
if (!url || !anon || !jwt) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, and USER_JWT')
  process.exit(1)
}

const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

const { data: rows, error } = await db
  .from('attachments')
  .select('id, file_type')
  .not('analyzed_at', 'is', null)
  .is('document_status', null)

if (error) { console.error('query failed:', error.message); process.exit(1) }

const candidates = (rows ?? []).filter(
  (r) => r.file_type?.startsWith('image/') || r.file_type === 'application/pdf'
)
console.log(`${candidates.length} attachments to re-classify`)

let done = 0
for (const row of candidates) {
  // analyze-attachment no-ops when analyzed_at is set, so clear it first.
  const { error: clearErr } = await db.from('attachments')
    .update({ analyzed_at: null }).eq('id', row.id)
  if (clearErr) { console.error(`  ${row.id}: could not reset — ${clearErr.message}`); continue }

  const res = await fetch(`${url}/functions/v1/analyze-attachment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ attachmentId: row.id, entityContext: '' }),
  })
  if (!res.ok) console.error(`  ${row.id}: ${res.status} ${(await res.text()).slice(0, 120)}`)
  else done++

  // Be kind to the vision API.
  await new Promise((r) => setTimeout(r, 1200))
}
console.log(`re-classified ${done}/${candidates.length}`)
```

- [ ] **Step 2: Dry-run the query half**

Temporarily comment out the `for` loop body below the `console.log`, then run with a real `USER_JWT` (obtain it from the browser: DevTools → Application → Local Storage → the `sb-*-auth-token` entry's `access_token`).

Run: `npx tsx scripts/backfill-documents.ts`
Expected: prints a candidate count and exits without mutating anything.

- [ ] **Step 3: Run the real backfill**

Uncomment the loop and run it again.
Expected: `re-classified N/N` with no errors.

- [ ] **Step 4: Verify the license row specifically**

Run:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select document_kind, document_status, document_scope, jsonb_array_length(facets) as facet_count from attachments where document_kind is not null order by created_at desc limit 20;"}'
```
Expected: sensitive kinds show `facet_count = 1` (the bare summary) and `document_scope = private`. **Do not select the `facets` column itself** — the point of the exercise is that nobody needs to read it.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-documents.ts
git commit -m "chore(documents): backfill classification and strip sensitive facets on existing rows"
```

---

### Task 11: Manual verification in the running app

Type-checks and unit tests do not prove a surface works. Open it and look.

**Files:** none.

- [ ] **Step 1: Start the dev server from the worktree**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/documents-shelf
npm run dev
```
Expected: server on `http://localhost:5173`. A blank screen means `.env` is missing from the worktree — copy it from the main worktree.

- [ ] **Step 2: Walk the shelf**

Visit `http://localhost:5173/documents`. Confirm:
- Documents appears in the sidebar's Library group.
- The empty state reads sensibly, or kept documents are grouped by owner.
- A lock icon shows on private documents; clicking it switches to the household icon and survives a reload.
- The open button produces a working signed URL in a new tab.

- [ ] **Step 3: Walk the proposal**

Attach a photo of a document to any task, wait for analysis, reopen the panel. Confirm the proposal row appears, "Keep in Documents" moves it to the shelf, and "Not a document" makes it stop asking after a reload.

- [ ] **Step 4: Full suite and type-check**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

Run: `npm run lint`
Expected: no errors. (CI runs lint; the pre-push hook does not.)

- [ ] **Step 5: Push the branch**

```bash
git push -u origin documents-shelf
```
Do **not** push to `main` — that auto-deploys to production. Merging is a separate, deliberate decision.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Data model columns, indexes | 1 |
| Restrictive RLS policy | 1 |
| `entity_type` accepts `'document'` | 1, 8 |
| Kind vocabulary + SENSITIVE subset | 2, 3 |
| `stripSensitive` in both twins | 2, 3 |
| Classification in `analyze-attachment` | 4 |
| Redaction applied before the row write | 4 |
| Promotion UX on panels | 6 |
| `/documents` shelf + sidebar | 7 |
| Direct upload | 8 |
| Expiry via proactive-engine, not Today | 9 |
| Backfill of existing rows | 10 |
| `stripSensitive` tests | 2, 3 |
| Classification parse-failure tests | 2 |
| Shelf tests | 7 |
| Promotion tests | 6 |

**Gap, accepted:** the spec calls for an RLS test proving a private document is invisible to a household member. It is not a task here because the repo has no multi-session RLS test fixture (see the `followup_e2e_auth_fixture` note in project memory) and building one is its own piece of work. Task 1 Step 4 verifies the policy exists and is `RESTRICTIVE`; the behavioral test needs a second authenticated session. **This should be raised before merge** — it is the one place where the privacy guarantee rests on inspection rather than a test.

**Placeholder scan:** no TBDs. Two steps direct the implementer to confirm a real name before editing (Task 1 Step 2's constraint name, Task 8 Step 4's `uploadAttachment` signature) — these are verification steps with explicit expected output, not deferred decisions.

**Type consistency:** `DocumentKind`, `DocumentStatus`, `DocumentScope`, `SENSITIVE_KINDS`, `stripSensitive`, `parseDocumentProposal`, `documentKindLabel` are defined in Task 2 and used identically in Tasks 3, 4, 6, 7. `SymphonyDocument` is defined in Task 5 and consumed in 7 and 8. `EXPIRY_WARNING_DAYS = 60` appears in Task 5 (client) and Task 9 (edge) — two copies by necessity, as with the facet validators; both are asserted in their own tests.
