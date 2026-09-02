# Homework and School Notices on the Wall — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A school-email homework item shows as a chip on the kid's board row until it is done, gets a checkbox on the kid's page, and the email's standing info lands in a "From school" card on that page.

**Architecture:** `homework` becomes a task category (DDL by Scott). The email extractor tags items and emits per-kid `notices` rows. `useWallData` adds two narrow queries; the board adapter and the kid page model each grow one pure, tested slice; the two React views render them. One shared `homeworkLabel.ts` keeps the board and the page saying the same "Fri".

**Tech Stack:** React 19 + TS strict, Vitest (`npx vitest run`, Node 22.14.0), Supabase (Deno edge functions), lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-02-wall-homework-and-school-notices-design.md`

## Global Constraints

- Work in `.worktrees/wall-homework` on branch `wall-homework`. Never edit the main worktree.
- `npx vitest run <file>` for tests; `npx tsc --noEmit -p tsconfig.app.json` for types (root `tsc --noEmit` is a no-op).
- No literal `scope: 'compound'` anywhere under `supabase/functions/**` — `scopeDefaultCoverage.test.ts` fails the build. `notices` carry no scope column.
- `KidDayView` must not add a DaySection sweep (`sectionCoverage.test.ts`).
- Wall rows: nothing variable-width between the name column and the track. Homework chips live inside `AnytimeArea`.
- lucide icons only, no emoji.
- Ship order: Scott runs DDL → deploy `extract-email --use-api` → push main.

---

### Task 1: `homework` category in the client types and by-hand paths

**Files:**
- Modify: `src/types/task.ts:26`
- Modify: `src/lib/quickInputParser.ts:15,86-100`
- Modify: `src/lib/rowSubtitle.ts:28-40`
- Modify: `src/components/triage/InboxTriageModal.tsx:29-35`
- Modify: `supabase/migrations/2026-09-02_homework_category.sql` (create)
- Test: `src/lib/quickInputParser.test.ts`

**Produces:** `TaskCategory` includes `'homework'`; `parseQuickInput('hw: return blue sheet')` → `category: 'homework'`.

- [ ] **Step 1: Failing test** — append to `src/lib/quickInputParser.test.ts` inside the existing category-prefix describe:

```ts
  it('hw: and homework: prefixes set the homework category', () => {
    expect(parseQuickInput('hw: return blue sheet', mockContext).category).toBe('homework')
    expect(parseQuickInput('homework: reading log', mockContext).category).toBe('homework')
    expect(parseQuickInput('hw: return blue sheet', mockContext).title).toBe('return blue sheet')
  })
```

- [ ] **Step 2:** `npx vitest run src/lib/quickInputParser.test.ts` → FAIL (category undefined).
- [ ] **Step 3: Implement.** `src/types/task.ts`: `export type TaskCategory = 'task' | 'chore' | 'errand' | 'event' | 'activity' | 'homework'`. `quickInputParser.ts` line 15: add `| 'homework'`; in `categoryPrefixes` add `'homework:': 'homework'` and `'hw:': 'homework'`. `rowSubtitle.ts`: `case 'homework': return 'Homework'`. `InboxTriageModal.tsx` CATEGORIES: add `{ value: 'homework', label: 'Homework', icon: 'task', description: 'For a kid to do and hand in', color: 'green' }`. Create the migration file:

```sql
-- homework joins tasks.category. The constraint was auto-named by 028_task_category.sql.
alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('task','chore','errand','event','activity','homework'));
```

- [ ] **Step 4:** test passes; `npx tsc --noEmit -p tsconfig.app.json` clean.
- [ ] **Step 5: Commit** `feat(tasks): homework category + hw: prefix`.

---

### Task 2: `homeworkLabel.ts` — one due-label function

**Files:**
- Create: `src/lib/wall/homeworkLabel.ts`
- Test: `src/lib/wall/homeworkLabel.test.ts`

**Produces:**
```ts
export function homeworkDue(neededOn: Date | undefined, now: Date): { label: string | null; late: boolean }
export function homeworkSortKey(t: { neededOn?: Date; title: string }, now: Date): [number, number, string]
export function sortHomework<T extends { neededOn?: Date; title: string }>(tasks: T[], now: Date): T[]
```

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { homeworkDue, sortHomework } from './homeworkLabel'

const NOW = new Date(2026, 8, 2, 15, 0) // Wed Sep 2 2026, 3pm
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('homeworkDue', () => {
  it('undated → no label, not late', () => expect(homeworkDue(undefined, NOW)).toEqual({ label: null, late: false }))
  it('today', () => expect(homeworkDue(d(2026, 9, 2), NOW)).toEqual({ label: 'Today', late: false }))
  it('tomorrow', () => expect(homeworkDue(d(2026, 9, 3), NOW)).toEqual({ label: 'Tomorrow', late: false }))
  it('within six days → short weekday', () => expect(homeworkDue(d(2026, 9, 4), NOW)).toEqual({ label: 'Fri', late: false }))
  it('seven days out → month-day', () => expect(homeworkDue(d(2026, 9, 9), NOW)).toEqual({ label: 'Sep 9', late: false }))
  it('yesterday → Late', () => expect(homeworkDue(d(2026, 9, 1), NOW)).toEqual({ label: 'Late', late: true }))
})

describe('sortHomework', () => {
  it('late first, then dated ascending, undated last, ties by title', () => {
    const rows = [
      { title: 'B undated' }, { title: 'A undated' },
      { title: 'Fri', neededOn: d(2026, 9, 4) }, { title: 'Late', neededOn: d(2026, 8, 30) },
      { title: 'Today', neededOn: d(2026, 9, 2) },
    ]
    expect(sortHomework(rows, NOW).map((r) => r.title)).toEqual(['Late', 'Today', 'Fri', 'A undated', 'B undated'])
  })
})
```

- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: Implement**

```ts
// One place that says when homework is due, so the board chip and the kid
// page can never disagree about "Fri". Pure; `now` is passed in.
import { isSameDay, addDays } from '@/lib/dateUtils'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function homeworkDue(neededOn: Date | undefined, now: Date): { label: string | null; late: boolean } {
  if (!neededOn) return { label: null, late: false }
  const today = dayStart(now)
  const due = dayStart(neededOn)
  if (due < today) return { label: 'Late', late: true }
  if (isSameDay(due, today)) return { label: 'Today', late: false }
  if (isSameDay(due, addDays(today, 1))) return { label: 'Tomorrow', late: false }
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days <= 6) return { label: WEEKDAY[due.getDay()], late: false }
  return { label: `${MONTH[due.getMonth()]} ${due.getDate()}`, late: false }
}

export function homeworkSortKey(t: { neededOn?: Date; title: string }, now: Date): [number, number, string] {
  const { late } = homeworkDue(t.neededOn, now)
  return [late ? 0 : t.neededOn ? 1 : 2, t.neededOn ? dayStart(t.neededOn).getTime() : 0, t.title]
}

export function sortHomework<T extends { neededOn?: Date; title: string }>(tasks: T[], now: Date): T[] {
  return [...tasks].sort((a, b) => {
    const ka = homeworkSortKey(a, now), kb = homeworkSortKey(b, now)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
  })
}
```

Check `isSameDay` and `addDays` exist in `@/lib/dateUtils` (kidDayModel already imports `isSameDay` from there; useWallData imports `addDays`).

- [ ] **Step 4:** tests pass.
- [ ] **Step 5: Commit** `feat(wall): homeworkLabel — one due label for board and page`.

---

### Task 3: `useWallData` — homework and notices queries

**Files:**
- Modify: `src/hooks/useWallData.ts` (query list ~line 195-291, `dataError` ~300, commit ~485, return ~537, interface ~85-115)
- Create: `supabase/migrations/2026-09-02_notices.sql`

**Produces:**
```ts
export interface WallNotice { id: string; familyMemberId: string | null; text: string; senderLabel: string | null; receivedOn: Date }
// WallData gains:
homeworkTasks: Task[]
notices: WallNotice[]
```

No unit test (the hook is untested today; it's a straight query). Verified by `tsc` and the live wall.

- [ ] **Step 1: Migration file**

```sql
-- Standing info from a school email, addressed to a kid (or everyone).
-- Surfaced on the wall's per-kid page for 14 days; never deleted by age.
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references family_members(id) on delete cascade, -- null = everyone
  text text not null,
  sender_label text,
  received_on date not null default current_date,
  capture_id uuid references captures(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists notices_user_received_idx on notices (user_id, received_on desc);
alter table notices enable row level security;
create policy "Users can view household notices" on notices for select
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
create policy "Users can create own notices" on notices for insert
  with check (auth.uid() = user_id);
create policy "Users can delete household notices" on notices for delete
  using (auth.uid() = user_id or users_share_household(auth.uid(), user_id));
```

- [ ] **Step 2: Hook.** Add the type + fields to the exported interface with doc comments. Add state `homeworkTasks`, `notices`. In the `Promise.all` after `neededRes` add `homeworkRes`, `noticesRes`:

```ts
        // 14. Open homework, any date. A homework chip sits on the kid's row
        // from the day it arrives until it is checked off — "until done" is
        // the whole point, so there is deliberately no date filter.
        supabase
          .from('tasks')
          .select(TASK_COLUMNS)
          .eq('completed', false)
          .eq('context', 'family')
          .eq('category', 'homework'),

        // 15. Standing info from school, last 14 days. Aged by query, never
        // deleted — the rows are the record.
        supabase
          .from('notices')
          .select('id, family_member_id, text, sender_label, received_on')
          .gte('received_on', localYmd(addDays(new Date(), -14)))
          .order('received_on', { ascending: false }),
```

Add both to the `dataError` array. Map:

```ts
      const homework: Task[] = (homeworkRes.data || []).map(rowToTask)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noticeRows: WallNotice[] = (noticesRes.data || []).map((n: any) => ({
        id: n.id, familyMemberId: n.family_member_id ?? null, text: n.text,
        senderLabel: n.sender_label ?? null, receivedOn: parseLocalYmd(n.received_on),
      }))
```

Set inside `if (commitData)`; return them.

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.app.json` clean; `npx vitest run src/hooks` green.
- [ ] **Step 4: Commit** `feat(wall): fetch open homework and 14 days of notices`.

---

### Task 4: Board adapter — homework chips per track

**Files:**
- Modify: `src/components/wall-v2/wallGantt.ts` (`GanttTrack`, `adaptGanttBoard` signature + per-track build)
- Test: `src/components/wall-v2/wallGantt.test.ts`

**Produces:** `GanttTrack.homework: GanttHomework[]` where `export interface GanttHomework { id: string; label: string; late: boolean }`; `adaptGanttBoard(members, days, now, trackPx = TRACK_PX, homework: Task[] = [])`.

- [ ] **Step 1: Failing tests** — append to `wallGantt.test.ts`:

```ts
import type { Task } from '@/types/task'
import { HOUSEHOLD_ID } from './wallEventAttribution'

const hw = (o: Partial<Task>): Task =>
  ({ id: Math.random().toString(36).slice(2), title: 'Blue sheet', completed: false, category: 'homework',
     context: 'family', createdAt: at(0), updatedAt: at(0), ...o }) as Task

describe('adaptGanttBoard — homework chips', () => {
  const members = [member('k1', 'Kaleb'), member('k2', 'Ella')]
  const now = at(15) // Sun Aug 23 2026

  it('lands on the assignee track with a due label, and nowhere else', () => {
    const board = adaptGanttBoard(members, [day([])], now, TRACK_PX, [
      hw({ assignedTo: 'k1', neededOn: new Date(2026, 7, 28) }),
    ])
    const kaleb = board.tracks.find((t) => t.memberId === 'k1')!
    const ella = board.tracks.find((t) => t.memberId === 'k2')!
    expect(kaleb.homework).toEqual([{ id: expect.any(String), label: 'Blue sheet · Fri', late: false }])
    expect(ella.homework).toEqual([])
    expect(kaleb.anytime).toEqual([])
  })

  it('an unassigned or unknown assignee falls to the household row', () => {
    const board = adaptGanttBoard(members, [day([])], now, TRACK_PX, [
      hw({ title: 'Nobody' }), hw({ title: 'Stranger', assignedTo: 'zz' }),
    ])
    const house = board.tracks.find((t) => t.memberId === HOUSEHOLD_ID)!
    expect(house.homework.map((h) => h.label)).toEqual(['Nobody', 'Stranger'])
  })

  it('orders late, then by date, then undated', () => {
    const board = adaptGanttBoard(members, [day([])], now, TRACK_PX, [
      hw({ assignedTo: 'k1', title: 'Undated' }),
      hw({ assignedTo: 'k1', title: 'Fri', neededOn: new Date(2026, 7, 28) }),
      hw({ assignedTo: 'k1', title: 'Old', neededOn: new Date(2026, 7, 20) }),
    ])
    const kaleb = board.tracks.find((t) => t.memberId === 'k1')!
    expect(kaleb.homework.map((h) => [h.label, h.late])).toEqual([['Old · Late', true], ['Fri · Fri', false], ['Undated', false]])
  })
})
```

- [ ] **Step 2:** run → FAIL (`homework` undefined on track).
- [ ] **Step 3: Implement.** In `wallGantt.ts`: import `Task`, `homeworkDue`, `sortHomework`. Add the interface and field with a doc comment ("Open homework for this person, until it is done. A separate array from `anytime` so the day's chips keep their cap and order."). Change the signature. Before `roster.map`:

```ts
  const memberIds = new Set(members.map((m) => m.id));
  const homeworkByTrack = new Map<string, Task[]>();
  for (const t of homework) {
    if (t.completed) continue;
    const key = t.assignedTo && memberIds.has(t.assignedTo) ? t.assignedTo : HOUSEHOLD_ID;
    (homeworkByTrack.get(key) ?? homeworkByTrack.set(key, []).get(key)!).push(t);
  }
```

In the returned track object:

```ts
      homework: sortHomework(homeworkByTrack.get(m.id) ?? [], now).map((t) => {
        const due = homeworkDue(t.neededOn, now);
        return { id: t.id, label: due.label ? `${t.title} · ${due.label}` : t.title, late: due.late };
      }),
```

- [ ] **Step 4:** tests pass; `tsc` clean (WallV2Gantt.test's `track()` fixture needs `homework: []` — add it).
- [ ] **Step 5: Commit** `feat(wall): homework chips on the board adapter`.

---

### Task 5: Board renderer — homework chips, tappable

**Files:**
- Modify: `src/components/wall-v2/WallV2Gantt.tsx` (`AnytimeArea`, `Track`)
- Modify: `src/components/wall-v2/WallV2Shell.tsx:467` (pass `wallData.homeworkTasks`)
- Test: `src/components/wall-v2/WallV2Gantt.test.tsx`

- [ ] **Step 1: Failing tests** — add `homework: []` to the `track()` fixture, then:

```ts
describe('WallV2Gantt homework chips', () => {
  it('renders a homework chip as a button that opens the kid page', async () => {
    const onTapMember = vi.fn()
    const b = board([track({ blocks: [], homework: [{ id: 'h1', label: 'Blue sheet · Fri', late: false }] })])
    const { user } = render(<WallV2Gantt board={b} onTapMember={onTapMember} />)
    await user.click(screen.getByRole('button', { name: "Open Ella's homework: Blue sheet · Fri" }))
    expect(onTapMember).toHaveBeenCalledWith('kid-1')
    expect(screen.queryByText('Nothing scheduled')).toBeNull()
  })

  it('household homework is not a button', () => {
    const b = board([track({ memberId: HOUSEHOLD_ID, name: 'Everyone', blocks: [], homework: [{ id: 'h1', label: 'Nobody', late: false }] })])
    render(<WallV2Gantt board={b} onTapMember={vi.fn()} />)
    expect(screen.getByText('Nobody')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /homework/ })).toBeNull()
  })

  it('caps at two chips and counts the rest', () => {
    const b = board([track({ blocks: [], homework: [
      { id: 'a', label: 'A', late: false }, { id: 'b', label: 'B', late: false }, { id: 'c', label: 'C', late: false },
    ] })])
    render(<WallV2Gantt board={b} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText('C')).toBeNull()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Constants: `const HOMEWORK_SHOWN = 2;`. Import `BookOpen` from lucide. New component:

```tsx
/**
 * A homework chip. Filled in the forest tone so it reads as "yours to do",
 * distinct from the sand-coloured specials beside it. On a person's row it
 * opens their page (where the checkbox lives — a chip on a TV is too small
 * to be one); the household row has no page, so there it is just words.
 */
function HomeworkChip({ chip, wide, name, onTap }: { chip: GanttHomework; wide: boolean; name: string; onTap?: () => void }) {
  const size = wide ? 'px-3 py-1 text-[0.95rem] max-w-[300px]' : 'px-2.5 py-0.5 text-[0.8rem] max-w-[220px]';
  const tone = chip.late
    ? 'bg-[#F6E3C9] dark:bg-[#4A3620] text-[#A8600F] dark:text-[#E0A959]'
    : 'bg-[#DCE8DE] dark:bg-[#2F4A3B] text-[#2E4638] dark:text-[#BFE3CF]';
  const cls = `inline-flex items-center gap-1.5 rounded-lg font-bold shrink min-w-0 ${tone} ${size}`;
  const body = (
    <>
      <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{chip.label}</span>
    </>
  );
  if (!onTap) return <span className={cls}>{body}</span>;
  return (
    <button type="button" onClick={onTap} aria-label={`Open ${name}'s homework: ${chip.label}`} className={cls}>
      {body}
    </button>
  );
}
```

`AnytimeArea` gains `name` and `onTapMember?: () => void` props; renders homework first:

```tsx
      {track.homework.slice(0, HOMEWORK_SHOWN).map((h) => (
        <HomeworkChip key={h.id} chip={h} wide={roomy} name={name} onTap={onTapMember} />
      ))}
      {track.homework.length > HOMEWORK_SHOWN && (
        <span className={`shrink-0 text-[0.9rem] font-bold ${WALL.muted}`}>+{track.homework.length - HOMEWORK_SHOWN}</span>
      )}
```

In `Track`: `const hasChips = track.anytime.length > 0 || track.laterCount > 0 || track.homework.length > 0;` and pass `name={track.name}` and `onTapMember={onTapMember && track.memberId !== HOUSEHOLD_ID ? () => onTapMember(track.memberId) : undefined}`.

Shell: `adaptGanttBoard(wallData.familyMembers, wallData.days, now, TRACK_PX, wallData.homeworkTasks)` (import `TRACK_PX` from `./wallGantt`), and add `wallData.homeworkTasks` to the memo deps.

- [ ] **Step 4:** tests pass; `tsc` clean.
- [ ] **Step 5: Commit** `feat(wall): homework chips on the board open the kid page`.

---

### Task 6: Kid page model — homework rows and notices

**Files:**
- Modify: `src/lib/wall/kidDayModel.ts`
- Test: `src/lib/wall/kidDayModel.test.ts`

**Produces:**
```ts
export interface KidHomeworkRow { id: string; title: string; due: string | null; late: boolean; notes: string | null }
export interface KidNoticeRow { id: string; text: string; senderLabel: string | null; receivedOn: Date }
// MemberDayModel gains homework: KidHomeworkRow[]; notices: KidNoticeRow[]
// buildMemberDayModel input gains homeworkTasks?: Task[]; notices?: WallNotice[] (default [])
```

- [ ] **Step 1: Failing tests** — extend `build()` to accept `homeworkTasks` and `notices` (optional trailing params), then:

```ts
describe('homework + notices', () => {
  it('lists open homework for the member, ordered, with due + notes', () => {
    const model = build([], [], {}, [], TODAY, [
      task({ id: 'h-undated', title: 'Reading log', category: 'homework' }),
      task({ id: 'h-late', title: 'Blue sheet', category: 'homework', neededOn: new Date('2026-08-28T00:00:00'), notes: 'Permission slip, $12' }),
      task({ id: 'h-other', title: 'Not mine', category: 'homework', assignedTo: 'kid-2' }),
      task({ id: 'h-done', title: 'Done', category: 'homework', completed: true }),
    ])
    expect(model.homework).toEqual([
      { id: 'h-late', title: 'Blue sheet', due: 'Late', late: true, notes: 'Permission slip, $12' },
      { id: 'h-undated', title: 'Reading log', due: null, late: false, notes: null },
    ])
    expect(model.isEmpty).toBe(false)
  })

  it('a homework task due today is NOT also a needed row', () => {
    const t = task({ id: 'h1', category: 'homework', neededOn: TODAY })
    const model = build([], [], {}, [t], TODAY, [t])
    expect(model.needed).toEqual([])
    expect(model.homework.map((h) => h.id)).toEqual(['h1'])
  })

  it('a homework task on the timeline is NOT also a band row', () => {
    const model = build([], [], { morning: [taskItem({ id: 'task-h1', title: 'HW', category: 'homework' })] }, [], TODAY,
      [task({ id: 'h1', title: 'HW', category: 'homework' })])
    expect(model.bands.morning).toEqual([])
    expect(model.homework).toHaveLength(1)
  })

  it('notices: mine or everyone, newest first; they never make the page non-empty', () => {
    const model = build([], [], {}, [], TODAY, [], [
      { id: 'n-old', familyMemberId: null, text: 'Old', senderLabel: 'School', receivedOn: new Date('2026-08-20T00:00:00') },
      { id: 'n-mine', familyMemberId: 'kid-1', text: 'PE is Tue/Thu', senderLabel: 'School', receivedOn: new Date('2026-08-29T00:00:00') },
      { id: 'n-other', familyMemberId: 'kid-2', text: 'Not mine', senderLabel: null, receivedOn: new Date('2026-08-29T00:00:00') },
    ])
    expect(model.notices.map((n) => n.id)).toEqual(['n-mine', 'n-old'])
    expect(model.isEmpty).toBe(true)
  })
})
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Import `WallNotice` type from `@/hooks/useWallData` and `homeworkDue`, `sortHomework`. Add the two interfaces, the model fields, the input fields (`homeworkTasks?: Task[]`, `notices?: WallNotice[]`). In the band loop: `if (item.type !== 'task' || item.category === 'homework') continue`. In the needed filter: `neededTasks.filter((t) => !t.completed && t.assignedTo === member.id && t.category !== 'homework')`. Then:

```ts
  // Homework: the card owns these rows. Order and label come from
  // homeworkLabel so the page and the board never disagree about "Fri".
  const mine = (homeworkTasks ?? []).filter((t) => !t.completed && t.assignedTo === member.id)
  const homework: KidHomeworkRow[] = sortHomework(mine, now).map((t) => {
    const due = homeworkDue(t.neededOn, now)
    return { id: t.id, title: t.title, due: due.label, late: due.late, notes: t.notes?.trim() || null }
  })

  // Notices: addressed to this member or to everyone. Newest first. They are
  // information, not work, so they never count toward isEmpty.
  const noticeRows: KidNoticeRow[] = (notices ?? [])
    .filter((n) => n.familyMemberId === null || n.familyMemberId === member.id)
    .sort((a, b) => b.receivedOn.getTime() - a.receivedOn.getTime() || a.text.localeCompare(b.text))
    .map((n) => ({ id: n.id, text: n.text, senderLabel: n.senderLabel, receivedOn: n.receivedOn }))
```

`isEmpty` adds `homework.length === 0 &&`. Return `{ needed, homework, notices: noticeRows, collections, bands, isEmpty }`.

- [ ] **Step 4:** tests pass (existing tests still pass since new inputs default to `[]`); `tsc` clean.
- [ ] **Step 5: Commit** `feat(wall): kid page model — homework rows + notices`.

---

### Task 7: Kid page view — Homework and From school cards

**Files:**
- Modify: `src/components/wall-v2/KidDayView.tsx`
- Modify: `src/components/wall-v2/WallV2Shell.tsx:812-820` (pass the two props)
- Test: `src/components/wall-v2/KidDayView.test.tsx`

- [ ] **Step 1: Failing tests** — extend `renderView` with `homeworkTasks?: Task[]` and `notices?: WallNotice[]`, then:

```ts
describe('Homework card', () => {
  it('renders rows with due text and checks off through onToggleTask', () => {
    const onToggleTask = vi.fn()
    renderView({ onToggleTask, homeworkTasks: [
      neededTask({ id: 'h1', title: 'Blue sheet', category: 'homework', neededOn: new Date() }),
    ] })
    expect(screen.getByText('Homework')).toBeInTheDocument()
    expect(screen.getByText('Due today')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Blue sheet done' }))
    expect(onToggleTask).toHaveBeenCalledWith('task-h1', true)
  })

  it('expands notes on title tap', () => {
    renderView({ homeworkTasks: [
      neededTask({ id: 'h1', title: 'Blue sheet', category: 'homework', neededOn: undefined, notes: 'Permission slip, $12' }),
    ] })
    expect(screen.queryByText('Permission slip, $12')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Blue sheet' }))
    expect(screen.getByText('Permission slip, $12')).toBeInTheDocument()
  })

  it('does not render the card without homework', () => {
    renderView({})
    expect(screen.queryByText('Homework')).toBeNull()
  })
})

describe('From school card', () => {
  it('renders notices with sender and date', () => {
    renderView({ notices: [
      { id: 'n1', familyMemberId: 'kid-1', text: 'PE is Tue/Thu', senderLabel: 'Hillside', receivedOn: new Date(2026, 8, 1) },
    ] })
    expect(screen.getByText('From school')).toBeInTheDocument()
    expect(screen.getByText('PE is Tue/Thu')).toBeInTheDocument()
    expect(screen.getByText('Hillside · Sep 1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Props gain `homeworkTasks: Task[]` and `notices: WallNotice[]`; pass to `buildMemberDayModel`; add `homeworkTasks` to the overlay-reset effect deps and the memo deps. Import `BookOpen`, `Mail` from lucide. Add:

```tsx
function dueText(row: KidHomeworkRow): string | null {
  if (!row.due) return null
  if (row.late) return 'Late'
  return row.due === 'Today' ? 'Due today' : `Due ${row.due}`
}

function noticeMeta(n: KidNoticeRow): string {
  const date = n.receivedOn.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return n.senderLabel ? `${n.senderLabel} · ${date}` : date
}
```

Rendering, first inside the non-empty branch (before "Needed today"), and the notices card after the bands (outside the `isEmpty` ternary so it shows either way):

```tsx
{model.homework.length > 0 && (
  <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
    <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
      <BookOpen className="w-5 h-5" aria-hidden="true" /> Homework
    </div>
    <div className="flex flex-col gap-2">
      {model.homework.map((row) => {
        const key = `task:${row.id}`
        const done = doneOverlay.has(key) ? doneOverlay.get(key)! : false
        const open = expanded.has(`homework:${row.id}`)
        const due = dueText(row)
        return (
          <div key={row.id} className={`${WALL.cardInset} flex flex-col`}>
            <div className="flex items-stretch">
              <button
                type="button"
                aria-label={`Mark ${row.title} ${done ? 'not done' : 'done'}`}
                onClick={() => handleTaskTap({ entityType: 'task', id: row.id, title: row.title, done, timeOfDay: null, target: null })}
                className="shrink-0 min-h-[56px] w-16 grid place-items-center"
              >
                <span aria-hidden="true" className={`w-6 h-6 rounded-full border-2 ${done ? 'bg-[#2E4638] border-[#2E4638] dark:bg-[#6DC4A7] dark:border-[#6DC4A7]' : 'border-[#8A7D68]'}`} />
              </button>
              <button
                type="button"
                aria-label={row.title}
                disabled={!row.notes}
                onClick={() => toggleExpand(`homework:${row.id}`)}
                className="flex-1 min-w-0 py-3 pr-4 text-left"
              >
                <div className={`text-[1.05rem] font-semibold ${done ? WALL.muted + ' line-through' : WALL.inkStrong}`}>{row.title}</div>
                {due && <div className={`text-[0.9rem] font-semibold ${row.late ? WALL.warn : WALL.muted}`}>{due}</div>}
              </button>
            </div>
            {open && row.notes && (
              <div className={`px-4 pb-4 pl-16 text-[0.95rem] whitespace-pre-line ${WALL.muted}`}>{row.notes}</div>
            )}
          </div>
        )
      })}
    </div>
  </div>
)}
```

```tsx
{model.notices.length > 0 && (
  <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
    <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
      <Mail className="w-5 h-5" aria-hidden="true" /> From school
    </div>
    <div className="flex flex-col gap-2">
      {model.notices.map((n) => (
        <div key={n.id} className={`${WALL.cardInset} px-4 py-3`}>
          <div className={`text-[1.05rem] font-semibold ${WALL.inkStrong}`}>{n.text}</div>
          <div className={`text-[0.85rem] ${WALL.muted}`}>{noticeMeta(n)}</div>
        </div>
      ))}
    </div>
  </div>
)}
```

Note `handleTaskTap` reads `row.done` through the overlay itself, so passing `done` from the overlay is consistent. Shell passes `homeworkTasks={wallData.homeworkTasks}` and `notices={wallData.notices}`.

- [ ] **Step 4:** tests pass; `tsc` clean; `npx vitest run src/components/wall-v2 src/lib/wall` green; `sectionCoverage` green.
- [ ] **Step 5: Commit** `feat(wall): Homework + From school cards on the kid page`.

---

### Task 8: Extraction — kind, detail, per-kid good_to_know

**Files:**
- Modify: `supabase/functions/extract-email/lib/types.ts`
- Modify: `supabase/functions/extract-email/lib/prompt.ts`
- Test: `supabase/functions/extract-email/lib/prompt.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('parseEmailExtraction — homework, detail, addressed good_to_know', () => {
  it('reads kind and detail on todos and items; unknown kind is a todo', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [{ title: 'Field trip', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Return permission slip', for: ['Liam'], needed: 'night_before', kind: 'homework', detail: 'Aquarium, $12' },
                { text: 'Pack lunch', for: 'everyone', needed: 'day_of', kind: 'what' }],
        source_quote: 'q', confidence: 0.9 }],
      todos: [{ title: 'Reading log', kind: 'homework', detail: 'omit', source_quote: 'q', confidence: 0.8 },
              { title: 'Pay fee', source_quote: 'q', confidence: 0.8 }],
      good_to_know: [], gaps: [],
    }))
    expect(r.events[0].items.map((i) => [i.kind, i.detail])).toEqual([['homework', 'Aquarium, $12'], ['todo', undefined]])
    expect(r.todos.map((t) => [t.kind, t.detail])).toEqual([['homework', undefined], ['todo', undefined]])
  })

  it('good_to_know accepts strings (everyone) and addressed objects', () => {
    const r = parseEmailExtraction(JSON.stringify({ events: [], todos: [], gaps: [],
      good_to_know: ['Early dismissal Friday', { text: 'PE is Tue/Thu', for: ['Liam'] }, { text: '' }, 7] }))
    expect(r.good_to_know).toEqual([{ text: 'Early dismissal Friday', for: 'everyone' }, { text: 'PE is Tue/Thu', for: ['Liam'] }])
  })

  it('the prompt asks for kind, detail and addressed good_to_know', () => {
    const p = buildEmailPrompt({ subject: 's', sender: 'x', body: 'b', members, todayYmd: '2026-09-02' })
    expect(p).toContain('"kind":"homework|todo"')
    expect(p).toContain('"detail":"...|omit"')
    expect(p).toContain('"good_to_know":[{"text":"...","for":["Name"]|"everyone"}]')
  })
})
```

Also update the existing "parses a well-formed result" expectation that `good_to_know` equals `['Early dismissal Friday']` if present → the object form.

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `types.ts`:

```ts
export type ItemKind = 'homework' | 'todo'
// items: Array<{ text; for; needed; kind: ItemKind; detail?: string }>
// EmailTodo gains kind: ItemKind; detail?: string
export interface GoodToKnow { text: string; for: Who }
// EmailExtraction.good_to_know: GoodToKnow[]
// TaskRow.category: 'event' | 'task' | 'homework'
export interface NoticeRow { user_id: string; family_member_id: string | null; text: string; sender_label: string; received_on: string; capture_id: string }
// WritePlan gains notices: NoticeRow[]
```

`prompt.ts` text changes: in item 1 after `"needed"` add `; "kind": "homework" when a STUDENT does or hands it in (a form to sign and return, a reading log, a project, studying for a test, a permission slip) — otherwise "todo" (a fee a parent pays, a thing to pack or wear); "detail": one or two sentences of context a person needs when doing it (what the form is for, cost, where to hand it in), never a repeat of the text`. Item 2 todos: add `kind and detail as above`. Item 3: `"good_to_know": things to KNOW but not DO — policy, dismissal rules, curriculum notes. One short sentence each, with "for": the children it concerns, or "everyone". Never repeat these as events or todos.` JSON template: items gain `"kind":"homework|todo","detail":"...|omit"`, todos likewise, `"good_to_know":[{"text":"...","for":["Name"]|"everyone"}]`.

Parser helpers:

```ts
const kind = (v: unknown): ItemKind => (v === 'homework' ? 'homework' : 'todo')
const detail = (v: unknown): string | undefined => opt(v) || undefined
function goodToKnow(v: unknown): GoodToKnow | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim(), for: 'everyone' } : null
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const text = str(o.text)
  return text ? { text, for: who(o.for) ?? 'everyone' } : null
}
```

Wire `kind: kind(io.kind), detail: detail(io.detail)` into items, same for todos; `good_to_know: list(o.good_to_know).map(goodToKnow).filter(...)`.

- [ ] **Step 4:** `npx vitest run supabase/functions/extract-email` — prompt tests pass; plan tests may now fail on types (fixed in Task 9). `npx vitest run src/lib/scopeDefaultCoverage.test.ts` still green.
- [ ] **Step 5: Commit** `feat(extract-email): homework kind, item detail, addressed good_to_know`.

---

### Task 9: Plan writer — homework category, detail in notes, notices

**Files:**
- Modify: `supabase/functions/extract-email/lib/plan.ts`
- Test: `supabase/functions/extract-email/lib/plan.test.ts`

- [ ] **Step 1: Failing tests** — fixtures: add `kind: 'todo' as const` to `pictureDay` items and any todo fixtures so existing tests keep their meaning; then:

```ts
describe('planWrites — homework and notices', () => {
  it('a homework item becomes a homework subtask with the detail in its notes', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ items: [
      { text: 'Return permission slip', for: ['Liam'], needed: '2026-09-08', kind: 'homework', detail: 'Aquarium trip, $12, to the front office' },
    ] })] } })
    const [c] = p.events[0].children
    expect(c).toMatchObject({ category: 'homework', assigned_to: 'k1', needed_on: '2026-09-08' })
    expect(c.notes).toBe('From Hillside Elementary · Weekly Update\n\nAquarium trip, $12, to the front office')
  })

  it('a plain item without detail keeps notes null and category task', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events[0].children[0]).toMatchObject({ category: 'task', notes: null })
  })

  it('a homework todo is a homework inbox row with detail after the source line', () => {
    const p = planWrites({ ...base, extraction: { ...empty, todos: [
      { title: 'Reading log', due: '2026-09-11', for: ['Mia'], kind: 'homework', detail: 'Sign each night', source_quote: 'Logs due Friday', confidence: 0.8 },
    ] } })
    expect(p.inbox[0]).toMatchObject({ category: 'homework', assigned_to: 'k2', needed_on: '2026-09-11' })
    expect(p.inbox[0].notes).toBe('From Hillside Elementary · Weekly Update\n\nSign each night\n\n“Logs due Friday”')
  })

  it('good_to_know fans out into notices per member; everyone and strangers → null member', () => {
    const p = planWrites({ ...base, extraction: { ...empty, good_to_know: [
      { text: 'PE is Tue/Thu', for: ['Liam', 'Mia'] },
      { text: 'Early dismissal Friday', for: 'everyone' },
      { text: 'Ask Ms. Park', for: ['Nobody'] },
    ] } })
    expect(p.notices).toEqual([
      { user_id: 'u1', family_member_id: 'k1', text: 'PE is Tue/Thu', sender_label: 'Hillside Elementary', received_on: '2026-09-02', capture_id: 'cap1' },
      { user_id: 'u1', family_member_id: 'k2', text: 'PE is Tue/Thu', sender_label: 'Hillside Elementary', received_on: '2026-09-02', capture_id: 'cap1' },
      { user_id: 'u1', family_member_id: null, text: 'Early dismissal Friday', sender_label: 'Hillside Elementary', received_on: '2026-09-02', capture_id: 'cap1' },
      { user_id: 'u1', family_member_id: null, text: 'Ask Ms. Park', sender_label: 'Hillside Elementary', received_on: '2026-09-02', capture_id: 'cap1' },
    ])
    expect(p.note?.content).toContain('PE is Tue/Thu')
  })
})
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `sourceNote(c, quote, extra)` already takes `extra` — reuse it. In `childrenFor`, `push(title, assigned, item)`:

```ts
      out.push({ ...row, assigned_to: assigned, needed_on: ymd,
        category: item.kind === 'homework' ? 'homework' : 'task',
        notes: item.detail ? sourceNote(i.capture, '', item.detail) : null })
```

Todos: `category: t.kind === 'homework' ? 'homework' : 'task', notes: sourceNote(i.capture, t.source_quote, t.detail)`. Notices:

```ts
  const notices: NoticeRow[] = []
  for (const g of i.extraction.good_to_know) {
    const row = (member: string | null): NoticeRow => ({
      user_id: i.capture.user_id, family_member_id: member, text: g.text,
      sender_label: i.capture.sender_label, received_on: i.todayYmd, capture_id: i.capture.id,
    })
    if (g.for === 'everyone') { notices.push(row(null)); continue }
    const { matched } = matchMembers(g.for, i.members)
    if (matched.length === 0) { notices.push(row(null)); continue }
    for (const m of matched) notices.push(row(m.id))
  }
```

Note: `'everyone'` maps to a single null row, NOT one per kid — the wall shows null to every member. The note's `gtk.map((g) => `- ${g}`)` becomes `g.text`. Return `{ events, inbox, note, notices }`.

- [ ] **Step 4:** all extract-email tests pass.
- [ ] **Step 5: Commit** `feat(extract-email): homework rows, detail notes, notices`.

---

### Task 10: Edge function — write notices, retry-safe

**Files:**
- Modify: `supabase/functions/extract-email/index.ts` (after the note block)

- [ ] **Step 1: Implement**

```ts
    if (plan.notices.length) {
      // Retry-safe: the model re-phrases between runs, so match by token
      // containment (itemsMatch), the same rule the inbox uses.
      const { data: existingNotices, error: existingNoticesError } = await supabase
        .from('notices').select('text').eq('capture_id', capture.id)
      if (existingNoticesError) throw new Error(`existing notices read failed: ${existingNoticesError.message}`)
      const seenTexts = (existingNotices ?? []).map((r) => r.text as string)
      const toInsert = plan.notices.filter((n) => !seenTexts.some((e) => itemsMatch(e, n.text)))
      if (toInsert.length) {
        const { error } = await supabase.from('notices').insert(toInsert)
        if (error) throw new Error(`notices insert failed: ${error.message}`)
      }
    }
```

and `notices: plan.notices.length` in the ok response.

- [ ] **Step 2:** `npx vitest run supabase/functions/extract-email` green; `deno check supabase/functions/extract-email/index.ts` if deno is on PATH (skip if not — note it).
- [ ] **Step 3: Commit** `feat(extract-email): write notices`.

---

### Task 11: Full verification + visual check

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.app.json` clean. `npx vitest run` full suite green (note any pre-existing red per memory `tend_tests_rot_on_wall_clock`). `npm run lint` on touched files.
- [ ] **Step 2: Screenshot.** Temporarily point the `/wall-lanes` route component (`WallV2LanePreview.tsx`) at `<WallV2Gantt board={adaptGanttBoard(members, [day], now, TRACK_PX, homework)} />` with a hardcoded payload: Kaleb with two homework items (one late), Ella with one and an all-day "Specials — Ella: Library · Kaleb: Art" event. Run the dev server from the worktree, open at 1024×768, screenshot, confirm chips fit the anytime area and the tracks start at the same x. **Restore the file before committing.** Save the screenshot to the vault (`~/Documents/scotts-world/projects/` per `feedback_save_to_vault`), not /tmp.
- [ ] **Step 3:** Rebase on `origin/main`, push branch. Report to Scott: DDL to run (two files), deploy command, then push to main.
