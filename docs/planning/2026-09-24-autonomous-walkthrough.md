# Autonomous walkthrough — 2026-09-24

Scott authorized Codex to take over clicking and input and continue the complete walkthrough. Tested the signed-in demo account through localhost:5199. No production deployment, merge, real-account reset, or handwritten-plan import was performed. This is a functional coverage record, not a release approval.

## Coverage and evidence

| Storyline | Walked | Result |
| --- | --- | --- |
| 1: Start with tasks/calendar/routines | Quick Add → Inbox → cancel domain gate → retry with Family → Today → complete | Passed in UI. Destination confirmation appears; duplicate completion/capture notifications remain. Both new completed tasks were visible together on Today at the end. |
| 1: Calendar | Natural-language event preview for tomorrow September 25, 2–2:30 PM | Parser displayed intended event. Create Event was blocked by automatic approval review because the connected primary calendar destination was unverified. No event created; explicit question remains pending. |
| 1: Routine | New weekly flexible routine → All Day occurrence → complete → reload → reopen → unchoose → pause → reload | Passed. All Day untimed, template remained flexible, paused routine appeared under Resting routines. Existing routine unchanged. Editor said select at least one day even though flexible weekly save succeeded. |
| 2: Month/week/day | Scott's preceding walkthrough covered goal → steps → specific week → day → completion/reopening → removing day/week | Carry forward earlier evidence; not a fresh exhaustive retest. Known wrong-month Keep action was repaired before this pass. |
| 2: Reopen existing plan | Plan October with existing goal and 3 tasks → Next save → Save October → reload | Existing goal and all 3 tasks preserved, no visible duplicates. Summary still misleadingly said Nothing chosen / Nothing saved yet. This closes the previously untested save in S3-04; wording remains open. |
| 3: Year/season/month | Create Fall goal selecting existing yearly home-maintenance goal; add linked supporting task; save; reload; pull task into viewed October | Save and reload retained season goal/task. Pull-down initially wrote September: blocker S3-01. Claude repaired and restored only the new task; rebuilt UI then showed it in October. Year-to-season relationship persistence is NOT verified: Claude notes goal_id null; investigate actual storage before claiming link passed. |
| 4: Review/change | New task week Sep20 → review Keep into Sep27 → save/reload → next review Someday → save → Someday page → Do today → Today → complete | Passed UI. Existing oil-change task left open in its original week. Someday save required a domain selection, chosen Personal for this test task. |

## Blocker repair observed

Commit d7bbf4fd fixes PeriodPlanPage pullDown to name the viewed month explicitly, rather than default to the clock's month. Claude performed the identity-checked restoration of new task de558463… from September to October. Codex verified the rebuilt October UI contains it and the original Islanders goal and two supporting tasks remain. Database restoration/test claims belong to Claude; Codex independently verified UI, source commit presence, and clean tree before this documentation addition.

## Remaining findings

- S3-02: yearly relationship absent from saved season list; possible persistence problem, not merely presentation. Existing year-goal detail does not show seasonal support, and Shelves there falls back to today's chooser.
- October shows “Link to goal” on the new maintenance task even though it already supports a seasonal goal. Higher-period context is lost in this view.
- Planning session reference offers Add to October for work already on October; did not click a second time, so duplicate behavior untested.
- Empty future Week says “No week tasks match this person” without a deliberate people filter. Misleading empty-state diagnosis.
- Weekly routine editor requires a weekday in its text but accepts no weekday as Flexible day.
- Two Undo notifications for one routine completion; duplicate capture notifications.
- Existing open findings remain: Week reload loses viewed week; Plan overlaps hover controls; detail date and day-removal discoverability; calendar count/duplicate/range problems; total versus open counts; disabled month/season goal Archived.
- Calendar duplicates were not visible after rebuilt-page reload; this does not prove the original stale/duplicate rendering problem fixed.

## Data intentionally left for inspection

- Fall goal: Have a manageable weekly home-maintenance routine in place by the end of Fall.
- Its supporting task: List recurring home-maintenance jobs and agree who handles each — visible in October after repair.
- Weekly home-maintenance check (walkthrough) — paused/resting, no chosen occurrence left.
- Check smoke-detector batteries (walkthrough) — completed on Today.
- Review carry-forward check (walkthrough) — carried forward, deferred, returned to Today, completed.
- Original Islanders goal/two tasks, yearly goals, oil-change task, and Pack bags for school routine left unchanged by this autonomous pass.

## Explicit coverage limits

Not signed off: external calendar write, paper analysis/revision (separate workstream), year-to-season relationship persistence, review Drop and Done verdicts as separate branches, failed-network recovery, real-phone keyboard/safe areas, cross-household permissions, and every historical-data case. Do not label all flows green. The next work should address correctness gaps first, then a coherent usability mockup and re-walk; do not build onboarding around workarounds.

## Resumed verification after cc88a8b0

### Follow-up: Drop and connection failure

- Created `Review Drop branch (walkthrough)` in Oct11–17; reviewed from Oct18–24 and selected Drop. Summary explicitly said the task is kept. Saved; item appeared in Inbox as incomplete and survived reload. No carry into Oct18–24 was visible. Drop now has a separate live check.
- Used Chrome DevTools Network Offline on only the test tab, with the narrow viewport exposing the Inbox phone capture field. Submitting `Failed-save recovery check (walkthrough)` via Enter failed with two visible Failed to add task messages; the field retained its text.
- Restored No throttling before retry. Clicking the field's Add button did not yield a visible saved item; after leaving/reloading, only the Drop fixture remained. This is a suspected retry-button/focus issue, not yet a confirmed application root cause. Re-entering the same text and submitting with Enter online succeeded; one instance appeared, persisted on reload, and Inbox counted exactly these two items. DevTools closed and No throttling restored. Do not label the button retry fully passed. No global network settings changed.
- Goal-support commits now 5eaaa7de and e5ea4074. Independently inspected migration and ran `bash scripts/test-goal-support-locally.sh`: all 12 local SQL assertions passed. Initial sandbox attempt could not allocate PostgreSQL shared memory; approved out-of-sandbox local-only run passed and exited cleanly. This minimal-schema harness does not constitute authenticated production/RLS end-to-end validation. Shared migration still not applied by Codex; new relationship UI awaits it and a preview rebuild.

- **S2-25 seven-day Week: live pass.** Paged Sep20 → Sep27 → Oct4. URL became `/week?start=2026-10-04`. Reload retained Oct4–10, browser Back returned Sep27–Oct3, Forward restored Oct4–10. Weekend/custom ranges not tested.
- **Review Done: live pass.** Created only `Review Done branch (walkthrough)` in Oct4–10. Advanced to Oct11–17, reviewed prior week, selected Done for that fixture, inspected summary naming Oct4–10, and saved. Reloaded and reopened review: fixture appeared under `Finished the week of Oct 4 – Oct 10`. Left fixture completed. Original records untouched. This supersedes the earlier Done coverage limit; Drop and failed-save recovery remain unverified live.
- Goal-support work was still uncommitted when checked. Claude's terminal acknowledged preserving the compatible dist preview while preparing the shared-schema migration. No shared migration or deployment was authorized by Codex.

## After Scott approved the goal-support migration

This section supersedes earlier pending-migration and hierarchy coverage notes. Claude applied only the reviewed migration and recorded target/schema checks, all 12 rollback-only SQL assertions, zero leftover proof rows, and the rebuilt preview in `2026-09-24-goal-support-migration-review.md`. Codex independently walked the UI on that rebuilt preview:

- Created season goal `Goal-link verification: manageable home maintenance` (`2a6faa1d-21ab-4b84-bf9b-4c226f782105`) through the Fall planning session, selecting annual goal `Make our home easier to maintain`. After reload, the season list names the annual goal under Supports; opening the annual goal shows the seasonal fixture under Supported by.
- Created month goal `Goal-link verification: October maintenance plan` (`f5c1fb69-8ee4-467f-a05e-a70534d819ba`) through the October planning session, selecting the seasonal fixture. In the same session created `Goal-link verification: list maintenance jobs` as its supporting task. After save/reload, October names the correct season goal and the season list names the October goal under Supported by.
- Used the month goal detail's Plan control to put only the task into Oct4–10, undated. Reviewed Oct4 from Oct11–17, selected Keep, inspected summary and saved. Reloaded Week: task appears in Any day, names the October goal, and says kept from last week. Reopened October: the goal remains there, with task under its steps and Oct11–17 placement. Reopened Fall: season goal remains in Fall with annual and monthly relationships intact. This is live evidence for week carry-forward independence, not a test of every cross-month/year boundary.
- **Open display gap:** `/task/:id` details for month and season goals show neither Supports nor Supported by. Their period lists do; annual `/goals/:id` also does. Sent Claude a bounded request to reuse the relationship presentation in those detail pages. This prevents claiming hierarchy visibility passes on every surface.
- All three clearly labelled hierarchy fixtures remain on the demo account for retesting. Existing Islanders goal, its two tasks, and annual goal properties were not edited. No historical backfill, merge, or app production deployment authorized.
- Asked Claude to finish the narrow capture focus/blur correction and rebuild after this mutation pass; live retry retest still pending. Earlier Drop and Done separate live passes stand; external calendar writes remain parked.

## Retest after capture and goal-detail corrections

- **Capture button recovery: live pass on rebuilt preview.** Chrome DevTools docked to expose the phone-width Inbox capture field. Set only this tab to Offline, submitted `Capture retry after fix (walkthrough)` with Enter: two Failed to add task messages appeared and the field retained the exact title. Restored No throttling, explicitly refocused the retained text, and clicked Add. The field cleared and Inbox increased from two to three items. Closed DevTools, reloaded, and confirmed exactly one new fixture persisted. No throttling restored; DevTools closed. This is desktop phone-width evidence, not a real-iPhone keyboard test. Duplicate error messages remain a presentation finding.
- **Goal detail relationships: live pass on rebuilt preview.** Directly opened season fixture `2a6faa1d-21ab-4b84-bf9b-4c226f782105`: Supports names the annual home goal, Supported by names the October fixture. Clicked its month link: October details show Supports Fall goal and the existing task remains Week of Oct11 · October. Reloaded month detail and confirmed both. Followed month → season → annual using relationship buttons; annual still lists Fall fixture under Supported by. This closes the missing-detail-relationships gap above.
- No existing records changed during these retests. New capture fixture is intentionally left in demo Inbox alongside the earlier two fixtures. No production app deployment or merge performed.

## Current core coverage summary

Core demo paths walked successfully: task capture/triage/completion; flexible routine choosing/completion/unchoosing/pause; month task scheduling; seven-day Week URL/reload/back/forward; new year-season-month links and detail navigation; weekly Keep/Done/Someday/Drop; goal-link preservation during week carry-forward; failed capture text recovery and Add-button retry. Prior entries above preserve historical observations and are superseded where retests explicitly close them.

Still not signed off: external calendar creation (destination/approval unresolved), Plan from paper analysis/revision (separate workstream), real-iPhone keyboard/safe areas, authenticated cross-household access testing, weekend/custom-range restoration, exhaustive boundary/history cases. Goal archive semantics and misleading/obscured controls remain open product/usability work. Do not call all flows green or release-ready. The tested journeys now provide a concrete baseline for a coherent usability mockup instead of further piecemeal interface changes.
