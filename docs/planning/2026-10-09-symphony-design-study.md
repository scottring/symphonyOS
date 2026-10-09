# Symphony: one product, three ways in

October 9, 2026 · local design study · not a release

Preview: `http://127.0.0.1:5245/scripts/symphony-design-study/index.html`

## Recommendation

Evolve Symphony's existing surfaces. Keep the planning model, saved entities, familiar controls, and useful household integrations. Introduce conversation as another way to operate that system, with a stable place on each surface.

“Canvas” means the central workspace can focus on an activity—planning, cooking, preparing for tomorrow—while navigation, visual identity, ownership, and return paths stay predictable. It does not mean that an AI generates an unfamiliar interface every time.

The earlier `canvas-lab` experiment is superseded as a design direction. Its universal rail and household tool row ignored established surface differences. Do not carry those choices into production.

## What the source actually establishes

- `src/components/layout/PlanNavigation.tsx`: desktop uses Today → Week → Month → Season → Year navigation. Phone explicitly uses a compact title menu instead of five tabs. Navigation order is distinct from the full planning workflow, which moves Year → Season → Month → Week → Today.
- `src/shell/ShellLayout.tsx`: desktop has a right-hand Details / AI column and an optional reference dock; phone has a full-screen conversation and the Planner / Inbox / + / Routines / More dock. Keep these recognizable entry points.
- `src/components/layout/moreDestinations.ts`: common secondary destinations include routines, someday, meals, meal shelf, lists, house, discussions, contacts, documents, notes, history, guidance, and printable planning material. These do not all need to be visible on every page.
- `src/components/wall-v2/WallV2Shell.tsx`: the active wall uses `moments/WallMoments`, not a shrunken desktop planner. It already gives kidsPhone, Groceries, and Recipes direct access. Preserve those specific wall affordances; do not generalize them into universal navigation.
- `src/components/wall-v2/WallV2RecipeSheet.tsx` and `src/components/wall/WallRecipeViewer.tsx`: recipe browsing and cooking are substantial existing workflows, including touch search, day navigation, ingredients, and steps. Reuse them, not a dinner placeholder.
- `WallV2PhoneScreen.tsx` and `CallerIdTakeover.tsx`: Symphony hosts access to kidsPhone, the separately owned telephony project. Its confirmation, receiver state, quiet hours, errors, and active-call priority remain the telephony integration's responsibility.
- `KidDayView`, `useReadingScreenTime`, and the scratchpad retain children's progress, homework, routines, and shared notes. A generic “family” card is not equivalent functionality.

This is a source-informed inventory, not a claim that every existing feature has undergone a fresh production audit.

## Design set

### 1. Desktop / web: plan and conversation alongside each other

The existing rail remains in the header, in its existing order. The account's context stays visible; secondary destinations remain in the menu. Month and Week use the Open journal structure: broader context on the left, editable entries beside it, and a first-class independent section.

Guidance occupies the right panel. The journal and the conversation have separate scrolling regions, with readable minimum widths. On narrow windows, show one workspace at a time instead of crushing both columns. Opening details should use the existing Details / AI mechanism, preserving drafts.

The guide begins with distinct purposes: Build my plan, Add to my plan, Review my plan. A paused session receives its own explicit Resume action. Build offers five start periods, with the remaining path shown on each choice. It asks one question at a time but keeps all intentions available for that period. No arbitrary required number of goals.

Each period ends with a whole-period checkpoint. Year is completed across all intentions before Season, then Month, one combined Week, and Today. The guide may suggest language; a proposed entry is visible and editable before a real write. An already actionable task should not trigger endless smaller questions.

### 2. Phone: immediate action, deeper planning when invited

Keep the compact horizon title and existing bottom dock. No desktop rail and no permanent household tool row. Today shows current actions and relevant schedule. A meal can lead directly to its recipe; the recipe library remains reachable through More / Meals.

Conversation takes the central phone workspace. Two explicit tabs—Conversation and My [period] plan—let people inspect and edit the same plan without abandoning guidance. A compact progress marker gives a finish line. Pausing returns to direct use, and resume is distinguishable from a new session.

Capture defaults to Inbox, with Today as a deliberate choice. Routine management remains a personal destination; a child's wall page is not a substitute for it.

### 3. Wall: shared life at a glance

Keep the wall's established dark, moment-based surface, direct household tools, and child destinations. Calendar and routine information remain readable from a distance. Dinner opens cooking. A question about a picnic connects to the family's October plan without displaying a private planning hierarchy.

Conversation is explicitly invited and temporarily takes focus. It can propose a shared preparation action with a visible confirmation. No always-on microphone. Voice identification must not be treated as authorization to reveal private information. When identity or permission is uncertain, private planning belongs on an authenticated personal device.

Cooking gets a dedicated screen, not a small scrolling dialog. A persistent Back control returns to the same household view; ingredient progress stays intact. The study illustrates this with one recipe, while production must retain the existing shelf, search, day paging, and recipe content.

kidsPhone remains a separate service accessed from the wall. No redesign of telephony, no model-initiated calls, and no absorption of that project into Symphony.

## Continuity rules

1. Same item, same connection: moving an action onto Today schedules the existing weekly action; it does not duplicate or complete its monthly parent.
2. Direct and guided work coexist: freeform entries, editing titles, and adding/removing connections remain available after creation.
3. Context changes do not imply writes. Suggested changes require explicit acceptance and are acknowledged only after saving succeeds.
4. Preserve unfinished text and its selected parent through navigation, panel changes, and pausing. Do not silently assign a draft to a different period.
5. Filters must affect both items and counts. A hidden result needs an explanation and a way back; a context label alone does not establish permissions.
6. Unfinished work stays available for a deliberate review decision. Never imply that every unfinished task automatically moves into the next week.
7. Returning from cooking, a child page, or conversation restores the prior location and relevant state. Active calls take precedence over conversational UI.
8. Keep the Marcellus brand, Crimson Pro headings, DM Sans controls, restrained color, and familiar dates/context. The wall retains its established display treatment; recognition does not require identical layout.

## Feature coverage and integration map

| Capability | Desktop / web | Phone | Wall | Treatment |
| --- | --- | --- | --- | --- |
| Year, season, month, week, Today | Existing rail and journal | Existing horizon menu | Shared results relevant to household; no personal rail | Preserve planning entities and selectors |
| Full guided planning | Side conversation, plan visible | Conversation / My plan switch | Family-only coordination as appropriate | New guide around existing operations |
| Add / relink / freeform | Inline entry and details | Inline entry and details sheet | Shared capture, approved destinations | Reuse mutations, preserve IDs |
| Calendar, tasks, routines | Today / Week and direct editing | Today plus agenda / routine dock | Current moment and child pages | Preserve date semantics and completion |
| Capture / Inbox / paper import | Existing capture and search | + and Inbox | Shared scratchpad / groceries | Existing richer options retained; sample capture is narrower |
| Recipe library / meals | Meals, meal shelf; contextual meal link | More / Meals; contextual meal link | Direct Recipes and dinner | Existing shelf and viewer, not new recipe storage |
| Groceries / other lists | Lists and optional reference material | More / Lists | Direct Groceries, existing list sheet | Shared list, same IDs |
| kidsPhone | No unsolicited prominent placement | No new telephony placement | Existing direct connection and call takeover | Separate project; preserve integration |
| Reading, homework, children's routines | Existing management/reference routes | Existing routines/family destinations | Child page and existing timers | No timer or ledger rewrite |
| Notes, documents, contacts, discussions | Menu, search, contextual references | More and search/capture | Only authorized shared content | Preserve existing destinations |
| Review / history | Period review, History | Period review, History | Shared review when appropriate | Preserve deliberate decisions and failures |
| Someday / house / settings / printable guide | Existing menu entries | Existing More entries | Existing utilities / guest controls | Do not remove for visual simplicity |
| Offline, freshness, auth, permissions | Existing shell feedback | Same access rules | Explicit freshness and guest controls | Release requirements; not established by fixtures |

## What you can actually try in the study

- Switch among three distinct surface designs; there is no universal tool row.
- Build from any horizon; finish each period across multiple intentions.
- Start with an empty sample plan, enter two yearly intentions, and see both as context at Season. Enter seasonal outcomes and see both at Month.
- Add connected or independent entries, edit titles, and change/remove broader connections after entry.
- Choose a weekly action for Today using the same sample item. Complete it without completing its parent.
- Pause guidance and resume. Unsubmitted inline text and the guided answer/selected parent survive in-session navigation.
- On phone, switch between conversation and the actual sample plan; capture into Inbox and move it to Today.
- On wall, open cooking, check an ingredient, return home, and reopen with the check retained. Add basil to the sample grocery list.
- Inspect a fictional kidsPhone contact and cancel its confirmation. No calls are connected.

Some controls deliberately show design intent rather than a rebuilt feature. These are labeled: voice, reading timer, recipe shelf, general reference destinations, wall preparation, and review carry-forward. The context selector demonstrates its visible label, not actual permission filtering. No production claim should be inferred from those screens.

## Verification and remaining limits

Verified in the local browser:

- Fresh start: two distinct yearly intentions carried into Season, then both seasonal outcomes carried into Month.
- Existing plan: whole-horizon progression and end summary.
- Removing a weekly parent left the task visible in Other tasks this week.
- Inline draft retained through Month → Week → Month.
- Guided answer and selected parent retained through pause/resume.
- Phone plan tab exposes the journal without ending the guided session.
- Inbox capture → Today uses a visible acknowledgement.
- Recipe ingredient check survives home → cooking; home and cooking content each fit their 720px-high design frames without internal overflow at the observed 1203px content width.
- kidsPhone confirmation can be canceled without calling.
- Desktop, 410px phone-frame, wall, and cooking screenshots saved in `design-study-evidence/`.

TypeScript passes. ESLint has no errors and three expected Fast Refresh warnings for the standalone entry module's local components.

The browser viewport override did not change the actual viewport (it remained 1280×720), so a physical 390px viewport was not verified. The 410px phone frame was inspected instead. Verify real phone breakpoints and target kiosk hardware before implementation sign-off.

This is an isolated fixture app, not a new production data model. State is in memory and resets on reload. No real account changes, network AI calls, microphone access, database migration, telephony, or deployment. Existing production access controls and save/error behavior still need integration testing.

## Next implementation boundary

Review the three experiences together before changing production UI. Then implement one vertical slice in the existing app: optional monthly guidance → weekly actions → Today, with actual IDs, writes, failed-save handling, resume, and authorization. Once that is reliable, extend to Year/Season and connect voice. Keep recipes, children’s routines, and the telephony integration on their existing implementations throughout. The wall's adaptive conversation can follow on the same shared-operation contract without replacing its working home surface.
