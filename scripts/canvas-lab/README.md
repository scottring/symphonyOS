# Responsive Symphony canvas rehearsal

Run the worktree's Vite server; open `/scripts/canvas-lab/index.html`.

## Design contract

One stable shell, shared vocabulary and four fixed card types across web/desktop, phone and wall. Requests change the date and emphasis, not the identity of the workspace. Returning to Today preserves preparation work. Phone separates conversation and canvas with explicit tabs; wall uses larger household-only content. Layout switches preserve the same in-memory state.

## Functional rehearsal

- Start on Today; choose Get ready for tomorrow.
- Inspect suggestions and their reasons. They are not yet plan items.
- Select suggestions and add explicitly; repeat additions cannot duplicate items.
- Add independent preparation tasks; complete items; undo suggested additions without clearing independent tasks.
- Return to Today, switch surfaces, inspect an event and close its keyboard-accessible dialog.

All fixtures are fictional; illustrative dates/forecast are fixed. No authentication, database, microphone or AI calls. Arbitrary text gets an honest unsupported-rehearsal response. All changes disappear on reload. Household-only scope demonstrates a presentation requirement, NOT verified access-control implementation.

Next: review the continuity of the UI with Scott before integrating into the product or connecting live conversation. Privacy filtering must occur upstream of the wall renderer when connected to real data.
