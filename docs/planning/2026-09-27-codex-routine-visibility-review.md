# Review of 9830ae80

The Sunday example is addressed, but the implementation does not yet meet Scott's subsequent clarification that positively checked Show in Today should automatically show due routines.

Changes requested and submitted to the existing Claude session:

- Daily and explicit multi-day weekly rules name due days too. Do not treat weekly Saturday AND Sunday as the distinct flexible weekend window. Preserve recurrence frequency and instance identity.
- Explicit Show in Today should take priority over generic hide-daily suppression while respecting due dates, pauses, skips, deferrals, privacy and person/domain filters. Inspect default/null semantics and document ambiguity; no user-record migration to manufacture intent.
- Align Week journal and Schedule with Today for due untimed routines, without inventing times or duplicating occurrences.
- Fix helper copy claiming daily/multi-day routines have no set day.
- Cover these with isolated regressions and rendering evidence. No production edits or deployment authorized.

Feedback submission was confirmed in VS Code; Claude resumed processing. This review is not release approval.
