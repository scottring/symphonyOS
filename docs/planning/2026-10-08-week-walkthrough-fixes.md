# Week walkthrough fixes: Season, Month, Week and Today (2026-10-08)

**Branch:** `claude/week-walkthrough-fixes` in its own worktree (`.worktrees/week-walkthrough-fixes`), made from a freshly fetched `origin/main` (`d2146693`). It is kept separate from the voice-onboarding prototype, which sits on unmerged integration commits.
**Status:** implemented and tested locally. An independent browser review on the fixture harness checked rapid entry, link and unlink with no drag, phone controls clear of text, readable days at 1720px, and the week-start preview. An authenticated single-account follow-up then checked the main happy paths (see the limitations below and the independent review). Not committed, not pushed, not deployed. No migrations, no API spending, and no account data touched.

Source: Scott's live walkthrough of the production app on 2026-10-08, plus code review comments during implementation. This document is sanitized: findings are described generically, and the screenshots use made-up fixtures.

## Findings (observed in the walkthrough, then confirmed in code)

| # | Finding | What the code showed |
|---|---|---|
| 1 | After writing a Fall milestone, nothing in the page said what came next. Scott had to guess that the global Month tab was the next step. The same happened after writing October's priorities. | `PlanPageV2` offered the next horizon only after **Mark planned** (`justSaved.next` → `nextAfterSave`). At rest there was nothing. |
| 2 | A weekly action added without choosing its October line could never get one afterwards. | Checked before claiming absence:<br>- The Week row's ⋯ menu (`LineMenu`) had Done / Carry / Someday / Drop / today / All details only.<br>- The Details pane has no parent-link section.<br>- Day rows in the journal have no menu at all.<br>The only chance was the `for` select, **before** pressing Enter. `updateTask` already supports writing `source_id` alone. |
| 3 | The October reference column steered toward "complete it" or "add it to this week", not toward deriving weekly actions. | Each month row's one action was **Add to this week**, which moves the month line itself into the week (`takeIn`). |
| 4 | Rapid entry: the parent had to be reselected, and the cursor put back, after every action. | `WeekListV2`'s submit called `setForId('')` and `setDraft('')` right away, before the save resolved. A failed save therefore lost the words too. |
| 5 | Week journal readability: at about 1720 px with the October and list columns open, Thursday's title wrapped about one word per line. | `.wk-weekdays` was always `repeat(5–6, minmax(0,1fr))` above 1100 px. The window width decided the layout, not the room the days actually had. The full "↳ for October: …" text repeated in every narrow cell. |
| 6 | It took a long time to understand what happens to unfinished weekly work. | No page copy explained it. The trace below found that the look-back exists but nothing on the page points to it. |

**Withdrawn:** an earlier diagnosis of a broken month → season connection, based on a "Part of a goal" picker message. Scott corrected the reproduction: October's list was fine. Monthly linking was **not** changed because of it.

## What happens to unfinished weekly work (traced in code 2026-10-08)

This trace is the evidence behind the new copy. It comes from reading the code and is pinned by the tests listed further down.

- **Nothing moves forward on its own.**
  - No trigger, cron job or edge function carries week work.
  - A task committed to a week keeps an `open` commitment for that week. It leaves the next week's list because `weekListTasks` → `committedTo` match on the explicit `periodStart`.
- **The next week's "Plan the week" opens on Last week** (`WeekV2` `reviewIds`, `CloseOut`).
  - It lists last week's open rows that are undated or were dated before the new week, plus earlier unfinished work from `useDayPlan().unfinished`.
  - Each row gets a decision:
    - **Carry** — `keepForward`, which records `carried` → new `open`.
    - **Done**.
    - **Someday**.
    - **Drop** — `dropCommitment`, which records `removed`; the item lands in the Inbox if nothing else holds it.
    - **Leave it** — writes nothing.
- Today's ⋯ → **Review carried-over work** (`ReviewDrawer`) also lists stranded week items and slipped dated ones.
- **Gap fixed: nothing on the Week page said a review was waiting.** `reviewDue` was computed but never read.
- **Exceptions, not fixed here (documented):**
  1. **Legacy unstamped rows roll forward silently.** These are `bucket='week'` rows with `week_start` NULL and no commitments. They show on whichever week is current and are never asked about. The MCP `create_task` with `bucket:'week'` still creates them (inferred from `tools/symphony-mcp-server.ts`). The new copy names this case when it applies.
  2. **Dated rows written into the week with a day** (for example "… on Tuesday" → `dayNamedIn`) carry no week commitment. They reach the look-back only through the 14-day missed window. After that, only Today's drawer or Inbox › Expired shows them.
  3. **Filter mismatch.** `earlierLines` follow the top-bar people filter; last week's rows use `meId`.
  4. Before the old week's last day, the look-back offers nothing (`lookBackOpen`). This is by design.

## Implemented

1. **Onward navigation at rest**
   - Beneath a Season's or Month's whole list (only when it has an open line, never during a review or meeting) there is a clearly placed next step. It uses `onwardStep` in `planTally.ts`, which resolves the destination through the same `nextAfterSave` as after a save:
     - Fall → **Continue to October** — "Choose what you want to move forward in October. Fall's list stays beside it."
     - October → **Plan week 41 · Oct 4 – Oct 10** — "Choose a few doable actions… Not every priority needs something every week."
   - Destinations come from the period on screen. A season planned ahead hands to its own first month.
   - It never auto-advances; you can keep writing first.
   - It arrives with `{ write: true, ref: true }`, so the Week opens with the month beside it. Before, `writePlanView('week','ref')` wrote a key the Week page never read.
   - Week → Today: **Choose what to do today →** under the current week's list.
2. **Edit an existing weekly task's month line**
   - `MonthLink` makes the "↳ for October: …" annotation itself the control. It is the same on list rows and day rows.
   - Unlinked items offer "Link to an October line" (on hover/focus on pointer devices, always on touch).
   - The row ⋯ menu has the same option: Link / Change / Remove.
   - `monthLinkUpdates` writes only the link (`source_id`, or for older rows the `goal_task_id` that is actually shown), so id, day, assignees and completion are untouched.
   - **Remove** unlinks the relationship shown, even when its line is in another month. A row that is both written for a line and a step of another goal loses only `source_id`; the toast names the goal that now shows.
   - Undo restores exactly the fields written.
   - When `source_id` and `goal_task_id` name the **same** line, both are cleared, so the link really goes. A distinct goal relation is kept, as described above.
   - The menu is portalled, and portal events still bubble through the React tree into the draggable row. The menu therefore stops pointer, mouse, touch and key events at its own root and handles Escape and the arrow keys itself. Before this, a pick was read as a drag of the row and the link was never written (found in independent browser review).
3. **Add a weekly action from monthly references**
   - Each open month line shows **+ Weekly action** (always visible) under its words.
   - It chooses that line, lights its row, and puts the cursor in the add box. The month line stays in place.
   - "or put it on the week as is" remains as a quieter, secondary option.
4. **Rapid entry**
   - The chosen line is held by the page and shown beside the box ("Adding for October: …"), with Change (select) and Clear.
   - A successful save clears only the words that were sent; words typed during a slow save are kept. "Saving…" shows while it saves.
   - A second Enter during a save is ignored.
   - A failed save keeps the words and says so.
   - Focus stays in the box.
   - The choice is let go (not just hidden) when the week changes or the line stops being offered (done, filtered out, another account). It is never carried silently into another context.
5. **Readable day columns**
   - `.wk-days` is a size container. Days go 5 or 6 across only when each gets about 14 rem; otherwise 3 across, and a single agenda column below about 44 rem.
   - Font sizes are unchanged.
   - In day cells, the month link is one line, ellipsized, with the full text in its label and title.
   - The month reference rows put their actions under the words, so titles keep the column's width.
6. **Truthful unfinished-work guidance (`WeekOpenWork`)**
   - When last week left open work: "Last week left N open. Nothing has moved on its own." with **Decide what happens to them →**, which opens the look-back.
   - A "Not finished by Friday?" note explains:
     - The work stays on the week's record.
     - Next week's **Last week** asks about each item: bring it in / done / someday / let go.
     - If you know a date, give it that day — a day named in a title isn't a scheduled day.
     - When older unstamped rows are present, it says they stay on the current week.
7. **Look-back decisions are counted only when they save** (from code review)
   - Each writer is checked against its real contract: `keepForward` returns the id or `undefined`; `dropCommitment`, `toggleTask` and gated `updateTask` return `true`.
   - A failed decision keeps its card with "That didn't fully save, so it isn't counted as decided. The card stays here — try again."
   - The card persists even if the row has left the caller's list after a half-landed write (CloseOut snapshots its cards).
   - A Week carry retry re-reads the row: already committed to this week → only the old day is cleared. It is not carried twice.
   - While a decision is saving, Previous and every decision button are disabled, so a late save can't advance from the wrong card.
8. **Month-line menu width** (Scott's manual preview: the options scrolled sideways and were too narrow)
   - **Cause:** the menu is a grid whose items held `truncate` (no-wrap) labels. Grid items default to `min-width: auto`, so the longest label set the minimum width, and inside the old 320px cap with `overflow-y: auto` the menu scrolled sideways. The position also assumed a 300px width instead of measuring.
   - **Now:**
     - The menu is as wide as its longest line, up to 30rem, and never wider than the viewport less 8px each side.
     - Labels wrap whole: one `minmax(0,1fr)` column, `min-width: 0` items, `overflow-wrap: anywhere` for unbroken words. Nothing is cut or hidden.
     - The menu is drawn unseen, measured, then placed by `placeMenu` (`src/lib/ui/menuPlacement.ts`). It aligns left under its button, slides in to keep an 8px edge, and opens below or above, whichever has room, with a max height that scrolls vertically only.
     - The ⋯ menu's month submenu gets the same wrapping and measured, end-aligned placement. The ⋯ menu's other items are unchanged.
     - Keyboard handling and drag-event isolation are unchanged and still tested.
   - **Measured** in the fixture harness with long generic names (a 140-character line and a 68-character unbroken word), for all three menus — the row's link control, the day cell's control, and the ⋯ submenu:
     - 480px wide at 1440 and 1720px.
     - 374px wide (8px from each edge) at 390px.
     - Fully inside the viewport, no horizontal scroll, no clipped labels.
     - Focus goes to the menu on open.
     - Picking the long line links it.
9. **Phone completion circles** (independent review of the screenshots)
   - The cause is a pre-existing rule: the `@layer base` phone rule (≤768px) gives every `button[aria-label]` a 44px minimum width and height, which grew the 18px circle into its 20px column and over the title.
   - On phones the circle now keeps its size, and an invisible `::before` area around it takes the touch.
   - The new link and pill buttons get explicit phone sizes.
   - Measured at 390px: visible circles 18px (16px in day cells), at least 9px before the title, no overlaps. The area 8px outside the circle on each side hits the checkbox.

## Tests and evidence

- **New tests (47):**

  | File | Tests | Covers |
  |---|---|---|
  | `WeekV2.walkthrough.test.tsx` | 18 | Rapid entry:<br>- choose / focus / highlight<br>- several Enters share a parent and stay distinct<br>- switch and Clear<br>- **deferred-promise slow save keeps new words, shows Saving…, ignores a second Enter**<br>- failed save keeps text<br>- stale choice dropped (filter, week)<br><br>Link editing:<br>- link, change, remove via control and ⋯<br>- **legacy `goal_task_id` outside the offered month**<br>- **both-links case**<br>- day rows get the control only for week items<br><br>Look-back:<br>- last week's item absent from this week, signalled, carried with an explicit write<br>- **`keepForward` → undefined failure**<br>- **partial carry (kept forward, day clear failed, row leaves last week) keeps its card, retries without carrying twice**<br><br>Copy:<br>- guidance text, including the unstamped exception |
  | `PlanPageV2.onward.test.tsx` | 4 | Fall → October with ref/write state; a season ahead; the dated week; nothing offered on an empty list; no auto-advance |
  | `menuPlacement.test.ts` | 5 | Measured placement: under the button; slides to keep the right edge; held to a phone screen; opens upward without passing the top; end-aligned |
  | `MonthLink.test.tsx` | 4 | Keyboard: focus into the menu, arrows, Escape returns focus; no-op on the same line; a/an; long lines whole and wrapping, never truncated, and the menu placed |
  | `MonthLink.dnd.test.tsx` | 2 | **Under a real `DndContext`:** picking a line in the menu links it and starts no drag; Enter, arrows and Escape stay in the menu. Fails without the portal fix. |
  | `CloseOut.decide.test.tsx` | 2 | A false decision keeps the card through a caller-list change, then advances. **Deferred save:** Previous and decisions are disabled while it saves, and the decided card is the one that moves on (fails without the fix). |
  | `monthLinks.test.ts` | +6 | Appended to the existing 3, including the same-parent duplicate fields case |
  | `planTally.test.ts` | +4 | `onwardStep` |

- **Existing tests updated intentionally (1):** `WeekV2.sourceFirst.test.tsx` now expects the renamed month-row actions.
- **Checks:** `tsc -p tsconfig.app.json` is clean. `npm run build` passes.
  - `npm run lint`: 0 errors and 391 warnings, which is exactly the `origin/main` baseline. Every touched file has the same or fewer warnings than its `origin/main` version. An earlier draft of this report said "394, same as before"; that count wrongly included 3 warnings from this change, and all of them have since been removed.
- **Full suite:** 781 files run: 780 pass, with 8,118 tests passing (after the weekend follow-up). The one failure is the known `connectors/src/whatsapp/adapter.test.ts` (`@whiskeysockets/baileys` not installed in a fresh worktree).
  - The suite was run with Node 22.14.0. On newer Node, the Week screen tests may need `NODE_OPTIONS=--no-experimental-webstorage` (reported by the reviewer).
- **Visual checks:**
  - The real `WeekV2`, `WeekJournal`, `WeekListV2` and `PlanPageV2` were rendered with **generic fixtures** in a no-write Vite harness. Data hooks are aliased to in-memory fakes, and the real CSS is used.
  - The harness is kept in the repo for review as `scripts/plan-fixture-harness/`. It is not part of the app build or `tsconfig.app.json`. Launch it with:
    - `npx vite --config scripts/plan-fixture-harness/vite.config.ts`
    - then open `http://localhost:5233/scripts/plan-fixture-harness/index.html`
    - optional `?ref=0` hides the month; `?page=season` or `?page=month` shows those pages.
    - Writes are slowed by 400 ms and stay in memory.
  - The only console error at load is the harness's missing favicon (404).
  - Widths: 1720 with the month open, 1440, 1280, 1720 with the month hidden, 1024, and 390.
  - No horizontal page overflow and no page errors.
  - Day columns at 1720 with both panels: 3 across at about 328 px each (before: 6 across at about 160 px).
  - Rapid entry, the link menu, the note and the Season/Month onward blocks were driven with Playwright and checked visually.
  - Screenshots are in [`week-walkthrough-fixes/`](week-walkthrough-fixes/).

## Weekend follow-up: week start and the split weekend (2026-10-08)

The authenticated test account uses Sunday-start weeks, so its weekend band showed Saturday alone. Scott expected Saturday and Sunday together, and his real week runs Saturday to Friday. Neither the account's setting nor any real week boundary was changed. Two things were done:

1. **The fixture is explicitly Saturday-start, everywhere.**
   - The harness aliases `@/lib/cadence/config` to `mocks/cadenceConfig.ts`, so the fixture week's anchor and every module that reads the cadence (week numbers, the Week page) get one answer.
   - That answer comes from `?weekStart=sat|sun|mon` and defaults to Saturday. It never comes from localStorage or the account.
   - A visible "Preview the week starting on Saturday · Sunday · Monday" control changes only the URL, wraps on narrow screens, and says "preview only, not your setting".
   - Fixture weekend items are placed by real date: a Saturday task, a task on the Sunday right after it, and a weekend task with no day.
2. **A split weekend is described honestly.** A Sunday-start week holds the end of one weekend and the start of the next; its Saturday is the last day and that Saturday's Sunday is next week's first. The days stay in date order:
   - this week's own Sunday leads the weekdays;
   - the next Sunday is never pulled in, and Sunday-at-the-top is never paired with Saturday-at-the-end.

   The band now says so: "The weekend · Sunday Oct 11 is in next week". Its "Sometime this weekend" reads "once for the weekend" instead of "once for both days". The "both days" wording and the Saturday-or-Sunday drag hint are kept for weeks where both days are present.

**Evidence:**

- **Tests:** +8 (5 in `journalDays.test.ts`, 3 in `WeekJournal.grid.test.tsx`); the weekend files total 39 tests.
  - For each week start: seven consecutive days, with the weekend at 0/1 (Saturday start), 5/6 (Monday start) or 6/none (Sunday start).
  - A Sunday-start week never includes the next Sunday or its task, and its own Sunday stays first.
  - A split weekend keeps its weekend task once.
  - Rendered copy for the split and paired cases.
- **Harness:** measured headless at innerWidth 1440 and 390, for each week start:
  - **Saturday:** Oct 3–9. That weekend was already past on Oct 8, so it folds to "Sat 3 – Sun 4"; opened, the band holds Sat 3 and Sun 4 side by side.
  - **Sunday:** Oct 4–10. Saturday 10 is alone, with "Sunday Oct 11 is in next week", and the Oct 11 task is absent.
  - **Monday:** Oct 5–11. Sat 10 and Sun 11 sit at the end.
  - No page overflow, no cadence key written to storage.
  - The reviewer's own browser measured a 433px CSS viewport for its narrow check (reported in the independent review).
- **Screenshots** (in `week-walkthrough-fixes/`): `weekend-sat-open-1440.png`, `weekend-sun-1440.png`, `weekend-mon-1440.png`, `weekend-nav-390.png`, `weekend-sat-band-390.png`.

**Unchanged:** a Saturday-start weekend that is already behind still folds to one line until opened (existing behaviour from 2026-10-05). The Sunday at the top of a Sunday-start week is shown as an ordinary day, not labelled as the previous weekend's.

## Not verified, and remaining limitations

- **Signed-in testing covers single-account happy paths only.** The independent reviewer's authenticated follow-up, using a disposable account on the real local build, passed these checks after full reloads (see [`2026-10-08-week-independent-review.md`](2026-10-08-week-independent-review.md)):
  - the Season → October → dated week onward steps;
  - two weekly actions sharing one month line;
  - choosing one for Today and completing it;
  - removing and restoring an existing action's month link;
  - last week's item surfacing in the review without moving by itself, and an explicit carry.

  Still **not verified:**
  - multi-account authorization and RLS;
  - realtime echo;
  - drag-and-drop persistence;
  - backend write failures (covered by regression tests only, never induced in an account);
  - safety when navigating away during a pending write. In that run, one completion followed immediately by a reload did not persist.

  The fixture harness itself is component-level and has no app shell.
- **Drag and drop:** the code paths are unchanged and the existing tests pass, but dragging was not re-checked by hand in the new 3-across layout. Long titles and completed rows were checked in the harness.
- **Month/Season look-back failures are only code-verified.** `PlanPageV2.decide` now returns `false` when `keepForward` returns `undefined`, or when `toggleTask`, `dropCommitment` or the gated `updateTask` don't return `true`. No page-level test drives a Month/Season failure; the shared `CloseOut` behaviour is tested directly.
  - `keepForward` also returns `undefined` when the line carried but its steps did not. A retry then calls `keepForward` again, and whether that succeeds on an already-carried row is **unverified**.
  - `CloseOut` still counts a callback that returns nothing (`void`) as success, for compatibility. Both current callers (Week, Month/Season) return booleans.
- **Phone hit area** is enlarged only at ≤768px, where the base-layer 44px rule applies; desktop circles are unchanged. Other labelled buttons inside week rows on phones keep the global 44px minimum.
- **Legacy unstamped week rows** still roll forward silently, and MCP `create_task` can still create them. Fixing this needs a data decision and a writer change, so it was left out of scope.
- **Dated week rows without a week commitment** resurface only through the 14-day missed window.
- New weekly actions linked to a month line set `source_id` only, not `goal_id`. This matches the existing composer.
- No onward block on the Year page, and no end-of-day copy on Today. Both are possible follow-ups using the same pattern.
- The "Its day passed" and missed-day handling inside a week is unchanged.
