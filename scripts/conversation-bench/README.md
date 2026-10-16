# Conversation bench

The catalog is the coverage denominator, not a claim of readiness. `npm run bench:coverage` lists all 39 transactions and 13 shared behaviors from the October 14 register, their existing scenarios, and the missing test layers. `coverage.test.ts` prevents catalog rows from silently disappearing.

## Offline checks

`npm run test:conversation` runs every catalog-linked supporting test file plus scenario contracts, grading regressions, audio transport/parser tests and voice/panel tests without provider calls. It writes `reports/offline-tests.json` and `reports/offline-coverage.json`. Each catalog entry identifies its supporting files; passing these is not full model certification. Contracts replay expected tool calls through real validators and the in-memory applier. They verify plumbing, not model choice. The grading regressions include the previously accepted wrong routine date, a missing change card, incorrect target, absent observations, modified bystanders, and skipped steps.

The panel has a local synthetic preview at `/scripts/conversation-bench/panel-preview.html` when Vite is running. It uses the real conversation component and activity provider, with simulated writes. Start Vite with dummy `VITE_SUPABASE_URL=http://127.0.0.1:59999` and `VITE_SUPABASE_ANON_KEY=synthetic-preview-only`, on port 5183. Run `node scripts/conversation-bench/panel-browser.mjs` (installed Chrome required). It checks voice labels, simulated save/undo, draft retention, phone overflow, and reduced motion, and saves screenshots in `/tmp`. Set `BENCH_PREVIEW_URL` to use another local port. This is UI coverage, not a real-model or persisted-record journey.

## Live text — opt-in, incomplete journeys stay incomplete

`node scripts/conversation-bench/live.mjs <scenario.json> [--seed]` needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BENCH_EMAIL`, and `BENCH_PASSWORD` for a dedicated synthetic household. Never use a real household. Calls may incur provider charges.

The runner checks structured outcomes, tools, required/forbidden card operations (including exact target/date), and persisted records. Seed errors fail; cleanup of successfully seeded IDs runs even after an error. Cleanup does not remove newly created model records: use an isolated disposable household and inspect the report before reuse.

Unsupported fixtures, a household-date mismatch, and wall sessions stop before provider calls. Browser-only approve/retry/undo and fault steps are skipped and block later dependent steps; the journey cannot pass. Exit codes are 0 passed, 1 failed, 2 incomplete. The older general live-text scenarios still need member/calendar fixture adapters. The newer `live-approval.mjs` closes the selected capture/correction/approval/Undo journey through the deployed agent, real UI/applier, scoped REST fixture writers and actual synthetic database readback. It reads test credentials from `BENCH_ENV_DIR`, permits two provider turns, verifies no writes before approval and no changed bystanders, and cleans up only its uniquely named records. The current member aliases are intentionally rejected rather than silently ignored. Reports record the build and findings; old reports are not fresh evidence.

Scenario `expect.card.contains` matches operation fields; `excludes` forbids matching operations. `expect.database` can assert table/where/count/fields or unchanged records. Existing record/routine/goal expectations are translated into observed-row checks. Missing observations fail.

## Audio comparison — measured synthetic cases

`npm run bench:audio` validates `audio-cases.json` and local mono 24 kHz PCM WAV fixtures without contacting a provider. Missing recordings exit 2. `npm run bench:audio:fixtures` generates the included deterministic test inputs locally using macOS voices, an inserted three-second pause, seeded noise and silence. No provider is called for generation. The manifest defines 12 cases spanning capture, correction, names, recurrence, approval, undo, negation, times, pauses, noise and silence. The 12 recordings and their hashes are in `audio-fixtures`. All are synthetic; they do not replace device or human-speaker evidence. `audio-diagnostics.json` and `audio-repeatability.json` isolate the clean voice control and near-field noise reduction.

Only an explicit `node scripts/conversation-bench/audio.mjs scripts/conversation-bench/audio-cases.json --live` uses `OPENAI_API_KEY`. It requires every recording to pass preflight and enforces the manifest's total audio-duration cap. It compares `gpt-4o-mini-transcribe` and `gpt-realtime-whisper` on identical paced audio, measuring transcript errors, required terms, hallucinated speech on silence, first text and post-commit latency. This measures transcription, not native speech understanding, tool selection, turn-taking or successful saves. Saved live results are in `reports/audio-comparison.json` and timestamped reports. Equivalent numeric/time rendering is normalized, but names, negation and wrong times still fail. No overall model winner is asserted and the app's model configuration is unchanged.

## Browser transaction journeys

`npm run bench:transactions` exercises 15 journeys through real validators, the activity provider, the approval UI and the real applier, with synthetic record writers. It checks that staging/correcting/reloading a card makes no writes, approval produces the expected records, Undo restores bystanders, recurring rules survive occurrence edits, stale sets refuse, and incomplete rollback reports partial. `reports/browser-transactions.json` records each result. The preview uses the same Vite setup described above.

Spoken approval now checks the in-flight guard before saving and preserves partial outcomes. Spoken Undo reaches the existing Undo action without creating a new assistant turn. Text-only completion and reversed audio-stop/completion ordering both reopen the microphone. These changes have offline regression coverage; they are not deployed.

## Remaining beta gates

Extend actual model/persistence journeys beyond the tested capture/correction set: a catalog entry with supporting tests is still not a certified end-to-end voice transaction. General member/calendar fixtures remain open. Refused-start accounting now has an idempotent settlement migration and disposable PostgreSQL proof; neither migration nor edge changes are deployed. `native-audio.ts` now replays capture, partial approval and Undo through the production voice instructions/tools with synthetic tool results; The new `voice-database.ts` joins recorded capture, correction, spoken approval and spoken Undo to actual synthetic database readback using the production voice action handler. Transcription replay has measured name-spelling and noise failures; the comparison is complete but those quality gates are not passed. Device/microphone checks remain necessary, but should follow these repeatable checks instead of substituting for them.

Latest executed evidence: `docs/planning/2026-10-15-automated-voice-evidence.md`.


## Continuous recorded voice to database

With the local Vite fixture running, use Node 22:

```
BENCH_ENV_DIR=/path/to/existing/synthetic/config node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/conversation-bench/voice-database.ts
```

`BENCH_REAL_WEBRTC=1` uses Chrome, the real `RealtimeTransport`, the real local `handleWorkspaceVoice`, server VAD, explicit Done submission, and automatic return to listening. Silence never submits a beta message. The physical mic is replaced with a Web Audio stream containing recordings and continuous silent frames. Authentication/admission for the local SDP handler are fixtures; the deployed planning service and scoped database writes are real. The database adapter wraps the real application applier rather than mounting the entire production Shell. `BENCH_INTERRUPT=1` with `BENCH_REAL_WEBRTC=1` runs capture followed by End during the spoken reply, asserting released tracks, no late events and no saved records. The default mode uses a persistent native WebSocket with explicit turn boundaries. Reports distinguish both modes. No capture/correction is allowed to persist records; spoken approval must persist exactly four correct tasks; spoken Undo must restore the baseline without touching bystanders. Cleanup uses only IDs allocated by this browser run. Only two planning turns are allowed. Model replies and database observations are both checked. Failed runs remain in the reports.

The runner reads the spend report and reserves a conservative amount for each run. This is a single-operator benchmark, not a concurrent billing system. Reservations and token-based estimates are not provider invoices; do not reset the ledger to bypass the user's cap.

`audio-context.json` records the earlier names/recurrence/noise/silence experiment with vocabulary hints. The beta now omits vocabulary hints after a literal hint leaked into a transcript. Whisper rejects the prompt field; `audio-whisper-context.json` records its supported English-only configuration. These are compatibility and diagnostic evidence, not a request to change models. Production models remain unchanged.

## Pilot start accounting

Run `node scripts/conversation-bench/test-voice-quota.mjs` with local PostgreSQL 17 installed (or set `PG_BIN`). It creates and removes its own local cluster. It verifies the unchanged 12-start limit, duplicate reservations, idempotent refunds, user isolation, service-only settlement, midnight rollover and reusing a refunded slot. Apply migration `20261015143000_workspace_voice_start_settlement.sql` before deploying the corresponding edge function. Failed settlement conservatively retains the charge and logs an accounting failure; it does not disconnect a successful call. Process death before settlement is not automatically refunded.


## Shared conversation regressions (October 15, after manual findings)

The workspace now uses `RealtimeTransport.handleTurn` to send finalized speech to the same assistant as typed messages. Read-aloud responses use explicit input, `conversation: "none"`, and no tools; they cannot initiate planner actions. See [OpenAI's conversation controls](https://developers.openai.com/api/docs/guides/realtime-conversations). Native `handleTool` replay remains a historical test path and is not evidence for the current workspace controller.

`test:conversation` also includes `useSymphonyAssistant`, shared action receipts, transcript finalization, and the preview proxy headers. Tests verify that approval/Undo are persisted, Undo survives read-only questions, failed saves retain history, partial transcripts never act, and End suppresses late audio replies. The actual planner request-boundary tests suppress intermediate narration and check the revised clarification policy; generated model behavior still requires the isolated live gate described in the evidence document.

Start the transaction fixture with `vite --mode production --host 127.0.0.1 --port 5183 --strictPort` so its existing public Supabase configuration is available. A startup failure must not be presented as an audio-model failure. The current full-audio report is a failure against the older deployed planner, not a green end-to-end result for the new candidate.


## Beta planner follow-through gate

Run `BENCH_ENV_DIR=/path/to/existing/synthetic/config node scripts/conversation-bench/planner-dialogue.mjs` to replay the shower/bicycle/bench conversation against the temporary `symphony-conversation-bench` endpoint. It reserves $0.25 before provider work, reads only the synthetic account's task rows, checks exact final dates/time and no database changes, and saves a report. Dialogue specifications live in `dialogues/`; transaction-store specifications with `start`/`steps` live in `scenarios/`.

The planner holds final prose until it checks proposal evidence. Unsupported card receipts get one repair attempt within the same request. During repair, only reads and proposal creation are available, with a server-side dispatch check too. A rejected card is not evidence, and a second unsupported receipt becomes an explicit failure. Confirmed desktop/phone proposals use the visible draft status and a natural reply; spoken wall proposals retain an audible approval reminder. This is a targeted safeguard for unsupported card claims, not a universal natural-language verifier.

`proposalEvidence.test.ts` and the actual handler tests in `experience.test.ts` cover repair success/failure, rejected cards, no leaked transient claims, no direct writes during repair, and ordinary questions without extra provider calls. The recorded-audio gate still requires the actual card, exact approved rows, bystander preservation, and Undo restoration; matching spoken words alone never passes it.


The explicit-send full journey uses `approve-changes.wav` (“Approve these changes”) for approval and `undo.wav` (“Undo that”). `approve.wav` remains the original one-word stress case: one live run transcribed it as “McGrew” and correctly did not save. Do not treat that failed input as approval or erase the failed report. The shared parser accepts clear approval phrases only; the button remains an alternative.

Latest verified gate (Oct 15): `planner-dialogue-1792080036673.json` and `voice-database-webrtc-1792080631951.json`; see the evidence document for scope, failed-run history, retained endpoint/allowance cleanup and remaining manual-session budget.

## Beta chat UI follow-up (2026-10-15)

Scott approved pausing Talk and implementing the chat walkthrough. The existing Week view remains unchanged. The workspace uses a full-height chat panel with one text composer, a draft marked Not saved, explicit Save, Make a change, Discard draft, and a scoped Undo after the writer confirms success. Corrections disable the old card while the assistant is busy. A new answer preserves access to the previous save's Undo. No models or live services changed in this pass.

Validation: 617 offline checks, all 15 browser transaction scenarios, typecheck and production build passed. `reports/chat-ui.json` additionally records the actual chat component/provider/applier journey: correction before save, exact Undo, preserved unsent message, and phone controls at 390/320 px. Screenshots were visually inspected. Replies and records in this UI journey are synthetic; this does not claim a fresh live-model pass or reduced latency. No paid model calls were made.

Open `/scripts/conversation-bench/panel-preview.html` on the local Vite server for the UI preview. It labels sample replies and in-memory persistence explicitly. Run `node scripts/conversation-bench/panel-browser.mjs` against that server for the automated chat UI journey. The separate `transactions-browser.mjs` runner covers the 15 save/rollback/stale/Undo transaction scenarios through the new Save control. Voice-only live fixtures retain the legacy approval control for historical replay.


## Chat manual round and follow-up polish (2026-10-15)

The real-AI round passed capture → correction → Save → Undo. Database readback verified Shower on Thursday at 3 p.m. New York, bicycle Friday all-day, and white bench undated; Undo removed all three and preserved the two original tasks. See `reports/chat-ui-walkthrough.json`. The user's Thursday correction referred to the shower, which was correctly dated.

The walkthrough exposed pending rows appearing on Week, Approve/Save vocabulary mismatch, and the floating + covering the composer. Drafts now stay in chat until saved; the existing Week layout is retained. Desktop/phone planner instructions use Save and no longer force a repeated review preamble; the wall retains its spoken approval receipt. The floating + stays beside the open side panel.

Validation: 812 offline tests passed, 3 preexisting skips, no failures; all 15 browser transaction scenarios and the responsive chat journey passed, as did typecheck, production build and whitespace checks. New coverage verifies pending additions/moves leave the saved week alone, persisted timed rows render immediately, and the production applier publishes all three item types to another mounted task reader without realtime before Undo restores it. The test database now gives distinct IDs to rapid inserts, matching the real database.

The brief display delay observed after Save was not reproduced or measured; do not claim a latency fix. Planner response speed is unchanged. No additional paid calls were made for this polish, and revised planner wording was checked with provider doubles, not a fresh live deployment.
