# Friends and family beta: readiness and walkthrough guide

Updated October 16, 2026. **2026-10-16.7-school-review** is deployed for normal authenticated accounts at [Symphony](https://app.symphony-os.com), from `codex/school-information-beta` source commit `9f74011524b11658c6ccb4d6a46e0227f02407e3`. It includes the previously deployed .6 baseline. The stable Vercel address serves the same build. Multiple-account calendar work remains separate in `codex/voice-transaction-bench`; it is not included in this release. Earlier test reports below remain dated evidence, not a blanket invitation approval.

## Current production baseline — October 16

School email review, routines and forwarding guidance are now deployed after
explicit approval: migration `20261016150000_school_mail_review`, `inbound-email`
v14, `extract-email` v20, `capture-retry` v13 and frontend
`dpl_5ED7NyzmQL3pTD4RhGHm4ESMEGTB`. **213 automated checks**, the production build,
14 live synthetic assertions and a hosted browser correction/selection/Save with
database readback passed. The live check also corrected an unpriced email-model
configuration to the funded planner model without relaxing spending controls.
The mail-worker update still needs Cloudflare sign-in; actual forwarded-email
delivery and Gmail filter setup remain to be checked. See
[school mail setup](../school-mail-setup.md) and
[deployment evidence](2026-10-16-school-mail-production.json).

The underlying .6 baseline (previous frontend deployment
`dpl_HanBwr5giz8rPuQFMZELxZ81Efr5`) retains `symphony-agent` v75 with JWT
verification enabled. It uses the previously reviewed .5 onboarding, chat and
single-account calendar implementation, removes the test-account frontend
restriction, and connects chat to the normal production planner. It also corrects
Today's summary and open-time labels when calendar coverage is missing or
unavailable. No database migration was applied for .6; the school review migration
was applied for .7. The following baseline evidence predates that addition.

Verification passed: **353 selected automated tests**, TypeScript/Vite production build, Deno planner source check, and a real-AI walkthrough using a fresh ordinary synthetic account outside the test allowlist. The walkthrough saved a Saturday-start household, three routines (including a hidden routine), and two initial activities; moved the existing library task without duplication; then saved and undid a separate two-task reviewed draft. Database readback confirmed the original tasks and routines survived Undo. The final main-domain sign-in and saved onboarding state were checked again after promotion.

Six hosted checks passed on the main domain: production preflight, anonymous planner refusal, normal-account planner admission, Google Calendar's production return address with calendar-only scopes, the exact frontend release identity, and all five video files serving playable media. Google account consent and real event synchronization were not rerun for this release. Phone and tablet instructions were reviewed; physical installation and display soak tests remain open. See [machine-readable evidence](2026-10-16-baseline-production.json).

## What is ready to walk through

The onboarding path is implemented: **Your household → Your routines → Your first activities → Your devices → Ready to begin.** Named progress marks what is saved, where you are, and what you left for later. Devices are optional. The user can start with this browser alone.

Routines and first activities are conversations. Symphony helps structure the user's own intentions, offers a draft, accepts corrections, and writes only when the user presses Save. Goals do not require a full hierarchy, tasks do not require a date, and a setup completion does not mean the week is planned.

The five short horizon videos explain Year, Season, Month, Week and Today with the existing Symphony voice, examples filling in, and the relationships between nested goals and supporting activities. The season introduction asks, “What goals will you progress this quarter?” The existing planning views remain in place.

The candidate also includes installation instructions, shared-tablet pairing guidance and controls, and six everyday examples available again from Help. The optional iPhone Duo layout study is separate from the beta app and uses sample replies and temporary records.

**This is ready for an onboarding review, not for sending invitations yet.** The remaining release gates below must be reconciled against one deployed candidate before the first five households are invited.

## A new household's path

| Moment | What the person does | What Symphony should make clear |
| --- | --- | --- |
| Arrive | Sign in through the approved beta invitation or account flow. | A new organizer sets up a household; an invited adult joins the existing household. An invited person must not create duplicate people or routines. |
| Household | Review the household and people. Choose whether weeks begin on Sunday, Monday or Saturday. Connect a calendar now or later. | The week choice applies to the household and saves with setup; invited adults inherit it. Personal and household activities have different audiences. Calendar access is optional. A missing calendar is unknown availability, not free time. Calendar selection is deliberate. |
| Typical week | Describe the recurring parts of life in ordinary language. | The draft shows recurrence, people, exact times or flexible notes, and whether routines show in Today/Week. The user can correct it, save it, or come back later. |
| Horizons | Read the five short introductions; optionally watch examples. | Year/quarter/month hold goals. Week/day hold activities and occurrences. Nested links are optional; completing one task does not automatically complete its parent goals. |
| First intentions | Tell Symphony about tasks, ideas or goals, together or separately. | Each draft item states its destination. Undated ideas stay in Inbox. The AI asks when a goal's horizon is unclear rather than inventing a plan. |
| Review and save | Correct the same draft, then press Save. | No activity or goal is written during the conversation. An uncertain save keeps the draft and its identities for retry. Completion receipts come from saved rows, not the model's wording. |
| Devices | Choose personal installation, a shared display, or this browser for now. | Reviewing instructions is not proof of installation or pairing. Another adult uses an invitation and their own account. A shared tablet uses a restricted display identity. |
| Finish | Review Ready now and For later, then open the saved destination. | Future dates and years are named explicitly. Deferred items remain available. Getting started and everyday guidance remain in Help. |

For the next walkthrough, use **https://app.symphony-os.com/getting-started**. Existing accounts retain their saved place. The new Baseline Verification Household has completed the automated live walkthrough and is no longer empty; the earlier Rivera household and its Google connection were left untouched. Restart any old localhost OAuth link from the main app's Calendar settings.

The Google sign-in request, approved return address, user binding, expiry and one-use callback checks pass. Actual Google account consent, calendar selection, event visibility and reconnect still require the account holder's walkthrough. **Calendar wording fixed in .5:** disconnected/unavailable calendars say availability is unknown; day columns omit clear-time claims without coverage. Planner reads expose calendar coverage and keep replies scoped to recorded activities. A real AI check passed after refining its concluding summary. No real calendar consent was performed during unattended testing.

## Phone, tablet and computer setup

On a personal device, open the published Symphony address and sign in to the same account. Saved records follow the account; an unsent message or unsaved draft may remain in the browser that created it. Use the Symphony icon once after installing and verify a saved item before closing the original session.

- **iPhone / iPad:** Safari → Share → Add to Home Screen. Leave Open as Web App on if offered. Open the new icon and sign in again if needed. [Apple instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).
- **Android phone / tablet:** Chrome menu → Add to Home screen → Install when offered. Open the icon and verify the same household. [Google instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en).
- **Computer:** Bookmark Symphony or use the browser's installation option. Safari on Mac also supports Add to Dock. [Apple instructions](https://support.apple.com/en-gb/104996).

The installation manifest now uses Symphony's existing logo at the declared sizes and permits either orientation. This is a web app, not a new App Store or Play Store release. Chat and confirmed saves need an internet connection; offline operation is not promised.

## A shared household tablet

1. On the tablet, open the browser or installed Symphony app that will stay in use. Pair after installing because browser and app sign-ins may be separate.
2. Sign out of personal Symphony accounts on that tablet. Open `/wall-v2`.
3. On the adult's own device, use Getting started → Your devices → Shared household display, or Settings → General → Displays. Create the short-lived pairing code and enter it on the tablet.
4. Check the household shown on the tablet, then refresh the paired-device list on the adult's device. A generated code is not a confirmed pairing. The list shows the last connection where available.
5. Optionally use [iPad Guided Access](https://support.apple.com/en-us/111795) or [Android app pinning](https://support.google.com/android/answer/9455138?hl=en) to keep the device on that screen. These settings supplement, rather than replace, the restricted Symphony identity.
6. Check reconnection after sleep and restart. If the tablet is lost or retired, revoke it from the adult's device and clear its website data before giving it away.

A localhost preview cannot be opened from another device. Physical-device tests need the deployed candidate or an explicitly reachable test address. The new guide does not claim that an iPad/Android configuration has passed a soak test.

## Everyday guidance after onboarding

Help → **When life changes** opens these explanations, each with a concrete example and a link into the existing app:

| Intent | Key distinction to teach | Required verification |
| --- | --- | --- |
| Structure a new week | Bring the user's intentions into the existing week; don't silently replace it. | Draft and saved rows agree; unrelated activities remain. |
| Change an existing plan | Move the existing item, including the week/day consequences. | One item changes; no copied errand appears. |
| Capture an ad hoc idea | Quick capture saves directly; Chat offers a draft first. | An undated idea remains undated and findable in Inbox. |
| Change a routine | One occurrence versus the repeating pattern; display visibility versus deletion. | Skip one Thursday without changing future Thursdays; hidden routines remain in Routines. |
| Link a goal and activity | Nested goals and supporting activities remain separate records with deliberate relationships. | Correct parent and horizon; no invented supporting tasks or automatic parent completion. |
| Defer or recover | Remove a day versus remove a week commitment; leave a draft versus Undo a save. | Truthful feedback, retained draft on failure, no duplicate retry, and protection from overwriting later edits. |

These examples are product guidance, not a claim that every legacy transaction path is newly certified. The broader transaction evidence and open recovery findings below still apply.

## Earlier October 16 hosted test verification — historical

The version numbers, account state and deployment statements in this section describe those earlier test runs. The current production baseline is recorded above.

**Current revision: 2026-10-16.5.** Hosted at `symphony-rebuild-cdgiwqsb2-scottrings-projects.vercel.app` (`dpl_8hUgHEqSpgaoTiMoqqS9i3p7o5Xn`) through the stable test alias. Calendar coverage wording and the restricted planner (v13, JWT enabled) are corrected. Seventy-two focused checks and the production build passed. A live synthetic conversation acknowledged the missing connection and confined its calendar knowledge to recorded activities. The clean Rivera week displayed unknown availability without calendar-clear day labels. Google account choice is open with the registered hosted callback and only Calendar scopes; consent, selection, event visibility and reconnect are still pending. This turn used 27.3468 cents in the conservative provider ledger, with no outstanding holds. Shared production planner v74 is unchanged by this revision.

**Previous UI revision: 2026-10-16.4.** The test address now points to `symphony-rebuild-815d2z75z-scottrings-projects.vercel.app` (`dpl_DFzWDD9UC8q9p6ayuXNm5SYTX1pF`). The week header offers the planning conversation directly on desktop and phone, with a separate quieter “I’m happy with this week” confirmation. Opening chat does not mark the week planned. Confirmation is disabled while a reply, pending draft or uncertain save remains; after Save, the header explicitly names the confirmation step. Forty-five selected week-view tests and the build pass. This is a frontend-only revision. The real-AI browser walkthrough passed: draft with disabled week confirmation → Save → library task on Saturday at 10 → explicit confirmation guidance → Week 42 planned and a Today next step. The Rivera onboarding account was untouched. The calendar-coverage observation is resolved by the .5 revision described below. The broader verification below was performed on 2026-10-16.2, whose broader release checks still apply; .5 only updates the restricted planner.

The candidate is deployed at `https://symphony-rebuild.vercel.app`, immutable build `symphony-rebuild-7sqcskgut-scottrings-projects.vercel.app`, deployment `dpl_4mQrZBv29WR6hELfmC9yBC16giet`. The main `app.symphony-os.com` frontend still points to `dpl_5EMQRRTvKkNztiAQ4JeApd3tcsFE`. **Shared database migrations and backend functions were updated**, including the production planner's funding guard; this is not an isolated backend. All deployed functions retained their previous JWT settings.

The restricted test planner is version 13; Google auth URL/callback are versions 58/49; the shared planner is version 74. Four named synthetic account IDs are allowed by the test planner. It expires October 17 at 06:12:40 America/New_York and is retained through this manual round, then should be deleted. Source and the machine-readable deployment/test evidence are in [candidate release evidence](../../scripts/conversation-bench/reports/candidate-release-20261016.json).

- **Save and Undo:** both hosted browser builds completed real AI draft → explicit Save → visible week item → Undo → removal. Final-build receipts independently read back as `undone`. A lost acknowledgement was tested with direct requests and durable receipts, not a deliberately severed browser network connection. Disposable PostgreSQL checks cover eight concurrent Undo calls, immediate edits, changed new rows, late requests from an old attempt, private dependent records and whole-card conflict refusal. Additional hosted tests exercised routine/goal creation and updates, a later goal edit, and the real task-placement RPC; their fixtures were rolled back.
- **Recovery implementation:** reviewed chat writes retain a durable receipt and before/after images; retries inspect committed outcomes instead of duplicating a card. Database Undo/rollback checks exact persisted state under locks and protects dependent records. An uncertain Undo keeps its retry control. Unattributable direct agent writes no longer offer an unsafe snapshot-derived Undo. A multi-operation Save is still several transactions with guarded recovery, not one atomic transaction. Existing onboarding stable-identity Save recovery remains separate.
- **Data access:** actual synthetic file upload, forged metadata, signed URL and direct download checks passed. The owner retained access; a foreign account could not gain it. Files and fixture metadata were removed.
- **Spending:** monetary liability is reserved before each bounded text call; only the service can settle that reservation. Concurrent admission, replay, failed/missing settlement, cache usage and forged client charges have isolated regression coverage. Audio, image/PDF analysis and hosted web tools fail closed until they have bounded policies; the candidate remains chat-first. This release check used **69.1824 cents** in the synthetic provider ledger across 15 provider attempts, with no outstanding monetary holds. This is conservative ledger accounting, not a reconciled invoice.
- **Onboarding and media:** real AI separates the exact dog-walk time from flexible stretching/bins, preserves the Today/Week visibility choice and applies a subsequent explicit stretch-time correction without dropping the other routines. No records were saved in the clean walkthrough account. All five final-build videos serve playable MP4 byte ranges.
- **Automated verification:** 149 focused tests passed before packaging; the final recovery/UI/proxy suite passed 34 tests and the connection/access suite passed 29 (these scopes overlap and are not a full-repository total). Forty disposable PostgreSQL checks passed across OAuth/storage, monetary admission and save recovery. TypeScript/production build passed. Focused lint had zero errors and 63 warnings, largely existing hook warnings.

## Earlier onboarding evidence and its limits

- **Live activity introduction:** two real-AI turns drafted a personal tray return on October 19, an undated herb-shelf idea and a 2027 painting goal. The time correction changed 3 pm to 4 pm. Refresh restored the conversation and draft. Database reads confirmed no task, goal or routine changes before Save. Save then created exactly two tasks and one goal, with correct privacy and destinations; all pre-existing rows were unchanged. A third turn added separate October and Fall goals; each was saved to the correct period only after approval, without altering the first saves. A conversation-loading race found on that third turn is now guarded and regression-tested. See [activity evidence](../../scripts/conversation-bench/reports/onboarding-activities.json).
- **Routine conversation:** earlier live evidence covers story → correction → reload → Save, weekly recurrence, exact and flexible times, and visibility choices. See [routine evidence](../../scripts/conversation-bench/reports/onboarding-story.json) and [display-choice evidence](../../scripts/conversation-bench/reports/routine-chat-display.json).
- **Automated checks:** onboarding, assistant contracts, proposal parsing, retry identity, parent/assignee validation, progress persistence, video controls and display pairing are covered. All 236 selected tests across 18 files pass; the production build and targeted lint pass. See the [overnight handoff](2026-10-16-overnight-handoff.md) for the exact scope.
- **Live text cost this pass:** approximately 4.122 cents in the provider usage ledger, not a reconciled invoice. The reservation remains conservative. No new voice generation or model comparison was run.
- **Limits of the earlier onboarding pass:** it did not perform real-device installation, a display soak, live interrupted-network/concurrent approvals, deployment, invitation sending or a full authenticated restore. The hosted release verification above supersedes its deployment status. Monthly and alternating-week routine capture remain outside the onboarding conversation's current weekly schema and must be explained rather than silently converted.

## Before inviting the first five households

| Gate | Current disposition | Next concrete action / owner |
| --- | --- | --- |
| One release candidate | Hosted test version 2026-10-16.5, one stable address, restricted planner and recorded backend/migration versions. Shared backend changed; main family frontend did not. | Walk through this exact candidate; do not mix localhost tabs or stale Google links. Keep the test planner through the manual round, then remove it. |
| Data access | R8 attachment ownership correction deployed; real upload, forged metadata, signed-URL and download checks pass using synthetic accounts. | Preserve this evidence; complete the remaining organizer/invitee and display privacy acceptance checks. |
| Save / Undo recovery | R1/R7 reviewed-card fixes deployed with durable receipts, authoritative later-edit checks and recovery. Unsafe direct-write snapshot Undo removed. Browser Save/Undo and hosted task/routine/goal/placement checks pass. | Manual walkthrough confirms clarity. Lost-network evidence is request/helper fault injection, not physical browser network severance; no claim of whole-Save atomicity or universal legacy-path certification. |
| Paid-AI limits | R2 bounded text reservations, service-authoritative settlement, cache accounting and concurrency checks deployed. Existing quota settings preserved. | Keep voice, paid web tools and image/PDF analysis unavailable until separately bounded and tested. Usage estimates remain distinct from provider invoices. |
| Calendar authorization | Google console verification was inspected Oct 16. Correct verified scopes deployed; R3 expiring, one-use user/provider/redirect-bound transactions pass replay, wrong-user and concurrency checks. Hosted return address is registered. | Account holder completes first Google consent, selection, event visibility, reload and reconnect on the hosted candidate. Google consent is not yet a recorded pass. Optional Gmail is outside this walkthrough. |
| Fresh organizer / invitee | Earlier synthetic invitation evidence; updated onboarding regression coverage. | Run the chosen release candidate from a genuinely fresh organizer and signed-out invited adult. Confirm household identity, dates, progress and return after interruption. |
| Devices | Setup paths implemented. No new physical-device certification. | Scott/designate records browser and OS versions and completes personal installation plus the named tablet's sleep/restart/revoke and 48-hour soak if wall support is included. |
| Usability | Scott's chat and routines walkthroughs are useful evidence, not the five-adult gate. | Five representative adults reach first value and recover from one deliberate mistake without coaching. Record failures instead of treating assistance as a pass. |
| Recovery / operations | Logical public-table restore rehearsed; authenticated app/storage continuity and rollback remain incomplete. | Release owner completes the [recovery runbook](../maintenance/beta-recovery-runbook.md), assigns support and confirms emergency AI disable. |
| Invitation decision | Not sent; release sign-off remains with Scott. | After blockers close, invite five households, observe, then decide expansion to ten. Twenty-five is a later rollout decision. |

The [readiness register](beta-readiness.md), [roadmap](2026-10-15-friends-and-family-beta-roadmap.md) and [independent review](2026-10-15-codex-overnight-review.json) hold the underlying evidence. Historical “no known failures” text must not override later review findings.

## iPhone Duo bonus

[Apple's announcement](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/) confirms an outer display and a larger folding inner display. The built study explores three layouts using the existing chat component:

- **Pocket:** switch between a compact conversation and saved activities; preserve the unsent message and pending draft.
- **Open:** conversation beside activities, with an expandable example of the larger goal they might support. Saved activities change only after Save, not continuously while speaking.
- **On a stand:** activities above, conversation and review controls below, suitable for a device propped nearby.

Preview: `http://127.0.0.1:5191/scripts/conversation-bench/panel-preview.html?layout=duo`.

This is a functional layout prototype with sample replies and in-memory Save/Undo, not hardware certification or production fold detection. No browser access to both physical displays, hinge angle, Pencil features or native multitasking APIs is assumed. Keep it outside the first beta's critical path until tested on the actual device.
