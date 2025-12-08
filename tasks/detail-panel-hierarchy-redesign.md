# Detail Panel & Entity View Hierarchy Redesign

## Problem

The current ProjectView (and similar entity views) have no clear information hierarchy:
- Everything competes for attention at the same visual weight
- Redundant information (progress shown twice, status in badge AND sidebar)
- Two-column layout creates disconnection rather than clarity
- Edit/delete icons feel like afterthoughts
- No breathing room - elements cramped together

**Screenshot issues:**
- Title + status badge + task count + progress bar + sidebar with same info = cognitive overload
- User can't instantly see: "What is this? What do I do here?"

---

## Design Principles (from frontend-design skill)

1. **Bold hierarchy** - One thing dominates, everything else supports it
2. **Generous negative space** - Let content breathe
3. **Typography as structure** - Size/weight creates natural sections
4. **Progressive disclosure** - Show what matters, hide the rest until needed
5. **Intentional density** - If dense, be purposefully dense; if minimal, commit to minimal

---

## Redesign Direction: "Calm Focus"

**Philosophy:** The entity (project, task, contact) is the hero. Everything else serves it.

**Aesthetic:** Nordic Journal's warm minimalism, but with clearer zones and breathing room.

---

## Information Hierarchy (Priority Order)

### Tier 1: Identity (What is this?)
- Entity name (large, prominent)
- Type indicator (subtle, not competing)

### Tier 2: State (What's its status?)
- Status/progress (one representation, not two)
- Key metric (task count OR progress %, not both)

### Tier 3: Actions (What can I do?)
- Primary action (add task, complete, etc.)
- Secondary actions (edit, delete) - tucked away

### Tier 4: Content (What's inside?)
- Tasks, notes, attachments, etc.
- This is the main scrollable area

### Tier 5: Metadata (Nice to know)
- Created date, last updated, etc.
- Only shown on demand or at bottom

---

## ProjectView Redesign

### Current (Cluttered)
```
┌─────────────────────────────────────────────────────────────┐
│ < Back / Project                                            │
│ 📁 Renovate Kaleb and Ella's Rooms...    ✏️ 🗑️   │ STATUS  │
│ [Active] 0 of 3 tasks complete                   │ ● Active│
│ ════════════════════════════════ 0%              │ PROGRESS│
│                                                   │ 0%      │
│ Tasks                                            │ NOTES   │
│ ┌─────────────────────────────────────┐         │ No notes│
│ │ + Add a task...                      │         │         │
│ └─────────────────────────────────────┘         │         │
│ ○ Dec 8  go to home depot: buy white paint      │         │
│ ○ Dec 8  Remove little things from walls        │         │
└─────────────────────────────────────────────────────────────┘
```

### Proposed (Focused)
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ← Projects                                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Renovate Kaleb and Ella's Rooms                   │   │
│  │                                                     │   │
│  │  ● Active  ·  0/3 tasks                            │   │
│  │                                                     │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  0%         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ + Add a task...                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Dec 8                                                      │
│  ○  Go to Home Depot: buy white paint 2 cans               │
│  ○  Remove little things from walls                        │
│                                                             │
│  Unscheduled                                                │
│  ○  Finish putting kids closets together                   │
│                                                             │
│                                                             │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈   │
│                                                             │
│  Notes                                                      │
│  No notes yet · + Add                                       │
│                                                             │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈   │
│                                                             │
│  ⋮  Edit  ·  Delete                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:**
1. **Single column** - No sidebar splitting attention
2. **Hero card** - Project identity in a contained, prominent card
3. **Consolidated status** - "● Active · 0/3 tasks" is ONE line, not scattered
4. **Progress bar inside card** - Part of the identity, not separate
5. **Grouped tasks by date** - Visual chunking reduces cognitive load
6. **Notes at bottom** - Metadata tier, not competing with tasks
7. **Actions at very bottom** - Edit/delete are rare actions, push them down
8. **Generous vertical spacing** - Let sections breathe

---

## Component Structure

### EntityHeader (Reusable)

A hero card component used across ProjectView, ContactView, TaskView:

```tsx
interface EntityHeaderProps {
  icon: React.ReactNode
  iconBg: string // Tailwind bg class
  title: string
  subtitle?: string // "● Active · 0/3 tasks"
  progress?: number // 0-100, shows bar if provided
  onBack: () => void
  backLabel: string // "Projects", "Tasks", etc.
}

function EntityHeader({ ... }: EntityHeaderProps) {
  return (
    <div className="mb-8">
      {/* Breadcrumb */}
      <button className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-6">
        <ChevronLeftIcon className="w-4 h-4" />
        {backLabel}
      </button>
      
      {/* Hero card */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-semibold text-neutral-800 mb-1">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-neutral-500">{subtitle}</p>
            )}
          </div>
        </div>
        
        {/* Progress bar (if applicable) */}
        {progress !== undefined && (
          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-neutral-400 tabular-nums w-10 text-right">
              {progress}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
```

### SectionDivider

Light visual separator between content zones:

```tsx
function SectionDivider() {
  return <div className="border-t border-dashed border-neutral-200 my-8" />
}
```

### ActionFooter

Rare actions pushed to bottom:

```tsx
function ActionFooter({ onEdit, onDelete }: { onEdit: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center justify-center gap-4 pt-8 mt-8 border-t border-neutral-100">
      <button 
        onClick={onEdit}
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        Edit
      </button>
      {onDelete && (
        <>
          <span className="text-neutral-200">·</span>
          <button 
            onClick={onDelete}
            className="text-sm text-neutral-500 hover:text-red-600"
          >
            Delete
          </button>
        </>
      )}
    </div>
  )
}
```

---

## Task Grouping

Group tasks by date for visual chunking:

```tsx
// Instead of flat list:
{sortedTasks.map(task => <TaskRow />)}

// Use grouped:
{Object.entries(groupedTasks).map(([dateLabel, tasks]) => (
  <div key={dateLabel} className="mb-6">
    <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
      {dateLabel}
    </h3>
    <div className="space-y-2">
      {tasks.map(task => <TaskRow />)}
    </div>
  </div>
))}

// groupedTasks = { "Dec 8": [...], "Unscheduled": [...] }
```

---

## DetailPanel (Mobile Bottom Sheet)

Apply same principles but more compact:

```
┌─────────────────────────────────────────┐
│ ━━━━━  (drag handle)                    │
│                                         │
│ 📁  Renovate Kaleb and Ella's Rooms     │
│     ● Active · 0/3 tasks                │
│                                         │
│ ═══════════════════════════════ 0%      │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ Tasks                                   │
│ ○ Go to Home Depot...                   │
│ ○ Remove little things...               │
│ + Add task                              │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ Notes                                   │
│ No notes · + Add                        │
│                                         │
│               Edit · Delete             │
└─────────────────────────────────────────┘
```

**Mobile adjustments:**
- Smaller title (text-xl instead of text-2xl)
- Tighter spacing
- Full-width sections (no card wrapper)
- Actions at very bottom, small text

---

## Implementation Files

| File | Changes |
|------|---------|
| `src/components/shared/EntityHeader.tsx` | New - reusable hero card |
| `src/components/shared/SectionDivider.tsx` | New - visual separator |
| `src/components/shared/ActionFooter.tsx` | New - edit/delete footer |
| `src/components/project/ProjectView.tsx` | Refactor to use new components |
| `src/components/detail/DetailPanel.tsx` | Apply hierarchy principles |
| `src/components/contact/ContactView.tsx` | Refactor to use new components |
| `src/components/task/TaskView.tsx` | Refactor to use new components |
| `src/lib/taskGrouping.ts` | New - group tasks by date helper |

---

## Color & Typography

Use existing Nordic Journal tokens but with more intentional application:

**Title:** `font-display text-2xl font-semibold text-neutral-800`
**Subtitle:** `text-sm text-neutral-500` 
**Section header:** `text-xs font-medium text-neutral-400 uppercase tracking-wider`
**Body:** `text-base text-neutral-700`
**Muted:** `text-sm text-neutral-400`

**Status colors:**
- Active: `text-blue-600` with `●` indicator
- Completed: `text-green-600`
- Not started: `text-neutral-500`

---

## Testing Checklist

- [ ] ProjectView shows single-column layout
- [ ] Entity header has clear visual hierarchy
- [ ] Progress bar is inside header card, not separate
- [ ] Tasks grouped by date
- [ ] Edit/delete actions at bottom
- [ ] Mobile DetailPanel uses same hierarchy
- [ ] Generous spacing between sections
- [ ] No redundant information

---

## Out of Scope

- Complete visual redesign of all components
- New color palette
- New typography system
- Animation/motion design

Focus is on **hierarchy and layout**, not complete aesthetic overhaul.
