# Responsive Symphony canvas rehearsal

**Superseded design direction.** Scott rejected the universal rail and tool row on October 9. Continue with `scripts/symphony-design-study`, grounded in the existing surface-specific navigation. This experiment remains for reference only.

Run the worktree's Vite server; open `/scripts/canvas-lab/index.html`.

## Design contract

The governing [foundation and feature-preservation contract](../../docs/planning/2026-10-09-conversational-canvas-preservation.md) keeps Year → Season → Month → Week → Today central and records the existing recipes, kidsPhone, and household workflows that integration must preserve. This daily rehearsal does not yet implement that full scope.

One stable shell, shared vocabulary and four fixed card types across web/desktop, phone and wall. Requests change the date and emphasis, not the identity of the workspace. Returning to Today preserves preparation work. Phone separates conversation and canvas with explicit tabs; wall uses larger household-only content. Layout switches preserve the same in-memory state.

## Functional rehearsal

- Start on Today; choose Get ready for tomorrow.
- Inspect suggestions and their reasons. They are not yet plan items.
- Select suggestions and add explicitly; repeat additions cannot duplicate items.
- Add independent preparation tasks; complete items; undo suggested additions without clearing independent tasks.
- Return to Today, switch surfaces, inspect an event and close its keyboard-accessible dialog.

All fixtures are fictional; illustrative dates/forecast are fixed. No authentication, database, microphone or AI calls. Arbitrary text gets an honest unsupported-rehearsal response. All changes disappear on reload. Household-only scope demonstrates a presentation requirement, NOT verified access-control implementation.

Next: review the continuity of the UI with Scott before integrating into the product or connecting live conversation. Privacy filtering must occur upstream of the wall renderer when connected to real data.

## Planning navigation rehearsal

The stable rail now opens Year, Season, Month, Week, and Today. Sample journal rows show the preceding period beside current entries, with an independent entry section and a whole-period Continue button. Submitted entries survive navigation within this session, but not reload. Unsubmitted drafts are not retained when changing periods. New entries do not yet propagate into the next period; relationships are illustrative fixtures.

Recipes, Groceries, Family routines, and kidsPhone are explicitly labeled destination previews. They explain integration intent without accessing accounts or placing calls. kidsPhone remains a separate connected telephony project.

Validation: TypeScript passed; desktop and simulated phone journal layouts visually inspected. Production integration, live conversation, and cross-period persistence are not implemented in this rehearsal.
