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

## 09:09 ET — removal blocker independently reproduced

Mac is locked; native Chrome and Claude terminal unavailable until manual unlock. In-app browser preview displays Sign In; no credential entry attempted. Continue source/test work; actual browser walkthrough remains pending. Do not equate the following with live verification.

Independent pure placement tests in repo root `tmp/codex-connected-review/removal.test.ts`, separate config, execute the NEW timingRemoval patches through REAL planPlacement/deriveCache. No database writes. Four tests: three FAIL, one passes.

BLOCKERS:
- Dated task with explicit Oct4 week + October month: Remove day AND week clears scheduledFor but leaves week commitment OPEN. planPlacement computes currentLevel from dated bucket='timed', so currentLevel is undefined; moving up to month never removes lower commitments. weekStart:undefined is not interpreted as a remove operation.
- Undated week-only task with no broader period: Remove all emits no bucket and weekStart:undefined; planPlacement ignores that undefined stamp, leaving the week OPEN.
- Undo of a correctly removed DATED task emits previous.bucket='timed' with cached week/month stamps. planPlacement neither targetLevel nor !bucket branch processes these stamps, so it restores the date but DOES NOT reopen the original explicit week. Cached week of day is not proof the week was restored.
- Undated week+month remove and Undo DOES pass; do not generalize that case.

Required repair: use explicit commitment removal/restoration operations, or correctly integrated placement semantics preserving the exact original explicit week and all broader commitments. Do not blindly restore cached weekStart (date can be outside explicitly chosen week). Test operation round trips, not only equality of returned patch objects. Keep goal links, focus and history intact.

Run from repository ROOT: ./node_modules/.bin/vitest run --config tmp/codex-connected-review/vitest.config.mts
