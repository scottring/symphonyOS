# Symphony: a cohesive experience built on the existing product

Status: source-grounded inventory and design contract, October 9, 2026. This is not a claim that every registered surface is enabled in production or that every workflow has been retested. No deployment or schema change is part of this pass.

## The design problem

The recent prototypes tested planning relationships and conversation, but treated the surrounding product as incidental. The connected Today experiment demonstrates the consequence: another panel and another toolbar beside an already complete page. The next design must cover the whole workspace, including selection, details, capture, household utilities, and failure states. Redesign the presentation around existing capabilities; do not silently replace them with simpler demos.

## Existing capability map

| Capability and source | Place in the redesigned experience | Preserve and verify |
| --- | --- | --- |
| Today: `src/apps/tasks/HomeViewContainer.tsx` | Default personal working surface: dated agenda, chosen tasks, routines and meals; optional weekly choices | Calendar reconnect/loading/error states; task completion and rescheduling; routines and meal events; undo; date navigation; details selection |
| Week: `src/components/plan/v2/WeekV2.tsx` | Weekly planning workspace: month context, linked actions, open actions and day placement | Rapid linked entry, independent entry, relinking, existing scheduling and deliberate carry-forward; household week boundaries |
| Year/Season/Month: `src/apps/plan/PlanPages.tsx` and connected constellation model | One planning workspace with horizon navigation and visual relationships | All intentions first, then goals across intentions, milestones across goals, actions and daily tasks; multiple children; freeform items; existing records and filters |
| Shared selection: `src/shell/DetailPanel.tsx`, `src/apps/tasks/TaskDetailPanel.tsx` | One consistent selected-item experience from any surface | Task, routine, event and meal selection; URL selection; close/back; full-page editing where needed |
| Task details: `src/components/surface/TapContextPanel.tsx` | Quiet core fields followed by relevant expandable sections | Timing, completion, notes, task steps, people, source, links, photos, location, related entities, conversations, classification and contextual actions |
| Routine details: `TapRoutinePanel`, `TapStepPanel`, `src/apps/routines/RoutinesApp.tsx` | Routine management plus the selected occurrence within Today | Distinguish changing the recurring pattern from changing one occurrence; steps, schedule, assignment and save failure feedback |
| Events and meals: `TapEventPanel`, `TapMealPanel` | Same details frame, content appropriate to selected entity | Calendar edits and reconnect errors; event context/people; meal information and recipe access |
| Conversation: `src/shell/SideColumn.tsx` and assistant launcher | Persistent conversation state with a lightweight entry control; context-aware visual updates | Current Details/AI switch keeps both mounted; selection and drafts must survive switching. Avoid three simultaneous competing sidebars |
| Inbox and capture: `src/apps/tasks/InboxViewContainer.tsx`, capture flows | Persistent quick capture plus Inbox for unprocessed material | Typing, paper import, triage, privacy, failed-save recovery and a next step after import |
| Meals: `src/apps/meals/MealsApp.tsx` | Dedicated meal planning, recipe shelf and cooking workspace, accessible contextually | Existing plan/shelf/cook routes; ingredient and recipe interactions. Cooking deserves its own readable surface |
| Lists and groceries: `src/apps/lists`, `src/components/meals/groceries-v2` | Useful collection views and contextual shopping access | Keep distinct list/shopping behavior and item state; do not turn all entries into planning goals |
| Contacts, projects, notes, documents: `src/apps/{contacts,projects,notes,documents}` | Findable supporting information, linked from relevant work | Contacts/projects currently open tasks via task routes. Documents open signed URLs; do not assume a universal document details pane exists |
| Family and discussions: `src/apps/{family,discussions}` | Shared coordination with explicit audience | Assignment is not permission; personal/work remain private; conversations retain their entity context |
| History, home assets, medications: registered `src/apps/{history,home,meds}` | Preserve dedicated destinations pending workflow-level audit | Registration proves implementation exists, not production exposure. Inspect before consolidating or removing controls |
| Settings: `src/apps/settings/SettingsApp.tsx` | Stable account/household configuration destination | Calendar connections, household configuration and relevant preferences; no conversational-only settings |
| Kiosk: `src/components/wall-v2/WallV2Shell.tsx` | Household ambient dashboard with task-specific takeovers | Family day, weather, routines, recipes, groceries/lists, capture, member views, stale-data feedback and phone access |
| kidsPhone: `WallV2PhoneScreen`, `CallerIdTakeover` references in wall shell | Contextual calling and incoming-call experience | Existing telephony integration remains distinct from the planner. Broader contact/entity calling needs its own integration audit; don't claim universal calling exists |
| Getting started / planning guide / plan aloud: registered start, guide, plan-aloud apps | Optional guidance within the same working surfaces | Resume versus new plan clearly separated; voice optional; user authors content; no unsolicited domain coaching |

## Shared workspace contract

Use three functional regions, with layouts adapted to the device:

1. **Orientation:** recognizable Symphony mark, current page/period, visible life-area state, capture/search access. One primary navigation system per device. Avoid duplicated horizon controls and multiple view toggles that mean different things.
2. **Working canvas:** Today, weekly planning, horizon planning, cooking or another relevant surface. Conversation may reveal a designed component or highlight a relationship; it does not invent new navigation or erase the user's place.
3. **Selected-item workspace:** details or conversation associated with the current work. On desktop, one coordinated companion region. On phone, a full-screen sheet with clear return. On kiosk, a readable task-specific sheet/takeover which returns to the household display.

Weekly choices are working-canvas content, not a second permanent inspector. When the details pane opens on a narrow desktop, collapse or reflow weekly choices before squeezing Today into a thin column. Remember the user's previous choice and restore it when appropriate. Do not silently discard selection or draft text to make room.

## Details pane contract

The first visible section should answer: what is this, when does it happen, who is involved, and what can I do now? Show the title, relevant status/timing, life area/audience, and primary action. Follow with existing notes and steps. Show populated supporting sections naturally; put adding optional information behind an obvious Add control. Do not create a long wall of empty fields.

Use the same item identity and selected state whether opened from Today, Week, a plan node, search, a recipe-related task or conversation. Entity-specific fields remain entity-specific: an event is not a task, a recurring routine is not its occurrence, and a recipe is not merely a note.

Conversation can offer an edit or reveal an existing connection. Saving uses the same established commands and permissions as direct editing. A spoken interruption, panel switch, or navigation must not falsely indicate a save. Retain wording on failure, preserve drafts, and provide accessible status feedback. External communications and calls require their appropriate deliberate action.

## Device adaptations

| Desktop/web | Phone | Wall kiosk |
| --- | --- | --- |
| Today with optional weekly choices; coordinated details/conversation companion | Today first; weekly choices on demand; details full screen; reachable capture | Family ambient day first; large touch targets; recipe/cooking and calling takeovers |
| Planning horizons can sit alongside one another when legible | Focused horizon with visible position and accessible related context | Planning can be entered intentionally; never leave private planning visible as the default household screen |
| Keyboard, mouse, drag and voice | Touch, typing, buttons and optional voice; no drag-only task | Touch and optional voice; no requirement to speak across the room |

Same typography, semantic colors, component shapes and transition language across devices. Share the identity and behavior, not a desktop rail or the same density.

## Next clickable design deliverable

Build one coherent sample household across these states, rather than independent mock pages:

- Resting Today with an event, a routine occurrence, a meal and two tasks. Weekly choices shown and hidden.
- Select a task: details with notes, steps, timing, people and a monthly connection. Edit by typing, switch to conversation and back without losing the draft.
- Week: multiple monthly milestones, several actions under one milestone, a freeform action, and placement onto a day.
- Planning map: all yearly intentions, multiple seasonal goals and monthly milestones, a selected branch; horizon-by-horizon guidance across all intentions.
- Meal/recipe details and kiosk cooking state, proving that the product extends beyond planning cards.
- Phone equivalents for Today and details; kiosk resting state and a focused takeover.
- Loading, empty, filtered, failed-save and disconnected-calendar states using the same visual system.

Use fictional sample content, explicitly labeled. Prototype interactions must distinguish scripted conversation from live voice and local edits from persisted writes. No production rollout until the design and functional coverage are reviewed.

## Acceptance before integration

Every existing capability above must have a destination or an explicit unresolved decision. The review should demonstrate navigation, selected-item continuity, closing/back, unsaved work, independent entry, multiple children, day placement without duplicates, privacy visibility and narrow-screen legibility. Existing functional tests remain required when implementation changes. A polished screenshot does not establish save correctness or permission isolation.

## Outstanding audit work

This pass read route/component wiring and relevant panel sources. It did not exhaustively exercise every field or every registered app. Before replacing each surface, verify its live behavior and populated details, including attachments, routine occurrence edits, recipe/grocery workflows, and phone calling. Resolve old/alternate detail implementations through actual route ownership rather than redesigning whichever filename looks most current.

## First connected design study delivered

Local URL: `http://127.0.0.1:5245/scripts/symphony-workspace/index.html`.

The study joins Today, weekly choices, Week, horizon planning, Kitchen and Routines with a shared details/conversation companion. It demonstrates populated notes and steps, local capture/search, recipe cooking takeover, routine occurrence checks, and state previews. See `scripts/symphony-workspace/README.md` for exact interactive coverage and remaining limits. Desktop and actual 390px viewport screenshots are in `living-canvas-evidence/cohesive-workspace-{desktop,phone}.jpg`. Lab TypeScript check passed; browser review verified notes survive panel switching and a weekly action moves onto Today with its local connection.

This is a cohesive visual direction for review, not a complete replacement app. The registered supporting destinations remain in the inventory, not all represented by functional mock screens. Production integration should proceed through shared shell/detail components and the existing placement commands, with accessibility and live-data checks before changing defaults. No API spending or production changes occurred.

## First connected presentation pass

The opt-in `/today?view=alongside` surface now uses actual place color/display-font tokens and quieter weekly rows. SideColumn exposes whether it occupies space; weekly choices temporarily yield to it and restore their prior open/closed preference after it closes. Existing Today, details, routines, calendar and save commands remain mounted through their original components. Three focused AlongsideDay tests pass, including placement failure/retry and companion restoration; app TypeScript passes. Browser verified open/close on the signed-in disposable account and narrow viewport. No data edits or deployment in this pass.

This is an incremental integration, not visual parity with the approved study. Remaining: consolidate duplicate weekly-view controls, reconcile the Today masthead/agenda and contextual notices, then refine existing detail sections and continue across Week/Plan. Do not describe the entire redesign as connected yet. Evidence: `living-canvas-evidence/connected-workspace-first-pass.jpg`.

## Connected workspace continuation — October 9

Implemented locally:
- `AlongsideContext` prevents the existing Today renderer and its outer workspace from opening duplicate weekly columns. Existing guided planning requests route into the same weekly choices, including on phones.
- Weekly titles open the existing task detail route without scheduling or creating anything. Closing Details restores weekly choices.
- Connected Today/Week/constellation routes opt into shared detail chrome and Open journal spacing through `connected-workspace.css`; standard routes are unchanged.
- Planning map uses the selected period as its heading and actual Symphony type/color tokens. Horizon-zone relationships and freeform entry are preserved.
- Kiosk study uses a separate household dashboard, with recipe/ingredients, grocery handoff, child routine checks, explicit phone/conversation placeholders, and keyboard focus moved to the destination heading. It remains fictional, not the live kiosk.

Verification: 77 relevant tests passed across connected planning, Today, Week journal, shell and details; a subsequent duplicate-view regression passed with all five Today day-plan tests. App/lab TypeScript passed and the production build passed (existing bundle-size and React act warnings remain). Browser confirmed weekly-title details navigation, absence of the duplicate view switch, kiosk recipe checks and basil grocery handoff. Evidence includes `connected-details-workspace.jpg` and `restored-kiosk-workspace.jpg`. No account data was edited during these checks; no deployment occurred.

The full redesign is NOT complete. Today still uses the original calendar/list composition. Before replacing the live kiosk, carry forward `WallMoments` scratchpad, upcoming items, per-child routines, freshness, family question/claim flows and all existing utility sheets—none may be lost because the sample dashboard omitted them. Full Week/Month visual parity, phone detail review, real kiosk integration, and contextual conversation integration remain. Retain original routes until those are tested. The latest user authorizes continuing implementation autonomously; no further design confirmation is needed for the approved direction.

## Continued implementation — connected surfaces and continuity

Implemented in the conversation-first worktree, not deployed:

- The existing horizon rail now carries the connected presentation through Year, Season, Month, Week, and Today. Month/Season route directly to the corresponding map focus. Desktop brand/menu/Inbox navigation retains the workspace on supporting destinations (`workspace=1`), without changing ordinary routes.
- Removed the duplicate map/week navigation row above Today. The one weekly-choices control remains. Today responds to its available column width, stacking its calendar and chosen tasks when a companion is present instead of creating three narrow columns. Weekly choices can scroll independently on desktop.
- Selecting a saved seasonal/monthly/weekly map item exposes **Open details**, using the existing task inspector and all its fields. Browser checked a real monthly milestone in the disposable account.
- The shell conversation receives the selected, visible task's title/notes/id and refreshes tasks after an assistant write. No blanket task-list upload was added. This is existing text-assistant integration, not a claim that natural voice is integrated or tested. Unit checks exclude missing/filtered/unselected entities; existing assistant tests verify context forwarding and mutation refresh.
- The phone conversation remains mounted while hidden, preserving unsent wording when switching to Details and back. The page beneath is inert while it is open, Tab stays inside the modal, and closing restores focus. Browser verified draft retention without sending any message or making an API call. SVG medallion definitions are instance-unique, and phone illustration sizing no longer inherits the global icon-size rule.
- `/wall-v2?view=workspace` is now a **real connected kiosk presentation**, using the existing wall's props, permissions, fetches and action callbacks. It preserves utility sheets, calls, incoming-call handling, notes, upcoming items, questions/claims, routines, recipes and grocery actions. It does not inject sample content into production data. The original `/wall-v2` remains unchanged.
- Kiosk schedule pagination keeps additional rows reachable; notes/upcoming have their own screen. Dinner has a compact ambient card and a preparation takeover retaining ingredient checks, portions, recipe opening and shopping actions. Routine cards expose full child-day access for extra steps. Artwork uses existing place/style/light preferences and spans the footer.

Validation: 119 tests passed together across 15 relevant files, then the additional dinner-preparation regression passed with all 13 wall tests (120 unique tests total). The final Today navigation simplification passed all four Alongside tests. App/lab TypeScript and production build passed before the final CSS/navigation simplification; app TypeScript rechecked afterward. Existing React act warnings, old browser-data warnings and bundle-size warnings remain. Use `NODE_OPTIONS=--no-experimental-webstorage` for Vitest on this installed Node version; its experimental global storage otherwise masks jsdom storage. `git diff --check` passes.

Browser evidence: `connected-map-details.jpg`, `connected-phone-conversation.jpg`, `connected-kiosk-populated.jpg`. The populated kiosk screenshot uses `scripts/connected-wall-check` (explicit TEST DATA, no saves); the signed-in kiosk was separately checked for real scratchpad access. No new account data, outbound calls, AI requests, schema changes or deployment during this continuation.

Remaining boundaries: these are opt-in connected routes, not production defaults. The natural-voice prototype remains separate, and comprehensive spoken-command integration is still outstanding. Recipes/routines/supporting destinations keep their established functional pages; they have not all received bespoke layout rewrites or exhaustive live regression testing. Do not describe this as the entire conversation-first product being finished. The user's authorization to continue autonomously remains in force.

Final check for this continuation: production build passed again after Today column adaptation and navigation consolidation; app TypeScript and `git diff --check` also pass. `connected-today-consolidated.jpg` captures the signed-in Today view. Phone browser check verified an unsent draft survives Details → Conversation; the test draft was then cleared without sending. No production release was made.

### Kiosk visual correction after review

The first connected wall fixture was rejected: stretching the main row created giant empty panels and the image-less dinner card became a dark slab. Replaced this with content-sized schedule/dinner columns, larger schedule typography, warm dinner treatment with a neutral plate illustration when no recipe photo exists, routine tiles, and undistorted scenery across the footer. Existing callbacks and takeovers remain intact. Checked wide/tall, compact landscape (no root overflow), and narrow stacking. Evidence: `living-canvas-evidence/connected-kiosk-revised.jpg` (sample fixture, not real household data). Wall tests: 13 passing; app TypeScript passes. Local only. Other moment contents still use existing WallMomentContent; this is not completion of the broader conversational product.

Dark kiosk followup: connected view now follows the existing `.dark` wall shell and its saved theme toggle. Warm ink, brown surfaces and gold accents match wallTheme.ts. Dark mode uses nighttime scenery when lighting is automatic, preserves explicit lighting choices, and dims the footer. Test fixture offers a local-only Light view/Dark view switch; no preference writes. Both appearances visually checked. 13 wall tests and app/lab TypeScript checks pass. Evidence: living-canvas-evidence/connected-kiosk-dark.jpg. Not deployed.

### Approved kiosk composition connected

ConnectedWall now mirrors the workspace Kiosk structure: brand and household utilities share the header; date/title and clock/weather form a separate heading; schedule and dinner use the 1.6:1 composition; the family question lives beneath the schedule; large initial/avatar family tiles open the existing child routine view. Coming up opens the existing notes/upcoming takeover. Reused the study's abstract plate motif when a recipe has no image, with dark adaptation. Recipe preparation and schedule pagination remain available. Updated regression checks to verify tile-to-child-view navigation instead of removed inline routine controls; the original wall's checklist tests remain intact. 13 tests and app TypeScript pass; production build passes. Visual checks: 1280×720 has no kiosk-root overflow, large view and 390px stacked view inspected. Evidence: living-canvas-evidence/kiosk-reference-connected.jpg. Local, not deployed. Non-dinner moments still retain their original functional content.
