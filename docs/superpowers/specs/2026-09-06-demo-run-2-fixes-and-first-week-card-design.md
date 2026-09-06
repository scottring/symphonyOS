# Demo run 2 fixes + the "Your first week" card

**Date:** 2026-09-06
**Source:** `~/Documents/scotts-world/projects/symphony-os/briefs/2026-09-06-demo-run-2-four-altitudes.md` (47 findings, ranked). This spec turns them into 16 changes and adds the onboarding card Scott chose ("card shape, go").

Decisions taken (Scott approved the list in chat): the review sheet asks Household/just-me and the domain once per page; commit lands on the page you filled; altitude pages open on the period you plan *for*; Fall starts Sep 1 by default; the page title wins over the calendar; no invented times; signups gated by the waitlist table, not a hard-coded list; the logout gets instrumentation and a graceful path, not a guess.

---

## Part A — Sharing and domain: one choice per page (findings A1.14, A2.2, A3.1, A4.1, A4.2, A4.3, A5.3)

### A1. Review sheet header gains a "For" row

Under the altitude blurb / period chip, a single row:

```
For   [Household ▾]     Domain   [Family] [Work] [Personal]
```

- `For` options: **Household** (everyone in the house sees it), **Just me**.
- Defaults: season/month/week pages → Household + Family. Year page → Household + Family as well (goals are household goals unless the page is clearly personal; the user can flip).
- Both choices apply to every row on commit. Per-row assignee still works; a row assigned to a member is Household regardless (assignment already shares — keep that rule).
- The choice is remembered per altitude in `localStorage` (`symphony.paper.for.<altitude>`, `symphony.paper.domain.<altitude>`) so a household that always writes Family pages never touches it again.

### A2. Commit writes scope + context

- `CommitPagePayload` carries `audience: 'household' | 'me'` and `domain: 'work' | 'family' | 'personal'`.
- `planItemToAddTaskArgs` sets `context: domain` and `scope: audience === 'household' ? scopeForDomain(domain, 'household') : 'individual'` (use the existing `scopeForDomain` helper so Family→`compound`, Work/Personal→`individual` unless assigned; keep whatever the helper already returns for a household-shared Work item).
- Goals: `goals` gets `scope` (migration, default `'individual'`) and its RLS select policy gains the same household clause tasks have. `addGoal` accepts `scope`; the year-page commit passes it. `/year` and the This Year fold read household goals.
- Notes committed from a page get the same `scope`.
- Routines: `RhythmPage` slot-add and the routine form get a **"Who"** control (the existing member picker) plus **"Everyone in the house"**; scope derives the same way. Slot-add under a person lens assigns that person; under Everyone it creates `scope: compound` (household) — that is the one behaviour change from 2026-09-05 ("lands `context:null/individual` when lens is Everyone").

### A3. The domain gate stops firing for page rows

Because every paper row now has a `context`, `DomainGate` no longer triggers on Do today / place / copy-down for them. No gate code change beyond: when a task has `context === null` **and** arrived via `capture_meta.source === 'page'` (older rows), the gate offers "Apply to all N items from this page" as a third line. (Cheap, and repairs the 53 rows already on the demo account.)

### A4. Discussion header says who can see it, and offers to share

`DiscussionThread` header: replace "Only you" with the audience line ("Only you" / "Alex + Edith" / "Everyone in the house"). When the task is `individual` and the household has >1 full user, show an inline **"Share with the house"** button that sets `scope` to the household value and keeps the thread. (A2.10, A4.3)

---

## Part B — Land where you planned, and look forward (A1.6, A1.16, A1.17, A2.1, A1.7)

### B1. After Add, navigate to the altitude page

`useCommitPage` returns the landing route; `PageFromPaperFlow` navigates after the toast:

| altitude | route |
|---|---|
| year | `/year` |
| season | `/season?start=<season_start>` (the season the rows were stamped with) |
| month | `/month?start=<month_start>` |
| week | `/week` (current week) — unless every dated row is in a later week, then `/week?start=<that week>` |

The toast stays ("Added 14 tasks and 3 goals to Fall 2026"); the count vocabulary matches the sheet (tasks / goals / notes, never folding goals into tasks).

### B2. Altitude pages open on the period you plan for

`PeriodPlanPage` (and the season/month folds) pick the *display period* with one helper `planningPeriod(today, boundaries, lists)`:

- If a `?start=` query is present, use it.
- Else if the current period has ≤ 14 days left (season) / ≤ 6 days left (month) **or** the current period's list is empty and the next period's list is non-empty → open on the next period, with a small line under the masthead: "Fall starts in 25 days · you're looking ahead" and a "This season" chip to go back.
- Else the current period.

The folds beneath (This Season on /month, This Year on /season) use the same helper, so they never show "· 0" while a planned period sits one arrow away.

### B3. Today looks forward on a clear day

`MastheadCard` subtitle on Today, when nothing is left today: "Tomorrow: Book Chicago flights" (first item of the next day with anything on it, up to 7 days out), else "Nothing on the board this week". All-day items print no time (A2.3). When today has a later timed item, keep "Next: … · 5:30 PM".

### B4. Default season boundaries

`seasons.ts` defaults become Winter Dec 1, Spring Mar 1, Summer Jun 1, **Fall Sep 1**. Households with a saved `households.seasons` are untouched. (A1.7)

---

## Part C — The sheet reads what the page says, and never invents a date (A1.8, A1.13, A1.10, A1.11, A1.15, A2.5, A2.7, A2.3, A1.2, A1.22, A1.24, A1.4, A1.18, A1.23, A2.4, A2.8, A1.12, A1.20, A1.9, A1.3, A1.5, A1.19, A1.25)

### C1. Page title wins

`parse-page` returns `page_title_period` when the title names a season/month/year ("Fall 2026", "September", "October", "2026"). `validatePageResult` maps it to a `seasonStart` / `monthStart`; the sheet's chip opens there (the client's date-based guess is the fallback only). The blurb reads "Your page says **Fall 2026**" when the title decided it.

### C2. Chip flip re-windows

Changing the season/month chip re-runs `applyWindow(items, newWindow)` client-side: rows whose original `dateHint` (the function now echoes the raw date it read, e.g. `"2026-12-12"`, even when it degraded the row) fall inside the new window become dated again; rows that fall outside degrade to the page's altitude with the date kept in the sub-note. No second model call.

### C3. No clamping, no invented times

- Function prompt + `validatePlanItems`: a date outside the window is **never** clamped. Out-of-window → placement = page altitude, `dateHint` kept, sub-note "Due Oct 1" (A1.11/A1.15).
- A row with a date and no time is `is_all_day: true` everywhere it is created (sheet commit, inline add, Do today).
- **Do today** (Today's pool dropdowns) writes `bucket: 'timed', scheduled_for: <today 00:00 local>, is_all_day: true` — never `now()` (A2.5).
- Inline add parser: when a weekday/date token is consumed, also strip a trailing preposition (`for|on|by|until|till`) left dangling at the end of the title; date-only → all-day (A2.7).
- Masthead "Starts with" / "Next" never prints a time for an all-day row (A2.3).

### C4. Goal sub-notes survive

`addGoal` accepts `notes`; the year-page commit passes the row's note. The sheet stops emitting emphasis-only sub-notes ("starred") — the function prompt says a ★ or underline is emphasis, not content; the client drops a note that equals `starred|priority|important` case-insensitively (A1.2, A1.3).

### C5. Assignment is a rule, not a vibe

Post-process in `validatePlanItems` (client) **and** `parseItems` (function), using `members[].role`:

- Line starts with `<Name>:` or contains `<Name>'s`:
  - role `parent`/`adult` → **assignee = that member** (they do it). Title keeps their name only if the line was "about" them (`Renew Edith's passport` stays; `Edith: sign form` → `Sign field trip form`, assignee Edith).
  - role `child`/`family` → **assignee = current user (Me)**, `contact_id` = the kid (about, not by) — except homework/school-work verbs (`finish|do|study|practice|read`) where the kid is the doer.
- Two lines about the same kid + same activity on one page get the same rule, so practice and game agree (A1.24).
- A goal row never carries an assignee (A1.4).

### C6. Day-facts and holidays

- A line that is a day-fact (`no school`, `holiday`, `day off`, `half day`, `<holiday name>`) becomes `kind: 'dayfact'` in the function output. Client: if a calendar event with the same name exists on that day → drop the row and show it under a "Already on your calendar" heading on the sheet (unchecked, informational). Otherwise commit it as an **all-day note on that day** (a `notes` row with `scheduled_for`), not a task with a checkbox. Both altitudes behave the same (A1.18, A1.23, A2.4).
- /week: all-day calendar events render in the all-day lane, never at 8 AM (A2.8).

### C7. Recurring lines and duplicates

- Function returns `recurring: { days: [...], until?: date }` when a line says "every/Sat mornings/thru Nov/weekly". Sheet shows a "Routine" badge and the row commits as a **routine** (weekly, those days, until) instead of a task; the user can flip it to a task via the kind select (A1.12).
- Before commit, the sheet runs a title-similarity pass against the user's open tasks (normalised title, Jaccard ≥ 0.6 on word sets, or one title contained in the other). Matches show a small line under the row: "Looks like *Get gutters cleaned before the leaves* on your Fall list · **Link** · Keep separate". Link sets `source_id` on the new row and keeps both (the ladder already knows what to do with `source_id`). Default is Keep separate (A1.20).

### C8. Sheet legibility

- The Goal **toggle** moves to the right of the When select as a ghost button "Make a goal" (pressed: amber "Goal" pill). The kind badge stays on the left (A1.9).
- Kind mapping: `call|phone|ring` → Message; `lunch|dinner|brunch at <place>` with a date → Appointment (Meal only when the line is a meal *plan*); `pick up dry cleaning|errand` → Task. A phone number in a line or note attached to a call row becomes `phone_number`, and the duplicate page note is dropped when its content is only the number (A1.19, A1.25).
- Areas: the year page creates no "General" area; goals with no area get `area_id = null` and /year renders them without a heading. `goal_areas` becomes optional in the UI (A1.5).
- Sheet row order = page order; /month and the pools list in `created_at` **ascending** (A1.21 minor, month "reverse order").
- Sub-note that repeats the title verbatim is dropped ("both kids").

---

## Part D — Pages and grid (A1.21, A2.9, A3.1, A3.2, A5.1, A5.2, A1.1, A1.0)

- **D1.** /month gains a "On the calendar" strip above the list: dated rows in that month grouped by day (A1.21).
- **D2.** /week month-fold rows: the → arrow is always visible (quiet), with tooltip "Place this week"; the fold heading says "Click → to bring one into this week" the first time (A3.1).
- **D3.** Weekend preset: if today is Sunday, show the coming Sat–Sun; masthead label "Weekend" (A3.2).
- **D4.** /week grid: items before the first visible hour render in a "Earlier" row above 8 AM with their time, not pinned into the 8 AM slot (A2.9).
- **D5.** Routine form modal: `max-height: calc(100vh - 2rem)`, sticky header (name + close) and sticky footer (Delete · Done), body scrolls (A5.1).
- **D6.** Routines WHOSE WEEK: the current user's lens includes routines they created with no assignee ("yours") — label the chip group "Whose week" unchanged, add a quiet "(includes unassigned ones you made)" tooltip (A5.2).
- **D7.** Camera modal: ignore `AbortError` from our own restart; on desktop with no remembered camera, the primary button is "Choose a file" and the webcam is secondary (A1.1).
- **D8.** Edge-function 401 anywhere in the app → `AuthExpired` toast "Your session ended — sign in again" + redirect to sign-in with `?return=<route>`; `usePageFromPaper` maps 401 to that instead of "Couldn't read the page" (A1.0).

---

## Part E — Auth, signup, invite (A2.6, S1, S2, S3)

- **E1. Session loss is visible and logged.** `useAuth` handles `SIGNED_OUT` when the previous state was signed-in and the user did not press Sign out: store `symphony.auth.lostAt` + the last auth error message (supabase-js exposes it via `onAuthStateChange` + `supabase.auth.getSession()` error), send a Sentry event `auth.session_lost` with `{reason, tabsOpen, expiresAt}`, and show the sign-in screen with "Your session ended. Sign in to continue where you were." + return-to route. Also set `auth: { lock: navigatorLock }` is already the default in 2.86 — add `debug: false` no-op; nothing else to change until the Sentry event tells us the reason.
- **E2. Signup gate = waitlist.** Migration replaces `check_allowed_signup()`: allow if email matches the existing allowlist **or** `exists (select 1 from waitlist where lower(email)=lower(new.email) and approved_at is not null)`. `waitlist` gains `approved_at timestamptz` and an admin-only update policy (`is_app_admin()`); the admin inbox task for a signup links to a one-click "Approve" in Settings → Admin (list of pending waitlist rows with an Approve button). Migration file only — Scott applies it in the SQL editor.
- **E3. Join page asks who you are.** `/join/:token` shows the household name + inviter ("Alex invited you to the Chen Household"), and if the household has unlinked `family_members` rows with `is_full_user=false` and `role_label` parent/adult, a chooser "Which one is you?" (chips) + "I'm someone new". Accepting calls `accept_household_invitation(token, member_id?)`; the RPC links `auth_user_id` + `is_full_user=true` for the chosen row (migration updates the function; the name-based auto-link stays as fallback) (S3).
- **E4. Household row on demand.** `useHouseholdInvitations.createInvite` (and any "No household found" path) calls `setup_household()` first when the user has no active membership (S2).

---

## Part F — "Your first week" card (onboarding)

A card at the top of Today for any account whose four steps are not all done. No modal, no coach marks.

```
┌ Your first week ─────────────────────────────────────────┐
│ ● Name your people                       done · 4 people │
│ ○ Snap this week's page        Plan from paper →         │
│      No paper handy? Use our sample page                 │
│ ○ Invite your partner          Settings → Invite →       │
│ ○ Add one routine              Routines →                │
│                                              Hide for now │
└──────────────────────────────────────────────────────────┘
```

- **Steps + done tests** (`src/lib/firstWeek.ts`):
  1. People: `family_members.length > 1`.
  2. Page: any task/note/goal with `capture_meta.source === 'page'` (or a `planning_sessions` row).
  3. Partner: any `household_members` row besides the owner, or an unexpired invitation.
  4. Routine: `routines.length > 0`.
- Each undone step is a real link into the existing flow. Step 2's "sample page" link opens `PageFromPaperFlow` pre-loaded with a bundled image (`public/sample/week-page.jpg` — the week page from this run with the names swapped to *Sam / Jo / the kids*) on the **week** altitude; the sheet shows the normal review. Rows from the sample commit are tagged `capture_meta.sample = true` and a "Clear sample" link appears on the card (deletes them) once the user has committed a real page.
- Done steps collapse to one line with a pointer: "Page added · see **This Week** →".
- The card hides itself when all four are done, or via "Hide for now" (`localStorage symphony.firstWeek.hidden.<uid>`, comes back after 7 days if steps remain).
- Existing accounts: the card shows only if ≥ 2 steps are undone, so Scott's real account never sees it.
- Copy lives in one file; no emoji; lucide icons.

---

## Testing

- Unit: `planParse` (windowing, re-window, no-clamp, assignment rule table, day-fact, recurring), `useCommitPage` (audience/domain → scope/context; landing route), `planningPeriod`, `firstWeek` done-tests, inline-add parser (dangling preposition, all-day), Do-today writer (midnight + all-day), `seasons` defaults, Weekend preset.
- Edge function `parse-page`: extend its test fixtures for `page_title_period`, `dateHint`, `dayfact`, `recurring`, role rule.
- Browser: re-run the four pages on the demo account after wipe; Edith's RLS read must show household rows; the sheet's For/Domain row; landing routes; Today forward look; the first-week card on a fresh account (`smkaufman+test1`).
- Migrations (Scott applies): `goals.scope` + policy, `waitlist.approved_at` + policy + trigger fn, `accept_household_invitation(token, member_id)`.

## Out of scope

- The actual cause of the logout (E1 makes it observable; fix follows the first Sentry event).
- Kiosk/wall and iOS parity for any of the above.
- Areas UI on /year beyond hiding "General".
