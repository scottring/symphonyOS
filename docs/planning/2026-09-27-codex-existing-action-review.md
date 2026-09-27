# Independent review — existing actions, September 27

Reviewed head ee451922, including selector reuse fix 19a47bac. Targeted tests independently passed: 79/79 across existingActions, AddExistingActionDialog, PlanRow and useCommitPage. No shared data changed.

Independent local database proof also passed: supabase/tests/run-102.sh using native /opt/homebrew/opt/libpq/bin/psql against 127.0.0.1:55322. All assertions passed with the prepared migration inside a rolled-back transaction. Shared migration remains unapplied and not authorized.

## Corrections requested

1. AddExistingActionDialog.link lacks catch/finally: rejected onLink leaves saving true. Link/unlink failures also claim “Nothing was changed,” although ordinary updateTask rolls back local state on transport errors even if the database committed before the reply was lost. Reconcile the saved relationship after uncertain failures, block further relationship writes when that read fails, use honest uncertainty copy, and always release the dialog's busy state. Cover rejection, committed-but-response-lost and unlink. The existing pre-write injected 500 does not establish lost-response safety.
2. Relink confirmation writes by task ID without checking the parent the person confirmed replacing. Another client can change that parent before the save. Use an expected-parent conditional write, treating no matching row as stale, then refresh and require a new choice/confirmation. Cover competing relink and stale unlink without changing other task fields.

Keep these fixes scoped to relationship writes. Do not expand into a placement rewrite or new Year-goal storage. Year support remains a documented gap. No migration application, push, merge or deployment is authorized.

## Coordination

## Follow-up review of 6c942547 (15:23 UTC)

Independent targeted run: 86/86 tests passed. Conditional goal_task_id writes and read-back outcomes address the stale-parent write and lost-response classification. Remaining implementation work:

- `setGoalLink` announces `{ ...before, goalTaskId: settled }` after awaiting network requests. This broadcasts an entire old task snapshot. If the action's notes, people, schedule or completion changed while the link request was pending, the fan-out can restore stale fields in mounted consumers. Broadcast a relationship-only patch applied to each consumer's current task, rather than the pre-request task object. Add a hook-level test with a concurrent unrelated-field update and multiple consumers; verify only goalTaskId changes.
- When both write and read-back fail, the hook restores an unverified old relationship and allows the next write immediately. Finish the requested recovery gate: no further goal-link write for that task until a fresh relationship read succeeds (across mounted hook instances); make a retry perform recovery first, without silently overwriting a different parent.
- The dialog still has no catch/finally around onLink. The hook catches transport failures, but its callback contract can reject; add a defensive catch/finally and a rejecting-callback test so the dialog never remains permanently busy.

The present tests exercise outcome mapping and dialog mocks; add hook tests proving actual conditional query construction, lost-response recovery, stale unlink and the incomplete-read gate. Keep real data untouched. These are bounded corrections, not deployment authorization.

Instructions were pasted into the existing VS Code left terminal, Horizon flow implementation, but clipboard operation timed out. The verification screenshot then reported the Mac locked. Submission is UNCONFIRMED; do not assume Claude received the request. Stop UI retries until Scott confirms manual unlock. Preserve the real Fall goals and September import preview.

## Final scoped review — 2abff22f

The three follow-up findings are addressed: goal-link-only fan-out preserves other current fields, the shared recovery gate re-reads before retrying an uncertain relationship write, and the dialog catches rejected callbacks and releases busy state. Reviewed the eight hook tests, including conditional writes, stale unlink, lost response, cross-instance recovery and concurrent notes edits.

Independent rerun: 95/95 tests passed across useSupabaseTasks.goalLink, existingActions, AddExistingActionDialog, PlanRow and useCommitPage. The prior isolated database permission proof passed; its SQL is unchanged. No remaining blocker found in this scoped review. This is not an independent rerun of Claude's full suite or browser acceptance.

Release pending: Scott's separate approval for the prepared goal-visibility migration and for deployment. Selector fix 19a47bac passed review and can release independently. Year goals remain unsupported by this existing-action picker; PR61's future importer must separately align with the selector, and parser classification quality is not established by these UI tests. No real data changed during review. Pause the supervision heartbeat now that unblocked implementation/review is complete; do not treat this as deployment approval.
