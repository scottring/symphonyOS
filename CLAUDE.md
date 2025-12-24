# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Symphony OS is a personal operating system for work, life, and family. The core insight: captured information doesn't surface at the right time with the right context. Symphony fixes this by making **context first-class** — links, phone numbers, notes, files attach to tasks and projects, then surface automatically when you need them.

**Three domains, equally important:** Work (private), Personal (private), Family (shared)

**Built for individuals, designed for sharing:** You are the primary unit. Your data is private. Family sharing is robust and first-class, not bolted on.

**Philosophy:** Plan deeply on desktop when you have time to think. Capture quickly and execute effortlessly on mobile when life happens.

See `POSITIONING.md` for product positioning and `VISION.md` for detailed product context.

---

## Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npm test             # Run unit tests (Vitest)
npm run test:ui      # Vitest with UI
npm run test:coverage # Coverage report
npm run test:e2e     # Playwright E2E tests
npm run test:e2e:ui  # Playwright with UI
```

Run a single test file:
```bash
npx vitest src/components/detail/DetailPanel.test.tsx
```

Run a single E2E test:
```bash
npx playwright test e2e/app.spec.ts
```

---

## Tech Stack

- React 19 + TypeScript (strict mode)
- Vite 7 for bundling
- Tailwind CSS v4 with **Nordic Journal** design system
- Supabase for backend (auth, database, realtime)
- Vitest + React Testing Library for unit tests
- Playwright for E2E (Desktop Chrome + Mobile Chrome)

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { Component } from '@/components/Component'
```

---

## Architecture Overview

### Core Philosophy

**Capture → Triage separation:**
- **Capture:** Zero friction brain dump. QuickCapture = title only.
- **Triage:** Review and categorize later. Happens in Inbox section via inline icons.

**Planning rhythm:**
| When | What |
|------|------|
| Continuous | Quick triage from inbox |
| Daily review | Process remaining inbox items |
| Weekly planning | Review deferred items, plan ahead |

**Desktop/Mobile split:**
| Platform | Task interaction |
|----------|------------------|
| Desktop (≥768px) | Full-page TaskView |
| Mobile (<768px) | Bottom sheet DetailPanel |

### Key Data Models

**Task:**
```typescript
interface Task {
  id: string
  title: string
  completed: boolean
  scheduled_for: Date | null      // null = inbox
  context: 'work' | 'family' | 'personal' | null  // Life domain

  // Rich context (what makes Symphony different)
  notes?: string                  // Detailed notes, measurements, decisions
  links?: TaskLink[]              // Product links, documentation, reservations
  phoneNumber?: string            // Vendor, doctor, school, contractor

  // Relationships
  project_id: string | null
  contact_id: string | null       // Who task is ABOUT
  assigned_to: string | null      // Who should DO it

  created_at: Date
  updated_at: Date
}
```

**Important:** `contact_id` ≠ `assigned_to`
- `contact_id`: Related person (e.g., "Call Dr. Smith" → Dr. Smith)
- `assigned_to`: Owner/assignee (e.g., "Iris should handle this")

**Context is key:** Links, phone numbers, and notes are first-class. Set them up during planning, they surface during execution.

**Project:**
```typescript
interface Project {
  id: string
  name: string
  status: 'not_started' | 'in_progress' | 'on_hold' | 'completed'
  type?: 'general' | 'trip'

  // Rich context (context containers)
  notes?: string                  // Project notes, decisions, background
  links?: TaskLink[]              // Vendor websites, documentation
  phoneNumber?: string            // Primary contact/vendor number

  // Tasks link to projects via project_id
  // Tasks inherit project context automatically
}
```

**Routine:**
```typescript
interface Routine {
  id: string
  name: string
  recurrence_pattern: { type: 'daily' | 'weekly', days?: string[] }
  time_of_day?: string
  is_active: boolean
}
```

### Component Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        # Main layout wrapper
│   │   ├── Sidebar.tsx         # Navigation
│   │   └── QuickCapture.tsx    # Brain dump input (title only)
│   ├── schedule/
│   │   ├── TodaySchedule.tsx   # Main day view
│   │   ├── TaskCard.tsx        # Universal task card with triage icons
│   │   └── InboxSection.tsx    # Unscheduled tasks (bottom of page)
│   ├── triage/
│   │   ├── WhenPicker.tsx      # 📅 Date selection popover
│   │   ├── ContextPicker.tsx   # 🏷️ Work/Family/Personal picker
│   │   └── AssignPicker.tsx    # 👤 Contact assignment picker
│   ├── task/
│   │   └── TaskView.tsx        # Full-page task editor (desktop)
│   ├── detail/
│   │   └── DetailPanel.tsx     # Slide-over panel (mobile)
│   ├── project/
│   │   ├── ProjectsList.tsx    # Project list view
│   │   └── ProjectView.tsx     # Full-page project view
│   └── routine/
│       ├── RoutinesList.tsx    # Routine list view
│       └── RoutineForm.tsx     # Routine editor
├── hooks/
│   ├── useSupabaseTasks.ts     # Task CRUD
│   ├── useProjects.ts          # Project CRUD
│   ├── useRoutines.ts          # Routine CRUD
│   ├── useContacts.ts          # Contact CRUD
│   ├── useAuth.ts              # Supabase auth
│   ├── useGoogleCalendar.ts    # Calendar integration
│   └── useIsMobile.ts          # Responsive breakpoint hook
└── types/
    ├── task.ts
    ├── project.ts
    ├── routine.ts
    └── contact.ts
```

---

## Design System: Nordic Journal

**Theme file:** `src/index.css`

**Fonts:**
- Display: `font-display` → Fraunces (elegant serif)
- Body: Default → DM Sans (warm geometric)

**Key classes:**
- `.card` — Elevated card with warm shadow
- `.btn-primary` — Forest green gradient button
- `.input-base` — Styled input field
- `.font-display` — Fraunces serif for headlines

**Entity creation inputs use large serif font:**
```tsx
<input className="text-2xl font-display ..." />
```

**Colors:**
- Primary: Forest green (`--color-primary-500`)
- Background: Warm cream (`--color-bg-base`)
- Cards: Soft off-white (`--color-bg-elevated`)

---

## UI Patterns

### Task Card Anatomy

```
┌─────────────────────────────────────────────────┐
│ ○ Task title here                    📅  🏷️  👤 │
│   #Project Name ×                               │
│   @Assigned Person ×                            │
└─────────────────────────────────────────────────┘
```

- Icons right-aligned, expand to popovers on tap
- Project/assignee chips below title
- Checkbox left, title flexible width

### Triage Icons

| Icon | Action | Options |
|------|--------|---------|
| 📅 Calendar | When | Today, Tomorrow, Next Week, Someday, +Date |
| 🏷️ Tag | Context | Work, Family, Personal |
| 👤 Person | Assign | Contact picker |

### Page vs Panel

- **Full page** (desktop): TaskView, ProjectView, RoutineForm
- **Panel/Modal** (mobile): DetailPanel as bottom sheet

---

## Testing

- Unit tests: `src/**/*.{test,spec}.tsx`
- E2E tests: `e2e/` directory
- Test utilities: `src/test/test-utils.tsx` provides custom `render()` with providers

**Key test files:**
- `DetailPanel.test.tsx` — 10 tests
- `ProjectView.test.tsx` — 13 tests
- `useRoutines.test.ts` — 17 tests
- `QuickCapture.test.tsx` — 12 tests

---

## Current Work

Active spec: `tasks/v1.5-desktop-mobile-split.md`

**In progress:**
1. Simplified QuickCapture (title only)
2. Inbox section at bottom of Today view
3. Triage icons on task cards (📅 🏷️ 👤)
4. Desktop/mobile responsive routing
5. TaskView full-page component

---

## Future Plans

### Near-term (V1.5-V1.6)
- [ ] "Next Week" triage bucket → surfaces in weekly planning
- [ ] "Someday" list → no timeline, review periodically
- [ ] Daily review prompt → if inbox not empty at day end
- [ ] Notes on tasks (V1.6)

### Medium-term
- [ ] Weekly planning view
- [ ] Subtasks
- [ ] File attachments
- [ ] Activity history on tasks

### Long-term
- [ ] True multi-user → Iris has her own view, shared family tasks
- [ ] Context-aware surfacing → Work items at work time, family in evening
- [ ] Calendar event assignment/context
- [ ] Routine assignment ("Iris handles trash on Tuesdays")

---

## Workflow for Claude Code

1. **Read the codebase** — Find relevant files before changing anything
2. **Write a plan** — Create todo list in `tasks/todo.md`
3. **Get approval** — Check in before starting work
4. **Execute** — Work through items, marking complete
5. **Summarize** — High-level explanation of changes
6. **Review** — Add review section to todo file

## Code Principles

- **Simplicity above all** — Every change as simple as possible
- **Minimal impact** — Only touch code directly relevant to task
- **No laziness** — Find root causes, no temporary fixes
- **Senior-level rigor** — You are a senior developer, act like one
- **Avoid bugs** — Simple changes = fewer bugs

---

## Useful References

- `VISION.md` — Product vision and philosophy
- `tasks/v1.5-desktop-mobile-split.md` — Current implementation spec
- `src/index.css` — Full Nordic Journal design system
- `src/App.tsx` — Main app routing and state
