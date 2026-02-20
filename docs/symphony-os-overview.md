# Symphony OS

**A personal operating system for work, life, and family.**

Symphony OS is built around a simple observation: the information you need to act is scattered across a dozen apps. The contractor's number is in your contacts, the tile measurements are in Notes, the product link is in a browser tab, and the task itself is in yet another app. By the time you're ready to act, you've already forgotten half of what you planned.

Symphony fixes this by making **context first-class**. Tasks aren't just titles on a list -- they're rich containers that hold links, phone numbers, notes, and files. You attach context once during planning. It surfaces automatically when it's time to act.

---

## Three Domains, One View

Your life doesn't fit neatly into a single category, and Symphony doesn't pretend it does. Work, Personal, and Family are treated as equal, first-class domains. Filter by domain to focus. Or view everything blended on your daily timeline -- tasks, calendar events, routines, and coaching blocks side by side, ordered by time.

## Plan Deep, Execute Fast

Symphony is designed around two modes of engagement:

- **Desktop** is for deep planning. Process your inbox, attach rich context, schedule your week, review projects, run a weekly family sync. Full-page editors give you room to think.
- **Mobile** is for capture and execution. Quick-add a task in seconds. Open your day view and see exactly what's next, with everything you need right on the card. Swipe to complete, defer, or skip.

---

## Core Features

**Contextual task cards** -- Links, phone numbers, notes, and project context surface together when it's time to act. No searching, no app-switching.

**Blended daily timeline** -- Tasks, Google Calendar events, routines, and coaching blocks render in a single chronological view. One place to see your entire day.

**Projects as context containers** -- A project holds vendor links, phone numbers, and background notes. Every task in that project inherits its context automatically.

**Family sharing without compromise** -- You are the primary user, not your household. Work and personal data stay private. Family tasks are shared with robust assignment, multi-member visibility, and collaborative planning.

**Inbox with zero-friction capture** -- Quick-capture lands items in your inbox. Triage inline with date, domain, and assignee pickers. Bulk-select for batch scheduling. Items that aren't processed stay visible until you deal with them.

**Routines and recurring structure** -- Daily or weekly routines with time-of-day anchoring. Track completion, skip, or reschedule per instance. Assign routines to family members.

**Clarity score** -- A real-time health metric showing how organized your tasks are. Identifies inbox items that need triage, aging tasks, unassigned work, and empty projects. Actionable remediation right from the indicator.

---

## Coaching Intelligence Layer

Symphony's most distinctive feature is a coaching system that turns your daily schedule into a guided experience. Rather than just listing what you need to do, it coaches you on *how* to do it -- with personalized, time-blocked playbook blocks that blend into your timeline alongside tasks and events.

### Coached Daily Playbook

The coaching layer generates **playbook blocks** -- short, scripted walkthroughs for specific time windows in your day. Each block includes:

- A **time slot** (e.g., "6:50" or "5:30-6:45") with per-item times for individual steps
- A **narrative** -- italic coaching prose describing the approach and mindset
- **Action items** with who-assignment (which family member, self, partner, both)
- A **coaching note** -- a personalized insight or tip
- **Block types** that color-code the purpose: routine, connection, transition, departure, partner, sibling, together, solo, buffer, household

On mobile, blocks are **compact by default**. Only the block matching the current time auto-expands. All others show as a single collapsed row with progress dots. This keeps coaching present without overwhelming the day view.

### Three-Tier Feedback System

After completing a block, feedback is lightweight and fast:

1. **Quick React** (1 second) -- Nailed it, Okay, or Tough
2. **Quick Tags** (3 seconds) -- Auto-generated contextual tag bubbles
3. **Notes** (30+ seconds) -- Free-text reflection when something is worth recording

### The Coaching Flywheel

Feedback doesn't disappear. It drives a continuous improvement cycle:

```
Daily feedback (react/tag/note)
  -> coaching_observations (persistent memory)
  -> AI reads observations during weekly playbook generation
  -> New/modified coaching blocks for next week
  -> User lives the coaching -> more feedback -> cycle continues
```

**Evening reflections** close each day with a highlight and notes, persisted and available to the AI during weekly review. A **Sunday nudge banner** reminds you to run the weekly review when it's time.

### Research-to-Rules Pipeline

The Planning Workspace provides a structured path from research to actionable coaching:

1. **Research Workspaces** -- Create topic-based collections (e.g., "Screen Time," "Bedtime Routines"). Add articles, notes, and resources.
2. **AI Synthesis** -- A multi-source synthesis engine reads all resources in a workspace and distills 3-6 draft rules.
3. **Rules Management** -- Review, edit, publish, or retire rules. Rules are grouped by category and linked to coaching blocks.
4. **Weekly Generation** -- The AI reads your published rules, accumulated coaching observations, and last week's feedback to generate next week's playbook.

### Coaching Hub and Domain Assessments

A dedicated coaching hub provides self-assessment across expandable domains. The current household-focused domains include Values, Communication, Conflict Resolution, Roles & Responsibilities, Organization, Connection, Boundaries, and Growth. Each domain supports:

- **Quick Assessment** -- Scrollable 1-5 self-rating
- **Domain Detail** -- Scored view with strengths, issues, and opportunities
- **Deep Assessment** -- Chat-based conversation for thorough exploration

The architecture is designed so future domains (Organization, Work Focus, Wellness) are added to the same system with no new architecture -- just new entries in the domain config.

### Coaching Injection

From any task or event detail panel, you can generate a coaching block on the spot. Three modes:

- **Auto** -- AI generates a coaching block based on the item's context
- **Discuss** -- Chat with the coaching AI to refine the approach
- **Manual** -- Open the block editor and write your own

Generated blocks inject directly onto your timeline and feed back into the coaching flywheel.

---

## Design

Symphony uses a warm, Scandinavian-inspired design system called **Nordic Journal**. Fraunces serif for display type, DM Sans for body text. Forest green accents on a warm cream background. Generous spacing, soft shadows, rounded cards. The interface feels like a well-made journal -- calm, intentional, and personal.

## Built With

React 19 and TypeScript in strict mode. Vite for fast builds. Tailwind CSS v4 for styling. Supabase for authentication, database, real-time subscriptions, and edge functions. Google Calendar integration for event sync. AI-powered coaching and playbook generation via OpenAI GPT-4o.

---

*Symphony OS is in active development. Built for individuals who manage complex lives across work, home, and everything in between.*
