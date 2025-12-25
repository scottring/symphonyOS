# Calendar Domain Setup: UX Flow

**Status:** Design Proposal
**Created:** December 25, 2025
**Related:** DOMAIN-SWITCHING-PROPOSAL.md

---

## Overview

This document details the user experience for connecting Google Calendar to Symphony domains. The goal is to make calendar setup **highly intuitive** while providing **strong privacy reassurance**.

### Key User Questions This Flow Must Answer

1. "How do I connect my calendars?"
2. "Which calendars can I actually write to?"
3. "How do I know my work stuff won't show up when I'm in family mode?"
4. "What happens if I mess this up?"

---

## Design Principles

### 1. **Progressive Disclosure**
Don't overwhelm users with all calendars at once. Show what matters for each domain.

### 2. **Visual Permission Indicators**
Use clear iconography to distinguish owner vs. reader access before user tries to assign.

### 3. **Privacy First Language**
Every step reinforces that domain separation keeps data private.

### 4. **Graceful Degradation**
Read-only calendars still useful—show events, just can't create new ones.

---

## User Flow: First-Time Setup

### Step 1: Initial Google Calendar Connection

**Trigger:** User clicks "Connect Calendar" in Settings or during onboarding

**Screen: "Connect Your Calendars"**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│            🗓️  Connect Google Calendar          │
│                                                 │
│  Symphony will access your Google Calendar to  │
│  show events alongside your tasks.              │
│                                                 │
│  You choose which calendars appear in which     │
│  domains on the next screen.                    │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │   🔒  Sign in with Google                 │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  Your calendar data stays private. Events only │
│  appear in the domains you assign them to.     │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Copy Notes:**
- "You choose" = user control
- "Your calendar data stays private" = privacy reassurance upfront
- No technical jargon about OAuth or permissions

**Action:** User clicks "Sign in with Google" → Standard Google OAuth flow

---

### Step 2: Calendars Discovered

**What Happens Behind the Scenes:**
1. User completes Google OAuth
2. Symphony fetches all calendars via `calendarList.list` API call
3. For each calendar, check `accessRole` field:
   - `owner` → Full access, can create events ✓
   - `writer` → Can create events ✓
   - `reader` → View only 👁️
   - `freeBusyReader` → Only availability (ignore in UI)

**Screen: "Your Calendars"**

```
┌─────────────────────────────────────────────────┐
│  ← Back                    Your Calendars       │
├─────────────────────────────────────────────────┤
│                                                 │
│  We found 5 calendars in your Google account:  │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  ✓  scott@kaufmanfamily.com                │ │
│  │     Personal                               │ │
│  │     You can create events in this calendar │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  ✓  scott.kaufman@company.com              │ │
│  │     Work Calendar                          │ │
│  │     You can create events in this calendar │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  ✓  family@kaufmanfamily.com               │ │
│  │     Family                                 │ │
│  │     You can create events in this calendar │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  👁️  iris@kaufmanfamily.com                │ │
│  │     Iris Personal                          │ │
│  │     View only • You can see but not create │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  👁️  US Holidays                           │ │
│  │     Holidays                               │ │
│  │     View only • You can see but not create │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │            Continue                     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Visual Design:**
- **✓ checkmark** = Writable (owner or writer)
- **👁️ eye icon** = Read-only (reader)
- Subtle gray text below calendar name explains permission level
- All calendars shown, user doesn't have to "choose" yet

**Copy Strategy:**
- "You can create events" = plain language for "writable"
- "View only" = instantly clear limitation
- No red warnings—read-only is fine, just different

---

### Step 3: Assign Calendars to Domains

**Screen: "Match Calendars to Domains"**

```
┌─────────────────────────────────────────────────┐
│  ← Back          Match Calendars to Domains     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Assign each calendar to a domain. Events will │
│  only appear when you're in that domain.        │
│                                                 │
│  💼  Work Domain                                │
│  ┌───────────────────────────────────────────┐ │
│  │  📅  scott.kaufman@company.com             │ │
│  │      Work Calendar                    [✓]  │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  At least one writable calendar required       │
│  ✓ Work domain has writable calendar           │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  👨‍👩‍👧‍👦  Family Domain                             │
│  ┌───────────────────────────────────────────┐ │
│  │  📅  family@kaufmanfamily.com              │ │
│  │      Family                           [✓]  │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │  👁️  iris@kaufmanfamily.com                │ │
│  │      Iris Personal (view only)        [✓]  │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  At least one writable calendar required       │
│  ✓ Family domain has writable calendar         │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  🌱  Personal Domain                            │
│  ┌───────────────────────────────────────────┐ │
│  │  📅  scott@kaufmanfamily.com               │ │
│  │      Personal                         [✓]  │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │  👁️  US Holidays (view only)               │ │
│  │      Holidays                         [✓]  │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  At least one writable calendar required       │
│  ✓ Personal domain has writable calendar       │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  ℹ️  Calendars can appear in multiple domains  │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │            Save & Finish                │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Interaction:**
- Each calendar is a draggable chip OR has checkboxes per domain
- Default smart assignment:
  - Email matches "company.com" → Work
  - Name includes "family" → Family
  - Otherwise → Personal
- User can adjust any assignment
- Validation: Each domain needs ≥1 writable calendar

**Visual Feedback:**
- Green checkmark "✓ Work domain has writable calendar" reassures user
- If domain has NO writable calendars, show warning:
  ```
  ⚠️ Work domain has no writable calendar
  You won't be able to create new events in Work mode
  ```

**Privacy Reinforcement:**
- "Events will only appear when you're in that domain" = explicit privacy promise
- Visual grouping by domain makes separation clear

---

### Step 4: Confirmation & Preview

**Screen: "You're All Set!"**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│               ✓  You're All Set!                │
│                                                 │
│  Your calendars are connected and organized     │
│  by domain. Here's what you'll see:             │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  💼  Work Domain                           │ │
│  │  Shows events from:                        │ │
│  │  • Work Calendar                           │ │
│  │                                            │ │
│  │  New events go to: Work Calendar           │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  👨‍👩‍👧‍👦  Family Domain                        │ │
│  │  Shows events from:                        │ │
│  │  • Family                                  │ │
│  │  • Iris Personal (view only)               │ │
│  │                                            │ │
│  │  New events go to: Family                  │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │  🌱  Personal Domain                        │ │
│  │  Shows events from:                        │ │
│  │  • Personal                                │ │
│  │  • US Holidays (view only)                 │ │
│  │                                            │ │
│  │  New events go to: Personal                │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  🔒  Privacy protected: Work events never      │
│      appear in Family or Personal domains      │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │         Go to Today View                │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  You can change these settings anytime         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Copy Strategy:**
- Summarize what user just set up
- "New events go to:" makes write destination crystal clear
- Privacy lock icon + explicit statement reinforces separation
- Low-stress exit: "You can change these settings anytime"

---

## Settings Page: Ongoing Management

**Location:** Settings → Calendar & Domains

**Screen: "Calendar & Domain Settings"**

```
┌─────────────────────────────────────────────────┐
│  Settings                                       │
│  ─────────                                      │
│  Calendar & Domains                             │
├─────────────────────────────────────────────────┤
│                                                 │
│  Connected Account                              │
│  ┌───────────────────────────────────────────┐ │
│  │  scott@kaufmanfamily.com                   │ │
│  │  Connected Dec 25, 2025                    │ │
│  │                                            │ │
│  │  [ Reconnect ]  [ Disconnect ]             │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Domain Calendar Assignments                    │
│                                                 │
│  💼  Work Domain                                │
│  ┌───────────────────────────────────────────┐ │
│  │  Calendars shown in Work mode:             │ │
│  │                                            │ │
│  │  📅  Work Calendar                    [×]  │ │
│  │      scott.kaufman@company.com             │ │
│  │      ✓ Can create events                   │ │
│  │                                            │ │
│  │  + Add calendar to Work domain             │ │
│  │                                            │ │
│  │  Default calendar for new events:          │ │
│  │  [ Work Calendar ▾ ]                       │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  👨‍👩‍👧‍👦  Family Domain                             │
│  ┌───────────────────────────────────────────┐ │
│  │  Calendars shown in Family mode:           │ │
│  │                                            │ │
│  │  📅  Family                           [×]  │ │
│  │      family@kaufmanfamily.com              │ │
│  │      ✓ Can create events                   │ │
│  │                                            │ │
│  │  👁️  Iris Personal                     [×]  │ │
│  │      iris@kaufmanfamily.com                │ │
│  │      View only                             │ │
│  │                                            │ │
│  │  + Add calendar to Family domain           │ │
│  │                                            │ │
│  │  Default calendar for new events:          │ │
│  │  [ Family ▾ ]                              │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  🌱  Personal Domain                            │
│  ┌───────────────────────────────────────────┐ │
│  │  Calendars shown in Personal mode:         │ │
│  │                                            │ │
│  │  📅  Personal                         [×]  │ │
│  │      scott@kaufmanfamily.com               │ │
│  │      ✓ Can create events                   │ │
│  │                                            │ │
│  │  👁️  US Holidays                       [×]  │ │
│  │      Holidays                              │ │
│  │      View only                             │ │
│  │                                            │ │
│  │  + Add calendar to Personal domain         │ │
│  │                                            │ │
│  │  Default calendar for new events:          │ │
│  │  [ Personal ▾ ]                            │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Privacy                                        │
│  ┌───────────────────────────────────────────┐ │
│  │  🔒  Domain Separation Active              │ │
│  │                                            │ │
│  │  Work events only appear in Work domain    │ │
│  │  Family events only appear in Family domain│ │
│  │  Personal events only in Personal domain   │ │
│  │                                            │ │
│  │  Switch to Universal to see everything     │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features:**
- One-click [×] to remove calendar from domain
- "+ Add calendar" shows dropdown of available calendars
- "Default calendar for new events" dropdown (only shows writable calendars)
- Privacy reassurance panel always visible

---

## Error States & Edge Cases

### Error 1: No Writable Calendar in Domain

**Scenario:** User removed all writable calendars from Work domain

**Warning Banner:**
```
┌─────────────────────────────────────────────────┐
│  ⚠️  Warning                                    │
│                                                 │
│  Work domain has no writable calendar           │
│                                                 │
│  You can view Work events but cannot create     │
│  new ones. Add a writable calendar to fix.      │
│                                                 │
│  [ Add Calendar to Work Domain ]                │
└─────────────────────────────────────────────────┘
```

**Where Shown:**
- Settings page (persistent until fixed)
- When user tries to create event in Work mode:
  ```
  Cannot create event
  Work domain has no writable calendar.

  [ Go to Settings ] [ Use Personal Instead ]
  ```

---

### Error 2: Calendar Connection Lost

**Scenario:** Google OAuth token expired or revoked

**Banner in App:**
```
┌─────────────────────────────────────────────────┐
│  🔌  Calendar Disconnected                      │
│                                                 │
│  Your Google Calendar connection was lost.      │
│  Events won't update until you reconnect.       │
│                                                 │
│  [ Reconnect Calendar ]                         │
└─────────────────────────────────────────────────┘
```

**Action:** "Reconnect Calendar" → Same OAuth flow as initial setup

---

### Edge Case 3: Calendar Shared After Setup

**Scenario:** User gains access to new calendar (colleague shares work calendar)

**Notification:**
```
┌─────────────────────────────────────────────────┐
│  📅  New Calendar Available                     │
│                                                 │
│  "Team Calendar" was shared with you            │
│                                                 │
│  Assign it to a domain to see events:           │
│                                                 │
│  [ Add to Work ]  [ Add to Family ]             │
│  [ Add to Personal ]  [ Ignore ]                │
└─────────────────────────────────────────────────┘
```

---

### Edge Case 4: Permissions Downgraded

**Scenario:** Calendar owner changes user from "writer" to "reader"

**In-app Notification:**
```
┌─────────────────────────────────────────────────┐
│  ℹ️  Calendar Access Changed                    │
│                                                 │
│  You no longer have write access to             │
│  "Team Calendar"                                │
│                                                 │
│  You can still view events, but cannot create   │
│  new ones in this calendar.                     │
│                                                 │
│  [ OK ]                                         │
└─────────────────────────────────────────────────┘
```

**Settings Update:**
- Icon changes from ✓ → 👁️
- "Can create events" changes to "View only"
- If this was default calendar for domain, prompt to choose new default

---

## Visual Design Elements

### Icons

| Element | Icon | Meaning |
|---------|------|---------|
| Writable calendar | ✓ | Can create & edit events |
| Read-only calendar | 👁️ | Can view events only |
| Privacy lock | 🔒 | Data is separated by domain |
| Warning | ⚠️ | Attention needed |
| Success | ✓ | Configuration valid |

### Color Coding

**Domain Colors (from ContextPicker.tsx):**
- Work: `bg-blue-500` (trustworthy, professional)
- Family: `bg-amber-500` (warm, collaborative)
- Personal: `bg-purple-500` (individual, creative)

**Status Colors:**
- Success: Green (#10b981)
- Warning: Amber (#f59e0b)
- Error: Red (#ef4444)
- Info: Blue (#3b82f6)

### Typography Hierarchy

**Setup Wizard:**
- Screen title: `text-2xl font-display` (Fraunces)
- Section headers: `text-lg font-semibold`
- Body text: `text-base` (DM Sans)
- Helper text: `text-sm text-neutral-600`

**Settings Page:**
- Page title: `text-xl font-semibold`
- Domain headers: `text-base font-medium` + emoji
- Calendar names: `text-base`
- Permission status: `text-sm text-neutral-600`

---

## Mobile Considerations

### Setup Wizard on Mobile

- Same flow, but single-column layout
- Larger tap targets (min 44x44pt)
- Bottom sheet for domain assignment picker
- Sticky "Continue" button at bottom

**Example: Mobile Calendar List**
```
┌───────────────────────────┐
│  ←  Your Calendars        │
├───────────────────────────┤
│                           │
│  We found 5 calendars:    │
│                           │
│  ┌─────────────────────┐  │
│  │ ✓ Personal          │  │
│  │ scott@kaufmanfam... │  │
│  │ Can create events   │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │ ✓ Work Calendar     │  │
│  │ scott.kaufman@co... │  │
│  │ Can create events   │  │
│  └─────────────────────┘  │
│                           │
│  ┌─────────────────────┐  │
│  │ 👁️ US Holidays      │  │
│  │ Holidays            │  │
│  │ View only           │  │
│  └─────────────────────┘  │
│                           │
│  [    Continue    ]       │
│                           │
└───────────────────────────┘
```

---

## Privacy Reassurance Strategy

### Multiple Touchpoints

Users see privacy messaging at:

1. **Initial connection screen** — "Your calendar data stays private"
2. **Assignment screen** — "Events will only appear when you're in that domain"
3. **Confirmation screen** — Lock icon + "Work events never appear in Family domain"
4. **Settings page** — Dedicated privacy panel
5. **Domain switcher** — Visual separation reinforces concept

### Language Pattern

Consistent framing across all screens:
- **"Your data stays private"** — Establishes baseline trust
- **"Events only appear in [domain]"** — Explains mechanism
- **"Work events never appear in Family"** — Concrete example
- **"Domain separation active"** — Status confirmation

### Trust Indicators

- 🔒 Lock icon = Privacy protection active
- Green checkmarks = Valid, secure configuration
- Domain-specific color coding = Visual separation
- "View only" badges = Permission transparency

---

## Implementation Notes

### Data Storage

**New Table: `calendar_domain_mappings`**
```sql
CREATE TABLE calendar_domain_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  calendar_id TEXT NOT NULL, -- Google Calendar ID
  calendar_email TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  domain TEXT CHECK (domain IN ('work', 'family', 'personal')),
  access_role TEXT CHECK (access_role IN ('owner', 'writer', 'reader')),
  is_default BOOLEAN DEFAULT FALSE, -- Default for new events in this domain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, calendar_id, domain)
);
```

### API Calls

**On Initial Connection:**
```typescript
// Fetch all calendars
const response = await gapi.client.calendar.calendarList.list()
const calendars = response.result.items.map(cal => ({
  id: cal.id,
  summary: cal.summary,
  email: cal.id, // Calendar ID is usually email
  accessRole: cal.accessRole, // owner, writer, reader, freeBusyReader
  primary: cal.primary || false
}))
```

**Smart Default Assignment:**
```typescript
function suggestDomain(calendar: GoogleCalendar): Domain {
  const email = calendar.email.toLowerCase()
  const name = calendar.summary.toLowerCase()

  // Work signals
  if (email.includes('company.com') || name.includes('work')) {
    return 'work'
  }

  // Family signals
  if (name.includes('family') || name.includes('shared')) {
    return 'family'
  }

  // Default to personal
  return 'personal'
}
```

**Validation Before Save:**
```typescript
function validateDomainAssignments(
  assignments: CalendarDomainMapping[]
): ValidationResult {
  const byDomain = groupBy(assignments, 'domain')

  const errors: string[] = []

  for (const domain of ['work', 'family', 'personal']) {
    const calendars = byDomain[domain] || []
    const writable = calendars.filter(c =>
      c.access_role === 'owner' || c.access_role === 'writer'
    )

    if (writable.length === 0) {
      errors.push(`${domain} domain has no writable calendar`)
    }
  }

  return { valid: errors.length === 0, errors }
}
```

---

## Success Metrics

### User Understands Setup
- Time to complete initial setup < 2 minutes
- Support tickets about calendar confusion < 5% of users
- User can correctly answer post-setup quiz:
  - "Where do work events appear?" → "Only in Work domain"
  - "Can you create events in US Holidays calendar?" → "No, view only"

### User Trusts Privacy
- User survey: "I feel confident my work calendar is private" > 90% agree
- Users actually use domain switching (not just stay in Universal) > 70%

### Technical Reliability
- Calendar sync errors < 1% of operations
- Permission changes detected within 5 minutes
- Zero data leaks (work events in family domain) across all users

---

## Open Questions

1. **Calendar refresh frequency**: How often should we check for new calendars/permission changes?
   - Suggestion: On app launch + every 6 hours + manual refresh button

2. **Offline behavior**: What happens to calendar assignments if offline during setup?
   - Suggestion: Cache assignments locally, sync when connection restored

3. **Migration from existing users**: How do we handle users who already have events before domain setup?
   - Suggestion: Post-setup wizard: "Tag existing events" with smart suggestions

4. **Multiple Google accounts**: Should we support connecting multiple Google accounts?
   - Suggestion: Phase 2 feature, start with single account for MVP

---

## Next Steps

1. **Visual design mockups** — Create high-fidelity designs in Figma
2. **Copy review** — Test privacy messaging with users
3. **Technical spike** — Validate Google Calendar API access patterns
4. **Prototype** — Build interactive prototype for user testing

