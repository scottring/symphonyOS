# Open journal on Month and Week (2026-10-08)

**Branch:** `claude/week-walkthrough-fixes` (`.worktrees/week-walkthrough-fixes`), on top of the manual-walkthrough fixes in the same branch ([`2026-10-08-week-walkthrough-fixes.md`](2026-10-08-week-walkthrough-fixes.md)).
**Status:** implemented and tested locally; uncommitted. Nothing pushed, merged or deployed. No migration, no API spending, no account settings, no invitations, no real personal plan edited.
**Independent review:** [`2026-10-08-open-journal-independent-review.md`](2026-10-08-open-journal-independent-review.md).

Scott chose **Open journal** after the interactive design walkthrough (design reference: `connected-planning.html`, Open journal variant only — not Focus cards, the carousel, the comparison shell, or its sample data).

## What it is

On a destination horizon, each line of the period above stays visible beside what this period writes for it.

- **Month:** each Fall line stands on the left. On the right are October's lines for it, followed by an add box "What would move this forward in October?".
- **Week:** each October priority stands on the left. On the right are this week's actions for it, followed by an add box "What can you do this week for it?". A priority can have several actions.
- **Everything else:** work tied to nothing above has its own section with its own add box, so direct capture of unrelated work stays possible.
- **The whole horizon on one page:**
  - Nothing drills one goal down to Today.
  - Untouched lines say "Nothing for October yet — leave it for later if it can wait."
  - The footer counts how many have nothing yet.
  - One onward step serves the whole page, in its footer.
- **Phones:** each parent stands above its entries.
- **It is a planning view, not a setting.** A "View: Lists · Open journal" switch sits on the Month and Week pages.
  - The choice is remembered on this device only (`symphony-plan-layout.month` / `.week` in localStorage).
  - **Lists stays the default**, so nobody's page changes under them. Making Open journal the default is Scott's call, and a one-line change in `planLayout.ts`.
  - An onward step taken in the journal opens the next page in the journal for that visit (router state). Nothing is stored, and no line moves.
- **The rows are the pages' own:**
  - Month uses `PlanLine`; Week uses the week row, `WeekCard`, exported from `WeekListV2`.
  - Done, people, life area, "when", ⋯, details and drag onto the days or calendar work as in Lists.
  - The Week days grid and the Month "Dates we can't move" calendar stay on the page.

## Relationships: existing fields only (no schema change)

Inspected before designing. Code: `src/lib/planning/journalGroups.ts`.

**Week item → month line:** `source_id`, else `goal_task_id`.
- This is exactly what `linkedLine` (the "↳ for October" annotation) reads, using its first-set rule.

**Month line → season line:** `source_id`, else `supports_goal_task_id`, else `goal_task_id`.
- `source_id` means written for / copied down from.
- `supports_goal_task_id` is a v1 month goal backing a season goal.
- The first link that names a visible Fall line wins.
- `goal_id` is the year goal and is never treated as a season parent.

**New links are written to `source_id` only.**
- `goal_task_id` means "is a step of", and steps are carried when their goal moves.
- New weekly actions keep the existing composer's behaviour of not setting `goal_id`.

**Relink and remove**, from the row's own "↳ for Fall / October" control or its ⋯ menu:
- Writes only the link fields, on the same row.
- Remove clears the field that is shown, plus any other field naming the same line. A different line named by another field is kept, and the toast says it now shows.
- Undo restores exactly what was written.

**One row, two commitments.** A month line taken into the week (or a season line into the month) is a single row with two commitments. It stays visible, as itself, in its own section, labelled "This October line itself is on the week". It counts as that priority's action.

**Parent completion is separate.** The Week journal gives each October priority its own "Mark done" / "Reopen" control. Ticking actions never ticks the priority. The Month journal shows a done Fall line as done and has no Fall tick of its own; that stays on the Season page.

**No implicit promotion.** Writing an action never moves, copies or changes the line above. Tests assert that no update or push call happens. "Put it on the week as is" remains, quiet, in Lists.

## Privacy and filters

- **Parents** are the reference rows each page already shows, in the reader's own scope: Month uses `aboveRows` (season, `meId`); Week uses `refMonths` (month, `meId`).
- **Entries** are the main rows as already filtered by domain and the people lens.
- **An entry whose parent is outside the visible reference** goes to Everything else. No group, title or count is made for it. That includes a parent only another person can see, a line in another period, or one removed by a filter.
- **Unchanged from Lists:** a Week row's own "for October: X" annotation reads `linkedLine` over the page's domain-filtered tasks, so a parent that is visible elsewhere in the app but outside the reference scope can still be named on the row.
- **New items** use the add row's life-area choice (`useAddArea`), the same gate as Lists.
- **Fall lines** are still created on the Season page. The journal's "Add to Fall's list →" opens it ready to write.

## Entry safety (`useSafeAdd`, shared by both journals and both Lists add boxes)

- **Enter or the visible Add button** adds. The Add button's label names its section, for example "Add to Plan the autumn trip", and changes to "Adding to …" while saving. Typing is never disabled.
- **One save at a time per box and period.** A second Enter while saving is ignored, so nothing is added twice.
- **On success**, only the words that were sent clear, so anything typed meanwhile stays. On failure the words stay and an alert says so. The cursor stays in the box either way.
- **Contract:** `onAdd` resolves `false` (or throws) when nothing was stored. The page adapters return an explicit boolean from `addTask`'s id.
- **Drafts belong to their period.**
  - Journal sections are keyed by destination period plus parent, so October's and November's boxes for the same Fall line are different boxes.
  - The Lists boxes key their draft and failure note by period.
  - A save still running for October lands in October and never clears or flags November's box. November's own add does not wait for it.
- **Month's existing Lists add box** used to discard `addTask`'s result and clear immediately. It now clears only once the line is stored.

## Fixture harness (no writes)

- **Launch:** `npx vite --config scripts/plan-fixture-harness/vite.config.ts`
- **Month journal:** `http://localhost:5233/scripts/plan-fixture-harness/index.html?page=month&layout=journal`
- **Week journal:** `http://localhost:5233/scripts/plan-fixture-harness/index.html?layout=journal`

The harness now has routes (`/season`, `/month`, `/week`), so Season → Month → Week can be walked. `/today` says plainly that it isn't part of the harness. Fake commitments follow each add's real period: week, month, or quarter → season. Previously every add got a week commitment, which hid Month adds; that was a fixture bug, not product data loss.

The fixtures include:
- four Fall lines, one left untouched;
- October lines linked by `source_id` and by the older `supports_goal_task_id`;
- unlinked lines;
- a line linked to a Fall line only another person can see;
- an October line also committed to the week;
- several weekly actions per priority;
- a long sentence and a long unbroken word.

## Evidence

- **New tests (33):**
  - `journalGroups.test.ts` (10): mapping by each link field and order, hidden parents, the week matching `linkedLine`, the same row in two periods, self-links, untouched counts, and relink/remove.
  - `WeekV2.journal.test.tsx` (14): sections and Everything else; the hidden priority (no title); the line itself on the week; days and "when" kept; the device-only switch; Enter and Add with parent and area while keeping focus; no promotion; slow save; failure; parent done kept separate; linking from Everything else; footer and a single onward; another week's boxes.
  - `PlanPageV2.journal.test.tsx` (9): Fall sections via `source_id` and supports links; the hidden Fall line; adds with `source_id` (never `goal_task_id`) and no promotion; slow and failed saves; Lists success-only clearing; relink and removing the legacy supports link; one onward step carrying the journal; month change for the journal and for Lists.
- **Period-navigation regressions:** the three month/week-change tests fail without the period keys and pass with them (checked).
- **Affected files:** 6 files, 61 tests pass. The independent run reports 63 tests across 8 files.
- **Full suite (Node 22.14.0):** 783 of 784 files and 8,151 tests pass. The one failure is the known `connectors/src/whatsapp/adapter.test.ts`, whose dependency is not installed in a fresh worktree.
- **Checks:** `tsc -p tsconfig.app.json` is clean, `npm run build` passes, and `npm run lint` reports 0 errors and 391 warnings (the `origin/main` baseline).
- **Visual checks (headless Chrome, fixture harness)** for both journals at innerWidth 1720, 1440 and 390:
  - parent beside its entries on desktop and stacked above them on phones;
  - no page overflow and no text overflowing its box;
  - Enter twice in a box adds two rows under that parent and keeps focus in the same box.
- **Long-token fix:** month rows (`.pv2-line-text`, an open line's fold) now wrap long unbroken words. In the journal on phones, rows keep inside their column (no 12px bleed). Found in independent review: a 466px token in a 147px box.
- **Screenshot artefact:** Playwright full-page captures sometimes show a border on month rows. The row's border sits under a `min-width: 768px` rule with a colour transition, and at rest its computed colour is transparent. The screenshots in [`open-journal/`](open-journal/) are element captures without the artefact.
- **Signed-in check (independent reviewer):** single account, the existing disposable test household, local app on 127.0.0.1:5234.
  - Added a monthly line under an existing Fall milestone. A full reload preserved the row and its Fall link.
  - Month's onward step opened Week already in Open journal. The new monthly priority stayed as context, with zero weekly actions until an explicit add.
  - Added a weekly action beneath it. A full reload preserved the row and its October link.
  - Screenshots: `/private/tmp/open-journal-auth-month.png` and `/private/tmp/open-journal-auth-week.png`.
  - An unrelated existing "calendar not connected" warning remains.

## Remaining limits

- **Default view is Lists.** Open journal is one click away and remembered per device. Changing the default is not done.
- **Scope:**
  - Month, at rest only (the close-out, the meeting and a guided review use Lists).
  - Week, at rest and the "Write the week" step.
  - Season and Year are not done.
- **Week duplication:** a week action with a day appears under its priority (with its "when") and on its day in the grid below.
- **Week drop target:** the journal has no "drop here to clear its day" target. Use the row's "when" control, or Lists.
- **Not verified signed in:**
  - multi-account authorization and RLS;
  - realtime echo;
  - drag-and-drop persistence;
  - backend write failures (covered by mocks only);
  - navigating away during a pending write.

  The signed-in check covered single-account happy paths only. Mocked tests prove page logic, not database permissions.
- **Unchanged from Lists:** a Week row in Everything else can still name a parent that is outside the reference scope but visible to the reader through the page's own task list (see Privacy above).
- **Legacy unstamped week rows** still roll forward silently. This is unchanged, and described in the walkthrough-fixes report.
