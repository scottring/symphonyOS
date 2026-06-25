# Step-as-Atom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make "Step" the atomic recurring item and "Routine" a group of steps — consistent labeling whether an item is loose or grouped — and give a first-class `+ New step` create. No schema change.

**Architecture:** A `routines` row with no children = a Step; a row with children = a Routine. `groupRoutineSteps` already returns `standalone` (Steps) + `collections` (Routines). The Routines page splits into ROUTINES + STEPS sections; two create buttons open the unified `TapRoutinePanel` in two modes — WITH the Steps section (routine) or WITHOUT it (step). Pure relabel + create-flow + editor-mode routing.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase via `useRoutines`.

## Global Constraints

- Worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/routine-collections` (branch `routine-collections`). Never edit the main worktree.
- Node PATH: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Single test: `npx vitest run <path>`. Never `npm test` (watch mode).
- No emojis — `lucide-react` only.
- NO schema change. Internal code/table/hook names stay `routine`/`routines`; this is a USER-FACING label + UX change only.
- Structure→label rule: row with children = **Routine** (`groupRoutineSteps().collections`); row without children = **Step** (`groupRoutineSteps().standalone` for loose; parented rows are nested steps).
- Editor modes: Routine/`+ New routine` → `TapRoutinePanel` WITH step handlers (Steps section). Standalone Step/`+ New step` → `TapRoutinePanel` WITHOUT step handlers (no Steps section). Nested step (clicked inside a routine) → `TapStepPanel`.
- Run `npm run lint` on changed files before declaring done (pre-push doesn't lint; CI does).

---

## File Structure

**Modify:**
- `src/components/routine/RoutinesListRedesign.tsx` — section labels (ROUTINES + STEPS), count "X steps · Y routines", two create buttons, editor-mode open-state, standalone-step click opens step-mode panel.
- `src/components/routine/RoutinesListRedesign.test.tsx` — update/add assertions.
- `src/apps/routines/RoutinesApp.tsx` — only if a new create handler is needed (reuse `onCreateCollection`'s add-routine path for both buttons; likely no change).

No new files. No deletions.

---

## Task 1: Section labels + count (ROUTINES / STEPS)

**Files:** `src/components/routine/RoutinesListRedesign.tsx` + test.

**Interfaces:** Uses existing `groupRoutineSteps(routines)` → `{ collections, standalone }`. `collections` render under a **"Routines"** section header (currently "Multi-step"); `standalone` render under the existing time-band/sort/group UI, introduced by a **"Steps"** section header. Count line → `${standalone.length} step(s) · ${collections.length} routine(s)`.

- [ ] **Step 1: Update tests (RED)** — in `RoutinesListRedesign.test.tsx`:
  - Replace the assertion for the section header `Multi-step` with `Routines` (the groups section). Add an assertion that a **"Steps"** header appears when there are standalone routines.
  - Update the count assertion: with `routines = [c1 parent, s1 step, s2 step, flat]`, the header reads **"1 step · 1 routine"** (1 standalone `flat`, 1 collection `c1`; the two parented rows are nested steps, not counted at top level). Match the exact singular/plural format you implement.

  Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx` → FAIL.

- [ ] **Step 2: Implement** —
  1. Count line: replace the current `${n} routine${...}` with `${standalone.length} step${standalone.length!==1?'s':''} · ${collections.length} routine${collections.length!==1?'s':''}`.
  2. The collections `SectionHeader title="Multi-step"` → `title="Routines"`.
  3. Add a `<SectionHeader title="Steps" count={standalone.length} />` immediately above the standalone/time-band rendering (only when `standalone.length > 0`). Keep the existing time-band/sort/group rendering of standalone rows underneath it unchanged.

- [ ] **Step 3: Run tests — GREEN.**

- [ ] **Step 4: Lint** — `npx eslint src/components/routine/RoutinesListRedesign.tsx` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): Steps/Routines sections + 'X steps · Y routines' count"
```

---

## Task 2: Editor mode — standalone steps open WITHOUT the Steps section

**Files:** `src/components/routine/RoutinesListRedesign.tsx` + test.

**Interfaces:** The overlay open-state gains a routine-vs-step distinction for the `TapRoutinePanel` case. Use `open: { kind: 'routine' | 'standalone-step' | 'step'; id: string } | null`:
- `'routine'` → render `TapRoutinePanel` WITH `steps`/`onSelectStep`/`onAddStep`/`onReorderSteps` (Steps section shows). Used for clicking a ROUTINE (a `collections` entry) and for `+ New routine`.
- `'standalone-step'` → render `TapRoutinePanel` WITHOUT those four props (no Steps section). Used for clicking a STANDALONE STEP (a `standalone` entry) and for `+ New step`.
- `'step'` → render `TapStepPanel` (nested-step editor), unchanged. Used when a step is clicked from inside a routine's Steps list (`onSelectStep`).

Both `'routine'` and `'standalone-step'` resolve the same row via the existing `openCollection` logic (collections.find(id) ?? wrap a childless row as `{...r, steps:[]}`). The ONLY difference is whether the four step props are passed.

- [ ] **Step 1: Write the failing tests (RED)** — add to `RoutinesListRedesign.test.tsx`:

```tsx
it('clicking a STANDALONE step opens the editor WITHOUT a steps section', async () => {
  // routines: one standalone 'flat' (no parent, no children)
  const rs = [r('flat', 'Brush teeth')]
  render(<RoutinesListRedesign
    routines={rs} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
    onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
    onCreateCollection={vi.fn()} onGroupIntoCollection={vi.fn()} />)
  fireEvent.click(screen.getByText('Brush teeth'))
  // editor opens (name shown as editable header) but NO add-step affordance
  expect(await screen.findByText('Brush teeth')).toBeInTheDocument()
  expect(screen.queryByLabelText(/add a step/i)).not.toBeInTheDocument()
})

it('clicking a ROUTINE (group) opens the editor WITH a steps section', async () => {
  const rs = [r('c1', 'School AM'), r('s1', 'Brush teeth', { parent_routine_id: 'c1', step_order: 0 })]
  render(<RoutinesListRedesign
    routines={rs} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
    onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
    onCreateCollection={vi.fn()} onGroupIntoCollection={vi.fn()} />)
  fireEvent.click(screen.getByText('School AM'))
  expect(await screen.findByLabelText(/add a step/i)).toBeInTheDocument()
})
```

(Reuse the file's existing `r()` helper + the `useRoutineStats`/`useAttachments` mocks already added for the TapRoutinePanel render. Drop `onSelectRoutine` from props — it no longer exists.)

Run: `npx vitest run src/components/routine/RoutinesListRedesign.test.tsx` → FAIL (standalone click currently opens with steps section).

- [ ] **Step 2: Implement** —
  1. Change the `open` state type to `{ kind: 'routine' | 'standalone-step' | 'step'; id: string } | null`.
  2. Standalone-step row onClick: `setOpen({ kind: 'standalone-step', id: routine.id })` (was `'collection'`). Keep the `!selecting` guard.
  3. Routine (collection) row onClick: `setOpen({ kind: 'routine', id: collection.id })`.
  4. Resolution: compute `openRoutineItem` for BOTH `'routine'` and `'standalone-step'` (find in collections, else wrap childless `{...r, steps:[]}`); compute a boolean `openWithSteps = open?.kind === 'routine'`.
  5. In the overlay, render `<TapRoutinePanel key={openRoutineItem.id} routine={openRoutineItem} familyMembers={familyMembers} ...all the onUpdate handlers...>` and ONLY pass `steps`/`onSelectStep`/`onAddStep`/`onReorderSteps` when `openWithSteps` is true (e.g. spread a conditional object: `{...(openWithSteps ? { steps: openRoutineItem.steps, onSelectStep: s => setOpen({kind:'step', id:s.id}), onAddStep: name => onAddStep(openRoutineItem.id, name), onReorderSteps } : {})}`). Keep `onSelectStep` setting `{kind:'step', id}`.
  6. `openStep` (kind `'step'`) resolution + `<TapStepPanel>` render unchanged.

- [ ] **Step 3: Run tests — GREEN** (both new + existing).

- [ ] **Step 4: Typecheck + lint** — `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20` (no errors); `npx eslint src/components/routine/RoutinesListRedesign.tsx` (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): step-mode vs routine-mode editor (steps section only for routines)"
```

---

## Task 3: Two create buttons (+ New step / + New routine), inline rename (no prompt)

**Files:** `src/components/routine/RoutinesListRedesign.tsx` + test.

**Interfaces:** Replace the single create button with two. Both create a row via the existing `onCreateCollection(name)` (returns `Promise<Routine | null>`); they differ only in the open mode. Drop the `window.prompt` — create with a default name and let the user rename inline via the panel header.
- `+ New step` → `const created = await onCreateCollection('New step'); if (created) setOpen({ kind: 'standalone-step', id: created.id })`.
- `+ New routine` → `const created = await onCreateCollection('New routine'); if (created) setOpen({ kind: 'routine', id: created.id })`.

- [ ] **Step 1: Write the failing test (RED)** — add to `RoutinesListRedesign.test.tsx`:

```tsx
it('“+ New step” creates a step and opens the step-mode editor (no steps section)', async () => {
  const onCreateCollection = vi.fn().mockResolvedValue(r('newstep', 'New step'))
  render(<RoutinesListRedesign
    routines={[]} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
    onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
    onCreateCollection={onCreateCollection} onGroupIntoCollection={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /new step/i }))
  expect(onCreateCollection).toHaveBeenCalledWith('New step')
  expect(await screen.findByText('New step')).toBeInTheDocument()
  expect(screen.queryByLabelText(/add a step/i)).not.toBeInTheDocument() // step-mode: no steps section
})

it('“+ New routine” creates a routine and opens the routine-mode editor (with steps section)', async () => {
  const onCreateCollection = vi.fn().mockResolvedValue(r('newrt', 'New routine'))
  render(<RoutinesListRedesign
    routines={[]} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
    onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
    onCreateCollection={onCreateCollection} onGroupIntoCollection={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /new routine/i }))
  expect(onCreateCollection).toHaveBeenCalledWith('New routine')
  expect(await screen.findByLabelText(/add a step/i)).toBeInTheDocument() // routine-mode: steps section
})
```

Run → FAIL (no "+ New step" button; create uses prompt).

- [ ] **Step 2: Implement** —
  1. In the header button group, replace the single create button with two lucide-`Plus` buttons: **"New step"** (secondary style) and **"New routine"** (primary). Wire each to the create-then-open logic above (NO `window.prompt`).
  2. Update the **empty-state** button(s): offer "Create your first step" → step-mode create (and optionally a "New routine" too). At minimum the empty state must use the no-prompt create path.
  3. Remove the now-unused `window.prompt('Name the new routine')` create paths. (The multi-select **"Combine into a routine"** still uses `window.prompt('Name this routine')` — leave that one; it names a group at grouping time. Acceptable for now.)

- [ ] **Step 3: Run tests — GREEN** (new + existing, including the Task 2 click tests and the group-mode test).

- [ ] **Step 4: Typecheck + lint** — tsc clean; `npx eslint src/components/routine/RoutinesListRedesign.tsx` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/RoutinesListRedesign.tsx src/components/routine/RoutinesListRedesign.test.tsx
git commit -m "feat(routines): +New step / +New routine buttons, inline rename (no prompt)"
```

---

## Task 4: Verify (suite + build + lint)

- [ ] **Step 1: Routines suites**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/components/routine/RoutinesListRedesign.test.tsx src/components/surface/TapRoutinePanel.test.tsx \
  src/components/surface/TapStepPanel.test.tsx src/components/surface/sections/RoutineStepsSection.test.tsx
```
Expected: all PASS.

- [ ] **Step 2: Full suite** — `npx vitest run 2>&1 | tail -6` — all green.

- [ ] **Step 3: Lint (the changed files) + build** — `npx eslint src/components/routine/RoutinesListRedesign.tsx src/apps/routines/RoutinesApp.tsx` (no errors); `npm run build 2>&1 | tail -4` (`✓ built`).

- [ ] **Step 4: Commit (if fixes)** — `git add -A && git commit -m "test(routines): verify step-as-atom green"`.

---

## Self-Review

- **Spec coverage:** STEPS/ROUTINES sections + count (T1); standalone-step editor has no Steps section, routine editor does (T2); first-class `+ New step` + `+ New routine` with no clunky prompt (T3). ✓
- **No schema change** — pure label/UX; `groupRoutineSteps` split reused. ✓
- **Placeholder scan:** test code complete; T2/T3 give the exact open-state shape and create-then-open logic.
- **Type consistency:** `open.kind` union `'routine' | 'standalone-step' | 'step'` used consistently; `openWithSteps` gates the four step props; `onCreateCollection` reused for both buttons.
- **Flagged follow-ups:** in-place "make this step a routine" affordance (use Combine or +New routine for now); "Combine into a routine" still uses one `window.prompt`; Today/wall labels unchanged (per scope); legacy RoutineForm route URL-only.
