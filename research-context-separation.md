# How Task Managers Handle Work / Personal / Family Contexts

## Research for Symphony OS — March 2026

---

## The Core Problem

When a single person manages work deadlines, personal errands, and family logistics in one system, the fundamental design question is: **how much separation vs. integration?** Too much separation and you're juggling multiple apps. Too little and your grocery list shows up next to your board presentation.

Academic research from ACM (Cao et al., 2023) surveyed 150 information workers and found that the majority of task management happens during work hours, but people regularly manage work tasks outside work and personal tasks during work. People fall on a spectrum from "strict separators" (different tools for each domain) to "full integrators" (one system, no boundaries). Most fall somewhere in between — and the best tools accommodate that spectrum.

---

## Architectural Patterns Across Apps

### Pattern 1: Hierarchical Containers (Areas → Projects → Tasks)

**Things 3** pioneered this for individuals. You create "Areas of Responsibility" — top-level buckets like Work, Personal, Family, Health, Finance. Projects nest inside Areas, and tasks nest inside Projects. The sidebar visually groups projects under their area.

Key characteristics:

- Areas are the primary organizational unit, not tags or labels
- Every project belongs to exactly one area (no cross-filing)
- The "Today" view flattens everything across areas, giving you a unified daily plan
- "Anytime" and "Someday" lists also span all areas
- Weekly review happens per-area: you expand each one and process it

This maps closely to GTD's "Horizons of Focus" — Areas are Horizon 2 (areas of responsibility), Projects are Horizon 1, and Tasks are the runway.

**Strengths:** Clean mental model, easy to separate concerns during planning, unified during execution. **Weakness:** No sharing, no collaboration, no family dimension.

### Pattern 2: Workspace Separation (Personal Space + Team Spaces)

**Todoist** introduced Team Workspaces in 2024. The model has two distinct zones:

- **My Projects** — personal, private, owned by you forever
- **Team Workspace** — shared, owned by the organization, with admin controls

The critical design decision: you don't switch between workspaces to see your day. The Today and Upcoming views merge both zones, with the ability to filter by personal-only or team-only. You can also move projects between zones if their nature changes.

**Strengths:** Clear data ownership (personal stays with you even if you leave a team), unified daily view, filtering for focus. **Weakness:** The "team" concept is work-oriented — there's no native "family workspace" with different sharing semantics.

### Pattern 3: Tags/Contexts as Overlays

**OmniFocus** (and GTD methodology broadly) treats context as an orthogonal dimension to projects. In OmniFocus 3, the old single-context system became multi-tag, allowing combinations like `@work + @deep-focus` or `@home + @phone`.

Custom "Perspectives" let you create saved views like "All personal errands I can do on my phone" or "Deep work tasks for this week." Power users create perspectives like:

- "Work Focus" — shows only tasks tagged @work, available now, sorted by project
- "Evening Personal" — shows @home + @personal tasks, excluding deferred items
- "Weekend Family" — shows @family tasks with no hard due date

**Strengths:** Extremely flexible, supports any taxonomy the user invents. **Weakness:** High setup cost, steep learning curve, no sharing/family features.

### Pattern 4: Folder → List → Task Hierarchy

**TickTick** uses a Folder > List > Section > Task > Subtask hierarchy. You create folders like "Work" and "Personal," then lists within each (e.g., Work → Meetings, Reports, Projects; Personal → Shopping, Health, Home). Color-coding at the list level provides visual separation.

**Microsoft To Do** is similar but simpler — flat lists that you can share individually. It syncs with Outlook for work tasks. The key limitation: sharing only works between accounts of the same type (personal-to-personal or work-to-work), though they've been relaxing this restriction.

**Apple Reminders** groups lists into sections (Work, Family, Personal) with smart lists that auto-aggregate based on rules (Today, Scheduled, Assigned to Me). iCloud shared lists let family members collaborate on specific lists (like groceries) while keeping other lists private.

**Strengths:** Low cognitive overhead, familiar mental model. **Weakness:** Flat — no rich "context" concept beyond which list something lives in.

### Pattern 5: Modular Strategy (Pick Your Own Features)

**Amazing Marvin** takes a radically different approach: everything is optional. You enable/disable features (called "strategies") based on your workflow. Categories represent life areas (Household, Work, Health, Side Projects, Social). You can enable:

- Category context display (colored indicators showing which area a task belongs to)
- Day-based planning (schedule tasks to specific days)
- Time-blocking
- Work sessions (focus on one category at a time)

The "Category Context" strategy specifically adds visual indicators to tasks so you always know which life area they belong to, even in the unified daily view.

**Strengths:** Fits any workflow, reduces context-switching by letting you focus on one area at a time. **Weakness:** No collaboration, can be overwhelming to configure.

### Pattern 6: Database-Driven (Build Your Own System)

**Notion "Life OS" templates** treat everything as database records with properties. A typical setup has a Tasks database with a "Life Area" select property (Work, Personal, Family, Health) plus relations to Projects, Contacts, and Goals databases. Views filter by area.

Popular templates like "Parent OS" specifically target the work+family use case with dashboards for household management, meal planning, shared family calendars, and personal goal tracking — all in one workspace.

**Strengths:** Infinitely customizable, can model any relationship. **Weakness:** Requires significant setup, no native mobile capture experience, sharing is page-level not entity-level.

---

## Family-Specific Patterns

Family task management introduces fundamentally different dynamics than personal or work contexts.

### Shared Account Model (Cozi)

Cozi uses a single shared family account. Everyone logs in with their own email but sees the same data. Color-coding identifies family members. Features span calendars, shopping lists, to-do lists, meal planning, and a recipe box. Ingredients from recipes auto-populate shopping lists.

This model treats the family as the atomic unit, not the individual. There's no "my private tasks" concept — everything is shared by default.

### Gamified Chore Assignment (OurHome)

OurHome focuses on task completion with point values for chores, rewards redemption, and progress tracking. Parents assign tasks, kids earn points. The design centers on motivation and accountability rather than planning.

### Shared Lists Within Personal Apps (Apple Reminders, Microsoft To Do)

The mainstream approach: keep your personal task manager, share specific lists with family. Your grocery list is shared; your work projects are not. This preserves individual privacy while enabling collaboration on specific domains.

Key limitation: shared lists are flat. There's no concept of a shared "family project" with subtasks, context, and notes — just a shared checklist.

---

## Key Design Tensions

### 1. Unified View vs. Focused View

Every app must answer: when you open the app, do you see everything or just one domain? The winning pattern is **unified by default, filterable by context.** Things 3's "Today" view, Todoist's merged Today, and OmniFocus perspectives all do this.

### 2. Privacy Boundaries Within Sharing

The hardest design problem for a work+personal+family app. Work tasks should never leak to family. Personal tasks are private. Family tasks are shared. But the same person needs to see all three in their daily plan. Solutions range from:

- **Separate apps** (most common in practice — people use Asana for work, Apple Reminders for family)
- **Workspace isolation** (Todoist's approach — team data is separate)
- **List-level sharing** (Apple Reminders — share specific lists, keep others private)
- **No sharing** (Things 3, Amazing Marvin — personal tools only)

### 3. Context as Container vs. Context as Tag

Should "Work" be a folder that contains tasks, or a tag applied to tasks? Containers (Things 3 Areas, TickTick Folders) enforce one-to-one: a task belongs to exactly one area. Tags (OmniFocus, Todoist labels) allow many-to-many: a task can be both @work and @phone. The container model is simpler; the tag model is more flexible.

### 4. Capture Friction vs. Organization

If you require context at capture time ("Is this work or personal?"), you add friction. If you don't, tasks pile up uncontextualized. The best apps defer categorization: capture with zero friction (just a title), then triage later. Things 3's Inbox and Todoist's Inbox both work this way.

### 5. Individual-First vs. Family-First

Cozi and OurHome are family-first: the family is the unit, individuals are members. Things 3 and OmniFocus are individual-first: you are the unit, there's no concept of shared. Almost no app handles both well — the individual who also has a rich family coordination layer. This is Symphony's opportunity.

---

## What This Means for Symphony OS

Based on this research, Symphony's positioning in the landscape is distinctive in several ways:

**Symphony's "context" field (work/personal/family) is closest to Things 3's Areas** — a simple, singular classification. But unlike Things 3, Symphony plans to make family context genuinely shared rather than just a private label.

**The capture → triage separation aligns with industry best practice.** Todoist, Things 3, and OmniFocus all have inboxes where uncategorized items land first. Symphony's QuickCapture (title only) → Inbox → Triage flow is the right pattern.

**The "rich context" model (links, phone numbers, notes on tasks) is underexplored.** Most apps treat tasks as titles with due dates. Symphony's bet that context should be first-class — that the phone number for the dentist should live on the "Schedule cleaning" task — is a genuine differentiator.

**The gap in the market is the individual-first app with real family sharing.** No major task manager handles the "I'm one person with work, personal, AND shared family responsibilities" use case elegantly. They're either personal-only (Things 3, Amazing Marvin), team/work-oriented (Todoist, Asana), or family-only (Cozi, OurHome).

**Suggested considerations from the research:**

- Keep context as a simple enum (work/personal/family), not a freeform tag system — simplicity wins for non-power-users
- The unified daily view that spans all contexts is essential — it's how everyone does it
- Filtering by context should be one tap, not buried in settings
- Family sharing should work at the task/project level, not the account level (avoid Cozi's "shared account" model)
- Respect privacy boundaries: work and personal tasks should never be visible to family members, even in shared views
- Consider a "family inbox" where either partner can capture tasks that need joint triage

---

## Sources

- [Managing Tasks across the Work-Life Boundary (ACM)](https://dl.acm.org/doi/10.1145/3582429)
- [Todoist Team Workspaces (TechCrunch)](https://techcrunch.com/2024/02/07/todoist-adds-team-workspaces-to-its-task-manager/)
- [Todoist Workspaces FAQ](https://www.todoist.com/help/articles/team-workspaces-faq-dCQNAHDjU)
- [Things 3 Setup (stefanzweifel.dev)](https://stefanzweifel.dev/posts/2022/12/18/my-updated-things-3-setup/)
- [How I Use Things 3 (birchtree.me)](https://birchtree.me/blog/how-i-use-things-3-to-organize-my-life/)
- [OmniFocus GTD Contexts & Perspectives](https://medium.com/smarter-productivity/a-modern-approach-to-gtd-contexts-and-perspectives-in-omnifocus-32a5256f1a0e)
- [OmniFocus Tags (40+ Ways)](https://learnomnifocus.com/forty-ways-to-use-omnifocus-3-tags/)
- [TickTick Lists & Folders](https://help.ticktick.com/articles/7055782283059396608)
- [Amazing Marvin Categories](https://help.amazingmarvin.com/en/articles/2567722-categories-projects-and-tasks)
- [Amazing Marvin Category Context](https://help.amazingmarvin.com/en/articles/1950151-category-context)
- [Apple Reminders Smart Lists](https://support.apple.com/guide/iphone/use-smart-lists-iphe882772ed/ios)
- [Apple Reminders Shared Lists](https://support.apple.com/guide/iphone/share-and-collaborate-iph2a8f9121e/ios)
- [Microsoft To Do Cross-Account Sharing](https://techcommunity.microsoft.com/t5/microsoft-to-do-blog/introducing-list-sharing-from-personal-accounts-to-work-accounts/ba-p/1733030)
- [Cozi Family Organizer](https://www.cozi.com/)
- [OurHome vs Cozi](https://www.daeken.com/blog/ourhome-vs-cozi-app/)
- [Notion Parent OS Template](https://www.notion.com/templates/parent-os-family-work-life-dashboard)
- [Notion Life OS Templates (PathPages)](https://pathpages.com/blog/notion-life-os)
- [MyLifeOrganized Contexts](https://www.mylifeorganized.net/)
- [Top 20 Task Managers 2026 (SelfManager.ai)](https://selfmanager.ai/articles/top-20-task-managers-for-personal-use-2026)
