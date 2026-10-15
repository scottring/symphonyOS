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
