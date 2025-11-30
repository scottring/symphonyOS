# Symphony OS: Product Vision

*Last updated: November 30, 2025*

---

## What Symphony Is

A personal operating system for organizing your life. Desktop for planning, mobile for capture and execution. Covers work, personal, and family — not just family.

**Core insight:** The problem isn't lack of features. It's that captured information doesn't surface at the right time with the right context.

---

## The Core Loop

1. **Capture** — Quick add on mobile, share sheet, email forward → lands in inbox
2. **Plan** — Weekly session: brain dump, process inbox, AI helps structure, review calendar, assign tasks
3. **Execute** — Contextual cards surface what you need with all attached context
4. **Sync** — Family domain reviewed together with Iris weekly

---

## Architecture

**User-first with domains:**
- You are the primary unit (not family)
- Domains are containers you create (Work, Personal, Family, etc.)
- Family is just a domain that happens to be shared
- Everything (tasks, events, meals, projects) lives in a domain

**User engagement levels (per-user choice):**
- Full Planner: Multiple domains, brain dumps, goals, solo planning
- Domain Planner: Specific domains only, lighter weight
- Participant: Sees assignments, completes tasks, no planning

---

## MVP (V1): Tasks + Calendar + Execution UI

**You can:**
- Create tasks with attached context (notes, links, files, phone numbers)
- Assign tasks to a date/time
- See your Google Calendar events
- Open the app and see contextual cards for what's now/next with everything you attached

**You cannot (yet):**
- AI-assisted planning session
- Meal planning
- Collaborative planning with Iris
- Routines/recurring assignments
- Inbox/capture flows (share sheet, email forward)
- Domains (everything is just yours for now)

---

## Build Sequence

1. **Week 1:** Task CRUD — create, read, update, delete. Working reliably.
2. **Week 2:** Context attachments — notes, links, files on tasks
3. **Week 3:** Google Calendar sync — read events, display alongside tasks
4. **Week 4:** Execution UI — contextual cards at right time
5. **Week 5:** Date/time assignment for tasks

Then later phases.

---

## Later Phases (Not V1)

- AI-assisted weekly planning (brain dump → structured plan)
- Inbox + capture flows (share sheet, email forward)
- Meal planning (prompt-driven, recipes, grocery lists)
- Collaborative family planning (Sunday sync with Iris)
- Routines (recurring assignments like school runs)
- Domains (multi-domain support, sharing)
- Financial overview (balances only)

---

## What Symphony Is NOT

- Email client (tasks can reference emails)
- Code editor (tasks reference work, IDE is separate)
- Full budgeting tool (balances yes, categorization no)
- Replacement for Google Calendar (GCal is source of truth)

---

## Key Behaviors

**Google Calendar:** Source of truth. Symphony reads from and writes to GCal, but GCal is the authority.

**Quick capture:** Symphony mobile. Stuff goes to inbox for processing during planning.

**Inbox model:** Unprocessed captures sit in inbox. During planning, items either become tasks or get attached to existing tasks. If you don't process something, it stays until you do.

**Contextual surfacing (V1):** The system shows you what you explicitly linked, not what it guesses. You set it up well once, it delivers reliably every time. Later phases may add inference.

---

## Execution UI: The Card

When it's time to do something, you see a card with:
- The task/event itself
- Everything you attached (notes, phone number, links, files)
- One-tap actions (call, navigate, mark done)

**Example:** "Order blinds from blinds.com — Wednesday"
Card shows: The task, phone number, your notes (measurements, color choices), link to product page. No searching.

---

## Dashboard

**When you open Symphony:**
- Today-focused: Current/upcoming cards, today's calendar, today's tasks
- Sections by urgency: Active Now, Coming Up, Later Today
- Stats at top: Tasks done, focus time

**Other views available:**
- List view: All tasks, filterable
- Calendar view: Tasks + events on calendar
- Project view: Tasks grouped by project

---

## Planning (Future, Not V1)

**Solo planning session:**
1. Brain Dump — Large text area, freeform input
2. AI Processing — Parses dump, matches existing, categorizes, surfaces commitments
3. Review & Adjust — Visual structured output, click to confirm/modify, drag to schedule
4. Gaps & Goals — AI prompts about neglected projects
5. Done → Execution Ready

**Family planning (Sunday sync):**
- You've done solo planning already
- Sit with Iris, same device
- Review family domain together
- Add things, negotiate assignments, spot conflicts
- Output: Clear family plan for the week

---

## Meal Planning (Future, Not V1)

**Input:** Natural language prompt
- "What should we have for dinner tonight?"
- "Plan dinners for this week, we're busy Tuesday and Thursday"
- "We have chicken thighs to use up"

**System knows:**
- Saved preferences (dietary, kid-friendly)
- Saved recipes + favorite sources
- Recent meal history
- Schedule (busy nights = easy meals)
- Who cooks when

**Output per meal:**
- Recipe (stored locally, not just a link)
- Date assigned
- Who's cooking
- Prep strategy (make-ahead, quick, slow cooker)
- Grocery list generated
- Recipe surfaces at cooking time

---

## Routines (Future, Not V1)

**Track:** Things with assignments that change (who does school run this week), things with time commitments (CrossFit MWF)

**Don't track:** Household tasks that just get done without scheduling (cleaning counters)

---

## Design Language

Preserve from current Symphony:

**Tokens:**
- Scandinavian-inspired warm neutrals
- Forest green primary (#3d8b6e)
- Generous spacing, soft shadows, rounded corners
- Comfortable typography

**Components:**
- Activity cards with type-based color coding
- Expandable details with checklists, location, context
- Swipe gestures (right = complete, left = defer)
- Bottom nav on mobile
- Stat cards at top of dashboard

**Simplify:**
- One card component, not three
- One dashboard, not V1 + V2
- Smaller, focused components

---

## Technical Approach

**Rebuild from scratch:**
- New Supabase project, clean schema
- Reuse Google OAuth credentials
- Schema-first design, fewer tables, clear relationships
- Test as you go, manual testing with real data
- Boring technology choices, standard patterns
- Deploy early, use it as it's built

**Stack (carry forward):**
- React + TypeScript
- Vite
- TailwindCSS
- Radix UI / shadcn components
- Supabase (auth, database, edge functions)
- TanStack Query
- Google Calendar API

---

## Success Criteria

**Done looks like:** Life feels organized and smoother. The surfacing works — you planned it ahead, and it shows up when you need it with everything attached. No searching for context.

**MVP success:** You use it daily for real tasks. It's more reliable than the current buggy Symphony. Adding a task and seeing it later actually works every time.

---

## Out of Scope (Explicit No)

- JJ Telegram bot integration (separate system, ignore for now)
- Voice input / transcription (future, not V1)
- Apple ecosystem integration (Reminders, Notes)
- Multi-family support
- Team/organization features
- Public sharing

---

## Reference

**Current codebase:** `/Users/scottkaufman/Dropbox/01. Personal Master Folder/30-39 Music, Coding & Creative/38 Coding Projects/sync-family-time`

**Lovable project:** https://lovable.dev/projects/29d140b4-b0e2-46ca-a1a6-77134c85172a

**This rebuild:** `/Users/scottkaufman/Dropbox/01. Personal Master Folder/30-39 Music, Coding & Creative/38 Coding Projects/symphony-rebuild`
