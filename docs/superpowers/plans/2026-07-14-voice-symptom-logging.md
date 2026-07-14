# Voice Symptom Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Hey Siri, Log Symptom" → one dictated utterance ("severe tremor after workout") → a `log-symptom` edge function parses it and inserts `symptom_logs` rows, replying with a speakable confirmation.

**Architecture:** A new edge function `log-symptom`, a structural sibling of the deployed `log-medication` function: same `x-med-token` auth against `med_log_tokens`, same `{ ok, message }` speakable-response contract, all parsing in a pure unit-tested lib. No schema changes, no web UI changes.

**Tech Stack:** Supabase Edge Function (Deno), pure TypeScript logic lib tested with Vitest (vitest.config.ts already includes `supabase/functions/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-14-voice-symptom-logging-design.md`

## Global Constraints

- Work happens in the worktree `.worktrees/voice-symptom-logging` (branch `voice-symptom-logging` off `origin/main`). All commands below run from that worktree root.
- Severity words: 1 = `mild|light|slight`, 2 = `moderate|medium`, 3 = `severe|bad|intense|strong`. No severity word → default **2 (Moderate)**. Whole-word matches only; first occurrence by position wins.
- Unknown symptom → fail and list tracked symptoms. NEVER auto-create symptoms.
- All distinct symptom matches log (shared severity). Overlap rule: if one matched symptom's name contains another's, keep only the longer.
- Response contract (mirrors `log-medication`): expected outcomes → `{ ok, message }` (speakable); auth/format failures → `{ ok: false, error }`. Status codes: 200 logged, 400 bad body, 401 token, 404 no match / no symptoms, 405 non-POST, 500 DB.
- Supabase project ref: `mwadppyrqzuzgstmwpuy`.
- Run tests with `npx vitest run <path>` (plain `npm test` is watch mode).

---

### Task 1: Pure parsing lib (TDD)

**Files:**
- Create: `supabase/functions/log-symptom/lib/logic.ts`
- Test: `supabase/functions/log-symptom/lib/logic.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no Deno/network deps).
- Produces (used by Task 2's handler):
  - `interface SymptomRow { id: string; name: string }`
  - `type Severity = 1 | 2 | 3`
  - `parseBody(raw: unknown): { ok: true; utterance: string; logged_at?: string } | { ok: false; error: string }`
  - `parseUtterance(utterance: string, symptoms: SymptomRow[]): { severity: Severity; matches: SymptomRow[]; note: string | null }`
  - `buildMessage(names: string[], severity: Severity, timeStr: string): string`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/log-symptom/lib/logic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildMessage, parseBody, parseUtterance } from './logic.ts'

const SYMPTOMS = [
  { id: '1', name: 'Tremor' },
  { id: '2', name: 'Stiffness' },
  { id: '3', name: 'Dyskinesia' },
]

describe('parseBody', () => {
  it('rejects a missing utterance', () => {
    expect(parseBody({}).ok).toBe(false)
  })
  it('rejects a blank utterance', () => {
    expect(parseBody({ utterance: '   ' }).ok).toBe(false)
  })
  it('accepts a valid body', () => {
    expect(parseBody({ utterance: 'severe tremor' })).toEqual({
      ok: true, utterance: 'severe tremor', logged_at: undefined,
    })
  })
  it('accepts a valid logged_at', () => {
    const r = parseBody({ utterance: 'tremor', logged_at: '2026-07-14T15:00:00Z' })
    expect(r).toEqual({ ok: true, utterance: 'tremor', logged_at: '2026-07-14T15:00:00Z' })
  })
  it('rejects a non-ISO logged_at', () => {
    expect(parseBody({ utterance: 'tremor', logged_at: 'yesterday' }).ok).toBe(false)
  })
})

describe('parseUtterance — severity', () => {
  it.each([
    ['mild tremor', 1], ['light tremor', 1], ['slight tremor', 1],
    ['moderate tremor', 2], ['medium tremor', 2],
    ['severe tremor', 3], ['bad tremor', 3], ['intense tremor', 3], ['strong tremor', 3],
  ] as const)('"%s" → severity %i', (utterance, severity) => {
    const r = parseUtterance(utterance, SYMPTOMS)
    expect(r.severity).toBe(severity)
    expect(r.matches).toEqual([SYMPTOMS[0]])
  })
  it('defaults to moderate when no severity word', () => {
    expect(parseUtterance('tremor', SYMPTOMS).severity).toBe(2)
  })
  it('matches severity words on word boundaries only', () => {
    // "backlight" must not read as "light"
    const r = parseUtterance('backlight tremor', SYMPTOMS)
    expect(r.severity).toBe(2)
    expect(r.note).toBe('backlight')
  })
  it('first severity word by position wins', () => {
    expect(parseUtterance('mild tremor pretty bad', SYMPTOMS).severity).toBe(1)
  })
})

describe('parseUtterance — symptom matching', () => {
  it('matches case-insensitively', () => {
    expect(parseUtterance('DYSKINESIA', SYMPTOMS).matches).toEqual([SYMPTOMS[2]])
  })
  it('logs all distinct matches', () => {
    const r = parseUtterance('tremor and stiffness', SYMPTOMS)
    expect(r.matches).toEqual([SYMPTOMS[0], SYMPTOMS[1]])
    expect(r.note).toBeNull()
  })
  it('overlapping names: keeps only the longer match', () => {
    const syms = [{ id: '1', name: 'Tremor' }, { id: '4', name: 'Resting Tremor' }]
    const r = parseUtterance('resting tremor', syms)
    expect(r.matches).toEqual([syms[1]])
    expect(r.note).toBeNull()
  })
  it('no match returns empty matches', () => {
    const r = parseUtterance('severe headache', SYMPTOMS)
    expect(r.matches).toEqual([])
    expect(r.note).toBeNull()
  })
})

describe('parseUtterance — note extraction', () => {
  it('leftover text becomes the note', () => {
    const r = parseUtterance('severe tremor after workout', SYMPTOMS)
    expect(r.severity).toBe(3)
    expect(r.matches).toEqual([SYMPTOMS[0]])
    expect(r.note).toBe('after workout')
  })
  it('dangling connectors are trimmed to null', () => {
    expect(parseUtterance('tremor and stiffness', SYMPTOMS).note).toBeNull()
    expect(parseUtterance('mild tremor and', SYMPTOMS).note).toBeNull()
  })
  it('preserves the original casing of the note', () => {
    expect(parseUtterance('Tremor during CrossFit', SYMPTOMS).note).toBe('during CrossFit')
  })
})

describe('buildMessage', () => {
  it('single symptom', () => {
    expect(buildMessage(['Tremor'], 3, '2:47 PM')).toBe('Logged Tremor, severe, at 2:47 PM')
  })
  it('two symptoms', () => {
    expect(buildMessage(['Tremor', 'Stiffness'], 2, '9:05 AM'))
      .toBe('Logged Tremor and Stiffness, moderate, at 9:05 AM')
  })
  it('three symptoms use comma + and', () => {
    expect(buildMessage(['Tremor', 'Stiffness', 'Dyskinesia'], 1, '9:05 AM'))
      .toBe('Logged Tremor, Stiffness and Dyskinesia, mild, at 9:05 AM')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/log-symptom/lib/logic.test.ts`
Expected: FAIL — cannot resolve `./logic.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/log-symptom/lib/logic.ts`:

```typescript
// Pure request/utterance logic for log-symptom — no Deno/network deps, unit-tested.
export interface SymptomRow { id: string; name: string }
export type Severity = 1 | 2 | 3

export type ParsedBody =
  | { ok: true; utterance: string; logged_at?: string }
  | { ok: false; error: string }

export function parseBody(raw: unknown): ParsedBody {
  const b = (raw ?? {}) as Record<string, unknown>
  if (typeof b.utterance !== 'string' || b.utterance.trim() === '') {
    return { ok: false, error: 'utterance is required' }
  }
  if (b.logged_at !== undefined) {
    if (typeof b.logged_at !== 'string' || Number.isNaN(Date.parse(b.logged_at))) {
      return { ok: false, error: 'logged_at must be an ISO8601 string' }
    }
  }
  return { ok: true, utterance: b.utterance, logged_at: b.logged_at as string | undefined }
}

const WORD_TO_SEVERITY: Record<string, Severity> = {
  mild: 1, light: 1, slight: 1,
  moderate: 2, medium: 2,
  severe: 3, bad: 3, intense: 3, strong: 3,
}
const SEVERITY_RE = /\b(mild|light|slight|moderate|medium|severe|bad|intense|strong)\b/i

export interface ParsedUtterance {
  severity: Severity
  matches: SymptomRow[]
  note: string | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Leftover text after stripping severity + symptom names → note (or null).
function tidyNote(s: string): string | null {
  let t = s.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(and|with)\s+/i, '').replace(/\s+(and|with)$/i, '').trim()
  if (/^(and|with)$/i.test(t)) t = ''
  return t.length > 0 ? t : null
}

export function parseUtterance(utterance: string, symptoms: SymptomRow[]): ParsedUtterance {
  let text = utterance
  let severity: Severity = 2
  const m = SEVERITY_RE.exec(text)
  if (m) {
    severity = WORD_TO_SEVERITY[m[1].toLowerCase()]
    text = text.slice(0, m.index) + text.slice(m.index + m[1].length)
  }

  let matches = symptoms.filter((s) => text.toLowerCase().includes(s.name.toLowerCase()))
  // Overlap rule: a match whose name is contained in a longer match's name is dropped.
  matches = matches.filter((a) => !matches.some((b) =>
    b.name.length > a.name.length && b.name.toLowerCase().includes(a.name.toLowerCase())))

  if (matches.length === 0) return { severity, matches: [], note: null }

  for (const s of matches) {
    text = text.replace(new RegExp(escapeRegExp(s.name), 'i'), '')
  }
  return { severity, matches, note: tidyNote(text) }
}

const SEVERITY_SPOKEN: Record<Severity, string> = { 1: 'mild', 2: 'moderate', 3: 'severe' }

export function buildMessage(names: string[], severity: Severity, timeStr: string): string {
  const joined = names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Logged ${joined}, ${SEVERITY_SPOKEN[severity]}, at ${timeStr}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/log-symptom/lib/logic.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/log-symptom/lib/
git commit -m "feat(symptoms): pure utterance-parsing logic for voice symptom logging (TDD)"
```

---

### Task 2: Edge function handler + deploy + live smoke test

**Files:**
- Create: `supabase/functions/log-symptom/index.ts`
- Modify: `supabase/config.toml` (add `[functions.log-symptom]` beside the existing `[functions.log-medication]` block at ~line 283)

**Interfaces:**
- Consumes (from Task 1, `./lib/logic.ts`): `parseBody`, `parseUtterance`, `buildMessage`, `type SymptomRow`.
- Consumes (existing infra): `med_log_tokens(token, user_id)` table; `symptoms(id, name, user_id, active)` table; `symptom_logs(user_id, symptom_id, severity, logged_at, note)` table.
- Produces: deployed `POST /functions/v1/log-symptom` endpoint (auth: `x-med-token` header).

- [ ] **Step 1: Write the handler**

Create `supabase/functions/log-symptom/index.ts`:

```typescript
// LOG-SYMPTOM — trusted-device voice symptom logger for the health tracker.
// Auth: durable per-user token in `x-med-token` (see med_log_tokens / ensure_med_log_token).
// Body: { utterance: string, logged_at?: ISO8601 } — e.g. "severe tremor after workout".
// Returns { ok, message } — message is human-readable so Siri can speak it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildMessage, parseBody, parseUtterance, type SymptomRow } from './lib/logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-med-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const { data: tok, error: tokError } = await admin.from('med_log_tokens').select('user_id').eq('token', token).maybeSingle()
  if (tokError) return json({ ok: false, message: 'Auth check failed' }, 500)
  if (!tok) return json({ ok: false, error: 'invalid token' }, 401)
  const userId = tok.user_id as string

  const { data: syms, error: symsError } = await admin
    .from('symptoms').select('id, name').eq('user_id', userId).eq('active', true)
  if (symsError) return json({ ok: false, message: 'Could not load symptoms' }, 500)
  const list = (syms ?? []) as SymptomRow[]
  if (list.length === 0) return json({ ok: false, message: "You aren't tracking any symptoms yet" }, 404)

  const { severity, matches, note } = parseUtterance(parsed.utterance, list)
  if (matches.length === 0) {
    const tracked = list.map((s) => s.name).join(', ')
    return json({ ok: false, message: `No symptom matching "${parsed.utterance}" — you track: ${tracked}` }, 404)
  }

  const loggedAt = parsed.logged_at ? new Date(parsed.logged_at) : new Date()
  const rows = matches.map((s) => ({
    user_id: userId, symptom_id: s.id, severity, logged_at: loggedAt.toISOString(), note,
  }))
  const { error } = await admin.from('symptom_logs').insert(rows)
  if (error) return json({ ok: false, message: 'Could not save log' }, 500)

  return json({ ok: true, message: buildMessage(matches.map((s) => s.name), severity, fmtTime(loggedAt)) })
})
```

- [ ] **Step 2: Register the function in config.toml**

In `supabase/config.toml`, directly below the existing block:

```toml
[functions.log-medication]
verify_jwt = false
```

add:

```toml
[functions.log-symptom]
verify_jwt = false
```

- [ ] **Step 3: Verify the repo still typechecks and the full unit suite passes**

Run: `npx tsc --noEmit && npx vitest run supabase/functions/log-symptom/lib/logic.test.ts supabase/functions/log-medication/lib/logic.test.ts`
Expected: tsc clean; both logic suites PASS. (Edge-function `index.ts` files are Deno, excluded from the app tsconfig — same as `log-medication`; if `tsc` starts complaining about `supabase/functions`, check `tsconfig` excludes rather than editing the handler.)

- [ ] **Step 4: Deploy the function**

```bash
npx supabase functions deploy log-symptom --project-ref mwadppyrqzuzgstmwpuy --no-verify-jwt
```

Expected: "Deployed Function log-symptom". If the CLI asks for auth, the live token is in the macOS keychain:

```bash
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
```

- [ ] **Step 5: Live smoke test against prod**

Fetch Scott's voice-logging token via the Management API (the on-disk `~/.supabase/access-token` is stale; use the keychain export from Step 4):

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "select token from med_log_tokens limit 1"}'
```

Then exercise the endpoint (`MED_TOKEN` = the token from above):

```bash
BASE=https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-symptom
# 1. Bad token → 401 {"ok":false,"error":"invalid token"}
curl -sS -X POST $BASE -H "x-med-token: nope" -H "Content-Type: application/json" -d '{"utterance":"tremor"}'
# 2. Blank utterance → 400 {"ok":false,"error":"utterance is required"}
curl -sS -X POST $BASE -H "x-med-token: $MED_TOKEN" -H "Content-Type: application/json" -d '{"utterance":"  "}'
# 3. No match → 404, message lists tracked symptoms
curl -sS -X POST $BASE -H "x-med-token: $MED_TOKEN" -H "Content-Type: application/json" -d '{"utterance":"purple elephants"}'
# 4. Success → 200, e.g. {"ok":true,"message":"Logged Tremor, severe, at 2:47 PM"}
#    (use a real tracked symptom name from the no-match reply in #3)
curl -sS -X POST $BASE -H "x-med-token: $MED_TOKEN" -H "Content-Type: application/json" -d '{"utterance":"severe tremor smoke test"}'
```

Verify the row landed AND clean it up (note='smoke test' marks it):

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "select id, symptom_id, severity, note from symptom_logs where note = '"'"'smoke test'"'"'"}'
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "delete from symptom_logs where note = '"'"'smoke test'"'"'"}'
```

Expected: select returns exactly one row with severity 3; delete removes it.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/log-symptom/index.ts supabase/config.toml
git commit -m "feat(symptoms): log-symptom edge function — voice symptom logging via x-med-token"
```

---

### Task 3: Shortcut docs + ship to main

**Files:**
- Modify: `docs/meds-shortcut-setup.md` (append a section)

**Interfaces:**
- Consumes: the deployed `log-symptom` endpoint (Task 2).
- Produces: user-facing setup instructions; feature merged to `origin/main`.

- [ ] **Step 1: Append the Log Symptom section to the shortcut doc**

Append to `docs/meds-shortcut-setup.md`:

```markdown

## Voice symptom logging — "Log Symptom" shortcut

Same pattern, same token. You dictate one sentence; the server figures out the
symptom, severity, and note. It POSTs to the `log-symptom` edge function.

### Setup
1. On iPhone, open **Shortcuts** → **+** → name it exactly **Log Symptom**.
2. Add action **Ask for Input** (type Text), prompt: `What symptom?`
   (When invoked by voice, Siri asks this and you answer by dictation.)
3. Add action **Get Contents of URL**. Configure:
   - URL: `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-symptom`
   - Method: **POST**
   - Headers:
     - `x-med-token` = *(the same token as Log Meds — Health → Manage → "Show voice-logging token")*
     - `Content-Type` = `application/json`
   - Request Body: **JSON** → key `utterance` = *(Provided Input variable)*
4. Add action **Show Result** with "Contents of URL" so Siri speaks the confirmation.

### Using it
- "Hey Siri, Log Symptom" → "What symptom?" → "severe tremor after workout"
  → "Logged Tremor, severe, at 2:47 PM". The leftover words ("after workout")
  are saved as the log's note.
- Severity words: mild/light/slight, moderate/medium, severe/bad/intense/strong.
  Say none and it logs as **moderate**.
- Say two symptoms ("tremor and stiffness") and both log at the same severity.
- The confirmation always states what was understood — if it mis-heard, fix the
  log in Health → Timing (tap the entry to edit).
- Unknown symptoms are never auto-created; the reply lists what you track.
  Add new symptoms in Health → Manage first.
```

- [ ] **Step 2: Verify build + full test suite locally**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass.

- [ ] **Step 3: Commit the doc**

```bash
git add docs/meds-shortcut-setup.md
git commit -m "docs(symptoms): Log Symptom shortcut setup"
```

- [ ] **Step 4: Rebase onto origin/main and push to main (auto-deploys web; edge fn already deployed in Task 2)**

```bash
git fetch origin && git rebase origin/main
git push origin HEAD:main
```

Expected: pre-push hook runs `tsc --noEmit` + unit tests, then push succeeds. If rejected non-fast-forward: `git fetch && git rebase origin/main`, push again.

- [ ] **Step 5: Clean up the worktree (after push is confirmed on origin/main)**

```bash
git log origin/main --oneline -3   # confirm the three feature commits + spec/plan are present
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/voice-symptom-logging
git branch -D voice-symptom-logging
```
