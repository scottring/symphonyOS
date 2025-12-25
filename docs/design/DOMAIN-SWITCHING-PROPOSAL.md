# Domain Switching: The Brilliant Solution

**Status:** Comprehensive Proposal  
**Created:** December 25, 2025  
**Author:** Research & Analysis

---

## Executive Summary

Symphony OS needs seamless, intuitive, fun domain switching that allows users to work effortlessly in a single domain (Work, Family, Personal) or a Universal view. This proposal delivers a **context-first architecture** that eliminates the "toggling tax" while respecting the distinct nature of each life domain.

**The Core Insight:** Users don't want to "switch contexts" — they want the right context to *appear* based on time, location, and intent. Domain switching should feel like opening the right room in your house, not navigating a complex menu system.

---

## Research Findings

### The Context Switching Problem

Research shows workers lose **5 working weeks per year** to context switching between apps and domains ([Asana](https://asana.com/resources/context-switching)). The "toggling tax" comes from:
- Mental overhead of remembering which domain you're in
- Friction in switching between views
- Fear of mixing work/personal content
- Cognitive load from seeing irrelevant information

### Best-in-Class Patterns

**Things 3** ([comparison](https://blog.offlight.work/post/things3-vs-todoist)):
- Areas provide macro-level life organization
- Tags show as filter tabs within lists
- "Calm by default" — only shows what you need now
- Seamless Apple ecosystem integration

**Todoist** ([comparison](https://upbase.io/blog/todoist-vs-things-3/)):
- Labels + Filters for complex sorting
- Shows everything unless actively filtered
- More power, more complexity

**Apple Focus Filters** ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10121/)):
- System-level context awareness
- Apps adapt based on time/location/activity
- Persistent, visible filter state
- Cross-app consistency

### 2025 UX Trends

**Context-Aware Interfaces** ([Medium](https://medium.com/@marketingtd64/why-context-aware-ui-is-gaining-ground-in-2025-9aac327466b8)):
> "During work hours, an app might prioritize productivity tools, while in the evening, it highlights entertainment options."

**Role-Based Design** ([Flowtrix](https://www.flowtrix.co/blogs/enterprise-ux-in-2025-transforming-digital-workplaces)):
- Interfaces tailored to specific responsibilities
- Only show relevant tools and data for each role
- Adapt to how users work, not force adaptation

---

## Symphony's Current State

### What Exists
✅ \`context\` field on tasks: \`'work' | 'family' | 'personal' | null\`  
✅ ContextPicker component (🏷️ tag icon on task cards)  
✅ Infrastructure ready for filtering

### What's Missing
❌ No global domain filter/view mode  
❌ No domain switching UI in navigation  
❌ All tasks show regardless of context  
❌ No "safe mode" for shared screens  
❌ No time-based automatic switching  
❌ Projects don't have domain inheritance

---

## The Brilliant Solution: "Living Spaces"

Think of domains as **rooms in your home**, not tabs in a browser.


### Core Metaphor: Rooms, Not Tabs

| Traditional Approach | Symphony "Living Spaces" |
|---------------------|-------------------------|
| Dropdown menu selection | Spatial navigation |
| Filter state hidden until checked | Always visible where you are |
| Manual switching required | Time-aware auto-switching (optional) |
| Same UI, filtered content | Contextual UI adaptation |
| Binary on/off per domain | Universal view shows connections |

---

## The Design: Three-Layer System

### Layer 1: The Domain Bar (Always Visible)

**Location:** Top of sidebar, below logo, always present

**Visual Design:**
```
┌─────────────────────────────────────┐
│  🌐  Universal         [Active]     │
│  💼  Work                           │
│  👨‍👩‍👧‍👦  Family                        │
│  🌱  Personal                       │
└─────────────────────────────────────┘
```

**Interaction:**
- Single tap/click to switch domains
- Active domain highlighted with accent color + subtle background
- Keyboard shortcuts: ⌘1 Universal, ⌘2 Work, ⌘3 Family, ⌘4 Personal
- Smooth 200ms transition with content fade

**Collapsed Sidebar:**  
Shows icon only, tooltip on hover

**Mobile (Bottom Sheet):**  
Horizontal pill selector at top:
```
[ 🌐 All ]  [ 💼 ]  [ 👨‍👩‍👧‍👦 ]  [ 🌱 ]
```

---

### Layer 2: Smart Filtering Logic

#### Universal View (Default)
**Shows:** Everything across all domains  
**Use case:** Weekly planning, full visibility, "command center"

**Visual distinction:**
- Tasks/projects tagged with colored domain pill
- Work: Blue dot
- Family: Amber dot  
- Personal: Purple dot
- Null/untagged: Gray dot

#### Domain-Specific Views
**Shows:** Only items tagged with that domain + null-tagged items

**Why include null-tagged items?**  
Option A: Default to Personal (safe, nothing leaks)  
Option B: Show in current domain until tagged (capture flow)  
**Recommendation:** Option B for capture friction, with warning badge

#### Filtering Rules
\`\`\`typescript
function getVisibleTasks(domain: Domain | 'universal', tasks: Task[]) {
  if (domain === 'universal') {
    return tasks // Show everything
  }

  return tasks.filter(task =>
    task.context === domain ||
    task.context === null // Untagged items show until triaged
  )
}
\`\`\`

---

### Layer 3: Context Inheritance & Intelligence

#### Project-Level Domains
Projects get a \`context\` field that tasks inherit by default:

\`\`\`typescript
interface Project {
  context: 'work' | 'family' | 'personal' | null
  // ... other fields
}

interface Task {
  context: 'work' | 'family' | 'personal' | null
  project_id: string | null
  // ... other fields
}
\`\`\`

**Inheritance logic:**
- Task created in project → inherits project's domain
- Task created standalone → defaults to null (shows in current view)
- User can override task domain independently

#### Smart Auto-Assignment

**Signals for automatic domain tagging:**

| Signal | Auto-tag as |
|--------|-------------|
| Assigned to family member | Family |
| Linked to work project | Work |
| Created during work hours (9am-5pm) | Work (if enabled) |
| Contains personal calendar event | Personal |

**User Control:**
- Settings toggle: "Auto-tag based on time/context" (default: off)
- Always overridable manually
- Notification: "Auto-tagged as Work" with undo action

---

## Advanced Features: Time-Aware Switching

### Focus Mode Integration

**Inspired by:** Apple Focus Filters ([source](https://developer.apple.com/videos/play/wwdc2022/10121/))

**How it works:**
1. User sets "Work Focus Hours": Monday-Friday, 9am-5pm
2. Symphony auto-switches to Work domain during those hours
3. Evening (6pm+) auto-switches to Family domain
4. User can override anytime

**UI Indicator:**
```
┌─────────────────────────────────────┐
│  💼  Work  [Focus: 2h 15m left] ⚡   │
└─────────────────────────────────────┘
```

**Settings Panel:**
```
Focus Mode Switching
├─ Work Focus
│  └─ Mon-Fri, 9am-5pm → Auto-switch to Work
├─ Family Time
│  └─ Daily, 6pm-9pm → Auto-switch to Family
└─ Personal Time
   └─ Weekends → Auto-switch to Personal
```

---

## Calendar-Domain Integration

### The Multi-Calendar Reality

Most users have multiple Google Calendars:
- Work calendar (company account)
- Personal calendar (personal Gmail)
- Shared family calendar
- Kids' school calendars
- Sports/activities calendars

**Symphony needs to map each calendar to the appropriate domain.**

### Calendar Domain Mapping

**Settings UI:**
```
Connected Calendars
├─ scott@company.com (Primary)
│  └─ Domain: 💼 Work
├─ scott.kaufman@gmail.com
│  └─ Domain: 🌱 Personal
├─ family@kaufman.com
│  └─ Domain: 👨‍👩‍👧‍👦 Family
└─ + Connect another calendar
```

**Data Model:**
```typescript
interface CalendarConnection {
  id: string
  calendar_id: string // Google Calendar ID
  calendar_email: string
  calendar_name: string
  domain: 'work' | 'family' | 'personal' | null
  user_id: string
  is_primary: boolean
}
```

### Event Filtering by Domain

**Behavior:**
- Universal view: Shows events from ALL connected calendars
- Work domain: Shows only events from calendars tagged "Work"
- Family domain: Shows only events from calendars tagged "Family"
- Personal domain: Shows only events from calendars tagged "Personal"

**Event creation:**
- Creating event in Work domain → Defaults to work calendar
- Creating event in Family domain → Defaults to family calendar
- User can override calendar selection per event

### Auto-Tagging from Calendar

**Smart inference:**
```typescript
// When task links to calendar event, inherit event's domain
const inferTaskDomain = (task: Task, event: CalendarEvent) => {
  if (!task.context && event.calendar_domain) {
    return event.calendar_domain
  }
  return task.context
}
```

**Example flow:**
1. Work calendar event: "Client meeting at 2pm"
2. User creates task: "Prepare slides for meeting"
3. Task links to event → Auto-tagged as Work
4. Task only shows in Work domain (and Universal)

### Migration for Existing Users

**First-time setup:**
```
You have 3 calendars connected:
Let's assign them to domains

📅 scott@acme.com
   Is this for Work, Family, or Personal?
   → [Work] [Family] [Personal]

📅 scott.personal@gmail.com
   Is this for Work, Family, or Personal?
   → [Work] [Family] [Personal]
```

**Default behavior if not configured:**
- All calendars show in all domains
- Warning badge: "Configure calendar domains in Settings"

---

## Mobile-First Execution

### Quick Domain Switch (Bottom Sheet)

**Current task detail sheet:**  
Add domain selector at top, before title:

```
┌─────────────────────────────────────┐
│  Domain: [ 💼 Work ▼ ]              │
│  ────────────────────────────────────│
│  Order kitchen backsplash tile      │
│  ...                                │
└─────────────────────────────────────┘
```

Tapping opens inline picker (same as ContextPicker today)

### Home Screen Widget

**Domain-filtered widget:**
- "Work Tasks" widget shows only work context
- "Family Hub" widget shows only family
- Universal widget shows color-coded mix

---

## Privacy & Security: The "Family Safe" Mode

### The Problem
Scott wants to review plans on iPad with family around without exposing work/personal items.

### The Solution: Quick Privacy Toggle

**Location:** Top-right of app, next to search

**Visual:**
```
┌──────────────────────────────────────────┐
│  [👁️ Family Safe] 🔍                     │
└──────────────────────────────────────────┘
```

**Behavior:**
- Single tap: Instantly switch to Family domain + hide other domain indicators
- Screen shows ONLY family tasks/projects
- Domain bar hidden in this mode
- Exit: Tap again to return to previous domain

**Use case:**
> "iPad on coffee table, planning Sunday with Iris. Tap Family Safe → only see shared tasks. Kids walk by → no work stuff visible."


---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Basic domain switching working

- [ ] Add domain bar to sidebar
- [ ] Implement domain filtering logic  
- [ ] Add keyboard shortcuts
- [ ] Update TodaySchedule to respect active domain
- [ ] Visual domain indicators (colored dots) on tasks

**Success metric:** Can switch between Universal/Work/Family/Personal views

---

### Phase 2: Intelligence (Week 2)
**Goal:** Smart auto-tagging and inheritance

- [ ] Add \`context\` field to Projects table
- [ ] Implement inheritance logic (project → task)
- [ ] Auto-tag tasks assigned to family members as Family
- [ ] Auto-tag tasks in work projects as Work
- [ ] Settings toggle for time-based auto-switching

**Success metric:** 80% of tasks auto-tagged correctly

---

### Phase 3: Polish (Week 3)
**Goal:** Delightful UX and mobile optimization

- [ ] Smooth domain switching animation
- [ ] Mobile horizontal pill selector
- [ ] Family Safe mode
- [ ] Focus Mode time-based switching
- [ ] Persist last-used domain in localStorage
- [ ] Domain-specific empty states

**Success metric:** Switching feels instant and intuitive

---

### Phase 4: Advanced (Future)
**Goal:** Predictive intelligence

- [ ] ML-based context prediction
- [ ] Location-aware domain switching
- [ ] Calendar event context analysis
- [ ] "You usually switch to Family at 6pm" suggestions
- [ ] Cross-device domain sync (start on desktop, continue on mobile)

---

## Design Specifications

### Color System

**Domain Colors (from existing ContextPicker):**
\`\`\`typescript
const DOMAIN_COLORS = {
  work: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
    border: 'border-blue-200',
  },
  family: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
  },
  personal: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
    border: 'border-purple-200',
  },
}
\`\`\`

### Typography

**Domain Bar:**
- Font: DM Sans (body font)
- Size: 14px (text-sm)
- Weight: 500 (medium) for active, 400 (normal) for inactive
- Letter spacing: Normal

**Domain Indicator Pills:**
- Font: DM Sans
- Size: 12px (text-xs)
- Weight: 500
- Dot size: 8px diameter (w-2 h-2)

### Spacing

**Domain Bar:**
- Padding: 12px (p-3)
- Gap between items: 4px (space-y-1)
- Margin top: 16px (mt-4) below logo

**Domain Pills (in tasks):**
- Padding: 4px 8px (px-2 py-1)
- Border radius: 9999px (rounded-full)
- Gap from task title: 8px (ml-2)

### Animation

**Domain Switching:**
\`\`\`css
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1)
\`\`\`

**Task List Fade:**
\`\`\`css
.domain-transition-enter {
  opacity: 0;
  transform: translateY(-8px);
}
.domain-transition-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: all 200ms ease-out;
}
\`\`\`

---

## Why This Solution Is Brilliant

### 1. **Zero Cognitive Load**
Domain bar always visible → you always know where you are. No hidden state, no surprises.

### 2. **Respects Mental Models**
Domains are "rooms" not "filters". You don't filter your home office — you go into it.

### 3. **Flexible for All Workflows**

| User Type | Preferred Mode | Why |
|-----------|---------------|-----|
| Solo professional | Universal + Work split | See everything when planning, focus during execution |
| Parent working from home | Time-based auto-switch | Work 9-5, Family 6-9, automatic |
| Privacy-conscious | Family Safe mode | Quick hide for shared screens |
| Power planner | Universal only | Wants to see connections across domains |

### 4. **Progressive Disclosure**
- Basic: Manual domain switching (Week 1)
- Intermediate: Auto-tagging based on project (Week 2)
- Advanced: Time-based auto-switching (Week 3)
- Expert: Predictive intelligence (Future)

### 5. **Mobile-First**
Domain switching on mobile is HARDER than desktop. Bottom sheet pill selector solves this elegantly.

### 6. **Privacy Built-In**
Family Safe mode is not an afterthought — it's a first-class feature.


---

## User Stories

### Story 1: Scott's Monday Morning
**6:45am:** Opens Symphony on phone → Auto-switches to Personal domain  
→ Sees morning workout routine

**9:00am:** Arrives at desk → Auto-switches to Work domain  
→ Sees only work tasks and projects  
→ No family/personal items visible

**12:30pm:** Lunch break, plans weekend on iPad → Taps Family domain  
→ Adds tasks for "Hardware store trip" project  
→ Assigns "Pick up paint samples" to Iris

**6:00pm:** Leaves office → Auto-switches to Family domain  
→ Sees "Iris: Paint samples picked up ✓"  
→ Adds "Review paint colors together" for tonight

---

### Story 2: Iris's Sunday Planning
**10:00am:** Opens Symphony on iPad with Scott  
→ Currently in Universal view (sees everything)

**Kid walks in asking to see screen:**  
→ Scott taps **Family Safe** button  
→ Instantly hides work/personal, shows only family domain  
→ Safe to show screen

**After planning:**  
→ Iris opens Symphony on her phone  
→ Auto-opens to Family domain (her default)  
→ Sees tasks assigned to her  
→ Can switch to Universal if needed for full picture

---

### Story 3: New User Onboarding
**Day 1:** Creates first task "Buy groceries"  
→ System asks: "Is this Work, Family, or Personal?"  
→ User selects Family  
→ Domain bar appears with Family highlighted

**Day 2:** Creates work project "Q1 Planning"  
→ System auto-tags project as Work (based on name)  
→ All tasks in project inherit Work domain  
→ User can override per task if needed

**Day 7:** System notices pattern  
→ "You usually switch to Work at 9am on weekdays. Enable auto-switching?"  
→ User enables  
→ Symphony now feels proactive, not reactive

---

## Technical Architecture

### State Management

**Global domain state:**
\`\`\`typescript
// In App.tsx or context
const [activeDomain, setActiveDomain] = useState<Domain>('universal')

type Domain = 'universal' | 'work' | 'family' | 'personal'
\`\`\`

**Persistence:**
\`\`\`typescript
// Save to localStorage on change
useEffect(() => {
  localStorage.setItem('symphony:activeDomain', activeDomain)
}, [activeDomain])

// Restore on load
useEffect(() => {
  const saved = localStorage.getItem('symphony:activeDomain')
  if (saved) setActiveDomain(saved as Domain)
}, [])
\`\`\`

### Filtering Hook

\`\`\`typescript
export function useFilteredTasks(activeDomain: Domain) {
  const { tasks } = useSupabaseTasks()

  return useMemo(() => {
    if (activeDomain === 'universal') {
      return tasks
    }

    return tasks.filter(task =>
      task.context === activeDomain ||
      task.context === null
    )
  }, [tasks, activeDomain])
}
\`\`\`

### Database Changes

**Add context to projects:**
\`\`\`sql
ALTER TABLE projects
ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));
\`\`\`

**Migration for existing data:**
\`\`\`sql
-- Default projects with family members to 'family'
UPDATE projects
SET context = 'family'
WHERE id IN (
  SELECT DISTINCT project_id
  FROM tasks
  WHERE assigned_to IS NOT NULL
);

-- Default remaining to null (user can triage)
\`\`\`

---

## Success Metrics

### Quantitative
- **Switching speed:** <200ms domain transition
- **Auto-tag accuracy:** 80% of tasks correctly tagged without manual override
- **Daily switches:** Users switch domains 5-10x per day (indicates active use)
- **Family Safe usage:** 30% of users enable at least once per week

### Qualitative
- **User sentiment:** "I feel in control of what I see"
- **Privacy confidence:** "I can safely show my screen to family"
- **Reduced anxiety:** "I'm not worried about missing work tasks when in Family mode"
- **Delight moment:** "Auto-switching to Family at 6pm feels magical"

---

## Risk Assessment & Mitigation

### Overall Risk Level: **LOW to MEDIUM**

The infrastructure exists, making this primarily a UI/UX change. Biggest risks are workflow disruption and calendar integration complexity.

---

### Risk Category 1: Code Breakage 🟡 MEDIUM

**What could break:**

| Component | Risk | Impact | Mitigation |
|-----------|------|--------|------------|
| TodaySchedule | Task filtering logic changes | Tasks might not display | Feature flag: `ENABLE_DOMAIN_FILTERING` (default: false) |
| HomeView | Event filtering by calendar domain | Events might disappear | Calendar domain mapping optional, defaults to "show all" |
| useSupabaseTasks | New filtering hook wraps existing | Potential performance hit | Memoization + testing with large datasets |
| TaskCard | Domain pill rendering | Visual bugs | Optional rendering, degrades gracefully |
| ProjectView | Context inheritance logic | Tasks might inherit wrong domain | Inheritance is additive, never removes existing context |

**Mitigation strategy:**
```typescript
// Feature flag approach
const FEATURES = {
  domainFiltering: false, // Turn on after testing
  calendarDomains: false,
  familySafeMode: false,
}

// Filtering with fallback
function useFilteredTasks(domain: Domain) {
  if (!FEATURES.domainFiltering) {
    return tasks // No filtering, original behavior
  }
  return filteredTasks
}
```

**Rollback plan:**
- All filtering is client-side only
- No data destruction
- Feature flag turns filtering off → back to current behavior
- Zero database changes needed for Phase 1

---

### Risk Category 2: Workflow Disruption 🟢 LOW

**Existing workflows that change:**

| Current Behavior | New Behavior | User Impact | Severity |
|-----------------|--------------|-------------|----------|
| See all tasks always | See filtered tasks by domain | Could "lose" tasks in wrong domain | LOW - Universal view shows everything |
| Tasks have optional context tag | Context affects visibility | Need to tag tasks | LOW - Null tasks show in current domain |
| One unified calendar view | Calendar events filtered by domain | Work events hidden in Family view | MEDIUM - But this is the point! |
| QuickCapture → inbox | QuickCapture → inbox (same) | None | NONE |

**The "Where did my tasks go?" problem:**

**Scenario:** User switches to Work domain, doesn't see family tasks, panics.

**Mitigation:**
1. **Onboarding tooltip:** "You're viewing Work domain. Switch to Universal to see everything."
2. **Empty state messaging:** "No work tasks. Switch to Universal or create your first work task."
3. **Domain indicator always visible:** Can't forget which domain you're in
4. **Search spans all domains:** Cmd+K search shows all tasks regardless of active domain

---

### Risk Category 3: Database Changes 🟢 LOW

**Required migrations:**

**Phase 1:** ZERO database changes
- Filtering uses existing `task.context` field
- All changes are UI/state management

**Phase 2:** Single non-destructive migration
```sql
-- Add context to projects (nullable, default null)
ALTER TABLE projects
ADD COLUMN context TEXT CHECK (context IN ('work', 'family', 'personal'));

-- No data loss, purely additive
```

**Phase 3:** Calendar domain mapping (new table)
```sql
-- New table, doesn't touch existing data
CREATE TABLE calendar_domain_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  calendar_id TEXT NOT NULL,
  calendar_email TEXT NOT NULL,
  domain TEXT CHECK (domain IN ('work', 'family', 'personal')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Data migration risk:** NONE
- No existing data modified
- All changes are additive
- Null values preserve current behavior

**Rollback:** Trivial
```sql
-- Phase 2 rollback
ALTER TABLE projects DROP COLUMN context;

-- Phase 3 rollback
DROP TABLE calendar_domain_mappings;
```

---

### Risk Category 4: Calendar Integration 🟡 MEDIUM

**Complexity:** Moderate

**Current state:**
- useGoogleCalendar fetches all events from all calendars
- No calendar-level granularity

**Required changes:**
1. Track which calendar each event comes from
2. Store calendar → domain mappings
3. Filter events by calendar domain

**Risk points:**

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Google API returns mixed calendar events | Can't filter by domain | Parse `event.organizer.email` to identify calendar |
| User has 10+ calendars | Complex mapping UI | Collapsible list, search, bulk actions |
| Calendar domains out of sync | Events in wrong domain | "Refresh calendar mappings" button |
| User removes calendar access | Domain mapping orphaned | Graceful degradation, hide mapping |

**Implementation complexity:**
```typescript
// Current (simple)
const { events } = useGoogleCalendar()

// New (moderate complexity)
const { events, calendars } = useGoogleCalendar()
const { calendarMappings } = useCalendarDomains()
const filteredEvents = events.filter(e =>
  calendarMappings[e.calendar_id]?.domain === activeDomain
)
```

**Mitigation:**
- Phase 3 feature (not MVP)
- Can ship domain switching without calendar filtering
- Calendar domains are optional enhancement

---

### Risk Category 5: User Experience 🟡 MEDIUM

**Confusion points:**

**1. "Why can't I see my tasks?"**
- **Cause:** Switched to Work, family tasks hidden
- **Severity:** HIGH initially, LOW after learning
- **Fix:** Persistent domain indicator, onboarding

**2. "How do I tag tasks efficiently?"**
- **Cause:** Manual tagging every task is tedious
- **Severity:** MEDIUM
- **Fix:** Smart auto-tagging, project inheritance, bulk operations

**3. "I forgot to switch domains before creating task"**
- **Cause:** Created work task while in Family domain
- **Severity:** LOW
- **Fix:** Easy to re-tag via context picker, or move via drag-drop

**4. "Calendar events disappeared"**
- **Cause:** Calendar domain filtering active
- **Severity:** HIGH if unexpected
- **Fix:** Calendar domains OFF by default, opt-in only

**Mitigation strategy:**
- Universal domain as default
- Progressive disclosure (Phase 1 → 2 → 3)
- In-app tips on first domain switch
- "Undo" for accidental domain changes

---

### Risk Category 6: Performance 🟢 LOW

**Filtering overhead:**
```typescript
// Current: Render all tasks
tasks.map(task => <TaskCard task={task} />)

// New: Filter then render
tasks
  .filter(t => t.context === activeDomain || t.context === null)
  .map(task => <TaskCard task={task} />)
```

**Impact:** Negligible
- O(n) filter operation on each render
- Mitigated by useMemo
- Typical dataset: <500 tasks
- Filter time: <1ms

**Stress test:**
- 10,000 tasks: ~10ms filter time
- Still acceptable for 60fps (16ms frame budget)

---

### Risk Category 7: Testing Coverage 🟡 MEDIUM

**Existing tests that need updates:**

| Test File | Changes Needed | Risk |
|-----------|---------------|------|
| TodaySchedule.test.tsx | Add domain filtering tests | LOW |
| HomeView.test.tsx | Test domain state management | MEDIUM |
| TaskCard.test.tsx | Test domain pill rendering | LOW |
| useSupabaseTasks.test.ts | Test filtering hook | MEDIUM |

**New tests required:**
- Domain switching behavior (5 tests)
- Filtering logic (8 tests)
- Context inheritance (10 tests)
- Calendar domain mapping (12 tests)

**Test coverage gap:** ~35 new tests needed

**Mitigation:**
- Write tests BEFORE implementation
- Feature flag allows incremental testing
- Dogfooding on real data before release

---

### Summary: Risk Matrix

| Category | Risk Level | Impact | Effort to Mitigate | Priority |
|----------|-----------|--------|-------------------|----------|
| Code breakage | 🟡 MEDIUM | High | Low (feature flags) | P0 |
| Workflow disruption | 🟢 LOW | Medium | Medium (onboarding) | P1 |
| Database changes | 🟢 LOW | Low | Low (additive only) | P2 |
| Calendar integration | 🟡 MEDIUM | Medium | High (API complexity) | P2 |
| User experience | 🟡 MEDIUM | High | Medium (UI polish) | P0 |
| Performance | 🟢 LOW | Low | Low (memoization) | P3 |
| Testing coverage | 🟡 MEDIUM | Medium | High (35 tests) | P1 |

**Overall assessment:**
- **Shippable with caution**
- Phase 1 (basic switching) is LOW RISK
- Phase 2 (inheritance) is LOW-MEDIUM RISK
- Phase 3 (calendar domains) is MEDIUM RISK

**Recommended approach:**
1. Ship Phase 1 behind feature flag
2. Dogfood for 1 week
3. Enable for all users
4. Wait 2 weeks, collect feedback
5. Then start Phase 2

---

## Open Questions for Scott

1. **Default domain on open:**
   - Universal (see everything)?
   - Last-used domain?
   - Time-based (work during work hours)?

2. **Null-tagged tasks behavior:**
   - Show in all domains until tagged?
   - Auto-tag to current domain on creation?
   - Show warning badge "needs triage"?

3. **Domain bar collapsed state:**
   - Icons only?
   - Single pill showing active domain?
   - Hidden entirely (domain in header instead)?

4. **Mobile domain switcher:**
   - Top of screen (always visible)?
   - Bottom sheet tab bar?
   - Swipe gesture between domains?

5. **Family Safe mode:**
   - Hard switch to Family only?
   - Or just hide domain indicators (content still filtered)?

6. **Calendar domain filtering:**
   - Ship in Phase 1, or defer to Phase 3?
   - Required for MVP, or nice-to-have?

---

## Next Steps

1. **Review this proposal** → Scott provides feedback
2. **User testing** → Quick prototype in Figma, get Iris's input
3. **Phase 1 implementation** → Basic domain switching (1 week)
4. **Dogfood** → Use it for 1 week before rolling out phases 2-3
5. **Iterate** → Adjust based on real usage patterns

---

## Sources & Research

### Context Switching Research
- [Asana: Context Switching Productivity Impact](https://asana.com/resources/context-switching)
- [Flowtrix: Enterprise UX 2025](https://www.flowtrix.co/blogs/enterprise-ux-in-2025-transforming-digital-workplaces)
- [Atlassian: How Context Switching Ruins Productivity](https://www.atlassian.com/blog/productivity/context-switching)
- [Medium: Why Context-Aware UI Is Gaining Ground in 2025](https://medium.com/@marketingtd64/why-context-aware-ui-is-gaining-ground-in-2025-9aac327466b8)

### App Comparisons & Patterns
- [Things 3 vs Todoist Comparison](https://blog.offlight.work/post/things3-vs-todoist)
- [Detailed Things 3 vs Todoist Review](https://upbase.io/blog/todoist-vs-things-3/)

### Focus Mode & Filtering
- [Apple Focus Filters - WWDC22](https://developer.apple.com/videos/play/wwdc2022/10121/)
- [Filter UI Examples for SaaS](https://www.onething.design/post/best-filter-ux-ui-examples-saas-applications)
- [Best Focus Apps 2025](https://clickup.com/blog/focus-apps/)

### Multi-Domain Task Management
- [Best Shared Task Management Apps for Families](https://www.getduodo.com/blog/best-shared-task-management-apps-families-duodo-tops-list)

---

**This is the blueprint. Now we build.**
