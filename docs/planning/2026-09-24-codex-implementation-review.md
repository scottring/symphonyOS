# Codex independent implementation review

## 2026-09-24 08:50 ET — A1/A2

Read commits 2de0c943 and 4ea37cd8 and Claude's implementation-progress log. B is actively in progress; do not edit Claude's active implementation files.

Automated results (reported by Claude, not independently rerun): 6792 passing, known connectors collection error, typecheck/lint/build clean. No fresh browser verification yet.

Findings sent to Claude Terminal8:
1. taskTiming's cache fallback and taskWhen's commitment-array interpretation differ. Reconcile undefined/empty/nonempty authoritative records, removed or done records, stale cache, dated-only rows. Existing committedTo treats only nonempty records as authoritative; avoid an accidental legacy migration via presentation.
2. WeekList still renders Assigned a day while Week has daily sections. Implement approved single full row and truthful counts; keep out-of-week dates visible with accurate wording.
3. Day navigation consumes/strips date query. Verify reload and return preserve the target day, not just initial arrival.
4. Broader removal destination currently uses month/season cache. Explain actual surviving commitments; purpose/goal is not proof of a particular timing commitment.
5. Day rows need the shared control as well as WeekList. A2 alone does not satisfy all surfaces.

Next independent gate: wait for rebuilt removal/navigation batch, inspect new diff, then use signed-in demo preview for create -> goal/action -> future week -> untimed day -> complete/undo -> day/week removal -> unchanged Plan October -> reload. Preserve existing fixtures. Coordinate before mutations. Entries and guide remain delegated after connected flow.
