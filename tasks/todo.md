# Symphony OS - Project Plan

## Current: Projects MVP

### Database
- [ ] Migration 006: Create projects table (id, user_id, name, status default 'active', notes, parent_id nullable FK to self, timestamps)
- [ ] Migration 007: Add project_id FK to tasks table

### Hook
- [ ] Create Project type (src/types/project.ts)
- [ ] Create useProjects hook with CRUD + search by name

### Quick Capture Integration
- [ ] Add "#" trigger in QuickCapture to show project search dropdown
- [ ] Project selection attaches project_id to task
- [ ] "Create [name] as project" option when no match

### Detail Panel Integration
- [ ] Show project chip/card when task has linked project
- [ ] Edit project button
- [ ] Unlink project from task

### Project View
- [ ] Create ProjectView component showing all tasks in project
- [ ] Sort: incomplete first, then by scheduled date
- [ ] Date-agnostic (shows all project tasks regardless of when scheduled)

### Navigation
- [ ] Desktop: Projects section in sidebar, list active projects, "+ New Project"
- [ ] Mobile: Projects icon in header → full-screen project list

---

## Completed: Contacts MVP

- [x] Migration 004: Create contacts table
- [x] Migration 005: Add contact_id FK to tasks
- [x] Create Contact type and useContacts hook
- [x] "@" trigger in QuickCapture for contact search
- [x] Contact card in DetailPanel with phone/email actions
- [x] Inline contact editing

---

## Completed: V1 (Mobile & Deploy)

- [x] Mobile responsive layout
- [x] Detail view as full-screen overlay
- [x] Deploy to Vercel: https://symphony-rebuild.vercel.app
- [x] Quick capture floating + button
- [x] Event notes feature

---

## Future Phases (Post-V1)

### Phase 4: Gmail Integration

Light integration — reference emails as task context, not an email client.

**Scope:**
- Add Gmail read scope to existing Google OAuth
- Search Gmail from within Symphony
- Attach email reference to task (link + subject + snippet + date)
- AI extraction of key info (dates, amounts, confirmation numbers)

### Phase 5: AI-Assisted Planning

- Brain dump → structured tasks
- Weekly planning session
- Gap detection

### Phase 6: Smart Capture

- Duplicate detection during entry
- Surface existing related tasks while capturing
- Context suggestions based on similar past tasks

### Phase 7: Search + Query + Goals

**Search & AI Query:**
- Global search across tasks, events, contacts, projects, notes
- AI natural language queries ("What did Dr. Mills say about DBS?")
- Second brain retrieval layer

**Goals:**
- Goals table (id, user_id, name, description, status)
- Goals are ongoing/aspirational (vs completable projects)
- Projects can optionally link to a Goal ("why am I doing this?")
- Goals don't nest; they're organizing principles
- Examples: "Be a present father", "Build financial security"

### Phase 8: Meal Planning

- Natural language meal requests
- Recipe storage
- Grocery list generation
- Meal surfacing at cooking time

### Phase 9: Collaborative Planning

- Family domain
- Shared tasks/events
- Sunday sync workflow

---

## Completed Phases

### Phase 3
- [x] Event Notes - Supabase table, useEventNotes hook, editable Symphony notes
- [x] All Day Section - Display all-day events at top of schedule

### Phase 2
- [x] Contextual actions - View Recipe, Join Call, Get Directions
- [x] UI Refinements - Swipe gestures, empty states, loading skeletons

### Phase 1
- [x] Auth (Supabase)
- [x] Task CRUD with persistence
- [x] Google Calendar integration
- [x] Desktop UI rebuild
- [x] Time-based grouping
- [x] Task scheduling
- [x] Date navigation
