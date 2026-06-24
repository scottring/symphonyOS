# Conversational Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop a PT Home Exercise Program PDF into Symphony's in-app chat and get a "Shoulder HEP" project with correctly-dosed exercise routines that surface the right number of times per day on Today, each expandable to its instructions and source document.

**Architecture:** Reuse the already-built fenced Sonnet 4.6 agent (`supabase/functions/symphony-agent`). Three additive layers: (1) a dosing data shape on `routines` (`times_per_day`, `image_url`) that materializes N Today instances via slot-encoded timeline ids — no change to the completion key or `markDone`; (2) chat file intake that uploads to the existing `attachments` bucket and passes the document to the multimodal model as a content block; (3) a `symphony_create_routine` agent tool plus a media section in the live detail pane.

**Tech Stack:** React 19 + TS strict, Vite, Supabase (Postgres + Storage + Deno edge functions), Anthropic Messages API (Sonnet 4.6, document/image content blocks), Vitest.

## Global Constraints

- Work only in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/converse-ingest` (branch `converse-ingest`). Never touch the main worktree.
- No emojis in UI — use `lucide-react` icons.
- No em dashes / AI cliches in any agent copy.
- Single-test run is `npx vitest run <file>` (plain `npm test` is watch mode — never pipe it).
- Routine timeline id format is exactly `routine-<routineId>`; the dose extension is `routine-<routineId>#<slotIndex>` (slot 0-based). A routine with no `times_per_day` keeps the bare `routine-<routineId>` form unchanged.
- `actionable_instances` unique key is `(user_id, entity_type, entity_id, date)` and `entity_id` is free-form `text`. Per-dose completion rides on a slotted `entity_id` (`<routineId>#<slot>`); do NOT add a column or change `markDone`.
- All agent DB writes stay RLS-scoped through the per-user client (`db`) already built in the edge function. Never use the service client for writes.
- Image fidelity is **A**: source PDF attaches to the Project; per-exercise cropped images are deferred. `routines.image_url` is added now but populated only in a later fidelity-B pass.
- Migrations: additive only (new nullable columns, widen a CHECK). Apply via the Supabase Management API (migration history is out of sync); also commit the `.sql` file under `supabase/migrations/`.

---

## File Structure

**Create:**
- `supabase/migrations/2026-06-24_routine_dosing_and_media.sql` — adds `routines.times_per_day jsonb`, `routines.image_url text`; widens `attachments.entity_type` CHECK to include `'routine'`.
- `src/lib/today/doseExpansion.ts` — pure helpers: parse a slotted routine timeline id; expand a dosed routine into per-slot `{ slotId, time, slotIndex }[]`.
- `src/lib/today/doseExpansion.test.ts` — unit tests for the above.
- `src/components/surface/sections/PanelMedia.tsx` — detail-pane section rendering a routine's `image_url` and its program's source document.
- `src/components/surface/sections/PanelMedia.test.tsx` — render tests.
- `src/components/chat/ChatAttachment.ts` — types + the upload helper that puts a chat file into the `attachments` bucket and returns a content-block descriptor.

**Modify:**
- `src/types/actionable.ts` — add `times_per_day?: string[] | null` and `image_url?: string | null` to `Routine`.
- `src/types/attachment.ts` — add `'routine'` to `AttachmentEntityType`.
- `src/hooks/useRoutines.ts` — persist `times_per_day` / `image_url` in create + update.
- `src/lib/today/grouping.ts` — expand dosed routines into N timeline items with slotted ids + per-slot status lookup.
- `src/components/schedule/TodayView.tsx` — route completion/skip through the slotted id, but routine-table mutations (context/assign/push) through the bare id.
- `src/components/surface/TapContextPanel.tsx` — mount `PanelMedia` for routine items.
- `src/components/chat/ChatInput.tsx` — file attach (paperclip + drag-drop), preview chip, extend `onSend`.
- `src/types/chat.ts` / `src/lib/agentStream.ts` — allow message `content` to be an array of content blocks.
- `src/hooks/useSymphonyAssistant.ts` — accept an attachment, build the content-block message.
- `supabase/functions/symphony-agent/index.ts` — accept array `content`, add `symphony_create_routine`, update system prompt for protocol ingestion.

---

## Task 1: Dosing + media schema

**Files:**
- Create: `supabase/migrations/2026-06-24_routine_dosing_and_media.sql`
- Modify: `src/types/actionable.ts` (Routine interface, ~lines 66-88)
- Modify: `src/types/attachment.ts:2`

**Interfaces:**
- Produces: `Routine.times_per_day?: string[] | null` (array of `HH:MM` strings, e.g. `["09:00","18:00"]`); `Routine.image_url?: string | null`. `AttachmentEntityType` now includes `'routine'`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/2026-06-24_routine_dosing_and_media.sql
-- Dosing: a routine can recur N times within a single day.
alter table routines add column if not exists times_per_day jsonb;
-- Forward-compat slot for a per-exercise image (fidelity B); null in fidelity A.
alter table routines add column if not exists image_url text;

-- Allow attachments to hang off routines (source documents / exercise media).
alter table attachments drop constraint if exists attachments_entity_type_check;
alter table attachments add constraint attachments_entity_type_check
  check (entity_type in ('task','project','event_note','instance_note','note','routine'));
```

- [ ] **Step 2: Apply it via the Management API**

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d @- <<'JSON'
{"query":"alter table routines add column if not exists times_per_day jsonb; alter table routines add column if not exists image_url text; alter table attachments drop constraint if exists attachments_entity_type_check; alter table attachments add constraint attachments_entity_type_check check (entity_type in ('task','project','event_note','instance_note','note','routine'));"}
JSON
```
Expected: `[]` (success, no rows).

- [ ] **Step 3: Verify the columns exist**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name from information_schema.columns where table_name='\''routines'\'' and column_name in ('\''times_per_day'\'','\''image_url'\'');"}'
```
Expected: both `times_per_day` and `image_url` listed.

- [ ] **Step 4: Extend the TypeScript types**

In `src/types/actionable.ts`, inside `interface Routine`, after `time_of_day: string | null`:
```typescript
  time_of_day: string | null // HH:MM:SS format
  times_per_day?: string[] | null // e.g. ['09:00','18:00']; when set, recurs N times/day
  image_url?: string | null // per-exercise image (fidelity B); null in v1
```
In `src/types/attachment.ts` line 2:
```typescript
export type AttachmentEntityType = 'task' | 'project' | 'event_note' | 'instance_note' | 'note' | 'routine'
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors.
```bash
git add supabase/migrations/2026-06-24_routine_dosing_and_media.sql src/types/actionable.ts src/types/attachment.ts
git commit -m "feat(routines): add times_per_day + image_url; allow routine attachments"
```

---

## Task 2: Persist dosing fields in useRoutines

**Files:**
- Modify: `src/hooks/useRoutines.ts` (`CreateRoutineInput` ~line 6, `UpdateRoutineInput` ~line 23, the insert ~line 153, the update ~line 187)

**Interfaces:**
- Consumes: `Routine.times_per_day`, `Routine.image_url` (Task 1).
- Produces: `CreateRoutineInput.times_per_day?: string[]`, `CreateRoutineInput.image_url?: string | null`; same on `UpdateRoutineInput`. Create persists both; update persists them when present.

- [ ] **Step 1: Add fields to the input types**

In `CreateRoutineInput`:
```typescript
  time_of_day?: string // HH:MM format
  times_per_day?: string[] // when set, routine recurs N times/day
  image_url?: string | null
```
In `UpdateRoutineInput`:
```typescript
  time_of_day?: string | null
  times_per_day?: string[] | null
  image_url?: string | null
```

- [ ] **Step 2: Persist on create**

In the create insert object (near `time_of_day: input.time_of_day || null,`):
```typescript
          time_of_day: input.time_of_day || null,
          times_per_day: input.times_per_day ?? null,
          image_url: input.image_url ?? null,
```

- [ ] **Step 3: Persist on update**

Where update fields are conditionally assigned (near `if (input.time_of_day !== undefined) updates.time_of_day = input.time_of_day`):
```typescript
      if (input.times_per_day !== undefined) updates.times_per_day = input.times_per_day
      if (input.image_url !== undefined) updates.image_url = input.image_url
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors.
```bash
git add src/hooks/useRoutines.ts
git commit -m "feat(routines): persist times_per_day + image_url in create/update"
```

---

## Task 3: Dose-expansion helpers (pure, TDD)

**Files:**
- Create: `src/lib/today/doseExpansion.ts`
- Test: `src/lib/today/doseExpansion.test.ts`

**Interfaces:**
- Produces:
  - `parseRoutineTimelineId(id: string): { routineId: string; slot: number | null }` — `'routine-abc'` → `{routineId:'abc',slot:null}`; `'routine-abc#1'` → `{routineId:'abc',slot:1}`.
  - `routineStatusKey(routineId: string, slot: number | null): string` — `slot==null` → `routineId`; else `` `${routineId}#${slot}` ``.
  - `expandRoutineDoses(routine: Routine): { slotId: string; slotIndex: number | null; time: string | null }[]` — when `times_per_day` has ≥1 entries, one entry per time with `slotId = routine-<id>#<i>`; otherwise a single entry `{ slotId: 'routine-<id>', slotIndex: null, time: routine.time_of_day?.slice(0,5) ?? null }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/today/doseExpansion.test.ts
import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import { parseRoutineTimelineId, routineStatusKey, expandRoutineDoses } from './doseExpansion'

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1', user_id: 'u1', name: 'Median nerve glide', description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null,
    times_per_day: null, image_url: null,
    raw_input: null, show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('parseRoutineTimelineId', () => {
  it('bare id has null slot', () => {
    expect(parseRoutineTimelineId('routine-abc')).toEqual({ routineId: 'abc', slot: null })
  })
  it('slotted id parses the slot', () => {
    expect(parseRoutineTimelineId('routine-abc#2')).toEqual({ routineId: 'abc', slot: 2 })
  })
})

describe('routineStatusKey', () => {
  it('null slot → bare routine id (back-compat with existing instances)', () => {
    expect(routineStatusKey('abc', null)).toBe('abc')
  })
  it('slot → slotted key', () => {
    expect(routineStatusKey('abc', 1)).toBe('abc#1')
  })
})

describe('expandRoutineDoses', () => {
  it('no times_per_day → single bare slot, time from time_of_day', () => {
    const doses = expandRoutineDoses(routine({ time_of_day: '08:00:00' }))
    expect(doses).toEqual([{ slotId: 'routine-r1', slotIndex: null, time: '08:00' }])
  })
  it('two doses → two slotted entries in order', () => {
    const doses = expandRoutineDoses(routine({ times_per_day: ['09:00', '18:00'] }))
    expect(doses).toEqual([
      { slotId: 'routine-r1#0', slotIndex: 0, time: '09:00' },
      { slotId: 'routine-r1#1', slotIndex: 1, time: '18:00' },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/today/doseExpansion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/today/doseExpansion.ts
import type { Routine } from '@/types/actionable'

/** Split a Today routine timeline id into its routine id and optional dose slot. */
export function parseRoutineTimelineId(id: string): { routineId: string; slot: number | null } {
  const body = id.startsWith('routine-') ? id.slice('routine-'.length) : id
  const hash = body.lastIndexOf('#')
  if (hash === -1) return { routineId: body, slot: null }
  const slot = Number(body.slice(hash + 1))
  if (!Number.isInteger(slot)) return { routineId: body, slot: null }
  return { routineId: body.slice(0, hash), slot }
}

/** The actionable_instances entity_id for a routine dose. null slot = legacy bare id. */
export function routineStatusKey(routineId: string, slot: number | null): string {
  return slot === null ? routineId : `${routineId}#${slot}`
}

/** Expand a routine into its per-day doses. Non-dosed routines yield one bare entry. */
export function expandRoutineDoses(
  routine: Routine,
): { slotId: string; slotIndex: number | null; time: string | null }[] {
  const times = routine.times_per_day
  if (Array.isArray(times) && times.length > 0) {
    return times.map((t, i) => ({
      slotId: `routine-${routine.id}#${i}`,
      slotIndex: i,
      time: t.slice(0, 5),
    }))
  }
  return [{
    slotId: `routine-${routine.id}`,
    slotIndex: null,
    time: routine.time_of_day ? routine.time_of_day.slice(0, 5) : null,
  }]
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/today/doseExpansion.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/doseExpansion.ts src/lib/today/doseExpansion.test.ts
git commit -m "feat(today): pure dose-expansion + slot id helpers"
```

---

## Task 4: Materialize doses into the Today timeline

**Files:**
- Modify: `src/lib/today/grouping.ts` (routine mapping, ~lines 62-68)
- Test: `src/lib/today/grouping.test.ts` (add cases)

**Interfaces:**
- Consumes: `expandRoutineDoses`, `routineStatusKey` (Task 3); `routineToTimelineItem` (`src/types/timeline.ts:119`); `routineStatusMap` keyed by `entity_id`.
- Produces: a dosed routine appears as N timeline items, each with `id` = the dose `slotId`, `startTime` from the dose `time`, and `completed/skipped` looked up by `routineStatusKey(routine.id, slotIndex)`. Non-dosed routines are byte-for-byte unchanged (`id` = `routine-<id>`, status keyed by bare id).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/today/grouping.test.ts` (reuse its existing routine/instance factories; if none, mirror the `routine()`/`inst()` factories from `doseExpansion.test.ts` and `statusMaps.test.ts`):
```typescript
it('dosed routine yields one timeline item per dose, completion per slot', () => {
  const r = routine({ id: 'rx', name: 'Median nerve glide', times_per_day: ['09:00', '18:00'] })
  const result = buildGroupedSections({
    routines: [r],
    routineStatusMap: new Map([['rx#0', inst({ entity_id: 'rx#0', status: 'completed' })]]),
    // ...the other buildGroupedSections inputs as the existing tests pass them (tasks:[], events:[], etc.)
  })
  const items = Object.values(result).flat().filter((i) => i.type === 'routine' && i.title === 'Median nerve glide')
  expect(items.map((i) => i.id).sort()).toEqual(['routine-rx#0', 'routine-rx#1'])
  expect(items.find((i) => i.id === 'routine-rx#0')!.completed).toBe(true)
  expect(items.find((i) => i.id === 'routine-rx#1')!.completed).toBe(false)
})
```
> Match `buildGroupedSections`'s real argument shape from the top of `grouping.test.ts`; the assertion content above is what matters.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/today/grouping.test.ts`
Expected: FAIL — only one `routine-rx` item, no per-slot ids.

- [ ] **Step 3: Implement the expansion**

In `src/lib/today/grouping.ts`, add the import:
```typescript
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'
```
Replace the routine `.map(...)` block (currently building one item per routine) with a `.flatMap` that expands doses:
```typescript
const routineItems = routines
  .filter((routine) => match(routine.assigned_to, routine.assigned_to_all))
  .flatMap((routine) =>
    expandRoutineDoses(routine).map((dose) => {
      const item = routineToTimelineItem(routine, viewedDate)
      item.id = dose.slotId
      if (dose.time) {
        const [h, m] = dose.time.split(':').map(Number)
        const start = new Date(viewedDate)
        start.setHours(h, m, 0, 0)
        item.startTime = start
      }
      const instance = routineStatusMap.get(routineStatusKey(routine.id, dose.slotIndex))
      if (instance?.status === 'completed') item.completed = true
      else if (instance?.status === 'skipped') item.skipped = true
      return item
    }),
  )
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/today/grouping.test.ts`
Expected: PASS — both the new test and all existing grouping tests (non-dosed routines unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/grouping.ts src/lib/today/grouping.test.ts
git commit -m "feat(today): materialize dosed routines as one timeline item per dose"
```

---

## Task 5: Per-slot completion wiring in TodayView

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (~lines 768-854)

**Interfaces:**
- Consumes: `parseRoutineTimelineId` (Task 3); the slotted `item.id` from Task 4; existing callbacks `onCompleteRoutine(routineEntityId, completed)`, `onSkipRoutine(routineEntityId)`, `onPushRoutine`, `onAssignRoutine`, `onUpdateRoutine`, `getRoutineStats`.
- Produces: completion + skip pass the **slotted entity id** (`routineId` or `routineId#slot`) so each dose toggles its own `actionable_instances` row; routine-table mutations (push/assign/context/stats) pass the **bare routineId**.

Rationale: `onCompleteRoutine`/`onSkipRoutine` write `actionable_instances` (entity_id is free-form text — slot is fine and desired). `onPushRoutine`/`onAssign*`/`onUpdateRoutine`/`getRoutineStats` operate on the `routines` row (must be the real UUID, no slot).

- [ ] **Step 1: Add the import**

```typescript
import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
```

- [ ] **Step 2: Derive both ids once where the routine item is rendered**

Just inside the `item.type === 'routine'` branch (near line 768), before the callbacks:
```typescript
const { routineId: bareRoutineId, slot } = parseRoutineTimelineId(item.id)
const routineEntityId = slot === null ? bareRoutineId : `${bareRoutineId}#${slot}`
```

- [ ] **Step 3: Route completion + skip through the slotted id; everything else through the bare id**

```typescript
onCompleteRoutine(routineEntityId, !item.completed)
// ...
? () => onSkipRoutine(routineEntityId)
// push / assign / context / stats use the bare routine UUID:
? (date) => { if (date instanceof Date) onPushRoutine(bareRoutineId, date) }
? (memberId) => onAssignRoutine(bareRoutineId, memberId)
? (memberIds) => onAssignRoutineAll(bareRoutineId, memberIds)
? (context) => onUpdateRoutine(bareRoutineId, { context })
? getRoutineStats(bareRoutineId)?.currentStreak
```
Replace each existing `item.id.replace('routine-', '')` in this block accordingly. (For non-dosed routines `routineEntityId === bareRoutineId`, so this is a no-op for them.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual smoke (recorded in PR notes, not automated)**

With a dosed routine present (create one via SQL: `update routines set times_per_day='["09:00","18:00"]' where id=...`), load Today: the routine shows twice; checking the 9:00 one leaves the 18:00 one unchecked after refresh.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): per-dose completion; routine mutations keep bare id"
```

---

## Task 6: PanelMedia in the detail pane

**Files:**
- Create: `src/components/surface/sections/PanelMedia.tsx`
- Test: `src/components/surface/sections/PanelMedia.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx` (mount the section for routine items)

**Interfaces:**
- Produces: `PanelMedia({ imageUrl, sourceDoc })` where `sourceDoc?: { fileName: string; onOpen: () => void }`. Renders an image when `imageUrl` is set; renders a compact "Source document" row (lucide `FileText` icon) calling `onOpen` when `sourceDoc` is set; renders nothing when both are absent.
- Consumes (in TapContextPanel): the routine's `image_url`; the program PDF via `useAttachments().getAttachments('project', routine.project_id)` + `getSignedUrl(storagePath)` on open.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/surface/sections/PanelMedia.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PanelMedia } from './PanelMedia'

describe('PanelMedia', () => {
  it('renders nothing when no media', () => {
    const { container } = render(<PanelMedia />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders the image when imageUrl is set', () => {
    render(<PanelMedia imageUrl="https://x/y.png" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/y.png')
  })
  it('renders a source-document row and fires onOpen', async () => {
    const onOpen = vi.fn()
    render(<PanelMedia sourceDoc={{ fileName: 'shoulder-hep.pdf', onOpen }} />)
    screen.getByText('shoulder-hep.pdf').click()
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/surface/sections/PanelMedia.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PanelMedia**

```tsx
// src/components/surface/sections/PanelMedia.tsx
import { FileText } from 'lucide-react'

interface PanelMediaProps {
  imageUrl?: string | null
  sourceDoc?: { fileName: string; onOpen: () => void }
}

export function PanelMedia({ imageUrl, sourceDoc }: PanelMediaProps) {
  if (!imageUrl && !sourceDoc) return null
  return (
    <div className="space-y-2">
      {imageUrl && (
        <img src={imageUrl} alt="" className="w-full max-h-64 object-contain rounded-lg" />
      )}
      {sourceDoc && (
        <button
          onClick={sourceDoc.onOpen}
          className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100">
            <FileText className="w-4 h-4 text-sky-700" />
          </span>
          <span className="flex-1 text-sm text-neutral-800 truncate">{sourceDoc.fileName}</span>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/surface/sections/PanelMedia.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount in TapContextPanel for routine items**

In `src/components/surface/TapContextPanel.tsx`, where the routine detail is rendered, add:
```tsx
import { PanelMedia } from './sections/PanelMedia'
import { useAttachments } from '@/hooks/useAttachments'
// ...inside the component, when the item is a routine with originalRoutine `r`:
const { getAttachments, getSignedUrl } = useAttachments()
const projectDoc = r.project_id ? getAttachments('project', r.project_id)[0] : undefined
// ...in the JSX, below the notes/why section:
<PanelMedia
  imageUrl={r.image_url}
  sourceDoc={projectDoc ? {
    fileName: projectDoc.fileName,
    onOpen: async () => {
      const url = await getSignedUrl(projectDoc.storagePath)
      if (url) window.open(url, '_blank', 'noopener')
    },
  } : undefined}
/>
```
> Routines don't carry `project_id` today; if the live `Routine` lacks it, render with `imageUrl` only and leave `sourceDoc` undefined — the source PDF is still reachable from the Project view. (The agent attaches the PDF to the project regardless.)

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors.
```bash
git add src/components/surface/sections/PanelMedia.tsx src/components/surface/sections/PanelMedia.test.tsx src/components/surface/TapContextPanel.tsx
git commit -m "feat(panel): media section renders exercise image + source document"
```

---

## Task 7: Chat file intake

**Files:**
- Create: `src/components/chat/ChatAttachment.ts`
- Modify: `src/components/chat/ChatInput.tsx`

**Interfaces:**
- Produces:
  - `ChatAttachment` type: `{ url: string; fileType: string; fileName: string }`.
  - `uploadChatFile(file: File, userId: string): Promise<ChatAttachment>` — uploads to the `attachments` bucket under `${userId}/chat/${Date.now()}-${safeName}`, returns a 1-hour signed url + mime + name.
  - `ChatInput` now calls `onSend(message: string, attachment?: ChatAttachment)` and exposes a paperclip button + drag-drop accepting `ALLOWED_FILE_TYPES`, showing a removable preview chip before send.

- [ ] **Step 1: Implement the upload helper**

```typescript
// src/components/chat/ChatAttachment.ts
import { supabase } from '@/lib/supabase'

export interface ChatAttachment {
  url: string
  fileType: string
  fileName: string
}

export async function uploadChatFile(file: File, userId: string): Promise<ChatAttachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/chat/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, {
    cacheControl: '3600', upsert: false,
  })
  if (error) throw error
  const { data, error: signErr } = await supabase.storage.from('attachments').createSignedUrl(path, 3600)
  if (signErr || !data) throw signErr ?? new Error('Could not sign url')
  return { url: data.signedUrl, fileType: file.type, fileName: file.name }
}
```

- [ ] **Step 2: Extend ChatInput props + state**

Change the props and add a hidden file input + state:
```typescript
import { ALLOWED_FILE_TYPES } from '@/types/attachment'
import { uploadChatFile, type ChatAttachment } from './ChatAttachment'
import { useAuth } from '@/hooks/useAuth'
import { Paperclip, X } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string, attachment?: ChatAttachment) => void
  loading?: boolean
  placeholder?: string
}
```
Inside the component:
```typescript
const { user } = useAuth()
const fileRef = useRef<HTMLInputElement>(null)
const [pending, setPending] = useState<ChatAttachment | null>(null)
const [uploading, setUploading] = useState(false)

const attach = useCallback(async (file: File) => {
  if (!user || !ALLOWED_FILE_TYPES.includes(file.type as never)) return
  setUploading(true)
  try { setPending(await uploadChatFile(file, user.id)) }
  finally { setUploading(false) }
}, [user])
```

- [ ] **Step 3: Send text + attachment together, then clear**

Update `handleSubmit`:
```typescript
const handleSubmit = useCallback(() => {
  if ((!value.trim() && !pending) || loading || uploading) return
  onSend(value.trim(), pending ?? undefined)
  setValue(''); setPending(null)
}, [value, pending, loading, uploading, onSend])
```

- [ ] **Step 4: Render the paperclip, hidden input, drop target, and preview chip**

Add to the composer (paperclip button before the textarea, preview chip above it):
```tsx
{pending && (
  <div className="flex items-center gap-2 text-xs text-neutral-600 px-2 py-1 bg-neutral-100 rounded-md">
    <span className="truncate flex-1">{pending.fileName}</span>
    <button onClick={() => setPending(null)} aria-label="Remove attachment"><X className="w-3 h-3" /></button>
  </div>
)}
<input ref={fileRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} className="hidden"
  onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f) }} />
<button onClick={() => fileRef.current?.click()} disabled={loading || uploading}
  className="flex-none w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
  aria-label="Attach file"><Paperclip className="w-4 h-4" /></button>
```
On the outer composer `div`, add drag-drop:
```tsx
onDragOver={(e) => e.preventDefault()}
onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) attach(f) }}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors (the `onSend` signature change ripples to Task 8's consumer; if `useSymphonyAssistant` isn't updated yet, temporarily its call site still compiles because the second arg is optional).
```bash
git add src/components/chat/ChatAttachment.ts src/components/chat/ChatInput.tsx
git commit -m "feat(chat): attach a file (paperclip + drag-drop) to a message"
```

---

## Task 8: Pass the document to the agent (client + message shape)

**Files:**
- Modify: `src/types/chat.ts` (or wherever `AgentApiMessage` lives — `src/lib/agentStream.ts`)
- Modify: `src/lib/agentStream.ts`
- Modify: `src/hooks/useSymphonyAssistant.ts`

**Interfaces:**
- Consumes: `ChatAttachment` (Task 7).
- Produces: `AgentApiMessage.content` may be a `string` OR an array of Anthropic content blocks. `useSymphonyAssistant.sendMessage(text: string, attachment?: ChatAttachment)` builds, for an attachment, a content-block array: a `text` block plus an `image` block (`source:{type:'url',url}`) for images or a `document` block (`source:{type:'url',url}`) for `application/pdf`.

- [ ] **Step 1: Widen the message content type**

In `src/lib/agentStream.ts` (where `AgentApiMessage` is defined):
```typescript
export type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'document'; source: { type: 'url'; url: string } }
export interface AgentApiMessage {
  role: 'user' | 'assistant'
  content: string | AgentContentBlock[]
}
```

- [ ] **Step 2: Build the content-block message in the hook**

In `useSymphonyAssistant.ts`, change `sendMessage` to accept the attachment and build content:
```typescript
const sendMessage = useCallback(async (text: string, attachment?: ChatAttachment) => {
  if ((!text.trim() && !attachment) || loading) return

  const content: AgentApiMessage['content'] = attachment
    ? [
        { type: 'text', text: text.trim() || 'Set this up.' },
        attachment.fileType === 'application/pdf'
          ? { type: 'document', source: { type: 'url', url: attachment.url } }
          : { type: 'image', source: { type: 'url', url: attachment.url } },
      ]
    : text.trim()

  const apiMessages: AgentApiMessage[] = [
    ...messages.filter((m) => m.content.trim().length > 0).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content },
  ]
  // ...unchanged: build userMsg (display text = text.trim() || attachment.fileName), placeholder, stream
```
Set the displayed user message text to `text.trim() || (attachment ? attachment.fileName : '')`.

- [ ] **Step 3: Update the ChatPanel wiring**

Wherever `ChatPanel` passes `onSend` to `ChatInput`, forward the second arg:
```tsx
<ChatInput onSend={(msg, attachment) => sendMessage(msg, attachment)} loading={loading} />
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors.
```bash
git add src/lib/agentStream.ts src/hooks/useSymphonyAssistant.ts src/components/chat/ChatPanel.tsx
git commit -m "feat(chat): send document/image content blocks to the agent"
```

---

## Task 9: Edge function — accept documents + symphony_create_routine

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts`

**Interfaces:**
- Consumes: array-or-string `content` from Task 8.
- Produces: the agent can read an attached PDF/image and call a new `symphony_create_routine` tool that inserts into `routines` (RLS-scoped) with `name`, `description`, `recurrence_pattern` (default `{type:'daily'}`), `times_per_day`, `time_of_day`, `project_id`, `context`, `image_url`.

- [ ] **Step 1: Handle array content in the date-prefix wrap**

Replace the `convo` mapping (~line where `i === 0 ? ... \`(Today is ${today}.)\\n\\n${m.content}\``):
```typescript
const datePrefix = `(Today is ${today}.)`
const convo: Array<{ role: string; content: unknown }> = incoming.map(
  (m: { role: string; content: unknown }, i: number) => {
    if (i !== 0) return { role: m.role, content: m.content }
    if (typeof m.content === 'string') return { role: m.role, content: `${datePrefix}\n\n${m.content}` }
    // array content: prepend the date as its own text block
    return { role: m.role, content: [{ type: 'text', text: datePrefix }, ...(m.content as unknown[])] }
  },
)
```

- [ ] **Step 2: Add the create_routine tool schema**

Append to the `TOOLS` array (before the closing `]`):
```typescript
  {
    name: 'symphony_create_routine',
    description: 'Create a recurring routine. For a protocol/exercise done multiple times a day, set times_per_day (array of HH:MM). recurrence_pattern defaults to daily. Link it to a program with project_id.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'instructions shown when expanded' },
        recurrence_pattern: { type: 'object', description: 'defaults to {"type":"daily"}' },
        times_per_day: { type: 'array', items: { type: 'string' }, description: 'HH:MM list, e.g. ["09:00","18:00"]' },
        time_of_day: { type: 'string', description: 'HH:MM for a once-a-day routine' },
        project_id: { type: 'string' },
        context: { type: 'string', enum: CONTEXT_ENUM },
        image_url: { type: 'string' },
      },
      required: ['name'],
    },
  },
```

- [ ] **Step 3: Implement the tool executor case**

In `runTool`, add before `default:`:
```typescript
      case 'symphony_create_routine': {
        const { recurrence_pattern, ...rest } = input as Record<string, unknown>
        const { data, error } = await db.from('routines')
          .insert({
            ...rest,
            recurrence_pattern: recurrence_pattern ?? { type: 'daily' },
            visibility: 'active',
            show_on_timeline: true,
            user_id: userId,
          })
          .select().single()
        if (error) throw error
        return JSON.stringify(data, null, 2)
      }
```

- [ ] **Step 4: Update the system prompt for protocol ingestion**

Append to `SYSTEM_PROMPT`:
```
When the user attaches a document describing a recurring protocol (e.g. a physical-therapy home exercise program):
- Read it. Extract each distinct item, its instructions, and how many times per day it is done.
- First create a project to hold the program (symphony_create_project), context "personal".
- Then create one routine per item (symphony_create_routine), setting times_per_day when an item is done more than once a day, and project_id to the new project.
- Before creating anything, list what you found (item -> frequency) and ask the user to confirm. Only write after they confirm.
- If a frequency is unclear, ask rather than guessing. Never invent a cadence the document does not state.
```
Also add `symphony_create_routine` to the client's `WRITE_TOOLS` set in `src/hooks/useSymphonyAssistant.ts` so a refetch fires.

- [ ] **Step 5: Deploy + verify the function boots**

```bash
npx supabase functions deploy symphony-agent --project-ref mwadppyrqzuzgstmwpuy
```
Expected: deploy succeeds. (Manual chat test happens in Task 10.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/symphony-agent/index.ts src/hooks/useSymphonyAssistant.ts
git commit -m "feat(agent): read attached documents; symphony_create_routine with dosing"
```

---

## Task 10: End-to-end acceptance (the real test)

**Files:** none (manual verification + notes).

- [ ] **Step 1: Run the worktree dev server**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/converse-ingest && npm run dev
```
Expected: dev server on localhost; the `.env` was copied so auth works.

- [ ] **Step 2: Drive the real flow**

In the right-rail chat: attach Scott's actual shoulder Home Exercise Program PDF, type "set this up", send.
Expected: the agent lists each exercise with its per-day frequency and asks to confirm.

- [ ] **Step 3: Confirm and inspect**

Reply "yes".
Expected: a "Shoulder HEP" project is created with the PDF attached; one routine per exercise exists; multi-times-a-day exercises have `times_per_day` set.

- [ ] **Step 4: Verify Today**

Open Today.
Expected: each dosed exercise appears the correct number of times; checking one dose leaves the others unchecked; opening an exercise shows its instructions and a path to the source document.

- [ ] **Step 5: Run the full unit suite + typecheck before any push**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```
Expected: green (modulo the known flaky `useNotes` test). Then push the branch as a preview (do NOT push to main): `git push origin converse-ingest`.

---

## Self-Review

- **Spec coverage:** Eyes (Tasks 7-8), Hands/recurrence (Tasks 1-5, 9), Show-the-picture (Task 6). Project-as-program + Routine-as-exercise modeling (Task 9 prompt + create_routine). Confirmation-before-write (Task 9 prompt). Error handling — unreadable/ambiguous doc, never fabricate cadence (Task 9 prompt); upload failure surfaces in composer (Task 7 try/finally leaves no chip). Fidelity A with `image_url` ready for B (Tasks 1, 6). Per-slot completion independence (Tasks 3-5). Testing: dose expansion (Task 3), materialization (Task 4), PanelMedia (Task 6), acceptance (Task 10). All spec sections map to a task.
- **Placeholder scan:** No TBD/"handle edge cases"; each code step shows real code. The two spots that defer to live shapes (grouping.test argument shape in Task 4; routine `project_id` presence in Task 6) name the exact fallback.
- **Type consistency:** `parseRoutineTimelineId`/`routineStatusKey`/`expandRoutineDoses` signatures are identical across Tasks 3-5. `ChatAttachment` identical in Tasks 7-8. `times_per_day: string[]` (`HH:MM`) consistent across schema, type, hook, expansion, and tool.
