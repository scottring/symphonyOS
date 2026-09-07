# Wall: High-Value Board + Widget Person Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kitchen wall (`/wall-v2`) shows only what a family member wants at a glance from eight feet — timed appointments on the axis, today's rare routines / homework / school specials in a zone beside the name — and tapping an avatar opens a widget-grid page shaped for that person (kid or adult).

**Architecture:** Three deployable pushes to `main`, in this order. (1) A pure recurrence predicate `routineEarnsTheWall` in `routineUtils.ts`, applied in the board adapter so everyday rhythm never draws anywhere on the board. (2) The board adapter stops putting untimed tasks on rows (they go to a "Due today" strip card), and the row's untimed items become a typed **zone** drawn in a fixed column between the name and the track. (3) A pure `memberPageModel.ts` adds the adult shape, and `KidDayView.tsx` becomes a fixed 1024x768 widget grid with kid and adult layouts. The order differs from the brief's numbering (rule first, then board) because both touch the same adapter loop and the rule shrinks the board work; each push still stands alone.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4, Vitest + React Testing Library, lucide-react icons. Wall theme tokens in `src/components/wall-v2/wallTheme.ts` (`WALL.card`, `WALL.cardInset`, `WALL.label`, `WALL.muted`, `WALL.ink`, `WALL.inkStrong`, `WALL.warn`, `WALL.dinnerCard`, `WALL.dinnerLabel`).

**Spec:** `docs/superpowers/specs/2026-09-07-wall-high-value-and-person-pages.md` (also in the vault at `projects/symphony-os/briefs/2026-09-07-wall-high-value-and-person-pages.md`).

## Global Constraints

- Only touch `src/components/wall-v2/**`, `src/lib/wall/**`, and one new predicate (+ tests) in `src/lib/routineUtils.ts`. Today, /week, Routines, planning pages are out of scope.
- `isEverydayRoutine` keeps its Mon–Fri meaning; other surfaces depend on it. Add a new predicate beside it.
- High-value rule for a routine: earns the wall when recurrence type is `monthly`, `quarterly`, `yearly`, `since_last`, or `interval > 1`, or `weekly`/`specific_days` with ≤ 2 `days`, or `specific_days` with `dates`. `daily`, and `weekly`/`specific_days` with 3+ days, never draw on the board (including the Everyone row).
- Collection steps (`originalRoutine.parent_routine_id != null`) never draw on the board (existing drop stays).
- Completed commitments vanish; completed all-day rotations (Specials) and free stays stay.
- Row zone: at most 3 lines, then "and N more"; the zone is tappable on a person row and opens their page.
- Kid pages keep: daily routine checklist, reading timer earning screen time, homework, notices, handoff (pickup). Adults get: Appointments, Chores, The kids, Needed today, Dinner, Coming up.
- Adult = `member.role_label === 'parent' || member.is_full_user` (the Shell's existing "parents" rule, `WallV2Shell.tsx:624`). Kids' `role_label` is `'family'` in prod data — never test for `'child'`.
- Wall is a Raspberry Pi touchscreen (touch = mouse): targets ≥ 80px, no hover-only affordances, no drag, no modals. No emoji; lucide icons. No counts/scoreboards on rows except the existing `+N later`.
- Fixed resolution 1024x768. Check every visual change in a 1024x768 iframe with the demo account, not by resizing a desktop window.
- Node 22.14.0. Run tests with `npx vitest run <file>` (never bare `npm test` — watch mode). Type-check with `npx tsc -p tsconfig.app.json --noEmit`.
- Work only in the worktree `.worktrees/wall-high-value` (branch `wall-high-value`, from `origin/main`). Push with `git push origin HEAD:main` after each part's tests + tsc pass. Never edit the main worktree.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/routineUtils.ts` (modify) | Add `routineEarnsTheWall(rp)` beside `isEverydayRoutine`. |
| `src/lib/routineEarnsTheWall.test.ts` (create) | One `it` per recurrence shape. |
| `src/components/wall-v2/wallGantt.ts` (modify) | Adapter: drop rhythm routines; untimed tasks off the row; `anytime: string[]` → `zone: GanttZoneItem[]`; `board.zoneW`; household row omitted when empty. |
| `src/components/wall-v2/wallGantt.test.ts` (modify) | Rewrite the "everyday routine" describe; add zone + household tests. |
| `src/components/wall-v2/wallStrip.ts` (modify) | `adaptDueRows` untimed-only; add `adaptMemberComingUpRows`. |
| `src/components/wall-v2/wallStrip.test.ts` (modify) | Tests for both. |
| `src/components/wall-v2/WallV2Strip.tsx` (modify) | Third cell ladder: handoff > due today > question. |
| `src/components/wall-v2/WallV2Strip.due.test.tsx` (create) | Ladder tests. |
| `src/components/wall-v2/WallV2Gantt.tsx` (modify) | Zone column between name and track; axis header label over the zone; no chip line. |
| `src/components/wall-v2/WallV2Gantt.test.tsx` (modify) | Fixture uses `zone`; zone tap test. |
| `src/components/wall-v2/WallV2Shell.tsx` (modify) | Pass `dueRows` to strip; pass `days`, `tonight`, `onOpenDinner`, `onOpenMember` to `KidDayView`. |
| `src/lib/wall/memberPageModel.ts` (create) | Pure: `memberShape`, `nextLine`, `appointmentsFor`, `choresFor`, `kidsFor`. |
| `src/lib/wall/memberPageModel.test.ts` (create) | Tests. |
| `src/components/wall-v2/member/Widget.tsx` (create) | Shared widget frame (title + icon + body), the one card treatment. |
| `src/components/wall-v2/member/AppointmentsWidget.tsx` (create) | Adult left column. |
| `src/components/wall-v2/member/KidsWidget.tsx` (create) | Adult: each kid's special + handoff; tapping a kid opens their page. |
| `src/components/wall-v2/member/ComingUpWidget.tsx` (create) | Both shapes: next 3 days, one line each. |
| `src/components/wall-v2/member/DinnerWidget.tsx` (create) | Adult: tonight + open recipe. |
| `src/components/wall-v2/KidDayView.tsx` (modify) | Header with "Next:" line; grid layout for kid + adult; existing handlers untouched. |
| `src/components/wall-v2/KidDayView.test.tsx` (modify) | Adult shape tests; kid tests keep passing. |

---

## PART 1 — The rule (push 1)

### Task 1: `routineEarnsTheWall` predicate

**Files:**
- Modify: `src/lib/routineUtils.ts` (after `isEverydayRoutine`, line ~54)
- Create: `src/lib/routineEarnsTheWall.test.ts`

**Interfaces:**
- Produces: `export function routineEarnsTheWall(rp?: RecurrencePattern | null): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/routineEarnsTheWall.test.ts
import { describe, it, expect } from 'vitest'
import { routineEarnsTheWall } from './routineUtils'

describe('routineEarnsTheWall — what is rare enough to be news', () => {
  it('daily is rhythm', () => {
    expect(routineEarnsTheWall({ type: 'daily' })).toBe(false)
  })
  it('weekly on one or two days earns it', () => {
    expect(routineEarnsTheWall({ type: 'weekly', days: ['sat'] })).toBe(true)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['tue', 'thu'] })).toBe(true)
  })
  it('weekly on three or more days is rhythm', () => {
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'wed', 'fri'] })).toBe(false)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe(false)
  })
  it('weekly with no days listed means every day — rhythm', () => {
    expect(routineEarnsTheWall({ type: 'weekly' })).toBe(false)
  })
  it('specific_days follows the same day count, and named dates always earn it', () => {
    expect(routineEarnsTheWall({ type: 'specific_days', days: ['sun'] })).toBe(true)
    expect(routineEarnsTheWall({ type: 'specific_days', days: ['mon', 'tue', 'wed'] })).toBe(false)
    expect(routineEarnsTheWall({ type: 'specific_days', dates: ['2026-10-31'] })).toBe(true)
  })
  it('any interval above one earns it, whatever the type', () => {
    expect(routineEarnsTheWall({ type: 'daily', interval: 2 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'weekly', days: ['mon', 'tue', 'wed'], interval: 2 })).toBe(true)
  })
  it('monthly, quarterly, yearly and since_last always earn it', () => {
    expect(routineEarnsTheWall({ type: 'monthly', day_of_month: 1 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'quarterly' })).toBe(true)
    expect(routineEarnsTheWall({ type: 'yearly', month_of_year: 4 })).toBe(true)
    expect(routineEarnsTheWall({ type: 'since_last', interval: 1, unit: 'weeks' })).toBe(true)
  })
  it('no pattern at all is not a routine the wall can judge — rhythm', () => {
    expect(routineEarnsTheWall(null)).toBe(false)
    expect(routineEarnsTheWall(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/routineEarnsTheWall.test.ts`
Expected: FAIL — `routineEarnsTheWall` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/routineUtils.ts` directly after `isEverydayRoutine`:

```ts
/**
 * Whether a routine is rare enough to be NEWS on the kitchen wall.
 *
 * The wall shows what is unusual about today. A thing that happens every
 * day, or most days, is the shape of a week — brushing teeth, feeding the
 * dog — and drawing it beside a dentist appointment teaches people to stop
 * reading the wall. Two days a week or fewer is the line (Scott, 2026-09-07):
 * "once or twice a week" is what he named as worth a glance. Anything on a
 * longer cadence — every other week, monthly, since the last time — is by
 * construction rarer than that and always earns its place.
 *
 * Distinct from `isEverydayRoutine`, which asks "does this run Mon–Fri?" for
 * the Show-daily toggle and the board's old background line. That meaning
 * stays; this is a stricter question for a different surface.
 */
export function routineEarnsTheWall(rp?: RecurrencePattern | null): boolean {
  if (!rp) return false
  if ((rp.interval ?? 1) > 1) return true
  switch (rp.type) {
    case 'monthly':
    case 'quarterly':
    case 'yearly':
    case 'since_last':
      return true
    case 'daily':
      return false
    case 'weekly':
    case 'specific_days': {
      if (rp.dates && rp.dates.length > 0) return true
      if (!rp.days || rp.days.length === 0) return false
      return rp.days.length <= 2
    }
    default:
      return false
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/routineEarnsTheWall.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/routineUtils.ts src/lib/routineEarnsTheWall.test.ts
git commit -m "feat(wall): routineEarnsTheWall — two days a week or rarer is news

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

---

### Task 2: The board drops rhythm routines everywhere

Today (`wallGantt.ts`): everyday routines are routed to the household row (`boardOwnersOf`), turned into "anytime" chips (`isAnytimeItem`), and time-gated by `RHYTHM_HORIZON_MIN`. All of that goes. A routine that does not earn the wall is dropped in `itemsFor`; a routine that does earn it draws like anything else (a bar if timed, a row item if not) on its owners' rows.

**Files:**
- Modify: `src/components/wall-v2/wallGantt.ts`
- Modify: `src/components/wall-v2/wallGantt.test.ts` (describe blocks at lines 294–397 and 432–475)

**Interfaces:**
- Consumes: `routineEarnsTheWall` from Task 1.
- Produces: `RHYTHM_HORIZON_MIN` removed. `boardOwnersOf` no longer special-cases everyday routines. `isAnytimeItem(it)` is now `!it.startTime || it.allDay`.

- [ ] **Step 1: Rewrite the failing tests**

Replace the entire `describe('an everyday routine is words, not a bar', …)` block (lines 294–397) with:

```ts
describe('rhythm never draws on the board — only a rare routine is news', () => {
  const members = [member('s', 'Scott')]
  const last = (b: ReturnType<typeof adaptGanttBoard>) => b.tracks[b.tracks.length - 1]
  const daily = (title: string, h: number) => item({
    type: 'routine', title, assignedTo: 's', startTime: at(h), endTime: at(h, 2),
    recurrencePattern: { type: 'daily' },
  } as Partial<TimelineItem>)

  it('drops a timed everyday routine from every row, including Everyone', () => {
    const board = adaptGanttBoard(members, [day([daily('Brush teeth', 20)])], at(19))
    for (const t of board.tracks) {
      expect(t.blocks).toHaveLength(0)
      expect(t.zone).toEqual([])
    }
  })

  it('drops an untimed everyday routine too', () => {
    const untimed = item({
      type: 'routine', title: 'Pack bags', startTime: null, assignedTo: 's',
      recurrencePattern: { type: 'daily' },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([untimed])], at(19))
    expect(board.tracks.flatMap((t) => t.zone.map((z) => z.title))).not.toContain('Pack bags')
  })

  it('drops a three-days-a-week routine — that is a week\'s shape, not news', () => {
    const mwf = item({
      type: 'routine', title: 'Piano practice', assignedTo: 's', startTime: at(16), endTime: at(16, 30),
      recurrencePattern: { type: 'weekly', days: ['mon', 'wed', 'fri'] },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([mwf])], at(15))
    expect(board.tracks[0].blocks).toHaveLength(0)
  })

  it('draws a timed weekly routine as a bar on its owner\'s row, not on Everyone', () => {
    const sat = item({
      type: 'routine', title: 'Farmers market', assignedTo: 's', startTime: at(9), endTime: at(10),
      recurrencePattern: { type: 'weekly', days: ['sat'] },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([sat])], at(8, 30))
    expect(board.tracks[0].blocks.map((b) => b.title)).toEqual(['Farmers market'])
  })

  it('puts an untimed rare routine in the row zone, all day, whatever the hour', () => {
    const weekly = item({
      type: 'routine', title: 'Do kitchen Laundry', startTime: null, assignedTo: 's',
      recurrencePattern: { type: 'weekly', days: ['sat'] },
    } as Partial<TimelineItem>)
    for (const hour of [7, 13, 21]) {
      const board = adaptGanttBoard(members, [day([weekly])], at(hour))
      expect(board.tracks[0].zone.map((z) => z.title)).toContain('Do kitchen Laundry')
    }
  })

  it('a monthly or every-other-week routine earns the row even with many days listed', () => {
    const biweekly = item({
      type: 'routine', title: 'Bins out', startTime: null, assignedTo: 's',
      recurrencePattern: { type: 'weekly', days: ['mon', 'tue', 'wed'], interval: 2 },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([biweekly])], at(9))
    expect(board.tracks[0].zone.map((z) => z.title)).toContain('Bins out')
  })

  it('does not let a dropped routine stretch the window', () => {
    const real = item({ type: 'event', title: 'Dentist', startTime: at(9), endTime: at(10) })
    const board = adaptGanttBoard(members, [day([daily('Bedtime', 21), real])], at(9))
    expect((board.axis.endMin - board.axis.startMin) / 60).toBe(MIN_SPAN_H)
    void last
  })
})
```

Note: this block references `t.zone`, which Task 3 introduces. Until Task 3 lands, write these tests against `anytime` (`t.anytime` / `.anytime.map(…)` with `string[]`), and Task 3's step converts them. To keep each task green on its own: in this task use `anytime` (strings); the zone assertions become `expect(t.anytime).toEqual([])` / `.toContain('…')`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/wall-v2/wallGantt.test.ts`
Expected: the new block fails on "drops a timed everyday routine" (it currently lands in `anytime` on the household row) and "draws a timed weekly routine as a bar" may already pass; that is fine.

- [ ] **Step 3: Implement in `wallGantt.ts`**

1. Replace the import `import { isEverydayRoutine } from '@/lib/routineUtils';` with `import { routineEarnsTheWall } from '@/lib/routineUtils';`.
2. Delete the `RHYTHM_HORIZON_MIN` constant and its doc comment (lines 62–80).
3. Replace `isAnytimeItem` with:

```ts
/** True when an item cannot be drawn as a bar: it has no clock time, or is all-day. */
function isAnytimeItem(it: TimelineItem): boolean {
  return !it.startTime || !!it.allDay;
}
```

4. In `boardOwnersOf`, delete the first `if (item.type === 'routine' && isEverydayRoutine(...)) return [HOUSEHOLD_ID];` branch. Update its doc comment bullet "Everyday routines go to the household row instead of being dropped" to: "Rhythm routines never reach here — `itemsFor` drops what does not earn the wall (see `routineEarnsTheWall`)."
5. In `itemsFor`, after the collection-step drop, add:

```ts
      // The wall shows what is unusual about today. A routine that runs most
      // days is the week's shape, not news — it never draws on any row,
      // Everyone included. Two days a week or rarer earns its place.
      if (item.type === 'routine' && !routineEarnsTheWall(item.recurrencePattern)) continue;
```

6. In the per-track loop inside `adaptGanttBoard`, inside `if (isAnytimeItem(it)) { … }`, delete both routine-gating `continue`s and their comments (the `RHYTHM_HORIZON_MIN` one and the `isEverydayRoutine` one). What remains:

```ts
      if (isAnytimeItem(it)) {
        const at = it.startTime ? minutesOfDay(it.startTime) : Number.MAX_SAFE_INTEGER;
        anytimeItems.push({ title, at });
        continue;
      }
```

7. Update the `GanttTrack.anytime` doc comment: remove the paragraph about everyday routines' nominal time; it now reads "Items with no clock time, which have no position on an axis."
8. Update the file header comment at `isAnytimeItem`'s old doc ("Everyday routines are here rather than filtered out entirely…") — delete it.

- [ ] **Step 4: Fix the other describe that depended on the horizon**

`describe('collection steps never draw on the live board (Task 8a fix round 1)')` (line 432) and `describe('a Step of a routine collection, end to end')` (line 399) build routines via `routineToTimelineItem` with a collection parent. Run the file; for any test that fails only because it expected an everyday parent routine on the Everyone row, change the assertion to expect it absent (the parent is `daily` → dropped). Keep the assertions that a step never draws.

Run: `npx vitest run src/components/wall-v2/wallGantt.test.ts src/components/wall-v2/wallParity.test.ts src/components/wall-v2/wallLanes.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors (an unused-import error means `isEverydayRoutine` is still imported somewhere in `wallGantt.ts`).

```bash
git add src/components/wall-v2/wallGantt.ts src/components/wall-v2/wallGantt.test.ts
git commit -m "feat(wall): the board draws only routines that earn it — rhythm leaves every row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

- [ ] **Step 6: Push part 1**

```bash
npx vitest run src/components/wall-v2 src/lib/wall src/lib/routineEarnsTheWall.test.ts
npx tsc -p tsconfig.app.json --noEmit
git fetch origin && git rebase origin/main && git push origin HEAD:main
```
Record the commit hash for the final report. Verify deploy: `gh api repos/{owner}/{repo}/deployments --jq '.[0].sha'` matches, or open `https://app.symphony-os.com/wall-v2` in Chrome after ~3 minutes and confirm no everyday chips on the Everyone row.

---

## PART 2 — The board (push 2)

### Task 3: Adapter — untimed tasks off the row; `zone` replaces `anytime`; household row only when it has something

**Files:**
- Modify: `src/components/wall-v2/wallGantt.ts`
- Modify: `src/components/wall-v2/wallGantt.test.ts`

**Interfaces (produced, used by Tasks 5 and 8):**

```ts
export interface GanttZoneItem {
  id: string;
  title: string;
  /** 'special' = all-day event (Specials, Picture Day, Labor Day); 'routine' = untimed rare routine. */
  kind: 'special' | 'routine';
}
export interface GanttTrack {
  memberId: string; name: string; blocks: GanttBlock[]; homework: GanttHomework[];
  zone: GanttZoneItem[];          // replaces anytime: string[]
  laterCount: number; live?: string;
}
export interface GanttBoard { axis: GanttAxis; tracks: GanttTrack[]; zoneW: number }
export const ZONE_W = 236;        // px reserved for the zone column when any track uses it
export const ZONE_SHOWN = 3;      // lines before "and N more"
```

`board.zoneW` is `ZONE_W` when at least one track has `zone.length > 0 || homework.length > 0 || live`, else `0`. Label fitting uses `trackPx - board.zoneW`.

- [ ] **Step 1: Write the failing tests** (append to `wallGantt.test.ts`)

```ts
describe('the zone — what a row says beside the name, off the axis', () => {
  const members = [member('s', 'Scott'), member('e', 'Ella')]

  it('an untimed TASK leaves the row — the strip carries it now', () => {
    const t = item({ type: 'task', title: 'Wash bookbags', startTime: null, assignedTo: 's' })
    const board = adaptGanttBoard(members, [day([t])], at(9))
    expect(board.tracks[0].zone).toEqual([])
    expect(board.tracks[0].blocks).toEqual([])
  })

  it('a timed task is still a bar — it is an appointment with yourself', () => {
    const t = item({ type: 'task', title: 'Call the plumber', startTime: at(10), endTime: at(10, 30), assignedTo: 's' })
    const board = adaptGanttBoard(members, [day([t])], at(9))
    expect(board.tracks[0].blocks.map((b) => b.title)).toEqual(['Call the plumber'])
  })

  it('an all-day event is a special in the zone, split to each named person', () => {
    const specials = item({ type: 'event', title: 'Specials — Ella: Visual Art · Kaleb: PE', allDay: true })
    const board = adaptGanttBoard(members, [day([specials])], at(9))
    const ella = board.tracks.find((t) => t.memberId === 'e')!
    expect(ella.zone).toEqual([{ id: specials.id, title: 'Visual Art', kind: 'special' }])
  })

  it('an untimed rare routine is a routine in the zone', () => {
    const r = item({
      type: 'routine', title: 'Laundry', startTime: null, assignedTo: 's',
      recurrencePattern: { type: 'weekly', days: ['sat'] },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([r])], at(9))
    expect(board.tracks[0].zone).toEqual([{ id: r.id, title: 'Laundry', kind: 'routine' }])
  })

  it('reserves the zone column only when some row uses it', () => {
    const bare = adaptGanttBoard(members, [day([item({ type: 'event', title: 'Dentist', startTime: at(9), endTime: at(10), assignedTo: 's' })])], at(9))
    expect(bare.zoneW).toBe(0)
    const withZone = adaptGanttBoard(members, [day([item({ type: 'event', title: 'Labor Day', allDay: true })])], at(9))
    expect(withZone.zoneW).toBe(ZONE_W)
  })

  it('fits labels against the narrower track when the zone column is open', () => {
    // A one-hour bar on a 6h window: 130px of 780 fits nothing inside either
    // way, but the RIGHT gap that decides "outside" shrinks with the track.
    const special = item({ type: 'event', title: 'Labor Day', allDay: true })
    const bar = item({ type: 'event', title: 'Dentist', startTime: at(9), endTime: at(10), assignedTo: 's' })
    const wide = adaptGanttBoard(members, [day([bar])], at(9), 400)
    const narrow = adaptGanttBoard(members, [day([bar, special])], at(9), 400)
    // With 400px total and 236 reserved, 164px of track cannot hold a 170px label anywhere.
    expect(wide.tracks[0].blocks[0].labelSide).toBe('right')
    expect(narrow.tracks[0].blocks[0].labelSide).toBe('in')
  })
})

describe('the Everyone row earns its place', () => {
  const members = [member('s', 'Scott')]
  it('is omitted when it has nothing to say', () => {
    const board = adaptGanttBoard(members, [day([])], at(9))
    expect(board.tracks.map((t) => t.memberId)).toEqual(['s'])
  })
  it('is present when a household item lands on it', () => {
    const board = adaptGanttBoard(members, [day([item({ type: 'event', title: 'Labor Day', allDay: true })])], at(9))
    expect(board.tracks[board.tracks.length - 1].memberId).toBe(HOUSEHOLD_ID)
  })
})
```

Add `ZONE_W` to the import from `./wallGantt` and `import { HOUSEHOLD_ID } from './wallEventAttribution'` at the top of the test file.

Then update existing tests that referenced `anytime`:
- `it('gives an untimed item a chip, since it has no position')` (line 153): make the item an all-day **event** and assert `zone[0].title`.
- `it('always ends with the household track, so shared items have a home')` (line 175): give the day an unassigned all-day event, keep the assertion.
- `it('survives a day with no data at all')` (line 180): assert `tracks` has exactly the members (no household).
- `it('gives an unassigned task to the household row instead of dropping it')` (line 268): make the task **timed** (`startTime: at(10), endTime: at(11)`) and assert it is a block on the household track.
- `it('keeps an untimed TASK regardless…')` — already removed in Task 2.
- Any `anytime` reference in the Task 2 block → `zone.map((z) => z.title)`.
- `it('reads the unscheduled section, which PREVIEW_SECTIONS leaves out')` (line 510): the unscheduled item must be an untimed **routine** that earns the wall (`weekly`, `days: ['sat']`), asserted via `zone`.

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/components/wall-v2/wallGantt.test.ts`
Expected: FAIL on `zone`/`zoneW`/`ZONE_W` not existing.

- [ ] **Step 3: Implement**

In `wallGantt.ts`:

1. Add exports after `MIN_LABEL_PX`:

```ts
/**
 * Width of the zone column — the row's words that have no place on a clock.
 * Sized for three lines of 0.95rem bold at ~24 characters, which is
 * "Visual Art" or "Math sheet · Fri" with room to spare. Reserved only when
 * some row uses it, so a quiet day keeps the whole track.
 */
export const ZONE_W = 236;
/** Zone lines shown before "and N more". */
export const ZONE_SHOWN = 3;
```

2. Replace the `anytime` field on `GanttTrack` with `zone: GanttZoneItem[]` (define `GanttZoneItem` as in Interfaces above, with doc comments), and add `zoneW: number` to `GanttBoard` (doc: "px the tracks give up to the zone column; 0 when no row uses it").

3. Restructure `adaptGanttBoard` into two passes. First pass collects per-member `{ zone, timed, laterCount }`; then compute `zoneW`; then draw blocks with `const fitPx = trackPx - zoneW`. Concretely, replace from `const tracks: GanttTrack[] = roster.map((m) => {` through the end of the function with:

```ts
  type Timed = { it: TimelineItem; title: string; s: number; e: number };
  const collected = roster.map((m) => {
    const zone: GanttZoneItem[] = [];
    const timed: Timed[] = [];
    for (const it of today ? itemsFor(today, m.id, members) : []) {
      const title = m.id === HOUSEHOLD_ID
        ? titleForMember(it.title, m.name)
        : withoutMemberList(titleForMember(it.title, m.name), members);
      if (isAnytimeItem(it)) {
        // An untimed task has no place on a clock and no place on this board:
        // the strip's "Due today" card lists it, and the person's page holds
        // it under Chores. A row says only what makes today different.
        if (it.type === 'task') continue;
        zone.push({ id: it.id, title, kind: it.type === 'routine' ? 'routine' : 'special' });
        continue;
      }
      const s = minutesOfDay(it.startTime!);
      const e = it.endTime ? minutesOfDay(it.endTime) : s + DEFAULT_DURATION_MIN;
      timed.push({ it, title, s, e });
    }
    return { m, zone, timed };
  });

  const zoneW = collected.some(({ m, zone }) =>
    zone.length > 0 || (homeworkByTrack.get(m.id)?.length ?? 0) > 0) ? ZONE_W : 0;
  const fitPx = trackPx - zoneW;

  const tracks: GanttTrack[] = [];
  for (const { m, zone, timed } of collected) {
    const blocks: GanttBlock[] = [];
    let laterCount = 0;

    const stays = timed.filter((t) => !!t.it.isFree && t.e - t.s >= STAY_MIN);
    const insideAStay = (t: { s: number; e: number }) =>
      stays.some((st) => st !== t && st.s <= t.s && t.e <= st.e);

    for (const t of timed) {
      // … (the existing block-building loop, unchanged, from `const { it, title, s, e } = t;`
      //    through `blocks.push({...})`)
    }

    blocks.sort((a, b) => a.leftPct - b.leftPct);
    // … (the existing gap/claims label-fitting code, unchanged, except:)
    const pxOf = (pct: number) => (pct / 100) * fitPx;
    // …

    const homework = sortHomework(homeworkByTrack.get(m.id) ?? [], now).map((t) => {
      const due = homeworkDue(t.neededOn, now);
      return { id: t.id, label: due.label ? `${t.title} · ${due.label}` : t.title, late: due.late };
    });

    // The household row is a home for what belongs to nobody in particular.
    // A home with nothing in it is a row that says "Nothing scheduled" under
    // a house icon, and on most days that was the wall's last line. Omit it,
    // and the people's rows get the height.
    if (m.id === HOUSEHOLD_ID && blocks.length === 0 && zone.length === 0 && homework.length === 0 && laterCount === 0) continue;

    tracks.push({ memberId: m.id, name: m.name, blocks, homework, zone, laterCount });
  }

  return { axis, tracks, zoneW };
```

The `zone` array keeps section order (`BOARD_SECTIONS`), which is already "allday first, then the day". No sort needed; remove `anytimeItems` and its sort.

4. `titleForBlockId` is unchanged.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/wall-v2/wallGantt.test.ts`
Expected: PASS. (Also run `src/components/wall-v2/WallV2Gantt.test.tsx` — it will FAIL on the `anytime` fixture; Task 5 fixes it. Do not commit until Task 5 is also green, OR update that fixture's `anytime: []` → `zone: []` now. Do the latter: in `WallV2Gantt.test.tsx`'s `track()` helper change `anytime: []` to `zone: []`, and in `board()` add `zoneW: 0`.)

- [ ] **Step 5: Type-check** — `npx tsc -p tsconfig.app.json --noEmit`. `WallV2Gantt.tsx` and `WallV2Shell.tsx` will error on `anytime`; make the minimal edits so it compiles: in `WallV2Gantt.tsx` replace every `track.anytime` with `track.zone.map((z) => z.title)` (Task 5 replaces this properly). Shell reads `board.tracks` only via `titleForBlockId` and `.live`, so it should compile.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/wallGantt.ts src/components/wall-v2/wallGantt.test.ts src/components/wall-v2/WallV2Gantt.tsx src/components/wall-v2/WallV2Gantt.test.tsx
git commit -m "feat(wall): rows carry a typed zone; untimed tasks leave the board; Everyone only when it has something

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

---

### Task 4: Strip — "Due today" card enters the ladder; untimed tasks only

**Files:**
- Modify: `src/components/wall-v2/wallStrip.ts` (`adaptDueRows`, line ~66)
- Modify: `src/components/wall-v2/wallStrip.test.ts`
- Modify: `src/components/wall-v2/WallV2Strip.tsx` (`WallV2Strip` props + third cell)
- Create: `src/components/wall-v2/WallV2Strip.due.test.tsx`
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (compute `dueRows`, pass to strip)

**Interfaces:**
- `adaptDueRows(today, members, limit)` — unchanged signature; now excludes tasks with a `startTime` and not `allDay`.
- `WallV2Strip` gains `due: DueRow[]`. Third cell ladder: `handoff` → `WallV2QuestionStripCard(handoff)`; else `due.length > 0` → `WallV2DueTodayCard`; else `WallV2QuestionStripCard(question)`.

- [ ] **Step 1: Failing tests**

In `wallStrip.test.ts`, inside `describe('adaptDueRows')` add:

```ts
  it('leaves a timed task to the board — it draws as a bar there', () => {
    const rows = adaptDueRows(
      day(new Date(), true, [
        item({ id: 'timed', title: 'Call the plumber', startTime: new Date(2026, 8, 7, 10), endTime: new Date(2026, 8, 7, 10, 30) }),
        item({ id: 'untimed', title: 'Buy backyard bench' }),
        item({ id: 'allday', title: 'Wash bookbags', startTime: new Date(2026, 8, 7), allDay: true }),
      ]), members)
    expect(rows.map((r) => r.id)).toEqual(['untimed', 'allday'])
  })
```

Create `WallV2Strip.due.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WallV2Strip } from './WallV2Strip'

const base = {
  tonight: null, meals: [], comingUp: [], question: 'What made you laugh today?',
  onCall: () => {},
}

describe('the strip\'s third cell — who gets it', () => {
  it('shows tonight\'s question when nothing is due', () => {
    render(<WallV2Strip {...base} due={[]} />)
    expect(screen.getByText(/What made you laugh/)).toBeInTheDocument()
    expect(screen.queryByText(/Due today/)).toBeNull()
  })
  it('shows what is due instead of the question when there is something to do', () => {
    render(<WallV2Strip {...base} due={[{ id: 'a', title: 'Buy backyard bench', who: 'Iris', completed: false }]} />)
    expect(screen.getByText('Buy backyard bench')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.queryByText(/What made you laugh/)).toBeNull()
  })
  it('a handoff nobody has claimed outranks both', () => {
    render(<WallV2Strip {...base} due={[{ id: 'a', title: 'Buy backyard bench', who: null, completed: false }]}
      handoff={{ lead: 'Tomorrow · 7:15a', prompt: 'Who\'s walking Ella & Kaleb to school?', more: 0 }} />)
    expect(screen.getByText(/Who's walking/)).toBeInTheDocument()
    expect(screen.queryByText('Buy backyard bench')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** — `npx vitest run src/components/wall-v2/wallStrip.test.ts src/components/wall-v2/WallV2Strip.due.test.tsx`. Expected: FAIL (timed task included; `due` prop unknown).

- [ ] **Step 3: Implement**

`wallStrip.ts` — change the filter in `adaptDueRows` to:

```ts
    // A task with an hour is an appointment with yourself and draws as a bar
    // on the board; this card is for the ones with no place on a clock.
    .filter((it) => it.type === 'task' && !it.completed && (!it.startTime || !!it.allDay))
```
and update the doc comment: "Today's unfinished UNTIMED tasks."

`WallV2Strip.tsx` — add `due: DueRow[]` to `WallV2Strip`'s props (required), and replace the middle cell:

```tsx
        {handoff
          ? <WallV2QuestionStripCard question={question} handoff={handoff} onTap={onTapHandoff} />
          : due.length > 0
            ? <WallV2DueTodayCard rows={due} />
            : <WallV2QuestionStripCard question={question} onTap={onTapQuestion} />}
```
Add a comment above: "The cell has a ladder. A handoff nobody has claimed is a question the house needs answered by 7am. Below that, what is due today outranks a conversation starter — untimed tasks left the board (they have no place on a clock), and this is where they live now. The question returns when the list is clear."

Also in `WallV2DueTodayCard`, change the title to plain `'Due today'` (no count — the wall never scoreboards).

`WallV2Shell.tsx` — near the existing strip projections (`mealRows`, `comingUpRows`, around line 515), add:

```ts
  const dueRows = useMemo(
    () => adaptDueRows(wallData.days.find((d) => d.isToday) ?? wallData.days[0], wallData.familyMembers),
    [wallData.days, wallData.familyMembers],
  );
```
import `adaptDueRows` from `./wallStrip`, and pass `due={dueRows}` to `<WallV2Strip …>`.

Update `WallV2Strip.recipes.test.tsx`'s `stripProps` to include `due: []`.

- [ ] **Step 4: Run** — `npx vitest run src/components/wall-v2/wallStrip.test.ts src/components/wall-v2/WallV2Strip.due.test.tsx src/components/wall-v2/WallV2Strip.recipes.test.tsx`. Expected: PASS. `npx tsc -p tsconfig.app.json --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/wallStrip.ts src/components/wall-v2/wallStrip.test.ts src/components/wall-v2/WallV2Strip.tsx src/components/wall-v2/WallV2Strip.due.test.tsx src/components/wall-v2/WallV2Strip.recipes.test.tsx src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): untimed tasks live in the strip's Due today card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

---

### Task 5: Renderer — the zone column

**Files:**
- Modify: `src/components/wall-v2/WallV2Gantt.tsx`
- Modify: `src/components/wall-v2/WallV2Gantt.test.tsx`

**Interfaces:**
- Consumes `GanttBoard.zoneW`, `GanttTrack.zone`, `ZONE_W`, `ZONE_SHOWN` from Task 3.
- Layout per row: `[face+name NAME_W] [zone column board.zoneW, or absent] [track]`. The axis header's "Today" label moves over the zone column when it is open (else stays where it is).

- [ ] **Step 1: Failing tests** (replace `WallV2Gantt.test.tsx`'s fixtures and add a describe)

Fixture changes: `track()` → `zone: []` instead of `anytime: []`; `board(tracks, zoneW = 0)` → `({ axis: axis(), tracks, zoneW })`.

```tsx
describe('the zone column', () => {
  it('lists a row\'s specials and rare routines as lines, capped, with "and N more"', () => {
    const t = track({
      blocks: [],
      zone: [
        { id: 'z1', title: 'Visual Art', kind: 'special' },
        { id: 'z2', title: 'Laundry', kind: 'routine' },
        { id: 'z3', title: 'Picture Day', kind: 'special' },
        { id: 'z4', title: 'Bins out', kind: 'routine' },
      ],
    })
    render(<WallV2Gantt board={board([t], 236)} />)
    expect(screen.getByText('Visual Art')).toBeInTheDocument()
    expect(screen.getByText('Laundry')).toBeInTheDocument()
    expect(screen.getByText('Picture Day')).toBeInTheDocument()
    expect(screen.queryByText('Bins out')).toBeNull()
    expect(screen.getByText('and 1 more')).toBeInTheDocument()
  })

  it('homework leads the zone and the whole zone opens the person\'s page', async () => {
    const onTapMember = vi.fn()
    const t = track({ blocks: [], homework: [{ id: 'h', label: 'Blue sheet · Fri', late: false }], zone: [{ id: 'z', title: 'PE', kind: 'special' }] })
    render(<WallV2Gantt board={board([t], 236)} onTapMember={onTapMember} />)
    const zone = screen.getByRole('button', { name: /Ella's day, today/ })
    zone.click()
    expect(onTapMember).toHaveBeenCalledWith('kid-1')
    expect(zone.textContent).toMatch(/Blue sheet · Fri.*PE/)
  })

  it('the household zone is words, not a button', () => {
    const t = track({ memberId: HOUSEHOLD_ID, name: 'Everyone', blocks: [], zone: [{ id: 'z', title: 'Labor Day', kind: 'special' }] })
    render(<WallV2Gantt board={board([t], 236)} onTapMember={vi.fn()} />)
    expect(screen.getByText('Labor Day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Everyone's day/ })).toBeNull()
  })

  it('draws no zone column at all when the board reserved none', () => {
    render(<WallV2Gantt board={board([track()], 0)} />)
    expect(screen.queryByTestId('zone')).toBeNull()
  })

  it('a bare row with no bars and no zone says so once', () => {
    render(<WallV2Gantt board={board([track({ blocks: [] })], 0)} />)
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument()
  })
})
```

The existing `describe('WallV2Gantt homework chips')` block (line 103) is replaced by the second test above (homework now lives in the zone). Delete it.

- [ ] **Step 2: Run** — `npx vitest run src/components/wall-v2/WallV2Gantt.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

In `WallV2Gantt.tsx`:

1. Imports: `import { BookOpen, Home, HelpCircle, Repeat, Star } from 'lucide-react';` and `import { ZONE_SHOWN } from './wallGantt';` and the types `GanttBoard, GanttBlock, GanttTrack, GanttZoneItem, GanttHomework`.
2. Delete `ANYTIME_SHOWN`, `ANYTIME_SHOWN_ROOMY`, `HOMEWORK_SHOWN`, the `Chip` component, `HomeworkChip`, and `AnytimeArea`.
3. Add the zone component:

```tsx
/**
 * The zone: what this row has to say that has no place on a clock. Today's
 * special, an open homework sheet, a routine rare enough to be news. Three
 * lines, then "and N more" — the person's page has the rest, and on a person's
 * row the whole zone is the tap that opens it. A row never counts its own
 * items as a score; "and 1 more" is a door, not a tally.
 */
function Zone({ track, onTap }: { track: GanttTrack; onTap?: () => void }) {
  type Line = { key: string; icon: typeof Star; text: string; tone: string };
  const lines: Line[] = [
    ...(track.live ? [{ key: 'live', icon: BookOpen, text: track.live, tone: 'text-[#2E4638] dark:text-[#7FA893]' }] : []),
    ...track.homework.map((h) => ({
      key: `h-${h.id}`, icon: BookOpen, text: h.label,
      tone: h.late ? 'text-[#A8600F] dark:text-[#E0A959]' : 'text-[#2E4638] dark:text-[#BFE3CF]',
    })),
    ...track.zone.map((z) => ({
      key: `z-${z.id}`, icon: z.kind === 'routine' ? Repeat : Star, text: z.title, tone: WALL.ink,
    })),
  ];
  const shown = lines.slice(0, ZONE_SHOWN);
  const more = lines.length - shown.length;
  const body = (
    <>
      {shown.map((l) => (
        <span key={l.key} className={`flex items-center gap-1.5 min-w-0 text-[0.95rem] font-bold leading-tight ${l.tone}`}>
          <l.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{l.text}</span>
        </span>
      ))}
      {more > 0 && <span className={`text-[0.85rem] font-bold ${WALL.muted}`}>and {more} more</span>}
    </>
  );
  const cls = 'shrink-0 flex flex-col justify-center gap-0.5 min-w-0 text-left';
  if (!onTap) return <div data-testid="zone" style={{ width: ZONE_INNER }} className={cls}>{body}</div>;
  return (
    <button type="button" data-testid="zone" onClick={onTap} aria-label={`${track.name}'s day, today`} style={{ width: ZONE_INNER }} className={`${cls} active:scale-[.98] transition-transform`}>
      {body}
    </button>
  );
}
```
with `const ZONE_INNER = 236 - GAP;` declared near `NAME_W` (comment: "the zone column minus the gap the row already draws between columns, so the track still starts at NAME_W + zoneW").

4. In `Track`, accept `zoneW: number`. Replace the body after the name column with:

```tsx
      {zoneW > 0 && (
        <Zone track={track} onTap={onTapMember && track.memberId !== HOUSEHOLD_ID ? () => onTapMember(track.memberId) : undefined} />
      )}
      <div className="relative flex-1 min-w-0 h-full flex flex-col justify-center py-1">
        {hasBars ? (
          <div className="relative h-[44px] shrink-0">
            {track.blocks.map((b) => <Bar key={b.id} block={b} index={index} onTap={onTapItem} />)}
          </div>
        ) : (
          track.laterCount > 0
            ? <span className={`text-[1.05rem] font-bold ${WALL.muted}`}>+{track.laterCount} later</span>
            : (zoneW === 0 || (track.zone.length === 0 && track.homework.length === 0 && !track.live)) &&
              <span className={`text-[1.05rem] ${WALL.muted}`}>Nothing scheduled</span>
        )}
        {hasBars && track.laterCount > 0 && (
          <span className={`absolute right-0 top-0 text-[0.85rem] font-bold ${WALL.muted}`}>+{track.laterCount} later</span>
        )}
      </div>
```
Remove `hasChips`.

5. In `WallV2Gantt`, compute `const trackLeft = BORDER_L + PAD_L + NAME_W + GAP + board.zoneW;`, pass `zoneW={board.zoneW}` to each `Track`, and in the axis header: when `board.zoneW > 0` render the "Today" label at `left: BORDER_L + PAD_L + NAME_W + GAP` (over the zone), otherwise at its current position. Update the header comment: "Every row's track starts at NAME_W + zoneW; the zone column is fixed-width and reserved board-wide, so the ruler still means what it says."

- [ ] **Step 4: Run** — `npx vitest run src/components/wall-v2/WallV2Gantt.test.tsx src/components/wall-v2/wallGantt.test.ts`. Expected: PASS. `npx tsc -p tsconfig.app.json --noEmit` clean. `npx eslint src/components/wall-v2` clean.

- [ ] **Step 5: Look at it.** Start the worktree dev server (`npm run dev -- --port 5174`), open `http://localhost:5174/wall-v2` in Chrome via the claude-in-chrome tools at a 1024x768 window (`resize_window`), signed in as the demo account. Confirm: no everyday chips; zone column shows specials/homework; untimed tasks in the strip's Due today card; Everyone row absent when empty. Fix any wrap/overflow before committing. Save a screenshot to `~/Documents/scotts-world/projects/symphony-os/assets/2026-09-07-wall-board-high-value.png`.

- [ ] **Step 6: Commit and push part 2**

```bash
git add src/components/wall-v2/WallV2Gantt.tsx src/components/wall-v2/WallV2Gantt.test.tsx
git commit -m "feat(wall): the zone column — a row's specials, homework and rare routines beside the name

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
npx vitest run src/components/wall-v2 src/lib/wall
npx tsc -p tsconfig.app.json --noEmit
git fetch origin && git rebase origin/main && git push origin HEAD:main
```
Record the hash.

---

## PART 3 — The person page (push 3)

### Task 6: `memberPageModel.ts` — the adult shape, pure

**Files:**
- Create: `src/lib/wall/memberPageModel.ts`
- Create: `src/lib/wall/memberPageModel.test.ts`
- Modify: `src/components/wall-v2/wallStrip.ts` (add `adaptMemberComingUpRows`) + test

**Interfaces (produced):**

```ts
// src/lib/wall/memberPageModel.ts
export type MemberShape = 'kid' | 'adult'
export function memberShape(m: FamilyMember): MemberShape
export interface AppointmentRow { id: string; time: string; title: string; detail: string | null; past: boolean; free: boolean }
export function appointmentsFor(member: FamilyMember, members: FamilyMember[], todayItems: Record<DaySection, TimelineItem[]>, now: Date): AppointmentRow[]
export function nextLine(appointments: AppointmentRow[]): string | null
export function choresFor(model: MemberDayModel): KidRow[]      // adult: rare routines + untimed tasks, band order
export interface KidLine { id: string; name: string; special: string | null; handoff: string | null }
export function kidsFor(adult: FamilyMember, members: FamilyMember[], todayItems: Record<DaySection, TimelineItem[]>): KidLine[]
// wallStrip.ts
export function adaptMemberComingUpRows(days: WallDayData[], member: FamilyMember, members: FamilyMember[], limit = 3): ComingUpRow[]
```

- [ ] **Step 1: Failing tests**

```ts
// src/lib/wall/memberPageModel.test.ts
import { describe, it, expect } from 'vitest'
import { memberShape, appointmentsFor, nextLine, choresFor, kidsFor } from './memberPageModel'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { MemberDayModel, KidRow } from './kidDayModel'
import { emptySections } from '@/lib/today/types'

const m = (o: Partial<FamilyMember>): FamilyMember =>
  ({ id: 'x', name: 'X', user_id: 'u', initials: 'X', color: 'blue', avatar_url: null, is_full_user: false, display_order: 0, created_at: '', member_type: 'core', ...o }) as FamilyMember
const scott = m({ id: 's', name: 'Scott', role_label: 'parent', is_full_user: true })
const iris = m({ id: 'i', name: 'Iris', role_label: 'parent', is_full_user: true })
const ella = m({ id: 'e', name: 'Ella', role_label: 'family' })
const kaleb = m({ id: 'k', name: 'Kaleb', role_label: 'family' })
const members = [scott, iris, ella, kaleb]
const at = (h: number, mi = 0) => new Date(2026, 8, 7, h, mi)
const item = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: Math.random().toString(36).slice(2), type: 'event', title: 't', startTime: null, endTime: null, completed: false, ...o }) as TimelineItem
const sections = (items: TimelineItem[]): Record<DaySection, TimelineItem[]> => {
  const s = emptySections<TimelineItem>()
  for (const it of items) (it.allDay ? s.allday : s.afternoon).push(it)
  return s
}

describe('memberShape', () => {
  it('a parent or full user is an adult; a kid (role_label family) is a kid', () => {
    expect(memberShape(scott)).toBe('adult')
    expect(memberShape(m({ is_full_user: true }))).toBe('adult')
    expect(memberShape(ella)).toBe('kid')
  })
})

describe('appointmentsFor — timed things on this person\'s day', () => {
  it('lists timed events attributed to the member and timed tasks assigned to them, in clock order', () => {
    const items = [
      item({ title: 'Ella & Kaleb to FFG', startTime: at(18, 30), endTime: at(18, 45), assignedTo: 's' }),
      item({ title: 'Dentist', startTime: at(16), endTime: at(17), assignedTo: 's', location: 'Main St' }),
      item({ type: 'task', title: 'Call plumber', startTime: at(10), endTime: at(10, 30), assignedTo: 's' }),
      item({ title: 'Iris yoga', startTime: at(9), endTime: at(10), assignedTo: 'i' }),
    ]
    const rows = appointmentsFor(scott, members, sections(items), at(12))
    expect(rows.map((r) => [r.time, r.title, r.detail, r.past])).toEqual([
      ['10:00', 'Call plumber', null, true],
      ['4:00', 'Dentist', 'Main St', false],
      ['6:30', 'Ella & Kaleb to FFG', null, false],
    ])
  })
  it('skips all-day, completed and everyday-routine items', () => {
    const items = [
      item({ title: 'Labor Day', allDay: true }),
      item({ title: 'Done thing', startTime: at(9), endTime: at(10), assignedTo: 's', completed: true }),
      item({ type: 'routine', title: 'Brush teeth', startTime: at(7), endTime: at(7, 5), assignedTo: 's', recurrencePattern: { type: 'daily' } } as Partial<TimelineItem>),
      item({ type: 'routine', title: 'Farmers market', startTime: at(9), endTime: at(10), assignedTo: 's', recurrencePattern: { type: 'weekly', days: ['sat'] } } as Partial<TimelineItem>),
    ]
    expect(appointmentsFor(scott, members, sections(items), at(8)).map((r) => r.title)).toEqual(['Farmers market'])
  })
})

describe('nextLine', () => {
  it('names the next thing and the one after, and nothing when the day is done', () => {
    const rows = [
      { id: 'a', time: '10:00', title: 'Call plumber', detail: null, past: true, free: false },
      { id: 'b', time: '4:00', title: 'Dentist', detail: null, past: false, free: false },
      { id: 'c', time: '6:30', title: 'FFG', detail: null, past: false, free: false },
    ]
    expect(nextLine(rows)).toBe('Next: Dentist 4:00 · then FFG 6:30')
    expect(nextLine(rows.slice(0, 1))).toBeNull()
    expect(nextLine(rows.slice(0, 2))).toBe('Next: Dentist 4:00')
  })
})

describe('choresFor — an adult\'s list', () => {
  const row = (o: Partial<KidRow>): KidRow => ({ entityType: 'routine', id: 'r', title: 'r', done: false, timeOfDay: null, target: null, ...o })
  it('keeps untimed tasks and drops timed ones (they are appointments)', () => {
    const model = { bands: { morning: [row({ entityType: 'task', id: 't1', title: 'Buy rug' })], afternoon: [row({ entityType: 'task', id: 't2', title: 'Call plumber', timeOfDay: '10:00' })], evening: [], anytime: [] }, collections: [] } as unknown as MemberDayModel
    expect(choresFor(model).map((r) => r.title)).toEqual(['Buy rug'])
  })
  it('keeps routine rows the model already resolved, in band order', () => {
    const model = { bands: { morning: [], afternoon: [], evening: [row({ id: 'r2', title: 'Bins out' })], anytime: [row({ id: 'r1', title: 'Laundry' })] }, collections: [] } as unknown as MemberDayModel
    expect(choresFor(model).map((r) => r.title)).toEqual(['Bins out', 'Laundry'])
  })
})

describe('kidsFor — what an adult wants to know about each child', () => {
  it('gives each kid their special and the handoff this adult is driving', () => {
    const items = [
      item({ title: 'Specials — Ella: Visual Art · Kaleb: PE', allDay: true }),
      item({ title: 'Ella & Kaleb to FFG', startTime: at(18, 30), endTime: at(18, 45), assignedTo: 's' }),
    ]
    expect(kidsFor(scott, members, sections(items))).toEqual([
      { id: 'e', name: 'Ella', special: 'Visual Art', handoff: '6:30 Ella & Kaleb to FFG' },
      { id: 'k', name: 'Kaleb', special: 'PE', handoff: '6:30 Ella & Kaleb to FFG' },
    ])
  })
  it('a handoff someone else is driving is not mine', () => {
    const items = [item({ title: 'Pick up Ella from FFG', startTime: at(17), endTime: at(17, 15), assignedTo: 'i' })]
    expect(kidsFor(scott, members, sections(items))[0].handoff).toBeNull()
  })
})
```

And in `wallStrip.test.ts`:

```ts
describe('adaptMemberComingUpRows — one person\'s next few days', () => {
  const scott = member('s', 'Scott')
  const ella = member('e', 'Ella')
  it('keeps only items attributed to the member, one line a day, three days', () => {
    const mk = (d: number, items: TimelineItem[]) => day(new Date(2026, 8, 7 + d), d === 0, items)
    const days = [
      mk(0, [item({ type: 'event', title: 'Today thing', assignedTo: 's' })]),
      mk(1, [item({ type: 'event', title: 'Wheelies', assignedTo: 's' }), item({ type: 'event', title: 'Ella: Library', assignedTo: 'e' })]),
      mk(2, [item({ type: 'routine', title: 'Brush teeth', assignedTo: 's' })]),
      mk(3, [item({ type: 'event', title: 'Bicycle Connection', assignedTo: 's' })]),
      mk(4, [item({ type: 'event', title: 'Far away', assignedTo: 's' })]),
    ]
    const rows = adaptMemberComingUpRows(days, scott, [scott, ella])
    expect(rows.map((r) => [r.dayLabel, r.summary])).toEqual([
      ['Tue', 'Wheelies'],
      ['Thu', 'Bicycle Connection'],
      ['Fri', 'Far away'],
    ])
  })
})
```
(Note: a day with nothing for the member is skipped, and the card fills to `limit` from the days that follow. `dayLabel` must match what `adaptComingUpRows` produces for the same date — copy its label code.)

- [ ] **Step 2: Run** — expected FAIL (module missing).

- [ ] **Step 3: Implement `memberPageModel.ts`**

```ts
// src/lib/wall/memberPageModel.ts
//
// Pure page model for the ADULT shape of the wall's person page, plus the
// two rules both shapes share (which shape, and the "Next:" line). The kid
// shape is kidDayModel's MemberDayModel; this file adds what a parent wants
// from their own page — appointments, chores, the kids — without touching the
// checklist model a kid's page is built on.
//
// PURE: no React, no clock reads beyond the `now` passed in.

import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { MemberDayModel, KidRow } from './kidDayModel'
import { routineEarnsTheWall } from '@/lib/routineUtils'
import { ownersOf } from '@/components/wall-v2/wallLanes'
import { isHandoffEvent, matchesName, titleForMember, hasPerPersonSegments, withoutMemberList } from '@/components/wall-v2/wallEventAttribution'

export type MemberShape = 'kid' | 'adult'

/** The Shell's rule for "a parent" (WallV2Shell parents roster), reused. */
export function memberShape(m: FamilyMember): MemberShape {
  return m.role_label === 'parent' || m.is_full_user ? 'adult' : 'kid'
}

export interface AppointmentRow {
  id: string
  /** "4:00" — the hour large on the page; am/pm is obvious on a wall. */
  time: string
  title: string
  /** Location or nothing. */
  detail: string | null
  past: boolean
  free: boolean
}

function clock(d: Date): string {
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function all(items: Record<DaySection, TimelineItem[]>): TimelineItem[] {
  return (Object.values(items) as TimelineItem[][]).flat()
}

/** Timed items on this person's day, clock order. Rhythm routines never qualify. */
export function appointmentsFor(
  member: FamilyMember, members: FamilyMember[], todayItems: Record<DaySection, TimelineItem[]>, now: Date,
): AppointmentRow[] {
  return all(todayItems)
    .filter((it) => !!it.startTime && !it.allDay && !it.completed)
    .filter((it) => it.type !== 'routine' || routineEarnsTheWall(it.recurrencePattern))
    .filter((it) => it.type === 'routine' && it.originalRoutine?.parent_routine_id != null ? false : true)
    .filter((it) => ownersOf(it, members).includes(member.id))
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())
    .map((it) => ({
      id: it.id,
      time: clock(it.startTime!),
      title: withoutMemberList(titleForMember(it.title, member.name), members),
      detail: it.location?.trim() || null,
      past: (it.endTime ?? it.startTime!).getTime() <= now.getTime(),
      free: !!it.isFree,
    }))
}

/** "Next: Dentist 4:00 · then FFG 6:30" — the header's one line. */
export function nextLine(appointments: AppointmentRow[]): string | null {
  const ahead = appointments.filter((a) => !a.past)
  if (ahead.length === 0) return null
  const first = `Next: ${ahead[0].title} ${ahead[0].time}`
  return ahead.length > 1 ? `${first} · then ${ahead[1].title} ${ahead[1].time}` : first
}

const BAND_ORDER = ['morning', 'afternoon', 'evening', 'anytime'] as const

/**
 * An adult's Chores: the routine rows the day model already resolved for
 * them (rare or not — a parent's own checklist is theirs to keep) plus their
 * untimed tasks. A timed task is an appointment and lives in that column.
 */
export function choresFor(model: MemberDayModel): KidRow[] {
  const out: KidRow[] = []
  for (const band of BAND_ORDER) {
    for (const row of model.bands[band]) {
      if (row.entityType === 'task' && row.timeOfDay) continue
      out.push(row)
    }
  }
  return out
}

export interface KidLine {
  id: string
  name: string
  special: string | null
  /** "6:30 Ella & Kaleb to FFG" when this adult is driving a handoff naming the kid. */
  handoff: string | null
}

const SPECIALS = /^specials?\b/i

export function kidsFor(adult: FamilyMember, members: FamilyMember[], todayItems: Record<DaySection, TimelineItem[]>): KidLine[] {
  const items = all(todayItems)
  return members
    .filter((m) => memberShape(m) === 'kid')
    .map((kid) => {
      const rotation = items.find((it) =>
        it.type === 'event' && !!it.allDay && (SPECIALS.test(it.title) || hasPerPersonSegments(it.title, members)) && matchesName(it.title, kid.name))
      const drive = items
        .filter((it) => it.type === 'event' && !!it.startTime && !it.allDay && !it.completed
          && isHandoffEvent(it.title) && matchesName(it.title, kid.name)
          && ownersOf(it, members).includes(adult.id))
        .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())[0]
      return {
        id: kid.id,
        name: kid.name,
        special: rotation ? titleForMember(rotation.title, kid.name) : null,
        handoff: drive ? `${clock(drive.startTime!)} ${drive.title}` : null,
      }
    })
}
```

Check `ownersOf` handles an event with `assignedTo` and no calendar id: it calls `attributeEvent({title, calendar_id: undefined, calendarId: undefined}, members, assignedTo)`. Read `attributeEvent` (`wallEventAttribution.ts:100`) — if it returns `[]` for an assigned event with no calendar, fall back: `const owners = ownersOf(it, members); return owners.length ? owners : (it.assignedTo ? [it.assignedTo] : [])`. Write a small local `ownersOrAssignee` helper and use it in both places.

`isHandoffEvent` regex: "Ella & Kaleb to FFG" may not match (check `wallEventAttribution.ts:223`). If it only matches walk/pick up/drop off, extend the test title to `'Drop off Ella & Kaleb at FFG'` rather than widening the regex.

In `wallStrip.ts` add:

```ts
/**
 * One person's next few days, one line each. Same shape as the strip's card,
 * scoped by attribution: an adult's page should not list the kids' Specials.
 * Days with nothing for this person are skipped, so three lines are three
 * pieces of news, not two blanks and a line.
 */
export function adaptMemberComingUpRows(
  days: WallDayData[], member: FamilyMember, members: FamilyMember[], limit = 3,
): ComingUpRow[] {
  const out: ComingUpRow[] = []
  for (const d of days.filter((x) => !x.isToday)) {
    const titles = new Set<string>()
    for (const it of Object.values(d.items).flat()) {
      if (it.completed || it.type === 'routine') continue
      const owners = ownersOf(it, members)
      const mine = owners.length ? owners.includes(member.id) : it.assignedTo === member.id
      if (!mine) continue
      const t = withoutMemberList(titleForMember(withoutKindPrefix(it.title.trim(), members), member.name), members)
      if (t) titles.add(t)
    }
    if (titles.size === 0) continue
    out.push({ dateKey: toKey(d.date), dayLabel: DAY_NAMES[d.date.getDay()], summary: [...titles].slice(0, 2).join(JOIN) })
    if (out.length >= limit) break
  }
  return out
}
```
Use whatever `dateKey`/`dayLabel` helpers `adaptComingUpRows` already uses in this file (read the rest of the function, lines 140–180) so both cards label a day identically. Import `ownersOf` from `./wallLanes` and `titleForMember, withoutMemberList` from `./wallEventAttribution`.

- [ ] **Step 4: Run** — `npx vitest run src/lib/wall/memberPageModel.test.ts src/components/wall-v2/wallStrip.test.ts`. Expected: PASS. `npx tsc -p tsconfig.app.json --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wall/memberPageModel.ts src/lib/wall/memberPageModel.test.ts src/components/wall-v2/wallStrip.ts src/components/wall-v2/wallStrip.test.ts
git commit -m "feat(wall): memberPageModel — the adult shape of a person's day, pure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

---

### Task 7: Widget components

**Files:**
- Create: `src/components/wall-v2/member/Widget.tsx`
- Create: `src/components/wall-v2/member/AppointmentsWidget.tsx`
- Create: `src/components/wall-v2/member/KidsWidget.tsx`
- Create: `src/components/wall-v2/member/ComingUpWidget.tsx`
- Create: `src/components/wall-v2/member/DinnerWidget.tsx`
- Create: `src/components/wall-v2/member/widgets.test.tsx`

**Interfaces (produced):**

```tsx
export function Widget({ title, icon: Icon, className, children }: { title: string; icon: LucideIcon; className?: string; children: React.ReactNode })
export function AppointmentsWidget({ rows }: { rows: AppointmentRow[] })
export function KidsWidget({ kids, onOpenKid }: { kids: KidLine[]; onOpenKid: (id: string) => void })
export function ComingUpWidget({ rows }: { rows: ComingUpRow[] })
export function DinnerWidget({ tonight, onOpen }: { tonight: string | null; onOpen?: () => void })
```

- [ ] **Step 1: Failing tests**

```tsx
// src/components/wall-v2/member/widgets.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AppointmentsWidget } from './AppointmentsWidget'
import { KidsWidget } from './KidsWidget'
import { ComingUpWidget } from './ComingUpWidget'
import { DinnerWidget } from './DinnerWidget'

describe('AppointmentsWidget', () => {
  it('lists the hour large with the title, a location beneath, and says so when empty', () => {
    render(<AppointmentsWidget rows={[{ id: 'a', time: '4:00', title: 'Dentist', detail: 'Main St', past: false, free: false }]} />)
    expect(screen.getByText('4:00')).toBeInTheDocument()
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText('Main St')).toBeInTheDocument()
  })
  it('says the day is clear when there is nothing', () => {
    render(<AppointmentsWidget rows={[]} />)
    expect(screen.getByText('Nothing on the clock today')).toBeInTheDocument()
  })
})

describe('KidsWidget', () => {
  it('one tappable row per kid: special, and the handoff I am driving', () => {
    const onOpenKid = vi.fn()
    render(<KidsWidget kids={[{ id: 'e', name: 'Ella', special: 'Visual Art', handoff: '6:30 Ella & Kaleb to FFG' }, { id: 'k', name: 'Kaleb', special: null, handoff: null }]} onOpenKid={onOpenKid} />)
    screen.getByRole('button', { name: /Open Ella's day/ }).click()
    expect(onOpenKid).toHaveBeenCalledWith('e')
    expect(screen.getByText('Visual Art')).toBeInTheDocument()
    expect(screen.getByText('6:30 Ella & Kaleb to FFG')).toBeInTheDocument()
    expect(screen.getByText('Nothing special')).toBeInTheDocument()
  })
})

describe('ComingUpWidget', () => {
  it('one line a day', () => {
    render(<ComingUpWidget rows={[{ dateKey: '2026-09-09', dayLabel: 'Wed', summary: 'Wheelies' }]} />)
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Wheelies')).toBeInTheDocument()
  })
})

describe('DinnerWidget', () => {
  it('names tonight and opens the recipe', () => {
    const onOpen = vi.fn()
    render(<DinnerWidget tonight="Tacos" onOpen={onOpen} />)
    screen.getByRole('button', { name: /Open recipe/ }).click()
    expect(onOpen).toHaveBeenCalled()
    expect(screen.getByText('Tacos')).toBeInTheDocument()
  })
  it('says nothing is planned without a button', () => {
    render(<DinnerWidget tonight={null} />)
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** — FAIL (modules missing).

- [ ] **Step 3: Implement**

`Widget.tsx`:
```tsx
// The one card treatment every widget on a person's page shares. A page of
// widgets reads as a system only when the frames are identical; the kiosk
// failure mode is "randomly stacked cards". Title row: icon + label in the
// wall's small caps. Body fills the rest and never scrolls.
import type { LucideIcon } from 'lucide-react'
import { WALL } from '../wallTheme'

export function Widget({ title, icon: Icon, className = '', children }: {
  title: string; icon: LucideIcon; className?: string; children: React.ReactNode
}) {
  return (
    <section className={`${WALL.card} p-4 flex flex-col min-h-0 min-w-0 overflow-hidden ${className}`}>
      <div className={`${WALL.label} shrink-0 mb-2 flex items-center gap-1.5`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
        {title}
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2">{children}</div>
    </section>
  )
}
```

`AppointmentsWidget.tsx`:
```tsx
import { CalendarClock } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { AppointmentRow } from '@/lib/wall/memberPageModel'

/** Rows that fit: 5 at 64px in a ~420px column. The model is already in clock order. */
const SHOWN = 5

export function AppointmentsWidget({ rows }: { rows: AppointmentRow[] }) {
  const shown = rows.slice(0, SHOWN)
  return (
    <Widget title="Appointments" icon={CalendarClock}>
      {shown.length === 0 && <p className={`text-[1.05rem] ${WALL.muted}`}>Nothing on the clock today</p>}
      {shown.map((r) => (
        <div key={r.id} className={`${WALL.cardInset} flex items-center gap-3 px-4 py-2 min-h-[64px] ${r.past ? 'opacity-50' : ''}`}>
          <span className={`font-display text-[1.6rem] leading-none tabular-nums w-[4.2rem] shrink-0 ${WALL.inkStrong}`}>{r.time}</span>
          <div className="min-w-0">
            <div className={`text-[1.1rem] font-bold leading-tight truncate ${r.free ? WALL.muted : WALL.inkStrong}`}>{r.title}</div>
            {r.detail && <div className={`text-[0.9rem] font-semibold truncate ${WALL.muted}`}>{r.detail}</div>}
          </div>
        </div>
      ))}
      {rows.length > SHOWN && <p className={`text-[0.85rem] font-bold ${WALL.muted}`}>and {rows.length - SHOWN} more</p>}
    </Widget>
  )
}
```

`KidsWidget.tsx`:
```tsx
import { Users } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { KidLine } from '@/lib/wall/memberPageModel'

/** Each child is a tap (≥ 64px) that opens their own page — one level deep, no deeper. */
export function KidsWidget({ kids, onOpenKid }: { kids: KidLine[]; onOpenKid: (id: string) => void }) {
  return (
    <Widget title="The kids" icon={Users}>
      {kids.map((k) => (
        <button key={k.id} type="button" onClick={() => onOpenKid(k.id)} aria-label={`Open ${k.name}'s day`}
          className={`${WALL.cardInset} flex items-center gap-3 px-4 py-2 min-h-[64px] text-left active:scale-[.98] transition-transform`}>
          <span className={`font-display text-[1.3rem] w-[5.5rem] shrink-0 truncate ${WALL.inkStrong}`}>{k.name}</span>
          <div className="min-w-0">
            <div className={`text-[1.05rem] font-bold truncate ${k.special ? WALL.inkStrong : WALL.muted}`}>{k.special ?? 'Nothing special'}</div>
            {k.handoff && <div className={`text-[0.9rem] font-semibold truncate ${WALL.warn}`}>{k.handoff}</div>}
          </div>
        </button>
      ))}
    </Widget>
  )
}
```

`ComingUpWidget.tsx`:
```tsx
import { CalendarDays } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { ComingUpRow } from '../wallStrip'

export function ComingUpWidget({ rows }: { rows: ComingUpRow[] }) {
  return (
    <Widget title="Coming up" icon={CalendarDays}>
      {rows.length === 0 && <p className={`text-[1rem] ${WALL.muted}`}>Clear ahead</p>}
      {rows.map((r) => (
        <div key={r.dateKey} className="flex items-baseline gap-3 min-w-0">
          <span className={`text-[0.95rem] font-bold uppercase tracking-wide shrink-0 w-[3.2rem] ${WALL.muted}`}>{r.dayLabel}</span>
          <span className={`text-[1.05rem] font-semibold leading-tight truncate ${WALL.ink}`}>{r.summary}</span>
        </div>
      ))}
    </Widget>
  )
}
```

`DinnerWidget.tsx`:
```tsx
import { UtensilsCrossed, ChefHat } from 'lucide-react'
import { WALL } from '../wallTheme'

/** Tonight, and one big tap into the recipe the wall already knows how to show. */
export function DinnerWidget({ tonight, onOpen }: { tonight: string | null; onOpen?: () => void }) {
  return (
    <section className={`${WALL.dinnerCard} p-4 flex flex-col min-h-0 overflow-hidden`}>
      <div className={`${WALL.dinnerLabel} shrink-0 mb-2 flex items-center gap-1.5`}>
        <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
        Dinner
      </div>
      <div className={`font-display text-[1.6rem] leading-tight truncate ${tonight ? WALL.inkStrong : WALL.warn}`}>{tonight ?? 'Nothing planned'}</div>
      {tonight && onOpen && (
        <button type="button" onClick={onOpen} aria-label="Open recipe"
          className={`mt-auto ${WALL.card} min-h-[56px] flex items-center justify-center gap-2 font-bold text-[1.05rem] active:scale-[.98] transition-transform`}>
          <ChefHat className="w-5 h-5" aria-hidden="true" />Open recipe
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run** — `npx vitest run src/components/wall-v2/member`. Expected: PASS. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/member
git commit -m "feat(wall): person-page widgets — appointments, the kids, coming up, dinner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
```

---

### Task 8: `KidDayView` becomes the widget grid (kid + adult), Shell wires it

**Files:**
- Modify: `src/components/wall-v2/KidDayView.tsx`
- Modify: `src/components/wall-v2/KidDayView.test.tsx`
- Modify: `src/components/wall-v2/WallV2Shell.tsx` (the `<KidDayView …>` block at ~line 930)

**Interfaces:**
- `KidDayViewProps` gains: `days: WallDayData[]`, `tonight: string | null`, `onOpenDinner?: () => void`, `onOpenMember?: (id: string) => void`, `now?: Date` (default `new Date()`; tests pass a fixed one).
- Consumes `memberShape`, `appointmentsFor`, `nextLine`, `choresFor`, `kidsFor` (Task 6), `adaptMemberComingUpRows` (Task 6), widgets (Task 7).

Layout (both shapes), inside the existing full-screen root, header ~88px, grid fills the rest with `px-6 pb-6`:

```
grid-cols-[1fr_1fr_1fr] grid-rows-[1fr_1fr_auto] gap-3, h-full
  col 1, rows 1-3  : LIST  (kid: MY DAY; adult: APPOINTMENTS)
  col 2, row 1     : kid HOMEWORK      / adult CHORES
  col 3, row 1     : kid TODAY AT SCHOOL / adult THE KIDS
  col 2, row 2     : kid READING       / adult NEEDED TODAY
  col 3, row 2     : kid SCREEN TIME   / adult DINNER
  cols 2-3, row 3  : COMING UP
```
Only the LIST column scrolls internally (`overflow-y-auto` + the existing `useDragScroll`), and the checklist is what a kid works through; everything else is capped by its adapter. Widgets that have nothing to show still render with their empty line, so the grid never has holes.

- [ ] **Step 1: Failing tests** (append to `KidDayView.test.tsx`; reuse its mocks and helpers)

```tsx
describe('the adult page', () => {
  const SCOTT = { id: 'p-1', name: 'Scott', role_label: 'parent', is_full_user: true } as FamilyMember
  const base = () => ({
    routines: [] as Routine[], todayItems: emptySections<TimelineItem>(), members: [SCOTT, KID],
    neededTasks: [] as Task[], homeworkTasks: [] as Task[], notices: [] as WallNotice[], screenTime: null, weather: null,
    days: [] as WallDayData[], tonight: 'Tacos', onToggleTask: vi.fn(), onClose: vi.fn(),
  })

  it('shows Appointments, Chores, The kids, Needed today, Dinner and Coming up — and no reading card', () => {
    render(<KidDayView member={SCOTT} {...base()} />)
    for (const t of ['Appointments', 'Chores', 'The kids', 'Needed today', 'Dinner', 'Coming up']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
    expect(screen.queryByText('Reading')).toBeNull()
    expect(screen.getByText('Tacos')).toBeInTheDocument()
  })

  it('a timed event on my day is an appointment and feeds the Next line', () => {
    const items = emptySections<TimelineItem>()
    items.afternoon.push({ id: 'e1', type: 'event', title: 'Dentist', startTime: new Date(2026, 8, 7, 16), endTime: new Date(2026, 8, 7, 17), completed: false, assignedTo: SCOTT.id } as TimelineItem)
    render(<KidDayView member={SCOTT} {...base()} todayItems={items} now={new Date(2026, 8, 7, 12)} />)
    expect(screen.getByText('Next: Dentist 4:00')).toBeInTheDocument()
    expect(screen.getByText('4:00')).toBeInTheDocument()
  })

  it('an untimed task assigned to me is a chore I can tick', () => {
    const onToggleTask = vi.fn()
    const items = emptySections<TimelineItem>()
    items.unscheduled.push(taskItem({ id: 'task-9', title: 'Buy rug', assignedTo: SCOTT.id }))
    render(<KidDayView member={SCOTT} {...base()} todayItems={items} onToggleTask={onToggleTask} />)
    fireEvent.click(screen.getByText('Buy rug'))
    expect(onToggleTask).toHaveBeenCalledWith('task-9', true)
  })

  it('tapping a kid opens their page', () => {
    const onOpenMember = vi.fn()
    render(<KidDayView member={SCOTT} {...base()} onOpenMember={onOpenMember} />)
    fireEvent.click(screen.getByRole('button', { name: /Open Kaleb's day/ }))
    expect(onOpenMember).toHaveBeenCalledWith(KID.id)
  })
})

describe('the kid page keeps its furniture', () => {
  it('shows My day, Homework, Today at school, Coming up', () => {
    render(<KidDayView member={KID} routines={[]} todayItems={emptySections<TimelineItem>()} members={[KID]} neededTasks={[]} homeworkTasks={[]} notices={[]} screenTime={null} weather={null} days={[]} tonight={null} onToggleTask={vi.fn()} onClose={vi.fn()} />)
    for (const t of ['My day', 'Homework', 'Today at school', 'Coming up']) expect(screen.getByText(t)).toBeInTheDocument()
  })
})
```
Import `WallDayData` type from `@/hooks/useWallData`. The existing kid tests need `days={[]}` and `tonight={null}` added to every `<KidDayView …>` render — do that with a search-and-replace in the file.

- [ ] **Step 2: Run** — `npx vitest run src/components/wall-v2/KidDayView.test.tsx`. Expected: FAIL (unknown props / missing text).

- [ ] **Step 3: Implement in `KidDayView.tsx`**

1. Props: add `days: WallDayData[]; tonight: string | null; onOpenDinner?: () => void; onOpenMember?: (id: string) => void; now?: Date` to `KidDayViewProps`. Import `WallDayData` type; import `memberShape, appointmentsFor, nextLine, choresFor, kidsFor` from `@/lib/wall/memberPageModel`; `adaptMemberComingUpRows` from `./wallStrip`; the four widgets and `Widget` from `./member/*`; icons `ListChecks, ShoppingBag, GraduationCap, BookOpen, Tv`.
2. Replace the `const clock = new Date()` in the model memo with `const clock = now ?? new Date()` (add `now` to deps).
3. After `model`, compute:

```tsx
  const shape = memberShape(member)
  const appointments = useMemo(() => appointmentsFor(member, members, todayItems, now ?? new Date()), [member, members, todayItems, now])
  const next = nextLine(appointments)
  const chores = useMemo(() => choresFor(model), [model])
  const kids = useMemo(() => kidsFor(member, members, todayItems), [member, members, todayItems])
  const comingUp = useMemo(() => adaptMemberComingUpRows(days, member, members), [days, member, members])
```
4. Header: keep back button, name, weekday and the weather chip; add under the name, in place of nothing: `{next && <div className={`text-[1.05rem] font-bold ${WALL.inkStrong}`}>{next}</div>}` (below the `WALL.label` weekday).
5. Wrap the existing cards in `Widget` frames so they share one treatment: `homeworkCard` → `<Widget title="Homework" icon={BookOpen}>…rows…</Widget>` (render even when empty with `<p className={WALL.muted}>Nothing due</p>`); `schoolCard` + `noticesCard` merge into one `<Widget title="Today at school" icon={GraduationCap}>` that shows the special (large serif, as today), the pickup line, the tomorrow line, then notices as `cardInset` rows (cap 2); `readingCard` keeps its body but its outer card becomes `<Widget title="Reading" icon={BookOpen}>`; `screenCard` becomes `<Widget title="Screen time" icon={Tv}>` keeping its number; `needed` becomes `<Widget title="Needed today" icon={ShoppingBag}>` (render even when empty: "Nothing needed").
6. The list column: kid = `<Widget title="My day" icon={ListChecks} className="row-span-3">` containing the existing `collections` + banded `renderRow` output inside `<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">`; adult = `<AppointmentsWidget rows={appointments} />` with `className` support added via a wrapper `<div className="row-span-3 min-h-0 flex">` (or add an optional `className` prop to `AppointmentsWidget` and pass `row-span-3`). Adult Chores = `<Widget title="Chores" icon={ListChecks}>` listing `chores.map(renderRow)` in a `min-h-0 overflow-y-auto` body.
7. Replace the old `<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 pb-10"> <div className="grid grid-cols-[3fr_2fr] …">` with:

```tsx
      <div className="flex-1 min-h-0 px-6 pb-6">
        <div className="h-full grid grid-cols-3 grid-rows-[1fr_1fr_auto] gap-3">
          {shape === 'kid' ? myDayWidget : appointmentsWidget}
          {shape === 'kid' ? homeworkWidget : choresWidget}
          {shape === 'kid' ? schoolWidget : <KidsWidget kids={kids} onOpenKid={(id) => onOpenMember?.(id)} />}
          {shape === 'kid' ? (readingWidget ?? neededWidget) : neededWidget}
          {shape === 'kid' ? (screenWidget ?? <ComingUpWidget rows={comingUp} />) : <DinnerWidget tonight={tonight} onOpen={onOpenDinner} />}
          <div className="col-span-2"><ComingUpWidget rows={comingUp} /></div>
        </div>
      </div>
```
If a kid has no reading target, the Reading cell shows Needed today and the Screen-time cell shows nothing extra (render `<div />` there, not a second Coming up: change the fifth cell to `(screenWidget ?? <div />)`). The `myDayWidget`/`appointmentsWidget` element carries `className="row-span-3"`.

8. `isEmpty` handling: inside the My day widget, when `model.isEmpty`, show the existing "Nothing on your list — go play." line instead of rows.

- [ ] **Step 4: Shell wiring** — in `WallV2Shell.tsx`'s `<KidDayView …>` block add:

```tsx
          days={wallData.days}
          tonight={selectedDinnerDay ? selectedDinnerDay.title : (dinnerEvent ? dinner.mealName : null)}
          onOpenDinner={handleTapDinnerCard}
          onOpenMember={handleTapGanttMember}
```

- [ ] **Step 5: Run** — `npx vitest run src/components/wall-v2/KidDayView.test.tsx src/components/wall-v2`. Expected: PASS (all existing kid tests still green). `npx tsc -p tsconfig.app.json --noEmit` clean. `npx eslint src/components/wall-v2 src/lib/wall` clean.

- [ ] **Step 6: Look at it.** Dev server at 1024x768 in Chrome, demo account: tap Ella → kid grid; back; tap Scott → adult grid; tap Ella from The kids widget → her page (one level). Check nothing overflows the frame and every tap target is ≥ 56px tall in the list, ≥ 64px elsewhere. Screenshots to `~/Documents/scotts-world/projects/symphony-os/assets/2026-09-07-wall-kid-page.png` and `…/2026-09-07-wall-adult-page.png`.

- [ ] **Step 7: Commit and push part 3**

```bash
git add src/components/wall-v2/KidDayView.tsx src/components/wall-v2/KidDayView.test.tsx src/components/wall-v2/WallV2Shell.tsx
git commit -m "feat(wall): the person page is a widget grid — kid and adult shapes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8"
npx vitest run src/components/wall-v2 src/lib/wall src/lib/routineEarnsTheWall.test.ts
npx tsc -p tsconfig.app.json --noEmit
git fetch origin && git rebase origin/main && git push origin HEAD:main
```
Record the hash.

---

### Task 9: Live check, vault note, report

- [ ] **Step 1:** After the third deploy, open `https://app.symphony-os.com/wall-v2` at 1024x768 (Chrome, real account) and take the three screenshots against the real family's data (board, one kid page, one adult page) into `~/Documents/scotts-world/projects/symphony-os/assets/` named `2026-09-07-wall-live-board.png`, `2026-09-07-wall-live-kid.png`, `2026-09-07-wall-live-adult.png`.
- [ ] **Step 2:** Append to the vault brief (`projects/symphony-os/briefs/2026-09-07-wall-high-value-and-person-pages.md`) a `# Shipped` section: three commit hashes, screenshot wikilinks (`![[2026-09-07-wall-live-board.png]]`), and anything the high-value rule hid that looked wrong on the real wall.
- [ ] **Step 3:** Write the auto-memory file `wall_high_value_board_and_person_pages_shipped.md` (type: project) and add its MEMORY.md line under Kitchen Kiosk.
- [ ] **Step 4:** `git worktree remove .worktrees/wall-high-value` once `origin/main` contains all three commits.
- [ ] **Step 5:** Report: three hashes, three screenshot paths, three bullets. Nothing more.
