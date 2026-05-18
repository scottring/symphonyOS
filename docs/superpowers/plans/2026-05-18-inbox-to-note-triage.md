# Inbox → Note & Project Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new destinations to the inbox-triage flow — a `📝 Note` quick-action that consumes the inbox item into an existing or new note (with AI-suggested matching), and a `+ Create new project` entry in the existing Project picker that turns the task into a project-tagged task.

**Architecture:** Pure-function utility + a new Supabase Edge Function (`note-match`) calling Anthropic Haiku to rank existing notes against the inbox item. A new client hook (`useNoteSuggestion`) wraps the call with per-task-id caching. A new `NotePicker` popover component renders the suggestion strip + filtered list + create-new flow. Existing `ProjectControl` is extracted to its own file and gains the create-new entry. The row action (`{ kind: 'note' }`) is added to `DenseInboxRow`'s `QuickAction` set and the routing logic lives in the two surfaces that own the row (`InboxView`, `StagingFloat`). Undo restores the task and reverts/deletes the note as appropriate.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4, Vitest + React Testing Library, Playwright (E2E), Supabase (Postgres + Edge Functions on Deno), Anthropic Haiku 4.5 via `https://api.anthropic.com/v1/messages`.

**Spec:** `docs/superpowers/specs/2026-05-18-inbox-to-note-triage-design.md`

---

## File Structure

**New files:**
- `src/lib/inboxBullet.ts` — pure function that formats a task into the bullet line appended to a note
- `src/lib/inboxBullet.test.ts` — colocated unit tests
- `src/components/project/ProjectControl.tsx` — extracted from `DenseInboxRow`, gains create-new
- `src/components/project/ProjectControl.test.tsx` — unit tests
- `src/components/notes/NotePicker.tsx` — popover component
- `src/components/notes/NotePicker.test.tsx` — unit tests
- `src/hooks/useNoteSuggestion.ts` — fetches + caches the LLM call
- `src/hooks/useNoteSuggestion.test.ts` — hook tests with mocked fetch
- `supabase/functions/note-match/index.ts` — Edge Function
- `supabase/functions/note-match/index_test.ts` — function tests with mocked Anthropic fetch
- `supabase/functions/note-match/deno.json` — Deno config (matches other functions)
- `e2e/inbox-to-note.spec.ts` — Playwright golden-path test

**Modified files:**
- `src/types/note.ts` — extend `NoteSource` union with `'inbox_triage'`
- `src/components/schedule/DenseInboxRow.tsx` — extend `QuickAction` with `{ kind: 'note' }`, render the `📝 Note` button, remove inline `ProjectControl` definition, import from new file, pass `onCreateProject` callback through
- `src/components/schedule/InboxView.tsx` — handle `kind === 'note'` in `onQuickAction` (open picker, perform append/create, delete task, push undo); wire `onCreateProject`
- `src/components/schedule/StagingFloat.tsx` — same wiring as InboxView; extend `WEEK_ACTIONS` to include `{ kind: 'note' }`

**Each new component/hook has one clear responsibility:** `NotePicker` renders the UI and emits a selection; `useNoteSuggestion` fetches; the Edge Function ranks; the bullet util formats; `ProjectControl` handles project picking + creation. Routing/state lives in the surface components that already own task lifecycle (`InboxView`, `StagingFloat`).

---

## Task 1: Extend `NoteSource` type with `'inbox_triage'`

**Files:**
- Modify: `src/types/note.ts`

- [ ] **Step 1: Read current `NoteSource` union**

Run: `grep -n "NoteSource" src/types/note.ts`

Expected: shows the union definition (single line) — note current values for the next step.

- [ ] **Step 2: Add `'inbox_triage'` to the union**

Open `src/types/note.ts`. Find the `NoteSource` type alias near the top and add `| 'inbox_triage'` to the end of the union. The exact wording of surrounding values must be preserved — do not reorder existing entries.

Example (your current values may differ; only the addition matters):

```ts
export type NoteSource =
  | 'app'
  | 'vault'
  | 'voice'
  | 'meeting'
  | 'inbox_triage'  // ← add this line
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exits with code 0, no output. Type-only change can't break anything else because no consumer reads `'inbox_triage'` yet.

- [ ] **Step 4: Commit**

```bash
git add src/types/note.ts
git commit -m "feat(notes): add 'inbox_triage' to NoteSource union"
```

---

## Task 2: `formatInboxBullet` pure utility

**Files:**
- Create: `src/lib/inboxBullet.ts`
- Test: `src/lib/inboxBullet.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/inboxBullet.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest'
import { formatInboxBullet } from './inboxBullet'

describe('formatInboxBullet', () => {
  const fixedNow = new Date(2026, 4, 18, 14, 23) // 2026-05-18 14:23 local

  it('formats title-only items as a single timestamped bullet line', () => {
    const out = formatInboxBullet(
      { title: 'Look into bike storage', notes: undefined },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Look into bike storage')
  })

  it('appends indented notes on a second line when present', () => {
    const out = formatInboxBullet(
      { title: 'Vet appointment', notes: 'Check the new tag too' },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Vet appointment\n  Check the new tag too')
  })

  it('treats empty-string notes the same as missing notes', () => {
    const out = formatInboxBullet(
      { title: 'Task', notes: '' },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Task')
  })

  it('pads single-digit months, days, hours, minutes', () => {
    const out = formatInboxBullet(
      { title: 'X', notes: undefined },
      new Date(2026, 0, 3, 4, 5), // Jan 3, 4:05
    )
    expect(out).toBe('- 2026-01-03 04:05 — X')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/inboxBullet.test.ts --reporter=basic`
Expected: FAIL with error like "Failed to load url ./inboxBullet" — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/inboxBullet.ts`:

```ts
/**
 * Format an inbox item as the bullet line appended to a note's content
 * when the user routes the item via the `📝 Note` triage action.
 *
 * Shape:
 *   - YYYY-MM-DD HH:MM — <title>
 *     <indented notes on a second line, if present>
 */
export function formatInboxBullet(
  item: { title: string; notes?: string },
  now: Date,
): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const stamp = `${yyyy}-${mm}-${dd} ${hh}:${mi}`

  const head = `- ${stamp} — ${item.title}`
  if (!item.notes) return head
  return `${head}\n  ${item.notes}`
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/lib/inboxBullet.test.ts --reporter=basic`
Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inboxBullet.ts src/lib/inboxBullet.test.ts
git commit -m "feat(notes): formatInboxBullet utility for inbox→note triage"
```

---

## Task 3: Extract `ProjectControl` into its own file

This is a pure refactor. The existing `ProjectControl` lives at the bottom of `src/components/schedule/DenseInboxRow.tsx` (around lines 197-279 at the time of writing — verify with grep before editing). It will be moved verbatim to `src/components/project/ProjectControl.tsx` and re-exported from there. Existing `DenseInboxRow.test.tsx` should continue to pass without modification.

**Files:**
- Create: `src/components/project/ProjectControl.tsx`
- Modify: `src/components/schedule/DenseInboxRow.tsx`

- [ ] **Step 1: Verify existing tests pass before the refactor**

Run: `npx vitest run src/components/schedule/DenseInboxRow.test.tsx --reporter=basic`
Expected: PASS (baseline — all tests pass).

- [ ] **Step 2: Locate `ProjectControl` in `DenseInboxRow.tsx`**

Run: `grep -n "ProjectControl\|interface ProjectControlProps\|function ProjectControl" src/components/schedule/DenseInboxRow.tsx`
Expected: shows the interface, the function definition, and the JSX usage site near the middle of the row. Note the exact start/end line numbers — you'll need them for Step 3.

- [ ] **Step 3: Create the new file with the extracted component**

Create `src/components/project/ProjectControl.tsx` and paste the exact `ProjectControl` function and `ProjectControlProps` interface from `DenseInboxRow.tsx`. Add the imports that `ProjectControl` needs (it uses `useState`, `useEffect`, `useRef`, `X`, `FolderPlus` from lucide-react, and the `Project` type). The file should look like this:

```tsx
import { useState, useEffect, useRef } from 'react'
import { X, FolderPlus } from 'lucide-react'
import type { Project } from '@/types/project'

interface ProjectControlProps {
  project?: Project
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  onAssign: (projectId: string) => void
  onClear: () => void
}

export function ProjectControl({ project, projects, onOpenProject, onAssign, onClear }: ProjectControlProps) {
  // ...paste the existing function body verbatim from DenseInboxRow.tsx...
}
```

> Paste the function body *exactly* as it was in `DenseInboxRow.tsx`. Do not rename, reformat, or "improve" any logic in this step — refactor only, behavior unchanged.

- [ ] **Step 4: Replace the inline component in `DenseInboxRow.tsx` with an import**

In `src/components/schedule/DenseInboxRow.tsx`:

1. Delete the `ProjectControl` function definition and the `ProjectControlProps` interface from the bottom of the file.
2. Add this import at the top, alongside the existing imports:

```ts
import { ProjectControl } from '@/components/project/ProjectControl'
```

3. Remove the no-longer-used `X` and `FolderPlus` lucide imports from `DenseInboxRow.tsx` if (and only if) they were used only by `ProjectControl`. Verify with grep before deleting:

```bash
grep -E "\bX\b|FolderPlus" src/components/schedule/DenseInboxRow.tsx
```

If `X` or `FolderPlus` appear in any remaining JSX, leave the import. If they don't appear anywhere, delete the import.

- [ ] **Step 5: Verify the original tests still pass**

Run: `npx vitest run src/components/schedule/DenseInboxRow.test.tsx --reporter=basic`
Expected: PASS — same number of tests, all green. The refactor must not change behavior.

- [ ] **Step 6: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/project/ProjectControl.tsx src/components/schedule/DenseInboxRow.tsx
git commit -m "refactor(project): extract ProjectControl into its own file"
```

---

## Task 4: Add "Create new project" entry to `ProjectControl`

**Files:**
- Modify: `src/components/project/ProjectControl.tsx`
- Create: `src/components/project/ProjectControl.test.tsx`

The component gains:
- A new optional prop `onCreate?: (name: string, context: TaskContext | null) => void`. When provided, the dropdown shows a divider and a `+ Create new project…` entry below the list.
- Clicking that entry expands an inline form: a text input prefilled with a `defaultNewName` prop (the inbox item's title), a chip row for context (`work` / `family` / `personal` / no-context), and a `Create` button.
- On submit: calls `onCreate(name, context)` and closes the dropdown.

- [ ] **Step 1: Write the failing test file**

Create `src/components/project/ProjectControl.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectControl } from './ProjectControl'

const project = (id: string, name: string) => ({
  id,
  name,
  status: 'in_progress' as const,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
})

describe('ProjectControl — create-new path', () => {
  it('shows "+ Create new project…" entry when onCreate is provided', () => {
    render(
      <ProjectControl
        projects={[project('p1', 'Backyard reno')]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={vi.fn()}
        defaultNewName="Look into bike storage"
      />,
    )
    // open the dropdown
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    expect(screen.getByText(/Create new project/i)).toBeInTheDocument()
  })

  it('does NOT show "+ Create new project…" when onCreate is not provided', () => {
    render(
      <ProjectControl
        projects={[project('p1', 'Backyard reno')]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    expect(screen.queryByText(/Create new project/i)).not.toBeInTheDocument()
  })

  it('expands inline form prefilled with defaultNewName when "+ Create" is tapped', () => {
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={vi.fn()}
        defaultNewName="Bike storage ideas"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    const input = screen.getByLabelText(/project name/i) as HTMLInputElement
    expect(input.value).toBe('Bike storage ideas')
  })

  it('calls onCreate with the trimmed name and selected context on submit', () => {
    const onCreate = vi.fn()
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={onCreate}
        defaultNewName="  Bike storage  "
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    fireEvent.click(screen.getByRole('button', { name: /context: family/i }))
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).toHaveBeenCalledWith('Bike storage', 'family')
  })

  it('does not call onCreate when the name input is empty', () => {
    const onCreate = vi.fn()
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={onCreate}
        defaultNewName=""
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/components/project/ProjectControl.test.tsx --reporter=basic`
Expected: FAIL — `onCreate` prop doesn't exist yet, "+ Create new project" text not found.

- [ ] **Step 3: Update `ProjectControl.tsx` to add the create-new branch**

Edit `src/components/project/ProjectControl.tsx`:

1. Import `TaskContext`:

```ts
import type { TaskContext } from '@/types/task'
```

2. Extend the props interface:

```ts
interface ProjectControlProps {
  project?: Project
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  onAssign: (projectId: string) => void
  onClear: () => void
  /** When provided, the dropdown shows a "+ Create new project…" entry. */
  onCreate?: (name: string, context: TaskContext | null) => void
  /** Prefilled value for the create-new name input (e.g., the inbox task's title). */
  defaultNewName?: string
}
```

3. Destructure the new props in the function signature.

4. Add state for the inline create form (place at top of the function body, alongside the existing `open` state):

```ts
const [creating, setCreating] = useState(false)
const [newName, setNewName] = useState(defaultNewName ?? '')
const [newContext, setNewContext] = useState<TaskContext | null>(null)

useEffect(() => {
  // Reset the form whenever the dropdown closes
  if (!open) {
    setCreating(false)
    setNewName(defaultNewName ?? '')
    setNewContext(null)
  }
}, [open, defaultNewName])

const handleCreateSubmit = () => {
  const trimmed = newName.trim()
  if (!trimmed || !onCreate) return
  onCreate(trimmed, newContext)
  setOpen(false)
}
```

5. Inside the existing dropdown panel, after the rendered list of existing projects, add the divider + create-new entry. Locate the closing tag of the dropdown's project list (in the existing JSX) and insert below it, but still inside the dropdown container:

```tsx
{onCreate && (
  <>
    <div className="border-t border-neutral-100 my-1" />
    {!creating ? (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="block w-full text-left px-3 py-1.5 text-sm text-primary-700 hover:bg-primary-50"
      >
        + Create new project…
      </button>
    ) : (
      <div className="px-3 py-2 space-y-2">
        <label className="block text-xs text-neutral-500" htmlFor="new-project-name">
          Project name
        </label>
        <input
          id="new-project-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Project name"
          className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
          autoFocus
        />
        <div className="flex gap-1 flex-wrap">
          {([
            { value: 'work', label: 'Work' },
            { value: 'family', label: 'Family' },
            { value: 'personal', label: 'Personal' },
            { value: null, label: 'None' },
          ] as const).map(({ value, label }) => (
            <button
              key={label}
              type="button"
              aria-label={`Context: ${label}`}
              onClick={() => setNewContext(value)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                newContext === value
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCreateSubmit}
          disabled={!newName.trim()}
          className="w-full px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
        >
          Create
        </button>
      </div>
    )}
  </>
)}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npx vitest run src/components/project/ProjectControl.test.tsx --reporter=basic`
Expected: PASS, 5 tests pass.

- [ ] **Step 5: Verify the existing DenseInboxRow tests still pass**

Run: `npx vitest run src/components/schedule/DenseInboxRow.test.tsx --reporter=basic`
Expected: PASS — no regressions.

- [ ] **Step 6: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/project/ProjectControl.tsx src/components/project/ProjectControl.test.tsx
git commit -m "feat(project): add inline create-new entry to ProjectControl dropdown"
```

---

## Task 5: Wire `onCreateProject` callback from `DenseInboxRow` through to its callers

`ProjectControl` now accepts `onCreate` and `defaultNewName`. `DenseInboxRow` already renders `ProjectControl` but doesn't yet pass these props. The owning surfaces (`InboxView`, `StagingFloat`) need a new `onCreateProject` callback that calls `useProjects.addProject` and then assigns the resulting `projectId` to the task.

**Files:**
- Modify: `src/components/schedule/DenseInboxRow.tsx`
- Modify: `src/components/schedule/InboxView.tsx`
- Modify: `src/components/schedule/StagingFloat.tsx`

- [ ] **Step 1: Add the new prop to `DenseInboxRow`'s props interface**

In `src/components/schedule/DenseInboxRow.tsx`, extend `DenseInboxRowProps`:

```ts
interface DenseInboxRowProps {
  task: Task
  project?: Project
  projects?: Project[]
  familyMembers: FamilyMember[]
  quickActions: QuickAction[]
  onQuickAction: (action: QuickAction) => void
  onToggleComplete: () => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onOpenProject?: (projectId: string) => void
  onAssign?: (memberIds: string[]) => void
  /** Called when the user creates a new project from the inline form.
   *  Should create the project and assign it to this task. */
  onCreateProject?: (name: string, context: TaskContext | null) => void
  isLeaving?: boolean
}
```

(`TaskContext` is already imported at the top of the file from `@/types/task`.)

- [ ] **Step 2: Destructure and pass `onCreateProject` through to `ProjectControl`**

Add `onCreateProject` to the destructured props of `DenseInboxRow`. Then update the `ProjectControl` JSX usage to wire the new props:

```tsx
<ProjectControl
  project={project}
  projects={projects}
  onOpenProject={onOpenProject}
  onAssign={(projectId) => onUpdate({ projectId })}
  onClear={() => onUpdate({ projectId: undefined })}
  onCreate={onCreateProject}
  defaultNewName={task.title}
/>
```

- [ ] **Step 3: Wire `onCreateProject` in `InboxView`**

Open `src/components/schedule/InboxView.tsx`. Locate where `<DenseInboxRow ... />` is rendered.

Add this handler near the top of the component (where other callbacks live), where `useProjects` is already in scope. If `useProjects` is not yet imported and used at the top of `InboxView`, add it:

```ts
import { useProjects } from '@/hooks/useProjects'
```

```ts
const { addProject, deleteProject } = useProjects()
```

Add the handler factory (undo per spec: clears the projectId AND deletes the just-created project):

```ts
const makeOnCreateProject = (taskId: string) => async (name: string, context: TaskContext | null) => {
  const project = await addProject({ name, status: 'in_progress', context })
  if (!project) return
  await onUpdateTask(taskId, { projectId: project.id })
  pushAction(`Attached to '${project.name}'`, async () => {
    await onUpdateTask(taskId, { projectId: undefined })
    await deleteProject(project.id)
  })
}
```

(`onUpdateTask` is the existing task-update callback. `pushAction` is the existing undo entry-point — verify both names against `src/components/home/HomeView.tsx` / `src/hooks/useUndo.ts` and adapt if the local names differ in this surface. Do not invent functions.)

Then pass it to each `<DenseInboxRow>`:

```tsx
<DenseInboxRow
  ...existing props...
  onCreateProject={makeOnCreateProject(task.id)}
/>
```

- [ ] **Step 4: Wire `onCreateProject` in `StagingFloat`**

Open `src/components/schedule/StagingFloat.tsx`. Find the same pattern.

The handler is identical to InboxView's, including the undo push. `StagingFloat` already has an `onUpdateTask?` prop; use that to set `projectId` after creating the project. Push undo via the local `setUndo` state (this component manages undo locally, not via global `pushAction` — verify by grepping for `setUndo` in the file). If `useProjects` isn't already imported, add it the same way.

If `StagingFloat` doesn't currently receive `projects` data, it does — verify with grep:

```bash
grep -n "projects" src/components/schedule/StagingFloat.tsx | head -5
```

Add the handler factory inside `StagingFloat`'s body, mirroring InboxView, then pass `onCreateProject={makeOnCreateProject(task.id)}` to each `<DenseInboxRow>`.

- [ ] **Step 5: Verify the full test suite still passes**

Run: `npx vitest run src/components/schedule --reporter=basic`
Expected: all schedule tests pass. The added prop is optional so existing tests aren't broken.

- [ ] **Step 6: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/DenseInboxRow.tsx src/components/schedule/InboxView.tsx src/components/schedule/StagingFloat.tsx
git commit -m "feat(inbox): wire ProjectControl create-new through InboxView + StagingFloat"
```

---

## Task 6: Supabase Edge Function `note-match`

The function takes the inbox item + candidate notes + domain, calls Anthropic Haiku, returns `{ best_match, suggested_new_title }`. Use the same shape as the existing `capture-to-inbox` and `symphony-chat` functions for consistency.

**Files:**
- Create: `supabase/functions/note-match/index.ts`
- Create: `supabase/functions/note-match/deno.json`
- Create: `supabase/functions/note-match/index_test.ts`

- [ ] **Step 1: Sample an existing function's deno.json to mirror**

Run: `cat supabase/functions/capture-to-inbox/deno.json 2>/dev/null || cat supabase/functions/symphony-chat/deno.json`
Expected: shows a small JSON config (compiler options, etc.). Copy the same structure to the new function.

- [ ] **Step 2: Write the failing test**

Create `supabase/functions/note-match/index_test.ts`:

```ts
// Deno test — run with: deno test supabase/functions/note-match/index_test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildPrompt, parseResponse } from './index.ts'

Deno.test('buildPrompt embeds task and candidates', () => {
  const prompt = buildPrompt({
    inbox_item: { title: 'Look into bike storage', notes: 'For the garage' },
    candidate_notes: [
      { id: 'n1', title: 'Backyard reno', first_200_chars: 'Front yard ideas + budget' },
      { id: 'n2', title: 'Vendors', first_200_chars: 'Plumber, electrician, etc.' },
    ],
    domain: 'family',
  })
  assert(prompt.includes('Look into bike storage'))
  assert(prompt.includes('For the garage'))
  assert(prompt.includes('Backyard reno'))
  assert(prompt.includes('n1'))
  assert(prompt.includes('family'))
})

Deno.test('parseResponse extracts best_match and suggested_new_title from valid JSON', () => {
  const out = parseResponse('{"best_match":{"id":"n1","confidence":0.82},"suggested_new_title":"Bike storage ideas"}')
  assertEquals(out.best_match?.id, 'n1')
  assertEquals(out.best_match?.confidence, 0.82)
  assertEquals(out.suggested_new_title, 'Bike storage ideas')
})

Deno.test('parseResponse falls back when JSON is malformed', () => {
  const out = parseResponse('not json at all')
  assertEquals(out.best_match, null)
  assertEquals(typeof out.suggested_new_title, 'string')
})

Deno.test('parseResponse falls back when fields are missing', () => {
  const out = parseResponse('{"unrelated":true}')
  assertEquals(out.best_match, null)
})

Deno.test('parseResponse strips JSON from code-fenced response', () => {
  const fenced = '```json\n{"best_match":null,"suggested_new_title":"X"}\n```'
  const out = parseResponse(fenced)
  assertEquals(out.best_match, null)
  assertEquals(out.suggested_new_title, 'X')
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `deno test supabase/functions/note-match/index_test.ts`
Expected: FAIL — `index.ts` doesn't exist yet.

- [ ] **Step 4: Create the function implementation**

Create `supabase/functions/note-match/index.ts`:

```ts
// NOTE-MATCH — Ranks candidate notes for an inbox item and proposes a
// new-note title. Called from the client when the user opens the
// NotePicker on an inbox row.
//
// Auth: requires the calling user's Supabase JWT (standard pattern).
// Anthropic API key: ANTHROPIC_API_KEY secret.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InboxItem {
  title: string
  notes?: string
}

interface CandidateNote {
  id: string
  title: string
  first_200_chars: string
}

export interface NoteMatchRequest {
  inbox_item: InboxItem
  candidate_notes: CandidateNote[]
  domain: 'work' | 'family' | 'personal' | 'universal'
}

export interface NoteMatchResponse {
  best_match: { id: string; confidence: number } | null
  suggested_new_title: string
}

export function buildPrompt(req: NoteMatchRequest): string {
  const candidates = req.candidate_notes
    .map((n, i) => `[${i + 1}] id=${n.id} title="${n.title}" preview="${n.first_200_chars.replace(/"/g, '\\"')}"`)
    .join('\n')
  return `You are a triage assistant. The user just captured an inbox item and is deciding whether it belongs in an existing note or is the seed of a new one.

DOMAIN: ${req.domain}

INBOX ITEM:
  title: ${req.inbox_item.title}
  notes: ${req.inbox_item.notes ?? '(none)'}

EXISTING NOTES (most recent first):
${candidates || '(none)'}

Your job: pick the existing note that the inbox item *meaningfully* belongs to, if any. Be conservative — only return a match if the item adds context to that note in a way that would make sense to a human re-reading it later. Otherwise return null.

Always propose a short, descriptive title (max 6 words, no quotes, sentence case) for a *new* note that could absorb this item, in case the user prefers to create one.

Respond with strict JSON only, no prose, no markdown fence:
{"best_match": {"id": "<note_id>", "confidence": 0.0-1.0} | null, "suggested_new_title": "<title>"}`
}

export function parseResponse(raw: string): NoteMatchResponse {
  // Strip code fences if the model wrapped its output
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { best_match: null, suggested_new_title: '' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { best_match: null, suggested_new_title: '' }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = parsed as any
  const bm = obj.best_match
  const best_match =
    bm && typeof bm === 'object' && typeof bm.id === 'string' && typeof bm.confidence === 'number'
      ? { id: bm.id, confidence: bm.confidence }
      : null
  const title = typeof obj.suggested_new_title === 'string' ? obj.suggested_new_title : ''
  return { best_match, suggested_new_title: title }
}

async function callAnthropic(prompt: string, apiKey: string, signal: AbortSignal): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Anthropic returned ${res.status}`)
  }
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (data as any)?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  let body: NoteMatchRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  if (!body?.inbox_item?.title || !Array.isArray(body.candidate_notes) || !body.domain) {
    return new Response(JSON.stringify({ error: 'inbox_item.title, candidate_notes, domain required' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const fallback: NoteMatchResponse = {
    best_match: null,
    suggested_new_title: body.inbox_item.title,
  }
  if (!apiKey) {
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)
  try {
    const prompt = buildPrompt(body)
    const text = await callAnthropic(prompt, apiKey, controller.signal)
    const parsed = parseResponse(text)
    // If LLM didn't propose a title, fall back to the task title
    if (!parsed.suggested_new_title) parsed.suggested_new_title = body.inbox_item.title
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('note-match failed:', err)
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } finally {
    clearTimeout(timeoutId)
  }
})
```

- [ ] **Step 5: Create deno.json**

Create `supabase/functions/note-match/deno.json` matching the pattern of the existing functions you sampled in Step 1. Most look like:

```json
{
  "tasks": {
    "test": "deno test --allow-net --allow-env"
  }
}
```

(Copy whatever the sampled `deno.json` actually contains — don't invent fields.)

- [ ] **Step 6: Run the test, verify all pass**

Run: `deno test supabase/functions/note-match/index_test.ts`
Expected: PASS, 5 tests pass.

- [ ] **Step 7: Deploy the function (manual — note for the executor)**

This step does NOT auto-run; the executor should flag it for the user to perform via the Supabase CLI:

```
supabase functions deploy note-match
```

Ensure `ANTHROPIC_API_KEY` is set as a Supabase Function secret (it already is per `proactive-engine` and `symphony-chat`). No additional secrets required.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/note-match
git commit -m "feat(notes): note-match Edge Function — Anthropic-backed note ranking"
```

---

## Task 7: `useNoteSuggestion` client hook

Calls the `note-match` Edge Function via `supabase.functions.invoke`, caches the result per `task.id` for the session.

**Files:**
- Create: `src/hooks/useNoteSuggestion.ts`
- Create: `src/hooks/useNoteSuggestion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useNoteSuggestion.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNoteSuggestion } from './useNoteSuggestion'

// Mock the supabase client
const invokeMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}))

describe('useNoteSuggestion', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('fetches and returns suggestion data', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.8 }, suggested_new_title: 'Bike storage ideas' },
      error: null,
    })
    const { result } = renderHook(() =>
      useNoteSuggestion({
        task: { id: 't1', title: 'Bike storage', notes: undefined },
        candidateNotes: [],
        domain: 'family',
        enabled: true,
      }),
    )
    await waitFor(() => expect(result.current.suggestion).not.toBeNull())
    expect(result.current.suggestion?.best_match?.id).toBe('n1')
    expect(result.current.suggestion?.suggested_new_title).toBe('Bike storage ideas')
    expect(result.current.loading).toBe(false)
  })

  it('returns fallback shape on edge function error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() =>
      useNoteSuggestion({
        task: { id: 't2', title: 'X', notes: undefined },
        candidateNotes: [],
        domain: 'universal',
        enabled: true,
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.suggestion).toEqual({ best_match: null, suggested_new_title: 'X' })
  })

  it('does not call the function when enabled=false', () => {
    renderHook(() =>
      useNoteSuggestion({
        task: { id: 't3', title: 'X', notes: undefined },
        candidateNotes: [],
        domain: 'universal',
        enabled: false,
      }),
    )
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('caches per task.id within the session', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: null, suggested_new_title: 'T' },
      error: null,
    })
    const { rerender } = renderHook(
      ({ enabled }) =>
        useNoteSuggestion({
          task: { id: 't4', title: 'T', notes: undefined },
          candidateNotes: [],
          domain: 'family',
          enabled,
        }),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    rerender({ enabled: false })
    rerender({ enabled: true })
    // Same task.id, should still be 1 call
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/hooks/useNoteSuggestion.test.ts --reporter=basic`
Expected: FAIL — hook file doesn't exist.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useNoteSuggestion.ts`:

```ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Note } from '@/types/note'
import type { Task } from '@/types/task'
import type { Domain } from '@/hooks/useDomain'

export interface NoteSuggestion {
  best_match: { id: string; confidence: number } | null
  suggested_new_title: string
}

interface UseNoteSuggestionArgs {
  task: Pick<Task, 'id' | 'title' | 'notes'>
  candidateNotes: Note[]
  domain: Domain
  /** Gates the fetch — typically `true` only when the picker is open. */
  enabled: boolean
}

// Session-scoped cache: taskId → suggestion. Persists for the lifetime of
// the page so re-opening the picker on the same row doesn't re-bill.
const cache = new Map<string, NoteSuggestion>()

export function useNoteSuggestion({
  task,
  candidateNotes,
  domain,
  enabled,
}: UseNoteSuggestionArgs) {
  const [suggestion, setSuggestion] = useState<NoteSuggestion | null>(() => cache.get(task.id) ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // Already cached?
    const cached = cache.get(task.id)
    if (cached) {
      setSuggestion(cached)
      return
    }

    let cancelled = false
    setLoading(true)

    const candidate_notes = candidateNotes
      .slice(0, 30)
      .map((n) => ({
        id: n.id,
        title: n.title ?? '(untitled)',
        first_200_chars: (n.content ?? '').slice(0, 200),
      }))

    supabase.functions
      .invoke('note-match', {
        body: {
          inbox_item: { title: task.title, notes: task.notes },
          candidate_notes,
          domain,
        },
      })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          const fallback: NoteSuggestion = { best_match: null, suggested_new_title: task.title }
          cache.set(task.id, fallback)
          setSuggestion(fallback)
        } else {
          const result = data as NoteSuggestion
          cache.set(task.id, result)
          setSuggestion(result)
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, task.id, task.title, task.notes, candidateNotes, domain])

  return { suggestion, loading }
}
```

> Verify that `Domain` is exported from `@/hooks/useDomain` — quick check:
> ```
> grep -n "export.*Domain" src/hooks/useDomain.ts
> ```
> If it's not exported, add `export type Domain = ...` to that file. Do not invent your own `Domain` type.

- [ ] **Step 4: Run the test, verify all pass**

Run: `npx vitest run src/hooks/useNoteSuggestion.test.ts --reporter=basic`
Expected: PASS, 4 tests pass.

- [ ] **Step 5: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useNoteSuggestion.ts src/hooks/useNoteSuggestion.test.ts
git commit -m "feat(notes): useNoteSuggestion hook with per-task cache"
```

---

## Task 8: `NotePicker` component

The popover. Receives `task`, `notes` (already-loaded list), `domain`, and `onSelect` (called when user picks an action). Renders suggestion strip + search + list + create-new entry.

**Files:**
- Create: `src/components/notes/NotePicker.tsx`
- Create: `src/components/notes/NotePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/notes/NotePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotePicker } from './NotePicker'
import type { Note } from '@/types/note'

const invokeMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

const note = (id: string, title: string, content = '', readonly = false, context: Note['context'] = undefined): Note => ({
  id,
  title,
  content,
  type: 'general',
  source: 'app',
  readonly,
  context,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
})

describe('NotePicker', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.8 }, suggested_new_title: 'Bike storage ideas' },
      error: null,
    })
  })

  it('shows the AI best-match chip above confidence threshold', async () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'Bike storage', notes: undefined }}
        notes={[note('n1', 'Backyard reno'), note('n2', 'Vendors')]}
        domain="family"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText(/Backyard reno/i)).toBeInTheDocument())
    // Best-match chip visible
    expect(screen.getByRole('button', { name: /best match.*backyard reno/i })).toBeInTheDocument()
  })

  it('hides the best-match chip when confidence < 0.6', async () => {
    invokeMock.mockResolvedValue({
      data: { best_match: { id: 'n1', confidence: 0.4 }, suggested_new_title: 'X' },
      error: null,
    })
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[note('n1', 'Foo')]}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.queryByRole('button', { name: /best match/i })).not.toBeInTheDocument())
  })

  it('filters existing notes by case-insensitive substring on title and content', () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[
          note('n1', 'Backyard reno', 'budget'),
          note('n2', 'Vendors', 'plumber'),
          note('n3', 'BACKYARD FENCE', ''),
        ]}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const search = screen.getByPlaceholderText(/search notes/i)
    fireEvent.change(search, { target: { value: 'backyard' } })
    expect(screen.getByText('Backyard reno')).toBeInTheDocument()
    expect(screen.getByText('BACKYARD FENCE')).toBeInTheDocument()
    expect(screen.queryByText('Vendors')).not.toBeInTheDocument()
  })

  it('excludes vault-readonly notes from the list', () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[note('n1', 'Editable note', '', false), note('n2', 'Vault note', '', true)]}
        domain="universal"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Editable note')).toBeInTheDocument()
    expect(screen.queryByText('Vault note')).not.toBeInTheDocument()
  })

  it('applies domain filter: non-universal hides notes from other domains', () => {
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[
          note('n1', 'Work note', '', false, 'work'),
          note('n2', 'Family note', '', false, 'family'),
          note('n3', 'No-context note', '', false),
        ]}
        domain="family"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Family note')).toBeInTheDocument()
    expect(screen.getByText('No-context note')).toBeInTheDocument() // universal-by-absence
    expect(screen.queryByText('Work note')).not.toBeInTheDocument()
  })

  it('calls onSelect with kind=existing when an existing note is tapped', () => {
    const onSelect = vi.fn()
    render(
      <NotePicker
        task={{ id: 't1', title: 'X', notes: undefined }}
        notes={[note('n1', 'Backyard reno')]}
        domain="universal"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Backyard reno'))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', noteId: 'n1' })
  })

  it('expands inline create-new form when "+ Create new note" is tapped and calls onSelect with kind=new', () => {
    const onSelect = vi.fn()
    render(
      <NotePicker
        task={{ id: 't1', title: 'My idea', notes: undefined }}
        notes={[]}
        domain="universal"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Create new note/i))
    const input = screen.getByLabelText(/note title/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Bike storage' } })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'new', title: 'Bike storage' })
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/components/notes/NotePicker.test.tsx --reporter=basic`
Expected: FAIL — component doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/components/notes/NotePicker.tsx`:

```tsx
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Note } from '@/types/note'
import type { Task } from '@/types/task'
import type { Domain } from '@/hooks/useDomain'
import { useNoteSuggestion } from '@/hooks/useNoteSuggestion'

export type NotePickerSelection =
  | { kind: 'existing'; noteId: string }
  | { kind: 'new'; title: string }

interface NotePickerProps {
  task: Pick<Task, 'id' | 'title' | 'notes'>
  notes: Note[]
  domain: Domain
  onSelect: (sel: NotePickerSelection) => void
  onClose: () => void
}

const CONFIDENCE_THRESHOLD = 0.6

export function NotePicker({ task, notes, domain, onSelect, onClose }: NotePickerProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Filter the candidate list (this is what the user sees + what the AI sees)
  const visibleNotes = useMemo(() => {
    return notes.filter((n) => {
      if (n.readonly) return false
      // Domain filter: universal shows all; otherwise show matching + no-context
      if (domain !== 'universal') {
        if (n.context && n.context !== domain) return false
      }
      return true
    })
  }, [notes, domain])

  // AI suggestion
  const { suggestion, loading } = useNoteSuggestion({
    task,
    candidateNotes: visibleNotes,
    domain,
    enabled: true,
  })

  // Seed newTitle from the AI suggestion once it arrives (only if user hasn't typed)
  useEffect(() => {
    if (suggestion?.suggested_new_title && !newTitle) {
      setNewTitle(suggestion.suggested_new_title)
    }
  }, [suggestion, newTitle])

  // Filtered list for the visible search results
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return [...visibleNotes].sort((a, b) =>
        (a.title ?? '').localeCompare(b.title ?? ''),
      )
    }
    const q = query.toLowerCase()
    return visibleNotes.filter((n) =>
      ((n.title ?? '').toLowerCase().includes(q)) ||
      ((n.content ?? '').toLowerCase().includes(q)),
    )
  }, [visibleNotes, query])

  // Close on ESC / outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouse)
    }
  }, [onClose])

  const bestMatchNote = suggestion?.best_match && suggestion.best_match.confidence >= CONFIDENCE_THRESHOLD
    ? visibleNotes.find((n) => n.id === suggestion.best_match!.id)
    : null

  const handleCreate = () => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    onSelect({ kind: 'new', title: trimmed })
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Send to note"
      className="absolute z-40 mt-1 w-[360px] max-h-[480px] overflow-hidden flex flex-col bg-white border border-neutral-200 rounded-xl shadow-xl"
    >
      {/* AI suggestion strip */}
      <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50 min-h-[44px] flex items-center gap-2 flex-wrap">
        {loading && (
          <span className="text-xs text-neutral-400 animate-pulse">Looking for matches…</span>
        )}
        {!loading && bestMatchNote && (
          <button
            type="button"
            aria-label={`Best match: ${bestMatchNote.title}`}
            onClick={() => onSelect({ kind: 'existing', noteId: bestMatchNote.id })}
            className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded-full hover:bg-primary-200"
          >
            Looks like → {bestMatchNote.title}
          </button>
        )}
        {!loading && suggestion?.suggested_new_title && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setNewTitle(suggestion.suggested_new_title)
            }}
            className="px-2 py-1 text-xs font-medium bg-neutral-100 text-neutral-700 rounded-full hover:bg-neutral-200"
          >
            + new "{suggestion.suggested_new_title}"
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-neutral-100">
        <input
          type="text"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Existing notes list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-neutral-400">No matching notes.</p>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect({ kind: 'existing', noteId: n.id })}
              className="block w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-50"
            >
              <div className="text-sm font-medium text-neutral-800 truncate">{n.title ?? '(untitled)'}</div>
              {n.content && (
                <div className="text-xs text-neutral-500 truncate">{n.content.slice(0, 60)}</div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Create new */}
      <div className="border-t border-neutral-100">
        {!creating ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              if (!newTitle) setNewTitle(suggestion?.suggested_new_title ?? task.title)
            }}
            className="block w-full text-left px-3 py-2 text-sm text-primary-700 hover:bg-primary-50"
          >
            + Create new note…
          </button>
        ) : (
          <div className="px-3 py-2 space-y-2">
            <label className="block text-xs text-neutral-500" htmlFor="new-note-title">
              Note title
            </label>
            <input
              id="new-note-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Note title"
              autoFocus
              className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="w-full px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/notes/NotePicker.test.tsx --reporter=basic`
Expected: PASS, 7 tests pass.

- [ ] **Step 5: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotePicker.tsx src/components/notes/NotePicker.test.tsx
git commit -m "feat(notes): NotePicker with AI suggestion, search, create-new"
```

---

## Task 9: Add `'note'` to `QuickAction` and render the `📝 Note` button

**Files:**
- Modify: `src/components/schedule/DenseInboxRow.tsx`

- [ ] **Step 1: Extend the `QuickAction` union**

In `src/components/schedule/DenseInboxRow.tsx`, find the `QuickAction` type and add `{ kind: 'note' }`:

```ts
export type QuickAction =
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'someday' }
  | { kind: 'next-week' }
  | { kind: 'note' }      // ← add this
  | { kind: 'delete' }
```

- [ ] **Step 2: Add the label**

In the `ACTION_LABELS` record nearby, add:

```ts
const ACTION_LABELS: Record<QuickAction['kind'], string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  someday: 'Someday',
  'next-week': 'Next Week',
  note: 'Note',          // ← add this
  delete: 'Delete',
}
```

- [ ] **Step 3: Render the Note button in the quick-actions group**

Find the `.map((action) => ...)` block that renders the quick-action buttons. The existing logic handles `delete` separately (renders the Trash2 icon button). Add a parallel branch for `note` that renders a 📝-prefixed button styled similarly to the bucketing buttons but visually distinct so it doesn't read as a "when?" button.

Before the `if (action.kind === 'delete')` branch, add:

```tsx
if (action.kind === 'note') {
  return (
    <button
      key="note"
      type="button"
      aria-label="Send to note"
      onClick={() => onQuickAction(action)}
      className="text-xs px-2.5 py-1 rounded-md font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
    >
      📝 Note
    </button>
  )
}
```

- [ ] **Step 4: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0. Adding to a union should not break exhaustive switches (`StagingFloat` will fail the type check if it does — that's good; it tells us where to wire up Task 11).

- [ ] **Step 5: Verify existing DenseInboxRow tests still pass**

Run: `npx vitest run src/components/schedule/DenseInboxRow.test.tsx --reporter=basic`
Expected: PASS — adding to the union doesn't break existing renders.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/DenseInboxRow.tsx
git commit -m "feat(inbox): add 'note' QuickAction kind + render 📝 Note button"
```

---

## Task 10: Wire note routing into `InboxView`

When the user clicks the `📝 Note` button, the row's `onQuickAction({ kind: 'note' })` fires. `InboxView` is the surface that owns the inbox; it needs to: (a) open `NotePicker` for that row, (b) commit the user's selection (append or create), (c) hard-delete the task, (d) push the undo entry.

**Files:**
- Modify: `src/components/schedule/InboxView.tsx`

- [ ] **Step 1: Add state for which row's picker is open**

In `InboxView`, add:

```ts
const [notePickerTaskId, setNotePickerTaskId] = useState<string | null>(null)
```

- [ ] **Step 2: Import the necessary pieces**

```ts
import { NotePicker, type NotePickerSelection } from '@/components/notes/NotePicker'
import { useNotes } from '@/hooks/useNotes'
import { formatInboxBullet } from '@/lib/inboxBullet'
import type { Task } from '@/types/task'
```

`useUndo` and `useDomain` are likely already imported at the parent (HomeView) and passed in via props or context. Verify by reading the top of `InboxView.tsx`. If `useNotes` is not already in scope at this layer, add it.

- [ ] **Step 3: Build the commit handler**

Add this inside `InboxView`'s body, with access to `tasks`, `notes`, `deleteTask`, `addNote`, `updateNote`, `pushAction` (or whatever the undo push is called), and `domain`:

```ts
const { notes, addNote, updateNote } = useNotes()

const handleNoteSelect = async (task: Task, selection: NotePickerSelection) => {
  const now = new Date()
  const bullet = formatInboxBullet({ title: task.title, notes: task.notes }, now)
  const taskSnapshot = { ...task } // capture before deletion

  if (selection.kind === 'existing') {
    const target = notes.find((n) => n.id === selection.noteId)
    if (!target) {
      // Note vanished between picker open and commit
      setNotePickerTaskId(null)
      return
    }
    const previousContent = target.content
    const newContent = previousContent + '\n' + bullet
    await updateNote(target.id, { content: newContent })
    await deleteTask(task.id)
    pushAction(`Sent to '${target.title ?? 'note'}'`, async () => {
      await updateNote(target.id, { content: previousContent })
      await addTask(taskSnapshot)
    })
  } else {
    // kind === 'new'
    const created = await addNote({
      title: selection.title,
      content: bullet,
      type: 'general',
      source: 'inbox_triage',
      context: task.context ?? (domain !== 'universal' ? domain : undefined),
    })
    if (!created) {
      setNotePickerTaskId(null)
      return
    }
    await deleteTask(task.id)
    pushAction(`Created '${created.title}'`, async () => {
      await deleteNote(created.id)
      await addTask(taskSnapshot)
    })
  }
  setNotePickerTaskId(null)
}
```

> **Verify the exact names** before pasting: `useNotes` may export `deleteNote` and the `addNote` return shape may differ. Read `src/hooks/useNotes.ts` for the canonical signatures. Adjust the awaited values and parameter names to match. Do not invent functions.
>
> Same for `useUndo` — `pushAction(message, undoFn)` is the existing API per `src/hooks/useUndo.ts:15-58`. Match it exactly.
>
> `addTask` is the existing task creator from `useSupabaseTasks`. The snapshot must include all fields needed to re-create the task: `title, notes, bucket, scheduledFor, isAllDay, context, projectId, assignedTo, contactId, links, phoneNumber`. Pull whichever fields the parent already passes — don't make up new ones.

- [ ] **Step 4: Wire the QuickAction handler to open the picker**

Find the existing `onQuickAction` prop being passed to `<DenseInboxRow>`. Extend it:

```tsx
<DenseInboxRow
  task={task}
  ...other props...
  onQuickAction={(action) => {
    if (action.kind === 'note') {
      setNotePickerTaskId(task.id)
      return
    }
    // existing dispatch for other action kinds...
  }}
/>
```

- [ ] **Step 5: Render the picker conditionally next to the row**

Below the row's existing JSX (still inside the row's wrapper element, so it positions relative to that row), conditionally render:

```tsx
{notePickerTaskId === task.id && (
  <NotePicker
    task={task}
    notes={notes}
    domain={domain}
    onSelect={(sel) => handleNoteSelect(task, sel)}
    onClose={() => setNotePickerTaskId(null)}
  />
)}
```

The wrapper element for the row needs `position: relative` so the absolute-positioned picker anchors to it. Verify by inspecting the existing JSX; if the wrapper isn't already `relative`, add the Tailwind class.

- [ ] **Step 6: Add `{ kind: 'note' }` to the `quickActions` array passed to `DenseInboxRow` in this view**

Find the existing `quickActions={[ ... ]}` prop and add `{ kind: 'note' }` before `{ kind: 'delete' }`:

```tsx
quickActions={[
  { kind: 'today' },
  { kind: 'week' },
  { kind: 'month' },
  { kind: 'someday' },
  { kind: 'note' },     // ← add
  { kind: 'delete' },
]}
```

- [ ] **Step 7: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 8: Verify existing InboxView tests still pass**

Run: `npx vitest run src/components/schedule --reporter=basic`
Expected: all schedule tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/schedule/InboxView.tsx
git commit -m "feat(inbox): wire 📝 Note routing in InboxView (append/create + delete + undo)"
```

---

## Task 11: Wire note routing into `StagingFloat`

Same shape as Task 10 but in the "This Week" popover surface.

**Files:**
- Modify: `src/components/schedule/StagingFloat.tsx`

- [ ] **Step 1: Extend `WEEK_ACTIONS` to include `'note'`**

In `src/components/schedule/StagingFloat.tsx`:

```ts
const WEEK_ACTIONS: QuickAction[] = [
  { kind: 'today' },
  { kind: 'next-week' },
  { kind: 'someday' },
  { kind: 'note' },       // ← add
  { kind: 'delete' },
]
```

- [ ] **Step 2: Add picker state + commit handler**

Mirror the pattern from Task 10:

```ts
const [notePickerTaskId, setNotePickerTaskId] = useState<string | null>(null)
const { notes, addNote, updateNote, deleteNote } = useNotes()
```

Add the same `handleNoteSelect` function as in Task 10, scoped to this component. The undo entry uses `setUndo` (the existing local state in `StagingFloat`) rather than the global `pushAction` — verify by reading the top of the file:

```bash
grep -n "setUndo\|useUndo" src/components/schedule/StagingFloat.tsx | head -5
```

Match whatever pattern already exists.

- [ ] **Step 3: Update the `applyAction` switch in `StagingFloat`**

Find the existing `applyAction` function. Add a branch for `'note'`:

```ts
if (action.kind === 'note') {
  setNotePickerTaskId(task.id)
  return  // commit happens after user picks in the picker
}
```

- [ ] **Step 4: Render the picker next to each row**

Inside the `.map((task) => ...)` rendering loop, wrap each row in a relative-positioned container and conditionally render the picker:

```tsx
<div key={task.id} className="relative">
  <DenseInboxRow ...existing props... />
  {notePickerTaskId === task.id && (
    <NotePicker
      task={task}
      notes={notes}
      domain={domain}
      onSelect={(sel) => handleNoteSelect(task, sel)}
      onClose={() => setNotePickerTaskId(null)}
    />
  )}
</div>
```

`domain` may need to come from `useDomain()` if not already in scope.

- [ ] **Step 5: Verify TypeScript still compiles**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 6: Verify StagingFloat tests still pass**

Run: `npx vitest run src/components/schedule/StagingFloat.test.tsx --reporter=basic`
Expected: all StagingFloat tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/StagingFloat.tsx
git commit -m "feat(inbox): wire 📝 Note routing in StagingFloat popover"
```

---

## Task 12: E2E golden-path test

**Files:**
- Create: `e2e/inbox-to-note.spec.ts`

- [ ] **Step 1: Sample an existing E2E spec for the auth + setup pattern**

Run: `head -40 e2e/app.spec.ts`
Expected: shows the existing Playwright setup pattern — likely `test.beforeEach` that signs in and seeds data, then `test('...')` blocks. Mirror that pattern exactly; do not invent auth flows.

- [ ] **Step 2: Write the E2E test**

Create `e2e/inbox-to-note.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// Reuse the auth pattern from e2e/app.spec.ts — adapt the lines here if the
// existing pattern uses a fixture or storage state. The skeleton below
// assumes a sign-in helper similar to what app.spec.ts uses.

test.describe('Inbox → Note triage', () => {
  test('routes an inbox item to a new note', async ({ page }) => {
    await page.goto('/')

    // 1. Open Quick Capture and add an inbox item
    await page.keyboard.press('Meta+K')
    const captureInput = page.getByPlaceholder(/add to inbox|capture/i)
    await captureInput.fill('E2E: bike storage research')
    await captureInput.press('Enter')

    // 2. Navigate to Inbox
    await page.getByRole('button', { name: /^Inbox/ }).first().click()
    await expect(page.getByText('E2E: bike storage research')).toBeVisible()

    // 3. Tap the 📝 Note button on the row
    const row = page.getByText('E2E: bike storage research').locator('..')
    await row.getByRole('button', { name: /Send to note/i }).click()

    // 4. Picker opens — tap "+ Create new note"
    await page.getByText(/Create new note/i).click()

    // 5. Confirm with the prefilled title (or override)
    const titleInput = page.getByLabel(/note title/i)
    await titleInput.fill('E2E test note')
    await page.getByRole('button', { name: /^Create$/ }).click()

    // 6. Task should disappear from inbox
    await expect(page.getByText('E2E: bike storage research')).not.toBeVisible({ timeout: 5000 })

    // 7. Navigate to Notes and verify the note exists with the bullet
    await page.getByRole('button', { name: /^Notes$/ }).click()
    await expect(page.getByText('E2E test note')).toBeVisible()
    await page.getByText('E2E test note').click()
    await expect(page.getByText(/E2E: bike storage research/)).toBeVisible()
  })
})
```

> **Important caveat:** the selectors above are best-guess based on patterns seen in this session. Before declaring this task complete, the executor should run the test once, observe failures, and tighten selectors to match the actual DOM (e.g., `data-testid` attributes if they exist in `DenseInboxRow`). Do NOT modify component code to add testids unless absolutely necessary — first try `getByText` / `getByRole` adjustments.

- [ ] **Step 3: Run the E2E test**

Run: `npx playwright test e2e/inbox-to-note.spec.ts --reporter=list`
Expected: PASS. If it fails on selector issues, refine selectors based on Playwright's failure output (the message shows the available accessible roles/labels at the failure point).

- [ ] **Step 4: Commit**

```bash
git add e2e/inbox-to-note.spec.ts
git commit -m "test(e2e): golden-path for inbox → new note triage"
```

---

## Verification

Once all tasks are complete, run the full local verification:

```bash
# Type check
npx tsc --noEmit
# Unit + integration
npx vitest run --reporter=basic
# E2E
npx playwright test e2e/inbox-to-note.spec.ts --reporter=list
# Edge function
deno test supabase/functions/note-match/index_test.ts
```

Expected: all green. (The pre-existing `src/components/notes/NotesPage.test.tsx` failure unrelated to this work may remain — it was failing on `main` before this plan started.)

Then in the browser on `localhost:5173`:
1. Open Inbox, tap `📝 Note` on any item → picker opens with AI suggestion
2. Pick an existing note → task disappears, note has new bullet, undo toast appears with `Sent to '<note>' · Undo`
3. Tap Undo → task re-appears, note bullet is gone
4. Same flow with "Create new" → task disappears, new note exists in Notes page with the bullet
5. Undo new-note creation → new note deleted, task re-appears
6. Open the Project picker on an inbox row → see `+ Create new project…` entry → expand, type name, pick context, Create → task gets `projectId`, undo toast appears

---

## Deploy

Independent of the client code shipping, the Edge Function must be deployed *before* a production client tries to call it:

```bash
supabase functions deploy note-match
```

If `ANTHROPIC_API_KEY` is already configured for `proactive-engine` / `symphony-chat`, no additional secrets work is required.
