# Symphony OS - Project Plan

*Last updated: December 1, 2025*

---

## Vision Summary

A **user-first personal life OS**. You are the primary unit. Domains (Work, Personal, Family) are containers you create. Family is just one domain that happens to be shared.

---

## Phase 1: MVP ✅ COMPLETE

Core task + calendar + execution UI.

- [x] Task CRUD with Supabase persistence
- [x] Context attachments (notes, links, phone numbers)
- [x] Google Calendar sync (read events)
- [x] Execution UI (time-based grouping: Active Now / Coming Up / Later Today)
- [x] Date/time assignment for tasks
- [x] Day navigation (prev/next day, back to today)

---

## Phase 2: MVP Polish (Current)

Finish the execution experience before adding new major features.

### 2.1 Contextual One-Tap Actions
- [ ] **Get Directions** — Events/tasks with location → open Google Maps
- [ ] **Join Call** — Events with video links (Zoom/Meet/Teams) → extract and open
- [x] **Call/Text** — Already implemented for phone numbers

### 2.2 UI/UX Refinements
- [ ] Empty states for non-today dates ("Nothing scheduled for Thursday")
- [ ] Visual distinction between past/future when viewing other days
- [ ] Swipe gestures (right = complete, left = defer)
- [ ] Pull-to-refresh for calendar events

### 2.3 Stability & Edge Cases
- [ ] Handle Google Calendar token refresh
- [ ] Offline support / error states
- [ ] Loading skeletons for calendar fetch

---

## Phase 3: Notes & Capture

Notes are a first-class feature, not just a text field. Any content can have notes attached. All notes flow into a chronological timeline.

### 3.1 Notes Data Model
- [ ] Create `notes` table in Supabase:
  ```
  Note {
    id
    user_id
    content (text/markdown)
    created_at
    updated_at
    attached_to_type (task | event | project | standalone)
    attached_to_id (nullable for standalone)
    extracted_topics[] (AI-generated on save)
  }
  ```
- [ ] Migrate existing `notes` field on tasks to note entities
- [ ] Create `useNotes` hook for CRUD operations

### 3.2 Notes UI
- [ ] Add note button on ExecutionCard (tasks and events)
- [ ] Note composer (text area, save/cancel)
- [ ] Display attached notes on cards
- [ ] Notes timeline view (chronological list of all notes)
- [ ] Filter timeline by: date range, attached entity type

### 3.3 Quick Capture
- [ ] Floating "+" button for quick capture
- [ ] Quick capture creates standalone note (goes to inbox)
- [ ] Inbox view: unattached notes waiting to be processed
- [ ] Processing UI: attach note to existing task/event or convert to task

### 3.4 Related Notes (AI-assisted)
- [ ] On note save: extract topics/entities via AI (lightweight, runs once)
- [ ] Store extracted topics as metadata
- [ ] "Related notes" section: other notes with overlapping topics
- [ ] Later: semantic search with embeddings (Phase 4 prerequisite)

### 3.5 External Capture (Future)
- [ ] Share sheet integration (iOS/Android)
- [ ] Email forward to inbox (Supabase edge function)

---

## Phase 4: AI-Assisted Planning

Weekly planning session with AI help. Requires notes system (Phase 3) to reference user's captured thoughts.

- [ ] Brain dump UI (large text area, freeform input)
- [ ] AI parsing (extract tasks, dates, commitments)
- [ ] Surface relevant notes during planning
- [ ] Review & adjust UI (structured output, drag to schedule)
- [ ] Gap detection (neglected projects, upcoming deadlines)

---

## Phase 5: Domains & People

Multi-context support (Work, Personal, Family, etc.) and contact management.

### 5.1 Domains
- [ ] Domain data model (Work, Personal, Family, etc.)
- [ ] Domain CRUD UI
- [ ] Filter/view by domain
- [ ] Assign tasks/events/notes to domains
- [ ] Domain-based calendar filtering

### 5.2 People / Contacts
People are first-class entities. Avoids re-entering phone numbers for recurring contacts like "Tony the painter."

- [ ] People data model:
  ```
  Person {
    id
    user_id
    name
    phone
    email
    domain_id (which context: Work, Personal, Family)
    google_contact_id (optional link to native contact)
    notes[] (attached notes about this person)
    created_at
  }
  ```
- [ ] People CRUD UI (simple list + add/edit)
- [ ] Link tasks to people (when creating "Text Tony", select from people)
- [ ] Auto-populate phone/email from linked person
- [ ] Google Contacts integration (optional):
  - [ ] Search native contacts when adding a person
  - [ ] Import contact details (name, phone, email)
  - [ ] Keep link for future sync
- [ ] People referenced in notes (AI extraction in Phase 3 can detect names)

---

## Phase 6: Collaborative Planning

Family/shared domain features.

- [ ] Invite users to shared domains
- [ ] Shared task visibility
- [ ] Assignment to domain members
- [ ] Sunday sync UI (review family domain together)

---

## Phase 7: Meal Planning

Prompt-driven meal planning with recipes.

- [ ] Recipe storage (local, not just links)
- [ ] Meal prompt UI
- [ ] AI meal suggestions
- [ ] Grocery list generation
- [ ] Recipe surfacing at cooking time

---

## Phase 8: Routines

Recurring assignments with flexible ownership.

- [ ] Routine data model
- [ ] Routine assignment rotation
- [ ] Routine visibility in daily view

---

## Out of Scope (Explicit No)

- Email client
- Full budgeting/categorization
- Voice input (future, not now)
- Apple ecosystem integration
- Multi-family / team features
- Public sharing

---

## Current Focus

**Phase 2: MVP Polish**

Complete Phase 2 before starting Phase 3 (Notes & Capture).

---
