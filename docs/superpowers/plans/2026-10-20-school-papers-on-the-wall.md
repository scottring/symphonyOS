# School Papers on the Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Papers that need a parent (forms, slips, money) appear per kid on the kitchen wall from the day the school mentions them until a parent marks them "In backpack", with "I have it" claiming on the kid's page and a phone photo path for papers the school never mentioned.

**Architecture:** A paper is a `tasks` row with `category = 'paper'`, one row per kid, plus two new columns: `held_by` (the parent who has it) and `dismissed_at` ("Not ours"). The school digest's existing homework pass classifies each item as homework or paper. The wall loads papers in their own query, the kid model projects them, the kid page writes the three state changes, and the v1 Home screens show read-only chips. The phone path adds a `read-paper` action to the existing `plan-from-paper` function.

**Tech Stack:** React + TypeScript + Vite + Tailwind, Supabase (Postgres, Deno edge functions), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-school-papers-on-the-wall-design.md`

## Global Constraints

- Nothing on the wall addresses the kids: no alerts, sounds, countdowns or imperative copy aimed at them. Overdue uses `WALL.warn` / the wall's warm amber, never red.
- Board chips are read-only; every paper state change happens on the kid's page.
- States: not found yet (`held_by` null) → `[parent] has it` → In backpack (`completed = true`). No "signed" step.
- One row per kid per paper; always `assigned_to` = that kid, never `assigned_to_all`.
- Done papers stay visible, struck through, until the next local day.
- "Not ours" sets `dismissed_at`; the row is kept and never shown again.
- Digest and photo extraction keep the 0.6 confidence floor (`MIN_CONFIDENCE`).
- Every Claude model named in an edge function must be priced (`_shared/modelPricing.test.ts`). The photo reader uses `claude-sonnet-4-6`, not Opus.
- Kid-page touch targets ≥ 56px.
- Run tests with Node 22: `export PATH=~/.nvm/versions/node/v22.18.0/bin:$PATH`; use `npx vitest run <path>` (`npm test` is watch mode).

## Review Focus

1. **Re-mention after done:** a paper marked In backpack on Monday and mentioned again in Tuesday's digest must not come back (Task 2 test `does not re-add a paper done or dismissed in the last 30 days`).
2. **Same notice in 3-01 and 3-02:** one paper per kid, not two (Task 2 test `one paper per kid when both classes post the same form`).
3. **A paper named for one kid** must not appear on the other kid's row (Task 2 test `a paper naming one child is that child's only`).
4. **Yesterday's done paper** must not linger on the wall today (Task 3 test `a paper done yesterday is gone today`).
5. **A photo of a paper already on the wall** claims the existing row, not a duplicate (Task 6 test `a matching open paper is claimed, not duplicated`).

---

### Task 1: Schema and task type

**Files:**
- Create: `supabase/migrations/20261020120000_school_papers.sql`
- Modify: `src/types/task.ts` (TaskCategory ~:45; Task fields near `assignedToAll`)
- Modify: `src/hooks/useWallData.ts:37-71` (`TASK_COLUMNS`, `rowToTask`)
- Test: the existing `rowToTask` test file (`src/hooks/useWallData*.test.ts`; find with `grep -l rowToTask src/hooks/*.test.ts`)

**Interfaces:**
- Produces: `TaskCategory` includes `'paper'`; `Task.heldBy?: string`, `Task.dismissedAt?: Date`, `Task.completedAt?: Date` mapped by `rowToTask` from `held_by`, `dismissed_at`, `completed_at`. `TASK_COLUMNS` includes `held_by, dismissed_at, completed_at`.

- [ ] **Step 1: Write the failing test** — `rowToTask maps a paper's holder, dismissal and completion time`: input row `{ ..., category: 'paper', held_by: 'iris', dismissed_at: '2026-10-20T15:00:00Z', completed_at: '2026-10-20T16:00:00Z' }` → `heldBy === 'iris'`, `dismissedAt` and `completedAt` are those Dates; with all three null → all `undefined`.
- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run src/hooks/<that file>`
- [ ] **Step 3: Migration**, verbatim:

```sql
-- School papers (spec 2026-10-20-school-papers-on-the-wall-design.md).
-- A paper is a task: category 'paper', one row per kid; held_by is the
-- parent who has it (null = not found yet); dismissed_at is "Not ours".
alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('task','chore','errand','event','activity','homework','paper'));
alter table tasks add column if not exists held_by uuid references family_members(id) on delete set null;
alter table tasks add column if not exists dismissed_at timestamptz;
```

  Check `completed_at` already exists on `tasks` (`grep -rn completed_at supabase/migrations | grep -i "tasks"`); if not, add `alter table tasks add column if not exists completed_at timestamptz;`.
- [ ] **Step 4: Types and mapper** as in Interfaces. Add the three columns to `TASK_COLUMNS`.
- [ ] **Step 5: Run the test, expect PASS;** run `npx tsc --noEmit -p tsconfig.app.json` and expect it to be clean.
- [ ] **Step 6: Commit** `School papers: paper category, held_by, dismissed_at`.

### Task 2: The digest classifies papers

**Files:**
- Modify: `supabase/functions/school-digest/lib/homework.ts`
- Modify: `supabase/functions/school-digest/index.ts:185-196` (`postKidsWork` existing-rows read)
- Test: `supabase/functions/school-digest/lib/homework.test.ts`

**Interfaces:**
- Consumes: Task 1's `paper` category, `dismissed_at`, `completed_at`.
- Produces: `HomeworkItem.kind: 'homework' | 'paper'` (parse: anything but `'paper'` → `'homework'`). `HomeworkRow.category: 'homework' | 'paper'`. `ExistingHomework` gains `category?: string`, `completed?: boolean`. `planHomework` signature unchanged.

- [ ] **Step 1: Write failing tests** in `homework.test.ts` (reuse the file's `members`, `TODAY = '2026-10-07'`, `item()` helper; add `kind`):
  - `parses kind, defaulting to homework` — `{"kind":"paper"}` → `'paper'`; missing or `"other"` → `'homework'`.
  - `the prompt asks for papers a parent signs, fills in or pays and the kid returns` — `buildHomeworkPrompt(...)` contains `"kind"` and `paper`, and still excludes parent sign-ups.
  - `one paper per kid when both classes post the same form` — two paper items, both `for: 'everyone'`, same title, sources `3-01 …` and `3-02 …` → exactly 2 rows, `assigned_to` `'ella'` and `'kaleb'`, `assigned_to_all` null on both, `category: 'paper'`.
  - `a paper naming one child is that child's only` — `for: ['Kaleb']` → one row, `assigned_to: 'kaleb'`.
  - `does not re-add a paper done or dismissed in the last 30 days` — `existing` has `{ title: 'Pink health form', assigned_to: 'ella', assigned_to_all: null, category: 'paper', completed: true }` → a new `Pink health form` paper for everyone yields only Kaleb's row.
  - `homework is unchanged` — the file's existing homework tests still pass untouched (class-wide homework still uses `assigned_to_all`).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run supabase/functions/school-digest/lib/homework.test.ts`
- [ ] **Step 3: Implement.**
  - Prompt: keep one call. Add `"kind": "homework" | "paper"` to the JSON shape. Define paper as "a paper a parent must read, sign, fill in or pay for, that the child brings back to school (permission slip, form, money envelope, report to sign and return)". Homework stays the child's own work. Parent-only items (volunteering, tickets, surveys, sign-ups) stay excluded. Ella and Kaleb get the same class posts, so a class or school paper with no child named is `"everyone"`.
  - `planHomework`: for `kind === 'paper'`, emit one row per kid in `who` (`assigned_to: kid.id, assigned_to_all: null`, `category: 'paper'`), each deduped on its own against `existing` + `out` with `itemsMatch` and the same single kid. Homework keeps today's audience logic.
  - `index.ts`: the existing-rows read becomes `category in ('homework','paper')` and `(completed = false OR completed_at >= now() - 30 days OR dismissed_at >= now() - 30 days)`, selecting `title, assigned_to, assigned_to_all, category, completed`. Dedupe papers against all of those; homework only against open rows (current behaviour).
- [ ] **Step 4: Run the tests, expect PASS;** also `npx vitest run supabase/functions/school-digest supabase/functions/_shared/modelPricing.test.ts`.
- [ ] **Step 5: Commit** `School digest: papers are their own kind, one per kid, never re-added`.

### Task 3: The wall loads papers; the kid model projects them

**Files:**
- Modify: `src/hooks/useWallData.ts` (new query after #15; result `paperTasks: Task[]` exposed like `homeworkTasks`)
- Modify: `src/lib/wall/kidDayModel.ts` (input `paperTasks?: Task[]`; output `papers: KidPaperRow[]`)
- Modify: `src/components/wall-v2/WallV2Shell.tsx:754-761` (pass `paperTasks` to `buildMemberDayModel`)
- Test: `src/lib/wall/kidDayModel.test.ts`

**Interfaces:**
- Produces:

```ts
export interface KidPaperRow {
  id: string
  title: string
  due: string | null      // homeworkDue(...).label
  late: boolean
  notes?: string
  heldBy: string | null   // family_members.id
  done: boolean
}
```

  `MemberDayModel.papers: KidPaperRow[]`, sorted with `sortHomework`. Done rows come last. Papers never make the page "non-empty" on their own (same rule as notices).

- [ ] **Step 1: Failing tests** in `kidDayModel.test.ts`:
  - `a kid's open papers, held or not` — two paper tasks for Ella (one `heldBy: 'iris'`) and one for Kaleb → Ella's model has 2 papers with `heldBy` `'iris'` and `null`.
  - `a paper done today stays, struck through` — `completed: true, completedAt` = today 9:00 → present with `done: true`.
  - `a paper done yesterday is gone today` — `completedAt` = yesterday → absent.
  - `a dismissed paper never shows` — `dismissedAt` set → absent.
  - `papers stay out of Homework and Needed` — a paper with `neededOn` today is not in `homework` or `needed`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Query #17: `tasks` with `TASK_COLUMNS`, `context = 'family'`, `category = 'paper'`, `dismissed_at is null`, `or('completed.eq.false,completed_at.gte.<local start of today ISO>')`. Add it to the per-query error list. The model filters again (dismissed, done before today) so it stays correct between refetches. Owner = `assignedTo` only.
- [ ] **Step 4: Run, expect PASS**, including `npx vitest run src/lib/wall src/hooks`.
- [ ] **Step 5: Commit** `Wall: load school papers and project them per kid`.

### Task 4: Papers on the kid's page

**Files:**
- Create: `src/lib/wall/paperActions.ts`
- Modify: `src/components/wall-v2/KidDayView.tsx` (Papers section; new props)
- Modify: `src/components/wall-v2/WallV2WhoSheet.tsx` (export `FaceButton`)
- Modify: `src/components/wall-v2/WallV2Shell.tsx:1216-1240` (wire props)
- Test: `src/components/wall-v2/KidDayView.test.tsx`, `src/lib/wall/paperActions.test.ts`

**Interfaces:**
- Consumes: `KidPaperRow` (Task 3).
- Produces:
  - `paperActions.ts`: `claimPaper(db, taskId: string, memberId: string)` → update `{ held_by }`; `paperInBackpack(db, taskId, now: Date)` → `{ completed: true, completed_at: now.toISOString() }`; `paperNotOurs(db, taskId, now: Date)` → `{ dismissed_at }`. Each returns `Promise<boolean>` (false on error). `db` is the supabase client type.
  - `KidDayView` new props: `adults: FamilyMember[]`, `onClaimPaper(taskId, memberId)`, `onPaperInBackpack(taskId)`, `onPaperNotOurs(taskId)`.

- [ ] **Step 1: Failing tests.**
  - `paperActions.test.ts`: each function issues exactly the update above on `tasks` for that id (mock client recording `.from('tasks').update(x).eq('id', id)`), and returns false when the client returns an error.
  - `KidDayView.test.tsx`:
    - `a paper nobody has found offers "I have it", then the parents' faces` — tap `I have it` → buttons named `Scott`, `Iris` → tap `Iris` → `onClaimPaper('p1', 'iris')`.
    - `a held paper shows who has it and "In backpack"` — row text contains `Iris has it`; tap `In backpack` → `onPaperInBackpack('p1')`.
    - `a done paper is struck through with no buttons`.
    - `"Not ours" is behind a secondary control` — not visible until the row's title is tapped (expanded); tap → `onPaperNotOurs('p1')`.
    - `late papers use the warm warning colour, not red` — due text has `WALL.warn`'s class.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Papers render as a section **at the top of the Homework widget** (label "Papers" via `WALL.label`). The widget title becomes `Homework & papers` when the kid has papers. Row: title; sub-line = due label · `"<Name> has it"` / `"Not found yet"`; buttons ≥ 56px. Expanded (tap the title): notes, then a quiet `Not ours` text button. The face row reuses the exported `FaceButton`. The shell wires the handlers to `paperActions` with `supabase`, then `wallData.refetch()`, and flashes `Couldn't save — try again` on false.
- [ ] **Step 4: Run, expect PASS** (`npx vitest run src/components/wall-v2 src/lib/wall`).
- [ ] **Step 5: Commit** `Kid page: papers — I have it, In backpack, Not ours`.

### Task 5: Read-only chips on the board

**Files:**
- Modify: `src/components/wall-v2/activity/KioskHomeV1.tsx` (`V1Kid.papers`; chips on HomeFromSchool; styles in `src/styles/kiosk-v1.css`)
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (kioskV1 `kids` build ~:876: `papers`, and `bag` += papers due today, held, not done)
- Test: `src/components/wall-v2/activity/KioskHomeV1.test.tsx`

**Interfaces:**
- Consumes: `KidPaperRow`.
- Produces: `V1Kid.papers: { id: string; title: string; due: string | null; late: boolean; heldByName: string | null; done: boolean }[]`.

- [ ] **Step 1: Failing tests.**
  - `Home from school shows each kid's papers as read-only chips` — a not-found paper renders with class `is-unfound` and no checkbox role; a held one shows the holder's name; tapping a chip calls `onOpenKid(member)`; done papers are not shown on the board.
  - `out the door: a held paper due today rides in the bag line` — a test on the shell's helper (extract it as `bagWithPapers(needed: string[], papers: KidPaperRow[], todayLabel = 'Today'): string[]` in `src/lib/wall/wallMomentsModel.ts`): held, not done, due `Today` → appended; unheld, done, or not due today → not.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** a `PaperChips` component under `KidChecklist` in `HomeFromSchool`: dashed outline when unfound, filled with the holder's first name when held, `late` in the warm amber. The chip is a button to `onOpenKid`, never a tick.
- [ ] **Step 4: Run, expect PASS;** then check it visually on `/kiosk-preview?v1=home` after adding sample papers to `KioskCanvasPreview.tsx`'s v1 fixture (one unfound, one held), in light and dark.
- [ ] **Step 5: Commit** `Wall: papers as read-only chips; due-today papers in the bag line`.

### Task 6: Photograph a paper on the phone

**Files:**
- Modify: `supabase/functions/plan-from-paper/index.ts` (new action `read-paper`), `supabase/functions/plan-from-paper/lib/plan.ts` (schema + prompt + normaliser)
- Create: `src/lib/paperPlan/schoolPaper.ts` (client call + matching + save), `src/components/capture/SchoolPaperCapture.tsx`
- Modify: the entry point beside "Plan from paper" in `src/shell/ShellLayout.tsx:630` and `src/components/layout/DesktopNavigation.tsx:87` ("Photo of a school paper"), opened the way `PaperPlanFlow` is (`src/apps/tasks/HomeViewContainer.tsx:939`)
- Test: `supabase/functions/plan-from-paper/lib/plan.test.ts`, `src/lib/paperPlan/schoolPaper.test.ts`, `src/components/capture/SchoolPaperCapture.test.tsx`

**Interfaces:**
- Produces:
  - Edge action `{ action: 'read-paper', paths: string[] }` (own-page paths, same check as `analyze`) → `{ paper: { title: string; for: string[] | 'everyone'; due?: string; money?: string; detail?: string; confidence: number } }`. Model `claude-sonnet-4-6`, structured output. Reserved with `reserveAiProviderCall(db, 'plan-from-paper')` like `analyze`.
  - `matchOpenPaper(read: { title: string; due?: string }, open: Task[], kidId: string): Task | null` — the best open, unheld paper for that kid by `itemsMatch` title or the same due date; null if none.
  - `saveSchoolPaper(db, { userId, kidIds: string[], title, due?, notes, holderId, photo: Blob, existing?: Task })` — when `existing` is given, set its `held_by` and attach the photo; otherwise insert one paper row per kid (same row shape as Task 2's paper rows, plus `held_by = holderId`) and attach the photo with `attachFile('task', id, blob)`.

- [ ] **Step 1: Failing tests.**
  - `plan.test.ts`: `normalizePaper` maps a structured reply to the shape above; it drops the paper below confidence 0.6 and returns null when there is no title.
  - `schoolPaper.test.ts`:
    - `a matching open paper is claimed, not duplicated` — the open "Pink health form" for Kaleb matches a read titled "Pink Health Information Form" → returned.
    - `a held or other kid's paper never matches`.
    - `saveSchoolPaper with existing only claims and attaches` — one update, no insert.
    - `saveSchoolPaper without existing inserts one row per kid, held by the photographer`.
  - `SchoolPaperCapture.test.tsx`: after a mocked read, `the confirm card shows kid, title, due and money, editable`; with a match, `This is: Pink health form` is pre-selected and `It's a different paper` switches to new; Save calls `saveSchoolPaper` with the signed-in member as `holderId`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The upload path copies `PaperPlanFlow.tsx:146-154` (`{uid}/paper-plan/{importId}/photo-1.jpg`). The prompt asks for the paper's name, which child (from the household's kids' first names; Ella and Kaleb share materials, so "everyone" when none is named), the due date resolved against today, any money, and one detail line.
- [ ] **Step 4: Run, expect PASS** (`npx vitest run supabase/functions/plan-from-paper src/lib/paperPlan src/components/capture supabase/functions/_shared/modelPricing.test.ts`); check the card at 390px wide.
- [ ] **Step 5: Commit** `Phone: photograph a school paper onto the wall`.

### Task 7: Ship

- [ ] **Step 1:** Rebase on `origin/main`; `npx tsc --noEmit -p tsconfig.app.json`; `npx vitest run`, all passing.
- [ ] **Step 2:** Apply `20261020120000_school_papers.sql` to production **before** deploying functions. Verify with a service-role read: `select held_by, dismissed_at from tasks limit 1` succeeds, and an insert of `category='paper'` passes the check (rolled back).
- [ ] **Step 3:** Merge to main (deploys the web app). Deploy `school-digest` and `plan-from-paper`. Confirm the deployed function sources contain `kind` / `read-paper`.
- [ ] **Step 4:** The next 5pm digest: check that new rows with `category='paper'` look right (one per kid, sensible titles). Report what landed.
