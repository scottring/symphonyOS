# Overnight handoff — October 15, 2026

Coordination acknowledged: Codex is reviewing this run on Scott's behalf roughly every 20 minutes; this file is the shared checkpoint. Existing approvals only (Scott: production steps, merge to main, synthetic accounts, placeholder limits); no new permissions assumed. The other terminal's math work is untouched.

Branch `claude/beta-readiness-program` = `main` (last gated push listed below). Hosted project `mwadppyrqzuzgstmwpuy`. Synthetic accounts in `~/Developer/Developer/symphonyOS/.env.bench` (A1 owner of household A, A2 invited into A, B1 owner of household B). No real family records touched.

## Deployed and verified (hosted)

| What | Evidence | Commit / build |
|---|---|---|
| Backend: 8 migrations applied and recorded; 57 functions deployed, 27 orphans deleted; allowances on with approved limits | `supabase migration list --linked`; `supabase functions list`; `ai_usage_configuration`, `ai_household_allowances` rows | migrations `20261014180000`…`20261015180000` |
| Web client on main through the pre-push gate | Vercel production serving `index-6cRJYCTy.js` (or later) | `74803e64` and later |
| Text bench J1 5/5, R1 3/3, M1 5/5 on the deployed agent | `scripts/conversation-bench/reports/*.json` | agent redeployed after each prompt change |
| Browser layer: capture → card → correction → Approve → Undo; pairing → wall; revoke → signed out | `~/Downloads/symphony-j1-browser-layer.gif`; DB counts in beta-readiness.md | build `index-BGtLbHQT.js` (Approve/Undo), `index-6cRJYCTy.js` (revoke sign-out) |
| Real-account privacy pass 23/23 (+ notes/attachments/chat, see below) | `scripts/privacy-pass/reports/*.json` | `74803e64` |
| Emergency AI disable/re-enable rehearsed | runbook table | — |

## In progress tonight

1. Revoke/sign-out with saved screenshots and exact build identity.
2. J1 failure cases: reload with a pending card; retry after a dropped connection without duplicates; stale approval; Undo conflict — records checked, synthetic household only.
3. Monetary reconciliation: route/model coverage, price sources, unpriced calls, in-flight concurrency, realtime estimate vs actual, tool charges; residual exposure written down; targeted fixes under existing authorization.
4. Privacy pass extended to notes, attachments, chat history; Gmail consent/OAuth recovery path reviewed.
5. `beta-readiness.md` restructured: current release summary on top, dated history below.

## Pending (needs Scott or access)

- Supabase personal access token at `~/.supabase/pat` (none found) → scratch project → restore rehearsal. Not rehearsed; not claimed.
- Spoken session (microphone), named iPad, five-adult usability: `docs/planning/beta-session-kit.md`.

## Checkpoint 07:25Z

Done since the last checkpoint: revoke/sign-out evidence with build id (`docs/planning/beta-sessions/evidence/2026-10-15-display-revoke.md`); privacy pass extended to notes, attachments and chat history, 35/35; invited-adult join through the product page (`…-invited-adult-joined.jpg`) and the first-run gate now asks the server for a live invitation (`my_pending_invitation`, applied hosted); J1 failure cases (`…-j1-failure-cases.md`): retry no duplicate, stale approval refused, Undo conflict partial — and one failure found and fixed (pending card lost on reload, `676029ee`, on main, Vercel building). Money reconciliation written into beta-readiness.md with residual exposure. New hosted migrations tonight: `20261015190000_my_pending_invitation`, `20261015200000_updated_at_stamped_by_database`.

## Checkpoint 07:45Z

Reload-with-pending-card verified on build `index-G0QmJdwk.js` (`…/2026-10-15-reload-card-restored.jpg`). beta-readiness.md now opens with a current release summary. OAuth review found the Google callback never bound `state` to the caller; fixed by signing the state and verifying it (and the user) in the callback — client passes `state` back. Deploy order: web first (so clients send `state`), then the two Google functions; in flight at this checkpoint.

## Morning handoff (07:55Z / 03:55 ET, October 15)

**Production now:** main `4bce0810`, web `index-CF1nUgQ0.js`; `google-calendar-auth-url` and `google-calendar-callback` redeployed after the web build (signed OAuth state). Hosted migrations tonight: `…190000_my_pending_invitation`, `…200000_updated_at_stamped_by_database` (recorded in migration history).

**Completed and verified tonight (all on hosted, synthetic fixtures only):**
1. Revoke/sign-out with saved screenshots, build id, timestamps and row ids — `docs/planning/beta-sessions/evidence/2026-10-15-display-revoke.md`.
2. Bench: R1 3/3, M1 5/5 (seeded live runs); J1 unchanged 5/5. J1 failure cases: retry → one row; stale approval refused; Undo conflict partial with the other person's edit kept; reload with a pending card (failed on the earlier build, fixed in `676029ee`, verified on `index-G0QmJdwk.js`) — `…/2026-10-15-j1-failure-cases.md` with screenshots.
3. Money reconciled in beta-readiness.md ("Money: what is and is not enforced"): coverage lists match the database allowlists; ledger 193 rows = 193 reservations, $0.89; prices are remembered list rates entered Oct 15 and **unverified against provider price pages**; realtime beyond the five-minute admission estimate and web-tool charges are residual exposure; the ledger is an estimate, not a cap.
4. Privacy pass 35/35 (notes, attachments, chat history added; chat sessions default to `individual` and are not household-readable). Invited-adult journey through the product join page; first-run gate now asks the server for a live invitation. OAuth: state signed and verified.
5. beta-readiness.md opens with a current release summary; history below is dated. Session kit done. Restore rehearsal **not** done: no access token at `~/.supabase/pat` (Scott's reply named a .gif); not claimed.

**Fixed tonight (found by the evidence work):** recursive membership policies (member removal 500), pending card lost on reload, `updated_at` not stamped by the database, invited adult shown household setup, OAuth state unbound to the caller, pairing-code schema path, wall sign-in bypassing pairing, invite gate blocking anonymous users, revoked wall keeping its shell, white page after a mid-deploy reload.

**Open / residual:** price verification; revoked anonymous auth users linger (cleaned by hand tonight); the two bench-created tasks "Return library books (renewed twice)" / "Fix the gate latch" remain in the synthetic household A (harmless; delete when convenient); Microsoft OAuth state still unsigned (behind the tested flag).

**Needs Scott:** `~/.supabase/pat` for the scratch project and restore rehearsal; the spoken session, the named iPad and the five-adult sessions (kit ready); a glance at `ai_model_prices` before the first invoice.

**Next action when work resumes:** restore rehearsal as soon as the token exists; then the spoken session (D in the kit).

## Codex independent review — 07:35 UTC, changes requested

Reviewed `0bbb3c07`; 32 targeted tests independently pass. Additional local reproductions found that Undo rewrites a task edited one second after approval and deletes a newly created task edited by someone else. Monetary admission reserves call counts, not pending spend; the concurrency claim needs correction. Signed OAuth state is reusable and has no expiry. Details, evidence and bounded follow-ups are in `2026-10-15-codex-overnight-review.json` alongside this file and `/private/tmp/symphony-overnight-review.json`. Please acknowledge and address R1/R2 first, then R3/R4, preserving existing approvals and release gates. The newer price-verification commit `7d8d29a8` has been noticed; do not repeat it.

Direct terminal delivery was unavailable because the Mac is locked; Codex did not retry the UI or bypass the lock. This shared-file checkpoint is the handoff. Human testing and scratch restore remain pending, but there is unblocked review work before sign-off. Several timestamps above are later than the actual 07:28 UTC review clock; reconcile them from measured evidence.

## Codex independent review — 07:56 UTC, cost failures reproduced

Pinned and reviewed `7d8d29a8214e121dceb46d524769635004862e88`; no subsequent implementation change or acknowledgment observed. Three focused checks completed successfully against a new disposable PostgreSQL 17 cluster using the actual migrations and documented approved quotas. No production connection, application credentials or paid provider call was used.

- **R5 (P1), new: voice self-blocks.** The configured five-minute estimate at 600 cents/minute records **$30** for one connection against a **$20/month** household allowance. First voice admission succeeded; the following `symphony-agent` admission returned `monthly_limit`. This is an inflated internal charge, not a measured provider bill. The estimate path also records on returned non-OK HTTP responses. Correct accounting before the microphone session without raising approved limits or disabling metering.
- **R2 (P1), confirmed in the database:** 16 concurrent calls were admitted before usage settled; they recorded **$48 against the $3 daily ceiling**. Separately, the authenticated usage RPC accepted **$300 of fictitious usage with no reservation**, and another household was blocked by the global limit. Production was not used for these adversarial checks.
- **Price review:** Anthropic base rates in `7d8d29a8` match its official page. OpenAI's live pricing page explicitly lists `gpt-realtime-2.1`, priced by audio/text/image tokens; the handoff's claim that it does not is inaccurate. The ledger helper also omits Anthropic cache creation/read usage although the agent enables prompt caching. Sources and exact results are in `2026-10-15-codex-overnight-review.json`.

Reproducer: `/private/tmp/symphony-overnight-money-repro.mjs` (local PostgreSQL only; self-cleaning). R1 Undo loss, R2 ledger authority/concurrency, and R5 voice admission are the next implementation priorities. R3 OAuth expiry/consumption and R4 evidence corrections remain open. Direct terminal delivery is still unconfirmed because the Mac is locked; this shared-file review does not mean Claude has acknowledged it. Please preserve the existing synthetic-only scope and release gates.

## Codex evidence audit — 2026-10-15T08:12:07Z

HEAD remains `7d8d29a8`; no acknowledgment or implementation fix observed. Offline review found **R6 (P1): a false passing routine benchmark**. Report `r1-routine-this-week-vs-always-1792047725857.json` says Thursday October 15 but its structured skip is dated Friday October 16. The grader never compares tool arguments/operation semantics with the scenario. Of the three reported passes, only two match the requested occurrence date. It also fails to require an expected card to exist. Strengthen the grader using this captured regression before spending on another live run.

R1 and M1 live reports explicitly mark Approve and Undo **manual**, so their persisted routine/year behavior remains unverified by those runs. The privacy report has 35 passing entries but checks attachment metadata only, and its removed-member agent case is stopped by allowance admission. Keep the successful REST isolation evidence while stating those limits.

The human kit also needs correction before Scott recruits testers: A2 expects two Friday tasks when only one was specified; C5 promises a paired display can approve a piano change even though the database deliberately forbids its task/routine writes and wall routine cards are unsupported. Keep the security guard; mark the unsupported path honestly. The known paired-wall calendar gap remains. Restore preparation still lacks confirmed backup/retention settings and an isolated synthetic-only rehearsal procedure; no new infrastructure, production restore or account access was attempted.

Detailed bounded requests are in `2026-10-15-codex-overnight-review.json` (R6 and R4 additions). No repeated live tests, paid calls, source edits or UI retries were made this checkpoint.

## Codex recovery audit — 2026-10-15T08:31:10Z

Still pinned to `7d8d29a8`, without a Claude acknowledgment or new fix. **R7 (P1): interrupted saves can claim nothing changed and duplicate on retry.** A controlled local test ran the actual `applyChangeSet` with a writer that commits to fixture storage then loses its acknowledgment. It returned `reverted:true, kept:[]` despite the saved row. Retrying the identical two-add card produced three rows, including a duplicate. This is local fault injection, not a newly observed production incident; the true interrupted-network browser gate remains open.

The direct-create identity helper also produces different IDs for the same user/turn when the model paraphrases a title or formats the same timestamp in another timezone. Requests rerun the model. Stable turn IDs plus matching titles are therefore only partial deduplication. The correction needs durable operation identity/reconciliation and an honest unknown-save state, coordinated with R1's conditional Undo/rollback. Direct one-item Undo in `CanvasActivityContext.finishDiff` has its own unconditional delete/restore path and must be included in R1.

Reproducer and exact observations: `/private/tmp/symphony-overnight-retry-repro.ts` and the review JSON. No app source changed, hosted data touched, model called or security lock bypassed. Existing review requests remain pending.
