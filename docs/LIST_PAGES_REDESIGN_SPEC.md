# Symphony OS: List Pages Redesign Specification

## Overview

Apply the same design treatment established in the detail view redesigns (TaskViewRedesign, ProjectViewRedesign, ContactViewRedesign) to the list pages: **ProjectsList** and **RoutinesList**.

The design language prioritizes:
- Large, breathable typography (Fraunces serif for headings)
- Subtle warm backgrounds (cream/neutral-50)
- Content as the centerpiece
- Two-column layout on desktop where appropriate
- Spacious card designs with hover states
- Consistent accent colors per entity type

---

## Design Tokens (Reference)

### Colors by Entity Type
- **Tasks:** Forest green (`primary-500`, `primary-600`)
- **Projects:** Blue (`blue-500`, `blue-600`, `blue-100`)
- **Routines:** Amber (`amber-500`, `amber-600`, `amber-100`)
- **Contacts:** Purple/violet

### Typography
- Page titles: `font-display text-3xl` or `text-4xl` (Fraunces serif)
- Section headers: `font-display text-lg font-medium`
- Body: System sans-serif, `text-base`
- Meta/labels: `text-xs uppercase tracking-wider text-neutral-400`

### Spacing
- Page padding: `p-8` on desktop, `p-6` on mobile
- Card gap: `space-y-3` for list items
- Section gap: `mb-10` between major sections

---

## ProjectsList Redesign

### Current State
- Simple centered list with `max-w-2xl`
- Basic card style with folder icon
- Inline creation form

### Redesigned Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  bg-gradient-to-b from-blue-50/50 to-white                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Projects                              [+ New Project]           │   │
│  │  font-display text-3xl                                           │   │
│  │                                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                  │   │
│  │  ACTIVE (3)                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 📁 Plan Iris's Birthday                    ████░░ 4/6   │    │   │
│  │  │    Due Dec 17 · 6 tasks                              →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 📁 Fix Basement                            ██░░░░ 2/5   │    │   │
│  │  │    3 tasks remaining                                 →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  NOT STARTED (2)                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 📁 Tax Prep 2025                           ░░░░░░ 0/0   │    │   │
│  │  │    No tasks yet                                      →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  COMPLETED (1) ▼                                                 │   │
│  │  (collapsed by default, expandable)                              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Changes

1. **Background Treatment**
   - Subtle blue gradient: `bg-gradient-to-b from-blue-50/50 to-white`
   - Matches ProjectViewRedesign's blue accent

2. **Page Header**
   - Large serif title: `font-display text-3xl font-semibold text-neutral-800`
   - "New Project" button with blue accent, positioned top-right

3. **Status Grouping**
   - Group by status: Active → Not Started → Completed
   - Section headers: `text-xs font-semibold text-neutral-400 uppercase tracking-wider`
   - Completed section collapsed by default with expand toggle

4. **Enhanced Project Cards**
   - Larger, more spacious: `p-5 rounded-2xl`
   - Progress bar inline showing task completion
   - Show task count and due date (if set)
   - Hover state: `hover:shadow-md hover:border-blue-200`
   - Blue folder icon in circle: `w-12 h-12 rounded-xl bg-blue-100`

5. **Progress Indicators**
   - Mini progress bar per project: `w-20 h-1.5 bg-neutral-200 rounded-full`
   - Completion fraction: `4/6` in `text-sm text-neutral-500`

6. **Empty State**
   - Larger icon, warmer messaging
   - CTA button with blue accent

### Data Needed
- Task count per project
- Completed task count per project  
- Project due date (if set)

---

## RoutinesList Redesign

### Current State
- Header with sort/group controls
- Active vs Paused sections
- Cards with recurrence info

### Redesigned Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  bg-gradient-to-b from-amber-50/30 to-white                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Routines                               [+ New Routine]          │   │
│  │  font-display text-3xl                                           │   │
│  │                                                                  │   │
│  │  ┌─────────────────────────────────────────────────┐            │   │
│  │  │  Sort: [Time ▾]    Group: [None ▾]    🔍        │            │   │
│  │  └─────────────────────────────────────────────────┘            │   │
│  │                                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                  │   │
│  │  MORNING                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 🔄 Kids routine                                         │    │   │
│  │  │    Every weekday · 6:55 AM                    SK     →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 🔄 Walk Jax                                             │    │   │
│  │  │    Every day · 7:00 AM                        IR     →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  AFTERNOON                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 🔄 Check email                                          │    │   │
│  │  │    Weekdays · 2:00 PM                         SK     →  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  EVENING                                                         │   │
│  │  ...                                                             │   │
│  │                                                                  │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │                                                                  │   │
│  │  PAUSED (2) ▼                                                    │   │
│  │  (collapsed, faded styling)                                      │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Changes

1. **Background Treatment**
   - Subtle amber gradient: `bg-gradient-to-b from-amber-50/30 to-white`
   - Matches routine amber accent

2. **Page Header**
   - Large serif title: `font-display text-3xl font-semibold text-neutral-800`
   - "New Routine" button with amber accent

3. **Controls Bar**
   - Clean pill-style container for sort/group dropdowns
   - Optional search/filter icon
   - Subtle background: `bg-white/60 rounded-xl border border-neutral-200/60`

4. **Time-of-Day Sections**
   - When grouped by time, use clear section headers
   - Morning / Afternoon / Evening / Anytime
   - Divider between sections: `border-t border-neutral-200/60`

5. **Enhanced Routine Cards**
   - Larger: `p-5 rounded-2xl`
   - Amber cycle icon: `w-12 h-12 rounded-xl bg-amber-100`
   - Recurrence badge: pill style with frequency
   - Assignee avatar on right side
   - Hover: `hover:shadow-md hover:border-amber-200`

6. **Semantic Routine Display**
   - NL routines show `SemanticRoutine` tokens prominently
   - Legacy routines show name + recurrence pattern

7. **Paused Section**
   - Collapsed by default
   - Faded styling: `opacity-60`
   - Expand/collapse toggle

8. **Empty State**
   - Amber-themed icon
   - Friendly copy encouraging first routine
   - CTA with amber accent

---

## Shared Components to Create

### `ListPageHeader`
Reusable header with:
- Large serif title
- Subtitle/count
- Action button (optional)

```tsx
interface ListPageHeaderProps {
  title: string
  count?: number
  countLabel?: string // e.g., "projects", "routines"
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  accentColor?: 'blue' | 'amber' | 'green' | 'purple'
}
```

### `StatusSection`
Collapsible section with:
- Section header
- Count badge
- Expand/collapse for completed/paused items

### `ProgressIndicator`
Mini progress bar with fraction:
- `completed/total` display
- Colored fill based on entity type

---

## Implementation Notes

1. **Preserve Existing Functionality**
   - Keep all sort/group logic in RoutinesList
   - Keep inline project creation
   - Keep all click handlers and callbacks

2. **Create *Redesign Variants**
   - `ProjectsListRedesign.tsx`
   - `RoutinesListRedesign.tsx`
   - Wire through `lazy.ts` like detail views
   - Keep originals as `*Original` exports for rollback

3. **Responsive Behavior**
   - On mobile, reduce padding and card sizes
   - Keep single-column layout (no sidebar needed for lists)
   - Touch-friendly tap targets

4. **Animation**
   - Subtle fade-in for cards on mount
   - Smooth collapse/expand for sections
   - Hover transitions: `transition-all duration-200`

---

## File Changes Required

```
src/components/
├── project/
│   ├── ProjectsList.tsx (keep as original)
│   └── ProjectsListRedesign.tsx (new)
├── routine/
│   ├── RoutinesList.tsx (keep as original)
│   └── RoutinesListRedesign.tsx (new)
├── shared/ (optional)
│   ├── ListPageHeader.tsx (new)
│   ├── StatusSection.tsx (new)
│   └── ProgressIndicator.tsx (new)
└── lazy.ts (update exports)
```

---

## Testing Checklist

After implementation:
- [ ] Projects list renders with status grouping
- [ ] Project cards show task completion progress
- [ ] New project creation still works
- [ ] Routines list renders with time-of-day grouping
- [ ] Sort/group controls function correctly
- [ ] Paused routines section collapses/expands
- [ ] New routine button navigates correctly
- [ ] Mobile responsive at various breakpoints
- [ ] Hover states work on desktop
- [ ] Empty states display correctly
