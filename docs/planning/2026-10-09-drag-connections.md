# Drag connections

Small connection points on planning cards support dragging in either direction to a card in an adjacent horizon. Eligible targets are highlighted; pointer movement draws a temporary line. Branch focus temporarily reveals all authorized cards during the gesture, then returns after cancellation or focuses the newly connected child after success. Escape, pointer cancellation and window blur cancel. Existing link picker remains available; tapping a child connection point opens it.

Only goalId (season/year) or sourceId (month/season, week/month) changes. No scheduling or content writes. Same-record adjacent appearances and invalid/missing/filtered endpoints are rejected. Undo restores only the field changed, and refuses to overwrite a subsequent observed link change. Failed writes retain the plan and show retry feedback. Undo is session-local and does not survive reload.

Selected-branch lines follow column scrolling and layout resizing. Offscreen endpoints are omitted; phone uses the picker and omits resting connection lines across stacked cards. Kiosk and voice unchanged.

Validation: regression tests cover both directions, non-adjacent/self/filtered endpoints, same-record appearances, real pointer save and Undo, failed save, Escape, and revealing hidden eligible parents. Local authenticated disposable-account browser drag successfully changed a seasonal goal's parent. Undo restored its previous parent and survived a full reload. Desktop connector alignment checked; 390px phone connection-point tap opened the full picker with reachable Save/Cancel. Screenshot /private/tmp/symphony-drag-links.png. No production account writes during validation.
