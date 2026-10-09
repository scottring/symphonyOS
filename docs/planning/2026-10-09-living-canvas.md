# Symphony Living Canvas

October 9, 2026 · local scripted interaction study · not deployed

Preview: http://127.0.0.1:5245/scripts/living-canvas/index.html

## Agreed direction

Conversation is the primary interface. The canvas responds as the conversation unfolds, composing a deliberately designed visual library. Symphony retains its typography, palette, recognizable objects, relationships, and orientation. The same intention changes emphasis and shape across periods; changing subject brings a different composition forward without losing the plan.

This supersedes a conventional page with chat beside it. The earlier surface study still documents features to preserve, not the final interaction model.

## Rehearsal

Use the suggested phrases or type their equivalents. Start with the year, then season, month, week, and today. All four sample intentions travel together through each period. Click an item to edit it. Add an independent entry without requiring a parent; a new yearly intention receives blank downstream fields rather than invented answers.

Try “What’s for dinner?”, “Show the recipe”, and “Back to our planning conversation”. The recipe becomes the focus; returning restores the exact planning period and edits. Review the connected plan and explicitly choose Save sample plan. Exploring does not save.

The narrow-canvas toggle tests the compact composition. The conversation stays available while the workspace scrolls. Motion respects reduced-motion preferences.

## Implementation boundary

The scene library allows invitation, intention field, milestone groups, connected plans, action clusters, day composition, plan thread, meal focus, and cooking focus. Stable entity IDs preserve relationships. Conversation, canvas focus, draft data, and saved snapshot are separate concepts.

This uses deterministic phrase matching, not a live language model. Unknown input has an explicit fallback. Microphone capture is not connected. Optional spoken replies use a local English browser speech voice only; the current test browser had none available, so audible output remains unverified. No API spending, authentication, database writes, or persistence across reloads.

## Production architecture to develop next

A live conversation adapter should request allowlisted scene/component descriptors referencing authorized existing entities. Validate these before rendering. Do not render model-generated arbitrary HTML or JSX. Domain mutations must use the existing app services, with explicit save semantics, failure recovery, and duplicate prevention; a view-change event is never a domain mutation.

Retain breadth-first Year → Season → Month → Week → Today planning, optional connections, direct editing, resume, and freeform entries. Build shared visual primitives with surface-specific composition for desktop, phone, and wall. A wall requires shared-context privacy rules upstream; private work or personal plans must not appear merely because a conversation mentions them. Recipes, groceries, and routines remain functional destinations. kidsPhone stays a separate telephony integration.

Next work: review the feel of this rehearsal, then connect one complete live conversational journey to validated scene selection and existing planning services. Test interruption, correction, ambiguous intent, failed saving, accessibility, and real phones before broadening. This prototype does not establish release readiness.

## Verification

- TypeScript: `npx tsc -p tsconfig.lab.json` passed.
- Model: seven tests passed via `npx vitest run --config scripts/living-canvas/vitest.config.ts`.
- Lint: no errors; one existing-style Fast Refresh warning for the standalone entry component.
- Browser: Year through Today and summary, explicit save, direct monthly edit, cooking detour/return with edit retained, and compact composition checked.
- Model tests cover view-only transitions, all-goal continuity, new intentions, return context, immutable saved snapshot, Today selection, and unknown phrases.
- Compact desktop-width simulation checked; actual phone/device testing remains outstanding.
- Evidence: `living-canvas-evidence/welcome.jpg`, `dinner.jpg`, `summary.jpg`, `compact.jpg`.

## Resting-view extension

Added a stable sample home, explicit context selector, Family-only wall composition, routine occurrence versus standing-pattern choices, a suggested connection with an independent alternative, and a simulated contact call. Continue conversation restores the conversation canvas; returning to rest preserves the local example state. Context changes return to the appropriate home rather than retaining a contact from another context. These are local interaction examples, not permission enforcement or telephony integration. Surface selection is illustrative; full device-specific layouts remain to develop. TypeScript and seven existing model tests pass; those tests do not cover the new local routine/calling controls. Desktop visual inspected.
