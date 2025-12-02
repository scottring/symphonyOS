# Symphony OS - Project Plan

## Completed: DetailPanel Redesign (Progressive Disclosure)

Optimized for quick task completion with rich context available on demand.

### Changes Made
- [x] **Header redesign**: Checkbox in header, inline title editing, single tappable time display
- [x] **Notes section**: Always visible at top, click-to-edit, shows Google Calendar description for events
- [x] **Collapsible sections**: Contact (with quick call/text), Project (with open button), Links (with count)
- [x] **Removed redundancies**: Phone field removed (use contact's phone), duplicate time display removed
- [x] **Footer actions**: Delete moved to bottom with confirmation dialog
- [x] **Contextual actions**: Repositioned below notes section

---

## Current: Projects MVP

### 1. Database Migrations
- [ ] Create `supabase/migrations/007_projects.sql`: projects table with RLS
- [ ] Create `supabase/migrations/008_add_project_to_tasks.sql`: add project_id to tasks

### 2. Types
- [ ] Create `src/types/project.ts`: Project and DbProject interfaces
- [ ] Update `src/types/task.ts`: add projectId field

### 3. Hook: useProjects
- [ ] Create `src/hooks/useProjects.ts`: CRUD + search (follow useContacts pattern)

### 4. Quick Capture Integration
- [ ] Add `#` trigger detection in QuickCapture
- [ ] Project dropdown with search results
- [ ] Project selection shows chip, attaches project_id to task
- [ ] "Create [name] as project" option
- [ ] Project creation form (simpler than contact - just name)

### 5. Detail Panel Integration
- [ ] Create `src/components/detail/ProjectCard.tsx` (simpler than ContactCard)
- [ ] Show ProjectCard in DetailPanel when task has projectId
- [ ] Unlink project button
- [ ] Edit project inline

### 6. Project View Component
- [ ] Create `src/components/project/ProjectView.tsx`
- [ ] Fetch tasks by project_id
- [ ] Sort: incomplete first, then by scheduledDate (nulls last)
- [ ] Show parent breadcrumb if project has parent
- [ ] List sub-projects if project has children

### 7. Navigation - Desktop Sidebar
- [ ] Add "Projects" section to Sidebar
- [ ] List active projects
- [ ] Click project → open ProjectView

### 8. Navigation - Mobile
- [ ] Add projects icon to mobile header
- [ ] Full-screen project list overlay
- [ ] Full-screen ProjectView on project select

### 9. Wire Everything Together
- [ ] Add useProjects to App.tsx
- [ ] Pass projects to QuickCapture
- [ ] Pass project to DetailPanel
- [ ] Create view state for showing ProjectView

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

Light integration - reference emails as task context, not an email client.

**Scope:**
- Add Gmail read scope to existing Google OAuth
- Search Gmail from within Symphony
- Attach email reference to task (link + subject + snippet + date)
- AI extraction of key info (dates, amounts, confirmation numbers)

### Phase 5: AI-Assisted Planning

- Brain dump -> structured tasks
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
