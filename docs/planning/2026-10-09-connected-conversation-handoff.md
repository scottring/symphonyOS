# Connected workspace and conversation — October 9

Branch: `codex/conversation-first`, worktree `.worktrees/conversation-first`.

## Release state

Backend activated on `mwadppyrqzuzgstmwpuy`: updated `symphony-agent`, new `workspace-voice`, and verified migration `20261009163000_workspace_voice_pilot_usage`. The server-side key was already configured and was neither read nor copied. Voice is restricted server-side to the disposable onboarding account. Frontend release verification is recorded below when complete.

## Implemented

Connected Today, Week, Year/Season/Month and the accepted wall presentation use existing tasks, details, permissions, scheduling, recipes, routines and planning links. Routes remain explicit: `/today?view=alongside`, `/week?view=alongside`, `/year?view=constellation&horizon=0`, `/wall-v2?view=workspace`. Ordinary routes retain their established presentation; no account data migration or reset is involved. Connected navigation keeps the workspace across horizons and supporting pages.

Week now uses tighter masthead, day rows, journal groups, entry fields and calendar notice. Priority headings span their action list, preventing narrow nested columns. The first populated group measured 404px before and 231px after (43% less height); empty day rows approximately 95px to 42px. Phone controls retain touch targets. Details, keyboard/Enter entry, visible Add buttons, linking and independent desktop scrolling remain. Desktop and phone evidence: `living-canvas-evidence/week-compact-{desktop,phone}.png`.

One shell-owned voice connection supports desktop and phone, alongside typing and details. Talk/mute/end controls remain accessible when details open. Closing conversation, changing account or changing visible life areas stops voice. Start is always explicit. Pilot access is discovered with an authenticated read-only request; it does not open a microphone or consume quota. Late connections cannot resurrect a stopped session, tool events are deduplicated, and save results are awaited.

Typed and spoken requests share the authenticated Symphony agent. Bounded screen context includes visible items, selected task, periods and intentions; it is not permission. RLS remains authoritative. New tools create and read planning items, edit intentions, and link already-existing month/week items without recreating them. Weekly creation uses the household week start. Human-authored content, all items at one horizon before moving down, multiple children and freeform entries are preserved. A rejected parent connection must be explained before attempting a partial substitute. Writes refresh plans and intentions.

Conversation persistence failures are visible. Switching sessions is guarded during saves; saved conversations reopen through history. A real test found the goals table uses `name`; the context-graph query now aliases it correctly. Recursive query-type inference was fixed without changing scope filters.

## Verification

- Full suite: 805 files, 8,321 tests passed, 3 skipped before the final two regressions; final pre-push gate reruns the full suite.
- Added regressions cover pilot access/account changes, linking refresh, household week starts, handshake preflight/quota/error handling, transport cancellation and duplicate tools.
- Frontend production build and lab TypeScript passed. Both edge functions pass Deno check. Lint found two prototype expressions, corrected and rechecked; existing warnings remain.
- Migration verified directly: table, RLS, denied direct insert, function definition and execute grant. A transaction asserted 12 allowed starts and the 13th denied, then rolled back. Migration history was repaired only after verification.
- Real disposable-account conversation created a month milestone and weekly action, linked the existing action and scheduled it for October 9. Database verification: action `8b5034a5-0f8d-4c7c-906d-61d06d0244ac` retained its ID, parent `fa36afc1-af6f-405d-98bd-082aed537054`, and open week commitment. No duplicate action was created. Existing main-account data was not touched.
- Reload showed the saved task and its monthly connection; conversation history reopened both test conversations. The authenticated pilot control appears after reload. No live microphone/provider voice session was started in this verification.

## Deliberate pilot boundaries

Natural voice is available only to `symphonygoals+onboarding1008@gmail.com`. Starts are limited to 12 per account per UTC day; failed handshakes consume a start. The client ends at 300 seconds. This is not a server-enforced duration or dollar cap. A real spoken test of latency, interruption, mute/end and touch-to-voice correction remains required before wider access. The existing local voice demo on port 5257 was left intact.

Generic Realtime small talk is not separately persisted; substantive agent requests are. Context is bounded, not a complete historical memory. Voice is not yet integrated into the wall surface; the accepted functional wall display remains. Supporting destinations keep established functional pages rather than bespoke rewrites. These boundaries must not be described as complete general-availability conversational onboarding.
