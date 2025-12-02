# Symphony OS - Project Plan

## Current: Contacts MVP

### Database
- [ ] Migration 004: Create contacts table (id, user_id, name, phone, email, notes, timestamps)
- [ ] Migration 005: Add contact_id FK to tasks table

### Hook
- [ ] Create Contact type (src/types/contact.ts)
- [ ] Create useContacts hook with CRUD + search by name

### Quick Capture Integration
- [ ] Add "@" trigger in QuickCapture to show contact search dropdown
- [ ] Contact selection attaches contact_id to task
- [ ] "Create [name] as contact" option when no match

### Detail Panel Integration
- [ ] Show contact card when task has linked contact (name, phone, email)
- [ ] Phone tap → call/text actions
- [ ] Link/unlink contact from task

---

## Up Next: Mobile & Deploy (V1 Finish Line)

### Mobile Responsive Layout
- [x] Hide sidebar on mobile, full-width day view
- [x] Touch-friendly card sizes (48px minimum tap targets)
- [x] Detail view as full-screen overlay instead of side panel
- [x] Recipe viewer as full-screen overlay with narrative formatting
- [ ] Test on actual phone

### Deployment
- [x] Add vercel.json with SPA config
- [x] Deploy to Vercel
- [x] Get mobile-accessible URL: https://symphony-rebuild.vercel.app
- [ ] Test PWA installation

### Stability (as needed)
- [ ] Token refresh handling
- [ ] Error boundaries
- [ ] Offline graceful degradation

---

## Future Phases (Post-V1)

### Phase 4: Gmail Integration

Light integration — not an email client, but ability to reference emails as task context.

**Scope:**
- Add Gmail read scope to existing Google OAuth
- Search Gmail from within Symphony
- Attach email reference to task (link + subject + snippet + date)
- AI extraction of key info (dates, amounts, confirmation numbers) into task context

**Not in scope:**
- Sending email
- Full inbox view
- Email threading/conversation view
- Attachment handling

### Phase 5: AI-Assisted Planning

- Brain dump → structured tasks
- Weekly planning session
- Gap detection

### Phase 6: Inbox & Capture

- Share sheet integration
- Email forwarding
- [x] Quick capture on mobile (floating + button)
- Processing workflow

### Phase 7: Meal Planning

- Natural language meal requests
- Recipe storage
- Grocery list generation
- Meal surfacing at cooking time

### Phase 8: Collaborative Planning

- Family domain
- Shared tasks/events
- Sunday sync workflow

---

## Completed

### Phase 3
- [x] Event Notes (3.1) - Supabase table, useEventNotes hook, GCal description (read-only) + Symphony notes (editable)
- [x] All Day Section (3.2) - Display all-day events at top of schedule

### Phase 2
- [x] Contextual actions (2.1) - View Recipe, Join Call, Get Directions
- [x] UI Refinements (2.2) - Swipe gestures, empty states, loading skeletons

### Phase 1
- [x] Auth (Supabase)
- [x] Task CRUD with persistence
- [x] Google Calendar integration
- [x] Desktop UI rebuild
- [x] Time-based grouping
- [x] Task scheduling
- [x] Date navigation
