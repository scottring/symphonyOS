## Manual core flow passed — October 15

Scott completed the requested Chrome physical-microphone exercise and reported: “It worked. It's a little slow and the interface is clunky but it worked.” Record this as user-confirmed success of the requested capture → correction → approval → Undo round, with usability work outstanding. Individual manual timings were not captured, and this is not certification of the whole transaction catalog or beta. See `reports/manual-round-2026-10-15.json`.

The prior recorded-audio test measured Done-to-first-response-output at 15.106 s for capture, 12.379 s for correction, 3.023 s for approval, and 3.331 s for Undo. Those are automated timings, not Scott’s manual measurements. The shared voice hook logs aggregate timing; the planner logs provider/tool timing separately. The next focused pass should correlate the stages, reduce planning delay, and simplify controls/status while preserving explicit submission, validated review, approval, and Undo. Keep live visual changes deferred.

Cleanup completed after the manual confirmation: temporary `symphony-conversation-bench` endpoint deleted, synthetic daily allowance restored from 400 to 300 cents and read back successfully. The family endpoint remains unchanged. Candidate changes remain in the worktree. No further manual session is prepared. Estimates plus conservative reservations now total $13.996968 against the bounded $14 ceiling; this is not an invoice. Historical checkpoints below retain the state at their recorded time and are superseded by this entry.

## Planner follow-through verified — Oct 15, 12:11 EDT

The reported missing-card failure is fixed and the simplified beta automated gate passed. Final planner prose is held until evidence checking; an unsupported card claim gets one repair attempt inside the request. Repair is restricted to read and proposal tools in both the advertised tools and server dispatch. A rejected proposal is not accepted as evidence. Repeated failure reports honestly instead of emitting the unsupported receipt. Confirmed proposal replies receive an explicit review/approval acknowledgment, so a natural follow-up question cannot omit the result. This targeted claim backstop does not verify every possible natural-language statement.

Validation: 600 offline checks, 15 browser transaction journeys, TypeScript and production build passed. Actual handler tests exercise missing-card repair, rejected cards, no leaked prose, bounded failure and forbidden direct writes. The four-turn shower/bicycle/bench conversation passed against the restricted live planner (`planner-dialogue-1792080036673.json`), preserving 16:00 and tomorrow with no database writes. The final recorded-audio journey (`voice-database-webrtc-1792080631951.json`) passed silence, capture, correction, **Approve these changes**, exact four-row database readback, Undo restoring the entire baseline, and End releasing media. Exactly two planner turns; local approval/Undo did not invoke the model. No cleanup rows remained and bystanders were unchanged.

A one-word synthetic **Approve** was heard as **McGrew** in the preceding run (`voice-database-webrtc-1792080389373.json`); the test stopped without saving. That evidence and original recording are retained. The shared action parser now accepts the clear full sentence **Approve these changes**, without fuzzy approval matching; negatives/questions/unrelated names remain rejected. The on-screen approval button remains available. Recorded-source evidence does not certify a physical microphone, room noise, or every conversational case.

The production family endpoint is unchanged; all live verification used the user-approved synthetic-only endpoint. The temporary endpoint and 400-cent synthetic allowance (original 300) remain through the authorized manual workflow, then must be deleted/restored. Before another manual session, recheck its expiry and the test budget: current estimate plus conservative reserves is **$11.496968** against **$11.50**, not a provider invoice. The automated gate is clear, but the next manual audio reservation is not funded under that self-imposed ceiling yet.

## Latest verification gap — Oct 15, 11:50 EDT

The explicit-send recorded-audio run `voice-database-webrtc-1792079351571.json` correctly transcribed the full capture and waited for Done. The actual planner then claimed “All four items go on the card” but emitted no change_set and an answered outcome. The strict test rejected this before approval. No database mutations; cleanup empty. This is a planner follow-through defect, not a microphone or submission failure. Full revised audio-to-database verification has NOT passed; another manual round is not yet ready. Estimate and conservative reserves now $10.346968, self-imposed ceiling $10.50. No further paid runs started.

## Simplified beta baseline — Oct 15, 11:50 EDT

User authorized deferring live visual changes. Workspace voice now requires Done to submit; pauses never submit a message. Removed household vocabulary from speech transcription after the literal hint appeared in the manual transcript. Conversation text and the final proposed card are published at turn completion; failed turns do not publish buffered cards and live page pointing is disabled in this conversation hook. Approval and Undo remain shared between typed and spoken turns.

Fixed empty successful proposal replies being described as failures; preserved exact pending time as well as task/date; added validation against unchanged date/time moves. Live restricted synthetic dialogue `candidate-dialogue-1792079160662.json` passes shower today 16:00, bike tomorrow, white bench undated, no unchanged gate-latch move, and no database writes before approval. The third turn asked about dates without producing a new card; the final clarification produced the complete three-item card. No claim of exhaustive conversational reliability.

579 offline checks and 15 browser transaction journeys passed; typecheck and production build passed. New checks cover explicit send after silence, withholding cards while running/on failure, suppressed pointing, no vocabulary injection, empty proposal replies and unchanged moves. Revised explicit-send microphone path still requires live audio verification before another user round. Prior audio evidence covers the older flow only. Estimate/reserves $9.596968 against $10 ceiling; no new microphone session started. Temporary test endpoint retained and allowance remains 400 (original 300), to be removed/restored after the approved manual workflow ends.

## Manual round interruption — 11:30 EDT

User reported voice disappearing after speaking the second turn. Chrome retained the first exchange with voice inactive and no error. The manual proxy hardcoded a 60-second session and the hook discarded the time-limit reason: a confirmed defect consistent with the report, though that session had no end-reason telemetry to prove the precise cause. The restricted endpoint had not expired.

Fixed: show an explicit timeout explanation, preserve last heard words (marked potentially incomplete), and allow five-minute manual sessions. Added second-turn expiry and recovery regressions; 77 targeted checks passed. No partial utterance is automatically submitted after expiry. Manual confirmation still outstanding. No model change or family endpoint change.

One next manual session reserves $2.50 under a $10 self-imposed ceiling per the user's necessary-overrun authorization. Current estimate plus prior reserves is $6.846968, not an invoice. Temporary endpoint and synthetic allowance remain in place through this manual round, then must be removed/restored.

# Automated conversation and voice evidence — October 15, 2026

Candidate: `codex/voice-transaction-bench`, based on `a23b63dc`, with local uncommitted changes. Not deployed. Real family records were not used. Manual sessions remain on hold: this is progress toward the gates, not full beta certification.

## Live verification completed — manual round ready

- Candidate `symphony-conversation-bench` is deployed with platform JWT verification enabled, an exact synthetic-account gate, and an automatic one-hour expiry. Access checks returned 200 for the permitted synthetic account, 401 without a JWT, and 403 for the other synthetic account (`candidate-access.json`). The live family endpoint was not changed.
- `voice-database-webrtc-1792076923549.json`: full recorded WebRTC capture → correction → approve → Undo passed with actual synthetic database readback, silence handling, End/media release, and baseline restoration.
- `candidate-dialogue-1792077351261.json`: plan week → weekend ambiguity → Saturday → mom/dinner passed. It reused the existing library task, preserved Saturday while adding mom, performed no contact lookup, and wrote nothing before approval.
- Earlier dialogue failures were retained. They exposed duplicate-task proposals from an incomplete week view and date drift between turns. Candidate rules now search the broader task inventory when needed; the shared pending-card context carries exact task IDs and ISO dates rather than only display wording.
- Final offline suite: **571/571 passed**. Browser transactions: **15/15 passed**. Type checks passed. Final production build passed.
- Ledger after scoped reservation reconciliation: **$6.096968 including conservative reserves**, not final billing. Self-imposed ceiling remains $7 under the user's authorization for a small necessary overrun.
- The user explicitly approved keeping the restricted endpoint through the manual round, then deleting it. The local Chrome preview at `http://127.0.0.1:5190/week?view=alongside` now routes planning requests to this candidate. It is signed into the synthetic household and its conversation panel is open; microphone was not started.
- Synthetic household daily allowance is temporarily 400 cents for that manual round, originally 300. Restoration is recorded at `/tmp/symphony-manual-allowance.json`; `/tmp/cleanup-symphony-manual.mjs` restores it and deletes the temporary function after the round. No global allowances were changed.

The sections below retain the chronological evidence and earlier limitations; the pending live gate described there is now satisfied for these selected journeys, not for every possible conversation or the entire beta.

## Current shared-conversation candidate — after the manual findings

The workspace voice path now submits finalized transcription directly to `useSymphonyAssistant.sendTurn`, the same owner used by typing. Realtime renders that owner's finished reply in an isolated response with no tools or prior voice conversation input. The existing models remain unchanged. The old exported voice-tool adapter is retained for historical runners; it is no longer the workspace's conversation owner.

- **570/570 offline checks passed**, including shared history, persisted approval/Undo, real canvas Undo lifecycle, read-only follow-ups, incomplete/late speech, End during a pending response, save failure/retry, and proxy content negotiation.
- **15/15 browser transaction journeys passed** against synthetic persistence. Type checks and production build passed; existing chunk-size warnings remain.
- **Actual local preview persistence passed:** inserted one synthetic conversation through the proxy, received a single-row object, updated and read back both messages, then deleted only that test row. The proxy previously dropped `Accept`, explaining why `.single()` could appear to fail even after an insert.
- Planner candidate instructions now preserve relational language such as "my mom" during capture, defer contact resolution until required, keep additions within a planning card, and leave dates unset until chosen. The server no longer publishes text accompanying intermediate tool calls as part of the final answer. These are request-boundary regressions, **not yet generated-model quality certification**.
- `voice-database-webrtc-1792068573627.json` proves final speech reached the deployed planner unchanged and the audio model read its reply verbatim. It also records a **failure**, not a completed journey: the older deployed planner repeated a question, omitted clear pending-card language, and proposed an unchosen date. This exposed the intermediate-text defect corrected in the local candidate.
- `voice-database-webrtc-1792068109693.json` records the synthetic household's exhausted daily allowance. The next bounded run temporarily raised only that household's daily cents from 300 to 350 and restored 300 in `finally`. No global limits changed.
- `voice-database-webrtc-1792067860596.json` failed before a provider call because the test page lacked environment configuration. Its unused reservation was released with an audit note.
- The ledger is **$5.696968 including conservative reservations**, not a reconciled invoice. After the user's authorization for a small necessary overrun, the runner has a self-imposed $6 ceiling; the original requested $5 remains recorded.

**Outstanding live gate:** run the changed planner through the reported library-books/weekend/mom dialogue and repeat the full capture/correction/approval/Undo audio journey. A proposed isolated, expiring, synthetic-only Supabase endpoint was rejected by automatic approval review because deployment requires explicit user authorization. No candidate endpoint was deployed. Approval has been requested for a temporary endpoint with JWT verification enabled; the live family endpoint stays unchanged. Do not count historical native-tool voice results below as certification of this new path, and do not request another manual round until the live gate is addressed.

## Earlier baseline (before the shared-conversation change)

| Layer | Result | What it establishes |
|---|---|---|
| Catalog-linked offline suites | 537 / 537 pass | Supporting component, contract, authorization, cost-control, transport and UI checks mapped to all 39 transactions and 13 shared behaviors. This does not certify all 52 as real-model journeys. |
| Browser transactions | 15 / 15 pass | Real validators, activity provider, card UI and applier with synthetic persistence. Capture, correction, moves, completion, setting aside, assignment, routines, occurrence moves/reassignment, stale refusal, rollback and partial rollback; pending cards survive reload. |
| Deployed agent + synthetic database | Pass | Two actual model turns proposed and corrected the same card. Browser approval persisted exactly two tasks on the correct date; existing records were unchanged. Undo restored the original database state. UI persistence uses scoped REST fixture writers around the real applier. |
| Native voice-model replay | 3 / 3 pass | Recorded capture, approval with a partial-result fixture, and Undo selected the expected tools and conveyed their outcomes. Production voice instructions/tools were used with synthetic tool responses, not database mutations. |
| Continuous Chrome voice → database | Pass | Production WebRTC transport and local voice handler, real server VAD, four recorded turns, shared voice action handler, deployed planner, actual synthetic records and Undo. Silent input makes no captions or transaction; End releases tracks. Authentication/admission and physical mic are fixtures. |
| Build | Pass | Application TypeScript and production build; existing chunk-size warnings remain. |

Evidence is in `scripts/conversation-bench/reports/`: `offline-coverage.json`, `offline-tests.json`, `browser-transactions.json`, successful `live-approval-1792061119721.json`, and `native-audio.json`. The earlier live-approval report records a request-format failure before model execution; it is retained, not counted as a pass.

## Audio comparison

The matched comparison used identical paced 24 kHz PCM recordings, manual commit and near-field noise reduction for both models (the app already enables that reduction). All recordings are synthetic. Numbers/times are compared semantically; the two approval forms already accepted by the app are equivalent. Names, negation and changed meaning remain strict failures.

| Matched 12-clip run | Current `gpt-4o-mini-transcribe` | `gpt-realtime-whisper` |
|---|---:|---:|
| Passed | 10 / 12 | 10 / 12 |
| Median first transcript delta, from audio start | 2.95 s | 1.10 s |
| Median completion after commit | 0.53 s | 0.56 s |
| Failures | Kaleb spelling; noisy grocery request | Kaleb spelling; piano heard as “the animal” |

First-delta timing includes the clip's speaking duration; it is not end-to-end assistant reply latency. The name test supplies no roster hint: the homophone spelling failure is not proof of an incorrect household assignment. It does identify a caption/context requirement that still needs a faithful production-context test.

Additional acoustic controls, four runs each: the current model passed 4/4 clean and 1/4 noisy-with-reduction; Whisper passed 2/4 clean and 4/4 noisy-with-reduction. These tiny synthetic samples do not establish population reliability. No overall winner is declared and no model configuration was changed. `audio-comparison.json` is the matched, semantically graded result; timestamped reports retain every raw response, including the initial exploratory no-reduction run and diagnostic repeats.

## Defects fixed after automated reproduction

- A partial save followed by failed rollback no longer produces a receipt claiming nothing changed. The spoken result also remains partial.
- The same partially saved card cannot be blindly approved again. It requires an updated proposal; re-announcing the same card preserves that protection.
- Spoken Undo uses the real current Undo action without starting a new assistant turn and losing its reference. Unconfirmed Undo is not described as successful.
- Approval checks for an in-flight write before attempting a save; negated approval is not intercepted as authorization.
- A text-only response, or audio stopping before response completion, returns the microphone to listening.
- The audio grader accepts equivalent numeric times and the app's explicit approval aliases without accepting negated approval.
- Desktop live-bench requests omit the unsupported `surface: desktop` field; the endpoint uses absence for desktop.

## Budget and credentials

The synthetic agent ledger recorded 2.4309 cents for five provider calls across the two successful turns. Standalone transcription replays submitted approximately 167 seconds total, including probes and reruns. Native voice token usage is retained. At the initial checkpoint, combined estimated cost was approximately $0.16 against the authorized $5 cap; this is not a reconciled invoice. The estimate uses [official transcription pricing](https://developers.openai.com/api/docs/pricing) and [Realtime 2.1 rates](https://developers.openai.com/api/docs/models/gpt-realtime-2.1), with uncached native input rates conservatively. See `reports/spend.json`.

The OpenAI key is in a Git-ignored, owner-only `.env.local`. Reports contain no credentials.

## Still required before asking for another manual session

1. Expand real-model and persisted-record journeys beyond the tested capture/correction/approve/undo set. Supporting tests for a catalog entry are not equivalent to a full conversational journey; general member/calendar fixture adapters remain incomplete.
2. Resolve the observed transcription quality failures in production context, especially household spelling and changed task meaning; replay the failing clips after any adjustment. Do not replace the model solely for faster first text.
3. The continuous WebSocket speech-to-database journey now passes (four recorded turns, production action handler, actual proposal/correction, persisted approval and Undo). Chrome/WebRTC testing additionally exercises VAD and automatic turn return; see the follow-up evidence below for its current status.
4. Refused-start accounting is fixed in the candidate and verified against disposable PostgreSQL, but is not deployed. Continue full-service interruption/cancellation verification. Transport terminal-state regressions are covered, but End cannot promise to reverse an already committed write.

No new testing with Scott is requested to address these automation and correctness gaps.


## Follow-up automation pass

- `voice-database-1792064669869.json`: continuous native audio capture → correction → spoken approval → persisted database readback → spoken Undo passed. The app's actual voice tool handler is shared by the test, so approval/Undo are not substituted by test clicks. The existing synthetic account's database returned exactly to its baseline.
- Browser/WebRTC replays exposed a fixture problem: an inactive Web Audio graph stopped emitting silent frames after recorded speech, so server VAD never saw speech end. A continuous zero-valued source now models an open microphone correctly. The earlier timeouts remain as failures, not product defects or passes.
- The real browser path then exposed an actual intent handoff defect: voice rewrote the capture request as “Plan the week with these items,” causing a planning question instead of a capture card. The voice instruction/tool description now explicitly preserves the person's wording and request type, while leaving planning reasoning to the planning agent. Reports retain the exact failed forwarded request and downstream reply.
- Current transcription with household vocabulary correctly spelled Kaleb in both diagnostic repeats. Forced silent commits echoed the vocabulary; noisy grocery transcription still failed. Whisper rejected `session.audio.input.transcription.prompt`; its English-only rerun passed the recurrence, noise and silence cases twice, and still spelled Caleb twice. This is diagnosis of the existing architecture, not a model-switch proposal. No production model changed.
- Workspace captions now require a matching server speech-start item. Silent and stale items do not appear as the person's words. Pressing Done in silence keeps the mic listening and sends no response request. This protects the UI from non-speech items; it does not prove all noisy VAD false positives impossible.
- Refused/failed handshakes now release their pilot reservation exactly once through service-only settlement; accepted calls remain counted. The local PostgreSQL proof includes authorization, 12-start cap, duplicate IDs, midnight and replacement-slot checks. Monthly AI-allowance refusals have a handler regression. The migration and edge function are not deployed; deployment order is documented in the bench README.

The current cost report uses conservative reservations for bounded browser runs in addition to earlier token/duration estimates. It is not an invoice. Exact run evidence and remaining reservations are in `reports/spend.json`; no additional budget has been requested.


Chrome verification after the request-intent fix: `voice-database-webrtc-1792065573035.json` passed all four turns plus silence and End/resource release. Corrected Friday date and unchanged bystanders were verified before voice received the save result. Undo restored the database; cleanup had no leftover records. The eight native responses retain token usage. This tests End after a completed reply, not a claim of full live cancellation during an in-flight database write.

Successful continuous voice usage estimates are $0.169208 (WebSocket) and $0.175460 (Chrome), using reported tokens at conservative uncached rates. Total accounted cost including deliberately conservative reservations for unsuccessful diagnostics and planning calls is about **$2.70 / $5**. This is not $2.70 of confirmed billed spend. Live model choices remain unchanged.

Remaining gates are narrower but still open: general real-model/member/calendar fixture journeys, noisy audio and VAD false positives, and cancellation during an in-flight action. Live interruption during speech is now verified below. The selected core capture/correction/approve/Undo journey is now connected and passing; this is not certification of every catalog transaction. Manual testing remains on hold.


Final interruption check: `voice-database-webrtc-1792065770355.json` passed End during the actual spoken response to a proposal. The microphone tracks ended, no late speech/status events appeared during observation, no proposal was persisted, and database readback remained identical. A separate regression now rejects queued events from stopped/replaced data channels. Final offline result: **537/537**, browser transaction journeys **15/15**, production build passed. Full-service cancellation during an already-running write remains a different guarantee and is not asserted.

After reserving the interruption run, current conservative cost accounting is **$3.45 of $5**, including unspent diagnostic reserves; confirmed invoice cost is not available. No models were changed, and no code, migration or infrastructure was deployed. Broader live transaction coverage and noisy-audio gates still prevent calling the whole beta ready or asking Scott to resume manual testing.
