# Symphony beta readiness register

Started October 14, 2026. Source baseline: `origin/main` at `82acf4d6`, fetched that day. Working branch: `codex/beta-readiness`. This is an implementation and evidence register, not a declaration that production is ready.

The product and rollout authority is the [Symphony beta and market launch plan](https://chatgpt.com/space/page_50fd3d212da08191a8cb14eb58ea70e1). It now specifies one shared family assistant and an optional private assistant per person for personal and work life. Private assistants are optional to activate; their release requires separate privacy evidence. Household billing or administration does not confer access to private conversations.

**A consistent visual and voice experience is a P0 release requirement.** The same Symphony identity, terminology, audience cues and action semantics must carry across supported screens and typed, spoken and direct interactions. The experience gate below is required alongside privacy, setup, recovery and cost gates; it is not deferred polish.

## Current decision

**Do not expand invitations yet.** Source inspection found useful foundations, but cross-device visual/voice acceptance, separate assistant scopes, restricted display credentials, comprehensive AI budgets, and fresh-household acceptance evidence remain incomplete. The prepared changes harden retrieval and establish shared assistant instructions; they do not certify model replies, acoustic quality or the complete shared/private assistant model. No production data, schema, provider settings, or deployment has been changed by this work.

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

## Release blockers in order

Owner labels are responsibilities, not additional staff. Scott retains scope, spending, external-claim, and release approval.

| ID | Gate and owner | Evidence now | Work and required proof |
| --- | --- | --- | --- |
| B00 | Consistent visual and voice experience — product/design, client/voice and release QA | Shared assistant instructions and handoff regression tests are prepared. Visual reference sign-off, acoustic consistency and real-device UX acceptance are incomplete. | Pass UX01–UX08 and the five-person usability gate above. Attach screenshots, short recordings and observed results per advertised configuration. Include listening/recovery, saved/proposed semantics, clear audience and screen stability. |
| B01 | Shared/private authorization — backend owner | Desktop agent uses the signed-in person's access. Wall restrictions depend on a client-supplied `surface: 'wall'`; wall code documents an adult JWT. Chat history is organized by item/persistence key, not a distinct family/private assistant identity. | Define server-authorized assistant identity, household/user audience, history and memory boundaries; prohibit private transcript carry-over. Test two adults in one household and an adult in another household, including counts, search, attachments, histories, direct requests and revoked access. First retrieval hardening is prepared here; full gate remains open. |
| B02 | Restricted display identity — backend/client owner | `symphony-agent/wallMode.ts` narrows wall tools and database reads, but explicitly assumes an adult login. No restricted pairing credential was located in the inspected wall path. | Pair a short-lived code to a revocable household-only device credential. Omitting or forging a surface flag must not grant private access. Test private requests, device revocation, sign-out/restart and expiry on the selected tablet. Required before certifying a shared display. |
| B03 | Paid-AI ceilings — backend owner | Workspace voice has a pilot allowlist, an atomic 12-start daily counter, and a client timer. There is no unified dollar budget in the reviewed request paths. Many endpoints call providers directly. | Inventory deployed/reachable paid routes; reserve budget atomically before every provider call, reconcile spend, enforce household/global limits and concurrency, cap tool loops/retries/voice, and provide an emergency disable. Attribute private usage without exposing private content. Proposed launch-plan amounts are not approved expenditure. |
| B04 | Fresh household and invite journey — client/auth owner | Setup and invitation RPCs exist. The inspected `signup_allowed` migration checks named/pattern accounts and approved waitlist entries, not household invitations. | Test a genuinely new organizer, then a signed-out invited adult whose address is absent from the waitlist. Preserve invite/pairing intent through sign-in. Decide and implement explicit beta admission for invited adults; do not silently open unrestricted signups. Record live policy before changing it. |
| B05 | Calendar connection — integration owner | Google authorization requests calendar, Gmail read and Gmail send scopes together. State in the URL is encoded user ID; callback validates a user JWT but does not consume a server nonce in the inspected implementation. Microsoft calendar code exists. | Separate calendar consent from optional mail; review callback binding/replay protections end to end. Test wrong account, refusal, reconnect, revocation, token renewal and calendar selection. Inspect Google publishing status. Microsoft requires real personal/work account evidence before advertising support. |
| B06 | Recovery and operations — release owner | Existing tests, demo reset, and earlier rehearsal records provide groundwork. The existing integration suite explicitly provisions and deletes throwaway users in production. | Establish a separate test environment before expanding destructive tests. Prove backup restore, code/schema rollback, retained drafts, idempotent approval/Undo under concurrent edits, content-free diagnostics, feedback and incident handling. Historical pass reports are not current evidence. |
| B07 | Supported clients — platform owner | Web build available. Tauri docs describe an unsigned build/OAuth limitations; native Apple navigation still contains legacy Projects terminology. Pi voice instructions describe a specific local setup. | Certify browser and phone first, then one named iPad/OS configuration for 48 hours. Treat Mac, native iOS, Android and Fire as separately gated choices. Test installation, authorization return, sleep/restart, touch and connection recovery. |
| B08 | Personalization and product help — product owner | Maintained page guides exist. Commit `bb1ce0d9` removes main-agent Scott/source assumptions and shares personality/result-state instructions across typed, voice and wall prompts; request-boundary and voice-handoff tests pass. | Test actual generated help against supported screens and fresh accounts; audit timezone defaults and remaining legacy terminology/write paths. Keep onboarding optional and include a plain shared/private explanation. Contract tests do not close the end-to-end gate. |

## Paid-path inventory to reconcile with deployment

This is a source inventory, not proof that every endpoint is deployed or exposed. Provider URLs and key references identified these candidates under `supabase/functions`; record deployment, caller authentication, owner scope, scheduled triggers, bounded usage and kill-switch coverage for each before invitations.

| Group | Functions / shared path |
| --- | --- |
| Conversation and planning | `symphony-agent`, `planning-conversation`, `goal-planning-chat`, `tend-week`, `sharpen-goal`, `suggest-waiting-for`, `rhythms-parse` |
| Voice and wall | `workspace-voice`, `wall-ask`, `wall-say`, `kiosk-agent`, `math-story` |
| Capture, documents and email | `analyze-capture`, `analyze-attachment`, `analyze-link`, `parse-page`, `plan-from-paper`, `extract-capture`, `extract-email`, `email-scanner`, `gmail-check`, `school-digest`, `routine-from-doc` |
| Meals | `meal-planner-chat`, `meal-slot-suggest` |
| Knowledge and background work | `semantic-search`, `note-match`, `vault-sync`, `proactive-engine`, `_shared/context-graph/assemble.ts` |

Reconcile provider billing separately with SDK-based calls, other infrastructure, and external scheduled workers; a source search is not a complete billing inventory. Do not duplicate billing when a shared helper runs inside a metered request.

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

The background-engine typecheck is a separate known failure at this baseline. Before rollout, verify the deployed database's `search_notes_semantic` grant and the current policies with ordinary authenticated accounts. No schema migration is part of this patch.
