# Month, Season, and Year layout — September 22, 2026

The broader horizons now use the same visual hierarchy as Week and Today:

- Goals lead in a quiet card with a question specific to the horizon; direct goal entry remains available.
- Month and Season tasks sit below goals. Tasks without a lower commitment appear first; tasks already assigned to a week, month, or day remain in a separate fold with their placement labels. Expanding the available-task preview does not affect that fold.
- Completed goals have their own fold; completed tasks retain the existing completion fold. Past periods show completed goals for review.
- Shelves supports the plan with the broader horizon, relevant slower routine patterns, and dated tasks. Year remains a goals page.

This changes presentation, not placement or carry-forward rules. The existing planning session remains optional. No task data was changed during verification.

Verified Month, Season, and Year at desktop and 390px width. Planning component and selector suite: 171 tests passed. Production build passed.

## Shared Shelves follow-up

Month, Season, and Year now render contextual reference content into the same
optional left dock as Today and Week. The Shelves button opens/closes that dock;
phones use the shared sheet. The content stays anchored to the displayed period.
The page retains a single main column when shelves are closed.

Headings name the horizon (Month goals / Month tasks, Season goals / Season tasks,
Year goals), leaving the dated period name in the page title.

Verified desktop navigation across all three horizons and phone open/close.
Updated suite: 221 tests passed; production build passed.
