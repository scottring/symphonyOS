# Open journal — independent review, October 8, 2026

Scott approved Open journal after trying the connected-planning design. Claude implemented it in the existing isolated week-walkthrough-fixes worktree. Codex independently reviewed the code, exercised the real component fixture, and verified saving in the already-authorized disposable account.

## Verified outcome

- Month groups October entries beneath their visible Fall milestones; Week groups concrete weekly actions beneath October priorities. All parents remain available together, with a general section for unlinked work.
- Enter and the visible Add button create linked actions. Successful entry clears the sent words and restores focus. Changing/removing a saved weekly connection regroups the row correctly.
- A monthly priority remains context on Week until an action is explicitly added. It is not automatically copied or promoted into the weekly plan.
- Existing list/calendar views remain selectable. Open journal carries through the Month-to-Week onward action.
- Phone layout stacks each parent over its entries. Long tokens now wrap; reviewed Month row/title/main containers had no horizontal overflow at a 390px viewport. Week title/composer containers also fit.

## Signed-in persistence check

Used the existing disposable Taylor/Jordan household in the local application, with synthetic items only. Created `Journal test: picnic activities ready` beneath the existing Fall picnic milestone. A full page reload retained the new monthly item and its Fall connection. Followed the Month onward button to Week; Open journal was selected, and the new monthly item had no weekly actions yet. Added `Journal test: choose two picnic games` beneath it. A full reload retained the action and October connection.

This establishes the tested user's happy-path saves, not a comprehensive multi-account RLS audit. These two synthetic test items remain available for inspection. No real personal tasks were changed.

## Review issues resolved during implementation

1. Same task committed at parent and destination horizons could disappear from grouping: now retained and labeled explicitly.
2. Entry needed a visible touch/keyboard-accessible Add control, in addition to Enter: added.
3. Destination-period navigation needed protection from stale drafts and pending writes: period keys and scoped save handling added, with regression tests.
4. Preview fake always created a week commitment, so monthly entries disappeared: corrected to reflect destination period.
5. Preview lacked routing between pages: Month-to-Week now works and preserves its in-memory entries.
6. Long monthly titles overflowed phone rows: reproduced in browser, corrected, and visually retested.

## Independent validation

`NODE_OPTIONS=--no-experimental-webstorage npm exec vitest -- run` with these eight files: **63 tests passed**:

- `journalGroups.test.ts`
- `WeekV2.journal.test.tsx`
- `PlanPageV2.journal.test.tsx`
- `WeekV2.walkthrough.test.tsx`
- `MonthLink.test.tsx`
- `MonthLink.dnd.test.tsx`
- `PlanPageV2.onward.test.tsx`
- `CloseOut.decide.test.tsx`

The Node runtime's experimental global localStorage initially interfered with happy-dom cleanup. Disabling that runtime option resolved the environment failure; the production code was not changed to satisfy it. `npm run build` independently passed, including TypeScript; the existing large-bundle warning remains.

Browser fixture checks covered Month entry, whole-month onward navigation, explicit weekly action creation by touch-size Add button, repeated Week entry, saved-task linking/removal, and desktop/phone rendering. Fixtures reset on reload and are not persistence evidence.

## Evidence

- [Signed-in Month after reload](open-journal/independent/open-journal-auth-month.png)
- [Signed-in Week after reload](open-journal/independent/open-journal-auth-week.png)
- [Month desktop](open-journal/independent/open-journal-month-desktop-final.png)
- [Month phone](open-journal/independent/open-journal-month-phone-final.png)
- [Long title fixed on phone](open-journal/independent/open-journal-phone-long-title-fixed.png)

## Limits and next step

No push, merge, deployment, migration, account reset, invitation, or paid voice API call was performed. This implements the approved connected-entry view on Month and Week; it does not complete conversational voice onboarding or the entire foundational planning wizard. The disposable account has no connected calendar, so calendar-event integration was not retested. Pending-save page unload recovery is not established by these checks.

Review the updated local Open journal together, then prepare a release change after reconciling this worktree with other concurrent Symphony changes. Keep the full breadth-first planning flow as the separate onboarding target.
