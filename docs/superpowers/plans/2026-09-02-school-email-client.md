# School Email Ingest — Client Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the rows the server phase writes visible and usable: per-person items inline under the event block on Today, a "From an email" badge, the source email in the task panel, the "Tomorrow" group in the Needed Today note, a quiet review path, a Settings card with the household's address, and a Needed-today card on the wall's kid day view.

**Architecture:** No new tables. Everything reads rows that already exist client-side (`useSupabaseTasks` fetches every task with subtasks nested; `Task` carries `captureId`, `neededOn`, `assignedTo`, `parentTaskId`) plus the `captures` table (household read policy is in place). One small new edge function, `capture-retry`, lets a signed-in household member re-run extraction without holding the shared secret.

**Tech Stack:** React 19 + TS strict, Vitest + RTL (happy-dom), Tailwind v4, lucide icons, Supabase (RLS, one Deno edge function).

**Spec:** `docs/superpowers/specs/2026-09-02-school-email-to-event-design.md` §4.4–4.7. Server phase (done): `docs/superpowers/plans/2026-09-02-school-email-server.md`.

## Global Constraints

- Work in a feature worktree off `origin/main`; never edit the main checkout. Node 22.14.0 (`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`). Tests `npx vitest run <paths>`; type-check `npx tsc -p tsconfig.app.json --noEmit`. Push with `git fetch && git rebase origin/main && git push origin HEAD:main`; pre-push runs tsc + full suite; never `--no-verify`. If pre-push fails in `connectors/src/whatsapp/adapter.test.ts`, run `npm install` inside `connectors/`.
- **No counts on Today, ever.** Footer links are quiet words, never "3 new".
- **Never call a needed-on item a "pin".** `needed_on` is a DATE that expires by ceasing to match (`src/lib/today/neededToday.ts`).
- **Never partial-upsert `tasks`**; use `updateTask`/`deleteTask` from `useScheduleActions`/`useSupabaseTasks`. Every mutation must go through the existing hooks so `announceLocalWrite` fires.
- **Never `supabase.auth.getUser()`**; use `getAuthUser()`. Never `SELECT *` on `notes`.
- Member pills use the existing `AssigneeAvatar` (`src/components/family/AssigneeAvatar.tsx`); no new avatar component. Lucide icons only; no emoji.
- Mobile first: everything here renders at every width (no `hidden md:block` on the new rows).
- Deno `index.ts` for `capture-retry` imports lib with `.ts`; deploy with `npx supabase functions deploy capture-retry --project-ref mwadppyrqzuzgstmwpuy --use-api` BEFORE pushing the Settings card that calls it.

## File map

| Task | Files |
|---|---|
| 1 Inline items + badge | `src/types/timeline.ts` (+`captureId`), `src/components/schedule/ScheduleItem.tsx`, `src/components/schedule/ScheduleItemItems.tsx` (new), tests |
| 2 Tomorrow group | `src/lib/today/neededToday.ts`, `src/components/schedule/NeededTodayNote.tsx`, tests |
| 3 Source in panel | `src/hooks/useCapture.ts` (new), `src/components/surface/sections/PanelSource.tsx` (new), `src/components/surface/TapContextPanel.tsx`, tests |
| 4 Review path | `src/hooks/useUnreviewedCaptures.ts` (new), `src/components/schedule/TodayBacklogFooter.tsx`, `src/components/schedule/EmailReviewSheet.tsx` (new), `src/components/schedule/TodayView.tsx`, tests |
| 5 Settings card + retry fn | `supabase/functions/capture-retry/index.ts` (new) + `config.toml`, `src/hooks/useSchoolMail.ts` (new), `src/components/settings/SchoolMailCard.tsx` (new), `src/components/settings/SettingsPage.tsx`, tests |
| 6 Wall card | `src/lib/wall/kidDayModel.ts`, `src/components/wall-v2/KidDayView.tsx`, the wall data hook that feeds `todayItems`, tests |

---

### Task 1: Per-person items inline under the block; "From an email" badge

**Files:** Modify `src/types/timeline.ts`, `src/components/schedule/ScheduleItem.tsx`; Create `src/components/schedule/ScheduleItemItems.tsx`, `src/components/schedule/ScheduleItemItems.test.tsx`; Modify `src/components/schedule/ScheduleItem.test.tsx`.

**Interfaces:**
- `TimelineItem.captureId?: string` (copied from `task.captureId` in `taskToTimelineItem`).
- `ScheduleItemItems({ items, members, onToggle }: { items: Task[]; members: FamilyMember[]; onToggle: (id: string) => void })` renders one row per subtask: a check circle (button, `aria-label="Complete <title>"`), the member's `AssigneeAvatar` (size `sm`) when `assignedTo` matches a member, the title, and a muted "tonight"/"today" hint derived from `neededOn` vs the viewed date when present.
- Rule for showing inline: `const perPerson = item.originalTask?.subtasks?.filter(s => !s.completed && (s.assignedTo || item.captureId))`; render `ScheduleItemItems` under the title (same left alignment as the existing steps list) when `perPerson.length > 0`, at every width, regardless of `stepsOpen`. Plain subtasks (no assignee, no capture) keep today's collapsed steps behaviour untouched.
- Badge: when `item.captureId` is set, the subtitle slot renders `From an email` (small muted text with the lucide `Mail` icon, 12px), visible at every width. If `rowSubtitle(item)` also returns text, join with ` · `.
- `onToggle` calls the existing subtask completion path (`onToggleComplete` prop already used by the row for the parent; find the subtask toggle the panel uses — `PanelSubtasks.onToggleSubtask` — and pass the same handler down from `TodaySectionList`/`TodayView`; if no such prop exists on `ScheduleItem`, add `onToggleSubtask?: (id: string) => void` and wire it from `TodayView` to `handleToggleComplete`).

- [ ] Step 1: failing tests in `ScheduleItemItems.test.tsx`: renders one row per item with the member initials; clicking the check calls `onToggle(id)`; shows "tonight" for `neededOn` = viewed date − 1 and "today" for = viewed date; no hint otherwise.
- [ ] Step 2: failing test in `ScheduleItem.test.tsx`: a task row whose `originalTask.subtasks` carry `assignedTo` renders the items inline on MOBILE (mock `useIsMobile` true) without expanding steps; a row with `captureId` shows "From an email"; a row with plain subtasks and no captureId shows no inline items.
- [ ] Step 3: implement; run both files + `npx vitest run src/components/schedule`; tsc.
- [ ] Step 4: commit `feat(today): per-person items inline under an email block; From an email badge`.

### Task 2: "Tomorrow, assembled" group in the Needed Today note

**Files:** Modify `src/lib/today/neededToday.ts`, `src/lib/today/neededToday.test.ts`, `src/components/schedule/NeededTodayNote.tsx`, `src/components/schedule/NeededTodayNote.test.tsx`.

**Interfaces:** `neededToday(...)` gains an optional 6th parameter `now: Date = new Date()` and returns `{ items, overflow, tomorrow: NeededItem[] }` where `tomorrow` lists incomplete tasks with `neededOn` = viewedDate + 1 (and not scheduled on that day), only when `now`'s local hour ≥ 17 AND `viewedDate` is today (`isSameDay(viewedDate, now)`); otherwise `[]`. `NeededItem` gains `assignedTo?: string | null`. The note renders a second heading "Tomorrow" under the existing list, each row with `AssigneeAvatar` when the assignee matches a member (the note already receives family members or can take a `members` prop from TodayView).

- [ ] Step 1: failing tests: at 18:00 on the viewed day, a task with `neededOn` tomorrow appears in `tomorrow`; at 09:00 it does not; when viewing a past day it does not; a completed task never does. Note test: "Tomorrow" heading appears with the item and the member initials.
- [ ] Step 2: implement; run `npx vitest run src/lib/today/neededToday.test.ts src/components/schedule/NeededTodayNote.test.tsx`; tsc.
- [ ] Step 3: commit `feat(today): Needed Today note shows tomorrow's items after 5pm`.

### Task 3: Source attached in the task panel

**Files:** Create `src/hooks/useCapture.ts`, `src/components/surface/sections/PanelSource.tsx`, `src/components/surface/sections/PanelSource.test.tsx`; Modify `src/components/surface/TapContextPanel.tsx`.

**Interfaces:**
- `useCapture(id: string | undefined): { capture: { id; subject: string | null; sender: string | null; sourceLabel: string | null; rawText: string | null; createdAt: string } | null; loading: boolean }` — `supabase.from('captures').select('id, subject, sender, source_label, raw_text, created_at').eq('id', id).maybeSingle()`; no fetch when `id` is undefined.
- `PanelSource({ captureId })` → `PanelSection id="source" label="Source"`: line 1 `sender · subject`, line 2 received date (`Sep 2`), a quiet "Open original" toggle that expands `rawText` in a scrollable `<pre>`-styled block (plain text, `whitespace-pre-wrap`, max-height 60vh). Renders `null` when there is no capture.
- Mounted in `TapContextPanel` directly after `PanelNotes` when `task.captureId` is set. The quote already lives in the task's notes; do not repeat it.

- [ ] Step 1: failing test: with a mocked `useCapture` returning a capture, the section shows sender, subject and, after clicking "Open original", the raw text; with `null` it renders nothing.
- [ ] Step 2: implement; `npx vitest run src/components/surface`; tsc.
- [ ] Step 3: commit `feat(panel): show the source email behind an extracted task`.

### Task 4: Quiet "New from email" review path

**Files:** Create `src/hooks/useUnreviewedCaptures.ts`, `src/components/schedule/EmailReviewSheet.tsx`, `src/components/schedule/EmailReviewSheet.test.tsx`; Modify `src/components/schedule/TodayBacklogFooter.tsx` (+test), `src/components/schedule/TodayView.tsx`.

**Interfaces:**
- `useUnreviewedCaptures(): { captures: Array<{ id; subject; sourceLabel; createdAt }>; markReviewed: (ids: string[]) => Promise<void>; refresh: () => void }` — `captures` where `kind='email' and status='extracted' and reviewed_at is null`, ordered by `created_at desc`, limit 10. `markReviewed` updates `reviewed_at = now()` (household update policy allows it).
- Footer: `TodayBacklogFooter` gains `onReviewEmail?: () => void`; when provided, renders a second quiet link "New from email" next to "Review" (same styling). Never a count.
- `EmailReviewSheet({ open, captures, tasks, members, onClose, onKeep, onFixDate, onDismiss })`: one section per capture (`sourceLabel · subject`), listing that capture's rows from the client task list (`tasks.filter(t => t.captureId === capture.id && !t.parentTaskId)`; subtasks shown indented under their parent). Per row: **Fix date** (opens the existing `SchedulePopover`/`TriageWhenMenu` used elsewhere on Today; pick the one the row action rail uses) and **Dismiss** (deletes the row and its subtasks via `deleteTask`, with the same undo toast pattern the To-buy list uses). Closing the sheet calls `markReviewed` for every capture shown. Mobile: bottom sheet; desktop: right panel. Reuse `PanelShell` styling.
- `TodayView`: show the footer link only while `captures.length > 0`; open the sheet on click.

- [ ] Step 1: failing tests: footer renders the link only when `onReviewEmail` is given; sheet groups tasks by capture, Dismiss calls `onDismiss(id)`, closing calls `onClose` (TodayView test stubs `markReviewed`).
- [ ] Step 2: implement; `npx vitest run src/components/schedule`; tsc.
- [ ] Step 3: commit `feat(today): quiet "New from email" review sheet`.

### Task 5: Settings "School mail" card + `capture-retry`

**Files:** Create `supabase/functions/capture-retry/index.ts`; Modify `supabase/config.toml` (NO `verify_jwt=false` — this one uses the caller's JWT); Create `src/hooks/useSchoolMail.ts`, `src/components/settings/SchoolMailCard.tsx`, `src/components/settings/SchoolMailCard.test.tsx`; Modify `src/components/settings/SettingsPage.tsx` (General tab, under Invite partner).

**Interfaces:**
- `capture-retry` (Deno): reads the caller from the `Authorization` bearer via `createClient(url, anonKey, { global: { headers: { Authorization } } })` + `auth.getUser()`; body `{ capture_id }`; with the service-role client, loads the capture and asserts `users_share_household(caller, capture.user_id)` via `rpc('users_share_household', { user_a, user_b })`; then POSTs `{ capture_id }` to `extract-email` with `CAPTURE_SHARED_SECRET` and returns its JSON. 401 no user, 403 not a member, 404 no capture.
- `useSchoolMail(): { address: string | null; loading: boolean; recent: Array<{ id; subject; sourceLabel; status; error; createdAt }>; retry: (id) => Promise<void>; refresh }` — address = `${await supabase.rpc('ensure_inbound_token', { p_household: householdId })}@symphony-os.com` where `householdId` comes from `supabase.rpc('get_user_household_id')`; recent = last five `captures` with `kind='email'` for the household (`select id, subject, source_label, status, error, created_at` ordered desc limit 5); retry calls `supabase.functions.invoke('capture-retry', { body: { capture_id } })` then refresh.
- `SchoolMailCard`: title "School mail"; one sentence: "Forward school email here once, or set a Gmail filter. Events land on their day with what each kid needs."; the address in monospace with a Copy button (`navigator.clipboard.writeText`, label flips to "Copied" for 2s); note "Treat this address like a password."; the recent list: subject · sourceLabel · relative time · status pill (extracted / pending / failed) and a **Retry** button on failed rows.

- [ ] Step 1: failing tests: card shows the address from a mocked hook, Copy writes to clipboard, a failed row shows Retry which calls `retry(id)`.
- [ ] Step 2: implement; `npx vitest run src/components/settings`; tsc. Deploy the function: `npx supabase functions deploy capture-retry --project-ref mwadppyrqzuzgstmwpuy --use-api` (before pushing).
- [ ] Step 3: commit `feat(settings): School mail card with the household address and retry`.

### Task 6: Wall kid day "Needed today" card

**Files:** Modify `src/lib/wall/kidDayModel.ts` (+test), `src/components/wall-v2/KidDayView.tsx` (+test), and the wall data hook that builds `todayItems` (find it: `grep -rn "todayItems" src/components/wall-v2 src/lib/wall | head`).

**Interfaces:** `buildMemberDayModel` input gains `neededTasks: Task[]` (incomplete tasks with `assignedTo === member.id` and `neededOn` on `date`, or `date+1` when local hour ≥ 17 — reuse the same rule as Task 2 by exporting a helper `neededWindow(viewedDate, now)` from `neededToday.ts` and importing it). `MemberDayModel` gains `needed: Array<{ id; title; tomorrow: boolean }>`. `KidDayView` renders a "Needed today" card first (and a "Tomorrow" sub-heading for the `tomorrow` ones), each row a checkbox that calls the same complete handler as assigned tasks. The wall data hook must supply those tasks; they are not timeline items (no `scheduled_for`), so read them from the tasks list the wall already fetches, or add a narrow query `tasks.select(...).not('needed_on','is',null).eq('completed',false)` if the wall only fetches scheduled rows.

- [ ] Step 1: failing tests: model includes a needed item for the member today; a tomorrow item only after 17:00; another member's item excluded; view renders the card with a checkbox.
- [ ] Step 2: implement; `npx vitest run src/lib/wall src/components/wall-v2`; tsc.
- [ ] Step 3: commit `feat(wall): Needed-today card on the kid day view`.

---

## Self-review
- Spec §4.4 → Tasks 1, 2. §4.5 → Task 3. §4.6 → Tasks 4, 5. §4.7 → Task 6. Nothing in §4.4–4.7 lacks a task.
- Names used across tasks: `TimelineItem.captureId` (T1) is read by T4's grouping via `Task.captureId`, not the timeline; `neededWindow` (T2) consumed by T6; `useUnreviewedCaptures.markReviewed` (T4); `ensure_inbound_token` and `get_user_household_id` RPCs (T5) both exist in the DB.
- Deploy order: `capture-retry` before the Settings card push (T5).
