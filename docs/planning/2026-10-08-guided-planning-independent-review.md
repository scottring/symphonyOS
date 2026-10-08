# Guided planning independent review

## Scope and authorization

Scott requested Open journal as default, independent column scrolling, and conversational onboarding brought to production. Earlier tested planning release PR168 is already deployed at37c891ad. This review concerns the next release, branch claude/journal-default-onboarding.

## Verified

- Independent full suite:794 files passed,8275 tests passed,3 skipped (before the additional persisted-focus regression). Log /private/tmp/symphony-onboarding-full-suite.log.
- Build passed; subsequent focused UI suite23tests passed.
- Browser: signed-in disposable account,2year goals,3season lines,3month lines,2week tasks,1Today selection. Pause/reload/resume at Week works. Save and full reload preserve the chosen Today task and correct Fall→Month→Week links. Existing rows are retained.
- Add to my plan: a new October line retains its selected Fall source after reload.
- Desktop1719x1236: journal pane scrollTop0→101 while days pane remained0. Phone390x844: natural page scrolling and no horizontal document overflow.
- Desktop guided flow shows all goals, freeform context, progress and explicit saving; phone layout wraps and stacks.

## Corrections from independent review

Implemented in this worktree during Claude’s endpoint work:
- addition.ts month→season source and optional season→month next-step source;2new regressions.
- AddToPlan fields/navigation disabled during saving; partial-save retry cannot edit content already written; regression verifies no duplicate task after failed Today mark.
- existingPlan.ts now reads task_focus with signed-in user ID through isFocused, rather than only legacy plannedOn. Regression confirms another person’s focus does not become this user’s Today selection. Browser now shows1chosen, matching Today.

## Deployment gate for AI replies

The new planning-conversation endpoint was deployed disabled. Automated approval review rejected enabling PLANNING_CONVERSATION_ENABLED=1 because the user had not explicitly approved sending planning messages and session goals/lines to Anthropic. A user approval question is pending. Do not enable it by another route. Current frontend local test server has VITE_PLANNING_CONVERSATION=1 for interface checks; production must keep it off until approval and an actual synthetic end-to-end API success test.

This does not block deploying the tested journal/scroll changes and guided typed-and-tapped planning flow. Spoken Realtime voice remains unavailable and must not be described as delivered.

## Evidence

/private/tmp/symphony-onboarding-scroll-desktop.png
/private/tmp/symphony-onboarding-journal-phone.png
/private/tmp/symphony-onboarding-saved-journal.png
/private/tmp/symphony-conversational-desktop.png
/private/tmp/symphony-conversational-phone.png

## Still required

Final build/tests after latest changes, clean reviewed commit, PR checks, exact-head merge, matching Production Current deployment and live smoke. AI replies need the separate approval and success test described above.

Final local checks on implementation commit8b87197f: build passed, lint passed with0errors (existing warning backlog). Full final suite is in /private/tmp/symphony-onboarding-final-tests.log. Code includes the independent addition and task-focus corrections above. Production AI flags remain off pending approval.
