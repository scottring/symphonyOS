# Feature: Default Assignee to Current User

## Change
When a user creates a task, event, or any assignable item, automatically assign it to themselves by default.

## Behavior
- New task → assignee = current user
- User can still change assignee after creation
- Applies to: quick add, detail panel creation, inbox items

## Implementation
Find task creation logic and set `assigneeId` (or equivalent field) to current user's family member ID by default.

## Files likely affected
- Task creation hooks/functions
- Quick add component
- Any "new task" forms
