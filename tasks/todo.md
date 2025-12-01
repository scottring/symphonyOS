# Symphony OS - Project Plan

*Last updated: December 1, 2025*

---

## Vision Summary

A **user-first personal life OS**. You are the primary unit. Domains (Work, Personal, Family) are containers you create. Family is just one domain that happens to be shared.

---

## Phase 1: MVP (Weeks 1-5) ✅ COMPLETE

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
Per VISION.md: "One-tap actions (call, navigate, mark done)"

- [ ] **Get Directions** — Events/tasks with location → open Google Maps
- [ ] **Join Call** — Events with video links (Zoom/Meet/Teams) → extract and open
- [ ] **Call/Text** — Already implemented for phone numbers ✅

### 2.2 UI/UX Refinements
- [ ] Empty states for non-today dates ("Nothing scheduled for Thursday")
- [ ] Visual distinction between past/future when viewing other days
- [ ] Swipe gestures (right = complete, left = defer) — per VISION.md
- [ ] Pull-to-refresh for calendar events

### 2.3 Stability & Edge Cases
- [ ] Handle Google Calendar token refresh
- [ ] Offline support / error states
- [ ] Loading skeletons for calendar fetch

---

## Phase 3: Inbox & Capture

Quick capture on mobile, process during planning.

- [ ] Inbox data model (unprocessed items)
- [ ] Quick add UI (minimal friction capture)
- [ ] Share sheet integration (iOS/Android)
- [ ] Email forward to inbox (Supabase edge function)
- [ ] Inbox processing UI (convert to task or attach to existing)

---

## Phase 4: AI-Assisted Planning

Weekly planning session with AI help.

- [ ] Brain dump UI (large text area, freeform input)
- [ ] AI parsing (extract tasks, dates, commitments)
- [ ] Review & adjust UI (structured output, drag to schedule)
- [ ] Gap detection (neglected projects, upcoming deadlines)

---

## Phase 5: Domains

Multi-context support.

- [ ] Domain data model (Work, Personal, Family, etc.)
- [ ] Domain CRUD UI
- [ ] Filter/view by domain
- [ ] Assign tasks/events to domains
- [ ] Domain-based calendar filtering

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
- [ ] Meal prompt UI ("What should we have for dinner?")
- [ ] AI meal suggestions based on preferences, schedule, inventory
- [ ] Grocery list generation
- [ ] Recipe surfacing at cooking time

---

## Phase 8: Routines

Recurring assignments with flexible ownership.

- [ ] Routine data model (who does what, when)
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

**Phase 2.1: Contextual One-Tap Actions**

Next steps:
1. Add "Get Directions" button for items with location
2. Add "Join Call" button for events with video links
3. Test on mobile

---
