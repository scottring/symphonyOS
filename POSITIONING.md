# Symphony OS: Product Positioning

*How we talk about what Symphony is and does*

---

## The Elevator Pitch

**Symphony OS is your personal operating system for life.**

It's designed around how you actually live: across work, personal, and family domains — not just family chores. You plan deeply on desktop when you have time to think. You capture quickly and execute effortlessly on mobile when life happens.

**The core insight:** Your life is already organized in your head. Tasks connect to projects. Projects have context — links, phone numbers, notes, measurements. The problem isn't capturing information. It's that it never surfaces at the right time with the context you need.

Symphony fixes this. When it's time to act, everything you attached shows up in one place: the contractor's number, the product link, your notes about measurements. No searching. No switching apps. No forgetting what you meant to remember.

---

## What Makes Symphony Different

### 1. **Context is First-Class**

Tasks aren't just titles on a list. They're rich containers:
- **Links** to products, documentation, reservations
- **Phone numbers** for vendors, doctors, schools
- **Notes** with measurements, preferences, decisions made
- **Files** (future) for receipts, photos, PDFs

You set it up once during planning. Symphony surfaces it every time you need it.

**Example:** "Order kitchen backsplash tile"
- Link to the product page
- Vendor phone number
- Your notes: "Subway 3x6, Arctic White, 45 sq ft needed"
- Photo of the kitchen for color matching

When it's time to order, you tap the task and everything is there.

### 2. **Three Domains, Equally Important**

Your life happens in three contexts:

- **Work** — Your professional projects, deadlines, client calls
- **Personal** — Your hobbies, health, learning, self-care
- **Family** — Shared household tasks, kids' schedules, home projects

Symphony treats all three as first-class citizens. It's not a "family app" with work bolted on. It's not a "productivity app" that forgets you have a family.

You can filter by domain. Set working hours where only work items show. Have evening time surface family tasks. Keep personal projects private.

### 3. **Built for Individuals, Designed for Sharing**

Symphony is fundamentally single-user. You are the primary unit, not your family.

**This means:**
- Your work stays private. Your personal projects stay private.
- You control what you share and with whom.
- Each person has their own view, their own planning sessions, their own inbox.

**But sharing is robust and first-class:**
- Create shared **family domain** where everyone sees the same tasks
- Assign tasks to specific family members
- Plan together during Sunday sync sessions
- Each person can mark their assignments complete

Think: "Personal OS with multiplayer mode" — not "family app with private folders."

### 4. **Plan on Desktop, Execute on Mobile**

**Desktop (≥768px):** Deep planning mode
- Weekly brain dump sessions
- Process your inbox with full context
- Review calendar, reschedule tasks, add rich context
- Full-page views for editing projects, routines, trips

**Mobile (<768px):** Quick capture and execution
- Brain dump from anywhere
- See your day: contextual cards show what's now/next
- One-tap actions: call, navigate, mark done
- Bottom sheets for quick task triage

### 5. **Projects Chain Context**

Projects are context containers that organize related tasks:

**Example: "Kitchen Remodel" project**
- Contractor's phone number (on project)
- Link to tile supplier website (on project)
- Tasks: "Get quote", "Order materials", "Schedule install"
- Each task inherits project context + has its own

When you open "Order materials", you see:
- The task and its notes
- The project's supplier link and vendor number
- Everything you need to act

---

## How It Works (User Journey)

### **Capture**
Mobile quick-add, desktop inbox, future: email forward, share sheet
→ Everything lands in your inbox

### **Plan**
Weekly session (desktop): Brain dump → AI structures → You review/schedule → Add rich context
→ Tasks move to dates with full context attached

### **Execute**
Open Symphony → See contextual cards for now/next → Tap to expand → Everything you attached is there
→ Act immediately with zero friction

### **Sync** (Family Domain)
Sunday planning with partner → Review family domain together → Assign, negotiate, resolve conflicts
→ Clear family plan for the week

---

## Technical Architecture

### User-First Data Model

```
User (Primary unit)
├── Work Tasks (private)
├── Personal Tasks (private)
├── Family Tasks (shared with household)
├── Projects (can be private or shared)
│   ├── Links
│   ├── Phone numbers
│   ├── Notes
│   └── Tasks
└── Routines (can be private or shared)
```

### Household Sharing

- Each user belongs to one household (optional)
- Household members can see:
  - Tasks marked `context: 'family'`
  - Projects marked as shared
  - Shared calendar events
  - Shared routines
- Private data (`work`, `personal` context) never visible to others
- Assignments flow: You create → Assign to family member → They see it in their view

### Context Inheritance

```
Project: "Kitchen Remodel"
  └─ phone_number: "(555) 123-4567"
  └─ links: [{ url: "https://tilesupplier.com" }]
  └─ notes: "Contractor: Bob Johnson, Arctic White subway tile"

  Task: "Order backsplash tile"
    └─ Inherits project context automatically
    └─ notes: "45 sq ft needed, 3x6 size"
    └─ When you open task → See project + task context together
```

---

## Key Positioning Statements

**For busy professionals with families:**
> "Symphony is your personal operating system for work, life, and family — not just another to-do app."

**For people drowning in apps:**
> "Stop switching between 6 apps to find the phone number, the link, and the notes. Symphony surfaces everything you attached when it's time to act."

**For couples managing households:**
> "Your work stays private. Your shared family tasks are equally robust. Symphony is built for individuals with first-class sharing."

**For people who plan but fail to execute:**
> "You set it up once during planning. Symphony brings it back with full context when you need it. No searching."

---

## What Symphony Is NOT

- ❌ A family chore chart (it includes family, but you're the primary user)
- ❌ A work-only productivity app (family is first-class)
- ❌ A read-it-later app (links are task context, not articles)
- ❌ A notes app (notes attach to tasks/projects for context)
- ❌ A calendar replacement (Google Calendar is source of truth)
- ❌ An email client (tasks can reference emails, but Symphony isn't email)

---

## Success Looks Like

**Immediate (V1):**
"I planned my week on Sunday. Now it's Wednesday and I need to order those blinds. I open the task and the product link, measurements, and vendor phone number are right there. I order in 30 seconds."

**Medium-term (V2):**
"Iris and I had our Sunday sync. We assigned tasks for the week. I'm handling the contractor calls (work domain), she's managing the kids' activities (family domain). My personal learning goals stay private. It all just works."

**Long-term (V3):**
"Symphony knows I do focused work from 9-3, so it only shows work tasks then. At 5pm when I'm home, family tasks surface. My evening workout routine reminds me at 7pm. The context I need appears when I need it, without me thinking about it."

---

## Competitive Position

| Product | Positioning | Symphony Difference |
|---------|-------------|---------------------|
| Todoist | Personal task manager | Context-rich, family sharing, domain separation |
| Asana | Team project management | Personal-first, mobile execution, life domains |
| Cozi | Family organizer | Work/personal domains, rich context, individual users |
| Things 3 | Personal productivity | Family sharing, context surfacing, cross-platform |
| Notion | Knowledge base | Execution-focused, contextual surfacing, mobile-first |

**Symphony is the only tool that:**
1. Treats work, personal, and family as equal domains
2. Surfaces rich context (links, phones, notes) at execution time
3. Built for individuals with robust multiplayer features
4. Plan on desktop, execute on mobile philosophy

---

## Voice & Tone

**How we talk about Symphony:**

✅ "Your personal operating system"
✅ "Context surfaces when you need it"
✅ "Built for individuals, designed for sharing"
✅ "Plan deeply, execute effortlessly"

❌ "Family productivity app"
❌ "Yet another to-do list"
❌ "Project management for families"

**Tone:** Confident but humble. Clear but warm. Technical precision with human understanding.

---

## Future Evolution

### V1: Foundation (Now)
- Task/project CRUD with rich context
- Calendar integration (read-only)
- Mobile execution UI with context surfacing
- Domain tagging (work/personal/family)

### V2: Intelligence (Next)
- AI planning sessions (brain dump → structured plan)
- Smart context surfacing based on time/location
- Family planning mode (Sunday sync UI)
- Domains become true containers with separate views

### V3: Proactive (Future)
- System learns when to surface what
- Prep tasks automatically generated for events
- "You usually do laundry on Sunday" - routine detection
- True multi-domain with custom domains ("Side Business", "Volunteer Work")

---

*This positioning document is the source of truth for how we talk about Symphony. When in doubt, refer back to these core principles.*
