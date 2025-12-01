# Task Scheduling - Week 5

Add date/time assignment to tasks so they appear in time-based sections alongside calendar events.

## Plan

### What We're Building

**Scheduled Tasks** — Tasks can have an optional scheduled time:
- `scheduledFor` field on Task (Date or null)
- Tasks with times appear in Active Now/Coming Up/Later Today
- Tasks without times stay in the Tasks (unscheduled) section

**UI for Scheduling** — In the ExecutionCard edit mode:
- Date picker to set the scheduled date
- Time picker to set the scheduled time (optional - can be date-only)
- Clear button to unschedule

### Architecture

1. **Update Task type** — Add `scheduledFor?: Date` field
2. **Update useLocalTasks** — Handle scheduledFor in updates
3. **Update taskToTimelineItem** — Use scheduledFor as startTime
4. **Update ExecutionCard** — Add date/time picker in edit mode
5. **Update time utilities** — Handle date-only scheduling (no specific time)

### Notes

- Date-only tasks (no time) should appear in "Later Today" or at a default time
- Keep it simple: native HTML date/time inputs first, fancy picker later if needed
- The dashboard grouping already works - we just need to pass the time through

## Todo

- [x] Add `scheduledFor` field to Task type
- [x] Update taskToTimelineItem to use scheduledFor
- [x] Add date/time picker UI to ExecutionCard edit mode
- [x] Handle "clear schedule" to make task unscheduled again
- [x] Write tests for scheduled task behavior
- [x] Manual testing with real tasks

## Review

### What Changed

**Modified Files:**
- `src/types/task.ts` — Added `scheduledFor?: Date` field
- `src/types/timeline.ts` — Updated `taskToTimelineItem` to use `scheduledFor` as `startTime`
- `src/components/ExecutionCard.tsx` — Added datetime-local picker with 15-min increments and Clear button in edit mode
- `src/components/ExecutionCard.test.tsx` — Added 4 tests for scheduled task behavior
- `src/hooks/useGoogleCalendar.ts` — Fixed CalendarEvent interface to support both snake_case and camelCase field names

### Key Features

1. **Scheduled Tasks** — Tasks can now be assigned a date/time via the edit mode
2. **Time-based Grouping** — Scheduled tasks appear in Active Now/Coming Up/Later Today alongside calendar events
3. **15-minute Increments** — Time picker uses step="900" for 15-min intervals
4. **Clear Schedule** — Button to unschedule a task and move it back to Tasks section
5. **Calendar Event Fix** — Fixed Invalid Date issue by handling both snake_case and camelCase field names

### Test Coverage

- 56 tests total (all passing)
- 4 new tests for scheduling behavior
