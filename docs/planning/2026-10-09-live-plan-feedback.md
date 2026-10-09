# Conversation saves must build the visible plan

Scott's baking walkthrough successfully saved most records but left Today visible. The model-dependent show_workspace tool and end-of-turn refresh did not deliver the promised live canvas.

Implemented: the agent emits plan_saved immediately after a successful planning write returns its persisted row. The shared typed/voice stream forwards that event through ShellLayout to refresh and reveal the map, period, saved item and related ancestry. Failed writes emit no success signal. Existing siblings remain available. The focused branch comes first without changing stored ordering. An open editing dialog prevents automatic navigation. Reduced motion is respected. Scheduling retains the weekly map and displays the time.

Prompt correction: honor explicit timed-task requests instead of requiring Google Calendar. Reuse returned IDs, create linked work before scheduling the same row, and never create a replacement after a failed link.

Verified locally with the deployed agent in the authorized onboarding1008 test account:
- Created Canvas validation: learn bread baking and two October milestones. Map opened automatically with parent and both milestones visible.
- Created Canvas validation: compare class dates under the first milestone; scheduled October 14 at 6 PM. Map moved to week of October 12 and displayed the link and saved schedule.
- Read-only audit of Scott's original baking test found exactly one shopping and one preparation task, both linked to Start the baking class. No First day of class item exists. No original records changed or deleted.
- Focused regression coverage includes failed-write suppression, per-save events before final reply, connection failure after a save, persisted focus, and refresh on subsequent save.

Limits: this browser check used typing through the same agent stream called by voice; it does not substitute for a fresh microphone conversation. Original connection drop is unexplained. Prompt recovery instructions are not transactional idempotency. The full planning map is still four horizons; Today scheduling remains available through the Week/Today controls. New feedback is only on connected workspace routes. Production frontend release status must be checked separately from edge function deployment.

Release: commit 12def3d3 pushed to main after mandatory checks: 806 test files, 8,329 tests passed, 3 skipped; build and typecheck passed. Production deployment dpl_FuDYxcLusGmntA86qehDm67q89fg is Ready with app.symphony-os.com alias. Agent edge function deployed as well. Desktop and phone evidence saved in /private/tmp/symphony-live-plan-desktop.png and /private/tmp/symphony-live-plan-phone.png. Vite hot updates reset context twice during development; clean reload recovered, and clean-load phone check passed.

Additional read-only finding: both original baking tasks have week_start October 12 but an open task_commitments week of October 5. Their scheduled days are October 14/15. The new validation task correctly has both week_start and commitment October 12. Original task records were left intact; reconcile this mismatch through the normal placement workflow in a follow-up, not by deleting/recreating tasks. This explains the existing UI's earlier-week warning and is not repaired by the visual save-event change.
