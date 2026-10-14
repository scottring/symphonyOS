# Symphony beta readiness register

Started October 14, 2026. Source baseline: `origin/main` at `82acf4d6`, fetched that day. Working branch: `codex/beta-readiness`. This is an implementation and evidence register, not a declaration that production is ready.

The product and rollout authority is the [Symphony beta and market launch plan](https://chatgpt.com/space/page_50fd3d212da08191a8cb14eb58ea70e1). It now specifies one shared family assistant and an optional private assistant per person for personal and work life. Private assistants are optional to activate; their release requires separate privacy evidence. Household billing or administration does not confer access to private conversations.

## Current decision

**Do not expand invitations yet.** Source inspection found useful foundations, but separate assistant scopes, restricted display credentials, comprehensive AI budgets, and fresh-household acceptance evidence remain incomplete. The first change below hardens existing retrieval; it does not implement or certify the complete shared/private assistant model. No production data, schema, provider settings, or deployment has been changed by this work.

## First implementation batch

Interactive item-context retrieval previously used a service-role database client and manually reproduced selected access rules. That creates a second permission implementation that can drift from the real database policies.

- `symphony-agent` and `suggest-waiting-for` now authenticate and retrieve context with the public application key plus the caller's verified bearer token. Neither endpoint needs the service-role key.
- Interactive semantic enrichment uses the authenticated search function. Because that function is SECURITY DEFINER, candidate notes are re-read through the caller's database client before their text enters model context. Semantic enrichment remains owner-only; explicitly linked notes retain their existing sharing rules. Search candidates filtered out at this step can yield fewer semantic suggestions.
- The background `proactive-engine` explicitly retains its existing service search path. Background authorization still needs a separate review; this patch does not certify it.
- Regressions exercise both actual HTTP entry points with auth/provider doubles, plus semantic candidate rejection, denied-search behavior, and refusal to embed an inaccessible task. They do not prove deployed database policies or real-account isolation.

Source: `supabase/functions/symphony-agent/index.ts`, `supabase/functions/suggest-waiting-for/index.ts`, `supabase/functions/_shared/context-graph/assemble.ts`, and `supabase/functions/proactive-engine/index.ts`.

## Release blockers in order

Owner labels are responsibilities, not additional staff. Scott retains scope, spending, external-claim, and release approval.

| ID | Gate and owner | Evidence now | Work and required proof |
| --- | --- | --- | --- |
| B01 | Shared/private authorization — backend owner | Desktop agent uses the signed-in person's access. Wall restrictions depend on a client-supplied `surface: 'wall'`; wall code documents an adult JWT. Chat history is organized by item/persistence key, not a distinct family/private assistant identity. | Define server-authorized assistant identity, household/user audience, history and memory boundaries; prohibit private transcript carry-over. Test two adults in one household and an adult in another household, including counts, search, attachments, histories, direct requests and revoked access. First retrieval hardening is prepared here; full gate remains open. |
| B02 | Restricted display identity — backend/client owner | `symphony-agent/wallMode.ts` narrows wall tools and database reads, but explicitly assumes an adult login. No restricted pairing credential was located in the inspected wall path. | Pair a short-lived code to a revocable household-only device credential. Omitting or forging a surface flag must not grant private access. Test private requests, device revocation, sign-out/restart and expiry on the selected tablet. Required before certifying a shared display. |
| B03 | Paid-AI ceilings — backend owner | Workspace voice has a pilot allowlist, an atomic 12-start daily counter, and a client timer. There is no unified dollar budget in the reviewed request paths. Many endpoints call providers directly. | Inventory deployed/reachable paid routes; reserve budget atomically before every provider call, reconcile spend, enforce household/global limits and concurrency, cap tool loops/retries/voice, and provide an emergency disable. Attribute private usage without exposing private content. Proposed launch-plan amounts are not approved expenditure. |
| B04 | Fresh household and invite journey — client/auth owner | Setup and invitation RPCs exist. The inspected `signup_allowed` migration checks named/pattern accounts and approved waitlist entries, not household invitations. | Test a genuinely new organizer, then a signed-out invited adult whose address is absent from the waitlist. Preserve invite/pairing intent through sign-in. Decide and implement explicit beta admission for invited adults; do not silently open unrestricted signups. Record live policy before changing it. |
| B05 | Calendar connection — integration owner | Google authorization requests calendar, Gmail read and Gmail send scopes together. State in the URL is encoded user ID; callback validates a user JWT but does not consume a server nonce in the inspected implementation. Microsoft calendar code exists. | Separate calendar consent from optional mail; review callback binding/replay protections end to end. Test wrong account, refusal, reconnect, revocation, token renewal and calendar selection. Inspect Google publishing status. Microsoft requires real personal/work account evidence before advertising support. |
| B06 | Recovery and operations — release owner | Existing tests, demo reset, and earlier rehearsal records provide groundwork. The existing integration suite explicitly provisions and deletes throwaway users in production. | Establish a separate test environment before expanding destructive tests. Prove backup restore, code/schema rollback, retained drafts, idempotent approval/Undo under concurrent edits, content-free diagnostics, feedback and incident handling. Historical pass reports are not current evidence. |
| B07 | Supported clients — platform owner | Web build available. Tauri docs describe an unsigned build/OAuth limitations; native Apple navigation still contains legacy Projects terminology. Pi voice instructions describe a specific local setup. | Certify browser and phone first, then one named iPad/OS configuration for 48 hours. Treat Mac, native iOS, Android and Fire as separately gated choices. Test installation, authorization return, sleep/restart, touch and connection recovery. |
| B08 | Personalization and product help — product owner | Maintained page guides exist, but the main agent prompt still assumes Scott and his connected sources. | Replace account assumptions with verified user/household context, audit timezone defaults, and test help against supported screens. Keep onboarding optional and include a plain shared/private explanation. |

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

- Focused assistant/context/wall/voice regression run: **161 tests passed in 15 files** on October 14.
- Production web build: **passed**. Existing bundle-size, mixed static/dynamic import, stale browser-data and absent Sentry upload-token warnings remain; no release was uploaded.
- Targeted lint on changed context files and waiting endpoint: **passed**.
- Full unit suite on Node 22: **8,750 passed, 3 skipped; 830 of 831 files passed initially**. The remaining WhatsApp connector suite could not resolve its separately installed dependency. After linking its existing dependencies into this checkout, its targeted rerun passed all **10 tests**. Combined evidence: **8,760 passed, 3 skipped**, all 831 files exercised successfully across the full run and targeted rerun. The initial run with the machine's newer default Node encountered test-environment `localStorage` failures; use the repository's Node 22 runtime for reproducible checks.
- Deno typecheck of context assembly and both interactive endpoints: **passed**. Including `proactive-engine` reports seven type errors; the same seven errors were reproduced from its unchanged baseline source. Track this existing backend typecheck debt separately; the web build does not check these functions.
- Real authenticated multi-household tests, actual deployment configuration, provider OAuth renewal, display soak, cost concurrency, backup restore and rollback: **not yet run for this candidate**.

Next implementation batch: server-authorized assistant/display identity and an enforceable paid-call budget, with isolated real-account fixtures established before either is marked release-ready. Keep the current visual design steady while closing these gates.

### Reproduce the local checks

Use Node 22, with root and `connectors/` dependencies installed. These checks do not invoke the production integration harness:

```sh
npm run build
npx vitest run
deno check --no-lock supabase/functions/_shared/context-graph/assemble.ts supabase/functions/symphony-agent/index.ts supabase/functions/suggest-waiting-for/index.ts
```

The background-engine typecheck is a separate known failure at this baseline. Before rollout, verify the deployed database's `search_notes_semantic` grant and the current policies with ordinary authenticated accounts. No schema migration is part of this patch.
