# Planning card triage

Each planning-map card now has a visible ellipsis menu. Season, Month and Week use the shared scheduling vocabulary (Today, Week, Month, Someday and a date/time picker), completion/reopen, carry to the next viewed period, remove from the viewed period, wording and details. Yearly intentions offer completion/reopen and archive using the Goal model. Delete is explicitly confirmed and warns that it affects all periods.

Scheduling uses the existing domain-gated task writers. Carry-forward treats a missing task ID as failure; rejected writes do not claim success. Menu interactions do not focus a branch or initiate a connection drag. The shared popover wraps controls and expands its submenus within viewport limits.

Validation:
- Production build passes.
- Focused tests cover existing create/link/drag behavior, triage focus isolation, failed carry and scheduling, period removal arguments, reopen and yearly archive.
- Signed-in disposable onboarding account: completed Journal test picnic activities, reloaded and observed Reopen; reopened to restore its prior state.
- Desktop and 390px phone menu inspected; phone clipping fixed.
- Screenshot: /private/tmp/symphony-planning-triage.png.
- Permanent deletion was not exercised against account data.
