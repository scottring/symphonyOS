# Symphony onboarding and everyday flow review

**October 16 implementation:** The [current guide](2026-10-16-beta-readiness-guide.md) supersedes the form-based first-activity proposal and numbered-stage wording in this historical review. Routines and first intentions are conversational; optional device setup, honest completion, and everyday examples are implemented and tested on synthetic accounts. See the linked evidence and its limits before claiming release readiness.

October 15, 2026. Review and onboarding implementation for the local beta candidate at `codex/voice-transaction-bench`, based on `a23b63dc` plus the current uncommitted work. The original findings below remain the baseline; the implemented scope and verification are recorded here.

The building blocks are substantial. The main gap is the connection between them: a newcomer must discover separate setup, capture, planning, editing and help controls without a consistent explanation of what each action means. Reuse those controls and the existing product rules. Complete one understandable path through them.

## Onboarding candidate ready for a walkthrough

Getting started now includes a conversation about the person's typical week. Symphony identifies recurring activities, accepts corrections in ordinary language, and shows a readable routine draft for explicit Save. The routine fields and numbered stages have been removed. Progress describes what is in place and what can wait; it does not demand a series of completed forms. Household identity and first-activity controls remain alongside the brief horizon introduction and an explicit finish. Getting started is available in More and Help, and invited adults use their existing household.

The conversational revision passed 225 automated checks and the production build. Three real-AI turns on an isolated synthetic account produced a draft, a corrected draft, and a natural stopping point. Reload restored the conversation and proposal. No routine or task was written before Save; approval then created exactly the two corrected routines, preserving the people, days, exact time and flexible timing note. The one-off appointment stayed out of recurring routines. Evidence and limitations are in `scripts/conversation-bench/reports/onboarding-story.json`.

The onboarding conversation currently drafts weekly routines, including every-day and explicitly flexible weekly patterns. Monthly and alternating-week patterns are left out with an explanation instead of being silently converted. The household identity and first-activity portions still use direct controls; the broader onboarding direction remains conversational understanding, with controls for review and precise edits.

This implements O2, O3, O9, O10 and O11 for manual acceptance. O1 is partly addressed through undated capture and a goal entry; a guided help-me-structure-a-plan journey remains future work. Starter and Help copy address part of O4. O5–O8 and the broader mid-app guidance remain open. Existing Today, Week and goal views are retained.

Verification on the candidate:

- 57 focused tests pass, covering progress, deferred steps, failure recovery, retry behavior, the later goal journey and native routine time entry. Surrounding invitation, settings, routine occurrence/scope and constellation regression suites also pass. Type checking and the production build pass; the existing large-bundle warning remains.
- A newly created synthetic organizer saved two people, a Monday/Thursday school pickup at 3 p.m. assigned to Sam, and a personal activity under this week's No day yet. The existing Week view showed both routine occurrences at the correct time and the undated activity. Refresh retained draft input; More → Getting started restored saved progress. Completion was recorded only after the explicit finish.
- An isolated synthetic invitee joined that household and could read the shared routine, while the organizer's personal activity stayed private. No invitation email was sent.
- The optional later goal journey saved a private October goal without replacing the first activity or generating tasks or dates. A 360-pixel viewport check showed the progress labels in two columns with no horizontal overflow; reduced-motion styles disable the fill transition.
- Interrupted household setup now records unfinished progress before creating members, so partial data cannot make the legacy gate skip the remaining introduction. Native time input is captured before blur and covered by a regression test.

The next acceptance step is the fresh-account walkthrough with Scott. Provider calendar connection, email delivery, actual phone/iPad use, assistive-technology testing and simultaneous multi-device writes are outside this check. This candidate has not been deployed to the live family app, and these onboarding checks made no paid model calls.

## Baseline before this implementation

| Area | Existing behavior | Evidence and limits |
| --- | --- | --- |
| Account entry | Email/password sign-in, sign-up confirmation, reset and return-to-page handling. The proposed email-code default is not this form's current implementation. | `src/components/AuthForm.tsx`, `src/components/auth/AuthGate.tsx`; source review, no new account created. |
| Organizer setup | One household/name/people/location form, with Skip. Completion leads to Today. | `src/components/setup/FirstRunSetup.tsx`, `FirstRunGate.tsx`; source review. |
| Joining an existing household | Invitation intent is retained through sign-in. The first-run gate checks pending invitations. Joining can match a person already listed in the household. | `src/components/JoinHousehold.tsx`, `src/lib/pendingJoin.ts`; source review plus earlier hosted evidence. |
| First arrival | Today offers Add something for today, Start with a goal, and Explore on my own. The goal branch offers Month, Season and Year. Calendar connection is a separate prompt on the page. | Read-only browser inspection of `/today?welcome=1`; this uses an existing synthetic account to expose the card, not a fresh-account acceptance test. |
| Routines | A dedicated Routines view represents repeating patterns and their occurrences. The first-week signals include Add one routine, but the visible starter does not render those signals. | `src/lib/firstWeek.ts`, `FirstWeekCard.tsx`, `pageTours.ts`, `pageGuides.ts`; source reviewed. More → Routines observed; no new routine saved in this review. |
| Capture and everyday work | Global Quick add, Inbox, direct task/date controls, task details, and chat are implemented. Capture confirmation can name the destination and link to it. | `QuickCapture.tsx`, `src/lib/capture/destination.ts`; date menu inspected in browser. No new task saved. |
| Planning | Week chat supports a draft, correction, Save and scoped Undo. Existing views remain in place. Month/Season/Year have goal entry and conversational entry points. | Current Week browser and prior real-AI Save/Undo evidence; this pass made no paid model calls. |
| Explaining consequences | A task's timing menu names its current placement and explains the effect of removing a day or its day/week. | Browser: “Remove Fri, Oct 16” says it keeps the item in October 11–17 and October. `TaskTimingMenu.tsx`, `PlanWeekMenu.tsx`. This pass inspected the explanation, not the write. |
| Help and orientation | Home offers bearings and destinations. Page-title question marks launch page-specific tours. More contains a printable Planning Guide with four optional exercises. | Guide and menu inspected in browser; `HomePage.tsx`, `PageHelp.tsx`, `pageTours.ts`, `PlanningGuide.tsx`. |

## Gaps to close before beta

| ID | Gap | Evidence | Required change |
| --- | --- | --- | --- |
| O1 | The first prominent choice assumes the captured activity is for today. It offers neither a clear capture-for-later route nor an explicit help-me-structure-a-plan route. | Browser and `FirstWeekCard.tsx:50`. | Offer Capture something, Help me structure a plan, and Explore. Show optional calendar setup at the relevant moment. A capture can remain undecided. |
| O2 | Getting started is not reliably discoverable again. The opening card's automatic offer stops once a task exists, and dismissal persists. An explicit `?welcome=1` route works, but the current More menu and Help do not link to it. | Browser menu; `firstWeek.ts`, `HomeViewContainer.tsx`, `moreDestinations.ts`. | Put Getting started in a permanent Help entry; track useful onboarding progress independently of whether the planner is empty. |
| O3 | Setup can mark itself complete after household/member writes fail. Skip also moves on after an error. Partial success could be hidden, and retries of people inserts need protection from duplication. | Source: `src/lib/firstRun.ts:89–148`, `FirstRunSetup.tsx` handleSkip. | Distinguish essential from optional setup; preserve input and report partial failures. Verify required household creation before completion and make retry safe. This failure path was not injected in the browser. |
| O4 | Teaching has drifted from the app. The starter card mentions Shelves, Help promotes Talk, and Today still offers “Plan my day.” The printable guide is useful but does not provide a short interactive path through ordinary changes. | Browser Today/guide; `FirstWeekCard.tsx:56`, `HelpDialogs.tsx`, `pageTours.ts`. | Align copy with typed-chat beta and the user's ownership of plans. Add short task-based guidance alongside the existing printable exercises. |
| O5 | The assistant presentation changes across navigation. Guide shows the older Symphony AI panel; Week shows Chat. The route switch also covers other non-planning pages such as Inbox. | Browser Guide → Week; `stripPaths.ts`, `ShellLayout.tsx:551–574`. | Use the same chat presentation and preserve draft/conversation/selection context across the advertised journeys. The two renderers share assistant messages; this finding is not evidence of two independent models or lost history. |
| O6 | Saving changes and marking a period planned are separate actions without a clear shared explanation. Week can say it is not planned while already containing saved tasks. | Browser Week; `WeekV2.tsx:46`, `PlanStatus.tsx`. | Explain or simplify the distinction: Save applies the listed changes; marking planned records a review decision and does not save a pending chat draft. It must not imply that existing tasks were unsaved. |
| O7 | Guidance about effects exists in specific menus but is not a consistent journey. New plans, revisions, capture and review lack one recognizable entry/preview/result pattern. | Timing-menu browser evidence versus page tours and general Help. | Reuse the consequence wording across chat and direct actions; name affected dates, items and audience before the decision, and the actual saved destination after it. |
| O8 | Empty calendar data is presented as availability. Today/Week can say the day is open or calendar-clear while also saying no calendar is connected. | Browser Today and Week; earlier chat opening review. | Distinguish unknown availability from a verified free period in both screen text and conversation. |
| O9 | Routines are absent from the visible setup path despite existing routine functionality. | `FirstRunSetup.tsx` has no routine step; `firstWeek.ts` computes a routine signal that `FirstWeekCard.tsx` does not render. | Make the household's recurring rhythm a foundation of setup. Help organizers capture actual routines and invitees understand existing ones; explain occurrence versus pattern. |
| O10 | Onboarding has no visible destination or reliable account of progress. Creating a task can hide the starter, without explaining what is established or what remains. | Current starter choices and `shouldOpenFirstWeek`; source and prior browser review. | Show a stable set of named milestones, the current action, saved results, and deferred work. Persist progress, offer resume, and end with an explicit ready-to-begin handoff. |
| O11 | The starter offers individual goal views without a short introduction to all planning horizons and their relationship. | Existing starter goal branch and page-specific help. | Introduce Year, Season, Month, Week and Today to every newcomer; offer a separate optional goal-first journey now or later. |

## Proposed first visit

The opening steps differ for organizers and invited adults; the rest uses the same app. Present a short destination first: **Bring your household, routines and first activities into Symphony, then start using it.**

1. **Enter the right household.** An organizer signs in and creates it. An invited adult signs in, sees who invited them and joins the existing household. Explain that naming a person during setup does not send an invitation or give them access.
2. **Get oriented.** Show the household, viewing audience and current dates. Offer calendar connection or Later; explain what selected calendar information will be visible. Confirm time zone and week start without requiring a long preferences exercise.
3. **Bring in your routines.** Ask “What happens regularly in your household?” Offer examples such as school mornings, pickups, meals, chores and bedtime as prompts, not suggested commitments. Start with one actual routine: frequency/days, time or flexible period, and who is involved. Check existing routines and connected calendar entries before adding a duplicate. Save the pattern and show its occurrences in Week/Today. An invited adult reviews the household's existing routines and their role rather than recreating them. Later is available, with this step visibly left for later.
4. **Meet the horizons and choose a first action.** Briefly introduce Year, Season, Month, Week and Today. The first three hold goals; Week and Today show activities and routine occurrences. Then offer capture, help structuring a plan, Start with a goal, or exploration. People can start anywhere; they need not complete a goal hierarchy, microphone setup or calendar connection.
5. **Make one thing real.** Example: “Buy a weight bench; I haven't chosen when.” Save it to Inbox without assigning a date. Confirm “Saved to your Inbox” and offer a link there. If the person explicitly chooses this week, use Week's No day yet instead.
6. **See the relationship.** From Inbox, choose This week; in Week it appears under No day yet. Choosing Friday then makes it visible on that day. Explain that it is the same item, with its context retained. Existing routines remain part of the picture as activities are placed around them.
7. **Learn one change and arrive.** Show how to change placement or undo. For a routine, distinguish this occurrence from future repetitions; completing today's occurrence does not complete tomorrow's. Finish with a summary of what is ready, anything left for later, and one clear Open my week or Open Today action. Keep Help → Getting started available.

These are proposed transitions, not a mandatory screen count. Existing Today, Week and goal layouts stay intact.

## Brief horizon orientation, optional deeper journey

The planning horizons are a core pillar, so every newcomer sees a short overview before choosing how to begin. A concise introduction is enough:

> Year, Season and Month help you give shape to your goals. Week and Today help you choose which activities to give attention to now. Your routines bring the recurring parts of life into that picture. Start wherever it helps; you do not need to fill in every horizon.

Keep all five names visible with simple purpose labels: **Year — direction; Season — focus; Month — nearer goals; Week — this week's attention; Today — today's actions.** These are ways of looking at the person's intentions, not an AI-generated schedule or mandatory sequence. Moving between views does not automatically copy commitments or turn goals into tasks.

Offer **Start with a goal** as a separate guided path, available immediately for a willing newcomer and later through Getting started and the relevant goal views. Let the person choose Year, Season or Month, describe a goal they own, save it, and see it in that view. Only then offer to identify a supporting activity and choose when to give it attention. No forced cascade through all horizons and no invented supporting tasks. The brief introduction belongs in the existing first-activities milestone; it does not add another mandatory setup stage.

## A visible destination and honest progress

Scott's fingerprint-enrollment analogy is the design requirement: the person should see the setup becoming established, know roughly where they are, and know precisely what to do next. Use a compact, persistent map with four named milestones:

| Milestone | Concrete action and result | Completion condition |
| --- | --- | --- |
| Your household | Confirm the household, people, audience and dates; connect a calendar or deliberately leave it for later. | Essential household/person records are verified saved. Calendar deferral remains explicitly labeled. Naming people never sends invitations. |
| Your routines | Describe one existing rhythm, choose its repetition and participants, and see its occurrences. An invitee reviews existing routines. | Confirmed routine save, or explicit review of existing routines for an invitee. Later remains a separate state, not a completed routine. |
| Your first activities | First introduce all five planning horizons. Then capture something that matters or start with a goal; optionally choose a period or day; see where it was saved and how to change it. | A confirmed saved result and destination, or a deliberate choice to explore and return later. No invented task is required to fill a progress indicator. |
| Ready to begin | Review the saved foundations and any deferred steps, then open the actual app. | The person explicitly finishes the introduction. This says they can begin, not that every part of their life has been entered or their week is planned. |

Show labels such as **Your routines · stage 2 of 4**, followed by the exact current action and the next destination. Use four connected segments that fill as work is confirmed saved. Distinguish **Done**, **Here now**, **Later** and **Next** in words as well as appearance. Show stage position separately from completed work: a deferred routine must not become a checkmark or silently count as completed setup. Avoid a precision percentage or countdown that implies equal work or known remaining time.

A brief fill transition acknowledges a successful save. Keep the current step visible during saving, retain inputs on failure, and show the error and retry beside that action. Respect reduced motion and announce the new status to assistive technology. No completion animation before persistence succeeds.

Progress is resumable after navigation, closing, refresh and sign-in. Household foundations may already exist for an invitee; personal orientation remains separate. Optional calendar connections, invitations, additional routines and long-term goals must not keep a usable household permanently incomplete. The finish screen can say **You're ready to begin**, with separate **Ready now** and **For later** lists. It must not claim a plan has been completed merely because onboarding ended.

## Onboarding acceptance requirements

- An organizer and an invitee can identify their current stage, the next action and the destination without coaching. Invitees reuse existing people and routines.
- Every newcomer encounters the brief horizon overview and can distinguish goals from everyday activities. Start with a goal works now or later, preserves the chosen horizon, and never requires or generates a full hierarchy.
- A saved routine has the exact chosen recurrence, people and occurrence dates; completing, skipping or moving one occurrence leaves its future pattern unchanged. Pattern changes explicitly identify future effects.
- The progress map advances on confirmed results; failed and uncertain saves retain the current step. Retry creates no duplicate household, person, routine or activity.
- Later stays distinct from Done, can be resumed through Getting started, and does not prevent an honest ready-to-begin handoff. Skipping all optional content never manufactures saved records.
- Refresh, leaving and returning, and sign-in resume the correct household and personal progress. Going back to edit a step preserves saved data and updates the summary accurately.
- Keyboard, screen-reader, reduced-motion, desktop and phone checks cover the progress display and its actions. A brief newcomer observation checks whether the destination and remaining actions are understandable.

## Everyday journeys

| Intent | Proposed path through existing surfaces | What the person should understand |
| --- | --- | --- |
| Start a new plan | Choose Week, Month, Season or Year → see what is already there → bring your own activities/goals → choose placement or leave undecided → review the proposed additions/changes → save. | “New plan” does not wipe the existing plan. Calendar items remain appointments; goals do not become tasks merely by being moved between views. |
| Set up or change routines | Open Routines → describe an actual recurring activity → confirm days/frequency, time and people → save → see occurrences in the existing views. For a change, choose this occurrence or the repeating pattern. | Routine setup is a foundation of household life. One skipped or completed occurrence does not change every future repetition. Avoid duplicating a routine already represented in the calendar. |
| Start with a goal | Open the optional horizon walkthrough → choose Year, Season or Month → name and save an owned goal → optionally link a supporting activity and choose its attention period. | All five horizons are introduced during setup; the deeper journey can wait. The person can start anywhere and does not have to generate a complete plan. |
| Revise an existing plan | Open the period or item → request the revision in Chat or use the direct date control → inspect affected items/dates → apply → see the same item in its new place. | A revision changes the selected commitments, not everything in the period. Moving across a week boundary must make the destination week explicit. |
| Make an ad hoc change | Quick add or an existing item → capture, complete or reschedule → see the actual result and destination. | No planning session is required. A direct action can save immediately; a chat draft waits for Save. The visible state must tell the truth about the chosen path. |
| Understand effects | Inspect the date/commitment or routine choice → read what will change and what remains → act → confirm across affected views. | Removing a day can preserve an existing week/month commitment; it must not claim to preserve one that was never chosen. Completing the same task is reflected across its views. A single routine occurrence is distinct from its repeating pattern. |
| Review and recover | Return to unfinished work → keep, carry, leave undecided or set aside → inspect the change → save, discard or undo as appropriate. | Carry-forward is a decision. A discarded draft does not alter saved work. Network uncertainty is not a false success or an invitation to create duplicates. |

## Implementation order

1. Repair setup completion and retry behavior; restore a permanent Getting started entry and persistent, truthful progress toward an explicit finish.
2. Make routine setup and invited-adult routine orientation part of the foundations. Add the brief horizon introduction and optional goal-first journey. Revise first-action choices and connect capture → destination → placement → one safe correction. Reuse Routines, Quick add, Inbox and the timing menu.
3. Unify Chat across those routes, clarify Save versus Mark planned, and remove stale teaching and false availability claims.
4. Add short guidance for new plans, revisions, ad hoc changes and their effects. Keep the printable guide as an optional companion. Use the same language in page help and AI instructions.
5. Run automated organizer/invitee, progress/resume/deferral, routine setup and scope, capture, correction, cross-view and interrupted-save journeys on synthetic accounts; then observe representative newcomers on named desktop and phone configurations.

Success means people can find the action, predict its effect, recognize the actual result and recover without coaching. Existing tests and this inspection are supporting evidence. Fresh account creation, Google consent/reconnect, phone usability, and actual writes for the newly mapped flows still require their acceptance runs.

## Review record

Read-only browser review used a separate tab on the synthetic local preview. Inspected Today with Getting started explicitly opened, More, the Planning Guide, Week, an existing task's details and its timing menu. The original chat draft was left in its tab. No household data was changed, invitations sent, provider connections made, or paid AI calls run. Current code paths were read alongside the September onboarding program; old claims that the printable guide does not exist are superseded by the live guide.

Companion: [Beta roadmap](2026-10-15-friends-and-family-beta-roadmap.md). The inline journey explorer presents recommended routes separately from the inspected routes; it is not a new Symphony interface or a claim that the gaps are already fixed.
