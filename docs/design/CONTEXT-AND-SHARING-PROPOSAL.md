# Context & Sharing: A Unified Proposal for Symphony OS

**Status:** Draft Proposal
**Date:** March 16, 2026
**Builds on:** DOMAIN-SWITCHING-PROPOSAL.md, research-context-separation.md

---

## The Problem This Solves

Symphony's existing domain switching proposal covers the **UI mechanics** well — how to switch views, filter tasks, auto-tag. But it leaves the harder questions unresolved: what exactly happens when a task is "family" context? How does Iris experience Symphony differently from Scott? What does "shared" actually mean at the data level, and where are the privacy fences?

This proposal addresses the **architectural and interaction model** for contexts — not "how do you switch domains" but "what does each domain actually mean, and how do they compose with sharing, assignment, projects, and the daily planning loop."

---

## Part 1: Context Is Not Just a Filter

### The Insight From Research

Looking across Things 3, Todoist, OmniFocus, Amazing Marvin, and family apps like Cozi, a clear pattern emerges: the apps that treat context as "just a filter" (OmniFocus tags, Todoist labels) give users maximum flexibility but minimum structure. The apps that treat context as "a container with rules" (Things 3 Areas, Todoist Workspaces) give users structure that guides behavior.

Symphony should be in the second camp. Context isn't a tag you stick on a task. It's a **declaration of who can see it, who owns it, and where it lives in your life.**

### The Three Contexts, Defined Precisely

**Work** — Private to you. Never shared. Represents your professional responsibilities. Only you can see, create, or modify work items. If you leave a job, these tasks go with you (they're yours, not your company's). Work context items don't appear in any shared view, period.

**Personal** — Private to you. Never shared. Your health, hobbies, learning goals, side projects, self-care. Iris never sees these. They exist in your personal planning space only. This is the context for "things I'm responsible for that aren't about my job or my household."

**Family** — Shared with your household. This is the only context where multiplayer exists. Family-context items are visible to all household members who have at least "Participant" engagement level. Family is where assignment, collaboration, and the Sunday sync happen.

**Null / Untagged** — Private to you, visible in all your domain views. These are items in your inbox that haven't been triaged yet. They're never shared. They show up in every domain view as a gentle nudge to categorize them.

### Why This Matters

The critical consequence: **context determines visibility rules, not just filtering.** This is already implemented in the Supabase RLS policies (migration 063), which is great. But the UI and mental model need to reinforce this. When you set something to "family," you're not just tagging it amber — you're publishing it to your household.

---

## Part 2: The Family Context — Deeper Than a Label

### What Makes Family Different

Family context isn't just "a third filter." It introduces fundamentally different dynamics:

1. **Multiple people see the same data.** Work and personal are single-player. Family is multiplayer.
2. **Assignment matters.** "Buy groceries" exists in the family space, but *who does it* is a separate question.
3. **Status is collaborative.** When Iris marks "Pick up paint samples" complete, Scott should see that in real time.
4. **Planning is joint.** The Sunday sync is two people looking at the same data and negotiating.
5. **Some family items are "household" not "assigned."** "The dishwasher is broken" doesn't belong to anyone — it's a family fact.

### Family Task States

A family task has richer semantics than a private task:

```
Family Task Lifecycle:
  Captured → Triaged → Assigned → In Progress → Completed
                ↓
           Unassigned (household item, anyone can grab it)
```

**Unassigned family tasks** are visible to all household members and represent shared awareness: "We need to do this, but nobody's claimed it yet." This is the family equivalent of the inbox — a shared pool of things the household knows about.

**Assigned family tasks** show up in the assignee's personal Today view, filtered by family domain. The assigner can see the task's status. Both can add context (notes, links, phone numbers).

### The Family Inbox

This is a concept missing from the current implementation. Right now, tasks go into your personal inbox and you triage them. But families need a **shared capture point** — a place where either partner can dump "We need to get the car inspected" and it lands in a shared space for joint triage.

**Proposed: Family Inbox**

- Any household member can quick-capture directly into the family inbox
- Items in the family inbox are visible to all household members
- During the Sunday sync (or any joint planning), both partners process the family inbox together
- Triage options: assign to someone, schedule, attach to a family project, or dismiss

**Implementation:** A family task with `context = 'family'`, `scheduled_for = null`, and `assigned_to = null` is, by definition, in the family inbox. No new data model needed — it's a view over existing data.

**UI:** The Inbox section at the bottom of the Today view already exists. When in Family domain, it should show the family inbox (shared unassigned items) instead of / in addition to your personal inbox.

---

## Part 3: Engagement Levels — Not Everyone Plans

### The Spectrum (From VISION.md)

The vision doc defines three engagement levels:

- **Full Planner:** Multiple domains, brain dumps, goals, solo planning (Scott)
- **Domain Planner:** Specific domains only, lighter weight
- **Participant:** Sees assignments, completes tasks, no planning (potentially Iris, initially)

This is a critical design lever. The current app assumes everyone is a Full Planner. But the research shows that family task apps fail when they require both partners to invest equally in the system. Cozi works precisely because it's low-friction for all members. OurHome works because kids just see their assigned chores.

### Participant Experience

A Participant should be able to:

- See tasks assigned to them (family context only)
- Mark tasks complete
- Add notes/context to their assigned tasks
- Quick-capture into the family inbox
- See the family calendar

A Participant should NOT need to:

- Set up domains or understand domain switching
- Process an inbox (unless they want to)
- Create projects or manage routines
- Do weekly planning sessions

**UI implication:** The Participant's default (and possibly only) view is a simplified Today screen showing: "Here's what's assigned to you today, here's what's coming up, here's the family calendar." The DomainSwitcher doesn't appear for Participants unless they opt in.

### How This Maps to `is_full_user` and `member_type`

The family_members table already has `is_full_user: boolean` and `member_type: 'core' | 'guest'`. The proposal:

- `is_full_user = true` + Supabase auth account → Full Planner or Domain Planner (they choose)
- `is_full_user = true` + Supabase auth account + simplified preference → Participant
- `is_full_user = false` → "Shadow member" (can be assigned tasks but doesn't log in — useful for kids)

The engagement level should be a user preference, not a hard role. Iris might start as a Participant and graduate to Domain Planner as she gets comfortable.

---

## Part 4: Context Inheritance — The Rules

### Current State

Migration 043 added `context` to projects. The domain switching proposal mentions inheritance. But the exact rules aren't codified. Here's the proposed ruleset:

### Rule 1: Projects Set the Default

When a task is created inside a project, it inherits the project's context if the task's context is null.

```typescript
function resolveTaskContext(task: Task, project: Project | null): TaskContext | null {
  // Explicit task context always wins
  if (task.context !== null) return task.context

  // Inherit from project
  if (project?.context) return project.context

  // No context — lives in inbox/universal
  return null
}
```

### Rule 2: Assignment Can Auto-Tag

When a task is assigned to a family member, and the task has no context, auto-set to 'family'. This is already implemented in useSupabaseTasks.ts (lines 602-607). Keep this behavior.

**But don't override explicit context.** If someone marks a task as 'personal' and then assigns it to a family member (unusual but possible), respect the explicit choice.

### Rule 3: Context Is Mutable, Not Inherited Retroactively

If you change a project's context from null to 'work', existing tasks in that project are NOT retroactively updated. Only new tasks inherit. This prevents surprising bulk changes.

**Exception:** Offer a one-time "Apply to all tasks in this project?" confirmation when changing a project's context. This is an explicit user action, not automatic.

### Rule 4: Routines Inherit Context to Instances

When a routine generates a task instance (actionable_instance), the instance inherits the routine's context. A "Take out trash" routine with `context = 'family'` generates family-context instances every Tuesday.

### Rule 5: Null Context Is Always Safe

A null-context item is private and appears in all of the owner's domain views. It never leaks to other household members. This is the safe default — forgetting to tag something doesn't accidentally share it.

---

## Part 5: The Daily Experience

### Scott's Day (Full Planner)

**Morning (Personal domain auto-active, if time-based switching enabled):**
- Sees morning routine items, personal goals
- Quick-captures "Dentist called — need to reschedule" → lands in personal inbox

**Work hours (Work domain):**
- Sees only work tasks, work projects, work calendar
- Quick-captures "Follow up with client on proposal" → auto-tagged work (current domain)
- Family and personal items completely hidden

**Evening (Family domain):**
- Sees family tasks assigned to him
- Sees family inbox (shared unassigned items)
- Sees tasks assigned to Iris (with her completion status)
- Can quick-capture "Need to fix fence gate" → family inbox
- Personal and work items hidden

**Sunday planning (Universal domain):**
- Sees everything across all domains
- Processes personal inbox items
- Reviews work week ahead
- Then switches to Family domain for the sync with Iris

### Iris's Day (Participant → Domain Planner)

**As Participant:**
- Opens app → sees Today view, family domain only
- "Pick up kids at 3:30" — marked as done
- "Grocery run" — taps to see the shopping list (task notes), does it, marks done
- Quick-captures "We're out of paper towels" → family inbox

**Graduating to Domain Planner:**
- Enables Personal domain in settings
- Now has two domains: Family + Personal
- Can switch between them
- Starts adding personal tasks (book club, workout goals)
- Never sees or needs Work domain

---

## Part 6: Projects as Context Containers

### The Key Differentiator

From POSITIONING.md: "Projects chain context." This is Symphony's strongest feature. The proposal for how contexts interact with projects:

### Family Projects Are Shared Workspaces

A project with `context = 'family'` is visible to all household members. Any member can:

- See all tasks in the project
- Add new tasks to the project
- Add notes, links, phone numbers to the project
- Complete tasks assigned to them

The project owner (creator) can:

- Edit project metadata (name, status, type)
- Delete the project
- Change project context (with confirmation if it has shared tasks)

**Example: "Kitchen Remodel" project**
- Context: Family
- Owner: Scott (created it)
- Phone number: Contractor (555-123-4567)
- Links: Tile supplier website
- Tasks:
  - "Get three quotes" — assigned to Scott
  - "Choose paint colors" — assigned to Iris
  - "Clear out kitchen cabinets" — unassigned (anyone can do it)
  - "Schedule installation" — assigned to Scott

Both Scott and Iris see this project. Both can add tasks. The contractor's phone number surfaces for whoever is executing.

### Work and Personal Projects Are Private

A project with `context = 'work'` or `context = 'personal'` follows normal private rules. Only the owner sees it.

### Null-Context Projects

A project with no context is private to the owner and shows in all their domain views. This is fine for simple personal projects that don't fit neatly into a domain ("Read these 5 books" might not be work or personal or family).

---

## Part 7: What We Don't Need to Build (Yet)

### Custom Domains

The research shows Amazing Marvin and Notion power users love custom domains ("Side Business," "Health," "Volunteer Work"). Symphony should not add this in V1-V2. Three fixed domains plus null keeps the mental model simple.

**Future path:** If custom domains are added, they should always be private (only the user sees them). The work/personal/family trinity with family-as-shared is special and shouldn't be diluted.

### Per-Task Sharing

Some apps let you share individual tasks with specific people. This is complex and rarely used well. Symphony's model is simpler: context determines sharing. If you want someone to see a task, put it in the family context.

**Future path:** If per-task sharing is needed, it could be "share with household" as a per-task override (a task tagged personal but explicitly shared). This is an edge case for now.

### Role-Based Permissions Within Family

Cozi and OurHome have parent/child role distinctions. Symphony doesn't need this yet. All household members with `member_type = 'core'` have equal access to family items. Guests have read-only.

**Future path:** Kid accounts (shadow members who can see assigned tasks on a simplified interface), permission levels for editing vs. viewing family projects.

---

## Part 8: Implementation Strategy

### What Already Exists (Don't Rebuild)

- `context` field on tasks, projects, routines ✅
- ContextPicker component ✅
- DomainSwitcher component ✅
- Domain context provider (useDomain) ✅
- HomeView filtering by domain ✅
- RLS policies gating family sharing ✅
- Family members table with assignment ✅
- Auto-tagging on family assignment ✅

### What Needs to Be Built

**Priority 1 — Complete the core loop:**

1. **Family Inbox view** — When in Family domain, show shared unassigned family tasks in the Inbox section. This is primarily a filtering change in InboxSection.tsx.

2. **Context inheritance from projects** — When creating a task inside a project, auto-populate the task's context from the project. This is a one-line change in the task creation flow.

3. **"Apply context to all tasks?" prompt** — When changing a project's context, offer to bulk-update its tasks. Modal confirmation + batch update.

**Priority 2 — Participant experience:**

4. **Engagement level preference** — A setting where a user chooses Full Planner / Domain Planner / Participant. Stored in user profile or local storage.

5. **Simplified Participant view** — A stripped-down Today view that shows only assigned family tasks, family calendar, and a capture input. No domain switcher, no inbox processing, no projects navigation.

6. **Invite flow for household members** — Currently family members exist in the DB, but the flow for Iris to create an account and see family tasks needs to be smooth. Email invite → sign up → automatically linked to household → sees family domain.

**Priority 3 — Polish and intelligence:**

7. **Domain-aware quick capture** — When in a specific domain, captured tasks auto-inherit that domain's context. With an option to override. This reduces triage friction.

8. **Family activity feed** — A simple feed showing recent family task completions. "Iris completed: Pick up paint samples." This creates ambient awareness without requiring constant check-ins.

9. **Sunday sync mode** — A dedicated UI for joint family planning. Side-by-side view of the coming week's family tasks, the family inbox, and a shared capture input. Designed for two people looking at the same screen.

---

## Part 9: Data Model Changes

### No Schema Changes Needed for Priority 1

Everything in Priority 1 works with the existing schema. The family inbox is just a query:

```sql
SELECT * FROM tasks
WHERE context = 'family'
  AND scheduled_for IS NULL
  AND assigned_to IS NULL
  AND completed = false
  AND users_share_household(auth.uid(), user_id)
```

Context inheritance is a client-side default when creating tasks.

### Schema Changes for Priority 2

**User preferences table** (or add to existing profiles):

```sql
ALTER TABLE profiles
ADD COLUMN engagement_level TEXT
  CHECK (engagement_level IN ('full_planner', 'domain_planner', 'participant'))
  DEFAULT 'full_planner';

ALTER TABLE profiles
ADD COLUMN active_domains TEXT[]
  DEFAULT ARRAY['work', 'family', 'personal'];
```

`active_domains` lets Domain Planners choose which domains they care about. Iris might set `['family', 'personal']` — she never sees the work domain option.

### Schema Changes for Priority 3

**Family activity log:**

```sql
CREATE TABLE family_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  actor_id UUID REFERENCES family_members(id),
  action TEXT NOT NULL, -- 'completed', 'created', 'assigned', 'commented'
  entity_type TEXT NOT NULL, -- 'task', 'project', 'routine'
  entity_id UUID NOT NULL,
  entity_title TEXT, -- denormalized for fast display
  metadata JSONB, -- flexible data (e.g., who it was assigned to)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: visible to household members only
CREATE POLICY "Household members can view activity"
  ON family_activity FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );
```

---

## Part 10: What This Gets Right

**1. Simplicity for the common case.** Three contexts, clear rules, no configuration needed to start. Tag your task; it goes to the right place. Don't tag it; it stays in your private view until you decide.

**2. Privacy by default.** Nothing is shared unless you explicitly put it in the family context. The null default is private. This is the opposite of Cozi (shared by default) and the right call for an individual-first app.

**3. Progressive complexity.** Participant → Domain Planner → Full Planner is a spectrum, not a binary. People can grow into the system.

**4. Leverages what's built.** The RLS policies, the context field, the DomainSwitcher, the family members table — all of this exists. The proposal adds behavior and interaction design on top of solid infrastructure.

**5. The family inbox fills a real gap.** The research showed that no major app handles "shared capture for household items" well. A family inbox where either partner can dump items for joint triage is a genuine differentiator.

**6. Context inheritance reduces friction.** The biggest complaint about domain/context systems is "I have to tag everything." Project inheritance + domain-aware capture + auto-tagging on assignment means most tasks get tagged automatically. Manual tagging becomes the exception, not the rule.

---

## Open Decisions

1. **Should domain-aware capture be opt-in or default?** If you're in Work domain and quick-capture "Buy milk," should it auto-tag as work? Probably not — capture should always be zero-friction, and auto-tagging to the current domain could cause mis-tags. Better to leave captured items untagged and let the user triage. But this deserves user testing.

2. **Family inbox: separate section or merged with personal inbox?** When in Family domain, should the inbox show *only* shared family items, or also your personal untagged items? Recommendation: family inbox shows shared items only. Your personal untagged items show in Universal or Personal domain.

3. **Can Participants create family projects?** Or only add tasks to existing ones? Recommendation: Participants can create tasks but not projects. Projects require more planning intent, which is the Planner's job.

4. **Time-based auto-switching: on or off by default?** The existing proposal suggests off. Agree — it's a power feature that should be discovered, not imposed.

5. **What happens when you change a task's context from family to personal?** It disappears from Iris's view. Should there be a warning? "This task is assigned to Iris. Changing to personal will remove her access. Continue?" Yes — this prevents accidental privacy changes.

---

## Summary

The core thesis: **context in Symphony is a declaration of audience, not just a filter.** Work and personal are private spaces. Family is a shared space. Null is an undecided space. The rules around inheritance, assignment auto-tagging, and the family inbox make this system feel automatic while keeping the user in control.

The existing infrastructure is 80% there. The remaining work is mostly interaction design (family inbox view, participant experience, context inheritance on creation) plus a few schema additions for engagement levels and activity feeds.

This positions Symphony uniquely in the market: the only task manager that treats the individual as primary, gives work/personal genuine privacy, and makes family sharing a first-class collaborative space — not a bolted-on feature.
