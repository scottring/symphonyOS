# Review of 9830ae80

The Sunday example is addressed, but the implementation does not yet meet Scott's subsequent clarification that positively checked Show in Today should automatically show due routines.

Changes requested and submitted to the existing Claude session:

- Daily and explicit multi-day weekly rules name due days too. Do not treat weekly Saturday AND Sunday as the distinct flexible weekend window. Preserve recurrence frequency and instance identity.
- Explicit Show in Today should take priority over generic hide-daily suppression while respecting due dates, pauses, skips, deferrals, privacy and person/domain filters. Inspect default/null semantics and document ambiguity; no user-record migration to manufacture intent.
- Align Week journal and Schedule with Today for due untimed routines, without inventing times or duplicating occurrences.
- Fix helper copy claiming daily/multi-day routines have no set day.
- Cover these with isolated regressions and rendering evidence. No production edits or deployment authorized.

Feedback submission was confirmed in VS Code; Claude resumed processing. This review is not release approval.

## Re-review of f9a814fd

No remaining blocker found in this scoped code review. Due daily and explicit multi-day recurrences now join Sunday-only routines on Today, with matching Week journal/all-day rendering. Flexible weekend windows remain distinct. Positively true Show in Today overrides the generic hide-daily sweep on a concrete due day, while recurrence and accessibility filters run first.

Independent verification: 205/205 tests passed across nine files: dayPlan, TapRoutinePanel, dueRoutineParity, WeekViewV2, weekDensity, weekRoutineChoices, statusMaps, routineUtils.resolveRoutine and routineVisibilityCoverage. Claude's broader suite and local browser acceptance are reported in the handoff; not independently rerun here.

Release behavior to disclose: stored Show in Today defaults to true, so prior default-on routines also appear automatically when due, and generic Hide daily will not hide those. This matches Scott's latest stated precedence but is broader than fixing Water houseplants alone. No records need changing and no migration is proposed. Ready for deployment approval; review itself does not authorize push/merge/deploy.
