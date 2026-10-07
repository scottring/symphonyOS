# Wall scratchpad (2026-10-07)

Scott: "we need a scratchpad for the wall kiosk to put quick notes or discussion
topics that can be triaged into 'completed' or 'sent to inbox'". Then: "it should
replace the Specials box" and "post scratchpad notes from our phones/desktops/web".
Mockup approved: https://claude.ai/artifact/5K9zQuK1gaBaizyBZQiJ2Q ("it's great, ship it").

## What it is

- **On the wall face**, where the Specials box was: the newest three open notes,
  a "Jot a note…" button and "+ N more". Today's specials stay on the Today card;
  tomorrow's special moves onto the evening "Tomorrow" card ("Gym tomorrow").
- **The sheet** (tap anything on the card): type a note on the wall keyboard,
  choose Note or Talk about, optionally tap who's writing. Each open note:
  - **Done** — a talk-about first asks "What did we decide?" (optional).
  - **To Inbox** — pick Scott or Iris; the note becomes a family task in the
    Inbox (`bucket 'inbox'`, `assigned_to` that person, household scope), and
    the note is marked sent.
  - **⋯** — edit, or delete (two taps).
  - **Done this week** — sorted notes for 7 days, with "Reopen" on done ones.
- **One list**: tasks and events flagged "Bring up" in the app show here too
  (marked "Discussed" to clear). This replaced the header's Discuss button and
  the old For Discussion overlay.
- **From the app** (phone or desktop web): the Add box (⌘K / +) offers
  "Put on the wall's scratchpad" with Note / Talk about. The note is credited to
  the signed-in person's family member.

## Data

`public.scratchpad_notes` (migration `2026-10-07_scratchpad_notes.sql`):
body, kind (`note`|`talk`), author_member_id, status (`open`|`done`|`sent`),
resolution, sent_to_member_id, sent_task_id, resolved_at/by. Every note is
household-shared: RLS = owner or `users_share_household(auth.uid(), user_id)`
for read/update/delete; insert only as yourself. Triage never deletes rows.
Realtime publication on, so a note from a phone lands on the wall live.

Verified with real account ids in a rolled-back transaction: Iris reads and
resolves Scott's note; a user outside the household reads 0 rows and cannot
update or delete.

## Code

- `src/lib/wall/scratchpad.ts` — pure projections (open rows, done this week, bylines).
- `src/lib/wall/addScratchpadNote.ts` — the one insert, shared by wall and app.
- `src/hooks/useScratchpad.ts` — load + realtime + writes for the wall.
- `src/components/wall-v2/moments/ScratchpadCard.tsx`, `WallV2ScratchpadSheet.tsx`.
- `QuickCapture` `onAddToScratchpad` (wired in `ShellLayout`, not on the wall).

Not done: the native iOS app has no scratchpad entry yet; triage happens on the wall only.
