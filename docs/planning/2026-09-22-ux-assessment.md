# App-wide usability and UI/UX assessment — September 22, 2026

Owner: Claude, from the [handoff](2026-09-22-claude-ux-handoff.md). Branch
`codex/claude-ux-assessment` (base ed2efe40). The planning-horizon journeys were
already walked live and fixed; see [walkthrough status](2026-09-22-walkthrough-status.md).
This pass covers the rest of the app and the cross-cutting qualities.

**Evidence labels.** *Source* = read in code with file:line; *Test* = automated
regression; *Rendered* = seen in a browser. Hypotheses are marked as such.

**How it was assessed.** Source audit of every destination (three parallel
read-only audits: route inventory, accessibility, empty/error/failed-save
states), then a signed-in rendered pass on `vite preview` (this branch's build)
against production data in the test household: desktop window, same-origin 390px
and 830px frames, keyboard-only checks, and one simulated failed save (page-local
fetch override; nothing written). Not done: VoiceOver/real-device testing,
reload-persistence of every changed write path, fresh-user research,
cross-account privacy, provider sync.

## Coverage matrix

| Area | Destinations | Evidence | Status |
| --- | --- | --- | --- |
| Primary nav / IA | Planner, Routines, Inbox, More (desktop menu, phone sheet), horizon tabs | Source, Test, Rendered | Fixed: More drift, highlight, dead ends, badge mismatch (R1) |
| Planning horizons | Today, Week, Month, Season, Year, Shelves, reviews | Prior live walkthrough | Not re-walked; prior sign-off stands |
| Inbox / triage | List, Focus, Expired, bulk | Source, Test, Rendered | F4, F6, E2, R1; D2 open |
| Search / ⌘K | Unibox search + quick add | Source, Test, Rendered | N3, F1 (failed save rendered), A4 |
| Detail editors | Task/event/routine/meal panels | Source, Rendered | A1, A3, A9, R3 |
| Routines | /routines rhythm page, editor | Source, Test, Rendered | E3, F11, A10 |
| Someday | /someday | Source, Test, Rendered | E1, N2, F6 |
| Notes, Documents | /notes, /documents | Source, Test, Rendered (layout) | F1, F3, F6 |
| Discussions | /discussions, item threads | Source, Test, Rendered (layout) | F2 |
| Lists, Meals, House, Contacts, History | More destinations | Source, Rendered (layout) | F8, F9, F13, R7 |
| Settings / family / calendar | /settings tabs, calendar wizard | Source, Rendered (layout) | F12, F16, R6 |
| Auth | Sign in / up / reset | Rendered (signed-out), Test | Fixed A0 |
| Kiosk | /wall-v2 (and legacy /wall) | Source | Fixed: /wall redirect; kiosk itself not re-assessed |
| Keyboard / screen reader | Shared dialogs, popovers, toasts, rows | Source, Test | A1–A12 |
| Narrow screens | 390 / 830 / desktop | Rendered, 18 destinations × 2 widths | 830 clean; 390 fixes R6–R8; desktop with both panes: L5 |
| Persistence after reload | — | Rendered (one path) | Failed ⌘K note absent after reload; others not re-tested |
| Cross-account privacy, providers | — | Out of scope | Not claimed |

Route inventory (from `src/main.tsx`, `src/shell/appRegistry.ts`, app routers):
`/`, `/today`, `/week`, `/month`, `/season`, `/year`, `/inbox`, `/someday`,
`/task/:id`, `/routines[/new|/:id]`, `/meals[/plan|/shelf|/cook/:id]`, `/lists`,
`/home[/space/:id[/session]|/asset/new|/asset/:id]`, `/contacts[/:id]`, `/notes`,
`/documents`, `/discussions`, `/history`, `/goals[/:id]` (no nav entry),
`/family/:memberId`, `/agent` (deep link only), `/settings`, `/join/:token`,
`/paper/phone/:id`, `/wall-v2`, `/wall-lanes`, `/capture`, `/calendar-callback`;
retired redirects: `/projects`, `/meds`, `/jobs`, `/us`, `/morning`, `/bedtime`,
and now `/wall`. Overlays: `?detail=kind:id`, ⌘K unibox, AI rail, daily review,
Getting started (`/today?welcome=1`), Plan from paper.

## Findings, severity-ranked

Status key: **Fixed** (implemented + regression test), **Open**, **Deferred**.

### High — silent failure or data loss

| # | Journey / state | Observed (Source) | Expected | Status |
| --- | --- | --- | --- | --- |
| F1 | ⌘K note, failed save | `useShellChrome.ts` toasts "Note saved" regardless of `addNote` returning null; input already cleared | Success only on success; failure keeps the text recoverable | **Fixed** — `useShellChrome`/`useNotes`; `useNotes.test.ts` |
| F2 | Discussion post, failed RPC | `useDiscussThread.ts` try/catch around `supabase.rpc` (which returns `{error}`, never throws); draft cleared, optimistic message dropped on reload | Error shown, draft restored | **Fixed** — draft restored; `useDiscussThread.test.ts`, `DiscussionThread.test.tsx` |
| F3 | Notes editor, failed save | `useNotes.updateNote` rolls back silently; `NoteModal` clears unsaved flag and closes | Keep modal open, tell the user | **Fixed** — modal stays open on failure; `useNotes.test.ts` |
| F4 | Inbox → send to existing note, failed append | `updateNote` never throws, so the capture is deleted anyway | Delete capture only after a successful append | **Fixed** — `InboxDataSafety.test.tsx` |
| F5 | Event notes, failed write | `useEventNotes.ts` rollbacks with no message | Toast | **Fixed** — toasts in all 11 rollback branches (no dedicated test) |
| F6 | One-tap permanent delete | Someday row, Inbox Expired, Inbox bulk delete — no confirm/undo; Documents deletes file before row | Undo window (like ordinary Inbox rows); document confirm, row first | **Fixed** — `usePendingDelete`; `SomedayPage.test.tsx`, `InboxDataSafety.test.tsx`, `DocumentRow.test.tsx` |

### Medium

| # | Journey / state | Observed (Source) | Expected | Status |
| --- | --- | --- | --- | --- |
| N1 | Phone More | Missing Notes, Documents, House, Meal shelf vs desktop; not a dialog; no Escape; highlight fell back to Today for most pages | Same destinations as desktop; dialog semantics | **Fixed** — shared `moreDestinations.ts`; `MoreSheet.test.tsx` |
| N2 | Desktop Someday/Notes/Lists/History/Settings | `deriveActiveView` fell through to `'today'`, hiding the nav domain switcher; Someday filters by domain | Filter control present where filtering applies | **Fixed** — `pageOwnsFilterChrome`; `ShellLayout.test.tsx` |
| N3 | ⌘K project result | Navigates to `/projects/:id`, which redirects to Today | No dead-end results | **Fixed** — `OmniboxResults.test.tsx` |
| N4 | `/wall` bookmark | Shell renders chrome with an empty body | Redirect to current board | **Fixed** — redirect to `/wall-v2` |
| E1 | Someday filtered-empty | "Nothing set aside." while the domain filter hides items | Distinguish, offer Show all domains | **Fixed** — `SomedayPage.test.tsx` |
| E2 | Inbox filtered-empty | "Inbox zero" while filters hide items | Same distinction | **Fixed** — `InboxDataSafety.test.tsx` |
| E3 | Routines filtered-empty | "No routines yet — capture your first" under a filter | Same distinction | **Fixed** — `RhythmPage.test.tsx`; Rendered ✓ |
| F8 | Lists add item, failure | Text cleared even when the add fails | Keep text on failure | **Fixed** (no dedicated test) |
| F9 | Meals replace | Removes old meal before adding new; failure loses both, error hides whole grid | Add then remove; banner | **Fixed** — add-then-remove; toasts instead of page error (no dedicated test) |
| F11 | Routines edits / Merge | `false` returns never surfaced; Merge deletes look-alikes in one tap | Toast; confirm | **Fixed** — toasts; Merge confirm (no dedicated test) |
| F12 | Family member delete | Tasks unassigned before the delete; failure leaves them unassigned | Unassign only after success | **Partly fixed** — the FK forbids deleting first, so tasks are unassigned then re-assigned if the delete fails; `assigned_to_all` still keeps the removed member (open) |
| F13 | Contacts | Missing contact = endless spinner; delete navigates away on failure | "Not found"; stay on failure | **Mostly fixed** — "Contact not found"; failed delete restores the row, but the page still navigates away optimistically (open) |
| F16 | Calendar setup wizard | Deletes all mappings, then inserts unchecked | Never leave zero mappings on failure | **Fixed** — prior mappings restored on insert failure (no dedicated test) |
| A1 | Keyboard: portalled menus | Detail ⋯ menu, domain switcher, reschedule, fate menu never take focus; Escape on ⋯ closes the whole panel | Focus in, Escape closes menu only, focus returns | **Fixed** — `usePopoverFocus` (+test); Rendered ✓ domain menu focus/Escape, panel ⋯ menu Escape keeps panel |
| A3 | Detail panel | Unlabelled `<aside>`, focus stays on row, no restore; full-screen on phone | Named region/dialog with focus management | **Fixed** — Rendered ✓ desktop focus in/out; phone dialog above tab bar |
| A4 | ⌘K unibox | Not a dialog; Escape only from the input; results not announced | Dialog + combobox/listbox | **Fixed** — `QuickCapture.test.tsx`; Rendered ✓ labelled dialog, announced highlight ("… 1 of 3. Enter to open.") |
| A5 | Phone Today row | Opens details only by swipe; VoiceOver users cannot open | Tap/keyboard path | **Fixed** — `ScheduleItem.mobileOpen.test.tsx`; Rendered ✓ 390px tap opens detail |
| A7 | Sheets/dialogs | Escape leaks from DomainGate/GoalsSheet/EmailReviewSheet to the panel; several sheets lack Escape/focus | Contained Escape, focus in | **Fixed** — `useDialogFocus` (+test) |
| A8 | Toasts | No live region; failures invisible to screen readers | Polite/alert live region | **Fixed** — `ToastLiveRegion.test.tsx` |
| A10 | /routines type-to-search | Swallows Space on focused buttons | Ignore Space and non-text targets | **Fixed** — `RhythmPage.test.tsx` |
| A11 | File upload drop zone | `<div onClick>` + hidden input — no keyboard upload | Keyboard reachable | **Fixed** — `FileUpload.test.tsx` |

### Low

| # | Observed | Status |
| --- | --- | --- |
| A0 | Sign-in: no `autocomplete` hints; errors not announced; "Signing in..." shown while creating an account; sign-up password hint on sign-in | **Fixed** — `AuthForm.test.tsx` (Rendered: signed-out page) |
| A9 | Detail panel close "×" ~12×20px on phone; title input unlabelled | **Fixed** |
| A12 | Icon-only buttons without names; placeholder-only inputs; Settings labels without `htmlFor` | **Fixed** (listed files; ~60 lower-traffic placeholder-only inputs remain) |
| L1 | Notes are not searchable from ⌘K although note results route correctly (`OmniboxResults` never passes notes) | Open — feature gap, not a defect |
| L2 | `/goals` and `/agent` have no nav entry (reachable only by links) | Open — intentional per prior decisions; confirm with Scott |
| L3 | Loading states missing on History, Contacts list, list items, House rooms (empty copy flashes first) | Open |
| L5 | Desktop with Shelves dock + detail panel open: the date wraps ("Tuesday, September / 22") in the squeezed column | Open |
| L6 | Settings General/Calendar tab strip draws the same stray phone scrollbar as R8 | Open |
| L7 | The "week isn't planned yet" banner sits in a live region, so it is announced on each Today load | Open |
| L4 | Desktop row is `role="button"` wrapping the checkbox and rail buttons | **Deferred** — restructuring the desktop row is higher risk; phone row fixed |

### Found during the rendered pass (signed in, preview build)

| # | Journey / state | Observed (Rendered) | Status |
| --- | --- | --- | --- |
| R1 | Inbox badge under a domain filter | Page listed 1 untagged capture while the nav badge showed none: the Sep 20 "untagged always shows" rule was never applied to the badge | **Fixed** — shared `filterInboxTasksForLayers`; `domainFilter.test.ts`; Rendered ✓ badge "Inbox 1" |
| R2 | Today, filtered and empty | "Nothing chosen yet" with no hint that Work-only hid the day's family tasks | **Fixed** — "Domain or person filters are on. Show everything"; `TodayView.journal.test.tsx`; Rendered ✓ 390px |
| R3 | Phone detail panel | Tab bar (z-40) and + button (z-50) drawn over the full-screen modal panel (z-30) | **Fixed** — `ShellLayout.test.tsx`; Rendered ✓ |
| R4 | Phone row title | `aria-pressed` on the title button (announced as a toggle) | **Fixed** — `ScheduleItem.mobileOpen.test.tsx` |
| R5 | Nav label | "Inbox, 1 items" | **Fixed** |
| R6 | Settings → Seasons, 390px | Month/day pickers clipped ("h" for March; day picker gone) | **Fixed** — rows wrap; Rendered ✓ |
| R7 | Meal shelf, 390px | Filter chips squeezed into 4-line columns; "Prep-friendly" off-screen; eyebrow lost its first letter | **Fixed** — chips wrap (+`aria-pressed`); eyebrow inset; Rendered ✓ |
| R8 | Mastheads on phone (Today, Week, Meals, Settings) | Stray scrollbar beside the date: the phone-wide `overflow-x: hidden !important` made the masthead a 3–5px scroll box | **Fixed** — `overflow-x: clip` exception in `index.css`; Rendered ✓ 0 scrollers |
| D1 | Phone Today, top of page | ~260px of controls (domain row, tabs, Goals, a prominent "Plan from paper" button, person filter, ⋯) above the date | **Implemented per Scott, awaiting review** — one row: compact tabs, icon Goals, one Filters control (areas + people, dot when on), ⋯; Plan from paper moved into Add. Date top ~345px → 151px at 390px; no overflow at 360/390. `PhoneFilterControl.test.tsx`, `TodayView.test.tsx`, `QuickCapture.test.tsx` |
| D2 | Inbox row actions | Nine inline actions per row | **Implemented per Scott, awaiting review** — Today / This week / Someday + More (other days, date, note, calendar, life area, delete); selecting hides row actions and the toolbar offers the same three with one Undo. Also fixed: "This season" wrote nothing. `InboxTriageActions.test.tsx` |

## Change log

Commits on `codex/claude-ux-assessment` since ed2efe40:

1. `a7c76b01` Shared More destinations (phone = desktop), phone sheet as dialog, domain switcher on Someday et al., no project dead ends, `/wall` redirect, sign-in form hints.
2. `d4a3c7ae` Someday filtered-empty.
3. `84434573` Failed saves surface; undo/confirm for destructive actions; filtered-empty Inbox/Routines; safer meal replace, family delete, calendar mappings.
4. `5f44dc15` Shared keyboard/screen-reader behaviour for menus, dialogs, toasts, detail panel, ⌘K, phone rows, uploads.
5. `c825907c` Inbox badge mirrors the page (R1).
6. `92611304` Today filtered-empty note (R2); singular Inbox label (R5).
7. `be09d28d` Phone panel layering (R3); row title semantics (R4).
8. `d7b77065` Phone layout: Seasons (R6), Meal shelf (R7), masthead scrollbars (R8).
9. `bec7686b` Phone Today header (D1).
10. `3dc4334d` Inbox triage simplification (D2).
11. Bulk triage correction (Scott's review): life areas for every unclassified item collected in one dialog before anything moves; `pushTask`/`setBucket` return their write result and the domain gate stops reporting failed writes as success; partial and total failures are reported; one Undo restores exactly the moved items. Tests: `InboxTriageActions.test.tsx` (cancel, mixed selection, partial failure + Undo, all-fail, Undo to Unsorted), `useGatedTaskActions.test.ts`, `useSupabaseTasks.test.ts`.
12. Second review correction: one `updateTask` is not one transaction — the row saves before its commitment/focus records, so `false` can follow a real change. Bulk triage now reports such rows as "may not have saved" (never "Nothing moved") and includes them in Undo; Undo awaits and checks every restore and leaves a persistent Retry for exactly the rows that failed. Tests cover a row write that lands before its records fail (data layer), unconfirmed rows in Undo, a failed chosen-for-today write, and failed batch/single-row restores with Retry. Not exercised live (it would require leaving test data half-moved); unit-tested only. A single-row Inbox move that returns false still shows no Undo, because there a false can also mean the domain question was cancelled.

Verification: typecheck clean; full suite 638 files passed (connectors
dependencies had to be installed locally for the WhatsApp adapter test); lint 0
errors on changed files (existing warnings remain); production build passed.
Rendered checks were on `vite preview` against production data in the test
household, desktop 1316px window plus same-origin 390px / 830px frames.

## Remaining gaps

- D1 and D2 are implemented to Scott's direction and await his review. Week/Month phone headers keep the separate domain row; only Today was changed.
- Open items: F12 `assigned_to_all`, F13 optimistic contact navigation, L1–L7,
  ~60 placeholder-only inputs on lower-traffic screens, desktop row semantics (L4).
- Failed-save paths other than ⌘K note were verified by unit tests only.
- Real-device / VoiceOver pass; the 390px checks used a same-origin frame in
  desktop Chrome, not a phone.
- Not deployed. Fresh-user research, cross-account privacy and provider sync
  remain out of scope and unclaimed.
