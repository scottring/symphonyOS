# Symphony friends and family beta roadmap

**October 16 update:** Use the [current readiness and walkthrough guide](2026-10-16-beta-readiness-guide.md) for implemented onboarding, device setup, everyday guidance and the release checklist. The activity form described in earlier notes has been replaced by conversation; optional device setup adds a fifth named milestone. The release gates below are not automatically closed by that work.

October 15, 2026. Target: the first five invited households. This roadmap brings the existing release work into one sequence and incorporates Scott's decisions to focus on typed chat, defer voice and live plan previews, and make onboarding and everyday guidance explicit release requirements.

**Ready to invite means a new household can get started, bring its own activities into a plan, change that plan, understand the consequences, and recover from mistakes without Scott operating Symphony for them.** Chat is one part of that experience. Symphony helps people structure their own intentions; it does not invent their priorities or fill their time.

## Scope for the first invitation

Keep the existing Today, Week, Month, Season and Year views, direct controls, and typed chat. Year, Season and Month hold goals; Week and Day hold tasks. People may start at any horizon or simply capture something for later. They do not need a complete hierarchy, calendar connection, or conversation to get value.

Voice and live visual rearrangement during a conversation are deferred by Scott's decision. Keep clear working, draft, saved, failed and undone feedback, with modest motion where it explains a change. Do not start another visual redesign or model comparison for this release.

**Recommended scope decision:** support named desktop and phone browsers first; make the iPad wall a separately certified optional addition. The earlier launch plan called for display use in three of the first five households. Changing that requirement needs Scott's agreement; wall support remains pending until then. If retained for the first invitations, its calendar access, restricted writes, pairing/revocation and 48-hour device test belong on the critical path.

Separate private assistants, native app releases, additional tablet platforms, Microsoft calendar and broad connected-mail support remain separately gated. Existing private data must still be protected even while private assistants are deferred.

## Roadmap and completion criteria

| Step | Work | Complete when | Lead |
| --- | --- | --- | --- |
| 1. Establish one release candidate | Reconcile deployed code, this chat branch, the readiness register and outstanding review findings. Confirm the advertised devices and features. | One build and one current blocker list; every remaining item is required before invitations, conditional on an offered feature, or deferred. Historical passes are not mistaken for current certification. | Codex; Scott decides scope |
| 2. Protect data and control costs | Resolve or verify closure of the known attachment-access, concurrent Undo, interrupted-save/retry and spend-accounting findings. Complete callback protection for the calendar connection. | Focused regression tests reproduce the original failure and pass after the fix; synthetic real-account checks confirm relevant deployed boundaries. No open privacy, data-loss, unintended-write or uncontrolled-spend blocker. | Codex |
| 3. Make starting and continuing understandable | Complete the onboarding and mid-app flows below. Reuse existing guides and controls. Finish a bounded chat pass: accurate context, draft/Save wording, clear recovery and measured waiting feedback. | The specified journeys work on the candidate; a person knows where an action starts, what it changes, when it is saved and how to recover. Tests cover both chat and direct actions. | Codex; Scott reviews the flow design |
| 4. Prove a new household can use it | Run two fresh synthetic households through organizer setup, invited-adult joining, routine setup/orientation, calendar or deliberate calendar-free setup, resumable onboarding progress, and desktop/phone use. Observe five representative adults on the stable candidate. | Both household journeys pass. All five adults identify the audience; at least four capture, reschedule and find the next commitment across two supported surfaces without coaching. They can also distinguish proposed from saved work. | Codex prepares and records; Scott recruits participants |
| 5. Prepare release and support | Complete recovery and rollback evidence, publish one support route and known-issues list, and prepare the invitation and short getting-started guidance against the finished build. | Recovery limits are resolved or explicitly accepted where appropriate; rollback is rehearsed; invitation claims match tested features; Scott has a concise go/no-go record. | Codex prepares; Scott owns external promises and release approval |
| 6. Invite five households | Release the approved candidate and send the agreed personal invitations. Observe setup and useful household use. | Five households have access and a clear way to get help. Subsequent expansion follows the cohort gates below. | Scott approves and sends, or explicitly authorizes sending |

Steps 2 and 3 are the main engineering work. Invitation copy and participant scheduling can progress alongside them. Step 4 uses a frozen candidate so observations remain comparable. There is no requirement to repeat Scott's already-passed basic chat Save/Undo round after unrelated changes.

## Onboarding

The [onboarding and everyday flow review](2026-10-15-onboarding-and-mid-app-review.md) now maps the inspected routes, the specific gaps, and recommended first-visit and mid-app journeys. It is a review of the candidate, not a completed implementation.

Two entry flows must be clear: the person starting a household, and someone joining an existing one. A joining adult should land in the right household without being asked to recreate it.

The first useful sequence is: sign in → understand whose space this is → connect and select a calendar, or leave it for later → bring in the household’s routines → meet the planning horizons → capture something of your own or start with a goal → choose whether it belongs now or later → save and see where it went. Inviting another adult follows naturally. Time zone and week start must be correct; sharing must be understandable.

Routines are fundamental to setup. Ask what already happens regularly, then capture frequency/days, time or flexible period, and who is involved. Start with one useful routine and show its occurrences in the existing Week/Today views. Avoid duplicating calendar entries. An invited adult reviews the household's existing rhythms instead of rebuilding them. Teach the difference between one occurrence and the repeating pattern; completing or skipping today must not change tomorrow. A visible return-later choice keeps setup manageable without hiding routines.

Introduce **Year, Season, Month, Week and Today** briefly to every newcomer. Year/Season/Month hold goals; Week/Today bring activities and routine occurrences into everyday attention. Explain that people may start anywhere. Offer a separate **Start with a goal** walkthrough now or later, available again from Getting started and goal views. This orientation is part of the first-activities milestone, not a forced cascade or another mandatory setup stage.

Give onboarding a visible destination and four named milestones: **Your household → Your routines → Your first activities → Ready to begin**. Show the current stage, one concrete next action, confirmed saved progress and anything left for later. Fill the corresponding segment only after successful persistence; distinguish Later from Done. Resume after interruption. End with an accurate summary and Open my week/Today, without implying that the person's whole life is configured or the week is already planned. This sense of progress is a beta requirement, not optional decoration.

Acceptance covers horizon awareness and the optional goal-first path, saved recurrence and dates, one-occurrence versus future-pattern changes, organizer/invitee differences, failed-save retry without duplicates, honest deferral, resumed progress and an understandable finish. Verify the progress display with keyboard, assistive technology, reduced motion, desktop and phone use.

Offer a clear choice between getting something down quickly and getting help structuring a plan. Keep guidance skippable and available again from Help. A newcomer should reach a useful first result without a microphone, imported history, mandatory tour or long-term goal. The existing ten-minute first-value target is an observation target, not a promise until measured.

## Mid-app flows

These are first-class product journeys, not a collection of tooltips. Each needs an obvious starting point, guidance at the decision, a visible result, and a recovery path. Explain the consequence before a consequential action and confirm the actual destination afterward.

| Situation | What Symphony must make clear | Acceptance example |
| --- | --- | --- |
| Start a new plan | Which period and audience are being planned; what is already there; what the person wants to bring into it. Starting a plan must not silently replace existing work. | Help structure the rest of this week around the person's tasks. Leave an undated purchase undated. No invented commitments. |
| Change an existing plan | Which existing items change, their previous and proposed placement, and what stays in place. Reuse the same items rather than copying them. | Move Friday's bike errand to Monday. Show the affected week and day; save one change; do not create a second errand. |
| Make an ad hoc change | A quick capture, completion or reschedule does not require reopening a whole planning session. State whether it was saved directly or is waiting in a draft. | Capture a new idea for later, move one task, or mark it done; each result is findable with appropriate recovery. |
| Understand effects on existing plans | Scheduling, linking, completing and removing a commitment have different effects. A task's other commitments and goal links must not change silently. An event is distinct from a task. | Remove a task's day while keeping it in the week; completion appears wherever the same task is shown. A goal stays a goal. |
| Change a routine | One occurrence and the repeating pattern are distinct choices. | Skip this Thursday without changing future Thursdays; changing the pattern explicitly says it affects future occurrences. |
| Review, defer or recover | Unfinished work does not silently become a new commitment. Carrying forward, leaving undated, setting aside, discarding a draft and Undo have clear meanings. | Leave library books undated; discard a draft without changing the saved week; retry an interrupted save without duplicates or a false success message. |

For every journey, verify that the words, draft, saved records and other views agree. Chat suggestions should invite help with the person's intentions. A missing calendar means availability is unknown; repeated deferral or renewal alone does not establish urgency.

## What is already established

- The real-AI chat walkthrough passed capture, correction, Save and Undo, with database readback. The same three-item draft was corrected; Undo removed those three and preserved the original two tasks. [Walkthrough evidence](../../scripts/conversation-bench/reports/chat-ui-walkthrough.json).
- The latest recorded chat validation has 812 offline checks passed, three skipped, 15 browser transaction scenarios passed, responsive chat checks, and a passing build/typecheck. These support the tested behaviors; they do not close untested privacy, concurrency or real-device journeys. [Current conversation evidence](../../scripts/conversation-bench/reports/unified-conversation-status.json).
- Hosted synthetic invitation, household-isolation and emergency AI-disable evidence exists. The 35-check privacy report covers attachment metadata, not the later-reported storage-download issue. [Readiness register](beta-readiness.md) and [independent review](2026-10-15-codex-overnight-review.json).
- A logical restore of public data was rehearsed, but full authenticated application recovery, storage continuity and rollback remain incomplete. [Recovery runbook](../maintenance/beta-recovery-runbook.md).
- Earlier onboarding work already documented these storylines and established useful product rules. Reconcile its old findings against the candidate instead of starting over or treating old open rows as current failures. [Onboarding program](2026-09-23-onboarding-and-planning-guide-program.md).

## Remaining safety findings to reconcile first

The independent review records attachment storage access through forged metadata (R8), unreliable monetary reservations and ledger authority (R2), Undo overwriting a later edit (R1), interrupted saves duplicating on retry (R7), and reusable authorization state without expiry (R3). The current local candidate still contains the two-second Undo grace rule and signed-state helper without expiry/consumption. Ordinary Save/Undo success does not close these edge cases. Verify deployed status before describing each as either fixed or currently exposed.

The routine benchmark's grading gap (R6) also requires evidence reconciliation: use the strengthened grader and exact occurrence-date assertions, not the older reported pass count. Voice-specific gaps move to the deferred voice track; any reachable paid voice path must still be disabled or controlled for the beta.

## Timing and the rule for stopping polish

The next work block should produce the reconciled blocker list and the onboarding/mid-app flow map. Estimate implementation time from those concrete remaining changes, then choose an invitation date. The current evidence does not justify a fixed send date or percentage complete.

Chat gets one bounded completion pass. Further work enters the release only when it corrects a wrong action, lost work, misleading state, blocked journey or material confusion. Cosmetic preferences and speculative improvements go into the later list. Show progress as requirement, evidence, remaining blocker, owner and next action; avoid another running diary of small patches.

After five households start, the existing launch plan proposes two weeks of assisted use before expanding to ten; the ten-household stage includes four weeks of observation. Those are learning periods after the first invitations, not additional prerequisites for sending them. Expansion to 25 belongs to a later paid-pilot decision. [Launch plan](https://chatgpt.com/space/page_50fd3d212da08191a8cb14eb58ea70e1).

Scott's involvement should be concentrated on scope and flow decisions, any real-account connection that requires him, recruiting representative adults, and the release decision. Automated preparation, engineering fixes and evidence gathering should not require repeated one-off testing with him.
