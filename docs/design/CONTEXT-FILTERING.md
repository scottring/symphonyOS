# Context Filtering Design (Draft)

**Status:** Early discussion - needs more thought  
**Created:** Dec 6, 2025

## Problem

Tasks have three contexts: `work`, `family`, `personal`. Currently all tasks show on the home page regardless of context. Scott needs:
- A private view for work/personal tasks
- A shared "family hub" view safe for shared screens
- An "all" view for full planning visibility

## Proposed View Modes

| View | Shows | Use Case |
|------|-------|----------|
| **All** | Everything | Full planning picture |
| **Family** | Only family context | Shared screens, when kids around |
| **Work** | Only work context | Focus mode |
| **Personal** | Only personal context | Focus mode |

## Open Questions

### 1. Default context for untagged tasks?
Options discussed:
- `personal` (safe - nothing leaks to family view)
- `family` (collaborative by default)
- None (shows in All only until tagged)

**Leaning toward:** `personal` for safety

### 2. Auto-inference of context?
Possible signals:
- Task assigned to family member → auto `family`
- Task linked to project → inherit project's context
- Calendar event linkage

**Question:** Should projects have a context field that tasks inherit?

### 3. Work vs Personal distinction
Is it just project-based? Or are there standalone work tasks without projects?

## Next Steps
- [ ] Decide on default context behavior
- [ ] Decide if projects need context field
- [ ] Design the UI toggle placement
- [ ] Implementation plan

## Notes
Infrastructure already exists:
- `TaskContext` type: `'work' | 'family' | 'personal'`
- `ContextPicker` component exists
- `context` field on Task type
- Just need filtering logic and view mode state
