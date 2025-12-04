# Onboarding Flow

**Date:** 2025-12-04
**Priority:** High
**Status:** Not Started
**Depends on:** Family assignment working

---

## Overview

Create a beautiful, effective onboarding experience that uses real data. Users complete onboarding with actual tasks, projects, and routines in their account — not a demo they have to redo.

**Core philosophy:** "Know what you have to do. Be ready when it's time."

**Duration target:** ~5-7 minutes

---

## User Flow

### Phase 1: Welcome (30 sec)

**Screen: Welcome**

```
Know what you have to do.
Be ready when it's time.

Symphony OS is your family's command center. 
It brings together everything you need to do — 
tasks, projects, routines, and calendar events — 
into one calm, clear view.

Let's get you set up. This takes about 5 minutes.

[Get Started]

Already have an account? [Sign In]
```

**Design notes:**
- Full-screen, minimal
- Tree logo centered at top
- Large serif headline (Fraunces)
- Soft cream background
- Single primary CTA button

---

### Phase 2: Sign Up (1 min)

**Screen: Create Account**

Standard auth flow — email/password or OAuth. Keep it simple.

After account creation, proceed directly to Phase 3.

---

### Phase 3: The Building Blocks (1 min)

**Screen: How Symphony Works**

Three-card horizontal scroll or stack:

**Card 1: Tasks**
```
📋 Tasks
The single things you need to do.
"Buy milk." "Call the dentist." "Email the contractor."
```

**Card 2: Projects**
```
📁 Projects  
Groups of tasks working toward a goal.
"Plan birthday party" might include: 
book venue, order cake, send invites.
```

**Card 3: Routines**
```
🔄 Routines
Things you do on repeat.
"Walk the dog." "Empty dishwasher." "Pack lunches."
Track them so nothing falls through the cracks.
```

```
[Continue]
```

**Design notes:**
- Cards should be visually distinct, maybe with subtle icons
- Quick read — don't overexplain
- Swipeable on mobile, side-by-side on desktop

---

### Phase 4: Brain Dump — Tasks (2-3 min)

**Screen: What's on your mind?**

```
What's on your mind right now?

Don't overthink this. Just get it out of your head.
You can organize everything later.

[____________________________] [+]

• Buy groceries
• Call mom
• Schedule dentist appointment

---
💡 Stuck? Think about: errands, calls to make, 
   emails to send, things due this week.

[Continue] (appears after 3+ items)
```

**Behavior:**
- Large input field with focus on load
- Press Enter or tap + to add
- Items appear as simple list below
- Minimum 3 tasks to enable Continue
- No validation on content — just capture

**Data:**
- Each entry creates a real task record
- `scheduled_for: null` (lands in Inbox)
- `domain: 'personal'` (default)
- `status: 'active'`

---

### Phase 5: Brain Dump — Projects (2 min)

**Screen: What are you working on?**

```
What bigger things are you working on?

A project is just a goal that needs multiple steps.
Renovating the kitchen. Planning a vacation. 
Finding a new daycare.

[____________________________] [+]

• Kitchen renovation
• Summer trip planning

---
[Continue] (appears after 1+ project)
[Skip — I'll add projects later]
```

**Behavior:**
- Same rapid-entry pattern as tasks
- Minimum 1 project to enable Continue
- Skip option for users who don't think in projects

**Data:**
- Each entry creates real project record
- `status: 'active'`

**Follow-up (optional enhancement):**
After creating projects, could show: "Want to move any tasks into a project?" with drag-and-drop. But this may be too complex for V1 onboarding — skip if time-constrained.

---

### Phase 6: Brain Dump — Routines (2 min)

**Screen: What do you do on repeat?**

```
What do you do regularly?

Morning rituals. Weekly chores. Daily habits.
These are the things that need to happen 
over and over again.

[____________________________] 
[Every day ▼] [+]

• Take vitamins — Every day
• Pack kids' lunches — Weekdays  
• Take out trash — Weekly

---
💡 Examples: exercise, meal prep, laundry, 
   check email, water plants, walk the dog

[Continue] (appears after 2+ routines)
[Skip — I'll add routines later]
```

**Behavior:**
- Input field + recurrence dropdown
- Recurrence options: Every day, Weekdays, Weekly, Custom
- Minimum 2 routines to enable Continue
- Skip option available

**Data:**
- Each entry creates real routine record
- `recurrence_pattern` based on selection
- `show_on_timeline: true` (default)

---

### Phase 7: Your Family (2 min)

**Screen: Who's in your household?**

```
Who's in your household?

Add the people who share your life (and your to-do list).

[Your name: Scott____________]

Family members:
┌─────────────────────────────┐
│ 🟣 Iris          [Remove]  │
│ 🟢 Ella          [Remove]  │
│ 🟠 Kaleb         [Remove]  │
└─────────────────────────────┘

[+ Add family member]

[Continue]
```

**Add member flow:**
- Name (required)
- Color picker (blue, purple, green, orange, pink, red)
- Initials auto-generated
- Optional: photo upload (skip for V1)

**Behavior:**
- First user (account owner) pre-populated
- Can add 0+ additional members
- Continue available even with just self

**Data:**
- Creates family_members records
- Account owner gets `is_user: true`
- Others get `is_user: false`

---

### Phase 8: Assign Your Routines (1-2 min)

**Screen: Who does what?**

```
Who does what?

Tap the avatar to assign each routine.

┌────────────────────────────────────────┐
│ Take vitamins              [👤]       │
│ Every day                              │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Pack kids' lunches         [🟣 I]     │
│ Weekdays                               │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Walk the dog               [🔵 S]     │
│ Every day                              │
└────────────────────────────────────────┘

[Continue]
[Skip — I'll assign later]
```

**Behavior:**
- Shows routines created in Phase 6
- Each has assignee avatar (unassigned = silhouette)
- Tap avatar → dropdown with family members
- Continue available anytime (assignment is optional)

**Data:**
- Updates routine.assigned_to

---

### Phase 9: Learn to Triage (2 min)

**Screen: Life changes. Symphony adapts.**

Interactive mini-tutorial using one of their actual tasks.

```
Life changes. Symphony adapts.

Here's one of your tasks:

┌────────────────────────────────────────┐
│ Call mom                               │
│ In your inbox                          │
└────────────────────────────────────────┘

Can't do this today? You have options:

┌──────────────────┐
│ 📅 Schedule      │  Pick a specific day
│    Thursday      │  to do this task
└──────────────────┘

┌──────────────────┐
│ 💤 Defer         │  Hide it until you're  
│    Next week     │  ready to think about it
└──────────────────┘

┌──────────────────┐
│ ⏭️ Skip          │  Not today — show me
│                  │  tomorrow instead
└──────────────────┘

Try it! Tap one of the options above.
```

**After they tap an option:**

```
Perfect! 

You scheduled "Call mom" for Thursday.
It'll appear on your Today view that morning.

---

💡 Pro tip: Defer entire projects and all their 
   tasks hide until that date. Perfect for 
   "I'll deal with this after the holidays."

[Continue]
```

**Behavior:**
- Pull first task from their brain dump
- Three tappable action cards
- User must tap one to proceed
- Shows confirmation of what happened
- Actually updates the task record

---

### Phase 10: Your Today View (1 min)

**Screen: Your daily cockpit**

```
This is your Today view.

Everything you need to do, right here.
Nothing hidden, nothing forgotten.
```

*Show their actual Today view with real data:*
- Section headers (Morning, Afternoon, etc.)
- Any routines they created
- Any tasks they scheduled
- Inbox section with remaining unscheduled tasks

```
💡 Check this each morning. 
   Triage your inbox each evening.
   That's the habit that makes this work.

[Continue]
```

**Behavior:**
- This is a preview — read-only
- Shows their real data populated during onboarding
- Brief annotation explaining sections

---

### Phase 11: Mobile Preview (30 sec)

**Screen: Take it with you**

```
Plan on desktop. Execute on mobile.

On your phone, it's all about action:

[Mobile phone mockup showing their Today view]

• Swipe left to complete ✓
• Swipe right for options
• Tap to see details

---

[Continue]
```

**Behavior:**
- Static mockup or animated demo
- Shows mobile gestures visually
- Could skip on mobile (they're already there)

---

### Phase 12: Complete (30 sec)

**Screen: You're ready**

```
You're all set.

Your brain is empty. Symphony holds it all.

One last thing: at the end of each day, 
take 2 minutes to triage your inbox.
That's the habit that makes this work.

[Go to Today]

---

Optional:
[Connect Google Calendar] — See your events 
alongside your tasks
```

**Behavior:**
- Primary CTA goes to main app
- Optional calendar connection CTA
- Mark onboarding complete in database

---

## Technical Implementation

### Database Changes

```sql
-- Add onboarding tracking to user_profiles
alter table user_profiles 
  add column if not exists onboarding_step text default 'welcome';
  
alter table user_profiles 
  add column if not exists onboarding_completed_at timestamptz;

-- Possible values for onboarding_step:
-- 'welcome', 'signup', 'building_blocks', 'tasks', 'projects', 
-- 'routines', 'family', 'assign', 'triage', 'today', 'mobile', 'complete'
```

### New Components

```
src/components/onboarding/
├── OnboardingWizard.tsx      # Parent orchestrator
├── OnboardingProgress.tsx    # Progress dots/bar
├── steps/
│   ├── WelcomeStep.tsx
│   ├── BuildingBlocksStep.tsx
│   ├── BrainDumpTasks.tsx
│   ├── BrainDumpProjects.tsx
│   ├── BrainDumpRoutines.tsx
│   ├── FamilySetup.tsx
│   ├── AssignRoutines.tsx
│   ├── TriageDemo.tsx
│   ├── TodayPreview.tsx
│   ├── MobilePreview.tsx
│   └── CompleteStep.tsx
└── shared/
    ├── OnboardingCard.tsx    # Reusable card wrapper
    ├── QuickAddList.tsx      # Brain dump rapid entry
    └── OnboardingButton.tsx  # Styled CTAs
```

### OnboardingWizard.tsx Structure

```tsx
interface OnboardingState {
  step: OnboardingStep
  tasks: string[]           // Titles from brain dump
  projects: string[]        // Titles from brain dump
  routines: RoutineInput[]  // Title + recurrence
  familyMembers: FamilyMemberInput[]
}

function OnboardingWizard() {
  const [state, setState] = useState<OnboardingState>(...)
  const { user } = useAuth()
  
  // Load saved progress on mount
  useEffect(() => {
    loadOnboardingProgress(user.id)
  }, [])
  
  // Save progress on step change
  useEffect(() => {
    saveOnboardingProgress(user.id, state.step)
  }, [state.step])
  
  // Render current step
  return (
    <div className="min-h-screen bg-bg-base">
      <OnboardingProgress current={state.step} />
      {renderStep(state.step)}
    </div>
  )
}
```

### Routing

```tsx
// In App.tsx or router config
function App() {
  const { user, profile } = useAuth()
  
  // Redirect to onboarding if not completed
  if (user && !profile?.onboarding_completed_at) {
    return <OnboardingWizard />
  }
  
  return <MainApp />
}
```

### Brain Dump Data Flow

When user completes tasks brain dump:
1. Create task records immediately (optimistic)
2. Store task IDs in onboarding state
3. Use these IDs in later steps (triage demo uses first task)

```tsx
async function handleTasksComplete(titles: string[]) {
  const tasks = await Promise.all(
    titles.map(title => createTask({ 
      title, 
      scheduled_for: null,
      status: 'active' 
    }))
  )
  
  setState(prev => ({ 
    ...prev, 
    taskIds: tasks.map(t => t.id),
    step: 'projects' 
  }))
}
```

---

## Design Guidelines

### Visual Style
- Consistent with Nordic Journal theme
- Cream background (`bg-bg-base`)
- Large Fraunces headlines
- Plenty of whitespace
- Soft shadows on cards
- Primary green for CTAs

### Typography
- Headlines: `text-3xl font-display font-semibold`
- Body: `text-lg text-neutral-600 leading-relaxed`
- Hints: `text-sm text-neutral-400`

### Animations
- Subtle fade-in for each step
- Cards slide up on entry
- Progress bar animates between steps
- Success states get gentle scale pulse

### Mobile Considerations
- All steps must work on mobile viewport
- Brain dump input should be thumb-friendly
- Skip mobile preview step when on mobile device
- Consider reducing text for smaller screens

---

## Edge Cases

### User refreshes mid-onboarding
- Progress saved to database
- Resume from saved step
- Data created so far persists

### User clicks browser back
- Handle gracefully — either go to previous step or show confirmation

### User has no routines to add
- Skip button available
- Continue works with 0 routines

### User is solo (no family)
- Family step shows just them
- Assignment step still works (self-assign)
- Can skip both family steps

### User signs up on mobile
- Skip mobile preview step
- Gestures are immediately relevant

### Returning user re-triggers onboarding
- Add "Replay onboarding" option in Settings
- Resets onboarding_step, clears onboarding_completed_at
- Doesn't delete data — just replays educational flow

---

## Verification Checklist

### Flow
- [ ] Welcome screen renders correctly
- [ ] Sign up creates account and proceeds
- [ ] Building blocks cards display properly
- [ ] Task brain dump saves real tasks
- [ ] Project brain dump saves real projects  
- [ ] Routine brain dump saves real routines with recurrence
- [ ] Family setup creates family_members records
- [ ] Assignment updates routine.assigned_to
- [ ] Triage demo updates actual task
- [ ] Today preview shows real data
- [ ] Complete screen marks onboarding done

### Data Integrity
- [ ] Tasks appear in Inbox after onboarding
- [ ] Projects appear in Projects view
- [ ] Routines appear on Today view
- [ ] Family members appear in assignment dropdowns
- [ ] All data persists after logout/login

### Progress Persistence
- [ ] Refreshing resumes at correct step
- [ ] Closing browser and returning resumes correctly
- [ ] onboarding_completed_at set on finish

### Edge Cases
- [ ] Skip buttons work for optional steps
- [ ] Works on mobile viewport
- [ ] Works with 0 family members
- [ ] Re-triggering onboarding works from Settings

### Polish
- [ ] Animations feel smooth
- [ ] Typography matches design system
- [ ] Progress indicator updates correctly
- [ ] All CTAs have hover/active states

---

## Future Enhancements (Not V1)

- [ ] Drag tasks into projects during onboarding
- [ ] Calendar connection during onboarding
- [ ] Import from other apps (Todoist, Things, etc.)
- [ ] Team/workspace onboarding for multi-user
- [ ] Onboarding analytics (where do people drop off?)
- [ ] A/B test different step orders
