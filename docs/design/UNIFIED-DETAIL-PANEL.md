# Design Spec: Unified Detail Panel for Desktop Tasks

**Date:** December 6, 2025  
**Priority:** High  
**Context:** Currently, tasks on desktop open a full-page TaskView, while events/routines open a side DetailPanel. This creates an inconsistent user experience. We want to unify on the side panel approach while preserving the visual hierarchy improvements from TaskView.

---

## Design Goal

Make task clicks on desktop open the **side DetailPanel** (consistent with events/routines) while porting the **card-based section design** from TaskView to create clear visual hierarchy.

---

## Current State Analysis

### TaskView (full page) - What's Good
- **Card-based sections**: Each section (When, Contact, Project, Notes, Links, Subtasks) is wrapped in a white card
- **Consistent section styling**: 
  ```css
  .section-card {
    background: white;
    border-radius: 0.75rem;       /* rounded-xl */
    border: 1px solid #f5f5f5;    /* border-neutral-100 */
    padding: 1rem;                /* p-4 */
  }
  .section-header {
    font-size: 0.875rem;          /* text-sm */
    font-weight: 500;             /* font-medium */
    color: #737373;               /* text-neutral-500 */
    text-transform: uppercase;
    letter-spacing: 0.05em;       /* tracking-wide */
    margin-bottom: 0.75rem;       /* mb-3 */
  }
  ```
- **Clear spacing**: `space-y-6` between sections
- **Large editable title** with inline checkbox

### DetailPanel (side) - Current Issues
- Uses flat `border-b` dividers instead of card containment
- Less visual hierarchy
- Content feels loosely connected
- BUT: Has features TaskView lacks (ActionableActions, DirectionsBuilder, RecipeSection)

---

## Design Direction

**Aesthetic**: Clean, functional, card-based hierarchy. Symphony's existing design language - warm neutrals, subtle shadows on interaction, rounded corners.

**Key Principle**: Each conceptual section should be visually contained in its own card, creating clear boundaries and scannability.

---

## Section Structure for Tasks in DetailPanel

When a task is displayed in DetailPanel, render these sections in order:

### 1. Header (sticky)
Already exists. Keep as-is with title, checkbox, close button.

### 2. When Section (card)
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">When</h3>
  {/* Date picker or display */}
</div>
```

### 3. Contact Section (card) - if contact linked or can add
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Contact</h3>
  {/* ContactCard or picker */}
</div>
```

### 4. Project Section (card) - if project linked or can add  
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Project</h3>
  {/* ProjectCard or picker */}
</div>
```

### 5. Notes Section (card)
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Notes</h3>
  {/* Editable notes textarea */}
</div>
```

### 6. Subtasks Section (card) - if has subtasks or can add
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
    Subtasks {count > 0 && <span className="text-neutral-400">({completed}/{count})</span>}
  </h3>
  {/* Subtask list with add input */}
</div>
```

### 7. Links Section (card) - if has links or can add
```tsx
<div className="bg-white rounded-xl border border-neutral-100 p-4">
  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Links</h3>
  {/* Link list with add input */}
</div>
```

---

## Section Structure for Events in DetailPanel

Events keep their current structure but adopt the card styling:

### 1. Header (sticky) - same as tasks

### 2. ActionableActions (already exists) - keep outside cards, it's action buttons not info

### 3. Notes Section (card)
- Shows Google Calendar description (read-only, blue tint)
- User's Symphony notes (editable)

### 4. Actions/Quick Links Section (card)
- Detected actions from event content (video links, phone numbers, etc.)

### 5. Directions Section (card) - if has location
- DirectionsBuilder component

### 6. Recipe Section (card) - if meal-related event
- RecipeSection component

### 7. Prep Tasks Section (card) - if meal event
- PrepTasksList component

---

## Container & Spacing

```tsx
{/* Content wrapper inside DetailPanel */}
<div className="flex-1 overflow-auto">
  <div className="p-4 space-y-4">
    {/* Card sections go here */}
  </div>
</div>
```

- `p-4` padding around the scrollable content
- `space-y-4` between card sections (tighter than TaskView's space-y-6 since side panel is narrower)

---

## Responsive Considerations

The DetailPanel width is already constrained (`w-96` or similar). The card design should:
- Not feel cramped - use full width of cards
- Section headers should not wrap
- Inputs should be full-width within cards

---

## Delete Confirmation

Keep the existing inline delete confirmation pattern:
```tsx
{showDeleteConfirm && (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
    <p className="text-sm text-red-800 mb-3">Are you sure?</p>
    <div className="flex gap-2">
      <button className="...">Cancel</button>
      <button className="... bg-red-500">Delete</button>
    </div>
  </div>
)}
```

---

## Implementation Steps

1. **Update App.tsx**: Change `handleSelectItem` to always use `setSelectedItemId` for tasks on desktop (2-line change)

2. **Update DetailPanel.tsx**: 
   - Wrap task sections in cards with consistent styling
   - Extract section card styling to reusable pattern or component
   - Apply same card treatment to event sections

3. **Test**: Verify all functionality works in side panel:
   - Title editing
   - Completion toggle
   - Date/time editing
   - Contact linking
   - Project linking
   - Notes editing
   - Subtask management
   - Link management
   - Delete with confirmation

---

## Code Change: App.tsx

```typescript
// In handleSelectItem, change the task handling to:
if (itemId.startsWith('task-')) {
  // Always use DetailPanel for all platforms
  setSelectedItemId(itemId)
  setSelectedTaskId(null)
} else {
  // Events and routines: always use DetailPanel (unchanged)
  setSelectedItemId(itemId)
  setSelectedTaskId(null)
}
```

This removes the `isMobile` branching for tasks.

---

## Visual Reference

The final result should look like stacked cards in the side panel:

```
┌─────────────────────────────┐
│ ☑ Task Title         [×]   │  ← Header (sticky)
│ Today at 2:00 PM            │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ WHEN                    │ │  ← Card
│ │ Dec 6, 2024 at 2:00 PM  │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ PROJECT                 │ │  ← Card
│ │ 📁 Symphony OS          │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ NOTES                   │ │  ← Card
│ │ Working on the UI...    │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ SUBTASKS (2/3)          │ │  ← Card
│ │ ☑ Design spec           │ │
│ │ ☑ Implement cards       │ │
│ │ ☐ Test on mobile        │ │
│ │ + Add subtask...        │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Remove `isMobile` branching in `handleSelectItem` for tasks |
| `src/components/detail/DetailPanel.tsx` | Apply card-based section styling |

---

## Notes

- This change makes the UX consistent: click anything on schedule → side panel opens
- Users stay in context of their schedule view
- All task editing features from TaskView should work identically in DetailPanel
- The full-page TaskView component can be kept for now (accessed via other routes) or deprecated later
