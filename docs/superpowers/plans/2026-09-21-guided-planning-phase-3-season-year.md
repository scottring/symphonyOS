# Guided Planning Phase 3: Season and Year Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Season and Year pages get the same "Look back · Plan · Save" session the Month (Phase 1) and Week (Phase 2) have: the season looks back at the previous season's actual list (goals and tasks) with the year's goals beside it; the year looks back at last year's goals, and a kept year goal carries its notes, strategy and area and records which goal it came from.

**Architecture:** No new session machinery. `SessionLevel` widens to `'month' | 'week' | 'season' | 'year'`, `SessionHorizon` to include `'seasonal' | 'annual'`, and the tokens follow what `cadenceDue.ts` already expects (`seasonToken(start, seasons)` → `2026-fall`, the year → `2026`). The season session is the month session with a different level: `PeriodPlanPage` enables `usePlanSessionHost` for `level === 'season'` with season writers (`keepForward({ seasonStart })`, `dropCommitment(id, 'season', …)`, `addTask({ bucket: 'quarter', seasonStart })`) and the year's goals as a reference rail (nothing is taken down from the year; it holds goals only). The year session feeds `PlanSession` with goals adapted to the small row shape it reads (`{ id, title, isGoal, completed, createdAt, context }`) and goal-flavoured writers: Keep creates next year's goal in ONE insert carrying notes, strategy, area, context and a new `carried_from` link; Done and Drop change `status`. One migration adds `goals.carried_from`.

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind v4, Supabase JS, Vitest and Testing Library. DDL through the Supabase MCP `apply_migration` (memory: DDL via the Management API; the CLI's push is not used here).

**Spec:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (Phase 3, "The contract", "Mapping to the existing code"). Phase 1 plan `…-phase-1-month.md`, Phase 2 plan `…-phase-2-week.md`.

## Global Constraints

- Work in the worktree `.claude/worktrees/guided-planning-season-year`, branch `claude/guided-planning-season-year`, STACKED on `claude/guided-planning-week` (PR #49, Phase 2, not yet merged); rebase onto main after #49 merges. Never edit the main worktree. One PR for the phase.
- Node: `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH`. Tests `npx vitest run <path>` (never `npm test`). Typecheck `npx tsc --noEmit -p tsconfig.app.json`. Lint changed files with `npx eslint` (CI treats `react-hooks` rules as errors).
- `@/` imports; Nordic Journal styling; lucide icons only; **no counts or scores** in any copy; "Visible to your household." stays under the reflection boxes; nothing is written before Save; Close keeps a local draft per user, level and period.
- **Goals are never scheduled.** The year session has no Tasks section, no day, no "toward"; a season task may be "toward" a season goal exactly as a month task is toward a month goal.
- **Year verdicts are Keep · Done · Drop.** No "Keep, and add a next action" (there is no year task list to hold the action) and no Someday (goals have no Someday page). *Ruling recorded in the ledger; the spec says goals live "where it makes sense".*
- **Drop at the year ARCHIVES the goal** (`status: 'archived'`); it never deletes. The existing year-page "Drop" verb (`deleteGoal`) is changed to archive too. *Spec: "Drop: only that period's commitment ends. The item itself is kept."*
- **Year Keep copies notes, strategy, area, context and scope, and records `carried_from`** (the previous year's goal id). The previous goal is untouched (it stays on last year, and reads "carried" because a goal for the next year points at it).
- Month and Week behaviour and copy stay byte-identical (the existing tests are the proof).
- Season token = `seasonToken(bounds.start, seasons)` from `@/lib/cadence/seasons`; year token = `String(year)`. They MUST match `src/lib/assistant/cadenceDue.ts` (`seasonal` / `annual` lookups), so a saved session silences the nudge.
- Never partially `upsert` `tasks`. Goals are inserted with an explicit id (idempotent create), never upserted.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-09-22_goals_carried_from.sql` (new) | `goals.carried_from uuid null references goals(id) on delete set null` + index |
| `src/types/goal.ts` (modify) | `Goal.carriedFrom?: string \| null`, `DbGoal.carried_from` |
| `src/hooks/useGoals.ts` (modify) | `addGoal(areaId, name, context?, extra?)` gains `extra.id`, `extra.year`, `extra.strategy`, `extra.carriedFrom` in ONE insert; duplicate-id insert reads the row back (idempotent); `updateGoal` accepts `carriedFrom` |
| `src/contexts/GoalsContext.tsx` (modify) | the widened `addGoal` signature |
| `src/hooks/usePlanningSession.ts` (modify) | `SessionHorizon` adds `'seasonal' \| 'annual'`; `yearToken(year)` |
| `src/lib/planning/session.ts` (modify) | `SessionLevel` adds `'season' \| 'year'`; `lookBackRows(…, level, seasons?)`; `goalsWithHiddenSteps(…, level, seasons?)`; `verdictOptions(isGoal, level)` year branch; `goalAsRow(goal)`; `yearLookBack(goals, year, layers)`; summary labels for season/year |
| `src/lib/planning/sessionDraft.ts` (no change) | the key already carries the level |
| `src/components/plan/PlanSession.tsx` (modify) | `level` season/year copy; year hides Tasks + rail; season rail = year goals, no "+ Add" |
| `src/components/plan/PeriodPlanPage.tsx` (modify) | the host for season and year; year Drop archives; "Plan the season →" / "Plan the month →" lines |
| `src/components/plan/PlanSession.test.tsx`, `src/lib/planning/session.test.ts`, `src/hooks/useGoals.test.ts`, `src/components/plan/PeriodPlanPage.test.tsx`, `src/lib/assistant/cadenceDue.test.ts` | tests |

---

### Task 0: The goal carries its link — migration and `addGoal` in one insert

**Files:**
- Create: `supabase/migrations/2026-09-22_goals_carried_from.sql`
- Modify: `src/types/goal.ts`, `src/hooks/useGoals.ts`, `src/contexts/GoalsContext.tsx`
- Test: `src/hooks/useGoals.test.ts` (read it first; extend its Supabase mock)

**Interfaces:**
- Produces (DB): `alter table public.goals add column if not exists carried_from uuid null references public.goals(id) on delete set null; create index if not exists goals_carried_from_idx on public.goals(carried_from);` Apply it to the project with the Supabase MCP `apply_migration` (name `goals_carried_from`) AND commit the file; RLS is unchanged (household-scoped select/update already cover the new column).
- Produces (types): `Goal.carriedFrom?: string | null`; `DbGoal.carried_from: string | null`; `dbGoalToGoal` maps it.
- Produces (hook):
  ```ts
  addGoal(areaId: string | null, name: string, context?: 'work' | 'family' | 'personal',
          extra?: { notes?: string | null; scope?: Scope; id?: string; year?: number; strategy?: string | null; carriedFrom?: string | null }): Promise<Goal | null>
  ```
  The insert row includes `id` when given, `year: extra.year ?? currentYear`, `strategy`, `carried_from`. On a unique violation (`code === '23505'`) for a given `id`, the existing row is read back (`select … eq('id', id).single()`), placed into local state if missing, and returned — **idempotent create**, same rule as `addTask({ id })` (Phase 1). `updateGoal` allows `carriedFrom` → `carried_from`.
- Produces: `GoalsContext.addGoal` typed identically.

- [ ] **Step 1: Write the failing tests** (`src/hooks/useGoals.test.ts`; mirror its existing `addGoal` test's mock shape):

```ts
it('addGoal writes year, strategy, carriedFrom and an explicit id in ONE insert', async () => {
  const { result } = renderHook(() => useGoals())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => { await result.current.addGoal('a1', 'Get strong again', 'personal', { id: 'g-next', year: 2027, notes: 'n', strategy: 's', carriedFrom: 'g-prev' }) })
  expect(insertMock).toHaveBeenCalledTimes(1)
  expect(insertMock.mock.calls[0][0]).toMatchObject({ id: 'g-next', year: 2027, notes: 'n', strategy: 's', carried_from: 'g-prev', context: 'personal', area_id: 'a1' })
})
it('addGoal with an id that already exists returns the existing row and inserts nothing new', async () => {
  insertMock.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
  selectSingleMock.mockResolvedValueOnce({ data: dbGoal({ id: 'g-next', name: 'Get strong again', year: 2027 }), error: null })
  const { result } = renderHook(() => useGoals())
  await waitFor(() => expect(result.current.loading).toBe(false))
  let g: Goal | null = null
  await act(async () => { g = await result.current.addGoal(null, 'Get strong again', undefined, { id: 'g-next', year: 2027 }) })
  expect(g?.id).toBe('g-next')
  expect(result.current.goals.filter((x) => x.id === 'g-next')).toHaveLength(1)
})
```
(`insertMock`, `selectSingleMock`, `dbGoal` are that file's mock names or new ones you add to its harness.)

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/hooks/useGoals.test.ts`.
- [ ] **Step 3: Write the migration, apply it, implement the type and hook changes.** The migration file content:

```sql
-- Guided planning Phase 3: a kept year goal records which goal it came from.
alter table public.goals add column if not exists carried_from uuid null references public.goals(id) on delete set null;
create index if not exists goals_carried_from_idx on public.goals(carried_from);
comment on column public.goals.carried_from is 'The previous year''s goal this one was kept from (guided planning, Phase 3).';
```
Apply with the Supabase MCP `apply_migration` (project `mwadppyrqzuzgstmwpuy`), then confirm with `execute_sql`: `select column_name from information_schema.columns where table_name='goals' and column_name='carried_from'`.

- [ ] **Step 4: Run** — `npx vitest run src/hooks/useGoals.test.ts src/contexts && npx tsc --noEmit -p tsconfig.app.json` → PASS.
- [ ] **Step 5: Commit** — `feat(goals): a kept goal records where it came from; addGoal writes everything in one insert`.

---

### Task 1: The session model learns the season and the year

**Files:**
- Modify: `src/lib/planning/session.ts`, `src/hooks/usePlanningSession.ts`
- Test: `src/lib/planning/session.test.ts`, `src/hooks/usePlanningSession.test.ts`, `src/lib/assistant/cadenceDue.test.ts`

**Interfaces:**
- `export type SessionLevel = 'month' | 'week' | 'season' | 'year'`; `export type SessionHorizon = 'weekly' | 'monthly' | 'seasonal' | 'annual'`; `export function yearToken(year: number): string { return String(year) }`. `seasonToken` is imported from `@/lib/cadence/seasons` where the session needs it (do not duplicate it).
- `lookBackRows(tasks, prevStart, meId, level = 'month', seasons?: Seasons)` → threads `seasons` into `committedTo(t, level, prevStart, { isCurrent: false, seasons })`. `goalsWithHiddenSteps(all, shown, prevStart, level = 'month', seasons?)` likewise; `stepsThatCarryForward(g, all, level)` for `'season'`.
- `verdictOptions(isGoal, level)`: `level === 'year'` → `[keep, done, drop]` (labels Keep / Done / Drop). Month and season unchanged.
- `export function goalAsRow(g: Goal): Task` — the adapter: `{ id: g.id, title: g.name, isGoal: true, completed: g.status === 'completed', createdAt: g.createdAt, updatedAt: g.updatedAt, context: g.context ?? null, bucket: 'inbox' } as Task` (cast once, documented: PlanSession and summarize read only these fields).
- `export function yearLookBack(goals: readonly Goal[], year: number, layers: ReadonlySet<Layer>): { finished: Task[]; open: Task[] }` — goals with `g.year === year` and `matchesLayers(g.context, layers)`; `finished` = `status === 'completed'`, `open` = `status === 'active'`; archived excluded; each sorted by `createdAt`.
- `summarize` labels: season uses the month wording with `P` = the season label ("Fall 2026") and `aboveLabel` = the year ("2026") → `stays on 2026` never occurs (no takeInto at the season: `takenFromAbove` is always empty). Year: `L.list`/goal lines: `${P} goals · kept from ${Q}` (P = "2027", Q = "2026"), `Done in 2026`, `Dropped from 2026 · the goal is archived`.

- [ ] **Step 1: Write the failing tests**

`session.test.ts`:
```ts
describe('season and year sessions', () => {
  it('lookBackRows at the season level matches the previous season by RANGE, using the seasons given', () => {
    const fall = new Date(2026, 8, 1), winter = new Date(2026, 11, 1)
    const midFall = t({ id: 'a', bucket: 'quarter', seasonStart: new Date(2026, 9, 15), commitments: [{ level: 'season', periodStart: new Date(2026, 9, 15), status: 'open' }] })
    expect(lookBackRows([midFall], fall, null, 'season', DEFAULT_SEASONS).open.map((x) => x.id)).toEqual(['a'])
    expect(lookBackRows([midFall], winter, null, 'season', DEFAULT_SEASONS).open).toEqual([])
  })
  it('year verdicts are Keep, Done, Drop', () => {
    expect(verdictOptions(true, 'year').map((o) => o.verdict)).toEqual(['keep', 'done', 'drop'])
  })
  it('yearLookBack lists last year\'s goals: finished, open, archived excluded, in the layers in view', () => {
    const g = (over: Partial<Goal>): Goal => ({ id: 'x', areaId: null, name: 'G', year: 2026, status: 'active', sortOrder: 0, actions: [], milestones: [], createdAt: new Date(2026, 0, 1), updatedAt: new Date(), context: null, ...over } as Goal)
    const r = yearLookBack([g({ id: 'd', status: 'completed' }), g({ id: 'o' }), g({ id: 'ar', status: 'archived' }), g({ id: 'n', year: 2025 }), g({ id: 'w', context: 'work' })], 2026, new Set(['family', 'personal', 'unsorted']) as ReadonlySet<Layer>)
    expect(r.finished.map((x) => x.id)).toEqual(['d'])
    expect(r.open.map((x) => x.id)).toEqual(['o'])
    expect(r.open[0]).toMatchObject({ title: 'G', isGoal: true, completed: false })
  })
  it('summarize for the year says kept / done / archived in year words', () => {
    const d: SessionDraft = { ...emptyDraft('year', new Date(2027, 0, 1), new Date(2026, 0, 1)), verdicts: { k: 'keep', dn: 'done', dr: 'drop' }, newGoals: [{ id: 'n1', title: 'Run a 10k' }] }
    const rows = [t({ id: 'k', title: 'Get strong', isGoal: true }), t({ id: 'dn', title: 'Kitchen', isGoal: true }), t({ id: 'dr', title: 'Old', isGoal: true })]
    expect(summarize(d, { open: rows, above: [], aboveGoals: [], periodLabel: '2027', prevLabel: '2026', aboveLabel: '' })).toEqual([
      { title: 'Kitchen', destination: 'Done in 2026' },
      { title: 'Old', destination: 'Dropped from 2026 · the goal is archived' },
      { title: 'Get strong', destination: '2027 goals · kept from 2026' },
      { title: 'Run a 10k', destination: '2027 goals' },
    ])
  })
})
```
(`matchesLayers` semantics: read `@/lib/domains` — a `null` context is the `unsorted` layer. Order in the summary follows `applySession`'s order: ending verdicts first, then keeps, then new goals — check `summarize`'s existing ordering and match it in the expectation rather than the other way round.)

`usePlanningSession.test.ts`: `expect(yearToken(2027)).toBe('2027')` and a save under `'annual'`/`'seasonal'` upserts with that horizon.

`cadenceDue.test.ts`: one test that `computeCadenceOverdue` treats a `planning_sessions` row `{ horizon: 'seasonal', period_token: seasonToken(now, DEFAULT_SEASONS), notes: { savedAt } }` as planned, and `{ horizon: 'annual', period_token: String(now.getFullYear()) }` likewise (read the file's existing test shape).

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** per the interfaces. In `summarize`, extend the `L` table:
```ts
const year = d.level === 'year'
const L = {
  list: week ? "This week's tasks" : `${P} tasks`, goals: `${P} goals`, kept: `kept from ${Q}`,
  done: week ? `Done ${Q}` : `Done in ${Q}`,
  dropped: year ? `Dropped from ${Q} · the goal is archived` : `Dropped from ${Q} · the task is kept`,
  left: week ? `Left open ${Q}` : `Left open in ${Q}`,
  stays: `stays on ${ctx.aboveLabel}, marked "${week ? 'on this week' : `in ${P}`}"`,
}
```
(keep whatever Phase 2's final fix wave made of `list`/`stays` for a non-current week — read the file, don't paste over it). Year rows are all goals, so the `${list}` chosen for a kept row is `L.goals`.
- [ ] **Step 4: Run** — `npx vitest run src/lib/planning src/hooks/usePlanningSession.test.ts src/lib/assistant && npx tsc --noEmit -p tsconfig.app.json`.
- [ ] **Step 5: Commit** — `feat(planning): the session model learns the season and the year`.

---

### Task 2: `PlanSession` copy for the season and the year

**Files:**
- Modify: `src/components/plan/PlanSession.tsx`
- Test: `src/components/plan/PlanSession.test.tsx`

**Interfaces:**
- `level: SessionLevel`. New behaviour per level (month and week untouched):
  - **season**: headings `How did ${Q} go?` / `What will ${P} add up to, and what will you do?` (month copy); sub-line `Write ${P}'s goals with ${aboveLabel} beside you, then the tasks that move them. Goals are never scheduled.`; goal composer's select reads `For a ${aboveLabel} goal? (optional)` listing `aboveGoals`; rail titled `aboveLabel` ("2026") listing `aboveGoals` only, **no "+ Add" verbs** (the year has no tasks; `above` is `[]`); empty rail line `${aboveLabel} has no goals yet.`
  - **year**: Look back heading `How did ${Q} go?` with sub-line `This is ${Q}'s goals. Keep what still matters into ${P}; Done marks it finished; Drop archives it.`; Plan heading `What will ${P} add up to?` with sub-line `Goals only. Seasons and months plan the work.`; **no Tasks section, no task composer, no "for" select** (nothing above the year), **no rail** (the `<aside>` is not rendered; the grid becomes one column: `lg:grid-cols-1`); verdict buttons from `verdictOptions(true, 'year')`; Save heading `Here's ${P}`; buttons `Next: plan ${P} →`, `Save ${P}`.
- `unnamedActions` guard applies only where `keep-action` exists (month/season).

- [ ] **Step 1: Write the failing tests**
```ts
describe('PlanSession — season', () => {
  it('plans goals and tasks with the year\'s goals beside it, and offers nothing to take from the year', () => {
    setup({ level: 'season', periodLabel: 'Winter 2026', prevLabel: 'Fall 2026', aboveLabel: '2026',
      open: [t({ id: 'g', title: 'Strength 2x/week', isGoal: true, bucket: 'quarter' })], above: [],
      aboveGoals: [t({ id: 'yg', title: 'Get strong again', isGoal: true })] })
    expect(screen.getByRole('button', { name: 'Keep, and add a next action' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next: plan winter 2026/i }))
    expect(screen.getByLabelText(/for a 2026 goal/i)).toBeInTheDocument()
    expect(screen.getByText('Get strong again')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to winter 2026/i })).toBeNull()
  })
})
describe('PlanSession — year', () => {
  it('offers Keep · Done · Drop, plans goals only, and has no rail', () => {
    const s = setup({ level: 'year', periodLabel: '2027', prevLabel: '2026', aboveLabel: '',
      finished: [t({ id: 'f', title: 'Kitchen', isGoal: true, completed: true })], open: [t({ id: 'o', title: 'Get strong', isGoal: true })], above: [], aboveGoals: [] })
    expect(screen.getByRole('heading', { name: /how did 2026 go/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Keep|Done|Drop)$/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /next action/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Someday' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan 2027/i }))
    expect(screen.queryByLabelText(/new task for/i)).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.change(screen.getByLabelText(/new goal for 2027/i), { target: { value: 'Run a 10k' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(screen.getByText(/2027 goals · kept from 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save 2027/i })).toBeInTheDocument()
    expect(s.onSave).not.toHaveBeenCalled()
  })
})
```
- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** with a `copy` object keyed by level (extend Phase 2's). **Step 4: Run** `npx vitest run src/components/plan` + tsc + eslint. **Step 5: Commit** — `feat(planning): the session speaks season and year`.

---

### Task 3: The Season page hosts its session

**Files:**
- Modify: `src/components/plan/PeriodPlanPage.tsx`
- Test: `src/components/plan/PeriodPlanPage.test.tsx`

**Interfaces (what changes in the page):**
- `sessionEnabled = level === 'month' || level === 'season'` (year is Task 4).
- `token = level === 'month' ? monthToken(bounds.start) : seasonToken(bounds.start, seasons)`; `horizon = level === 'month' ? 'monthly' : 'seasonal'`; `sessionLevel = level`.
- `back = lookBackRows(layered, bounds.prev, meId, level, seasons)`; `hiddenStepGoals = goalsWithHiddenSteps(tasks, back.open, bounds.prev, level, seasons)`; `current = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons).filter(!completed)`.
- Rail for the season: `aboveItems = []`; `aboveGoalItems = goals.filter(g => g.year === aboveStart.getFullYear() && matchesLayers(g.context, layers)).map(goalAsRow)`; `aboveLabel = String(aboveStart.getFullYear())`. For the month: unchanged (`'the season'`, and Phase 2's `offerableFromAbove` filter).
- Writers for the season: `keep: (id, periodStart, prevStart) => !!(await keepForward(id, { seasonStart: periodStart }, prevStart))`; `addTask: (title, o) => addTask(title, undefined, undefined, undefined, { id: o.id, bucket: 'quarter', seasonStart: o.periodStart, isGoal: o.isGoal, goalTaskId: o.goalTaskId, context: o.context })`; `drop: (id, prevStart) => dropCommitment(id, 'season', prevStart)`; `takeInto: async () => true` (never called: `takenFromAbove` is empty for a season — assert that in a test); `complete`, `someday`, `contextOf` as the month.
- Labels: `shortLabel` for the season is `bounds.label` (e.g. "Fall 2026"); `prevPeriodLabel = periodBounds('season', bounds.prev, seasons).label`.
- After save: the banner reads `${shortLabel} is planned. When you're ready, plan the month with ${shortLabel} beside you.` with `Plan the month →` → `navigate('/month')` (the month page opens on the period ahead by its own rule).
- The "Not planned yet / Planned <date> / Plan <season>" row shows for the season exactly as for the month (hidden when `isPast`).

- [ ] **Step 1: Write the failing tests** in `PeriodPlanPage.test.tsx` (use its `renderPage('season')`, `task()` factory with `bucket: 'quarter'` + `seasonStart`, `seasonsState`, `sessionState`; the `usePlanningSession` mock must also export `yearToken` and `SessionHorizon` if imported — and the page imports `seasonToken` from `@/lib/cadence/seasons`, which is NOT mocked):
```ts
it('the season page plans the season: look back at the previous season, keep into this one, add a task toward a season goal, save once', async () => {
  // previous season = Summer 2026 (DEFAULT_SEASONS), this season = Fall 2026 starting Sep 1; today is 2026-09-21 in this suite's clock
  const prevOpen = task({ id: 'p', title: 'Bike rack', bucket: 'quarter', seasonStart: new Date(2026, 6, 1), commitments: [{ level: 'season', periodStart: new Date(2026, 6, 1), status: 'open' }] })
  state.tasks = [prevOpen]; state.goals = [goal({ id: 'yg', name: 'Get strong again' })]
  renderPage('season')
  fireEvent.click(await screen.findByRole('button', { name: /^Plan Fall 2026$/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
  fireEvent.click(screen.getByRole('button', { name: /next: plan fall 2026/i }))
  expect(screen.getByText('Get strong again')).toBeInTheDocument()        // the year's goal, beside
  fireEvent.change(screen.getByLabelText(/new task for fall 2026/i), { target: { value: 'Book a PT evaluation' } })
  fireEvent.click(screen.getByRole('button', { name: /add task/i }))
  fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
  fireEvent.click(screen.getByRole('button', { name: /save fall 2026/i }))
  await waitFor(() => expect(sessionState.save).toHaveBeenCalledTimes(1))
  expect(hook.keepForward).toHaveBeenCalledWith('p', { seasonStart: new Date(2026, 8, 1) }, new Date(2026, 6, 1))
  expect(hook.addTask).toHaveBeenCalledWith('Book a PT evaluation', undefined, undefined, undefined, expect.objectContaining({ bucket: 'quarter', seasonStart: new Date(2026, 8, 1) }))
  expect(screen.getByRole('button', { name: /plan the month/i })).toBeInTheDocument()
})
```
Flip the existing test "season and year pages carry no planning bar" (≈ line 863) to: the season page has one; the year page does not YET (Task 4 flips the year half).
- [ ] **Step 2: Run to verify it fails.** **Step 3: Implement** by parameterising the existing session block (a small `sessionConfig` derived from `level`; no second copy of the block). **Step 4: Run** `npx vitest run src/components/plan` + tsc + eslint. **Step 5: Commit** — `feat(plan): the season page plans the season with the year beside it`.

---

### Task 4: The Year page hosts its session (goals only)

**Files:**
- Modify: `src/components/plan/PeriodPlanPage.tsx`
- Test: `src/components/plan/PeriodPlanPage.test.tsx`

**Interfaces:**
- `sessionEnabled` for all three levels. For the year: `token = yearToken(bounds.start.getFullYear())`, `horizon = 'annual'`, `back = yearLookBack(goals, year - 1, layers)`, `current = goals.filter(y === year && active).map(goalAsRow)`, `above = []`, `aboveGoals = []`, `aboveLabel = ''`, `hiddenStepGoals` empty.
- Year writers (ids are stable so Save is resumable):
  ```ts
  keep: async (id, periodStart, prevStart) => {
    const src = goals.find((g) => g.id === id); if (!src) return false
    const year = periodStart.getFullYear()
    const already = goals.find((g) => g.carriedFrom === id && g.year === year)
    if (already) return true                                     // a retry finds the kept goal
    const kept = await addGoal(src.areaId ?? null, src.name, src.context ?? undefined,
      { id: keptIdFor(id), year, notes: src.notes ?? null, strategy: src.strategy ?? null, carriedFrom: id, scope: src.scope })
    return !!kept
  },
  addTask: async (title, o) => (await addGoal(null, title, o.context ?? undefined, { id: o.id, year: o.periodStart.getFullYear() }))?.id,   // newGoals only (isGoal is always true at the year)
  contextOf: (id) => goals.find((g) => g.id === id)?.context ?? null,
  complete: async (id) => { await updateGoal(id, { status: 'completed' }); return true },
  someday: async () => false,                                    // never offered at the year
  drop: async (id) => { await updateGoal(id, { status: 'archived' }); return true },
  takeInto: async () => true,
  ```
  `keptIdFor(sourceId)` is a deterministic id stored in the draft: extend `SessionDraft.actionIds` use? No — add `keptIds: Record<string, string>` to `SessionDraft` (optional, default `{}`), filled in `PlanSession`'s `setVerdict` when a year row is set to `keep` (`crypto.randomUUID()` once), and read here. (`pruneDraft` must prune it like `actionIds`.) *Reason: `addGoal` has no idempotent path without an explicit id; a half-failed Save must not create a second copy.*
  `updateGoal` returning `void` is wrapped to `true` here; if `useGoals.updateGoal` throws on error, catch → `false`.
- The existing year row verb `drop` (the `act` callback for `row.kind === 'goal'`) changes from `deleteGoal` to `updateGoal(id, { status: 'archived' })`, and the year list hides archived goals (it already filters? verify `rows` for the year — add `g.status !== 'archived'`).
- After save: banner `${year} is planned. When you're ready, plan the season with ${year} beside you.` with `Plan the season →` → `navigate('/season')`.
- `isPast` for the year = `bounds.end <= today`; the row shows for the current and next year.

- [ ] **Step 1: Write the failing tests**
```ts
it('the year page plans the year from last year\'s goals: Keep copies notes, strategy, area, context and links the goal; Done and Drop change status; nothing is deleted', async () => {
  vi.setSystemTime(new Date(2026, 11, 20))
  state.goals = [
    goal({ id: 'k', name: 'Get strong again', year: 2026, areaId: 'a1', notes: 'PT twice a week', strategy: 'Coach', context: 'personal' }),
    goal({ id: 'dn', name: 'Kitchen', year: 2026 }), goal({ id: 'dr', name: 'Old', year: 2026 }), goal({ id: 'fin', name: 'Bike', year: 2026, status: 'completed' }),
  ]
  renderPageAt('year', '/year?start=2027-01-01')
  fireEvent.click(await screen.findByRole('button', { name: /^Plan 2027$/ }))
  expect(screen.getByText('Bike')).toBeInTheDocument()                                    // finished
  const rows = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Keep' }))
  fireEvent.click(within(rows.find((li) => li.textContent?.includes('Get strong again'))!).getByRole('button', { name: 'Keep' }))
  fireEvent.click(within(rows.find((li) => li.textContent?.includes('Kitchen'))!).getByRole('button', { name: 'Done' }))
  fireEvent.click(within(rows.find((li) => li.textContent?.includes('Old'))!).getByRole('button', { name: 'Drop' }))
  fireEvent.click(screen.getByRole('button', { name: /next: plan 2027/i }))
  fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
  fireEvent.click(screen.getByRole('button', { name: /save 2027/i }))
  await waitFor(() => expect(sessionState.save).toHaveBeenCalledTimes(1))
  expect(goalsApi.addGoal).toHaveBeenCalledWith('a1', 'Get strong again', 'personal', expect.objectContaining({ year: 2027, notes: 'PT twice a week', strategy: 'Coach', carriedFrom: 'k', id: expect.any(String) }))
  expect(goalsApi.updateGoal).toHaveBeenCalledWith('dn', { status: 'completed' })
  expect(goalsApi.updateGoal).toHaveBeenCalledWith('dr', { status: 'archived' })
  expect(goalsApi.deleteGoal).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /plan the season/i })).toBeInTheDocument()
})
it('the year look-back is skipped when last year has no goals', async () => {
  vi.setSystemTime(new Date(2026, 11, 20)); state.goals = []
  renderPageAt('year', '/year?start=2027-01-01')
  fireEvent.click(await screen.findByRole('button', { name: /^Plan 2027$/ }))
  expect(screen.getByText(/nothing to look back at/i)).toBeInTheDocument()
})
it('the year page\'s Drop verb archives, never deletes', async () => { /* renderPage('year') with one active goal; click its Drop; expect updateGoal(id, { status: 'archived' }) and deleteGoal not called */ })
```
Flip the remaining half of the "no planning bar" test. The `usePlanningSession` mock gains `yearToken`.
- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** (`keptIds` in `session.ts` + `pruneDraft` + `PlanSession.setVerdict`; the year config and writers in the page). **Step 4: Run** `npx vitest run src/components/plan src/lib/planning` + tsc + eslint. **Step 5: Commit** — `feat(plan): the year page plans the year; Keep carries a goal whole and links it; Drop archives`.

---

### Task 5: Verify end to end, document, open the PR

- [ ] Full suite (`npx vitest run 2>&1 | tail -8`; the only allowed failure is `connectors/src/whatsapp/adapter.test.ts`), tsc, `npm run lint`, `npm run build`.
- [ ] Demo walk on a preview build (`npm run build && npx vite preview --port 5196`; the demo session lives on that port; the dev server's hot reload remounts the shell mid-walk, so use the preview): `/season` → Plan Fall 2026 (look back at Summer with the demo's summer rows if any, else "Nothing to look back at"), add a goal "for" a 2026 goal, a task toward it, Save → Planned, "Plan the month →". `/year?start=2027-01-01` → Plan 2027: Keep one 2026 goal, Done one, Drop one, add a new goal, Save. SQL: the kept goal is a NEW row for 2027 with `carried_from` = the 2026 id and the same notes/strategy/area/context; the 2026 rows have `status` completed / archived / active as chosen; `planning_sessions` has `seasonal 2026-fall` and `annual 2027` rows with `savedAt`. 390px iframe: no horizontal overflow on both sessions.
- [ ] Docs: mark Phase 3 shipped in the spec with an "As built" note (year verdicts Keep · Done · Drop; Drop archives; `carried_from`; tokens), add the migration to the item-pathways goal notes if that doc lists goal columns.
- [ ] Commit, push, open a DRAFT PR "Guided planning, phase 3: season and year sessions" with what it does / verified / not verified, ending with the attribution lines.

---

## Self-review

- **Spec coverage:** Phase 3 = "Season and Year sessions. The same shape, with the Year Keep fix. Year's look-back is skipped when last year has no goals." → season: Tasks 1–3; year: Tasks 0, 1, 2, 4 (Keep fix: notes, strategy, link = Task 0 + Task 4 writers); skip when empty: Task 4 test 2 via `nothingBack`. Spec "Drop ends only that period's commitment; the item is kept" at the year → archive, never delete (Task 4). Reflection notes → the same `planning_sessions` row (`seasonal`/`annual`) that `cadenceDue` reads (Task 1 test).
- **Placeholders:** none; the one deliberately open point (whether `useGoals.updateGoal` throws or swallows) is stated with both handling paths.
- **Type consistency:** `SessionLevel`, `SessionHorizon`, `yearToken`, `goalAsRow`, `yearLookBack`, `SessionDraft.keptIds`, `addGoal(areaId, name, context?, extra)` with `extra.{id,year,notes,strategy,carriedFrom,scope}`, `Goal.carriedFrom` — the same names in every task.
