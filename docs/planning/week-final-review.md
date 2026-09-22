# Week final review — September 22, 2026

Local branch: codex/planning-chooser-cleanup. Application changes not deployed.

The Week page separates weekly task commitments from dated work, and its Shelves show one source at a time. Month references retain tasks already on the week under a disclosure. Earlier excludes tasks already committed to the displayed week. Routines are occurrence-specific.

Final review fixes:
- Keep the weekly list visible in Schedule as well as Journal.
- Preserve the flexible weekend setting when undoing a date change; do not offer undo after a cancelled time placement.
- Preserve the displayed week and layout when opening, switching, or closing details.
- Reset the week task composer when navigating weeks; distinguish non-current empty lists.
- Use the displayed week's current/non-current status when recognizing legacy commitments in Shelves.

Validation: 802 tests passed, 3 skipped in the broader affected suite. Additional focused runs passed for the new undo/cancellation and navigation regressions. TypeScript and production build passed. Live review confirmed the weekly list survives switching to Schedule. Development hot-reload produced a stale SelectionProvider context; restarting the preview server recovered it.

Next: Today. Retain direct entry, a separate untimed task list and schedule, and Shelves limited to this week's tasks and relevant routine occurrences. Apply the Week header hierarchy and tighten competing controls before moving on to Month, Season, and Year.
