# Symphony canvas: foundation and feature preservation

Status: design contract and source inventory, October 9, 2026. This document does not assert that the scripted canvas already implements these features. No production behavior changes in this pass.

The surface-specific design decisions are now recorded in [the coordinated design study](2026-10-09-symphony-design-study.md). Shared planning structure does not imply shared navigation: desktop rail, phone title picker/dock, and wall moments retain their different roles.

## The foundation

The canvas builds on Year → Season → Month → Week → Today. A full guided session handles all yearly intentions, then seasonal milestones across those intentions, then monthly priorities, one combined weekly plan, and daily execution. It must not take one intention all the way to Today before returning for the next.

People can start at any period, enter independent items, link them later, or stop and resume. Existing plans remain visible and editable. Completing a daily action does not complete its broader intention. Review offers deliberate decisions about unfinished work; it does not silently move everything forward.

Conversation guides the existing planning system. It does not create a separate set of plans. Voice, typing, and direct manipulation must operate on the same saved items and connections.

## A recognizable Symphony

Keep the Nordic Journal typography, palette, familiar period navigation, clear dates, and visible audience/filter state. Keep stable destinations for planning and household tools. Adapt the central content to the current activity without relocating basic controls on every request.

Web, desktop, phone, and wall share concepts and saved state. Phone stacks content with explicit navigation; the wall uses readable, touch-friendly shared content. Private content must be excluded before wall rendering, including counts and conversational responses. A “Household only” label is not access control.

Recipes, calling, capture, and direct editing must work without starting a conversation. Changing focus must preserve drafts, cooking state, timers, and the user's return location.

## Existing workflows to preserve

Recipes and kidsPhone are explicitly identified by Scott as frequently used. Other rows are source-discovered capabilities, not claims about usage frequency.

kidsPhone is a separate telephony project loosely attached to Symphony, not a core Symphony subsystem or a children's mobile layout. Preserve its existing integration and access from the kiosk. The canvas work must not absorb, redesign, or reimplement the telephony project; shared access points do not imply shared ownership or architecture.

| Workflow | Existing source and behavior | Canvas requirement |
| --- | --- | --- |
| Planning | `src/lib/voiceOnboarding/flow.ts`, existing period pages: connected periods, independent capture, checkpoints | Persistent Year/Season/Month/Week/Today orientation; reuse existing entities and selectors; show broader context alongside entry; retain freeform entry |
| Recipe browsing | `src/components/wall-v2/WallV2RecipeSheet.tsx`: large alphabet touch keys, nine-tile pages, retained search query | Dedicated Recipes destination; retain touch browsing and return to search after cooking |
| Cooking | `src/components/wall/WallRecipeViewer.tsx`: ingredients, checks, steps, adjacent-day meal navigation | Reuse cooking view; readable at wall distance; preserve ingredient progress when changing conversational focus; reset appropriately when recipe changes |
| Dinner and groceries | `src/components/wall-v2/WallV2Strip.tsx`, `WallV2Shell.tsx`: dinner entry, dedicated recipe tile, direct Groceries button | Meal card opens real recipe; groceries remain one tap away; do not bury either under chat or utilities |
| kidsPhone | `src/components/wall-v2/WallV2PhoneScreen.tsx`: favorite/contact photos, confirmation before `placeCall`, receiver status, quiet-hours and failure feedback, cancellation protection | Explicit kidsPhone destination; reuse actual calling workflow; never place a call from a vague conversational suggestion |
| Active calls | `src/components/wall-v2/CallerIdTakeover.tsx`: incoming/outgoing full-screen call state | Preserve call priority over conversation, clear controls, and return location; verify end-call behavior through its existing hook before integration |
| Kids' day and reading | `src/components/wall-v2/KidDayView.test.tsx`, `useReadingScreenTime.ts`: routines, tasks, homework, reading timer and screen-time progress | Retain child-specific destinations and controls; switching canvas focus cannot lose timer or completion state |
| Shared notes | `src/components/wall-v2/WallV2ScratchpadSheet.test.tsx`: rapid capture, talk-about decisions, inbox routing, reopen | Keep quick capture and provenance; do not turn every note into a planning conversation |
| Household controls | `src/components/wall-v2/WallV2UtilitySheet.tsx`, `WallV2StaleBanner.tsx`: guest mode, theme, routines visibility, stale-data feedback | Preserve privacy and freshness controls; distinguish unavailable/stale data from an empty plan |

The broader application registry (`src/shell/appRegistry.ts`) also includes lists, contacts, documents, notes, discussions, routines, history, family, and settings. These remain reachable; this inventory does not replace a full feature audit of each destination.

## Gaps in the current rehearsal

`scripts/canvas-lab` demonstrates a stable daily shell and responsive layouts using fictional in-memory content. It does not yet expose the five-period planning foundation, real recipes, kidsPhone, reading timers, authentication, shared persistence, or live conversation. Its dinner sample is not the recipe feature; its phone layout is not kidsPhone.

`scripts/conversation-lab` rehearses guided planning using the existing flow reducer. These two rehearsals need a coherent shared navigation design before production integration. The canvas's four sample cards are an illustrative daily composition, not a permanent restriction on Symphony's capabilities.

## Implementation order

1. Put stable period navigation and direct household destinations into the reviewed canvas design. Clearly distinguish functioning rehearsals from integration placeholders.
2. Connect the planning experience through existing selectors and mutations, retaining IDs, dates, broader links, permissions, and independent entries. Show proposed changes before applying them; retain text on failed saves.
3. Reuse existing recipe, groceries, and child-day components through the common shell. Preserve the existing kidsPhone integration as a connection to the separate telephony project. Adapt layout without rewriting behavior, expanding the telephony integration, or duplicating data.
4. Connect optional conversation to the same explicit operations. Preserve direct use when microphone, network, or model service is unavailable.

## Acceptance checks before release

- Complete several intentions one period at a time; resume after reload; start at Month or Week; add an unlinked item and connect it later.
- Move a weekly task to Today without losing its parent connection; complete it without completing its parent; deliberately revisit unfinished work during review.
- Open Recipes directly, search, cook, check ingredients, visit conversation, and return without losing context. Check wall touch targets and phone readability.
- Open kidsPhone directly, choose a contact, cancel confirmation, and exercise mocked quiet-hours/failure/late-response cases. Real calling and handset checks require an explicitly coordinated test, not unsolicited calls.
- Keep reading-timer state and kid-day progress through navigation and reload using existing persistence contracts.
- Verify authorized shared versus private content with real accounts before release; mocked fixtures alone cannot establish privacy.
- Check keyboard navigation, focus return, reduced motion, narrow screens, stale/offline states, failed saves, and direct operation without conversation.

This pass is documentation based on source inspection. No new runtime tests or hardware calls were performed for it.
