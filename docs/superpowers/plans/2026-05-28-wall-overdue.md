# Wall Overdue — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an Overdue section at the top of the wall's Timeline showing up to 5 family-context tasks that are past their scheduled date.

**Architecture:** The data layer is already done — `useWallData` already returns `overdueTasks: TimelineItem[]` with the right filter (family + completed=false + scheduled_for < today). The implementation is pure adapter work: extend the section type union, add a small adapter that builds the section from the existing `overdueTasks`, prepend it in `adaptTimelineSections`, and pass the data through in `WallV2Shell`. `WallV2Timeline` iterates sections agnostically and needs no changes.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 via `@theme` tokens in `src/index.css`, Vitest + React Testing Library, lucide-react for icons. Supabase (already wired) for tasks.

**Worktree:** All work happens in `.worktrees/wall-overdue` on branch `wall-overdue` (already created off `origin/main` and `.env` copied). Never edit the main worktree.

**Spec:** `docs/superpowers/specs/2026-05-28-wall-overdue-design.md` (committed on this branch).

---

## Spec correction noted up front

The spec's "Data layer" section described adding `overdueTasks: Task[]` to `useWallData`. The actual existing field is `overdueTasks: TimelineItem[]` (already there, already populated by the existing query at `useWallData.ts:175–181`). The behavior is identical; the new adapter consumes `TimelineItem[]` instead of `Task[]`. **No `useWallData.ts` changes are needed in this plan.** If a future implementer is tempted to add a duplicate query, stop and read the existing one.

---

## File Structure

**New:** none — all logic fits into existing files.

**Modified:**
- `src/components/wall-v2/types.ts` — extend `WallV2TimelineSection['id']` union with `'overdue'`.
- `src/components/wall-v2/wallV2Adapter.ts` — export `memberBubble`; add `overdueLabel` helper; add `adaptOverdueSection`; extend `adaptTimelineSections` signature.
- `src/components/wall-v2/wallV2Adapter.test.ts` — coverage for `adaptOverdueSection` + the new branch in `adaptTimelineSections`.
- `src/components/wall-v2/WallV2Shell.tsx` — pass `wallData.overdueTasks` into the `adaptTimelineSections` call + memo deps.

---

## Task 1: Extend the section id union + export `memberBubble`

Pure type / visibility prep. No behavior change. Lands as a single small commit so subsequent tasks can import cleanly.

**Files:**
- Modify: `src/components/wall-v2/types.ts`
- Modify: `src/components/wall-v2/wallV2Adapter.ts`

- [ ] **Step 1: Extend the union in `types.ts`**

Find (around line 73):

```ts
export interface WallV2TimelineSection {
  id: 'allday' | 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  icon: LucideIcon;
  tint: WallV2Tint;
  events: WallV2TimelineEvent[];
}
```

Replace with:

```ts
export interface WallV2TimelineSection {
  id: 'overdue' | 'allday' | 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  icon: LucideIcon;
  tint: WallV2Tint;
  events: WallV2TimelineEvent[];
}
```

- [ ] **Step 2: Export `memberBubble` in `wallV2Adapter.ts`**

Find (around line 54):

```ts
function memberBubble(m: FamilyMember): WallV2MemberBubble {
```

Replace with:

```ts
export function memberBubble(m: FamilyMember): WallV2MemberBubble {
```

(No body change. Just the visibility keyword.)

- [ ] **Step 3: Type-check**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-overdue
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors. Any pre-existing errors are not new from this change.

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/types.ts src/components/wall-v2/wallV2Adapter.ts
git commit -m "chore(wall): prep for overdue section — extend id union + export memberBubble

WallV2TimelineSection.id gains 'overdue'. memberBubble becomes exported
so the new adaptOverdueSection (next task) can reuse it instead of
duplicating the FamilyMember → WallV2MemberBubble mapping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `overdueLabel` formatter + `adaptOverdueSection` adapter (TDD)

The adapter and its helper. Tested in isolation first.

**Files:**
- Modify: `src/components/wall-v2/wallV2Adapter.test.ts` — add tests
- Modify: `src/components/wall-v2/wallV2Adapter.ts` — add `overdueLabel` + `adaptOverdueSection`

- [ ] **Step 1: Write the failing tests**

In `src/components/wall-v2/wallV2Adapter.test.ts`, add at the top with the existing imports:

```ts
import { adaptOverdueSection } from './wallV2Adapter';
```

Then append a new `describe` block at the end of the file:

```ts
describe('adaptOverdueSection', () => {
  const now = new Date('2026-05-28T09:00:00');

  function makeMember(partial: Partial<FamilyMember>): FamilyMember {
    return {
      id: partial.id ?? 'm-1',
      name: partial.name ?? 'Iris',
      initials: partial.initials ?? 'IK',
      color: partial.color ?? '#cc8855',
      member_type: partial.member_type ?? 'core',
      display_order: partial.display_order ?? 0,
      ...partial,
    } as FamilyMember;
  }

  function makeOverdueTask(daysAgo: number, partial: Partial<TimelineItem> = {}): TimelineItem {
    const start = new Date(now);
    start.setDate(start.getDate() - daysAgo);
    return makeItem({
      id: partial.id ?? `task-od-${daysAgo}`,
      type: 'task',
      title: partial.title ?? `Overdue ${daysAgo}d ago`,
      startTime: start,
      completed: false,
      ...partial,
    });
  }

  it('returns null when there are no overdue tasks', () => {
    expect(adaptOverdueSection([], [], now)).toBeNull();
  });

  it('builds a section with the right id, label, and tint when one task is overdue', () => {
    const section = adaptOverdueSection([makeOverdueTask(3)], [], now);
    expect(section).not.toBeNull();
    expect(section!.id).toBe('overdue');
    expect(section!.label).toBe('Overdue');
    expect(section!.tint).toBe('honey');
    expect(section!.events).toHaveLength(1);
  });

  it('caps the section at 5 rows even when more tasks are overdue', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => makeOverdueTask(d));
    const section = adaptOverdueSection(tasks, [], now);
    expect(section!.events).toHaveLength(5);
  });

  it('sorts rows oldest first regardless of input order', () => {
    const t1 = makeOverdueTask(1, { id: 'task-yesterday' });
    const t7 = makeOverdueTask(7, { id: 'task-week' });
    const t3 = makeOverdueTask(3, { id: 'task-threed' });
    const section = adaptOverdueSection([t1, t7, t3], [], now);
    expect(section!.events.map((e) => e.id)).toEqual([
      'task-week',
      'task-threed',
      'task-yesterday',
    ]);
  });

  it('uses "Was due yesterday" for a 1-day-old task', () => {
    const section = adaptOverdueSection([makeOverdueTask(1)], [], now);
    expect(section!.events[0].subtitle).toBe('Was due yesterday');
  });

  it('uses "N days ago" for 2–6 days', () => {
    const section = adaptOverdueSection(
      [makeOverdueTask(2), makeOverdueTask(6)],
      [],
      now,
    );
    // After oldest-first sort: 6 days, then 2 days.
    expect(section!.events.map((e) => e.subtitle)).toEqual(['6 days ago', '2 days ago']);
  });

  it('uses "N weeks ago" rounded for 7+ days', () => {
    const section = adaptOverdueSection(
      [makeOverdueTask(7), makeOverdueTask(10), makeOverdueTask(14), makeOverdueTask(20)],
      [],
      now,
    );
    // After oldest-first sort: 20, 14, 10, 7.
    // 20 days ≈ 3 weeks (rounded from 2.86), 14 = 2 weeks, 10 ≈ 1 week,
    // 7 = 1 week.
    expect(section!.events.map((e) => e.subtitle)).toEqual([
      '3 weeks ago',
      '2 weeks ago',
      '1 week ago',
      '1 week ago',
    ]);
  });

  it('attaches the assignee bubble when the task has an assignee in the family', () => {
    const iris = makeMember({ id: 'm-iris', name: 'Iris', initials: 'IK', color: '#cc8855' });
    const task = makeOverdueTask(2, { assignedTo: 'm-iris' });
    const section = adaptOverdueSection([task], [iris], now);
    expect(section!.events[0].members).toHaveLength(1);
    expect(section!.events[0].members![0].id).toBe('m-iris');
    expect(section!.events[0].members![0].initials).toBe('IK');
  });

  it('leaves members undefined when the task has no assignee', () => {
    const section = adaptOverdueSection([makeOverdueTask(2)], [], now);
    expect(section!.events[0].members).toBeUndefined();
  });

  it('leaves members undefined when the assignee id is not in the family list', () => {
    const task = makeOverdueTask(2, { assignedTo: 'm-not-here' });
    const section = adaptOverdueSection([task], [], now);
    expect(section!.events[0].members).toBeUndefined();
  });

  it("marks rows with kind='task' and completed=false so the action sheet routes correctly", () => {
    const section = adaptOverdueSection([makeOverdueTask(2)], [], now);
    expect(section!.events[0].kind).toBe('task');
    expect(section!.events[0].completed).toBe(false);
  });

  it('skips tasks with no startTime (defensive — a task without a scheduled date is not overdue)', () => {
    const noStart = makeItem({ id: 'task-no-start', type: 'task', startTime: null, completed: false });
    const ok = makeOverdueTask(3);
    const section = adaptOverdueSection([noStart, ok], [], now);
    expect(section!.events).toHaveLength(1);
    expect(section!.events[0].id).toBe(ok.id);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: 12 new tests fail with `adaptOverdueSection is not a function` or similar. Existing tests still pass.

- [ ] **Step 3: Implement `overdueLabel` + `adaptOverdueSection`**

Add to `src/components/wall-v2/wallV2Adapter.ts`. Find a logical home (near the other section adapters; insert after `adaptUpcoming`). First add `AlertCircle` and `Clock` to the lucide-react import line at the top of the file:

Find:

```ts
import { Sparkles, Plug, Heart, ClipboardList, Sunrise, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react';
```

Replace with:

```ts
import { Sparkles, Plug, Heart, ClipboardList, Sunrise, Users, UtensilsCrossed, Clock, AlertCircle, type LucideIcon } from 'lucide-react';
```

(If the actual import line is slightly different — verify by reading line 1 of `wallV2Adapter.ts` — just add `Clock` and `AlertCircle` to whatever's already imported from lucide-react. Don't drop any existing icons.)

Then append the new functions at the end of the file:

```ts
// ────────────────────────────────────────────────────────────────────────────
// Overdue
// ────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Family-readable distance from `scheduledFor` to `now`.
 *   1 day  → "Was due yesterday"
 *   2–6    → "N days ago"
 *   ≥ 7    → "N weeks ago" (rounded to the nearest whole week)
 *
 * Exported only as an implementation detail of `adaptOverdueSection`;
 * not part of the wall's public adapter surface.
 */
function overdueLabel(scheduledFor: Date, now: Date): string {
  // Compare day floors so a task scheduled for "yesterday 11pm" reads as
  // "Was due yesterday" rather than "less than a day ago."
  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);
  const startOfScheduled = new Date(scheduledFor);
  startOfScheduled.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.round((startOfNow.getTime() - startOfScheduled.getTime()) / MS_PER_DAY));

  if (days === 1) return 'Was due yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
}

/**
 * Build the wall's "Overdue" timeline section from the already-filtered
 * `overdueTasks` returned by useWallData. Returns null when there's nothing
 * to show — the caller should omit the section entirely.
 *
 * The data layer (useWallData.ts) already filters to family-context,
 * incomplete, scheduled-before-today tasks. This function only re-shapes,
 * caps, sorts, and attaches bubbles.
 */
export function adaptOverdueSection(
  overdueTasks: TimelineItem[],
  members: FamilyMember[],
  now: Date,
): WallV2TimelineSection | null {
  // Defensive: ignore items missing a startTime — they can't be overdue
  // in any meaningful sense.
  const dated = overdueTasks.filter((t) => t.startTime instanceof Date);
  if (dated.length === 0) return null;

  // Oldest first so the most-overdue item lands at the top of the section.
  const sorted = [...dated].sort(
    (a, b) => (a.startTime!.getTime() - b.startTime!.getTime()),
  );

  const capped = sorted.slice(0, 5);

  const events: WallV2TimelineEvent[] = capped.map((t) => {
    const assignee = t.assignedTo ? members.find((m) => m.id === t.assignedTo) : undefined;
    return {
      id: t.id,
      icon: AlertCircle,            // calm warning glyph per row
      tint: 'honey',                // warm muted; not red
      title: t.title,
      subtitle: overdueLabel(t.startTime!, now),
      members: assignee ? [memberBubble(assignee)] : undefined,
      kind: 'task' as const,
      completed: false,
    };
  });

  return {
    id: 'overdue',
    label: 'Overdue',
    icon: Clock,                    // section icon
    tint: 'honey',
    events,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: all 12 new tests PASS, all existing tests still PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall): adaptOverdueSection — build the Overdue timeline section

Pure adapter: takes the family-filtered overdueTasks already returned
by useWallData, sorts oldest-first, caps at 5, attaches the assignee
bubble when present, and stamps each row with a family-readable
'Was due N…' subtitle. Returns null when there's nothing to show so
the caller can omit the section entirely.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extend `adaptTimelineSections` to take and prepend overdue

The composition step. Existing callers (one — `WallV2Shell`) get a new required arg.

**Files:**
- Modify: `src/components/wall-v2/wallV2Adapter.ts` — change `adaptTimelineSections` signature + prepend logic
- Modify: `src/components/wall-v2/wallV2Adapter.test.ts` — extend existing timeline tests with the new arg + a "prepend when present" case

- [ ] **Step 1: Write/extend the failing test**

Open `src/components/wall-v2/wallV2Adapter.test.ts` and find the existing `describe('adaptTimelineSections', …)` block. Find every existing call to `adaptTimelineSections(…)` inside it — each currently has 5 args (`today, members, now, dinnerEvent, hideRoutines`). After Task 3's signature change those calls will need a 6th arg (`overdueTasks`). For each existing call, update to append `, []` so it compiles and the test's intent (no overdue) is preserved.

Then append this new test inside the same `describe` block:

```ts
  it('prepends the Overdue section before all other sections when there are overdue tasks', () => {
    const now = new Date('2026-05-28T09:00:00');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const overdueTask = makeItem({
      id: 'task-od-1',
      type: 'task',
      title: 'Pay water bill',
      startTime: yesterday,
      completed: false,
    });

    // A minimal today with one morning item so we can verify ordering.
    const morningItem = makeItem({
      id: 'task-am',
      type: 'task',
      title: 'Standup',
      startTime: new Date('2026-05-28T08:30:00'),
    });
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [morningItem], afternoon: [], evening: [], unscheduled: [],
      },
    });

    const sections = adaptTimelineSections(today, [], now, null, false, [overdueTask]);

    // First section should be Overdue, then the existing sections in order.
    expect(sections[0].id).toBe('overdue');
    expect(sections[0].events[0].title).toBe('Pay water bill');
    expect(sections[1].id).not.toBe('overdue');
  });

  it('omits the Overdue section entirely when overdueTasks is empty', () => {
    const now = new Date('2026-05-28T09:00:00');
    const morningItem = makeItem({
      id: 'task-am',
      type: 'task',
      title: 'Standup',
      startTime: new Date('2026-05-28T08:30:00'),
    });
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [morningItem], afternoon: [], evening: [], unscheduled: [],
      },
    });

    const sections = adaptTimelineSections(today, [], now, null, false, []);

    expect(sections.find((s) => s.id === 'overdue')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: the new 2 tests fail because the current `adaptTimelineSections` signature only takes 5 args (and the spread / type of the 6th arg won't match). Pre-existing tests already passing should still pass after you've appended `, []` to each call site in Step 1.

- [ ] **Step 3: Update `adaptTimelineSections` signature + prepend logic**

In `src/components/wall-v2/wallV2Adapter.ts`, find the existing function signature (around line 216):

```ts
export function adaptTimelineSections(
  today: WallDayData | undefined,
  members: FamilyMember[],
  _now: Date,
  dinnerEvent: CalendarEvent | null,
  hideDailyRoutines: boolean = false,
): WallV2TimelineSection[] {
```

Replace with:

```ts
export function adaptTimelineSections(
  today: WallDayData | undefined,
  members: FamilyMember[],
  now: Date,
  dinnerEvent: CalendarEvent | null,
  hideDailyRoutines: boolean,
  overdueTasks: TimelineItem[],
): WallV2TimelineSection[] {
```

(Two name changes: `_now` → `now` since the body now uses it for `adaptOverdueSection`, and `hideDailyRoutines` loses its default since the only caller passes it explicitly. The new required `overdueTasks` arg goes last.)

Find the existing `return` statement of `adaptTimelineSections` (the array of section objects it currently produces — likely at the end of the function body). The exact shape depends on the existing body; the change is mechanical: capture the existing result into a local, prepend the overdue section when non-null, return.

Locate the existing return — it will look something like:

```ts
  return [
    /* …allday, morning, afternoon, evening, night sections… */
  ];
```

Replace that final `return [...]` with:

```ts
  const baseSections: WallV2TimelineSection[] = [
    /* …keep the existing array entries here verbatim… */
  ];
  const overdueSection = adaptOverdueSection(overdueTasks, members, now);
  return overdueSection ? [overdueSection, ...baseSections] : baseSections;
```

> **Implementer note:** read the existing `return` carefully and preserve every existing entry exactly. The only structural change is wrapping that array in a `const baseSections = […]` declaration and adding the prepend.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/wall-v2/wallV2Adapter.test.ts
```

Expected: all tests pass (existing call-site updates from Step 1 + the 2 new tests).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors. The signature change cascades to `WallV2Shell.tsx` which still calls `adaptTimelineSections` with 5 args — `tsc` should now flag that one call. Task 4 fixes it.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/wallV2Adapter.ts src/components/wall-v2/wallV2Adapter.test.ts
git commit -m "feat(wall): prepend Overdue section in adaptTimelineSections

adaptTimelineSections now takes overdueTasks: TimelineItem[] and
prepends the Overdue section (via adaptOverdueSection) before
All-day / Morning when there's something to show. The hideDailyRoutines
default drops since the only caller passes it explicitly, and _now is
renamed to now because adaptOverdueSection consumes it.

WallV2Shell call site is fixed in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire `wallData.overdueTasks` into `WallV2Shell`

The integration. After this commit, the wall renders the section live.

**Files:**
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (around line 129)

- [ ] **Step 1: Add the new arg to the `adaptTimelineSections` call**

Find this block (around line 129):

```tsx
  const timeline = useMemo(
    () => adaptTimelineSections(todayData, wallData.familyMembers, now, dinnerEvent, hideRoutines),
    [todayData, wallData.familyMembers, now, dinnerEvent, hideRoutines],
  );
```

Replace with:

```tsx
  const timeline = useMemo(
    () => adaptTimelineSections(
      todayData,
      wallData.familyMembers,
      now,
      dinnerEvent,
      hideRoutines,
      wallData.overdueTasks,
    ),
    [todayData, wallData.familyMembers, now, dinnerEvent, hideRoutines, wallData.overdueTasks],
  );
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: clean. The cascading signature mismatch from Task 3 is now resolved.

- [ ] **Step 3: Run the full wall-v2 + adapter test suite**

```bash
npx vitest run src/components/wall-v2
```

Expected: green. Pre-existing failures unrelated to overdue work are acceptable but list any in the report.

- [ ] **Step 4: Commit**

```bash
git add src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): pass overdueTasks through to the timeline adapter

WallV2Shell now forwards useWallData's overdueTasks into the
adaptTimelineSections call (and its memo deps) so the new Overdue
section renders live on the kitchen wall. Tap → existing
WallV2ItemActionSheet flow handles complete / push.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Final verification

Run the full quality gate, manually smoke if convenient, then push.

- [ ] **Step 1: Lint**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-overdue
npm run lint
```

Expected: 0 errors. Pre-existing warnings in unrelated files (supabase/vite folders) are fine.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: green except pre-existing failures unrelated to this work. Note any new failures and stop if they're tied to wall-v2 / wallV2Adapter / WallV2Shell.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: clean (chunk size warning is pre-existing). This catches the stricter `tsc -b` errors Vercel runs on deploy that `tsc --noEmit` doesn't.

- [ ] **Step 4: Manual smoke (recommended, optional)**

```bash
npm run dev
```

Open the wall route in a browser (or on your TV/iPad). With a known overdue task in the DB, confirm:
- The Overdue section appears at the top of the Timeline.
- The icon (`Clock`) and label ("Overdue") render in honey tint.
- Each row shows title + "Was due yesterday" / "N days ago" / "N weeks ago".
- Tapping a row opens the `WallV2ItemActionSheet`.
- Completing or pushing from the sheet removes the row on the next poll (12 min) or explicit Refresh.
- With no overdue tasks present, the section is absent — no placeholder.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin wall-overdue
```

Doc-only / feature-flag work would push as a preview deploy here; this is real product code, so it'll also build as a Vercel preview against the wall route.

- [ ] **Step 6: Land it**

You have two options after the final whole-branch review (see superpowers:finishing-a-development-branch):

a) Open a PR for review:
```bash
gh pr create --base main --head wall-overdue \
  --title "Wall: surface overdue items in the Timeline" \
  --body "$(cat docs/superpowers/specs/2026-05-28-wall-overdue-design.md | head -60)"
```

b) Race-safe fast-forward push to `main` (auto-deploys to production via vercel.json):
```bash
git push origin wall-overdue:main
```

Choose (b) only after the manual smoke confirms the wall looks right and the tests are green.

---

## Self-review

**Spec coverage:**
- ✅ Goal 1 (overdue visible from kitchen) → Tasks 2–4
- ✅ Goal 2 (complete or push from wall via existing action sheet) → Task 4 (no new code; relies on existing `handleTapEvent` flow keyed off `event.kind === 'task'`)
- ✅ Goal 3 (quiet when nothing overdue) → adapter returns null, prepend skipped
- ✅ Data filter (family + completed=false + scheduled_for < today) → already enforced by `useWallData.ts:175–181`; the spec-correction note up front prevents duplicate work
- ✅ Cap 5, oldest first → Task 2 unit tests
- ✅ Subtitle wording → Task 2 unit tests cover yesterday / N days / N weeks
- ✅ Honey tint + AlertCircle/Clock icons → Task 2
- ✅ Section id union extension → Task 1
- ✅ Empty state (no DOM section) → Tasks 2 + 3 unit tests
- ✅ Existing `WallV2Timeline` rendering unchanged → no task; confirmed during exploration

**Open spec items deferred (documented in spec's Open questions):**
- Refresh cadence — accepted as-is for v1 (12-min poll); no plan task needed
- "Was due" wording verbosity — observed-in-the-wild call; revisit if needed
- Recurring-task instance duplication — already handled by the DB-level task model (each instance is a distinct row); Task 5 manual smoke is the verification

**Placeholder scan:** none. Every step has complete code or a complete shell command.

**Type consistency:**
- `WallV2TimelineSection.id` adds `'overdue'` in Task 1; Task 2's `adaptOverdueSection` returns `WallV2TimelineSection` with `id: 'overdue'`. ✓
- `memberBubble(m: FamilyMember): WallV2MemberBubble` is exported in Task 1; called in Task 2 with the looked-up `assignee`. Signatures align. ✓
- `adaptTimelineSections`'s new arg `overdueTasks: TimelineItem[]` matches `useWallData`'s `overdueTasks: TimelineItem[]`. Task 4's call site uses `wallData.overdueTasks`. ✓
- `overdueLabel(scheduledFor: Date, now: Date): string` consumed only inside `adaptOverdueSection`. ✓
- `WallV2TimelineEvent.kind: 'task' | 'event' | 'routine'` — adapter uses `kind: 'task' as const` to satisfy the literal type. ✓
