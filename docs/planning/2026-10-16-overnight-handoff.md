# October 16: onboarding and beta guide handoff

**Superseded for current deployment:** the later October 16 release pass deployed test version **2026-10-16.2** at [the hosted onboarding](https://symphony-rebuild.vercel.app/getting-started). Use the [current guide](2026-10-16-beta-readiness-guide.md) for the exact backend versions, fixes, evidence, clean Rivera account and remaining gates. The localhost addresses, endpoint expiry and “not deployed” statements below describe the earlier overnight pass only.

The conversational onboarding and platform setup guide are ready for the next review. The app is **not yet cleared for beta invitations**. The [current readiness guide](2026-10-16-beta-readiness-guide.md) brings the new-user path, everyday guidance, installation, shared tablets and remaining release gates together.

## Ready to use

- **Onboarding:** http://127.0.0.1:5191/getting-started — Scott's synthetic manual account is still at the first-activities conversation. No messages or activities were submitted in that account during this unattended pass.
- **Duo study:** http://127.0.0.1:5191/scripts/conversation-bench/panel-preview.html?layout=duo — Pocket, Open and On a stand layouts using production chat controls, sample replies and temporary Save/Undo. Use “Try this layout” for the sample. This does not change the existing Week view.
- **Everyday help:** Getting started → Ready to begin → When life changes; also available from Help. Device guidance is available from Getting started and Help.

The manual preview server remains running. The temporary planner endpoint requires a valid JWT, allows only the three existing synthetic accounts, and expires **October 16 at 12:24 pm America/New_York (16:24 UTC)**. If the walkthrough happens after that, refresh the restricted test endpoint before testing. The production agent was not deployed by this pass.

## Implemented

First activities now use a conversation, like routines. A single story can include an undated idea, a dated activity and a goal. Corrections retain the whole draft, including placement, audience, notes and existing goal links. The AI cannot write through the onboarding conversation; Save is explicit.

The activity saver validates the complete draft before starting, uses stable identities on retry, reads back confirmed rows, and keeps a recovery copy before writing. If a save is uncertain, changing or discarding that draft is disabled until the same save is checked. An unrelated edit made after an earlier save is not overwritten by retry. This is not a database-wide atomic transaction or a fix for every legacy save path.

A real walkthrough exposed a race when returning to the activity step: a new message could be submitted before conversation history loaded. Both onboarding composers now wait for restoration and offer a clear retry if history cannot be read. That does not affect already saved activities.

The five named milestones include optional devices. Personal installation instructions cover iPhone/iPad, Android and computers; shared-tablet guidance uses the existing restricted pairing flow. Code expiry, failed device-list reads and failed pairing/revocation requests are visible. Reviewing instructions is never described as a successful installation. Symphony's existing icon now matches the manifest and Home Screen declarations.

Completion distinguishes what is in place from what was deferred and opens the actual saved date or period. Six examples explain new weeks, changes, ad hoc capture, routines, goal relationships and recovery.

## Evidence from this pass

| Check | Result |
| --- | --- |
| Selected regression suite | **236 passed, 18 files**: setup components, onboarding writes/progress, assistant turns/history, change-card contract, display pairing, onboarding server schemas and proposal evidence. |
| Production build | Passed. Existing large-bundle advisory remains; this is not a performance benchmark. |
| Targeted lint | Passed with no source warnings or errors. Tooling reports its browser-baseline dataset is old. |
| Endpoint type check | Deno check passed. |
| Endpoint access | Allowed synthetic account accepted; missing JWT rejected; another account rejected. See [access report](../../scripts/conversation-bench/reports/candidate-access.json). |
| Live first intentions | Story → correction → reload → Save. Two tasks and one 2027 goal saved with correct privacy/dates; nothing written before Save and prior records unchanged. |
| Live additional horizons | Separate October and Fall goals saved to their actual month/season fields, only after approval. First saves and all older tasks/goals/routines unchanged. |
| Completion destination | “Open Monday, Oct 19” opened Today for October 19; the later goal journey offered October 2026. |
| Conversation recovery | First draft and history restored after refresh; saved third-turn conversation restored after the history guard was added. The guard's failure/retry behavior also has regression coverage. |
| Device UI | Apple, Android, computer and shared-display guidance inspected; paired-device refresh showed the synthetic account's empty list; devices deferred and appeared under For later. No new pairing credentials were created. |
| Duo | Draft/messages survived posture changes; Save added the three temporary records; Undo returned to the original record. The final demonstration retains a saved sample for review. |
| Incremental text usage | **4.122 cents** in the scoped provider ledger; $0.05 retained as a conservative reservation. Not a reconciled invoice. No new audio calls. |

Detailed live results: [onboarding activities](../../scripts/conversation-bench/reports/onboarding-activities.json). Earlier routine and horizon-video evidence remains linked from the readiness guide. Fault injection covers interrupted saves; this live pass did not disconnect the network or simulate simultaneous devices.

## Next review and release boundary

In the manual onboarding preview, describe a synthetic task, an undated idea and a goal. Correct a detail, check the destinations, save, review devices and finish. This review is for clarity and confidence; the automated account has already exercised the data path.

Before invitations, reconcile the attachment-access, general Save/Undo recovery, paid-AI admission and calendar-auth findings against one release candidate. Then complete fresh organizer/invitee checks, physical installation/shared-tablet checks, the five-adult usability gate and the remaining recovery rehearsal. The guide names each gate and its next action; none is marked complete merely because onboarding passed.

Work is saved in `/Users/scottkaufman/.codex/worktrees/voice-transaction-bench/symphonyOS`, branch `codex/voice-transaction-bench`, with the earlier uncommitted work preserved. No commit, merge, production release, invitation or real family-data mutation was made in this pass.
