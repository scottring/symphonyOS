# Homework and School Notices on the Wall — Design

**Date:** 2026-09-02
**Status:** Approved in conversation by Scott (A / A / A + "homework is a real category"); implementing.
**Author:** Scott + Claude
**Builds on:** `2026-09-02-school-email-to-event-design.md` (the forward → extract → tasks pipeline) and `2026-08-30-kid-day-view-design.md` (the per-member wall page). Both are shipped; this spec changes neither's shape, it adds a kind of thing to each.

## 1. The problem

Scott forwards the school digest. The pipeline already turns "complete and return the blue sheet" into a task assigned to Kaleb with a `needed_on` date. But on the kitchen wall:

- **The main board never shows it.** Kaleb's row shows his specials because they are calendar events with a date on the day. A homework item has no `scheduled_for`, so the board's day query never sees it. It reaches only his detail page, and only on the needed day.
- **An undated todo is invisible on the wall entirely.** `needed_on` null → not in the needed query → nowhere.
- **The email's supporting text has no home.** `good_to_know` lines become one note nobody reads. Nothing is attributed to a kid.

Scott's framing: these should show "the way specials show already" — a chip on the kid's row on the board, and something on the kid's page with a checkbox to mark it done and handed in.

## 2. Decisions locked (2026-09-02)

| Question | Decision |
|---|---|
| When does a homework chip sit on the kid's board row? | **From the day it arrives until it is done.** A nag, like a form stuck to the fridge. Never only on the due day. |
| Is this "homework"? | **Yes — a real task category.** The extractor tags it at ingest; a person can set it by hand. |
| Where is the checkbox? | **On the kid's page only.** Board chips are read-only signals that open the page. A checkbox on a 1024×768 TV chip is too small to trust. |
| Supporting / going-forward text | **Two homes.** Detail that belongs to an item (what the form is, the $12) becomes that task's notes, shown under the row when tapped. Standing info addressed to a kid ("PE is Tue/Thu, wear sneakers") goes to a "From school" card on the kid's page, aging out after 14 days. |
| Email attachments (the PDF itself) | **Out of scope.** The Cloudflare Worker forwards text only; attachments never reach Symphony today. A separate build. |
| Reading widget / screen-time earning | **Separate sub-project**, its own spec after this ships. |

## 3. Data

### 3.1 `homework` joins `tasks.category`

`TaskCategory` becomes `'task' | 'chore' | 'errand' | 'event' | 'activity' | 'homework'`.

The column carries a CHECK constraint (migration `028_task_category.sql`, auto-named `tasks_category_check`). DDL goes to Scott to run — the classifier blocks agent-run DDL — **and must run before the edge function deploys**, or every homework insert fails the constraint:

```sql
alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('task','chore','errand','event','activity','homework'));
```

A homework item is an ordinary task: `category = 'homework'`, `assigned_to` = the kid, `needed_on` = the due date (nullable), supporting detail in `notes`, `capture_id` when it came from an email. `completed = true` means done and handed in. No new table, no new column.

### 3.2 `notices` — standing info from school

A small new table. One row per line per addressee.

```sql
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

- Household visibility mirrors `tasks` exactly (`users_share_household`). Notices are family by construction; there is no `context`/`scope` column to get wrong.
- **Aging is by query, never by deletion.** The wall reads `received_on >= today − 14`. Old rows stay for the record.
- No update policy: a notice is never edited. Wrong ones are deleted from the app later (not in this spec).

## 4. Email extraction

### 4.1 Prompt

Three additions to `buildEmailPrompt`, everything else unchanged:

- Every **todo** and every **event item** gets `"kind": "homework" | "todo"`. Homework = something a *student* does or hands in: a form to sign and return, a reading log, a project, studying for a test, a permission slip. Not homework: a fee a parent pays, a thing to pack, a thing to wear.
- Every todo and item gets `"detail": "...|omit"` — the sentence or two of context a person would want when doing it (what the form is for, cost, where to hand it in). Never a repeat of the title.
- `"good_to_know"` becomes `[{"text": "...", "for": ["Name"] | "everyone"}]` — same `for` rules as items.

### 4.2 Parser (`parseEmailExtraction`)

Backwards compatible with the old shape, so a retry of a pre-existing capture cannot break:

- Missing or unknown `kind` → `'todo'`.
- Missing `detail` / placeholder ("omit") → absent.
- A `good_to_know` entry that is a plain string → `{ text, for: 'everyone' }`.

### 4.3 Types

```ts
type ItemKind = 'homework' | 'todo'
EmailEvent.items[n]: { text; for; needed; kind: ItemKind; detail?: string }
EmailTodo: { title; due?; for?; kind: ItemKind; detail?: string; source_quote; confidence }
EmailExtraction.good_to_know: Array<{ text: string; for: Who }>
TaskRow.category: 'event' | 'task' | 'homework'
NoticeRow: { user_id; family_member_id: string | null; text; sender_label; received_on; capture_id }
WritePlan: { events; inbox; note; notices: NoticeRow[] }
```

### 4.4 Plan writer (`planWrites`)

- `kind === 'homework'` → `category: 'homework'` on the child row / inbox row. Otherwise `'task'` as today.
- `detail` is appended to the row's `notes` after the source line: `From <sender> · <subject>\n\n<detail>\n\n“<quote>”`. Children today carry `notes: null`; they now carry the source line + detail when there is a detail, so the page has something to expand. (Children with no detail keep `notes: null` — nothing to show.)
- `good_to_know` → `notices`: one row per matched member; `for: 'everyone'` or no match → one row with `family_member_id: null`. `received_on = todayYmd`. `sender_label` from the capture.
- The raw per-email `notes` row is unchanged and still written. It is the record; notices are the surface.

### 4.5 Edge function (`extract-email/index.ts`)

- Insert `plan.notices` after the note. **Retry-safe:** read existing `notices` for this `capture_id`, skip any whose `text` matches by `itemsMatch` (same containment rule the inbox uses, because the model re-phrases between runs).
- Response gains `notices: n`.
- Deploy with `--use-api` (Docker is off) **before** pushing main, and **after** Scott has run the DDL in §3.1 and §3.2.

## 5. Wall data (`useWallData`)

Two new narrow queries in the existing `Promise.all`, both gated by `commitData` like `tasks`/`neededTasks`, both in the `dataError` list:

- **Query 14, homework:** `tasks` · `TASK_COLUMNS` · `completed = false` · `context = 'family'` · `category = 'homework'`. No date filter: the whole point is "until done". Exposed as `homeworkTasks: Task[]`.
- **Query 15, notices:** `notices` · `*` · `received_on >= localYmd(today − 14)` · ordered `received_on desc`. Exposed as `notices: WallNotice[]` where `WallNotice = { id; familyMemberId: string | null; text; senderLabel: string | null; receivedOn: Date }` (`received_on` parsed with `parseLocalYmd`, same trap as `needed_on`).

Egress: both are tiny (a handful of rows) and replace nothing.

## 6. Main board

### 6.1 Adapter (`wallGantt.ts`)

`adaptGanttBoard(members, days, now, trackPx, homework: Task[] = [])`.

`GanttTrack` gains:

```ts
homework: { id: string; label: string; late: boolean }[]
```

- **Row:** `assigned_to` → that member's track. Unassigned → the household row, matching `boardOwnersOf`'s rule for unassigned tasks. A homework task whose assignee is not on the roster → household row.
- **Label:** `title` alone when there is no `needed_on`; otherwise `title · <due>` where `<due>` is `Today`, `Tomorrow`, the short weekday (`Fri`) when within the next six days, `Sep 12` beyond that, and `Late` when `needed_on` is before today. Computed against `now`'s local day.
- **Order:** late first, then by `needed_on` ascending, undated last. Ties by title.
- `anytime` is untouched. Homework is a separate array so the existing chip cap, ordering and tests do not move.

### 6.2 Renderer (`WallV2Gantt.tsx`)

- `AnytimeArea` draws homework chips **before** the day's anytime chips. Homework is the actionable thing on the row; specials are background. At most two homework chips render per row; a third and beyond fold into `+N`. This cap is separate from `ANYTIME_SHOWN`.
- A homework chip is visually distinct from a specials chip: filled in the row's forest accent (`WALL` ink on a pale green ground), with a small book icon (lucide `BookOpen`) at the left. `late` chips use the existing `WALL.warn` tone. Everything stays inside the fixed-width rules of the row: chips live in the anytime area, never between the name column and the track (see `wall_specials_split_per_person`).
- **Tap:** on a member row a homework chip is a `<button>` calling `onTapMember(track.memberId)` — the same as tapping the portrait — with `aria-label="Open <name>'s homework"`. On the household row it is a plain span (there is no household page).
- `hasChips` includes homework, so a row with only homework does not read "Nothing scheduled".

## 7. Kid's page

### 7.1 Model (`kidDayModel.ts`)

`buildMemberDayModel` input gains `homeworkTasks: Task[]` and `notices: WallNotice[]`. `MemberDayModel` gains:

```ts
homework: KidHomeworkRow[]   // { id; title; due: string | null; late: boolean; notes: string | null }
notices: KidNoticeRow[]      // { id; text; senderLabel: string | null; receivedOn: Date }
```

- `homework`: `homeworkTasks` where `!completed && assignedTo === member.id`, ordered as §6.1 (late, dated asc, undated). `due` uses the same label function as the board, exported from one place (`src/lib/wall/homeworkLabel.ts`) so the board and the page can never disagree about "Fri".
- **Dedupe:** a homework task is owned by the Homework card. It is excluded from `needed` (even when its `needed_on` is today) and from the bands (even if it somehow has a `scheduled_for`). One row per item on the page.
- `notices`: rows where `familyMemberId === member.id || familyMemberId === null`, newest `receivedOn` first, then by text.
- `isEmpty` becomes false when `homework.length > 0`. Notices do **not** affect `isEmpty`: a kid with only a notice still sees "Nothing on your list — go play" and the "From school" card under it.

### 7.2 View (`KidDayView.tsx`)

- **Homework card** renders first, above "Needed today", only when `model.homework.length > 0`. Title "Homework". One row per item:
  - Left: a 56px-tall checkbox target on the existing task path (`handleTaskTap` → `doneOverlay` → `onToggleTask('task-<id>', next)`). Optimistic, strikes through when done, same as every other task row.
  - Right of the checkbox: title, and beneath it the `due` line (`Due Fri`, `Due today`, `Late — was Tue`) in muted type; `late` in `WALL.warn`.
  - If `notes` is non-null the title area is its own button that expands the notes under the row as plain text (`whitespace-pre-line`), muted. Expanded state lives in the existing `expanded` set keyed `homework:<id>` so it cannot collide with a target routine's id.
- **From school card** renders after the bands, only when `model.notices.length > 0`. Title "From school". One row per notice: the text, then a muted line `<sender> · <Mon d>` (sender omitted when null). Read-only. No cap — fourteen days of a school digest is a short list.
- `KidDayViewProps` gains `homeworkTasks` and `notices`; the Shell passes `wallData.homeworkTasks` and `wallData.notices`. The overlay-clearing effect adds `homeworkTasks` to its deps (a completion refetch changes its identity).

## 8. By hand

There is no category picker in the shipped app; `InboxTriageModal` is exported but unmounted since the September pare-down. Categories are set by prefix in the quick-input parser. So "by hand" means:

- `quickInputParser.ts`: `homework:` and `hw:` prefixes → `'homework'`.
- `rowSubtitle.ts`: `case 'homework': return 'Homework'`.
- `weekColorMap.ts`: no change (falls to the default green).
- `InboxTriageModal` `CATEGORIES`: add `{ value: 'homework', label: 'Homework', icon: 'task', description: 'For a kid to do and hand in', color: 'green' }` so the type stays exhaustive and the modal is right if it is ever remounted.
- `TaskCategory` and the parser's local union both gain `'homework'`.

Assign to a kid and set the date the usual way ("hw: return blue sheet @Kaleb Friday").

## 9. Testing

Unit, on the pure pieces (Vitest, `npx vitest run`; Node 22.14.0):

- `prompt.test.ts`: `kind` parsed, unknown → `todo`; `detail` placeholder dropped; `good_to_know` accepts strings and objects.
- `plan.test.ts`: homework kind → `category: 'homework'` on child and inbox rows; `detail` lands in `notes` after the source line; notices fan out per member, `everyone` → null member; a `for` name not on the roster → null member.
- `homeworkLabel.test.ts`: Today / Tomorrow / weekday / month-day / Late / undated, at a fixed `now`.
- `wallGantt.test.ts`: homework lands on the assignee's track, unassigned on the household row; order late → dated → undated; `anytime` unchanged by homework.
- `WallV2Gantt.test.tsx`: a homework chip renders, is a button on a member row calling `onTapMember`, is not a button on the household row; a row with only homework does not read "Nothing scheduled".
- `kidDayModel.test.ts`: homework rows for the member only; excluded from `needed` and bands; `isEmpty` false with homework, true with only notices; notices filtered to member-or-everyone, newest first.
- `KidDayView.test.tsx`: Homework card renders rows with due text; checkbox tap calls `onToggleTask('task-<id>', true)`; title tap expands notes; From school card renders sender · date; neither card renders when empty.
- Both coverage guards stay green: `sectionCoverage.test.ts` (no new DaySection sweep) and `scopeDefaultCoverage.test.ts` (no literal `scope:` in `supabase/functions/**`; notices carry none).

Visual, because jsdom has no layout:

- Point `/wall-lanes` at a `WallV2Gantt` fed by `adaptGanttBoard` over a hardcoded payload with two homework items on Kaleb (one late), one on Ella, and Ella's specials chip; screenshot at 1024×768; restore before committing. The check is that chips fit the anytime area and the tracks still start at the same x.

## 10. Ship order

1. Scott runs the DDL (§3.1 constraint, §3.2 table + RLS). Migration files are committed to the repo for the record.
2. Deploy `extract-email` (`supabase functions deploy extract-email --use-api`).
3. Push main (auto-deploys the app). `homeworkTasks`/`notices` queries are additive; a wall polling before the table exists reports the error in the stale banner and keeps rendering — the same degradation every other query has.
4. Forward a real digest and look at the wall.

## 11. Non-goals, restated

- No editing or deleting notices from the wall. No dismiss.
- No homework on the phone's Today beyond what a task already gets there (it is a task; it shows where tasks show).
- No streaks, counts, or scoreboards. A homework chip disappears when checked; that is the reward.
- No attachments.
- No reading widget (next spec).
