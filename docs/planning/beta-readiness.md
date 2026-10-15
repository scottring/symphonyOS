# Symphony beta readiness register

Started October 14, 2026. Source baseline: `origin/main` at `82acf4d6`, fetched that day. Working branch: `codex/beta-readiness`. This is an implementation and evidence register, not a declaration that production is ready.

The product and rollout authority is the [Symphony beta and market launch plan](https://chatgpt.com/space/page_50fd3d212da08191a8cb14eb58ea70e1). It now specifies one shared family assistant and an optional private assistant per person for personal and work life. Private assistants are optional to activate; their release requires separate privacy evidence. Household billing or administration does not confer access to private conversations.

**A consistent visual and voice experience is a P0 release requirement.** The same Symphony identity, terminology, audience cues and action semantics must carry across supported screens and typed, spoken and direct interactions. The experience gate below is required alongside privacy, setup, recovery and cost gates; it is not deferred polish.

## Current release summary (October 15, 2026, 07:30Z) — read this first; everything below is dated history

**Production:** web `main` at `676029ee` and later (Vercel, `app.symphony-os.com`); backend project `mwadppyrqzuzgstmwpuy` with 57 functions deployed from the same tree and these migrations applied and recorded: `20261014180000` allowances, `20261015100000` displays, `110000` interactive routes, `120000` background routes, `130000` invited sign-up, `140000` granted scopes, `150000` spend ledger, `160000` allowance defaults, `170000` anonymous sign-up, `180000` membership policies, `190000` pending invitation, `200000` updated_at trigger. Allowances on with Scott's approved placeholder limits and prices. Anonymous sign-ins enabled (Scott). Voice allowlist: four ids.

**Verified on the hosted project (synthetic households only):**
- Text bench on the deployed agent: J1 5/5, R1 3/3, M1 5/5 (`scripts/conversation-bench/reports/`).
- Browser layer: capture → one card → correction revises → Approve saves 4 → Undo removes 4 (GIF in Scott's Downloads); display pairing from a separate browser, heartbeat, revoke → signed out (`docs/planning/beta-sessions/evidence/2026-10-15-display-revoke.md`); invited adult joins through the product join page.
- J1 failure cases: retry with one turn id → one row; stale approval refused; Undo with a conflicting edit → partial, the other person's edit kept (`…/2026-10-15-j1-failure-cases.md`).
- Privacy pass as three real accounts: 35/35 across tasks, notes, attachments, chat history, assignment vs sharing, cross-household displays, removal (`scripts/privacy-pass/reports/`).
- Emergency AI disable/re-enable rehearsed (runbook).

**Open failures:** none known at this build. Fixed tonight on the way: pairing-code schema path, wall sign-in bypassing pairing, invite gate blocking anonymous users, revoked wall keeping its shell, white page after a mid-deploy reload, recursive membership policies, pending card lost on reload, `updated_at` not stamped by the database, invited adult shown household setup.

**Residual exposure (recorded, not fixed):** money is an estimate reconciled after the fact, not a hard cap (see "Money"); realtime audio beyond the five-minute admission estimate is unmeasured and its per-minute rate is an estimate (the provider prices per audio token); speech is priced per character as an estimate; web-tool charges ($10 per 1,000 searches) are not itemised; revoked anonymous auth users linger until deleted.

**Gates only people or access can close:** spoken session with a microphone; one named iPad as the wall; five-adult usability (UX01–08); staged invitations. Restore: a logical dump restored into a separate database with every public table matching row for row (runbook, October 15); the provider's in-place backup restore and a hosted scratch project remain unrehearsed (the token cannot create projects). Prices verified October 15. Kit: `docs/planning/beta-session-kit.md`.

## Current decision

**Do not expand invitations yet.** (Hosted release of the hardening done October 15; see that section.) Source inspection found useful foundations, but cross-device visual/voice acceptance, separate assistant scopes, restricted display credentials, comprehensive AI budgets, and fresh-household acceptance evidence remain incomplete. The prepared changes harden retrieval and establish shared assistant instructions; they do not certify model replies, acoustic quality or the complete shared/private assistant model. No production data, schema, provider settings, or deployment has been changed by this work.

## Visual and voice experience gate — B00

Keep the current scenery / place / paper design, Crimson Pro and DM Sans. Maintain one visual reference for colors, spacing, typography, icons, control states and motion, plus an approved voice sample and conversational guide covering warmth, brevity, pacing, pronunciation and result wording. Device layouts can differ while action names, meanings and audience cues remain familiar. Product/design owns these references; client and voice engineering own implementation; release QA owns the evidence. Scott approves the reference and release decision.

Use a synthetic household, never real family records, for the repeatable scenarios below. Record build/commit, model and voice configuration, device/OS/browser, input method, screenshot or short recording, timing where relevant, tester, result and issue link. Do not record credentials or private transcripts. Automated contract checks are supporting evidence, not substitutes for viewing, listening or testing permissions.

| ID | Requirement and concrete acceptance test | Required result | Current evidence |
| --- | --- | --- | --- |
| UX01 | Compare Today, Week, Month, Season, Year, item panel, change card and supported wall states on the candidate desktop, phone and tablet. Include long names, empty/loading/error states and dense days. | Approved typography, colors, controls and motion recur consistently. The same action uses the same name and meaning. Screens remain legible at their intended viewing distance. | Not run on this candidate; reference sign-off pending. |
| UX02 | Navigate Today → Week → Month → Season → Year and back; hide/show upstream goals. Ask a newcomer which dates and audience they are viewing. Before enabling private assistants, switch private → family → wall and inspect visible context and history. | Dates, horizon, family/private audience and affected person remain clear; returning preserves useful context. Private context never transfers to a shared surface. | Not run; private and display identity dependencies B01/B02 remain open. |
| UX03 | On reset fixtures, type and speak “Call Morgan this afternoon,” then Undo. Move two tasks to Friday, inspect the proposal, Approve, then Undo the set. Repeat relevant direct tap/drag actions. Interrupt a save and retry. | Same authorized records and dates result; single clear reversible changes show Saved/Undo. Multiple changes stay proposed until approval. A failed save is never reported as done, retries do not duplicate records, and Undo restores the set. Restricted surfaces explain denied actions. | Shared instruction and voice handoff regressions pass; real model, persistent-state and cross-device scenarios not run. |
| UX04 | Listen to matched capture, clarification, help and recovery replies on every supported voice surface, including names, dates and times. Run with a fresh account and with no mail/calendar connected. | Approved voice identity, pace and pronunciation; warm, brief, plain language. No Scott-specific assumptions, invented connections or unexplained voice substitution. | Account-neutral/shared instruction regressions pass. Desktop defaults to Marin; wall defaults to Sage with Pi/Piper fallback. Acoustic consistency and generated replies remain unverified. |
| UX05 | Start, interrupt and stop speech; mute, use quiet hours, deny microphone permission, lose the network and exhaust an allowance. Measure ten starts and stops per named voice configuration. | Listening indicator appears within 1 s of capture starting; local stop silences playback within 500 ms; a pending response shows progress by 3 s. States are unambiguous, quiet hours are respected, and recovery preserves the request with a typed/manual route. Any target miss is recorded and resolved or explicitly re-scoped before support is claimed. | Not run. Targets are acceptance criteria, not measured performance. |
| UX06 | Save, complete, rename and relink goals/tasks while scrolled and while an item is open. Check narrow screens, large text, keyboard/focus, screen-reader names, reduced motion and touch targets. | Content never blanks during ordinary refresh; focus and position survive saves. Main wall views fit the certified display; long collections have deliberate bounded scrolling. No clipped core controls or inaccessible essential actions; drafts survive failure. | Not run; the reported month-page flash remains a scenario to verify, not a claimed fix in this batch. |
| UX07 | Ask “What can I do here?” on Week and Month, typed and spoken. Without using conversation, locate the next commitment, open its useful context and complete a task. Ask about an unavailable source. | Help matches the visible controls and current permissions; direct operation works. The assistant describes missing access plainly and never substitutes unsupported account assumptions. | Missing/denied/unavailable Gmail and mailbox-scope request tests pass; screen-specific generated help and newcomer journeys not run. |
| UX08 | Compare onboarding, sample data, tooltips, help, invitation copy and explainer against the approved reference and supported release. | Year/Season/Month goals and Week/Day tasks use consistent names; no Projects concept. Sharing, Approve and Undo are explained consistently. Planned private assistants and illustrative scenes are labeled. Marketing narration is not passed off as the final product voice. | First-pass marketing work is separate from release certification; final current-product walkthrough review pending. |

### Evidence matrix and sign-off

No configuration is certified by this document. Fill exact device, OS and browser versions before running; an untested configuration stays out of the advertised beta support list.

| Candidate surface | Required inputs / checks | UX01–UX08 status |
| --- | --- | --- |
| Desktop browser, exact supported configurations to be named | Typed and direct; voice only where offered | Not run |
| Phone browser, exact supported configurations to be named | Typed, touch, text sizing and recovery; voice only where offered | Not run |
| First supported iPad wall, exact model/OS/browser to be named | Glanceability, touch, paired audience, quiet hours and supported voice | Not run |
| Mac, native iOS, Android tablet, Fire and Pi additions | Same applicable suite before each is supported; do not infer support from shared code | Not certified |

Proposed named candidates for the first beta (B07), to be confirmed or replaced by Scott before any evidence is attached: desktop — current Chrome and Safari on macOS; phone — Safari on iOS 18+ and Chrome on Android 14+ (typed, touch, no voice promised); wall — one iPad (model and iPadOS version to be named) in Safari, paired as a display, in landscape at kitchen-counter distance. Voice is offered on desktop Chrome only until the UX05 measurements exist for another configuration. A display is certified for routines, meals, lists and the scratchpad before its calendar (see the coverage register's known gaps).

- [ ] Product/design signs off the maintained visual reference and approved voice sample; all supported surfaces map to them.
- [ ] Release QA attaches evidence for every applicable UX scenario on every named supported configuration. Inapplicable tests have a reason; “not run” is never counted as a pass.
- [ ] No unresolved audience confusion, wrong saved/proposed claim, unintended change or blocked core journey remains. Private scenarios must pass before private assistance is enabled.
- [ ] Observe five representative adults, including two who did not set up the household. All identify the audience correctly; at least four capture a task, reschedule it and find the next commitment across two supported surfaces without coaching. Record failures and retest fixes. This is an initial release decision rule, not statistical proof.
- [ ] Scott approves the supported scope using evidence from B00 and the security/operational gates. A unit-test pass alone cannot close B00.

## First implementation batch

Interactive item-context retrieval previously used a service-role database client and manually reproduced selected access rules. That creates a second permission implementation that can drift from the real database policies.

- `symphony-agent` and `suggest-waiting-for` now authenticate and retrieve context with the public application key plus the caller's verified bearer token. Neither endpoint needs the service-role key.
- Interactive semantic enrichment uses the authenticated search function. Because that function is SECURITY DEFINER, candidate notes are re-read through the caller's database client before their text enters model context. Semantic enrichment remains owner-only; explicitly linked notes retain their existing sharing rules. Search candidates filtered out at this step can yield fewer semantic suggestions.
- The background `proactive-engine` explicitly retains its existing service search path. Background authorization still needs a separate review; this patch does not certify it.
- Regressions exercise both actual HTTP entry points with auth/provider doubles, plus semantic candidate rejection, denied-search behavior, and refusal to embed an inaccessible task. They do not prove deployed database policies or real-account isolation.

Source: `supabase/functions/symphony-agent/index.ts`, `supabase/functions/suggest-waiting-for/index.ts`, `supabase/functions/_shared/context-graph/assemble.ts`, and `supabase/functions/proactive-engine/index.ts`.

## Second implementation batch — shared assistant instructions

Prepared locally in commit `bb1ce0d9`. Typed planning, live workspace voice and the wall answer prompt now share calm/plain personality rules and explicit proposal, saved and failed result wording. The main agent no longer assumes Scott, imported vault notes or connected Gmail; email searches describe only the mailbox actually searched. The voice handoff preserves the underlying tool reply without changing pending approval into a claimed save.

This is an instruction and transport contract, not proof that generated replies always follow it. Acoustic identity, actual interruption/recovery, legacy Projects/protocol and multi-routine write paths, and UTC/fixed-timezone assumptions still require work. No synthesized voice was changed in this batch.

## Third implementation batch — guarded provider calls

Prepared locally on October 14. **B03 remains open: this is a provider-call allowance, not a monetary spending guarantee.** The migration is not applied to a hosted database, the guarded functions are not deployed, and no beta quota values have been selected.

- `reserve_ai_provider_call` derives the charging household from the authenticated caller's single active membership. Operator-only configuration supplies both daily and monthly allowances for the household and for all guarded routes together. Missing/disabled configuration, ambiguous membership or reservation errors refuse the call. The migration creates disabled configuration with no default amounts.
- Each outbound provider attempt in `symphony-agent` (including model tool-loop follow-ups and both note-search and item-context embeddings), `wall-ask`, `wall-say`, and `workspace-voice` call creation must reserve first. A database lock serializes the global and household checks across users/devices. Failed or uncertain provider submissions stay counted; retries reserve again. There is no client counter or local fallback.
- Counters contain only date, opaque user/household IDs, route and count. Deleting a user or household does not erase consumed usage and reopen the global allowance. Callers cannot read/edit counters or configure quotas. Private conversation content is never stored in this ledger; separate assistant-level attribution awaits B01's server identity work.
- The configuration's `enabled=false` switch denies subsequent calls on **these guarded routes**. It does not terminate an already-started provider call or realtime session, and it does not stop the other routes listed below. An interrupted agent turn may already have completed one-item changes; existing save/Undo events remain authoritative and the quota error does not claim that nothing changed.
- Exhaustion reports a daily/monthly reset in UTC and directs people to manual planning. Workspace voice distinguishes its existing per-user start limit from the shared AI allowance, so it no longer promises that typed AI will work when that same shared allowance is exhausted. Actual device recovery and retained-draft testing remain open under UX05/UX06.

### Activation requirements and remaining gaps

1. Choose approved **provider-call** daily/monthly limits for the global configuration and each pilot household. These are separate from the launch plan's proposed dollar ceilings; do not infer a dollar conversion. No values are supplied by this patch. Apply and verify the migration in an isolated Supabase test environment first, including real JWTs, current household membership/grants, and concurrent calls. Function deployment without the migration and configured allowances fails closed for the guarded routes.
2. Meter or disable every other reachable paid route and unattended trigger before invitations. A signed-in beta user can otherwise reach unguarded endpoints directly; the new mechanism is not a system-wide kill switch. Do not simulate a user's JWT for background jobs: they need a trusted, validated household attribution path with the same policy decisions.
3. Add token/input/document bounds, approved per-model pricing, conservative monetary reservations and reconciliation, hosted web/tool charges, actual in-flight concurrency control and provider-side realtime duration/cost control before calling this a spend ceiling. A realtime connection is charged one admission here while continuing to generate provider usage afterward; the five-minute client timer is still bypassable. No paid load test has been run.
4. Establish operator controls/alerts and a retention procedure. Keep the current UTC month's usage when deleting accounts; purging those rows would reset the allowance. Decide retention for older opaque usage records. Verify upgrade/rollback ordering so an older deployed function cannot silently bypass the new guard.

Source: `supabase/migrations/20261014180000_ai_provider_call_allowances.sql`, `supabase/functions/_shared/aiUsage.ts`, the four guarded entry points, and `scripts/test-ai-usage-guard.mjs`. The helper's transport hook also covers context embeddings only when a guarded caller supplies it; other context-assembly callers remain unmetered.

## Fourth implementation batch — one verdict per turn, no delete, household time

Prepared on branch `claude/beta-readiness-program` on October 14 (merges `codex/beta-readiness` cleanly onto `origin/main` `d781b072`; full unit suite 8,556 passed, 3 skipped, before this batch; the WhatsApp connector file needs its own dependencies as before).

- Every `symphony-agent` turn now ends with a structured `outcome` (answered / proposed / saved / partial / failed / unverified, the writes made, the card left on the page) and the error event carries the writes made before a failure. The client carries it to the live voice's `ask_symphony` result and the wall's reply; the voice is instructed to say no more than the state allows. This is the shared request/result contract of plan §2. It does not yet prove the live voice obeys it: that needs the recorded-audio layer of the benchmark.
- The agent no longer has `symphony_delete_task`, `symphony_delete_routine`, the Projects tools, `attach_source` or the "protocol" flow. Setting aside, done and rest are the supported paths. Legacy vault / project / protocol language is out of the prompt.
- "Today" in the prompt is the household's date and local time (America/New_York), not UTC.
- Retry de-duplication covers contacts, notes, lists, list items and calendar events as well as tasks, routines and plan items. Server and client write-tool sets agree, so meal, contact, list and draft writes get a receipt.
- Coverage register started: [2026-10-14-conversation-coverage-register.md](2026-10-14-conversation-coverage-register.md).

### Findings that change the gates

- **Orphaned production functions (B03, B01).** The hosted project has 84 deployed edge functions; 27 of them no longer exist in the repository, including `symphony-agent-v2` and `symphony-agent-wall-test` (stale copies of the main agent, reachable by any signed-in user, calling Anthropic with no allowance guard), `coaching-block-generate` and `suggest-rules-from-research` (OpenAI, verify their own JWT, unguarded), `agent-proxy` (forwards to an external engine), `symphony-chat`, `conduct-onboarding-conversation`, `generate-daily-brief`, `get-context-snapshot`, `copilot-runtime`, `chat-message`, `workspace-voice-v2` and others (some with `verify_jwt=false`; several could not be downloaded for inspection). **Recommendation: delete every deployed function that is not in the repository before invitations.** Deleting is a production change and needs Scott's approval; nothing has been deleted. `dropbox-poll` exists in the repository but is not deployed.
- **No display credential exists (B02).** The wall runs on an adult login and is identified only by the request body's `surface: 'wall'`. The schema has no device or pairing concept (`household_members.role` is owner / admin / member). Anonymous sign-in is disabled in `supabase/config.toml`. A restricted display identity is a build item, specified under B02 below.
- **Approve is browser-only (B06).** The stale check compares the card's `seen` stamps with the browser's cached rows, not a fresh read, and a failed rollback is still reported as "nothing changed". Direct writes are de-duplicated on retry; the card's Approve has no operation id.

## Fifth implementation batch — restricted display identity (B02)

Prepared on `claude/beta-readiness-program`, October 15. Migration `20261015100000_household_displays.sql`: `household_members.role` gains `display`; `household_displays` and `display_pairing_codes` tables; RPCs `create_display_pairing_code` (owner/admin, ten minutes), `claim_display_pairing` (anonymous sign-in only; an adult's account can never become a display), `revoke_display` (membership deleted, device fails closed at once), `is_display()` / `my_surface()` for policies and edge functions, and `household_family_calendar_ids()` so a display sees the household's family-only calendars. A trigger refuses every display write on tasks, routines, goals, notes, contacts, family members, households, memberships, invitations, instances, calendar mappings, lists, meals, recipes, chat sessions and attachments; family list items and the scratchpad stay open.

`symphony-agent` now decides the wall from identity: a display is the wall whatever its request says, and `surface: 'wall'` is honoured only for an adult. The wall fence reads the household's family calendars for a display. Client: Settings → Displays (make a code, list, revoke), the wall's signed-out front door is the pairing screen with "Sign in instead" one tap away, and a display session skips first-run setup.

Evidence: `scripts/test-household-displays.mjs` — 8 checks on a disposable PostgreSQL 17 cluster with stub auth (pair, claim, no adult claim, no double claim, household reads only, family calendars, write refusal, list/scratchpad allowed, revoke fails closed, outsider cannot revoke). Unit tests for the agent's identity check and the client pieces. **Not done:** the migration is not applied to the hosted project; `enable_anonymous_sign_ins` must be turned on there first; the wall UI has not been run under a display session on a real tablet (its calendar fetch goes through the signed-in user's Google tokens, which a display does not have — see the finding below); the display's `last_seen_at` is never written yet.

## Sixth implementation batch — truthful wall, diagnostics, every interactive paid route metered

Prepared on `claude/beta-readiness-program`, October 15.

- **Wall.** When the wall stops waiting (20 s) it aborts the agent stream, so a turn that outlived the listener stops at its next tool instead of finishing unseen. A spoken "approve" is bound to the card the wall last read out; a card that arrived unannounced is read first and approved on the next "approve". Approve's failure wording distinguishes a full rollback from "some of it stayed saved".
- **Diagnostics (plan §11).** `symphony-agent` logs one content-free JSON line per turn (request and turn ids, surface, model, provider call count and time, tool names, write counts, outcome state, error class) and returns a `requestId` on the done/error event, which the client keeps for problem reports. Hitting the 14-round tool cap now appends a plain sentence and marks the turn unverified instead of ending as if finished.
- **Allowance (B03).** Migration `20261015110000_ai_allowance_all_interactive_routes.sql` puts every interactive paid route on the shared allowlist (`GUARDED_AI_ROUTES` in `_shared/aiUsage.ts`); the local harness now checks it (13 checks). The nineteen previously unguarded interactive functions are being wired to `guardedAiFetch` (see the paid-path inventory for status). Background routes without a person's JWT (`email-scanner`, `extract-email`, `gmail-check`, `school-digest`, `proactive-engine`, `vault-sync`) are still unmetered: disable or meter them before invitations.
- **Durability (plan §4).** A change card still waiting survives a reload (per person, per tab); approve or dismiss clears it. Undo, receipts and voice state remain in memory.
- **Bench (plan §10).** `scripts/conversation-bench`: scenarios J1 (the plumber week) and R1 (routine: this week vs from now on) as data; the contract layer replays them through the real validators and applier and passes; the live layer exists for synthetic accounts and has not been run.

## Seventh implementation batch — every paid route metered, invited sign-up, mail consent separate

Prepared on `claude/beta-readiness-program`, October 15.

- **B03.** All nineteen interactive paid functions now reserve a provider call per attempt through the caller's own client and return the refusal (status, code, reset) without claiming success; `rhythms-parse` and `note-match` now verify the JWT they previously only required; `semantic-search` checks the user explicitly. Background routes (`email-scanner`, `extract-email`, `gmail-check`, `school-digest`, `proactive-engine`, `vault-sync`, `extract-capture`, `parse-page`'s worker path) get `reserve_ai_provider_call_for(p_user, p_route)` (migration `20261015120000`): service role only, the JWT role claim checked again inside, charging the person the job works for. All eight are wired (eighth batch): a refusal leaves a capture pending, reports kids' work skipped, keeps rule-based suggestions, defers an embedding; nothing is claimed done. Harness: 14 local checks. Still not a dollar ceiling: calls, not tokens; no realtime-duration cap; allowance numbers unchosen; hosted migrations unapplied.
- **B04.** `signup_allowed` admits an address with a live, unaccepted household invitation (migration `20261015130000`; local check covers live / expired / used / waitlist / stranger). The invitation still has to be accepted after sign-in. A real signed-out invited adult has not been walked through on the hosted project.
- **B05.** Google consent asks for calendar only by default; Gmail is an optional, separate "Also connect Gmail" in Settings; the callback records the granted scopes (migration `20261015140000`). The OAuth `state` is now signed (HMAC with the server's client secret) and bound to the signed-in person and provider; the callback refuses a missing, forged or other person's state before any token is exchanged (`_shared/oauthState.ts`, review of October 15: previously the callback never compared the state with the caller). Microsoft's state is still the old unsigned shape and its callback unchanged; it stays behind the tested flag. The Outlook card is offered only with `VITE_MICROSOFT_CALENDAR_ENABLED=1` (or an existing connection), so Microsoft is not advertised until tested on real personal and work accounts.
- **Client.** An AI allowance refusal on the typed bar is shown in its own words with the reset time (not "Assistant offline"); the paper-plan reader maps the allowance codes and keeps the photos.

## Eighth implementation batch — background routes wired, display heartbeat, household vocabulary

Prepared on `claude/beta-readiness-program`, October 15. Every paid route in the repository now reserves a provider call per attempt (interactive through the caller, background through the service role for the person the job serves). A paired display reports `last_seen_at` every ten minutes (`display_heartbeat`, display-only). The live voice's transcriber is given the family's names and routine names as its prompt (plan §5), bounded and never task text. Still outstanding for B03: chosen allowance numbers, hosted migrations, a realtime-duration cap and a dollar reconciliation.

## Ninth implementation batch — money, not only calls

Prepared on `claude/beta-readiness-program`, October 15. Migration `20261015150000_ai_spend_ledger.sql`: `ai_model_prices` (seeded as disabled placeholders at public list rates; an operator confirms and enables each), `ai_spend` (tokens, minutes and cents per call; never words), `record_ai_usage` / `record_ai_usage_for`, and `daily_cents` / `monthly_cents` on the global configuration and each household allowance, checked by both reservation functions before every provider attempt, plus `refuse_unpriced` to forbid any model without an enabled price. `guardedAiFetch` / `guardedAiFetchFor` now name the model to the reservation and record the reply's usage (Anthropic and OpenAI shapes) or the caller's estimate: a realtime admission is charged as five minutes at the model's per-minute price, speech as characters. A call can overshoot a ceiling by at most its own cost; the next is refused. Harness: 15 local checks (pricing, unpriced rows, daily and monthly cent ceilings, unpriced-model refusal).

**Approved beta settings (Scott, October 15):** the placeholder price rows at public list rates; global 3000 calls/day, 40000/month, $250/month; per household 400 calls/day, 6000/month, $3/day, $20/month; new households inherit these defaults. Revisit after the first week's `ai_spend` reconciliation.

To turn the plan's hypotheses into limits: `update ai_usage_configuration set monthly_cents = 25000` ($250/month globally), and per household `daily_cents = 300, monthly_cents = 2000` ($3/day, $20/month) — after enabling confirmed price rows. Still not covered: provider-side realtime usage beyond the admission estimate, hosted web/container tool charges, and reconciliation against the provider invoices (compare `ai_spend` sums with the dashboards monthly).

## Hosted release, October 15 (Scott approved the production steps)

Done on project `mwadppyrqzuzgstmwpuy`:

- The 27 orphaned edge functions were deleted; 57 remain, all in the repository. No client, app or function referenced any of them (only test stubs named `symphony-agent-v2`, `symphony-agent-wall-test`, `workspace-voice-v2` as example env values).
- The seven migrations were applied in order with `supabase db query --linked -f` (the project's migration history is not in sync with the numbered local files, so `db push` was not used) and recorded with `migration repair --status applied`; the objects were verified present afterwards. `20261014170000_discussion_with.sql` (another session's) was found not applied and left alone.
- Allowances turned on with the plan's cent ceilings and placeholder call limits: global `daily_calls 3000, monthly_calls 40000, monthly_cents 25000`; every existing household (4) `daily_calls 400, monthly_calls 6000, daily_cents 300, monthly_cents 2000`; the seven seeded price rows enabled as placeholders (public list rates; confirm); `refuse_unpriced = false` so an unlisted model is recorded unpriced rather than refused.
- Every repository function redeployed (57 of 57, no failures), preserving each one's existing JWT setting; the four main conversational routes answer 401 unauthenticated. The 14 functions without gateway JWT verification are the shared-secret and worker routes as before (`capture-to-inbox`, `email-scanner`, `extract-capture`, `extract-email`, `fetch-recipe`, `fetch-weather`, `inbound-email`, `kid-phone-call`, `log-medication`, `log-symptom`, `proactive-engine`, `school-digest`, `vault-capture`, `vault-sync`); `fetch-recipe`, `fetch-weather`, `log-medication` and `log-symptom` do their own checks and are not paid routes, but they remain on the list to review before invitations.

The web client followed: `claude/beta-readiness-program` was merged to `main` on October 15 with Scott's approval, through the pre-push gate (typecheck; full suite 8,633 passed, 3 skipped, with the connector's own dependencies installed), and `app.symphony-os.com` answers 200 on the new build. Production client and backend now match.

Not done: **anonymous sign-ins** could not be enabled from here (the management API refused the stored CLI token); flip Authentication → Sign-in methods → Anonymous in the dashboard. Until then "Pair this display" says plainly that display sign-in is not enabled. Real-account verification (a fresh organizer, an invited adult, a paired iPad, the bench live layer) remains to be run.

## First live bench runs, October 15

Against the deployed agent, with the synthetic household Scott created (`smkaufman+1015@gmail.com`; no real family records):

- Run 1 refused every turn: a household created after the allowance rows had none. Fixed by migration `20261015160000_ai_household_allowance_defaults.sql` (operator defaults copied to each new household; applied hosted; harness 16 checks).
- Runs 2–3: the model asked for the test-drive day before proposing anything, and at the correction said "Got it" without re-sending the card. Two prompt changes (put every capture on the card in the same turn, before any question; a correction re-sends the whole revised list) and one runner fix (the next turn is told a card is waiting, as the page does). Measured before the runner fix, 7 runs: capture→card 5/7, correction→revised card 2/7, later capture→card 7/7.
- After the fixes, **5 of 5 runs passed every graded step** (capture of four items → one card with all four, undated where unknown, the all-day test drive not placed on an invented day; correction → one revised card with one plumber task; later capture → joins the card; nothing written without approval). 15 of 15 steps. This is the text layer only; Approve, the dropped connection, retry and Undo are page actions for the browser layer, and the spoken layer is unmeasured.
- Spend ledger after the runs: 113 priced calls, $0.52 estimated, models `claude-sonnet-4-6` and `text-embedding-3-small`; 2 calls unpriced (`claude-opus-5-5`, used by a route not in the price list — add a confirmed row).

The 95% target for the core scenarios is a sample of five on one scenario so far; it is evidence that the loop is measurable, not a pass of the release suite.

## Browser-layer run, October 15 (hosted, synthetic household, Scott's Chrome + a separate Playwright browser)

Recorded as `symphony-j1-browser-layer.gif` (Scott's Downloads). Observed:

- Four captures typed into the bar → one card with all four, dashed on the week, nothing saved; the correction revised the card in place (one plumber task, now Friday); **Approve all 4** saved them (receipt "Saved · 4 things for the week" with Undo; two on Friday, two in "No day yet"); **Undo** removed all four (database: 0 rows).
- Display pairing from a separate browser: code from Settings → Displays, claimed on `/wall-v2` → the wall rendered for the display; `household_members.role = display`, heartbeat written. **Revoke** in Settings → membership gone; after the fix below the device signs out and shows the pairing screen.
- Anonymous sign-ins were enabled by Scott in the dashboard.

Bugs found and fixed in the same run (all on main and live): `create_display_pairing_code` failed hosted because `gen_random_bytes` lives in the `extensions` schema there; `/wall-v2` rendered its own sign-in form inside `WallV2Shell` so the pairing screen never appeared; the invite gate refused anonymous users ("Database error creating anonymous user", migration `20261015170000`); a revoked wall kept its empty shell (now signs out at the next check); a tab reloading as a deploy landed cached a 404 for the new bundle and went white (Vite `preloadError` now reloads once).

Left over: revoked anonymous auth users remain in `auth.users` until deleted (two were removed by hand; `revoke_display` could delete the auth user through the service role later); a price row for `claude-opus-5-5` was added as a placeholder.

## Real-account privacy pass, October 15 (hosted)

`scripts/privacy-pass/run.mjs`, run as three synthetic accounts through the ordinary REST and agent endpoints: A1 (owner of household A), A2 (invited into A through the product's invitation row + `accept_household_invitation`), B1 (owner of household B, set up through `setup_household`). **23 of 23 checks pass** on the second run: A2 sees A1's family task and gets no row at all for A1's work task (by id, by patch); B1 sees neither task, no membership and no people of household A; the agent as A2 or B1 does not disclose a task it cannot see; assigning the private task to a household member does not make it visible; moving it to Family does, moving it back hides it; B1 cannot list or revoke household A's displays; a plain member cannot make a pairing code; the owner removes A2 and A2 then sees nothing of household A, including through the agent.

Found and fixed on the way: removing a member through the ordinary client failed with "infinite recursion detected in policy" — the household_members update/delete policies looked up `households`, whose policy looks back at `household_members` (migration `20261015180000`, applied hosted). The first run also showed `assigned_to` must be a `family_members` id (test fixture, not a product bug).

Not covered yet: private assistants (B01 proper: per-adult assistant identity and history) are not in the first beta; notes, attachments and chat history isolation were not exercised by this pass; the display's own reads were checked in the browser-layer run, not here.

## Overnight run, October 15–16 (Scott's standing approval)

- **Privacy pass** 23/23 (above). **Emergency disable** rehearsed hosted (runbook).
- **Bench live, seeded records** (`live.mjs --seed` puts the scenario's rows into the synthetic household and removes them after): R1 routines (skip this Thursday → `routine_skip` on the card without asking "this week or from now on"; "from now on" → `routine_change`) **3/3**; M1 year planning (carry, let go, done, add on one card) **5/5** after two prompt rules (a named day is this week only; do not ask a new goal's life area) and accepting any read tool. J1 remains 5/5. Running total on the deployed agent since the fixes: 13 scenario runs, 13 passed.
- Not run: restore rehearsal (no access token was found at `~/.supabase/pat`); the spoken, iPad and five-adult sessions (kit ready).

## Money: what is and is not enforced (reconciled October 15)

- **Coverage.** Every function in the repository that calls Anthropic, OpenAI or SerpAPI reserves a provider call first: 23 interactive routes through the caller's own client (`GUARDED_AI_ROUTES`), 8 background routes through the service role for the person served (`BACKGROUND_AI_ROUTES`); the two lists match the database allowlists (`ai_guarded_routes()`, `ai_background_routes()`). The 27 orphaned functions that were outside this are deleted. Anthropic's server-side `web_search` / `web_fetch` inside a `symphony-agent` turn is one reservation for the model call that carries it; the hosted tool's own charge is not itemised. **Residual: web-tool charges and any route added later without the guard.**
- **Ledger vs reservations.** After the day's runs: reservations 193 (`symphony-agent` 185, `vault-sync` 6, `math-story` 2); ledger rows 193 (`claude-sonnet-4-6` 184 + `text-embedding-3-small` 1 under symphony-agent, 6 embeddings under vault-sync, 2 `claude-opus-5-5` under math-story), $0.89 priced. The two Opus calls were unpriced until the row was added (it is now a placeholder, enabled).
- **Prices (verified October 15, 07:58Z).** Anthropic (platform.claude.com/docs/en/about-claude/pricing): Sonnet 4.6 $3/$15, Opus 5.5 $4/$20 (the placeholder had $15/$75 — corrected hosted), Haiku 4.5 $1/$5 per million tokens; web search $10 per 1,000 searches. OpenAI (developers.openai.com/api/docs/pricing): gpt-4o $2.50/$10, gpt-4o-mini $0.15/$0.60, text-embedding-3-small $0.02; gpt-4o-mini-tts text $0.60/M tokens + audio $12/M tokens; gpt-realtime audio $32/M in, $64/M out per token (no per-minute rate; the page lists `gpt-realtime`, not a 2.1 name). Speech and realtime rows stay **estimates** (per character and per minute) and are marked so. **Found in Session D (October 15, 05:05Z):** the realtime row's 600¢/minute guess, with the 5-minute admission estimate, charged **$30 for one voice start** — more than the $20/month household ceiling — so every later start was refused with `ai_monthly_limit`. Corrected to 30¢/minute (provider rate is ~10¢/minute at $32/$64 per million audio tokens; 3× margin), and the one synthetic row re-priced to $1.50. Lesson: an estimate that is too high is also a failure — it locks people out. Earlier text, kept for the record: all rows were placeholders entered October 15 at remembered public list rates (per million tokens, cents: Sonnet 4.6 300/1500; Opus 5.5 1500/7500; Haiku 4.5 100/500; GPT-4o 250/1000; GPT-4o-mini 15/60; text-embedding-3-small 2; realtime 600/minute; mini-TTS 1200 per million characters). Scott approved keeping them for the beta; **they have not been checked against the providers' current price pages and must be before the first invoice reconciliation.** `refuse_unpriced` is off, so a model not in the table is recorded unpriced and allowed.
- **Concurrency.** The reservation takes a row lock on the global configuration, so simultaneous calls from many devices are serialised and cannot all spend the last allowance (local harness: 16 concurrent reservations against a four-call allowance). A call that overshoots a cent ceiling is the last one admitted; the next is refused.
- **Realtime voice.** A session is charged as five minutes at the per-minute placeholder when admitted; the client ends the call at 300 s; the provider does not report per-call usage to us. **Residual: a session kept alive past the client limit by a modified client, and the true audio token cost, are not measured.** Mitigations in place: the `WORKSPACE_VOICE_USER_IDS` allowlist (four ids) and the 12 starts per user per day counter.
- **Not a hard cap.** The ledger is an estimate reconciled after the fact; the provider dashboards remain the authority. Reconcile `ai_spend` against them weekly during the beta.

## Release blockers in order

Owner labels are responsibilities, not additional staff. Scott retains scope, spending, external-claim, and release approval.

| ID | Gate and owner | Evidence now | Work and required proof |
| --- | --- | --- | --- |
| B00 | Consistent visual and voice experience — product/design, client/voice and release QA | Shared assistant instructions and handoff regression tests are prepared. Visual reference sign-off, acoustic consistency and real-device UX acceptance are incomplete. | Pass UX01–UX08 and the five-person usability gate above. Attach screenshots, short recordings and observed results per advertised configuration. Include listening/recovery, saved/proposed semantics, clear audience and screen stability. |
| B01 | Shared/private authorization — backend owner | Real-account privacy pass passes 23/23 on the hosted project (two adults in A, one in B; isolation, no agent disclosure, assignment ≠ sharing, explicit sharing, cross-household displays, removal). Private assistants (separate identity and history) remain out of the first beta. | Define server-authorized assistant identity, household/user audience, history and memory boundaries; prohibit private transcript carry-over. Test two adults in one household and an adult in another household, including counts, search, attachments, histories, direct requests and revoked access. First retrieval hardening is prepared here; full gate remains open. |
| B02 | Restricted display identity — backend/client owner | Fifth batch: pairing code → anonymous display sign-in → `display` membership; server decides the wall from identity; database refuses display writes; revoke fails closed. Local SQL checks pass; not applied to the hosted project. | Pair a short-lived code to a revocable household-only device credential. Omitting or forging a surface flag must not grant private access. Test private requests, device revocation, sign-out/restart and expiry on the selected tablet. Required before certifying a shared display. |
| B03 | Paid-AI ceilings — backend owner | The third batch adds configurable atomic household/global provider-call admission for four interactive routes, including agent follow-ups/embeddings; local concurrency tests pass. No hosted migration or deployment, chosen allowances, realtime spend cap, universal coverage or dollar budget yet. | Complete the activation requirements above. Meter or disable remaining paid routes/triggers; reserve/reconcile monetary spend and cap model input, retries, concurrency and realtime usage. Prove isolated real-account behavior. Proposed launch-plan amounts are not approved expenditure. |
| B04 | Fresh household and invite journey — client/auth owner | Setup and invitation RPCs exist. The inspected `signup_allowed` migration checks named/pattern accounts and approved waitlist entries, not household invitations. | Test a genuinely new organizer, then a signed-out invited adult whose address is absent from the waitlist. Preserve invite/pairing intent through sign-in. Decide and implement explicit beta admission for invited adults; do not silently open unrestricted signups. Record live policy before changing it. |
| B05 | Calendar connection — integration owner | Google authorization requests calendar, Gmail read and Gmail send scopes together. State in the URL is encoded user ID; callback validates a user JWT but does not consume a server nonce in the inspected implementation. Microsoft calendar code exists. | Separate calendar consent from optional mail; review callback binding/replay protections end to end. Test wrong account, refusal, reconnect, revocation, token renewal and calendar selection. Inspect Google publishing status. Microsoft requires real personal/work account evidence before advertising support. |
| B06 | Recovery and operations — release owner | Existing tests, demo reset, and earlier rehearsal records provide groundwork. The existing integration suite explicitly provisions and deletes throwaway users in production. | Establish a separate test environment before expanding destructive tests. Prove backup restore, code/schema rollback, retained drafts, idempotent approval/Undo under concurrent edits, content-free diagnostics, feedback and incident handling. Historical pass reports are not current evidence. |
| B07 | Supported clients — platform owner | Web build available. Tauri docs describe an unsigned build/OAuth limitations; native Apple navigation still contains legacy Projects terminology. Pi voice instructions describe a specific local setup. | Certify browser and phone first, then one named iPad/OS configuration for 48 hours. Treat Mac, native iOS, Android and Fire as separately gated choices. Test installation, authorization return, sleep/restart, touch and connection recovery. |
| B08 | Personalization and product help — product owner | Maintained page guides exist. Commit `bb1ce0d9` removes main-agent Scott/source assumptions and shares personality/result-state instructions across typed, voice and wall prompts; request-boundary and voice-handoff tests pass. | Test actual generated help against supported screens and fresh accounts; audit timezone defaults and remaining legacy terminology/write paths. Keep onboarding optional and include a plain shared/private explanation. Contract tests do not close the end-to-end gate. |

## Paid-path inventory to reconcile with deployment

This is a source inventory, not proof that every endpoint is deployed or exposed. Provider URLs and key references identified these candidates under `supabase/functions`; record deployment, caller authentication, owner scope, scheduled triggers, bounded usage and kill-switch coverage for each before invitations.

| Group | Functions / shared path | Guard/audit status in this branch |
| --- | --- | --- |
| Main typed assistant and wall agent | `symphony-agent` | Verified caller JWT; each Anthropic request and OpenAI embedding attempt uses the new guard, including tool-loop follow-ups and task-context enrichment. Hosted web/container work inside a provider response is not separately counted. Maximum 14 model turns is an existing bound, not a dollar cap. |
| Other conversation and planning | `planning-conversation`, `goal-planning-chat`, `tend-week`, `sharpen-goal`, `suggest-waiting-for`, `rhythms-parse` | Guarded (seventh batch): every provider attempt reserves, including suggest-waiting-for's context embeddings; rhythms-parse now verifies the JWT. |
| Interactive voice and wall | `workspace-voice`, `wall-ask`, `wall-say` | Verified caller JWT; all three reserve before their paid HTTP attempt. Voice retains its allowlist and 12 starts/user/UTC-day counter. Realtime admission is not enforcement for ongoing audio use; wall fallback to local speech must be tested for clear recovery. |
| Other wall work | `kiosk-agent`, `math-story` | Guarded (seventh batch): OpenAI and each SerpAPI search reserve; a refusal cannot read as "no flights match". |
| Capture and documents | `analyze-capture`, `analyze-attachment`, `analyze-link`, `parse-page`, `plan-from-paper`, `extract-capture`, `routine-from-doc` | Guarded (seventh batch) on every person-JWT path, refusal before any irreversible write. `extract-capture` and parse-page's worker path use the background reservation (eighth batch). Output limits still do not bound total input. |
| Email processing | `extract-email`, `email-scanner`, `gmail-check`, `school-digest` | Background reservation (`reserve_ai_provider_call_for`, service role only) charging the person the job works for (eighth batch). Trigger/retry caps still needed. |
| Meals | `meal-planner-chat`, `meal-slot-suggest` | Guarded (seventh batch); each meal-chat tool-loop turn reserves, and a refusal mid-stream is an error event, never a done. |
| Knowledge and background work | `semantic-search`, `note-match`, `vault-sync`, `proactive-engine`, `_shared/context-graph/assemble.ts` | `semantic-search` and `note-match` guarded (and now verify the JWT). `vault-sync` and `proactive-engine` use the background reservation (eighth batch); the AI pass is reported skipped on refusal, and a deferred embedding is re-done on the next push or backfill. |

Reconcile provider billing separately with SDK-based calls, other infrastructure, and external scheduled workers; a source search is not a complete billing inventory. Count each actual provider attempt once, including a shared embedding helper's attempt; do not reserve twice for the same outbound request. The deployed function inventory, enabled cron/webhook triggers and provider dashboards have not been checked by this batch.

## Real-account acceptance scenarios

Use synthetic records in a separate test environment, with two adults in Household A, an adult in Household B, and a paired device for A. Only the provisioning/cleanup harness may use administrative access. Assertions must run through ordinary authenticated clients. Keep real family records and provider credentials out of fixtures and logs.

| Scenario | Required result |
| --- | --- |
| Adult A asks their private assistant about a work task | Authorized notes and useful context appear; the history stays private. |
| Adult A names Adult B's private task ID | No title, existence/count, note, attachment, search result or transcript is disclosed; no provider enrichment receives that task's content. |
| Household A or its wall asks about either adult's private plans | No private content; a wall credential cannot elevate by changing request fields or calling the desktop route. |
| Household B uses Household A item/session IDs | Reads and writes are denied by services and database policies. |
| A privately plans a work deadline, then explicitly shares Thursday afternoon availability | Household receives only the chosen availability; source title, notes, employer and transcript stay private. Revoke and Undo behave as described. |
| A member leaves, or a paired device is revoked | Further reads/writes and subsequent assistant context assembly fail closed. Cached/displayed history is cleared according to the documented device policy. |
| Two requests arrive at the remaining budget limit | At most the affordable work starts. Retries cannot evade limits; manual planning remains available and drafts survive a denied AI request. |

Existing `tests/integration/task-privacy.integration.test.ts` is useful groundwork but is not an assistant-isolation test and must not be run casually: it currently targets the configured project, creates users, and sweeps old test accounts. Local SQL fixtures also do not establish current production policies.

## Verification record

- Provider-call allowance batch: **231 tests passed across 21 affected files**; the four guarded backend entry points typecheck, targeted lint has no errors (two existing test-file `any` warnings), and the web production build passed with existing bundle/import/browser-data/Sentry configuration warnings. **12 checks passed on a disposable local PostgreSQL 17.7 cluster**, including 16 concurrent reservations against a four-call household fixture and a three-call global fixture, cross-route monthly limits, disabled/missing configuration, permissions, membership, UTC reset boundaries and retained usage after deletion. Those fixture numbers are not proposed beta quotas. The harness destroys its local cluster and never reads application environment files or contacts a remote database. Hosted Supabase is configured for PostgreSQL 15; verification with its current auth/grants/migrations and real JWTs remains required. No paid provider was called, no hosted migration was applied, and B03 is not complete.

- Shared assistant instruction batch (`bb1ce0d9`): **149 tests passed in 15 affected agent, wall and voice files** on October 14; affected backend typechecks and targeted lint passed. Regressions cover real request construction, missing/denied/unavailable Gmail, mailbox scope, and unchanged voice handoff for proposed/saved/failed results. No paid model or actual audio session was used; these results do not establish live reply quality or voice consistency.

- Focused assistant/context/wall/voice regression run: **161 tests passed in 15 files** on October 14.
- Production web build: **passed**. Existing bundle-size, mixed static/dynamic import, stale browser-data and absent Sentry upload-token warnings remain; no release was uploaded.
- Targeted lint on changed context files and waiting endpoint: **passed**.
- Full unit suite on Node 22: **8,750 passed, 3 skipped; 830 of 831 files passed initially**. The remaining WhatsApp connector suite could not resolve its separately installed dependency. After linking its existing dependencies into this checkout, its targeted rerun passed all **10 tests**. Combined evidence: **8,760 passed, 3 skipped**, all 831 files exercised successfully across the full run and targeted rerun. The initial run with the machine's newer default Node encountered test-environment `localStorage` failures; use the repository's Node 22 runtime for reproducible checks.
- Deno typecheck of context assembly and both interactive endpoints: **passed**. Including `proactive-engine` reports seven type errors; the same seven errors were reproduced from its unchanged baseline source. Track this existing backend typecheck debt separately; the web build does not check these functions.
- Real authenticated multi-household tests, actual deployment configuration, provider OAuth renewal, display soak, cost concurrency, backup restore and rollback: **not yet run for this candidate**.

Next work: approve the common visual/voice reference and run the UX matrix while addressing server-authorized assistant/display identity and an enforceable paid-call budget. Establish isolated real-account fixtures before either security gate is marked ready. Keep the current visual design steady; prioritize observed inconsistencies and failures rather than another redesign.

### Reproduce the local checks

Use Node 22, with root and `connectors/` dependencies installed. These checks do not invoke the production integration harness:

```sh
npm run build
npx vitest run
deno check --no-lock supabase/functions/_shared/context-graph/assemble.ts supabase/functions/symphony-agent/index.ts supabase/functions/suggest-waiting-for/index.ts
```

The background-engine typecheck is a separate known failure at this baseline. Before rollout, verify the deployed database's `search_notes_semantic` grant and the current policies with ordinary authenticated accounts. The first retrieval patch required no migration; the third batch adds the un-applied AI call-allowance migration described above.

For the isolated allowance checks (choose an installed PostgreSQL binary directory):

```sh
node scripts/test-ai-usage-guard.mjs --pg-bin /path/to/postgres/bin
```

This command always initializes a disposable local cluster with synthetic roles/rows and a private Unix socket. It does not use the production integration harness or the configured Supabase project.
