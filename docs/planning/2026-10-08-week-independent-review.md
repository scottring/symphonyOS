# Independent review of the manual planning fixes

Reviewed in the isolated `week-walkthrough-fixes` worktree on October 8, 2026. These changes have not been deployed by this review.

## Verified

- Independent runs passed 72 tests across nine affected files after the review fixes: Week walkthrough, source-first behavior, steps, monthly linking, onward navigation, tally, CloseOut failure/navigation behavior, and two real-DndContext portal regressions. The production build was rerun successfully after the portal and phone fixes.
- TypeScript passed, production build passed, and lint reported zero errors. Lint has repository warnings; the independent run reported 401 while the fixture harness was being finalized.
- In the running no-write fixture using real Week components and CSS, selecting one monthly priority and entering two weekly actions retained that parent and keyboard focus. Both actions appeared independently.
- Linking an already-created weekly action initially triggered dragging through the React portal. This was reproduced in the browser and reported to Claude. After event isolation was added, linking and removing the monthly relationship both succeeded in the browser.
- At 1720 pixels the days remained readable with the monthly reference and weekly list present. At 390 pixels the initial checkbox/text overlap was reproduced from screenshots; the revised layout keeps completion controls clear of titles.
- Failed carry-forward returning `undefined`, partial carry retry, old duplicate link fields, and backward navigation during a pending decision were reviewed and regression-tested.

## Evidence and limits

Independent screenshots are temporarily saved at `/private/tmp/symphony-week-independent-desktop.png` and `/private/tmp/symphony-week-independent-phone.png`. The implementation report contains additional repository screenshots. The fixture can be opened at `http://localhost:5233/scripts/plan-fixture-harness/index.html` while its local server is running.

This is component-level, in-memory validation, not authenticated database testing. Reload persistence, realtime updates, authorization policies, drag-and-drop in the revised grid, and a complete real-account review should be checked before release. The fixture intentionally discards changes on reload. The voice-onboarding prototype is a separate workstream and these checks do not validate live voice or that prototype's real-plan integration.

See `2026-10-08-week-walkthrough-fixes.md` for the carry-forward exceptions, scope, and implementation details. The earlier diagnosis of broken Month-to-Season linking was withdrawn; the reproduced defect concerned saved Week actions linked to Month items.

## Authenticated follow-up

In the authorized disposable account, using the real local build on port 5234:

- Created a clearly labeled sample Fall outcome. Continue to October appeared and opened October with the Fall reference visible.
- Created an October priority and followed the dated Plan week action. The reference stayed available.
- Selected the monthly priority once and created two weekly actions. Both actions and both monthly links survived a full reload.
- Chose one existing weekly action for Today. The life-area gate appeared; choosing Personal completed the placement. Today showed the same action and its monthly source.
- Completed that action, observed Task completed and Completed 1, then reloaded. It remained in Completed with Mark incomplete available. The second action remained open in the week reference.
- One initial completion click followed immediately by reload did not persist; after observing the completion confirmation before reload it persisted. Do not claim resilience to navigating away during a pending write from this test.

No account was wiped and no real personal plan was edited. No calendar was connected. Sample items remain for inspection. This follow-up does not establish multi-account authorization coverage. Screenshot: `/private/tmp/symphony-authenticated-today-check.png`.

### Link editing and next-review persistence

- Removed the October connection from the existing supplies action, observed the confirmation, and reloaded. It remained unlinked. Restored the October connection and reloaded again; the same action retained its connection and Taylor assignment.
- Added `Walkthrough test: carry picnic checklist forward` to September 27–October 3. Returning to October 4–10 showed the explicit unfinished-work prompt and did not automatically add the action to this week's list.
- Opened the last-week review and chose Carry to this week. The review showed Last week is closed and Carried to this week. After leaving review and a full reload, the action appeared in the current week's Any day list with its Taylor assignment, and the previous open-work prompt was gone.
- Evidence: `/private/tmp/symphony-authenticated-carry-check.png`.

These checks close the authenticated happy-path gaps for after-creation link editing and deliberate carry-forward. Failed backend writes were covered by regression tests, not deliberately induced in this account. Pending-write unload safety, multi-account authorization, and drag-and-drop persistence remain outside this verification. The test account uses Sunday-start weeks, leaving Saturday alone in its weekend band; matching Scott's expected Saturday/Sunday grouping remains a separate layout/preference follow-up. Nothing was pushed, merged, or deployed during this verification.

### Weekend follow-up

The preview now explicitly defaults to Saturday-start using a fixture-only cadence override. Its visible Saturday/Sunday/Monday links change the preview URL, not any account preference. Independent browser checks confirmed Oct 3–4 together for Saturday-start and Oct 10–11 together for Monday-start. A Sunday-start week remains Oct 4–10: the band explains that Sunday Oct 11 is in next week and says "once for the weekend" instead of misleadingly saying "both days". Dates remain chronological; no extra day was pulled into the week.

An independent run passed 39 tests across WeekJournal.grid, journalDays, and weekendBand, including the new split-weekend and task-boundary cases. Preview controls wrap in the narrow browser view with no horizontal page overflow (actual measured CSS viewport 433px, despite a requested 390px override). Temporary viewport override was reset. Screenshots: `/private/tmp/symphony-weekend-verified.png` and `/private/tmp/symphony-weekend-phone.png`. Scott's real household week-start preference was not changed; the preview mismatch is resolved without changing production week boundaries.
