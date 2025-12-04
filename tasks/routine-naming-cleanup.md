# Routine Naming Cleanup

**Date:** 2025-12-04
**Priority:** Medium
**Status:** Not Started
**Depends on:** family-assignment-refinements.md

---

## Problem

With family assignment avatars now on routine cards, having the person's name in the routine title is redundant:

- "Iris walks Jack" + Iris avatar = saying "Iris" twice
- "Scott walks Ella and Kaleb to school" + Scott avatar = saying "Scott" twice

## Solution

Routines should describe **the action**, not the actor. The avatar IS the actor.

**Before:**
| Title | Assignee |
|-------|----------|
| Iris walks Jack | Iris |
| Scott walks Ella and Kaleb to school | Scott |

**After:**
| Title | Assignee |
|-------|----------|
| Walk Jack | Iris |
| Walk kids to school | Scott |

## Benefits

1. Cleaner display — shorter titles, less visual noise
2. Simpler parsing — no need to extract names from natural language
3. Consistent pattern — tasks don't have name prefixes, neither should routines
4. Flexible reassignment — if Iris is sick, reassign to Scott, title still works

## Implementation

### Option A: Manual cleanup
- User edits existing routines to remove names
- Going forward, user enters action-only titles

### Option B: Smart input
- NL parser still accepts "Iris walks Jack at 7am"
- Extracts "Iris" → assignment field
- Stores "Walk Jack" → title field
- Strips subject pronoun, keeps action + object

### Recommendation

Start with Option A. If users consistently type names in routine input, consider Option B as enhancement.

## Tasks

- [ ] Review existing routines in database, identify ones with names
- [ ] Decide: manual cleanup or migration script
- [ ] Update any NL parsing examples/docs to show action-only format
- [ ] Consider: should input placeholder guide users? e.g. "What needs to happen?"
