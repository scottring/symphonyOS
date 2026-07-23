# Month Shelf + Week All-Day Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the week hour grid an "All day" drop lane, and rebuild /month as one surface (shelf above the calendar grid, Tend with month grain) reusing the /week shelf system.

**Architecture:** Tend lib/hook/edge-fn gain a `grain` ('week'|'month') that widens regrade targets and the place-date window; `place` without a `time` now means an all-day placement everywhere (matching the new lane). `PlanningShelf` gains a native-drag mode via a **separate `NativeShelfPill`** (dnd-kit hooks are unconditional and would throw outside `DndContext` — the month page has none). The lane lives inside `PlanningColumn` at a **fixed height** so hour rows never misalign across columns. `MonthCalendarGrid` gains `hideRail` (rail hidden, cell drops stay live). MonthPage then composes masthead + shelf + grid + reference fold.

**Tech Stack:** React 19 + TS strict, dnd-kit (week grid only), native HTML drag (`text/task-id`, month grid), Vitest + RTL, Supabase Deno edge fn.

**Spec:** `docs/superpowers/specs/2026-07-22-month-shelf-allday-design.md`
**Worktree:** `.worktrees/month-shelf` (branch `month-shelf`). All commands from the worktree root.

## Global Constraints

- **Node PATH first, before ANY vitest/tsc/build:** `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` (Homebrew node breaks happy-dom localStorage repo-wide).
- **Tests:** `npx vitest run <paths>` only — `npm test` is watch mode and hangs.
- No emojis — lucide icons only.
- Shelf pill titles never truncate (lane CHIPS may truncate — they follow grid-block conventions, not shelf-pill conventions).
- Local date math only; never `Date.parse`/`toISOString` for day-granular values.
- `bucket:'timed'` + `scheduledFor` (+ `isAllDay`) land in ONE update call.
- Never hardcode week start (`orderedWeekDays`/`weekStartAnchor` + cadence config).
- Guided wizard: drawer mode + routines behavior unchanged; the all-day lane DOES appear there (it's part of the grid) — everything else identical.
- /week page behavior unchanged except the lane and the `place`-without-time semantics.
- Do not push to main; ship is a separate gate. Git commits may print noisy "cannot lock ref ... meal-leftovers" errors — they do NOT fail the commit; verify with `git log --oneline -1`.

## File Structure

- `src/lib/tend/types.ts`, `validate.ts`, `applyProposal.ts` + tests — grain support (modify)
- `supabase/functions/tend-week/index.ts` — `grain` param + month prompt (modify)
- `src/hooks/useTendWeek.ts` + test — `grain` arg, per-grain window (modify)
- `src/components/planning/PlanningShelf.tsx` + test — `dragMode`, `NativeShelfPill`, `moveDown`, `onNativeUnschedule` (modify)
- `src/components/planning/PlanningSession.tsx` + test — all-day derivations + `allday-` drop branch (modify)
- `src/components/planning/PlanningGrid.tsx`, `PlanningColumn.tsx` — lane row (modify)
- `src/components/planning/horizon/MonthCalendarGrid.tsx` + test — `hideRail` (modify)
- `src/apps/tasks/horizons/MonthPage.tsx`, `pages.smoke.test.tsx` — page rebuild (modify)

---

### Task 1: Tend grain — types, validator, applyProposal

**Files:**
- Modify: `src/lib/tend/types.ts`
- Modify: `src/lib/tend/validate.ts`
- Modify: `src/lib/tend/applyProposal.ts`
- Test: `src/lib/tend/validate.test.ts`, `src/lib/tend/applyProposal.test.ts`

**Interfaces:**
- Consumes: existing tend lib (shipped today on main).
- Produces:
  - `TendRegrade.to: 'week' | 'month' | 'season' | 'someday'`
  - `parseTendProposals(data, validIds, opts?: { dateWindow?: { minYmd: string; maxYmd: string }; allowedRegrades?: ReadonlySet<TendRegrade['to']> })` — **signature change** from the positional `dateWindow?` third arg to an options object (update the one caller, `useTendWeek`, in Task 3; keep behavior identical when opts omitted). Regrades whose `to` is not in `allowedRegrades` are dropped; when `allowedRegrades` is omitted, accept the full union.
  - `applyProposal`: regrade `'season'` → `setBucket(id, 'quarter')`; regrade others map 1:1. **`place` without `time` becomes an ALL-DAY placement**: `setBucket(id, 'timed', localMidnight(date), true)` — the 09:00 default is gone (the lane is now the no-time home).

- [ ] **Step 1: Update the tests first (failing)**

In `validate.test.ts`: change existing tests to the options-object call shape; add:

```typescript
it('drops regrades outside allowedRegrades and accepts those inside', () => {
  const out = parseTendProposals({ proposals: [
    { kind: 'regrade', taskId: 't1', to: 'week', why: '' },
    { kind: 'regrade', taskId: 't2', to: 'month', why: '' },
    { kind: 'regrade', taskId: 't3', to: 'season', why: '' },
  ] }, IDS, { allowedRegrades: new Set(['week', 'season', 'someday']) })
  expect(out.map((p) => (p as { to: string }).to)).toEqual(['week', 'season'])
})

it('accepts season regrade when no allowedRegrades given', () => {
  const out = parseTendProposals({ proposals: [
    { kind: 'regrade', taskId: 't1', to: 'season', why: '' },
  ] }, IDS)
  expect(out).toHaveLength(1)
})
```

In `applyProposal.test.ts`: change the "defaults to 09:00" test to:

```typescript
it('place without time is an all-day placement at local midnight', () => {
  const a = actions()
  applyProposal({ kind: 'place', id: 'pl', taskIds: ['t1'], date: '2026-07-25', why: '' }, a)
  expect(a.setBucket).toHaveBeenCalledWith('t1', 'timed', new Date(2026, 6, 25, 0, 0, 0, 0), true)
})

it('regrade to season lands in the quarter bucket', () => {
  const a = actions()
  applyProposal({ kind: 'regrade', id: 'r', taskId: 't1', to: 'season', why: '' }, a)
  expect(a.setBucket).toHaveBeenCalledWith('t1', 'quarter')
})
```

- [ ] **Step 2: Run to verify failures** — `npx vitest run src/lib/tend/` → new/changed tests FAIL, others pass.

- [ ] **Step 3: Implement**

`types.ts`: widen the union on `TendRegrade.to`.

`validate.ts` — new signature and regrade filter:

```typescript
export interface ParseTendOptions {
  dateWindow?: { minYmd: string; maxYmd: string }
  allowedRegrades?: ReadonlySet<'week' | 'month' | 'season' | 'someday'>
}

export function parseTendProposals(
  data: unknown,
  validIds: Set<string>,
  opts: ParseTendOptions = {},
): TendProposal[] {
  const { dateWindow, allowedRegrades } = opts
  // …existing body; in the regrade case:
  //   if (e.to !== 'week' && e.to !== 'month' && e.to !== 'season' && e.to !== 'someday') continue
  //   if (allowedRegrades && !allowedRegrades.has(e.to)) continue
  // dateWindow check unchanged (moved to read from opts).
}
```

`applyProposal.ts`:

```typescript
case 'regrade':
  actions.setBucket(p.taskId, p.to === 'season' ? 'quarter' : p.to)
  return
case 'place': {
  const [y, m, d] = p.date.split('-').map(Number)
  if (p.time) {
    const [hh, mm] = p.time.split(':').map(Number)
    const when = new Date(y, m - 1, d, hh, mm, 0, 0)
    for (const id of p.taskIds) actions.setBucket(id, 'timed', when, false)
  } else {
    // No time = an all-day placement (the grid's All-day lane convention).
    const when = new Date(y, m - 1, d, 0, 0, 0, 0)
    for (const id of p.taskIds) actions.setBucket(id, 'timed', when, true)
  }
  return
}
```

Also update the stale doc comment mention of 09:00 if present.

- [ ] **Step 4: Verify** — `npx vitest run src/lib/tend/` all green; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** — `feat(tend): grain-ready lib — regrade union + allowedRegrades + all-day place`

---

### Task 2: `tend-week` edge fn grain param

**Files:**
- Modify: `supabase/functions/tend-week/index.ts`

**Interfaces:**
- Consumes: existing fn (deployed today).
- Produces: body accepts optional `grain: 'week' | 'month'` (default `'week'`, invalid values → `'week'`). Week prompt unchanged except regrade wording stays month/someday. Month prompt: regrade targets `"week"` (small enough for this week), `"season"` (too big for a month), `"someday"`; `place` = `{"kind":"place","taskIds":[…],"date":"YYYY-MM-DD","why":"…"}` with **no time field**, date between `${today}` and `${monthEnd}` (a new `monthEnd` body field the client sends; validate `YYYY-MM-DD` format, fall back to rejecting month grain without it: 400).

- [ ] **Step 1: Implement** — extract the shared task/busy list rendering; branch the rules section on grain:

```typescript
const grain = body.grain === 'month' ? 'month' : 'week'
const monthEnd = typeof body.monthEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.monthEnd) ? body.monthEnd : null
if (grain === 'month' && !monthEnd) return json({ error: 'monthEnd required for month grain' }, 400)
```

Month rules text (replaces the week rules' regrade/place lines):

```
- "regrade": wrong-sized for a month — {"kind":"regrade","taskId":"...","to":"week"|"season"|"someday","why":"..."} — "week" when it's small enough to just do this week, "season" when it's bigger than a month.
- "place": a concrete DAY suggestion this month. {"kind":"place","taskIds":["..."],"date":"YYYY-MM-DD","why":"..."} — no clock time; month placement is day-granular. "date" must be between ${today} and ${monthEnd}, never before ${today}.
```

- [ ] **Step 2: Typecheck if deno available** — `command -v deno >/dev/null && deno check supabase/functions/tend-week/index.ts || echo "skip"`
- [ ] **Step 3: Commit** — `feat(tend): month grain in tend-week prompt`

---

### Task 3: `useTendWeek` grain

**Files:**
- Modify: `src/hooks/useTendWeek.ts`
- Test: `src/hooks/useTendWeek.test.ts`

**Interfaces:**
- Consumes: Task 1's `ParseTendOptions`.
- Produces: `UseTendWeekArgs` gains `grain?: 'week' | 'month'` (default `'week'`) and `monthEndYmd?: string` (required by callers using month grain). Behavior:
  - body includes `grain`, and `monthEnd: monthEndYmd` when month grain;
  - `parseTendProposals(data, validIds, { dateWindow, allowedRegrades })` where week grain → window `[todayYmd, weekStart+6]`, allowed `{'month','someday'}` (today's behavior); month grain → window `[todayYmd, monthEndYmd]`, allowed `{'week','season','someday'}`.

- [ ] **Step 1: Failing tests** — add to the existing mock-invoke suite:

```typescript
it('month grain sends grain+monthEnd and filters regrades to week/season/someday', async () => {
  invoke.mockResolvedValue({ data: { proposals: [
    { kind: 'regrade', taskId: 'a', to: 'month', why: '' },   // not allowed at month grain
    { kind: 'regrade', taskId: 'b', to: 'week', why: '' },
  ] }, error: null })
  const pool = [task('a', 'Alpha'), task('b', 'Beta')]
  const { result } = renderHook(() => useTendWeek({ ...ARGS, pool, carryOver: [], grain: 'month', monthEndYmd: '2026-07-31' }))
  act(() => result.current.start())
  await waitFor(() => expect(result.current.aiLoading).toBe(false))
  expect(invoke.mock.calls[0][1].body.grain).toBe('month')
  expect(invoke.mock.calls[0][1].body.monthEnd).toBe('2026-07-31')
  const regrades = result.current.proposals.filter((p) => p.kind === 'regrade')
  expect(regrades).toHaveLength(1)
  expect((regrades[0] as { to: string }).to).toBe('week')
})
```

- [ ] **Step 2: Verify fail**, **Step 3: implement** (thread grain/monthEndYmd; compute window per grain; call with the options object), **Step 4: `npx vitest run src/hooks/useTendWeek.test.ts src/lib/tend/` green + tsc clean**, **Step 5: commit** — `feat(tend): useTendWeek grain windows + regrade sets`

---

### Task 4: PlanningShelf native-drag mode

**Files:**
- Modify: `src/components/planning/PlanningShelf.tsx`
- Test: `src/components/planning/PlanningShelf.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces on `PlanningShelfProps`:
  - `dragMode?: 'dndkit' | 'native'` (default `'dndkit'` — /week + PlanningSession untouched)
  - `onNativeUnschedule?: (taskId: string) => void` (native mode: dropping a `text/task-id` on the shelf calls this)
  - `moveDown?: { label: string; bucket: 'week' | 'month' }` (default `{ label: 'To month', bucket: 'month' }`) — the ⋯ menu's demote item; month page passes `{ label: 'To week', bucket: 'week' }`. `onSetBucket`'s type widens to `(id: string, bucket: 'week' | 'month' | 'someday') => void`. **Contravariance gotcha:** WeekPage's inline wrapper is currently annotated `(id, bucket: 'month' | 'someday') => …` — a function accepting a NARROWER union is not assignable to the widened prop, so tsc will fail until you widen WeekPage's annotation too (its underlying `setBucket` accepts any `TaskBucket`, so this is a one-line annotation change in `src/apps/tasks/horizons/WeekPage.tsx`).

**Design constraint (why a new component):** dnd-kit hooks (`useDraggable`/`useDroppable`) are called unconditionally and THROW outside a `DndContext`. The month page has no DndContext. Therefore:
  - Extract the pill's inner content (title span, project suffix, controls span, menu popover — all the current JSX minus the drag wiring) into a shared piece both pills render, OR duplicate minimally if extraction fights the hover-group CSS; prefer extraction.
  - `ShelfPill` (existing) keeps dnd-kit wiring; rendered only in `dndkit` mode.
  - New `NativeShelfPill`: same content; root div `draggable`, `onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}` (the `PlacementChip` convention `MonthCalendarGrid` accepts); same `onClick` open, same menu.
  - The shelf frame: in `dndkit` mode keep `useDroppable` — move that hook call into a tiny `DndShelfFrame` child component (so `PlanningShelf` itself no longer calls hooks conditionally); in `native` mode a `NativeShelfFrame` uses `onDragOver`/`onDrop` handlers calling `onNativeUnschedule`. Frames share the same classNames/isOver styling.

- [ ] **Step 1: Failing tests**

```typescript
it('native mode pills are HTML-draggable, set text/task-id, and render without a DndContext', () => {
  // NOTE: render WITHOUT the <DndContext> wrapper — that absence IS the test.
  const props = baseProps({ dragMode: 'native', onNativeUnschedule: vi.fn() })
  render(<PlanningShelf {...props} />)
  const pill = screen.getAllByTestId('shelf-pill-title')[0].closest('.group') as HTMLElement
  expect(pill).toHaveAttribute('draggable', 'true')
  const setData = vi.fn()
  fireEvent.dragStart(pill, { dataTransfer: { setData } })
  expect(setData).toHaveBeenCalledWith('text/task-id', props.tasks[0].id)
})

it('native mode shelf drop calls onNativeUnschedule with the dragged id', () => {
  const onNativeUnschedule = vi.fn()
  render(<PlanningShelf {...baseProps({ dragMode: 'native', onNativeUnschedule })} />)
  const lane = screen.getByTestId('shelf-lane')
  fireEvent.drop(lane, { dataTransfer: { getData: () => 'c1' } })
  expect(onNativeUnschedule).toHaveBeenCalledWith('c1')
})

it('moveDown customizes the demote menu item', () => {
  const props = baseProps({ moveDown: { label: 'To week', bucket: 'week' } })
  render(<DndContext><PlanningShelf {...props} /></DndContext>)
  fireEvent.click(screen.getAllByLabelText('Task actions')[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'To week' }))
  expect(props.onSetBucket).toHaveBeenCalledWith(props.tasks[0].id, 'week')
})
```

(Adapt `baseProps` from the file's existing helper; add `data-testid="shelf-lane"` to the frame root as part of the implementation.)

- [ ] **Step 2: Verify fail**, **Step 3: implement per the design constraint above**, **Step 4: `npx vitest run src/components/planning/PlanningShelf.test.tsx` all green (old + new); `npx tsc --noEmit` clean**, **Step 5: commit** — `feat(shelf): native drag mode + moveDown menu config`

---

### Task 5: All-day lane on the hour grid

**Files:**
- Modify: `src/components/planning/PlanningSession.tsx`
- Modify: `src/components/planning/PlanningGrid.tsx`
- Modify: `src/components/planning/PlanningColumn.tsx`
- Test: `src/components/planning/PlanningSession.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `PlanningGridProps` + `PlanningColumnProps` gain `allDayTasksByDate: Map<string, Task[]>` and `familyMembers` stays as-is.
  - Drop ids: `allday-YYYY-MM-DD` (droppable registered inside `PlanningColumn`'s lane cell).
  - `ALL_DAY_LANE_HEIGHT = 44` (px) exported from `PlanningColumn` — used for the time-label spacer.

**Behavior spec:**
1. `PlanningSession.allUnscheduledTasks`: replace the unconditional `if (task.isAllDay) return true` with: all-day task whose `scheduledFor` is inside `[rangeStart, rangeEnd]` → **false** (it renders in the lane); all-day without `scheduledFor`, or with an out-of-range date → true (pool, as today).
2. New `allDayTasksByDate` memo in `PlanningSession`: per day in `dateRange`, incomplete tasks with `isAllDay && scheduledFor` on that day. Pass through `PlanningGrid` → `PlanningColumn`.
3. `handleDragEnd`: before the `slot-` branch add:

```typescript
if (dropTarget.startsWith('allday-')) {
  const m = /^allday-(\d{4})-(\d{2})-(\d{2})$/.exec(dropTarget)
  if (!m) return
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (minDropDate) {
    const minDay = new Date(minDropDate); minDay.setHours(0, 0, 0, 0)
    if (day.getTime() < minDay.getTime()) {
      setDropNotice('That day is already behind you — pick a day ahead.')
      return
    }
  }
  onUpdateTask(activeId, { bucket: 'timed', scheduledFor: day, isAllDay: true })
  return
}
```
(Guard: this branch must not run for routine/event/resize prefixed ids — place it after those prefix branches, before the `unscheduled-drawer` check is fine too; match the existing ordering style.)
4. `PlanningColumn`: between the day header (`h-12`) and the slots container, render the lane: fixed `style={{ height: ALL_DAY_LANE_HEIGHT }}`, `useDroppable({ id: 'allday-' + formatDateKey(date) })` (the column file needs its own droppable — a small inner `AllDayLaneCell` component keeps the hook usage clean), tinted on `isOver`, containing up to 2 chips + a `+N` overflow count. Chip: compact, truncating, draggable via dnd-kit `useDraggable({ id: task.id })` (bare id — the existing slot/drawer/allday drop branches then all work on lane chips), `onClick` opens the task via the column's existing selection path if one exists — check how placed `PlanningTaskCard`s open tasks in this column and mirror; if placed cards don't open on click here, chips don't either (don't invent a new path).
5. `PlanningGrid`: in the time-label column, after the `h-12` header spacer, add an `All day` label cell with the same fixed height so hour labels stay aligned.
6. **Fixed height is load-bearing:** columns are independent flex children; a variable-height lane would desynchronize hour rows across days. Never let chip count change the lane height.

- [ ] **Step 1: Failing tests** (in `PlanningSession.test.tsx`, following its helpers):

```typescript
it('renders an in-range all-day task in the lane, not the pool', () => { /* seed isAllDay task scheduled on the visible day; assert its title appears in the lane cell (data-testid="allday-lane") and NOT as a drawer/shelf item */ })

it('does not render the all-day lane chip for out-of-range all-day tasks (they stay in the pool)', () => { /* isAllDay task scheduled outside range → in drawer as before */ })
```

Add `data-testid="allday-lane"` to the lane cell in the implementation.

- [ ] **Step 2: Verify fail**, **Step 3: implement per the behavior spec**, **Step 4: `npx vitest run src/components/planning/` ALL green — the pre-existing PlanningSession/wizard tests are the regression net**, **Step 5: commit** — `feat(planning): all-day lane on the hour grid`

---

### Task 6: MonthCalendarGrid `hideRail`

**Files:**
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx`
- Test: `src/components/planning/horizon/MonthCalendarGrid.test.tsx` (create if absent; check for an existing test file first and extend it)

**Interfaces:** `hideRail?: boolean` (default false). When true: the rocks-rail block does not render; everything else (cell `onDragOver`/`onDrop`, chips, Open week seam) behaves exactly as `readOnly={false}` today. `readOnly` semantics unchanged.

- [ ] **Step 1: Failing test** — render with `hideRail`, assert the rail text ("Drag onto a day to schedule"/"Drag a scheduled item here") is absent while a cell drop still calls `onPlaceTask` (fireEvent.drop with `dataTransfer.getData: () => 'task-1'` on a day cell).
- [ ] **Step 2: Verify fail**, **Step 3: implement** (`{!readOnly && !hideRail && (…rail…)}`), **Step 4: green + tsc**, **Step 5: commit** — `feat(month-grid): hideRail — external shelf takes the rail's role`

---

### Task 7: MonthPage rebuild

**Files:**
- Modify: `src/apps/tasks/horizons/MonthPage.tsx`
- Modify (only if a needed value isn't exposed): `src/apps/tasks/horizons/shared.tsx` (return-object additions only)
- Test: `src/apps/tasks/horizons/pages.smoke.test.tsx`

**Interfaces:**
- Consumes: everything above. `useHorizonPageData` already returns (post-week-shelf): `setBucket`, `deleteTaskWithUndo`, `deleteTask`, `addTask`, `projectsMap`, `tasksById`, `undo`, `draft/setDraft/submitDraft`, `scheduleActionsValue`, `pool`, `domainEvents`, `viewedDate`, `railCounts`, `referenceFold`, `handleSelect`, `updateTask`. Verify each before assuming; expose anything missing via return-object addition.
- Produces: the rebuilt page. Structure top-to-bottom:
  1. Masthead: title, `{period} · {monthPlacedCount} placed, {pool.length} to place`; top-right column = `CascadeRail` inline + Plan-the-month/explainer links (copy the /week masthead layout verbatim — same classes).
  2. Identity line (unchanged).
  3. `PlanningShelf` with: `dragMode='native'`, `tasks={pool}`, `carryOverIds={new Set()}`, `moveDown={{ label: 'To week', bucket: 'week' }}`, `onNativeUnschedule={(id) => updateTask(id, { bucket: 'month', scheduledFor: undefined })}`, tasksById/projectsMap/open/delete/push/draft wiring mirroring WeekPage, `tend` from `useTendWeek({ pool, carryOver: [], grain: 'month', monthEndYmd, weekStartYmd: <first-of-month as YYYY-MM-DD>, todayYmd, busy, projectNameFor })` — `weekStartYmd` stays required by the args type but is unused at month grain (the window uses `monthEndYmd`); pass the first of the viewed month. Compute both with local parts (`new Date(y, m, 1)` / `new Date(y, m + 1, 0)`), never Date.parse; `handleApplyProposal` copied from WeekPage (atomic merge undo + prior-state capture — same code, same fields).
  4. `MonthCalendarGrid` with existing props + `hideRail`.
  5. `referenceFold`.
  6. `HorizonExplainer` + `UndoToast`.
- **Deleted:** CascadeRail block, Carried over section (dead), Placed this week section (dead), project-group sections, loose list, empty-state invitation (shelf's own empty state covers it), bottom add-input.
- The add-pill placeholder must speak month grain: pass the existing month placeholder string ("Add a chunk to this month — an order placed, a call made…") — add a `draftPlaceholder?: string` prop to `PlanningShelf` (default "Add to this week…") as part of this task (one prop, trivial; update its test only if an existing assertion breaks).

- [ ] **Step 1: Failing smoke test** — mirror the week one:

```tsx
it('MonthPage renders one surface — shelf, no list sections', () => {
  renderMonthPage()
  expect(screen.queryByText(/^Carried over/)).not.toBeInTheDocument()
  expect(screen.queryByText(/^Placed this week/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument()
  // a bucket-month task renders exactly once (shelf pill)
})
```

- [ ] **Step 2: Verify fail**, **Step 3: implement**, **Step 4: `npx vitest run src/apps/tasks/horizons/ src/components/planning/` ALL green; tsc clean; `npx eslint` on touched files (no unused imports)**, **Step 5: commit** — `feat(month): one-surface page — shelf above the calendar grid, Tend at month grain`

---

### Task 8: Full verification

- [ ] `npx vitest run` — full suite green (3,700+; the known pre-existing lint errors on main are NOT test failures).
- [ ] `npm run lint` — no NEW errors in touched files (7 pre-existing errors on origin/main in untouched files are known).
- [ ] `npm run build` — exit 0, standalone.
- [ ] Fix-and-commit anything that traces to this branch, one commit per symptom.

**Ship gate (after final review + Scott):** deploy `supabase functions deploy tend-week --use-api --project-ref mwadppyrqzuzgstmwpuy`; manual browser pass (lane drop on /week — HAND-TEST the drag, automation can't arm dnd-kit; month shelf native drag pill→cell — native drag MAY work under automation, try it; month Tend round-trip); rebase; build; push.
