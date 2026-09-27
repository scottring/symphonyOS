# Independent review — existing actions, September 27

Reviewed head ee451922, including selector reuse fix 19a47bac. Targeted tests independently passed: 79/79 across existingActions, AddExistingActionDialog, PlanRow and useCommitPage. No shared data changed.

Independent local database proof also passed: supabase/tests/run-102.sh using native /opt/homebrew/opt/libpq/bin/psql against 127.0.0.1:55322. All assertions passed with the prepared migration inside a rolled-back transaction. Shared migration remains unapplied and not authorized.

## Corrections requested

1. AddExistingActionDialog.link lacks catch/finally: rejected onLink leaves saving true. Link/unlink failures also claim “Nothing was changed,” although ordinary updateTask rolls back local state on transport errors even if the database committed before the reply was lost. Reconcile the saved relationship after uncertain failures, block further relationship writes when that read fails, use honest uncertainty copy, and always release the dialog's busy state. Cover rejection, committed-but-response-lost and unlink. The existing pre-write injected 500 does not establish lost-response safety.
2. Relink confirmation writes by task ID without checking the parent the person confirmed replacing. Another client can change that parent before the save. Use an expected-parent conditional write, treating no matching row as stale, then refresh and require a new choice/confirmation. Cover competing relink and stale unlink without changing other task fields.

Keep these fixes scoped to relationship writes. Do not expand into a placement rewrite or new Year-goal storage. Year support remains a documented gap. No migration application, push, merge or deployment is authorized.

## Coordination

Instructions were pasted into the existing VS Code left terminal, Horizon flow implementation, but clipboard operation timed out. The verification screenshot then reported the Mac locked. Submission is UNCONFIRMED; do not assume Claude received the request. Stop UI retries until Scott confirms manual unlock. Preserve the real Fall goals and September import preview.
