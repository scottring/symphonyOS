# Symphony OS: Onboarding Flow Review & Update

*Last updated: December 2024*
*Based on: V2 rebuild with Timeline Companion, AI features, and enhanced execution*

---

## Current Onboarding Flow Analysis

### Existing Steps (12 total)
1. **Welcome** - Intro messaging
2. **Building Blocks** - Explains tasks, projects, routines
3. **Brain Dump Tasks** - User creates 3+ tasks
4. **Brain Dump Projects** - Optional project creation
5. **Brain Dump Routines** - Optional routine creation
6. **Family Setup** - Add family members
7. **Assign Routines** - Assign created routines to family
8. **Triage Demo** - Shows schedule/defer/skip actions
9. **Today Preview** - Shows actual Today view with created data
10. **Review Intro** - Explains weekly review concept
11. **Planning Intro** - Explains planning mode
12. **Complete** - Success message and optional calendar connect

### Strengths
✅ Good conceptual introduction (building blocks)
✅ Hands-on task creation
✅ Shows real interface with user's data
✅ Explains key workflows (triage, review, planning)
✅ Ends with optional calendar connection

### Gaps & Issues
❌ **Doesn't showcase Timeline Companion** (the hero feature!)
❌ **No AI demonstration** (meal planning, planning assistance)
❌ **Too long** (12 steps is a lot, ~8-10 minutes)
❌ **Delayed value** (doesn't show coordination magic until very end)
❌ **Missing key features**: Pins, Lists, Notes, Attachments, Linked tasks
❌ **Family setup too early** (before seeing why it matters)
❌ **Projects and Routines optional** (but they're core features)
❌ **No "wow" moment early** (first 5 steps are setup-heavy)

---

## Updated Onboarding Strategy

### Design Principles
1. **Show value within 60 seconds** - Don't wait until step 10
2. **Lead with differentiation** - Timeline Companion is unique, show it early
3. **Make it hands-on but not tedious** - Touch every feature lightly
4. **Progressive disclosure** - Core features first, power features later
5. **Multiple completion points** - Light users can finish early, power users go deeper
6. **Personalized paths** - Solo user vs. family coordinator

### Target Metrics
- **Complete onboarding:** 85% (currently ~65%)
- **Time to value:** <2 minutes (see their first success)
- **Total time:** 5-7 minutes for core flow
- **Satisfaction:** "This is different" feeling

---

## Proposed New Flow (Version 2.0)

### Core Flow (7 steps, ~5 minutes)
*Everyone goes through these*

#### **Step 1: Welcome with Vision** (30 seconds)
**Replaces:** Current Welcome step
**Updates:**
- Keep existing "Know what you have to do. Be ready when it's time." headline
- Add animated preview of Timeline Companion (3-second loop)
- Show split-screen: "Plan on desktop → Execute on mobile"
- Optional: "Solo or family? We work both ways."

**New Copy:**
```
Headline: Know what you need to do. Be ready when it's time.

Body: Symphony OS brings together tasks, calendar, routines, and family 
coordination into one calm, clear system. Desktop for planning, mobile for 
execution.

Teaser visual: Timeline Companion subway-map animation (3-second loop)
```

---

#### **Step 2: Quick Setup - Just You** (60 seconds)
**Replaces:** Building Blocks
**New approach:**
- Get name and color (for family coordination later)
- "Connect Google Calendar?" (optional, skip for now)
- "Anyone else in your household?" (skip or add 1-2 names)
- Keep it FAST - defer detailed family setup

**Rationale:** Get through setup quickly to reach value

**New Copy:**
```
Headline: Let's get you set up

You:
Name: [Scott] (pre-filled from auth)
Color: [color picker] 

Optional: Anyone else sharing your life?
[+ Add family member]
[Name] [Color] 

[Skip for now] [Continue]
```

---

#### **Step 3: Brain Dump (The Good Kind)** (90 seconds)
**Keep:** Current brain dump tasks approach
**Updates:**
- Lower minimum from 3 to 2 tasks
- Add AI suggestion: "Stuck? Click for AI starter suggestions"
- Show immediate value: "These will surface at the right time"

**New Copy:**
```
Headline: What's rattling around in your head?

Body: Just get it out. You'll organize it later.
(We'll show you how to triage in a minute.)

[Add task input with + button]

AI button: "Need ideas?" → suggests common tasks based on time of day

Minimum: 2 tasks (currently 3)
```

---

#### **Step 4: Timeline Companion - The WOW Moment** (60 seconds)
**NEW STEP - Hero Feature**
**Purpose:** Show the differentiation early
**Interaction:** Animated demo + hover to explore

**What it shows:**
- Subway-map view with you + any family members added
- Pre-populated sample day showing:
  - Individual activities (diverging lines)
  - Shared moments (converging lines - dinner, morning routine)
  - Moving dots showing "now"
  - Conflict detection (yellow highlight)

**Copy:**
```
Headline: See your day like a subway map

Body: Everyone's a line. Lines converge at shared moments, diverge for 
individual time. Conflicts glow yellow before they become chaos.

[Interactive demo - hover to see details]
[Timeline shows: Morning routine → Individual work/school → Dinner together]

Bottom hint: "This is how families actually coordinate."

[Continue]
```

**Technical note:** Use pre-built demo data, not user's 2 tasks

---

#### **Step 5: Add Context (The Secret Sauce)** (90 seconds)
**Replaces:** Triage Demo
**New approach:** Show context attachments instead of defer actions
**Purpose:** Demonstrate execution advantage

**Interaction:**
- Take one of user's created tasks
- Walk through adding context:
  - Phone number → "One tap to call"
  - Notes → "Your questions right here"
  - Link → "No searching later"
  - Contact (optional) → "All their info attached"

**Copy:**
```
Headline: The difference is in the details

Body: When it's time to do this task, you'll have everything you need.
No searching, no "wait, what was I supposed to ask?"

[Task card for "Call dentist"]

Add context:
☎️ Phone number: [input] → Shows "Tap to call"
📝 Notes: [input] → Your questions/reminders
🔗 Link: [input] → Related webpage
👤 Contact: [optional] → All their info

Bottom: "This is why you won't need to keep it all in your head."

[Continue]
```

---

#### **Step 6: Today View (Your Command Center)** (60 seconds)
**Keep:** Current Today Preview
**Updates:**
- Shorter intro, faster to interface
- Show the enriched task from Step 5 in Today view
- Quick interaction: "Try checking it off!"
- Show Timeline toggle: "See Timeline Companion view anytime"

**Copy:**
```
Headline: This is your Today view

Body: Everything for today, all in one place.

[Live Today interface with user's tasks]

Prompt: "Try it! Check off a task and see what happens."
[User checks task → Success animation + "Nice!"]

Timeline toggle hint: "Toggle Timeline view anytime"

[Continue]
```

---

#### **Step 7: You're Ready!** (30 seconds)
**Replaces:** Complete step
**Updates:**
- More confident tone
- Skip optional calendar connect here (add to home screen banner instead)
- Add quick links to features they haven't seen yet
- Provide "Pro user? Learn advanced features" link

**Copy:**
```
Headline: You're ready to go!

Body: Your tasks are in. Symphony's got your back.

Daily rhythm:
• Morning: Check Today view
• During day: Quick capture (⌘K)
• Evening: Triage inbox (2 min)

Haven't explored yet:
→ Planning Mode - Drag tasks onto calendar
→ Routines - Recurring tasks on autopilot
→ Projects - Group related tasks
→ Meal Planning - AI-powered week planning

[Go to Today] [Explore features →]
```

---

### Optional Deep Dive (5 additional steps)
*For power users who want the full tour*

**Access:** "Explore features →" button at end of core flow

#### **Step 8: Routines (For Recurring Life)** (60 seconds)
- What they are and why they matter
- Create one sample routine together
- Show routine on timeline
- Skip button prominent

#### **Step 9: Projects (For Complex Goals)** (60 seconds)
- Explain project concept
- Create one sample project
- Add tasks to it
- Show status auto-calculation
- Skip button prominent

#### **Step 10: Planning Mode (Desktop Power)** (60 seconds)
- Show drag-and-drop calendar
- Explain desktop vs. mobile philosophy
- Demo: Drag unscheduled task to time slot
- Show conflicts detection
- Skip button prominent

#### **Step 11: AI Meal Planning (The Dinner Solution)** (90 seconds)
- Show meal planning prompt interface
- Demo: "Plan dinners for this week, we're busy Tuesday"
- Show AI-generated meal plan
- Show recipe and grocery list
- Skip button prominent

#### **Step 12: Advanced Features Tour** (60 seconds)
- Lists for shopping/packing/etc
- Notes with topics
- Pins for quick access
- Attachments on tasks
- Review mode
- Links to help docs

---

## Implementation Plan

### Phase 1: Critical Updates (Do First)
**Priority:** High
**Effort:** Medium
**Impact:** High

1. **Create Timeline Companion Demo Step (Step 4)**
   - Build demo data generator
   - Create animated subway-map view
   - Add interaction hints
   - TEST: Does it "wow" users?

2. **Create Context Attachment Step (Step 5)**
   - Redesign from Triage Demo
   - Focus on adding value, not managing tasks
   - Show execution advantage clearly

3. **Streamline Setup (Step 2)**
   - Combine family setup into quick version
   - Defer detailed setup to later
   - Add "Skip" prominently

4. **Update Welcome with Vision (Step 1)**
   - Add Timeline Companion teaser animation
   - Show desktop/mobile split
   - Keep copy punchy

5. **Simplify Completion (Step 7)**
   - Remove redundant "Connect Calendar" prompt
   - Add feature discovery links
   - Make ending more confident

### Phase 2: Deep Dive Creation (Do Second)
**Priority:** Medium
**Effort:** High
**Impact:** Medium

6. **Create Optional Advanced Tour**
   - Build steps 8-12 as optional flow
   - Add skip buttons everywhere
   - Track completion rates per step

7. **Add Progressive Disclosure**
   - "Learn more" links throughout core flow
   - In-app help system
   - Feature discovery nudges

### Phase 3: Optimization (Do Third)
**Priority:** Medium
**Effort:** Low
**Impact:** Low-Medium

8. **A/B Test Variations**
   - Test Timeline step placement (step 2 vs step 4)
   - Test with/without AI demo in core flow
   - Test different copy approaches

9. **Add Personalization**
   - "Solo or family?" branch at start
   - "Basic or advanced?" at end of core
   - Remember progress for interrupted onboarding

10. **Analytics & Iteration**
    - Track completion rates per step
    - Measure time-to-value
    - Survey satisfaction at completion

---

## Specific File Changes Required

### Files to Create
1. **`TimelineCompanionDemo.tsx`** - New step 4
2. **`ContextAttachmentDemo.tsx`** - New step 5
3. **`QuickSetup.tsx`** - Replaces/updates family setup for step 2

### Files to Update
1. **`WelcomeStep.tsx`**
   - Add Timeline Companion teaser animation
   - Update copy to be more visionary
   - Show desktop/mobile split visual

2. **`BrainDumpTasks.tsx`**
   - Lower minimum from 3 to 2 tasks
   - Add AI suggestion button
   - Update hint copy

3. **`TodayPreview.tsx`**
   - Add Timeline toggle hint
   - Shorter intro
   - Add "try checking off" prompt

4. **`CompleteStep.tsx`**
   - Remove calendar connect prompt
   - Add feature discovery links
   - Update copy to be more confident

5. **`OnboardingWizard.tsx`**
   - Update step order
   - Add new steps to flow
   - Add optional advanced tour branch

### Files to Remove/Archive
1. **`BuildingBlocksStep.tsx`** - Replaced by faster setup
2. **`TriageDemo.tsx`** - Replaced by Context demo
3. **`ReviewIntro.tsx`** - Moved to advanced tour
4. **`PlanningIntro.tsx`** - Moved to advanced tour
5. **`BrainDumpProjects.tsx`** - Moved to advanced tour
6. **`BrainDumpRoutines.tsx`** - Moved to advanced tour
7. **`AssignRoutines.tsx`** - Moved to advanced tour

---

## Updated Onboarding Sequence Comparison

### Current Flow (12 steps, ~10 min)
1. Welcome
2. Building Blocks
3. Brain Dump Tasks
4. Brain Dump Projects (optional)
5. Brain Dump Routines (optional)
6. Family Setup
7. Assign Routines
8. Triage Demo
9. Today Preview
10. Review Intro
11. Planning Intro
12. Complete

**Time to first value:** Step 9 (8 minutes)
**"Wow" moment:** None explicit

### Proposed Flow (7 core + 5 optional)

**Core Flow (7 steps, ~5 min):**
1. Welcome with Vision
2. Quick Setup
3. Brain Dump (2 tasks min)
4. **Timeline Companion Demo** ⭐️ NEW
5. **Context Attachment Demo** ⭐️ NEW
6. Today View
7. Complete + Discovery

**Optional Advanced (5 steps, ~5 min):**
8. Routines
9. Projects
10. Planning Mode
11. AI Meal Planning
12. Advanced Features

**Time to first value:** Step 4 (2 minutes)
**"Wow" moment:** Step 4 - Timeline Companion

---

## Copy Guidelines for Updates

### Voice & Tone
- **Confident, not pushy** - "You're ready" not "You might want to try"
- **Clear, not clever** - Straightforward explanations
- **Warm, not corporate** - "Your family's command center" not "productivity platform"
- **Honest about effort** - "Takes 5 minutes" not "Quick and easy!"

### Key Messaging Themes
1. **Execution advantage** - "Ready when it's time" not just "organized"
2. **Context is key** - Everything you need, right when you need it
3. **Coordination clarity** - See conflicts before chaos
4. **Desktop + Mobile** - Plan deeply, execute quickly
5. **AI as assistant** - Helps you think, doesn't replace thinking

### What to Avoid
- Overwhelming feature lists
- "Revolutionary" or "game-changing" hyperbole
- Assuming user knowledge
- Apologizing for time investment
- Selling benefits they can't see yet

---

## Success Metrics

### Quantitative
- **Onboarding completion rate:** Target 85% (baseline: 65%)
- **Time to complete core:** Target 5 min (baseline: 8-10 min)
- **7-day retention:** Target 60% (baseline: 45%)
- **Feature adoption (within 7 days):**
  - Timeline Companion: 70%
  - Context attachments: 80%
  - Routines: 40%
  - Projects: 30%
  - Meal planning: 25%

### Qualitative
- **"Wow" reaction at Timeline step:** 80% positive
- **User understands differentiation:** 90% can explain key difference
- **Confidence at completion:** 80% feel "ready to use this"
- **Feature discovery:** 60% explore at least one advanced feature

### Instrumentation Required
```typescript
// Track per-step analytics
analytics.track('onboarding_step_complete', {
  step: 'timeline_companion',
  timeSpent: 45, // seconds
  interacted: true,
  skipped: false,
})

// Track completion
analytics.track('onboarding_complete', {
  path: 'core', // or 'advanced'
  totalTime: 320, // seconds
  stepsCompleted: 7,
  stepsSkipped: 0,
})

// Track feature discovery
analytics.track('feature_first_use', {
  feature: 'timeline_companion',
  daysAfterOnboarding: 0,
  triggeredFrom: 'onboarding',
})
```

---

## Timeline & Resources

### Development Timeline
- **Week 1-2:** Build Timeline Companion demo step
- **Week 3:** Build Context Attachment demo step
- **Week 4:** Update existing steps (Welcome, Setup, Complete)
- **Week 5:** Build optional advanced tour
- **Week 6:** Testing, polish, analytics
- **Week 7:** Beta rollout

**Total: 7 weeks**

### Resources Needed
- **1 Frontend Engineer:** Full-time for steps creation
- **1 Designer:** Part-time for animations and visuals
- **1 Product Manager:** Oversight, copy, testing coordination
- **Beta testers:** 10-20 for user testing

### Testing Plan
1. **Internal testing** (Week 6)
   - Team walkthrough
   - Time tracking
   - Bug fixes

2. **Closed beta** (Week 7)
   - 10 new users, no prior Symphony knowledge
   - Observed sessions (Zoom screen share)
   - Survey at completion
   - Iterate based on feedback

3. **Open beta** (Week 8)
   - 50 users
   - Analytics monitoring
   - Support ticket analysis
   - Iteration based on data

---

## Migration Strategy

### For Existing Users
- Keep current onboarding available
- Add "Take the new tour" option in settings
- Show "See Timeline Companion demo" banner in app
- Don't force retake of onboarding

### For New Users
- New flow only
- No option to see old flow
- Monitor completion rates closely

### Rollback Plan
- Feature flag for onboarding version
- Easy toggle back to current version
- Keep both versions maintained during transition period

---

## Appendix: Sample Copy (Full Text)

### Step 1: Welcome with Vision

```
[Animated Symphony logo]

Headline (Display font, 48px):
Know what you need to do.
Be ready when it's time.

Body (16px):
Symphony OS is your family's operating system. Tasks, calendar, routines, 
and coordination — all in one calm, clear place.

[Split visual: Desktop planning interface | Mobile execution interface]

Subtext (14px, muted):
Plan on desktop. Execute on mobile.
Solo or family, we've got you covered.

[Get Started button]

Already have an account? [Sign In]
```

### Step 4: Timeline Companion - The WOW

```
[Animated subway-map visualization]

Headline (Display font, 42px):
See your day like a subway map

Body (16px):
Every family member is a line. Lines converge at shared moments 
like dinner. Lines diverge for individual time like work or school.

[Interactive demo showing]:
- 3 family members as horizontal lines
- Moving dots showing current time
- Convergence at breakfast and dinner
- Divergence for work/school hours
- Yellow highlight on conflict (overlapping commitments)

Callout bubble (appearing at conflict):
"⚠️ Both parents have meetings during school pickup"

Bottom text (14px):
This is how families actually coordinate. See conflicts before 
they become chaos.

[Continue button]

[Skip tour] (small, bottom left)
```

### Step 5: Context Attachment

```
[Task card: "Call dentist"]

Headline (Display font, 36px):
The difference is in the details

Body (16px):
When it's time to do this task, you'll have everything you need.
No searching through notes or old texts.

[Interactive form]:

📞 Phone number
[Input: (555) 123-4567]
→ Shows preview: [Tap to call button]

📝 Notes for yourself
[Textarea: "Ask about teeth whitening options. Check if they 
take our insurance."]

🔗 Helpful link
[Input: https://dentist.com]

👤 Contact (optional)
[Search: Start typing name...]

[Visual: All these attach to task card with connecting lines]

Bottom text (14px, muted):
Add as much or as little context as you want. It'll be there when 
you need it.

[Continue button]
```

---

## Final Recommendations

### Do Immediately
1. **Build Timeline Companion demo** - This is the differentiator
2. **Streamline setup** - Get to value faster
3. **Test with 5 users** - Validate before full build

### Do Soon
4. **Create optional advanced tour** - Don't lose power users
5. **Add analytics** - Measure what's working
6. **Iterate based on data** - Be ready to adjust

### Consider Later
7. **Personalized paths** - Solo vs. family onboarding
8. **In-app tutorials** - For feature discovery post-onboarding
9. **Video walkthroughs** - For users who prefer watching

### Key Insight
**The current onboarding is good at teaching the system, but not good at selling the vision.** The updated flow leads with differentiation (Timeline Companion) and shows execution advantage (context) before diving into setup complexity.

**Users should think:** *"Oh, THIS is different. This could actually work."* **Not:** *"Okay, another task manager with some extra features."*

---

**Ready to implement? Start with Phase 1, test early, iterate based on user feedback.**
