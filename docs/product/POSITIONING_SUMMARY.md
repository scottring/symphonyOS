# Positioning Summary: How Everything Fits Together

*Quick reference showing how Symphony's key concepts work together*

---

## The Core Value Proposition

**Problem:** You capture information (links, phone numbers, notes), but it never surfaces when you need it. You spend minutes hunting across apps.

**Solution:** Symphony makes context first-class. Attach everything during planning. It surfaces automatically during execution.

**Outcome:** Set it up once → Surfaces every time.

---

## Capture first; structure together

Clarified by Scott, 2026-10-15: Symphony is a “post-scribed” platform. People
capture their ideas, goals, tasks and routines before they need a finished plan.
Symphony helps organise that material and bring it into attention at the right
time and planning horizon. Capturing something is not a commitment to do it now.

The AI contributes questions, connections, conflict checks and options for
structuring the person’s own activities. Intentions, priorities and commitments
remain theirs. Open time does not need filling, and an idea can stay undated or
wait for a later period. This is the existing “Structures, never supplies” rule
in the planning-by-conversation design.

Use invitations such as **“Help me plan the rest of my week”**. The wording
should convey collaboration and preserve the person’s ownership of the plan.

---

## The Three Pillars

### 1. Context-Linking (What Makes Us Different)

Tasks and projects are **rich containers**, not just titles:

```
Task: "Order kitchen backsplash"
├─ Link: https://tilesupplier.com/arctic-white-subway
├─ Phone: (555) 123-4567 (ABC Tile Supply)
├─ Notes: "3x6 size, Arctic White, 45 sq ft needed"
└─ Photo: kitchen.jpg (future)

Project: "Kitchen Remodel"
├─ Link: https://contractor-website.com
├─ Phone: (555) 987-6543 (Bob Johnson, contractor)
└─ Notes: "Quote approved $8,500, starts March 15"
    └─ Tasks inherit project context
```

**When you need to act:**
- Tap "Order kitchen backsplash"
- See: Product link, supplier phone, your notes, project contractor info
- Execute in 30 seconds, no searching

This is **context surfacing** — the information you need appears when you need it.

---

### 2. Three Domains (Work, Personal, Family)

Your life happens in three contexts. Symphony treats all three equally.

| Domain | Purpose | Privacy | Examples |
|--------|---------|---------|----------|
| **Work** | Professional life | Private | Client calls, project deadlines, code reviews |
| **Personal** | Individual goals | Private | Health goals, hobbies, learning, self-care |
| **Family** | Shared household | Shared | Kids' schedules, home projects, errands |

**Domain separation means:**
- Filter by domain: See only work during work hours
- Privacy controls: Work/personal never visible to family
- Equal importance: Not a "family app with work bolted on"

**Current implementation:**
```typescript
type TaskContext = 'work' | 'family' | 'personal'

// Tasks tagged with context
task.context = 'work'     // Private to you
task.context = 'personal' // Private to you
task.context = 'family'   // Visible to household
```

**Future evolution (V2):**
- Domains become full containers with separate views
- Time-based filtering (only work tasks during work hours)
- Location-based surfacing (home tasks when you're home)

---

### 3. Individual + Sharing (Architecture Model)

**Built for individuals, designed for sharing.**

```
┌─────────────────────────────────────┐
│         User (Primary Unit)         │
├─────────────────────────────────────┤
│ Work Domain (Private)               │
│  ├─ Projects                        │
│  ├─ Tasks                           │
│  └─ Calendar events                 │
├─────────────────────────────────────┤
│ Personal Domain (Private)           │
│  ├─ Projects                        │
│  ├─ Tasks                           │
│  └─ Goals                           │
├─────────────────────────────────────┤
│ Family Domain (Shared)              │
│  ├─ Shared projects                 │
│  ├─ Assigned tasks                  │
│  └─ Shared calendar                 │
│     ↕                                │
│  [Household Members Can See]        │
└─────────────────────────────────────┘
```

**This means:**
- You are the primary user, not your family
- Each person has their own account, inbox, planning sessions
- Private data (work/personal) stays private
- Family data sharing is robust and first-class
- Think: "Personal OS with multiplayer mode"

**NOT:**
- "Family app with private folders"
- "Team tool trying to work for individuals"
- "All-or-nothing sharing"

**Household sharing:**
```typescript
// User belongs to household (optional)
household_members
  ├─ Scott (owner)
  ├─ Iris (member)
  └─ Can see each other's 'family' context tasks

// Privacy preserved
task.context = 'work'     → Only Scott sees it
task.context = 'personal' → Only Scott sees it
task.context = 'family'   → Both Scott and Iris see it

// Assignments flow
Scott creates task → Assigns to Iris → Iris sees in her view
```

---

## How They Work Together: User Journey

### **Planning (Desktop - Sunday morning)**

Scott opens Symphony on his laptop:

1. **Brain dump** → Tasks go to inbox
2. **Triage inbox:**
   - "Client presentation deck" → Work domain, schedule for Tuesday
   - "Research hiking backpacks" → Personal domain, someday list
   - "Order new kitchen faucet" → Family domain, schedule for Wednesday
3. **Add context to family task:**
   - Task: "Order kitchen faucet"
   - Domain: Family
   - Link: https://homedepot.com/delta-faucet
   - Phone: (555) HOME-DEPOT
   - Notes: "Model #AB-1234, brushed nickel, 3-hole mount"
   - Assign to: Iris
4. **Sunday sync with Iris:**
   - Review family domain together
   - Iris sees "Order kitchen faucet" with full context
   - They discuss, Iris agrees to handle it

### **Execution (Mobile - Wednesday afternoon)**

Iris opens Symphony on her phone:

1. **Today view** shows her cards:
   - Work tasks (private - Scott can't see these)
   - "Order kitchen faucet" (assigned by Scott)
2. **Taps "Order kitchen faucet"** → Detail panel opens:
   - See the product link Scott attached
   - See Home Depot phone number
   - See notes: "Model #AB-1234, brushed nickel, 3-hole mount"
3. **Acts immediately:**
   - Tap link → Opens product page in browser
   - Tap phone → Calls Home Depot
   - Places order in 2 minutes
4. **Marks done** → Scott sees it completed in his view

**No searching. No "where did Scott put that info?" Context surfaces automatically.**

---

## Technical Architecture

### Data Model (Current State)

```sql
-- Users (auth.users) - one per person
-- Households - optional sharing container
-- Household_members - links users to households

-- Tasks
tasks
  ├─ user_id (owner)
  ├─ title
  ├─ context ('work' | 'family' | 'personal')
  ├─ notes (rich context)
  ├─ links (jsonb array)
  ├─ phone_number
  ├─ project_id (optional)
  ├─ assigned_to (optional - family member)
  └─ scheduled_for (when to do it)

-- Projects (context containers)
projects
  ├─ user_id (owner)
  ├─ name
  ├─ status
  ├─ notes (rich context)
  ├─ links (jsonb array)
  └─ phone_number
```

### RLS Policies (Privacy Model)

```sql
-- Work/Personal tasks: Only you see them
SELECT * FROM tasks
WHERE user_id = auth.uid()
  AND context IN ('work', 'personal')

-- Family tasks: Your household sees them
SELECT * FROM tasks
WHERE user_id = auth.uid()
  OR (
    context = 'family'
    AND EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = tasks.household_id
      AND user_id = auth.uid()
    )
  )
```

---

## Competitive Differentiation

| Competitor | Their Approach | Symphony Difference |
|------------|----------------|---------------------|
| **Todoist** | Personal task manager | ✅ Rich context (links/phones/notes)<br>✅ Domain separation<br>✅ Family sharing |
| **Asana** | Team project management | ✅ Personal-first (not team-first)<br>✅ Mobile execution focus<br>✅ Life domains |
| **Cozi** | Family organizer | ✅ Work/personal domains<br>✅ Rich context surfacing<br>✅ Individual users, not family account |
| **Things 3** | Personal productivity | ✅ Family sharing<br>✅ Context surfacing<br>✅ Cross-platform |
| **Notion** | Knowledge workspace | ✅ Execution-focused (not reference)<br>✅ Automatic surfacing<br>✅ Mobile-first execution |

**Symphony is the only tool that combines:**
1. Rich context (links, phones, notes) that surfaces automatically
2. Three equal domains (work, personal, family)
3. Individual-first with robust multiplayer
4. Plan on desktop, execute on mobile

---

## Evolution Roadmap

### V1: Foundation (Current)
- ✅ Task/project CRUD
- ✅ Rich context fields (links, phone, notes)
- ✅ Domain tagging (work/personal/family)
- ✅ Household sharing
- ✅ Mobile execution UI
- ✅ Context surfacing in task detail

### V2: Intelligence (Next 6 months)
- 🔲 AI planning sessions (brain dump → structured)
- 🔲 Domain views (separate screens per domain)
- 🔲 Time-based filtering (work during work hours)
- 🔲 Family planning mode (Sunday sync UI)
- 🔲 Smart context surfacing (learns when to show what)

### V3: Proactive (Future)
- 🔲 Location-based surfacing
- 🔲 Automatic prep task generation
- 🔲 Routine detection from patterns
- 🔲 Custom domains ("Side Business", "Volunteer")
- 🔲 Context inheritance visualization

---

## Key Messaging

**For pitches:**
> "Symphony is your personal OS for work, life, and family. The key insight: captured information doesn't surface when you need it. We make context first-class — attach links, phone numbers, notes during planning, they surface automatically during execution."

**For demos:**
> "Let me show you the problem Symphony solves. You research a product, save the link somewhere, jot down notes. Two weeks later when it's time to buy, you spend 10 minutes hunting. Symphony fixes this. Set it up once, surfaces every time."

**For differentiation:**
> "Most apps are work tools or family tools. Symphony treats work, personal, and family equally. Your work stays private. Your family sharing is robust. You're the primary user."

**For skeptics:**
> "It looks like a to-do app, but it's fundamentally different. Traditional apps store tasks. Symphony stores context. The task is just the handle. The value is in what surfaces with it."

---

## Documentation Reference

- **POSITIONING.md** - Detailed product positioning, competitive analysis
- **ELEVATOR_PITCH.md** - Quick pitches for different contexts
- **VISION.md** - Product vision, build sequence, technical approach
- **CLAUDE.md** - Developer reference with updated positioning
- **This doc** - How everything fits together

---

*This is your source of truth for explaining Symphony's positioning. When in doubt, refer back to these core concepts: Context-Linking, Three Domains, Individual + Sharing.*
