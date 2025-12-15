# Remove Drag Handles from Today View

## Change
Remove the drag handle hover behavior from ScheduleItem in the Today view.

## File to modify
`src/components/schedule/ScheduleItem.tsx`

## What to remove
- Remove the drag handle element (the grip icon that appears on hover)
- Remove any drag-related CSS/classes
- Keep the card otherwise unchanged

## Rationale
- SchedulePopover provides the same functionality with explicit clicks
- Drag is fiddly on mobile
- Reduces complexity and maintenance burden
- PlanningSession can keep its drag functionality for dedicated planning mode
