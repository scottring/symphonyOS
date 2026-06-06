# Foundation — Scope Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scope` axis (individual / couple / compound) to Symphony's
household-shared tables, replacing `context = 'family'` as the database sharing
gate — behavior-preserving via backfill — and surface it on the Task type with a
default-coupling helper applied at creation.

**Architecture:** Sharing is enforced at the DB by RLS using
`users_share_household()`. Today the gate is `context = 'family'`. This plan adds a
`scope` column to the five core shared tables, backfills `family → compound` and
everything else `→ individual` (so who-sees-what is unchanged), then swaps every
RLS policy to gate on `scope IN ('couple','compound')`. `context` is thereby freed
to be a pure life-area. A pure `defaultScopeForArea()` helper sets scope from area
at task creation. The explicit `scope_groups` table is **deferred** (with two adult
users, couple and compound both resolve to "household members").

**Tech Stack:** Supabase Postgres (migration applied via the Management API —
migration history is known-drifted, so we apply by API and commit the file for
reproducibility), React 19 + TypeScript (strict), Vitest.

**Worktree:** `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation` (branch `feat/foundation`, off `origin/main`).

---

## File structure

- **Create** `supabase/migrations/2026-06-06_scope_axis.sql` — columns + backfill + RLS swap.
- **Create** `src/lib/scope.ts` — `Scope` type + `defaultScopeForArea()` (pure, single responsibility).
- **Create** `src/lib/scope.test.ts` — unit tests for the helper.
- **Modify** `src/types/task.ts` — add `scope?: Scope`.
- **Modify** `src/hooks/dbTaskToTask.ts` — map `scope` from the DB row.
- **Modify** `src/hooks/dbTaskToTask.test.ts` — assert `scope` maps.
- **Modify** `src/hooks/useSupabaseTasks.ts` (`addTask`, ~line 264) — write default scope on create.
- **Modify** `src/hooks/useSupabaseTasks.test.ts` — assert insert payload carries derived scope.

Out of scope (separate Foundation plans): unifying the 5 filter copies, the
`assigned_to_all` reconciliation, event/calendar scope-by-calendar, and cleanup.

---

### Task 1: Write the scope-axis migration (columns + backfill + RLS swap)

**Files:**
- Create: `supabase/migrations/2026-06-06_scope_axis.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Scope axis: WHO can see an item (individual / couple / compound).
-- Replaces `context = 'family'` as the sharing gate so `context` becomes a pure
-- life-area (work/personal/family). Backfill preserves current visibility exactly:
-- family-context items were shared -> compound; everything else -> individual.

-- 1. Add scope column to the five core household-shared tables.
ALTER TABLE tasks    ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE routines ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';
ALTER TABLE notes    ADD COLUMN IF NOT EXISTS scope TEXT CHECK (scope IN ('individual','couple','compound')) NOT NULL DEFAULT 'individual';

-- 2. Backfill: family (was shared) -> compound; all else stays individual (private).
UPDATE tasks    SET scope = 'compound' WHERE context = 'family';
UPDATE routines SET scope = 'compound' WHERE context = 'family';
UPDATE projects SET scope = 'compound' WHERE context = 'family';
UPDATE contacts SET scope = 'compound' WHERE context = 'family';
UPDATE notes    SET scope = 'compound' WHERE context = 'family';

-- Partial indexes for the shared-item lookups.
CREATE INDEX IF NOT EXISTS idx_tasks_scope    ON tasks(user_id, scope)    WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_routines_scope ON routines(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_contacts_scope ON contacts(user_id, scope) WHERE scope <> 'individual';
CREATE INDEX IF NOT EXISTS idx_notes_scope    ON notes(user_id, scope)    WHERE scope <> 'individual';

-- 3. Swap RLS: gate sharing on scope, not context. individual = owner-only;
--    couple/compound = shared within household (two adults today).

-- TASKS
DROP POLICY IF EXISTS "Users can view tasks"   ON tasks;
CREATE POLICY "Users can view tasks"   ON tasks FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
CREATE POLICY "Users can update tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;
CREATE POLICY "Users can delete tasks" ON tasks FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
-- INSERT stays owner-only (unchanged): "Users can create own tasks".

-- ROUTINES
DROP POLICY IF EXISTS "Users can view routines"   ON routines;
CREATE POLICY "Users can view routines"   ON routines FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update routines" ON routines;
CREATE POLICY "Users can update routines" ON routines FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete routines" ON routines;
CREATE POLICY "Users can delete routines" ON routines FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- PROJECTS
DROP POLICY IF EXISTS "Users can view projects"   ON projects;
CREATE POLICY "Users can view projects"   ON projects FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update projects" ON projects;
CREATE POLICY "Users can update projects" ON projects FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete projects" ON projects;
CREATE POLICY "Users can delete projects" ON projects FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- CONTACTS
DROP POLICY IF EXISTS "Users can view contacts"   ON contacts;
CREATE POLICY "Users can view contacts"   ON contacts FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update contacts" ON contacts;
CREATE POLICY "Users can update contacts" ON contacts FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete contacts" ON contacts;
CREATE POLICY "Users can delete contacts" ON contacts FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- NOTES
DROP POLICY IF EXISTS "Users can view notes"   ON notes;
CREATE POLICY "Users can view notes"   ON notes FOR SELECT USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can update notes" ON notes;
CREATE POLICY "Users can update notes" ON notes FOR UPDATE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));
DROP POLICY IF EXISTS "Users can delete notes" ON notes;
CREATE POLICY "Users can delete notes" ON notes FOR DELETE USING (auth.uid() = user_id OR (scope IN ('couple','compound') AND users_share_household(auth.uid(), user_id)));

-- NOTE_ENTITY_LINKS: inherit from parent note — swap the parent's family gate to scope.
DROP POLICY IF EXISTS "Users can read note links"   ON note_entity_links;
CREATE POLICY "Users can read note links"   ON note_entity_links FOR SELECT USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
DROP POLICY IF EXISTS "Users can update note links" ON note_entity_links;
CREATE POLICY "Users can update note links" ON note_entity_links FOR UPDATE USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
DROP POLICY IF EXISTS "Users can delete note links" ON note_entity_links;
CREATE POLICY "Users can delete note links" ON note_entity_links FOR DELETE USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_entity_links.note_id AND (notes.user_id = auth.uid() OR (notes.scope IN ('couple','compound') AND users_share_household(auth.uid(), notes.user_id)))));
-- INSERT note links stays owner-only (unchanged).

-- ACTIONABLE_INSTANCES: the routine branch gated on routine.context='family' -> routine.scope.
DROP POLICY IF EXISTS "Users can view instances"   ON actionable_instances;
CREATE POLICY "Users can view instances"   ON actionable_instances FOR SELECT USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
DROP POLICY IF EXISTS "Users can update instances" ON actionable_instances;
CREATE POLICY "Users can update instances" ON actionable_instances FOR UPDATE USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
DROP POLICY IF EXISTS "Users can delete instances" ON actionable_instances;
CREATE POLICY "Users can delete instances" ON actionable_instances FOR DELETE USING (auth.uid() = user_id OR (users_share_household(auth.uid(), user_id) AND (entity_type = 'calendar_event' OR (entity_type = 'routine' AND EXISTS (SELECT 1 FROM routines r WHERE r.id::text = entity_id AND r.scope IN ('couple','compound'))))));
-- INSERT instances stays owner-only (unchanged).

-- event_notes / calendar events: scope-by-calendar is handled in the events plan, not here.
```

- [ ] **Step 2: Commit the migration file**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation
git add supabase/migrations/2026-06-06_scope_axis.sql
git commit -m "feat(db): add scope axis (individual/couple/compound) migration"
```

---

### Task 2: Apply the migration via the Management API and verify

**Files:** none (DB operation).

- [ ] **Step 1: Apply the migration**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
SQL=$(cat /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation/supabase/migrations/2026-06-06_scope_axis.sql | python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))')
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$SQL"
```
Expected: `[]` or a success object, no error.

- [ ] **Step 2: Verify columns + backfill**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT scope, count(*) FROM tasks GROUP BY scope ORDER BY scope;"}'
```
Expected: rows for `individual` (and `compound` if any family tasks existed). No `null`.

- [ ] **Step 3: Verify RLS now gates on scope**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT policyname, qual FROM pg_policies WHERE tablename = '"'"'tasks'"'"' AND cmd = '"'"'SELECT'"'"';"}'
```
Expected: the `qual` contains `scope` and `users_share_household`, no `context`.

---

### Task 3: `defaultScopeForArea` helper (TDD)

**Files:**
- Create: `src/lib/scope.ts`
- Test: `src/lib/scope.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { defaultScopeForArea } from './scope'

describe('defaultScopeForArea', () => {
  it('family -> compound (shared with the household)', () => {
    expect(defaultScopeForArea('family')).toBe('compound')
  })
  it('work -> individual (private)', () => {
    expect(defaultScopeForArea('work')).toBe('individual')
  })
  it('personal -> individual (private)', () => {
    expect(defaultScopeForArea('personal')).toBe('individual')
  })
  it('null/undefined (untagged) -> individual (private by default)', () => {
    expect(defaultScopeForArea(null)).toBe('individual')
    expect(defaultScopeForArea(undefined)).toBe('individual')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation && npx vitest run src/lib/scope.test.ts`
Expected: FAIL — cannot find module `./scope`.

- [ ] **Step 3: Implement the helper**

```ts
import type { TaskContext } from '@/types/task'

export type Scope = 'individual' | 'couple' | 'compound'

/** Default sharing scope for a life-area. family is shared with the household
 * (compound); work/personal/untagged are private to the owner (individual).
 * Always overridable by the user. */
export function defaultScopeForArea(area: TaskContext | null | undefined): Scope {
  return area === 'family' ? 'compound' : 'individual'
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/scope.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scope.ts src/lib/scope.test.ts
git commit -m "feat(scope): defaultScopeForArea helper"
```

---

### Task 4: Add `scope` to the Task type + DB converter

**Files:**
- Modify: `src/types/task.ts`
- Modify: `src/hooks/dbTaskToTask.ts`
- Test: `src/hooks/dbTaskToTask.test.ts`

- [ ] **Step 1: Add the failing converter test**

In `src/hooks/dbTaskToTask.test.ts`, add a case asserting scope maps from the row
(add `scope: 'compound'` to the row fixture used, or a new fixture):

```ts
it('maps scope from the row, defaulting to individual when absent', () => {
  expect(dbTaskToTask({ ...baseRow, scope: 'compound' }).scope).toBe('compound')
  expect(dbTaskToTask({ ...baseRow, scope: null }).scope).toBe('individual')
})
```
(Use the file's existing base-row fixture name in place of `baseRow`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/hooks/dbTaskToTask.test.ts`
Expected: FAIL — `scope` is `undefined`.

- [ ] **Step 3: Add `scope` to the Task type**

In `src/types/task.ts`, add to `interface Task` (near `context`):

```ts
  scope?: Scope // Who can SEE this: individual (private) | couple | compound (household)
```
And add the import/re-export at the top:
```ts
import type { Scope } from '@/lib/scope'
export type { Scope }
```

- [ ] **Step 4: Map `scope` in the converter**

In `src/hooks/dbTaskToTask.ts`, where the row is mapped to a `Task`, add:
```ts
  scope: (row.scope as Scope | null) ?? 'individual',
```
and import the type: `import type { Scope } from '@/lib/scope'`.

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run src/hooks/dbTaskToTask.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/task.ts src/hooks/dbTaskToTask.ts src/hooks/dbTaskToTask.test.ts
git commit -m "feat(scope): Task.scope type + converter mapping"
```

---

### Task 5: Apply default scope on task creation

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` (`addTask`, ~line 264)
- Test: `src/hooks/useSupabaseTasks.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/hooks/useSupabaseTasks.test.ts`, mirroring the existing insert-payload tests:

```ts
it('addTask derives scope=compound for a family-context task', async () => {
  const { result } = renderHook(() => useSupabaseTasks(/* existing args */))
  await act(async () => {
    await result.current.addTask('Family dinner', undefined, undefined, undefined, { context: 'family' })
  })
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'compound' }))
})
it('addTask derives scope=individual for a work-context task', async () => {
  const { result } = renderHook(() => useSupabaseTasks(/* existing args */))
  await act(async () => {
    await result.current.addTask('Sales call', undefined, undefined, undefined, { context: 'work' })
  })
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'individual' }))
})
```
(Match the file's existing `addTask` signature + mock names — see the existing
insert-payload test around `mockInsert`/`mockUpdate`.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — insert payload has no `scope`.

- [ ] **Step 3: Set scope in `addTask`**

In `useSupabaseTasks.ts addTask`, import `defaultScopeForArea` and add `scope` to
the insert payload, honoring an explicit override if provided:
```ts
import { defaultScopeForArea } from '@/lib/scope'
// ...inside the insert object passed to supabase.from('tasks').insert({...}):
  scope: options?.scope ?? defaultScopeForArea(options?.context ?? null),
```
(Add `scope?: Scope` to the `addTask` options type if it has one.)

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(scope): derive default scope on task creation"
```

---

### Task 6: Full verification + push

- [ ] **Step 1: Typecheck + build**

Run: `cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation && npm run build`
Expected: PASS (Vercel uses `tsc -b` — stricter than pre-push).

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: green (one pre-existing `useNotes` flake is acceptable — rerun to confirm).

- [ ] **Step 3: Manual two-login check (dev server)**

Run: `npm run dev`, then:
- Log in as Scott. Create a **family** task → it should be `scope=compound`; confirm
  it appears for Iris's login. Create a **work** task → `scope=individual`; confirm
  Iris does **not** see it.
- Confirm the wall still shows family/compound items (its query is unchanged here).
- Confirm existing tasks all still display for their owner (backfill preserved view).

- [ ] **Step 4: Push (auto-deploys preview for the branch; NOT main yet)**

```bash
git push -u origin feat/foundation
```
Do **not** merge to `main` until the whole Foundation phase (this + filter unify +
cleanup) is green and reviewed.

---

## Self-review notes
- **Spec coverage:** implements the scope-axis portion of Foundation §C; defers
  groups table, assignment-array, filter-unify, events-scope, cleanup (separate plans).
- **Behavior preservation:** backfill `family→compound`, else `individual`, and the
  RLS swap is 1:1 with the old `context='family'` gate — Iris sees exactly what she
  saw. New capability unlocked: couple/compound on any area (e.g. couple-work).
- **Baked-in decision honored:** couple/compound scope shares with all household
  members regardless of assignee (RLS gates on scope only, not assignee).
- **Type consistency:** `Scope` defined once in `src/lib/scope.ts`, imported by
  `task.ts`, `dbTaskToTask.ts`, `useSupabaseTasks.ts`.
