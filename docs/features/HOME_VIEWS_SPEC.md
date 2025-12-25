# Symphony OS: Home Page Views Specification

## Overview

The Symphony OS home page supports three distinct views, with user preference remembered per family member. The design philosophy prioritizes **execution over information** — every element must answer: "Does this change what I do in the next few hours?"

---

## View 1: Today (Default)

**Purpose:** Focused execution surface. "What do I do next?"

**Status:** Currently implemented. No changes needed.

### Design Principles
- Time chunked narratively (Morning / Afternoon / Evening), not hour blocks
- Completed items fade but remain visible — preserves the shape of the day
- Visual hierarchy through typography, not boxes and borders
- Reads like a story, not a spreadsheet
- Centered, does not fill available screen width

### Current Elements
- Date header with navigation (< Today >)
- Progress bar with completion count (e.g., 4/12)
- Time-of-day sections: ALL DAY, MORNING, AFTERNOON, EVENING
- Task cards showing:
  - Time (specific or "All day")
  - Completion checkbox
  - Task title
  - Subtask count (if applicable)
  - Project tag(s)
  - Contact tag(s) (if applicable)
  - Assignee badge (SK, IR, etc.)
- Completed tasks: green checkmark, struck-through text, faded opacity

---

## View 2: Today + Context

**Purpose:** Same focused itinerary with peripheral situational awareness.

### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌─────────────────────┐   ┌─────────────────────┐    │
│   │                     │   │                     │    │
│   │    TODAY VIEW       │   │    CONTEXT          │    │
│   │    (unchanged)      │   │    SIDEBAR          │    │
│   │                     │   │    (collapsible)    │    │
│   │    Centered         │   │                     │    │
│   │    itinerary        │   │                     │    │
│   │                     │   │                     │    │
│   └─────────────────────┘   └─────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Context Sidebar Widgets

#### 1. Active Projects Today
Shows projects with tasks scheduled for today, clustered for awareness.

```
ACTIVE PROJECTS TODAY
─────────────────────
📁 Plan Iris's Birthday     3 tasks
   ⏱ 12 days until Dec 17
   
📁 Fix basement             2 tasks
   
📁 Stacks Data              1 task
```

**Data needed:**
- Projects with tasks scheduled today
- Task count per project
- Days until project due date (if set)

#### 2. Family Today (Handoff Timeline)
Visual sense of who's "on duty" when.

```
FAMILY TODAY
─────────────────────
Scott    ████████░░░░████████  10 tasks
Iris     ██░░░░░░░░░░░░░░░░██   2 tasks
         6a      12p      6p
```

**Data needed:**
- Tasks per family member today
- Time distribution of assignments
- Handoff points (when responsibility shifts)

#### 3. Tonight's Dinner
Quick meal status — answers "what's for dinner?" and "does someone need to act?"

```
TONIGHT'S DINNER
─────────────────────
🍽 Chicken stir fry
   Recipe ready
   ⚠️ Defrost chicken by 3pm
```

**Data needed:**
- Meal plan for tonight
- Prep status / notes
- Time-sensitive actions

#### 4. Weather Strip
Relevant for outdoor tasks only. Minimal.

```
─────────────────────
☀️ 52°F  Clear all day
```

**Data needed:**
- Current conditions
- Today's forecast summary
- Only show if outdoor tasks exist (optional optimization)

### Sidebar Behavior
- **Collapsible:** User can hide/show sidebar
- **State remembered:** Per-user preference persists
- **Responsive:** On narrow screens, sidebar moves below or becomes a bottom sheet
- **Glanceable:** Designed for peripheral vision, not deep reading

### What NOT to Include
- Weekly/monthly analytics
- Habit streaks
- Historical graphs
- Anything requiring interpretation or analysis
- Anything that doesn't affect the next few hours

---

## View 3: Week

**Purpose:** See the shape of the week without losing the narrative rhythm.

### Design Principles
- **NOT a traditional calendar grid** (no 7 columns × 24 hours)
- 7 "mini-today" columns preserving Morning/Afternoon/Evening structure
- Progress pulse visible per day
- Click any day to expand to full Today view
- Horizontal scrolling on mobile if needed

### Layout Structure
```
┌──────────────────────────────────────────────────────────────────────┐
│  Week of December 8                              < This Week >       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Mon 8      Tue 9      Wed 10     Thu 11     Fri 12     Sat/Sun     │
│  ━━━━━━━    ━━━━━━━    ━━━━━━━    ━━━━━━━    ━━━━━━━    ━━━━━━━     │
│  ◐ 3/8      ○ 0/12     ○ 0/6      ○ 0/9      ○ 0/7      ○ 0/4       │
│                                                                      │
│  MORNING    MORNING    MORNING    MORNING    MORNING    MORNING     │
│  · Kids...  · Kids...  · Kids...  · Kids...  · Kids...  · Sleep in  │
│  · Walk J   · Walk J   · Walk J   · Walk J   · Walk J               │
│  · Mtg...   · Call...             · Review              · Errands   │
│                                                                      │
│  AFTERNOON  AFTERNOON  AFTERNOON  AFTERNOON  AFTERNOON  AFTERNOON   │
│  · Task     · Task     · Task     · Dentist  · Task     · Soccer    │
│  · Task     · Task                · Task                            │
│                                                                      │
│  EVENING    EVENING    EVENING    EVENING    EVENING    EVENING     │
│  · Pick up  · Pick up  · Pick up  · Pick up  · Pick up  · Family    │
│  · Dinner   · Dinner   · Dinner   · Dinner   · Dinner     dinner    │
│  · Bedtime  · Bedtime  · Bedtime  · Bedtime  · Bedtime              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Day Column Components

#### Progress Pulse
Shows completion state at a glance.
- `○` Empty — nothing done yet
- `◐` Partial — in progress  
- `●` Complete — all done
- Fraction: `3/8` completed/total

#### Time-of-Day Sections
Each day preserves the narrative chunks:
- MORNING
- AFTERNOON  
- EVENING

#### Task Preview
- Show top 1-2 tasks per time section
- Truncate titles with ellipsis
- No full task cards — just enough to recognize
- Completed tasks shown faded/struck

#### Day Interaction
- **Hover:** Subtle highlight
- **Click:** Expands to full Today view for that day
- **Today:** Visually distinguished (background color or border)

### Responsive Behavior
- **Desktop:** All 7 days visible
- **Tablet:** 5 days visible, horizontal scroll for weekend
- **Mobile:** 3 days visible, horizontal scroll (or consider vertical stack)

### Weekend Handling
Options to consider:
1. Sat/Sun as separate columns (same as weekdays)
2. Sat/Sun combined into one wider column
3. Weekend collapsed by default, expandable

---

## View Switcher

### Location
Top of home page, near the date header.

### Design
```
┌─────────────────────────────────────────────────┐
│  Today                    [Today ▾]  < > Today  │
│  Friday, December 5                             │
└─────────────────────────────────────────────────┘
```

Or as segmented control:
```
[ Today | Today + | Week ]
```

### Behavior
- Current view visually indicated
- Selection persists per user
- Smooth transition between views (consider animation)

---

## Technical Considerations

### State Management
```typescript
interface HomeViewPreference {
  userId: string;
  preferredView: 'today' | 'today-context' | 'week';
  sidebarCollapsed: boolean; // for today-context view
}
```

### Data Requirements by View

**Today (existing):**
- Tasks for current date
- Completion status
- Assignments
- Projects/tags

**Today + Context (new):**
- All Today data, plus:
- Project aggregations for today
- Project due dates
- Family member task counts/distribution
- Meal plan for tonight
- Weather data (external API)

**Week (new):**
- Tasks for 7-day range
- Completion status per day
- Minimal task details (title only)
- Daily totals

### Performance
- Week view should lazy-load full task details only on day expansion
- Context sidebar data can load after main itinerary renders
- Consider caching week data to avoid refetch on view switch

---

## Implementation Priority

1. **Phase 1:** View switcher + Week view (addresses Iris's request)
2. **Phase 2:** Today + Context sidebar (enhances power users)
3. **Phase 3:** Polish — animations, responsive refinements, widget customization

---

## Open Questions

1. Should sidebar widgets be user-configurable (show/hide specific widgets)?
2. Weekend display preference — separate days or combined?
3. Week view: start on Sunday or Monday? (User preference?)
4. Should "Today + Context" show a simplified week mini-calendar in sidebar?

---

## Reference

### Current Today View Screenshot
See attached screenshot showing:
- Progress bar (4/12)
- Time-of-day sections with task cards
- Project tags (Plan Iris's Birthda..., Fix basement ba...)
- Contact tags (O'Neill Plu..., Alex Bauer)
- Assignee badges (SK, IR)
- Completed task styling (green check, strikethrough, faded)
