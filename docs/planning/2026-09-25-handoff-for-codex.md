# Handoff for Codex — transactional placement save (2026-09-25)

Scope approved by Scott: prepare the transactional fix and migration for
review; do not apply shared migrations; switch off by default; prove rollback,
retries, concurrency and ownership locally; deliver migration, code, evidence
and review together. No deployment.

**Branch** `claude/onboarding-program` (worktree `.worktrees/onboarding-program`),
local commits only. This work: `e08dc90a` (migration + PG proof + review),
`88b257d9` (client path behind the switch), and this note.

**Read first:** `docs/planning/2026-09-25-transactional-placement-review.md`
(design, evidence table, security review, rollout steps, what is pending).

**What to review**
- `supabase/migrations/2026-09-25_apply_task_placement.sql`: SECURITY INVOKER,
  FOR UPDATE lock first, placement-column allowlist, validated steps, SET
  built only from the columns sent, `search_path` pinned, EXECUTE for
  authenticated only.
- `src/lib/placement/placementSteps.ts` and `applyPlacementAtomically` in
  `src/hooks/useSupabaseTasks.ts`:
  - Drop, Keep and placement-only updateTask are switched.
  - Mixed saves and group moves stay on the ordinary requests.
  - With the switch unset, requests are byte-identical to before (hook test).

**Evidence (rerun from the worktree root)**
- `./scripts/test-apply-task-placement-locally.sh` — 76/76. The migration is
  loaded unchanged.
  - parity 9, rollback 10 (16 faults), retry 12, concurrency 4, security 38,
    pinning 3.
  - The proof found one parity gap (`UPDATE OF` triggers firing for columns
    not sent), which is fixed.
- `npx vitest run src/hooks/useSupabaseTasks.planWrites.test.ts src/lib/placement/placementSteps.test.ts` — 46/46.
- Full suite: 7209 pass. The only failure is the known connectors/whatsapp
  collection error.
- tsc clean, eslint 0 errors, build clean, :5199 rebuilt.
- Unchanged and still passing: 096 11/11, 097 12/12, 098 7/7, 099 23/23.

**Inferred, not observed:** that PostgREST rolls back the whole RPC when the
function raises. It was modelled with top-level BEGIN/COMMIT sessions.
Rollout step 4 observes it on the live function.

**Still pending (unchanged, not blocking this preparation)**
- Applying the migration, and any production change. Each rollout step needs
  Scott's approval.
- Live calendar edit/save, drag/resize and Delete.
- Two-account live verification.
- Codex's own docs were not edited.
