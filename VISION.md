# Symphony OS: Product Vision

*Last updated: December 2025*

---

## What Symphony Is

**A personal AI organization that manages your entire life.**

Symphony is more than an app — it's a team of AI specialists coordinated by a Life COO, each with deep expertise in their domain (health, work, family, finance, personal growth), all sharing context about your life. Unlike chatbots that forget you exist, Symphony has persistent knowledge of your tasks, calendar, contacts, projects, routines, goals, and history.

**The core insight:** AI assistants fail because they lack context AND specialization. A generic AI can't be an expert nutritionist AND career coach AND family logistics coordinator. Symphony solves both: unified life context with specialized domain expertise.

**The unlock:** When domain-expert AI coaches share context about your full life AND can take action (send texts, schedule things, create plans), you get a personal staff — without hiring anyone.

---

## The North Star Vision

```
┌─────────────────────────────────────────────────────────────┐
│                         You                                  │
│                          │                                   │
│                          ▼                                   │
│               ┌─────────────────────┐                        │
│               │      Life COO       │                        │
│               │  (Chief of Staff)   │                        │
│               │                     │                        │
│               │  • Sees everything  │                        │
│               │  • Resolves conflicts│                       │
│               │  • Enforces priorities│                      │
│               │  • Morning brief    │                        │
│               └──────────┬──────────┘                        │
│                          │                                   │
│      ┌─────────┬─────────┼─────────┬─────────┐              │
│      ▼         ▼         ▼         ▼         ▼              │
│ ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐     │
│ │ Health  ││  Work   ││ Family  ││ Finance ││ Personal│     │
│ │ Coach   ││  CEO    ││ Manager ││ Advisor ││ Growth  │     │
│ └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘     │
│ • Nutrition • Strategy • Kids     • Budget   • Goals        │
│ • Exercise  • Projects • Schedule • Tracking • Habits       │
│ • Sleep     • Decisions• Household• Alerts   • Learning     │
│ • Meals     • Meetings • Events   • Bills    • Reading      │
└─────────────────────────────────────────────────────────────┘
```

### Example: Life COO Coordination

```
You: "I have a big presentation Thursday, but I committed to
     my trainer for a 6am workout that day"

Life COO: "I see the conflict. Let me check with both teams.

Work CEO says: Presentation is high-stakes, determines Q1 budget.
Health Coach says: You've skipped 2 workouts this week already.

Options:
1. Move workout to Wednesday evening (you're free 6-7pm)
   → Preserves Thursday rest, keeps your 3x/week goal

2. Keep Thursday 6am, you've done this before successfully
   → March 12, April 3 you presented well after morning workouts

3. Skip Thursday, make up Saturday
   → Health Coach would push back - you're at 1x this week

My recommendation: Option 1. Want me to message your trainer?"
```

### Example: Health Coach Conversation

```
You: "I've been stress eating this week"

Health Coach: "I can see you've had a heavy work week - 3 late
meetings and that presentation prep. Stress eating makes sense.

Looking at your patterns:
• This happens when you skip lunch (which you did Tue/Wed)
• Evening snacks were mostly carbs (energy-seeking behavior)

For the rest of this week:
• I've added 'actual lunch' reminders to your calendar
• Want me to prep a list of protein-heavy snacks? More satisfying.

For next week when things calm down, let's talk about a reset.
Don't beat yourself up - surviving a hard week is a win."
```

---

## Core Principles

### 1. Full Life Context, Shared Across Coaches
Work bleeds into personal bleeds into family. Every coach sees the full picture (filtered to their domain) so they can give advice that accounts for your whole life:
- Health Coach knows you have a stressful work week
- Work CEO knows you're starting a new fitness program
- Life COO sees everything and coordinates

### 2. Specialized Expertise, Not Generic AI
Each coach has a distinct persona, expertise, and communication style:
- Health Coach: Supportive, evidence-based, non-judgmental
- Work CEO: Strategic, direct, challenges assumptions
- Life COO: Balances all domains, protects boundaries, sees patterns

### 3. AI That Takes Action
Coaches can do things, not just talk:
- Create tasks and schedule them
- Send messages on your behalf (with approval)
- Log meals, workouts, metrics
- Generate plans and track progress
- Surface conflicts and suggest resolutions

### 4. Human in the Loop
AI drafts, you approve. Every external action shows a preview. "Save as Task" is always an escape hatch. Coaches advise; you decide.

### 5. Proactive, Not Just Reactive
Coaches and the Life COO don't wait for you to ask:
- Morning brief surfaces what matters today
- Health Coach notices you've skipped workouts
- Work CEO flags a decision you've been avoiding
- Life COO spots cross-domain conflicts before they happen

### 6. Capture → Plan → Execute → Review
The rhythm that makes it work:
1. **Capture** — Zero friction brain dump. Lands in inbox.
2. **Plan** — Weekly session with Life COO. Coaches provide domain input.
3. **Execute** — Contextual surfacing. Right task, right time, right info.
4. **Review** — Life COO analyzes patterns, coaches suggest adjustments.

---

## Who Symphony Is For

**Primary:** Individuals managing complex, multi-domain lives
- Professionals with demanding jobs who also want to be great parents
- People pursuing fitness/health goals while building careers
- Anyone who feels "I have too many things pulling at me"
- Those who would benefit from a personal staff but can't afford one

**Not for (yet):**
- Teams or organizations
- People who want a simple to-do list
- Those uncomfortable with AI having deep access to their life data

**Family features** are a bonus, not the core:
- Share lists with household members
- Delegate tasks ("Iris handle grocery run")
- Family calendar overlay
- But it works great for a single person too

---

## Architecture

### Data Model (What Symphony Knows)

```
User
├── Tasks (with context: work/personal/family)
│   ├── Scheduled (has a date)
│   ├── Inbox (unprocessed)
│   └── Someday (no timeline)
├── Projects (groups of related tasks)
├── Contacts (people in your life)
│   ├── Relationships (contractor, colleague, family)
│   └── Contact info (phone, email)
├── Calendar Events (synced from Google/Outlook)
├── Routines (recurring patterns)
├── Action History (texts sent, emails, completions)
├── Goals (by domain: health, work, family, finance, personal)
├── Health Data (meals, exercise, sleep, metrics)
├── Coach Conversations (per-coach chat history)
└── Domains (optional containers for sharing)
```

### AI Layer

```
┌─────────────────────────────────────────────────────────────┐
│  Context Snapshot (Full Life State)                         │
│  - All tasks, projects, contacts, calendar                  │
│  - Goals and progress by domain                             │
│  - Health metrics and logs                                  │
│  - Recent actions and conversations                         │
│  - Current time, patterns, history                          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
      │ Life COO    │ │   Domain    │ │   Action    │
      │             │ │   Coaches   │ │  Execution  │
      │ • Briefs    │ │ • Health    │ │ • SMS       │
      │ • Conflicts │ │ • Work CEO  │ │ • Email     │
      │ • Priorities│ │ • Family    │ │ • Tasks     │
      │ • Patterns  │ │ • Finance   │ │ • Calendar  │
      └─────────────┘ │ • Personal  │ └─────────────┘
                      └─────────────┘
```

### Coach Architecture

```typescript
interface DomainCoach {
  id: string
  slug: string                    // 'health', 'work-ceo', 'family'
  name: string                    // "Health Coach", "Work CEO"
  description: string             // What this coach helps with
  systemPrompt: string            // Persona, expertise, constraints
  contextDomains: ContextDomain[] // What data this coach can see
  availableActions: ActionType[]  // What this coach can do
  icon: string
  color: string
}

// Life COO is special - sees all, coordinates all
interface LifeCOO extends DomainCoach {
  contextDomains: ['all']
  canResolveConflicts: true
  canOverrideCoaches: true
  generatesBriefs: true
}
```

### Platform Split

| Platform | Primary Use |
|----------|-------------|
| Desktop (≥768px) | Planning sessions, coach conversations, deep work |
| Mobile (<768px) | Capture, execution, quick triage, brief review |

---

## Build Phases

### Phase 1: Foundation ✓
- Task CRUD with inbox model
- Projects and contacts
- Google Calendar sync
- Desktop/mobile responsive UI
- Routines

### Phase 2: Action Execution (Current)
- AI parses QuickCapture for actionable requests
- Send SMS via Twilio
- Send email via Resend
- Action preview modal with approval flow
- Action history logging

### Phase 3: Proactive AI
- Daily morning brief (Life COO v0)
- Stale item surfacing
- Follow-up suggestions after actions
- Conflict detection
- Pattern recognition ("Make this a routine?")

### Phase 4: Conversational Interface
- QuickCapture becomes chat input
- Multi-turn conversations with context
- "What did I tell Frank?" queries
- "Push my afternoon to tomorrow" bulk operations
- Conversation history persistence

### Phase 5: Domain Coaches
- Health Coach (nutrition, exercise, sleep, wellness)
- Work CEO (strategy, projects, decisions, career)
- Family Manager (logistics, kids, household, events)
- Coach-specific context filtering
- Per-coach conversation threads
- Coach-specific actions (log meal, create project, etc.)

### Phase 6: Life COO
- Full cross-domain visibility
- Conflict resolution between coaches
- Priority enforcement based on stated values
- Weekly planning facilitation
- Pattern recognition across domains
- Boundary protection (work doesn't eat personal time)

### Phase 7: Coach Collaboration
- Coaches consult each other through Life COO
- Cross-domain recommendations ("Work CEO suggests lighter week given your health goals")
- Coordinated planning sessions
- Handoffs between coaches

### Phase 8: Advanced Intelligence
- Predictive surfacing (know what you need before you ask)
- Automated routine optimization
- Goal progress forecasting
- Life balance scoring and recommendations
- Integration with external data (fitness trackers, finance apps)

---

## Domain Coaches Detail

### Health Coach
**Expertise:** Nutrition, exercise, sleep, wellness, habit formation
**Personality:** Supportive, evidence-based, non-judgmental, celebrates small wins
**Context access:** Meals, exercise logs, sleep data, health metrics, health goals, schedule overview
**Actions:** Log meal, log exercise, create meal plan, set health goal, create health-related task, send reminder

### Work CEO
**Expertise:** Strategy, prioritization, decision-making, career growth, time management
**Personality:** Direct, strategic, challenges assumptions, focuses on leverage
**Context access:** Work tasks, work projects, work calendar, professional goals, schedule overview
**Actions:** Create task, create project, schedule meeting, update goal, create decision log

### Family Manager
**Expertise:** Household logistics, kid activities, family events, delegation
**Personality:** Organized, practical, anticipates needs, keeps everyone coordinated
**Context access:** Family calendar, family tasks, household projects, family members, routines
**Actions:** Create family task, schedule family event, delegate to family member, send family notification

### Finance Advisor (Future)
**Expertise:** Budget awareness, bill tracking, financial goal progress
**Personality:** Calm, practical, non-alarmist, focused on awareness
**Context access:** Budget categories, bills, financial goals, spending patterns
**Actions:** Log expense, set budget alert, update financial goal

### Personal Growth Coach (Future)
**Expertise:** Goals, habits, learning, personal projects, reflection
**Personality:** Encouraging, growth-minded, asks good questions
**Context access:** Personal goals, habits, reading list, learning projects
**Actions:** Create personal goal, log habit, add to reading list, schedule reflection time

---

## What Symphony Is NOT

- **Email client** — Tasks can reference emails, but we don't replace Gmail
- **Full calendar app** — Google Calendar is source of truth
- **Project management tool** — Not for teams, no Gantt charts
- **Budgeting app** — Awareness only, not full categorization
- **Autonomous agent** — Always human approval for external actions
- **Replacement for professionals** — Coaches are AI, not licensed therapists/doctors/advisors

---

## Competitive Position

| Product | What they have | What they lack |
|---------|----------------|----------------|
| Todoist, Things | Tasks | No AI, no calendar, no contacts, no actions |
| Notion | Everything | Too complex, no AI actions, no unified model |
| Apple Reminders + Siri | Tasks + voice | No project structure, weak AI, siloed |
| ChatGPT, Claude | Conversational AI | No persistent state, no life context, no actions |
| Reclaim.ai | AI scheduling | Only calendar, no tasks/contacts/actions |
| Motion | AI calendar | No task context, no contact awareness |
| AI coaching apps | Domain expertise | Siloed, no cross-domain context, can't take action |

**Symphony's moat:**
- Unified life data across all domains
- Specialized AI coaches with domain expertise
- Life COO coordination layer
- Ability to take real action
- Persistent memory and context

That combination doesn't exist elsewhere.

---

## Success Metrics

**It's working when:**
- You trust it with your whole life (work + personal + family + health all in Symphony)
- Morning brief is genuinely useful, not annoying
- You have ongoing conversations with coaches that feel valuable
- You use "text [person] about [thing]" without thinking
- Life COO catches conflicts before they become problems
- You stop carrying mental load — if it's in Symphony, you trust it'll surface

**Phase 2-3 success:**
- Daily active use for real tasks
- At least one AI action (text/email) per week
- Inbox stays under 20 items

**Phase 5-6 success:**
- Weekly coach conversations that lead to behavior change
- Life COO brief reviewed daily
- Cross-domain conflicts surfaced before they happen

---

## Design Language

**Nordic Journal theme:**
- Warm cream backgrounds, soft shadows
- Forest green primary (#3d8b6e)
- Fraunces serif for display, DM Sans for body
- Generous whitespace, rounded corners
- Feels calm, not clinical

**Coach personality through UI:**
- Each coach has a distinct color and icon
- Conversation UI feels personal, not transactional
- Brief feels like a thoughtful note, not a notification dump

**Key principle:** The AI should feel like a thoughtful team, not a chatbot. Each coach has personality. The Life COO has authority. Responses are concise, contextual, and action-oriented.

---

## Technical Stack

- React 19 + TypeScript (strict)
- Vite for bundling
- Tailwind CSS v4
- Supabase (auth, database, edge functions, realtime)
- Claude API (Haiku for parsing, Sonnet for coaching conversations)
- Twilio (SMS)
- Resend (email)
- Google Calendar API

---

## Out of Scope (Explicit No)

- Team/organization features
- Public sharing or social features
- Multi-family support (one household per account)
- Voice-first interface (text-first, voice optional)
- Autonomous actions without approval
- Integration marketplace (curated integrations only)
- Actual licensed professional advice (medical, legal, financial)

---

## The Tagline

**"A personal AI staff for your whole life."**

Or:

**"Your life, orchestrated."**

**"The AI team that knows your life and gets things done."**
