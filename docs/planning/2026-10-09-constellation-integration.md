# Constellation integration — first connected slice

Local entry: http://127.0.0.1:5261/year?view=constellation
Worktree: conversation-first. No deployment or migrations.

The approved prototype remains at port 5245/scripts/plan-shapes/index.html. The connected view is opt-in on the existing Year route and uses normal authenticated providers. Year, Season, Month, Week inside the view select a horizon across the whole plan; title expansion stays inline. Dates and household season boundaries are explicit. It uses goals-table intentions, task commitments for other periods, existing lineage rules, existing domain and people filtering, and normal addGoal/addTask/updateGoal/updateTask writers. No account data has been changed in this integration pass.

New linked entries inherit parent context and get their period and lineage in a single creation. Composer scope is pinned when opened; period changes are disabled until Save/Cancel. Failed saves keep text; a retry reuses its creation UUID. Goal load failures are exposed through GoalsContext so an error does not resemble an empty plan. One record in multiple periods has distinct display keys while sharing the same database ID. Unmatched/filtered-parent items remain independent.

Validation: application TypeScript and production build passed. 35 focused tests passed (five new integration/model checks, ten journal linking tests, twenty placement tests). These do not establish authenticated persistence or database privacy. Local browser reached sign-in on port 5261; asked Scott to sign in with symphonygoals+onboarding1008@gmail.com. No credentials read or copied.

Remaining before release: signed-in create/edit/reload journey, desktop and narrow-screen visual checks, review of dropped/carried commitments vs active appearance, focused keyboard/composer accessibility, parent-link editing and optional task-step display. Scheduling/completion currently links to the proven Week screen rather than rewriting placement semantics; Today remains the existing page. The prototype's full task-step interaction is not yet ported. Conversational control remains separate. Do not describe this first connected slice as release-ready.

Unrelated canvas-lab changes predate this work and remain untouched.

## Signed-in verification

Confirmed Account menu identity symphonygoals+onboarding1008@gmail.com. Created four labeled disposable records through the UI: Constellation test: make time outdoors → enjoy autumn outings → picnic ready → choose a picnic spot. Renamed the weekly action to “Constellation test: choose a nearby picnic spot”. Switched to Week horizon and performed a full reload: all four records, correct hierarchy, and renamed action persisted. Existing onboarding and walkthrough records remained visible. These four test records were left in place for inspection.

Phone viewport 390 × 844: expanded existing garden intention through season, month, and week. Titles and separate Edit controls remained readable; indentation fit without visible clipping. Removed repeated per-item horizon labels within each already-labeled branch. Saved connected-phone.jpg; restored normal viewport. No physical-device or cross-account authorization test performed. Latest application TypeScript and all five new tests passed after label cleanup. Deployment remains pending; remaining feature limits above still apply.

## Horizon zones connected followup

Replaced the nested presentation in the opt-in connected page with four tinted horizon columns. All visible items remain present; selection highlights ancestors and descendants without hiding siblings. Each horizon supports independent entry, and the selected item offers editing and linked child creation. Existing save logic, period locks, retry IDs and filters remain in use. Horizon buttons jump to the corresponding column on narrow screens. Selection controls appear above the map rather than after its longest column.

Validation: app TypeScript check and five focused connected model/component tests pass. Signed-in test account displayed the existing four-record chain in the zones; saving the monthly test item's unchanged wording completed successfully. Desktop and 390px viewport checked; columns stack on phones. No new test records were created this pass. Not deployed. Week/Today handoff still uses existing implemented screens; the approved conversational Week/Today designs and task-step visualization remain outstanding.

## Connected Today alongside / Week handoff

Added opt-in `/today?view=alongside` around the existing Today content, preserving calendar, routines, meals, details and completion controls. The filtered weekly action panel can hide/reveal; buttons and a custom drag payload place the same row on the viewed date through the existing gated placement writer. Existing monthly links are not rewritten. Phone defaults to the panel hidden. The map, Week and Today have explicit return/continue links; Week retains the existing Open journal and day scheduling, not a wholesale visual rewrite. Weekly review's Today link preserves the opt-in mode.

Test account: placed “Constellation test: choose a nearby picnic spot” on October 9, selected Personal through the existing domain gate, saw success, reloaded and verified it remained on Today with its monthly link. No duplicate created. 27 focused tests passed (placement model plus connected components); app TypeScript passed. Phone check exposed an existing calendar status banner squeeze; made its content wrap. Voice, optional task-step visualization, and the broader Week visual redesign remain outstanding. Local only.
