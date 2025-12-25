# Planning & Inbox Management

**Priority**: HIGH
**Status**: Ready for implementation
**Spec**: tasks/implement-planning-inbox.md

## Summary

GTD-style inbox workflow with intentional scheduling vs. deferral.

- **Schedule** = commitment, appears in task list
- **Defer** = punt, cycles back through inbox

## Key Features

1. Triage card with auto-collapse after capture
2. Today view split: Tasks (scheduled) + Inbox (needs triage)
3. Defer tracking with badge for chronic punters
4. Weekly Review button for focused inbox processing

## Data Changes

- Rename `due_date` → `scheduled_date`
- Add `deferred_until` (date)
- Add `defer_count` (integer)

## Phases

1. Data model migration
2. Query logic (inbox vs scheduled)
3. Schedule & Defer actions
4. Today view restructure
5. Triage card with auto-collapse
6. Weekly Review modal
