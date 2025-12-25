# Embedded Itineraries: Context as Cards

**Date:** 2025-12-25
**Status:** Exploration / Not yet approved

## Core Insight

The travel project has an itinerary feature where steps get intelligently placed on the timeline for relevant days. **What if every timeline node could have an embedded itinerary?**

Instead of timeline items being simple tasks, they become **containers for contextual cards** that surface the right information at the right time.

## The Shift

| Current Model | Proposed Model |
|---------------|----------------|
| Task = form with fields (notes, phone, contact, links) | Task = container for contextual cards |
| DetailPanel = form editor | DetailPanel = itinerary viewer/builder |
| Context is in fields | Context is in themed cards |

## Example: "Call Tony the Painter"

**Current approach:**
```
Task: Call Tony re: trim finish time
├─ contact_id: tony-painter-uuid
├─ phoneNumber: "555-0123"
├─ notes: "Don't forget: needs second coat in guest room"
└─ project_id: painting-kids-room-uuid
```

**Embedded itinerary approach:**
```
Task: Call Tony re: trim finish time
└─ Itinerary:
   ├─ Contact Card (Tony the Painter)
   │  └─ Actions: Call • Message • Email
   ├─ Notes Card (from painting project)
   │  └─ "Don't forget: needs second coat in guest room"
   └─ Project Card (Painting Kid's Room)
      └─ Quick link to full project context
```

## Key Questions

### 1. UI Evolution or New Functionality?

**Option A: Just better presentation**
- Same data model (contact_id, notes, phoneNumber, links, project_id)
- Different UI: cards instead of form fields
- Makes existing context more scannable and actionable
- **Not scope creep** — just better UX for existing features

**Option B: New card system**
- Template system for different card types
- Reorderable/customizable cards
- Card-specific logic beyond current fields
- **This IS scope creep** — new feature set

### 2. What Card Types Make Sense?

Based on existing data model:
- **Contact Card** → contact_id + phoneNumber
- **Notes Card** → task.notes or inherited from project
- **Links Card** → links array (product links, docs, reservations)
- **Project Card** → project_id reference with quick actions
- **Subtasks Card** → future, but natural fit

Potential new cards (scope creep territory):
- Files/attachments
- History/activity
- Checklist templates
- Custom cards

### 3. Applicability Across Entity Types

Could this pattern work for:
- ✅ **Tasks** — "Call Tony" has contact + notes + project cards
- ✅ **Projects** — Trip project has itinerary cards (already implemented)
- ✅ **Calendar Events** — Event has agenda + attendees + links cards
- ❓ **Routines** — Less clear, routines are templates not instances

### 4. Implementation Path

**If we pursue this:**

**Phase 1: Prototype with existing data**
- Render DetailPanel as cards instead of form fields
- No new data, just UI reorganization
- Test: does this actually improve UX?

**Phase 2: Refine card interactions**
- Card-specific actions (call contact, open link, etc.)
- Collapsible cards for long content
- Add/remove cards based on context presence

**Phase 3 (future): Extensibility**
- Template system if needed
- Custom card types
- User-configurable layouts

## Alignment with Product Philosophy

**From CLAUDE.md:**
> "The core insight: captured information doesn't surface at the right time with the right context. Symphony fixes this by making **context first-class**."

This proposal doubles down on that philosophy by:
- Making context more visible (cards vs. buried form fields)
- Making context more actionable (card-specific actions)
- Surfacing related context together (project notes + contact + links in one view)

## Open Questions

1. Is the "itinerary" metaphor too travel-specific?
2. Would users find cards more scannable than a traditional form?
3. How do cards work on mobile vs. desktop?
4. Do cards make editing context harder or easier?
5. Should cards be the *only* way to interact with task context, or one option?

## Decision: Parked for Now

This feels like a natural evolution of the existing architecture, but needs more thought before committing to implementation. Key things to clarify:

- Is this primarily a UI/UX improvement or a feature expansion?
- What's the minimum viable version that validates the concept?
- Does this actually make the app simpler and more useful, or just different?

---

**Next steps when we revisit:**
1. Mock up "Call Tony" example in Figma/sketch
2. List out which card types are must-have vs. nice-to-have
3. Decide if this is V1.6, V2.0, or later
