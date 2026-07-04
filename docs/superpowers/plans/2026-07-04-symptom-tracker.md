# Symptom Tracking + Full Log Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log PD symptoms (type + severity + time) in the app, see them interleaved with doses on one chronological timeline, and fully edit any logged entry (dose or symptom).

**Architecture:** Two new Supabase tables (`symptoms`, `symptom_logs`) mirroring the shipped `medications`/`medication_logs`, owner-only RLS, in the realtime publication. Two hooks mirror the med hooks. The existing `/meds` Shell app (renamed "Health") folds in: a Symptoms list in Manage, a quick "Log symptom" control in Today, and a Timing tab that merges doses + symptoms into one per-day chronological list via a pure helper. A shared `LogEditor` gives full edit (entity, timestamp, note, and severity for symptoms) to both dose and symptom logs.

**Tech Stack:** React 19 + TS strict, Vite, Tailwind v4 (Nordic Journal), Supabase (Postgres + RLS + realtime), Vitest, lucide-react.

## Global Constraints

- **Worktree:** all work in `.worktrees/symptom-tracker` (branch `symptom-tracker`, off `origin/main`). NEVER edit/commit in the main worktree.
- **No emojis** — lucide-react icons only. Nordic classes (`.card`, `.btn-primary`, `.input-base`, `font-display`). Edit `components/layout/Sidebar.tsx` (Nordic sidebar).
- **Path alias:** `@/` → `src/`. `useCallback` for handlers passed as props.
- **Severity:** smallint `1|2|3` = Mild/Moderate/Severe. CHECK `severity between 1 and 3`.
- **Both new tables MUST be added to the `supabase_realtime` publication** (guarded idempotent block) — hooks refresh via `postgres_changes`; omitting this silently breaks live UI (bit the meds build).
- **Realtime channels filter by user:** `filter: user_id=eq.${user.id}` on every `.on('postgres_changes', …)`.
- **Destructive deletes** (a symptom type cascades its logs; a log delete) require a `window.confirm` guard.
- **Route/app id stays `meds`;** only the user-facing label/heading becomes "Health".
- **Supabase project ref:** `mwadppyrqzuzgstmwpuy`. Apply SQL via Management API; token: `security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d`.
- **Tests:** `npx vitest run <file>` (not `npm test` — watch mode). `npm run build` (tsc -b, strict) before considering a UI task done. PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- **Timezone:** `logged_at`/`taken_at` are timestamptz; all display uses local time (single-user, single-zone).

---

## File Structure

**Create:**
- `supabase/migrations/2026-07-04_symptoms.sql` — tables, RLS, publication
- `src/types/symptom.ts` — `Symptom`, `SymptomLog`, `Severity`, `SEVERITY_LABELS`
- `src/lib/meds/timelineMerge.ts` — pure dose+symptom chronological merge
- `src/lib/meds/timelineMerge.test.ts`
- `src/hooks/useSymptoms.ts` + `.test.ts`
- `src/hooks/useSymptomLogs.ts` + `.test.ts`
- `src/apps/meds/components/SymptomManageList.tsx` — symptom CRUD (Manage)
- `src/apps/meds/components/SymptomQuickLog.tsx` — tap-to-log (Today)
- `src/apps/meds/components/LogEditor.tsx` — shared full-edit editor (dose | symptom)

**Modify:**
- `src/hooks/useMedicationLogs.ts` — `updateLog` gains `medicationId?`
- `src/apps/meds/MedsApp.tsx` — add symptom hooks; wire new components into tabs; heading → "Health"
- `src/apps/meds/components/TimingView.tsx` — interleave doses + symptoms; use `LogEditor`
- `src/components/layout/Sidebar.tsx` — nav label "Meds" → "Health"

---

### Task 1: Migration — symptoms + symptom_logs tables

**Files:**
- Create: `supabase/migrations/2026-07-04_symptoms.sql`

**Interfaces:**
- Produces tables `symptoms`, `symptom_logs` (owner-only RLS), both in `supabase_realtime`.

- [ ] **Step 1: Write the migration**

```sql
-- Symptom tracking — timestamped PD symptom logging with severity.
-- Mirrors the medications/medication_logs model. Owner-only RLS (private health).

create table if not exists symptoms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists symptoms_user_idx on symptoms(user_id);

create table if not exists symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symptom_id uuid not null references symptoms(id) on delete cascade,
  severity smallint not null check (severity between 1 and 3),  -- 1 mild, 2 moderate, 3 severe
  logged_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists symptom_logs_user_logged_idx on symptom_logs(user_id, logged_at desc);
create index if not exists symptom_logs_symptom_idx on symptom_logs(symptom_id);

alter table symptoms enable row level security;
alter table symptom_logs enable row level security;

drop policy if exists "own symptoms" on symptoms;
create policy "own symptoms" on symptoms for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own symptom_logs" on symptom_logs;
create policy "own symptom_logs" on symptom_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Live UI refresh: hooks subscribe via postgres_changes (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'symptoms') then
    alter publication supabase_realtime add table symptoms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'symptom_logs') then
    alter publication supabase_realtime add table symptom_logs;
  end if;
end $$;
```

- [ ] **Step 2: Apply to prod**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -Rs '{query:.}' supabase/migrations/2026-07-04_symptoms.sql)"
```
Expected: `[]` (no `error` key). If `jq` process-substitution quoting fails, JSON-encode the file another way — run the full file text.

- [ ] **Step 3: Verify tables + publication membership**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -n '{query:"select tablename from pg_publication_tables where pubname='\''supabase_realtime'\'' and tablename like '\''symptom%'\'' order by tablename;"}')"
```
Expected: two rows — `symptom_logs`, `symptoms`. Capture as evidence.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-04_symptoms.sql
git commit -m "feat(symptoms): symptoms + symptom_logs tables (RLS + realtime publication)"
```

---

### Task 2: Types + timeline merge helper — TDD

**Files:**
- Create: `src/types/symptom.ts`, `src/lib/meds/timelineMerge.ts`, `src/lib/meds/timelineMerge.test.ts`

**Interfaces:**
- Consumes: `MedicationLog` from `@/types/medication`.
- Produces:
  - `Severity = 1 | 2 | 3`; `SEVERITY_LABELS: Record<Severity,string>`
  - `Symptom { id, userId, name, active, sortOrder, createdAt: Date, updatedAt: Date }`
  - `SymptomLog { id, symptomId, severity: Severity, loggedAt: Date, note?, createdAt: Date }`
  - `TimelineRow = { kind:'dose'; at: Date; log: MedicationLog } | { kind:'symptom'; at: Date; log: SymptomLog }`
  - `TimelineDay { key: string; label: string; rows: TimelineRow[] }`
  - `mergeTimeline(doseLogs: MedicationLog[], symptomLogs: SymptomLog[]): TimelineDay[]`
  - `localDayKey(d: Date): string` (YYYY-MM-DD local), `dayLabel(d: Date): string`

- [ ] **Step 1: Write the types file**

```typescript
// src/types/symptom.ts
export type Severity = 1 | 2 | 3

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
}

export interface Symptom {
  id: string
  userId: string
  name: string
  active: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface SymptomLog {
  id: string
  symptomId: string
  severity: Severity
  loggedAt: Date
  note?: string
  createdAt: Date
}
```

- [ ] **Step 2: Write failing tests for the merge helper**

```typescript
// src/lib/meds/timelineMerge.test.ts
import { describe, it, expect } from 'vitest'
import { mergeTimeline, localDayKey } from './timelineMerge'
import type { MedicationLog } from '@/types/medication'
import type { SymptomLog } from '@/types/symptom'

function dose(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'web', createdAt: new Date(iso) }
}
function symptom(id: string, iso: string): SymptomLog {
  return { id, symptomId: 's1', severity: 2, loggedAt: new Date(iso), createdAt: new Date(iso) }
}

describe('mergeTimeline', () => {
  it('interleaves doses and symptoms within a day, ascending by time', () => {
    const days = mergeTimeline(
      [dose('d1', '2026-07-04T07:00:00'), dose('d2', '2026-07-04T11:00:00')],
      [symptom('s1', '2026-07-04T08:40:00')],
    )
    expect(days).toHaveLength(1)
    expect(days[0].rows.map((r) => `${r.kind}:${r.log.id}`)).toEqual(['dose:d1', 'symptom:s1', 'dose:d2'])
  })

  it('groups by local day, newest day first', () => {
    const days = mergeTimeline(
      [dose('d1', '2026-07-03T09:00:00'), dose('d2', '2026-07-04T09:00:00')],
      [],
    )
    expect(days.map((d) => d.key)).toEqual(['2026-07-04', '2026-07-03'])
  })

  it('returns empty when there are no logs', () => {
    expect(mergeTimeline([], [])).toEqual([])
  })
})

describe('localDayKey', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2026, 6, 4, 23, 30))).toBe('2026-07-04')
  })
})
```

- [ ] **Step 3: Run — expect fail**

Run: `npx vitest run src/lib/meds/timelineMerge.test.ts`
Expected: FAIL — `mergeTimeline` is not a function.

- [ ] **Step 4: Implement the merge helper**

```typescript
// src/lib/meds/timelineMerge.ts
import type { MedicationLog } from '@/types/medication'
import type { SymptomLog } from '@/types/symptom'

export type TimelineRow =
  | { kind: 'dose'; at: Date; log: MedicationLog }
  | { kind: 'symptom'; at: Date; log: SymptomLog }

export interface TimelineDay {
  key: string   // YYYY-MM-DD (local) — stable grouping/sort key
  label: string // e.g. "Mon, Jul 4"
  rows: TimelineRow[]
}

export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Merge dose and symptom logs into per-day groups, each a single chronological
 * (ascending) list of typed rows. Days are ordered newest-first. Pure — inputs
 * are not mutated.
 */
export function mergeTimeline(doseLogs: MedicationLog[], symptomLogs: SymptomLog[]): TimelineDay[] {
  const rows: TimelineRow[] = [
    ...doseLogs.map((log): TimelineRow => ({ kind: 'dose', at: log.takenAt, log })),
    ...symptomLogs.map((log): TimelineRow => ({ kind: 'symptom', at: log.loggedAt, log })),
  ]

  const groups = new Map<string, TimelineRow[]>()
  for (const r of rows.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = localDayKey(r.at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest day first
    .map(([key, dayRows]) => ({ key, label: dayLabel(dayRows[0].at), rows: dayRows }))
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npx vitest run src/lib/meds/timelineMerge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/symptom.ts src/lib/meds/timelineMerge.ts src/lib/meds/timelineMerge.test.ts
git commit -m "feat(symptoms): types + pure dose/symptom timeline merge (TDD)"
```

---

### Task 3: Hooks — useSymptoms, useSymptomLogs, and extend useMedicationLogs

**Files:**
- Create: `src/hooks/useSymptoms.ts` + `.test.ts`, `src/hooks/useSymptomLogs.ts` + `.test.ts`
- Modify: `src/hooks/useMedicationLogs.ts`

**Interfaces:**
- Consumes: `Symptom`, `SymptomLog`, `Severity` (Task 2); `supabase`, `useAuth`.
- Produces:
  - `useSymptoms() => { symptoms, loading, error, addSymptom, updateSymptom, deleteSymptom }`; `SymptomInput { name: string; active?: boolean }`; `dbSymptomToSymptom`.
  - `useSymptomLogs({ sinceDays? }) => { logs, loading, error, logSymptom, updateLog, deleteLog }`; `dbLogToSymptomLog`.
    - `logSymptom(symptomId: string, severity: Severity, loggedAt?: Date, note?: string)`
    - `updateLog(id, patch: { symptomId?; severity?: Severity; loggedAt?: Date; note?: string })`
  - `useMedicationLogs.updateLog` now accepts `{ medicationId?; takenAt?: Date; note?: string }`.

- [ ] **Step 1: Extend `useMedicationLogs.updateLog` with `medicationId`**

In `src/hooks/useMedicationLogs.ts`, replace the `updateLog` callback:

```typescript
  const updateLog = useCallback(async (id: string, patch: { medicationId?: string; takenAt?: Date; note?: string }) => {
    const row: Record<string, unknown> = {}
    if (patch.medicationId !== undefined) row.medication_id = patch.medicationId
    if (patch.takenAt !== undefined) row.taken_at = patch.takenAt.toISOString()
    if (patch.note !== undefined) row.note = patch.note
    const { error: e } = await supabase.from('medication_logs').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])
```

- [ ] **Step 2: Write `dbSymptomToSymptom` mapping test**

```typescript
// src/hooks/useSymptoms.test.ts
import { describe, it, expect } from 'vitest'
import { dbSymptomToSymptom } from './useSymptoms'

describe('dbSymptomToSymptom', () => {
  it('maps a symptom row to the Symptom type', () => {
    const s = dbSymptomToSymptom({
      id: 's1', user_id: 'u1', name: 'Tremor', active: true, sort_order: 0,
      created_at: '2026-07-04T00:00:00Z', updated_at: '2026-07-04T00:00:00Z',
    })
    expect(s.name).toBe('Tremor')
    expect(s.active).toBe(true)
    expect(s.createdAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 3: Run — expect fail**

Run: `npx vitest run src/hooks/useSymptoms.test.ts`
Expected: FAIL — `dbSymptomToSymptom` not exported.

- [ ] **Step 4: Implement `useSymptoms`**

```typescript
// src/hooks/useSymptoms.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Symptom } from '@/types/symptom'

interface DbSymptom {
  id: string; user_id: string; name: string; active: boolean
  sort_order: number; created_at: string; updated_at: string
}

export function dbSymptomToSymptom(r: DbSymptom): Symptom {
  return {
    id: r.id, userId: r.user_id, name: r.name, active: r.active,
    sortOrder: r.sort_order, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  }
}

export interface SymptomInput { name: string; active?: boolean }

export function useSymptoms() {
  const { user } = useAuth()
  const [symptoms, setSymptoms] = useState<Symptom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setSymptoms([]); setLoading(false); return
    }
    let active = true
    async function fetchSymptoms() {
      setLoading(true); setError(null)
      const { data, error: e } = await supabase
        .from('symptoms').select('*').order('sort_order', { ascending: true })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setSymptoms((data as DbSymptom[]).map(dbSymptomToSymptom))
      setLoading(false)
    }
    fetchSymptoms()
    const channel = supabase
      .channel('symptoms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'symptoms', filter: `user_id=eq.${user.id}` }, fetchSymptoms)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user])

  const addSymptom = useCallback(async (input: SymptomInput) => {
    const { data, error: e } = await supabase.from('symptoms')
      .insert({ name: input.name, active: input.active ?? true }).select().single()
    if (e) { setError(e.message); return null }
    return dbSymptomToSymptom(data as DbSymptom)
  }, [])

  const updateSymptom = useCallback(async (id: string, patch: Partial<SymptomInput>) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.active !== undefined) row.active = patch.active
    row.updated_at = new Date().toISOString()
    const { error: e } = await supabase.from('symptoms').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteSymptom = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('symptoms').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { symptoms, loading, error, addSymptom, updateSymptom, deleteSymptom }
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npx vitest run src/hooks/useSymptoms.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `dbLogToSymptomLog` mapping test**

```typescript
// src/hooks/useSymptomLogs.test.ts
import { describe, it, expect } from 'vitest'
import { dbLogToSymptomLog } from './useSymptomLogs'

describe('dbLogToSymptomLog', () => {
  it('maps a symptom_log row to SymptomLog', () => {
    const l = dbLogToSymptomLog({
      id: 'l1', user_id: 'u1', symptom_id: 's1', severity: 2,
      logged_at: '2026-07-04T08:40:00Z', note: null, created_at: '2026-07-04T08:40:01Z',
    })
    expect(l.symptomId).toBe('s1')
    expect(l.severity).toBe(2)
    expect(l.loggedAt).toBeInstanceOf(Date)
    expect(l.note).toBeUndefined()
  })
})
```

- [ ] **Step 7: Run — expect fail**

Run: `npx vitest run src/hooks/useSymptomLogs.test.ts`
Expected: FAIL — `dbLogToSymptomLog` not exported.

- [ ] **Step 8: Implement `useSymptomLogs`**

```typescript
// src/hooks/useSymptomLogs.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { SymptomLog, Severity } from '@/types/symptom'

interface DbLog {
  id: string; user_id: string; symptom_id: string; severity: Severity
  logged_at: string; note: string | null; created_at: string
}

export function dbLogToSymptomLog(r: DbLog): SymptomLog {
  return {
    id: r.id, symptomId: r.symptom_id, severity: r.severity, loggedAt: new Date(r.logged_at),
    note: r.note ?? undefined, createdAt: new Date(r.created_at),
  }
}

export function useSymptomLogs(opts: { sinceDays?: number } = {}) {
  const { user } = useAuth()
  const sinceDays = opts.sinceDays ?? 30
  const [logs, setLogs] = useState<SymptomLog[]>([])
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
        .from('symptom_logs').select('*').gte('logged_at', since).order('logged_at', { ascending: false })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setLogs((data as DbLog[]).map(dbLogToSymptomLog))
      setLoading(false)
    }
    fetchLogs()
    const channel = supabase
      .channel('symptom-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'symptom_logs', filter: `user_id=eq.${user.id}` }, fetchLogs)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user, sinceDays])

  const logSymptom = useCallback(async (symptomId: string, severity: Severity, loggedAt?: Date, note?: string) => {
    const { error: e } = await supabase.from('symptom_logs').insert({
      symptom_id: symptomId, severity, logged_at: (loggedAt ?? new Date()).toISOString(), note: note ?? null,
    })
    if (e) setError(e.message)
  }, [])

  const updateLog = useCallback(async (id: string, patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => {
    const row: Record<string, unknown> = {}
    if (patch.symptomId !== undefined) row.symptom_id = patch.symptomId
    if (patch.severity !== undefined) row.severity = patch.severity
    if (patch.loggedAt !== undefined) row.logged_at = patch.loggedAt.toISOString()
    if (patch.note !== undefined) row.note = patch.note
    const { error: e } = await supabase.from('symptom_logs').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteLog = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('symptom_logs').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { logs, loading, error, logSymptom, updateLog, deleteLog }
}
```

- [ ] **Step 9: Run — expect pass, then typecheck**

Run: `npx vitest run src/hooks/useSymptoms.test.ts src/hooks/useSymptomLogs.test.ts`
Expected: PASS (2 tests).
Run: `npm run build`
Expected: PASS (confirms the `useMedicationLogs` signature change compiles against its one caller in `MedsApp.tsx`).

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useSymptoms.ts src/hooks/useSymptoms.test.ts src/hooks/useSymptomLogs.ts src/hooks/useSymptomLogs.test.ts src/hooks/useMedicationLogs.ts
git commit -m "feat(symptoms): useSymptoms + useSymptomLogs hooks; medicationId in med updateLog"
```

---

### Task 4: Manage tab — Symptoms list (CRUD)

**Files:**
- Create: `src/apps/meds/components/SymptomManageList.tsx`
- Modify: `src/apps/meds/MedsApp.tsx`

**Interfaces:**
- Consumes: `useSymptoms` (Task 3), `Symptom`, `SymptomInput`.
- Produces: `SymptomManageList` with props `{ symptoms, onAdd, onUpdate, onDelete }`.

- [ ] **Step 1: Create `SymptomManageList`**

```tsx
// src/apps/meds/components/SymptomManageList.tsx
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import type { Symptom } from '@/types/symptom'
import type { SymptomInput } from '@/hooks/useSymptoms'

interface Props {
  symptoms: Symptom[]
  onAdd: (input: SymptomInput) => Promise<Symptom | null>
  onUpdate: (id: string, patch: Partial<SymptomInput>) => void
  onDelete: (id: string) => void
}

export function SymptomManageList({ symptoms, onAdd, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function add() {
    if (!newName.trim()) return
    await onAdd({ name: newName.trim() })
    setNewName(''); setAdding(false)
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-display">Symptoms</h2>
      {symptoms.map((s) =>
        editingId === s.id ? (
          <div key={s.id} className="card p-3 flex items-center gap-2">
            <input className="input-base flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button className="card px-2 py-1" onClick={() => { onUpdate(s.id, { name: editName.trim() }); setEditingId(null) }} title="Save">
              <Check className="w-4 h-4" />
            </button>
            <button className="card px-2 py-1" onClick={() => setEditingId(null)} title="Cancel">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div key={s.id} className="card p-3 flex items-center justify-between">
            <span className={s.active ? '' : 'text-neutral-400 line-through'}>{s.name}</span>
            <div className="flex items-center gap-1">
              <button className="card px-2 py-1 text-xs" onClick={() => onUpdate(s.id, { active: !s.active })}>
                {s.active ? 'Active' : 'Inactive'}
              </button>
              <button className="card px-2 py-1" onClick={() => { setEditingId(s.id); setEditName(s.name) }} title="Rename">
                <Pencil className="w-4 h-4" />
              </button>
              <button className="card px-2 py-1" onClick={() => {
                if (window.confirm('Delete this symptom and all its logs?')) onDelete(s.id)
              }} title="Delete symptom">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}
      {adding ? (
        <div className="card p-3 flex items-center gap-2">
          <input className="input-base flex-1 text-lg font-display" placeholder="Symptom name" autoFocus
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button className="btn-primary px-3 py-1" onClick={add} disabled={!newName.trim()}>Add</button>
          <button className="card px-2 py-1" onClick={() => { setAdding(false); setNewName('') }} title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button className="card p-3 w-full flex items-center gap-2 justify-center" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Add symptom
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into MedsApp's Manage tab**

In `src/apps/meds/MedsApp.tsx`: add imports and the `useSymptoms` hook, and render `SymptomManageList` under `MedManageList` in the manage branch.

Add near the other imports:
```tsx
import { useSymptoms } from '@/hooks/useSymptoms'
import { SymptomManageList } from './components/SymptomManageList'
```
Add in the component body (after the med hooks):
```tsx
  const { symptoms, addSymptom, updateSymptom, deleteSymptom } = useSymptoms()
```
Replace the manage branch (the `<MedManageList … />`) with a fragment:
```tsx
      ) : (
        <div className="space-y-8">
          <MedManageList
            medications={medications}
            onAdd={addMedication}
            onUpdate={updateMedication}
            onDelete={deleteMedication}
            onLogDose={logDose}
          />
          <SymptomManageList
            symptoms={symptoms}
            onAdd={addSymptom}
            onUpdate={updateSymptom}
            onDelete={deleteSymptom}
          />
        </div>
      )}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run build`
Expected: PASS.
```bash
git add src/apps/meds/components/SymptomManageList.tsx src/apps/meds/MedsApp.tsx
git commit -m "feat(symptoms): Manage tab — symptoms list (add/rename/deactivate/delete)"
```

---

### Task 5: Today tab — quick "Log symptom" control

**Files:**
- Create: `src/apps/meds/components/SymptomQuickLog.tsx`
- Modify: `src/apps/meds/MedsApp.tsx`

**Interfaces:**
- Consumes: `useSymptomLogs.logSymptom` (Task 3), `Symptom`, `Severity`, `SEVERITY_LABELS`.
- Produces: `SymptomQuickLog` with props `{ symptoms, onLog }` where `onLog(symptomId, severity)`.

- [ ] **Step 1: Create `SymptomQuickLog`**

```tsx
// src/apps/meds/components/SymptomQuickLog.tsx
import { useState } from 'react'
import type { Symptom, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'

interface Props {
  symptoms: Symptom[]
  onLog: (symptomId: string, severity: Severity) => void
}

export function SymptomQuickLog({ symptoms, onLog }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const active = symptoms.filter((s) => s.active)
  if (active.length === 0) return null

  return (
    <div className="card p-4">
      <div className="font-medium mb-2">Log a symptom</div>
      <div className="flex flex-wrap gap-2">
        {active.map((s) => (
          <button key={s.id}
            className={`px-3 py-1 rounded-full text-sm ${pendingId === s.id ? 'btn-primary' : 'card'}`}
            onClick={() => setPendingId(pendingId === s.id ? null : s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      {pendingId && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-neutral-500">Severity:</span>
          {([1, 2, 3] as Severity[]).map((sev) => (
            <button key={sev} className="card px-3 py-1 text-sm"
              onClick={() => { onLog(pendingId, sev); setPendingId(null) }}>
              {SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into MedsApp's Today tab**

In `src/apps/meds/MedsApp.tsx`: import `SymptomQuickLog` and `useSymptomLogs`; render it below `TodayStrip` in the today branch.

Add imports:
```tsx
import { useSymptomLogs } from '@/hooks/useSymptomLogs'
import { SymptomQuickLog } from './components/SymptomQuickLog'
```
Add in the body (after the med log hook):
```tsx
  const {
    logs: symptomLogs, logSymptom,
    updateLog: updateSymptomLog, deleteLog: deleteSymptomLog,
  } = useSymptomLogs({ sinceDays: 30 })
```
Replace the today branch:
```tsx
      ) : tab === 'today' ? (
        <div className="space-y-4">
          <TodayStrip medications={medications} logs={logs} onLogDose={logDose} />
          <SymptomQuickLog symptoms={symptoms} onLog={logSymptom} />
        </div>
```
(`symptoms` comes from the `useSymptoms` hook added in Task 4. If Tasks are executed out of order, ensure `useSymptoms` is present.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run build`
Expected: PASS.
```bash
git add src/apps/meds/components/SymptomQuickLog.tsx src/apps/meds/MedsApp.tsx
git commit -m "feat(symptoms): Today tab — quick tap-to-log symptom control"
```

---

### Task 6: Shared LogEditor — full edit for dose + symptom logs

**Files:**
- Create: `src/apps/meds/components/LogEditor.tsx`

**Interfaces:**
- Consumes: `Medication`, `MedicationLog`, `Symptom`, `SymptomLog`, `Severity`, `SEVERITY_LABELS`.
- Produces: `LogEditor` — a discriminated-props editor:
  - `{ kind:'dose'; log: MedicationLog; medications: Medication[]; onSave: (patch:{ medicationId?: string; takenAt?: Date; note?: string }) => void; onCancel: () => void }`
  - `{ kind:'symptom'; log: SymptomLog; symptoms: Symptom[]; onSave: (patch:{ symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => void; onCancel: () => void }`
  - Also exports pure `toDatetimeLocal(d: Date): string` and `fromDatetimeLocal(v: string): Date | null`.

- [ ] **Step 1: Implement `LogEditor`**

```tsx
// src/apps/meds/components/LogEditor.tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { Symptom, SymptomLog, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'

export function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export function fromDatetimeLocal(v: string): Date | null {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

type Props =
  | {
      kind: 'dose'; log: MedicationLog; medications: Medication[]
      onSave: (patch: { medicationId?: string; takenAt?: Date; note?: string }) => void
      onCancel: () => void
    }
  | {
      kind: 'symptom'; log: SymptomLog; symptoms: Symptom[]
      onSave: (patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => void
      onCancel: () => void
    }

export function LogEditor(props: Props) {
  const initialAt = props.kind === 'dose' ? props.log.takenAt : props.log.loggedAt
  const [entityId, setEntityId] = useState(
    props.kind === 'dose' ? props.log.medicationId : props.log.symptomId,
  )
  const [when, setWhen] = useState(toDatetimeLocal(initialAt))
  const [note, setNote] = useState(props.kind === 'dose' ? props.log.note ?? '' : props.log.note ?? '')
  const [severity, setSeverity] = useState<Severity>(props.kind === 'symptom' ? props.log.severity : 2)

  const options = props.kind === 'dose' ? props.medications : props.symptoms

  function save() {
    const at = fromDatetimeLocal(when)
    if (!at) return
    if (props.kind === 'dose') {
      props.onSave({ medicationId: entityId, takenAt: at, note: note.trim() })
    } else {
      props.onSave({ symptomId: entityId, severity, loggedAt: at, note: note.trim() })
    }
  }

  return (
    <div className="card p-3 space-y-2">
      <select className="input-base w-full" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <input type="datetime-local" className="input-base w-full" value={when} onChange={(e) => setWhen(e.target.value)} />
      {props.kind === 'symptom' && (
        <div className="flex items-center gap-2">
          {([1, 2, 3] as Severity[]).map((sev) => (
            <button key={sev} type="button"
              className={`px-3 py-1 rounded-full text-sm ${severity === sev ? 'btn-primary' : 'card'}`}
              onClick={() => setSeverity(sev)}>
              {SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>
      )}
      <input className="input-base w-full" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="card px-3 py-1" onClick={props.onCancel} title="Cancel"><X className="w-4 h-4" /></button>
        <button className="btn-primary px-3 py-1" onClick={save} title="Save"><Check className="w-4 h-4" /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run build`
Expected: PASS.
```bash
git add src/apps/meds/components/LogEditor.tsx
git commit -m "feat(meds): shared LogEditor for full dose + symptom log editing"
```

---

### Task 7: Timing tab — interleave doses + symptoms, full edit via LogEditor

**Files:**
- Modify: `src/apps/meds/components/TimingView.tsx`, `src/apps/meds/MedsApp.tsx`

**Interfaces:**
- Consumes: `mergeTimeline` (Task 2), `computeIntervals` (`@/lib/meds/intervals`), `LogEditor` (Task 6), `Symptom`, `SymptomLog`, `Severity`, `SEVERITY_LABELS`.
- Produces: `TimingView` props become
  `{ medications, doseLogs, onUpdateDose, onDeleteDose, symptoms, symptomLogs, onUpdateSymptom, onDeleteSymptom }`
  where `onUpdateDose(id, { medicationId?; takenAt?; note? })`, `onUpdateSymptom(id, { symptomId?; severity?; loggedAt?; note? })`.

- [ ] **Step 1: Rewrite `TimingView.tsx`**

```tsx
// src/apps/meds/components/TimingView.tsx
import { useState, useMemo } from 'react'
import { Pencil, Trash2, Pill, Activity } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { Symptom, SymptomLog, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'
import { computeIntervals } from '@/lib/meds/intervals'
import { mergeTimeline } from '@/lib/meds/timelineMerge'
import { LogEditor } from './LogEditor'

interface Props {
  medications: Medication[]
  doseLogs: MedicationLog[]
  onUpdateDose: (id: string, patch: { medicationId?: string; takenAt?: Date; note?: string }) => void
  onDeleteDose: (id: string) => void
  symptoms: Symptom[]
  symptomLogs: SymptomLog[]
  onUpdateSymptom: (id: string, patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => void
  onDeleteSymptom: (id: string) => void
}

function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtGap(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const SEVERITY_COLOR: Record<Severity, string> = {
  1: 'text-amber-500', 2: 'text-orange-500', 3: 'text-red-600',
}

export function TimingView(props: Props) {
  const { medications, doseLogs, onUpdateDose, onDeleteDose, symptoms, symptomLogs, onUpdateSymptom, onDeleteSymptom } = props
  const [days, setDays] = useState<7 | 30>(7)
  const [editingId, setEditingId] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/purity -- range boundary is intentionally computed at render time
  const since = Date.now() - days * 86_400_000
  const doses = useMemo(() => doseLogs.filter((l) => l.takenAt.getTime() >= since), [doseLogs, since])
  const symps = useMemo(() => symptomLogs.filter((l) => l.loggedAt.getTime() >= since), [symptomLogs, since])
  const timeline = useMemo(() => mergeTimeline(doses, symps), [doses, symps])

  const medName = (id: string) => medications.find((m) => m.id === id)?.name ?? 'Medication'
  const sympName = (id: string) => symptoms.find((s) => s.id === id)?.name ?? 'Symptom'

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([7, 30] as const).map((d) => (
          <button key={d} className={`px-3 py-1 rounded-full text-sm ${days === d ? 'btn-primary' : 'card'}`}
            onClick={() => setDays(d)}>{d} days</button>
        ))}
      </div>

      {timeline.length === 0 && <p className="text-neutral-500">Nothing logged in this range.</p>}
      {timeline.map((day) => {
        // Dose intervals are computed among that day's doses only, in chronological order.
        const dayDoses = day.rows.filter((r) => r.kind === 'dose').map((r) => r.log as MedicationLog)
        const intervals = computeIntervals(dayDoses)
        let doseIdx = -1
        return (
          <div key={day.key} className="card p-4">
            <div className="font-medium mb-2">{day.label}</div>
            <div className="space-y-1">
              {day.rows.map((row) => {
                if (editingId === row.log.id) {
                  return row.kind === 'dose' ? (
                    <LogEditor key={row.log.id} kind="dose" log={row.log} medications={medications}
                      onSave={(patch) => { onUpdateDose(row.log.id, patch); setEditingId(null) }}
                      onCancel={() => setEditingId(null)} />
                  ) : (
                    <LogEditor key={row.log.id} kind="symptom" log={row.log} symptoms={symptoms}
                      onSave={(patch) => { onUpdateSymptom(row.log.id, patch); setEditingId(null) }}
                      onCancel={() => setEditingId(null)} />
                  )
                }
                if (row.kind === 'dose') {
                  doseIdx++
                  const gap = doseIdx > 0 ? intervals[doseIdx - 1]?.minutes : undefined
                  return (
                    <div key={row.log.id} className="flex items-center gap-3 text-sm">
                      <Pill className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="w-16 tabular-nums">{fmt(row.at)}</span>
                      <span className="text-neutral-700">{medName(row.log.medicationId)}</span>
                      {gap !== undefined && <span className="text-neutral-400">+{fmtGap(gap)}</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <button className="card px-2 py-1" onClick={() => setEditingId(row.log.id)} title="Edit dose"><Pencil className="w-4 h-4" /></button>
                        <button className="card px-2 py-1" onClick={() => { if (window.confirm('Delete this logged dose?')) onDeleteDose(row.log.id) }} title="Delete dose"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                }
                const sev = row.log.severity
                return (
                  <div key={row.log.id} className="flex items-center gap-3 text-sm">
                    <Activity className={`w-4 h-4 shrink-0 ${SEVERITY_COLOR[sev]}`} />
                    <span className="w-16 tabular-nums">{fmt(row.at)}</span>
                    <span className="text-neutral-700">{sympName(row.log.symptomId)}</span>
                    <span className={`text-xs ${SEVERITY_COLOR[sev]}`}>{SEVERITY_LABELS[sev]}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button className="card px-2 py-1" onClick={() => setEditingId(row.log.id)} title="Edit symptom"><Pencil className="w-4 h-4" /></button>
                      <button className="card px-2 py-1" onClick={() => { if (window.confirm('Delete this logged symptom?')) onDeleteSymptom(row.log.id) }} title="Delete symptom"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update MedsApp to pass the new TimingView props**

In `src/apps/meds/MedsApp.tsx`, replace the timing branch:
```tsx
      ) : tab === 'timing' ? (
        <TimingView
          medications={medications}
          doseLogs={logs}
          onUpdateDose={updateLog}
          onDeleteDose={deleteLog}
          symptoms={symptoms}
          symptomLogs={symptomLogs}
          onUpdateSymptom={updateSymptomLog}
          onDeleteSymptom={deleteSymptomLog}
        />
```
(`symptomLogs`, `updateSymptomLog`, `deleteSymptomLog` come from the `useSymptomLogs` destructure added in Task 5.)

- [ ] **Step 3: Typecheck + run all meds/symptom unit tests**

Run: `npm run build`
Expected: PASS.
Run: `npx vitest run src/lib/meds src/hooks/useSymptoms.test.ts src/hooks/useSymptomLogs.test.ts src/hooks/useMedications.test.ts src/hooks/useMedicationLogs.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/apps/meds/components/TimingView.tsx src/apps/meds/MedsApp.tsx
git commit -m "feat(symptoms): Timing tab interleaves doses + symptoms with full LogEditor edit"
```

---

### Task 8: Rename "Meds" → "Health"

**Files:**
- Modify: `src/apps/meds/MedsApp.tsx`, `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new. Route/app id unchanged (`/meds`, `meds`).

- [ ] **Step 1: Update the page heading**

In `src/apps/meds/MedsApp.tsx`, change the heading:
```tsx
      <h1 className="text-3xl font-display mb-4">Health</h1>
```
(was `Medications`).

- [ ] **Step 2: Update the sidebar label**

In `src/components/layout/Sidebar.tsx`, the Meds nav button (around the `navigate('/meds')` block), change the label span:
```tsx
            {!collapsed && <span>Health</span>}
```
(was `Meds`). Leave the `Pill` icon and route as-is.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run build`
Expected: PASS.
```bash
git add src/apps/meds/MedsApp.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(symptoms): rename Meds page/nav to Health"
```

---

## Self-Review

**Spec coverage:**
- `symptoms` + `symptom_logs` tables, RLS, realtime publication → Task 1 ✓
- Types + severity 1–3 → Task 2 ✓
- Pure chronological dose+symptom merge helper (tested) → Task 2 ✓
- `useSymptoms` / `useSymptomLogs` (+ mapper tests) → Task 3 ✓
- Extend `useMedicationLogs.updateLog` with `medicationId` → Task 3 ✓
- Manage: Symptoms list CRUD → Task 4 ✓
- Today: quick tap-to-log symptom → Task 5 ✓
- Shared `LogEditor` (full edit, both kinds) → Task 6 ✓
- Timing: interleave + full edit via LogEditor, delete-confirm both → Task 7 ✓
- Rename Meds → Health → Task 8 ✓
- Out of scope (voice, visual strip, export, route rename) → not built ✓

**Placeholder scan:** none. Every code step has complete code; every command has expected output.

**Type consistency:** `mergeTimeline(doseLogs, symptomLogs) => TimelineDay[]` with `TimelineRow` discriminated on `kind` — consumed identically in Task 7. `LogEditor` discriminated props (`kind:'dose'|'symptom'`) match the `onUpdateDose`/`onUpdateSymptom` patch shapes threaded from MedsApp (Task 7) to the hooks (Task 3). `Severity = 1|2|3` used consistently across types, hooks, quick-log, editor, and timing. `useMedicationLogs.updateLog` extended shape `{ medicationId?; takenAt?; note? }` matches TimingView's `onUpdateDose`. MedsApp hook destructures (`symptoms` from Task 4, `symptomLogs`/`updateSymptomLog`/`deleteSymptomLog` from Task 5) are in place before Task 7 consumes them.

**Cross-task note for the executor:** MedsApp is modified by Tasks 4, 5, 7, and 8. Execute in order; each task's MedsApp edit assumes the prior ones landed (Task 4 adds `useSymptoms`; Task 5 adds `useSymptomLogs` destructure + today wiring; Task 7 rewires timing; Task 8 changes the heading).
