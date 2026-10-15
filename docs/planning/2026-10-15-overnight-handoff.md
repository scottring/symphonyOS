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

## Next action

Verify the reload-with-pending-card fix on the new build; then restructure beta-readiness.md (current summary on top); then the Gmail consent/OAuth recovery review.
