# Proactive Assistant — Architecture Spec

## Last updated: 2026-03-27

---

## The Problem

Symphony has rich context on tasks (links, phone numbers, contacts, notes), calendar events, emails, and contacts — but these are siloed. The user has to manually connect the dots: "This task has a phone number, I should call. This calendar event implies childcare. This overdue task needs a follow-up email."

The proactive assistant connects these dots automatically and surfaces the single best next action for every item.

---

## What Exists Today

| System | What it does | Gap |
|--------|-------------|-----|
| **Overdue suggestions** (`overdueSuggestions.ts`) | Rule-based chips: call, open link, someday, stale, followup, do today | Only fires on overdue tasks. No AI reasoning, no cross-entity inference |
| **Kiosk agent** (`kiosk-agent` edge fn) | AI analyzes tasks → creates flight deal cards | Single use case (flights). Good pattern but narrow |
| **Email scanner** (`email-scanner` edge fn) | Extracts action items from Gmail → `email_action_items` table | One-way extraction. No connection back to existing tasks/contacts |
| **Action queue** (`action-queue` edge fn) | Human-in-the-loop approval → execution | Pipeline exists but nothing feeds it proactively |
| **Agent insights** (`AgentInsightsSection`) | Displays kiosk cards on task detail | Display layer only — needs richer card types |
| **Contacts** | Phone, email, relationship, preferences | Rich data, but not used for proactive suggestions |
| **Calendar** | Google Calendar events with attendees, location | Events exist in isolation — no downstream inference |

**Key insight:** The action queue is the execution layer. Kiosk cards are the display layer. What's missing is the **intelligence layer** that generates suggestions by reasoning across all data sources.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SYMPHONY UI                          │
│                                                         │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Task Card  │  │ Daily Brief  │  │ Calendar Event   │ │
│  │ Suggestion │  │ Section      │  │ Suggestion       │ │
│  │ Chips      │  │              │  │ Chips            │ │
│  └─────┬─────┘  └──────┬───────┘  └────────┬─────────┘ │
│        │               │                    │           │
│        └───────────────┼────────────────────┘           │
│                        │                                │
│              ┌─────────▼──────────┐                     │
│              │  useProactiveSuggestions()                │
│              │  (hook — polls/subscribes)                │
│              └─────────┬──────────┘                     │
└────────────────────────┼────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  proactive-engine   │
              │  (Supabase edge fn) │
              │                     │
              │  Inputs:            │
              │  • tasks            │
              │  • calendar events  │
              │  • contacts         │
              │  • email actions    │
              │  • action history   │
              │                     │
              │  Output:            │
              │  • suggestions[]    │
              │  written to DB      │
              └─────────────────────┘
```

### Why Supabase Edge Function (not Open Brain)

The proactive engine needs read access to tasks, contacts, calendar connections, email action items, and action history — all in Supabase. Open Brain owns vault/knowledge. Routing all Supabase data through Open Brain adds latency and complexity. The edge function reads Supabase tables directly, calls an LLM for reasoning, and writes suggestions back.

**Future:** When Open Brain has relevant vault context (e.g., notes about a contact), the edge function can call Open Brain's semantic search as an enrichment step.

---

## Data Model

### `proactive_suggestions` table

```sql
create table proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  -- What entity this suggestion is about
  entity_type text not null,          -- 'task' | 'calendar_event' | 'email_action' | 'general'
  entity_id text not null,            -- ID of the task, event, or email action item

  -- The suggestion itself
  suggestion_type text not null,      -- see types below
  title text not null,                -- "Call Camp Notre Dame"
  detail text,                        -- "You left a message on March 20. No response yet."
  confidence float default 0.8,       -- 0-1, used for ranking

  -- Action payload (what happens on tap)
  action_type text,                   -- 'call' | 'text' | 'email' | 'open_link' | 'guided_chat' | 'camera' | 'create_task' | 'navigate'
  action_payload jsonb default '{}',  -- { phoneNumber, url, recipient, messageTemplate, chatPrompt, ... }

  -- Lifecycle
  status text default 'active',       -- 'active' | 'acted' | 'dismissed' | 'expired'
  acted_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,

  -- Dedup & freshness
  suggestion_key text not null,       -- deterministic key for dedup (e.g., "task:{id}:call")
  generated_at timestamptz default now(),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, suggestion_key)
);

create index idx_proactive_suggestions_active
  on proactive_suggestions(user_id, status, entity_type)
  where status = 'active';
```

### Suggestion Types

| Type | Trigger | Action |
|------|---------|--------|
| `call` | Task/contact has phone number | One-tap call |
| `text` | Calendar event implies need (e.g., childcare) | Pre-filled text message |
| `email` | Task involves email follow-up | Open email compose |
| `open_link` | Task has relevant URL | Open link |
| `guided_chat` | Task is reflective/complex/emotional | Launch agent chat with context |
| `camera_analyze` | Task involves physical space/objects | Open camera → AI analysis |
| `create_task` | Calendar event has downstream needs | Create related task |
| `followup` | Action history shows waiting state | Suggest next step |
| `navigate` | Task has location | Open maps |

### `action_history` table

Tracks what the user has done, so the engine knows what to suggest next.

```sql
create table action_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,

  -- What was acted on
  entity_type text not null,          -- 'task' | 'contact' | 'calendar_event'
  entity_id text not null,

  -- What happened
  action_type text not null,          -- 'called' | 'texted' | 'emailed' | 'opened_link' | 'completed' | 'deferred' | 'noted'
  detail text,                        -- "Called, left voicemail"
  outcome text,                       -- 'success' | 'no_answer' | 'voicemail' | 'pending'

  created_at timestamptz default now()
);

create index idx_action_history_entity
  on action_history(user_id, entity_type, entity_id, created_at desc);
```

---

## Engine Logic

The `proactive-engine` edge function runs on two triggers:

1. **Scheduled:** Every 4 hours during waking hours (6 AM - 10 PM), matching email scanner cadence
2. **On-demand:** User pulls to refresh, or on page load if stale (>1 hour since last run)

### Processing Pipeline

```
1. GATHER context
   ├── Active tasks (not completed, with rich fields)
   ├── Today's calendar events
   ├── Recent email action items (last 48h)
   ├── Contacts (for phone/email lookup)
   └── Recent action history (last 7 days)

2. RULE-BASED pass (fast, no LLM)
   ├── Task has phone number + no recent call → suggest call
   ├── Task has link + not opened recently → suggest open link
   ├── Task is waiting + 3+ days → suggest follow-up
   ├── Task has location → suggest navigate
   └── Overdue task deferred 3+ times → suggest someday

3. AI REASONING pass (LLM, batched)
   ├── Calendar events → infer downstream needs
   ├── Complex/reflective tasks → suggest guided chat
   ├── Stale tasks with context → personalized nudge
   └── Cross-entity connections (email + task + contact)

4. RANK & DEDUPLICATE
   ├── Max 2 suggestions per entity
   ├── Rank by confidence × urgency
   └── Upsert by suggestion_key (update if exists, don't duplicate)

5. WRITE to proactive_suggestions table
   └── Expire old suggestions (>24h with no action)
```

### LLM Prompt Shape

```
You are a proactive personal assistant analyzing a user's tasks, calendar, and email.

For each item, determine if there's a specific, actionable next step the user should take.

Rules:
- Be SPECIFIC: "Call Camp Notre Dame at (555) 123-4567" not "Follow up on camp"
- Use available context: phone numbers, links, contacts, action history
- Infer downstream needs from calendar events
- Track what's already been done (action history) — don't suggest completed actions
- For reflective/emotional tasks, suggest guided conversation
- Max 2 suggestions per item. Skip items that need no help.

Output JSON array of suggestions with: entity_id, suggestion_type, title, detail, action_type, action_payload, confidence
```

---

## UI Integration

### 1. Suggestion Chips on Task Cards

Extend the existing overdue suggestion pattern to all tasks:

```
┌─────────────────────────────────────────────────┐
│ ○ Call Camp Notre Dame              📅  🏷️  👤 │
│   📞 Call (555) 123-4567  ·  🔗 Open website   │
│   "Left voicemail March 20 — follow up today"   │
└─────────────────────────────────────────────────┘
```

- Chips are tappable → execute action (call, open link, etc.)
- Small detail text below for context
- Replaces/extends current `OverdueSuggestion` chips

### 2. Daily Briefing Section

New section at top of Today view (above calendar events):

```
┌─────────────────────────────────────────────────┐
│ 🧠 Today's Suggestions                         │
│                                                 │
│ 📞 Call Camp Notre Dame — no response since 3/20│
│ 💬 Text Mom — early release today, need pickup  │
│ 🧹 Office cleanup is 5 days overdue — snap photo│
│                                                 │
│ 3 items · Last updated 8:02 AM                  │
└─────────────────────────────────────────────────┘
```

- Top 5 highest-confidence suggestions across all entities
- Each row is tappable → navigates to entity + highlights suggestion
- Dismiss/snooze per item

### 3. Calendar Event Suggestions

Inline on calendar events in the Today view:

```
┌─────────────────────────────────────────────────┐
│ 🟢 12:00 PM  Early Release Day                 │
│   💬 Text Mom: "Kids out at noon, can you pick  │
│      up? No screens please"                     │
└─────────────────────────────────────────────────┘
```

---

## Hook: `useProactiveSuggestions`

```typescript
interface ProactiveSuggestion {
  id: string
  entityType: 'task' | 'calendar_event' | 'email_action' | 'general'
  entityId: string
  suggestionType: string
  title: string
  detail?: string
  confidence: number
  actionType: string
  actionPayload: Record<string, unknown>
  status: 'active' | 'acted' | 'dismissed' | 'expired'
}

function useProactiveSuggestions() {
  // Returns:
  suggestions: ProactiveSuggestion[]
  suggestionsForEntity(entityType, entityId): ProactiveSuggestion[]
  topSuggestions(limit): ProactiveSuggestion[]  // For daily briefing
  actOnSuggestion(id): void       // Mark as acted + log to action_history
  dismissSuggestion(id): void
  refreshSuggestions(): void       // Trigger engine re-run
  isLoading: boolean
  lastUpdated: Date | null
}
```

---

## Action Execution

When a user taps a suggestion chip:

| Action Type | What Happens |
|------------|--------------|
| `call` | `window.open('tel:' + phoneNumber)` + log to action_history |
| `text` | `window.open('sms:' + number + '&body=' + template)` + log |
| `email` | `window.open('mailto:' + address + '?subject=' + subject)` + log |
| `open_link` | `window.open(url)` + log |
| `guided_chat` | Open agent pane with pre-loaded context prompt |
| `camera_analyze` | Open camera capture → send to AI → display analysis |
| `create_task` | Create task via action queue (with approval) |
| `navigate` | `window.open('maps:' + location)` + log |

All actions log to `action_history` so the engine knows what's been done.

---

## Build Order

### Slice 1: Foundation (DB + engine skeleton)
- [ ] Create `proactive_suggestions` table + RLS policies
- [ ] Create `action_history` table + RLS policies
- [ ] Create `proactive-engine` edge function (rule-based pass only, no LLM)
- [ ] Create `useProactiveSuggestions` hook
- [ ] Display suggestion chips on task cards (extending overdue pattern)

### Slice 2: AI Reasoning
- [ ] Add LLM pass to engine (calendar inference, cross-entity connections)
- [ ] Daily briefing section in Today view
- [ ] Calendar event suggestions

### Slice 3: Action Execution + History
- [ ] Wire action types (call, text, email, link, navigate)
- [ ] Log all actions to `action_history`
- [ ] Engine reads action history for follow-up intelligence

### Slice 4: Advanced
- [ ] Guided chat suggestions (launch agent pane with context)
- [ ] Camera analysis flow
- [ ] Open Brain enrichment (vault context in suggestions)
- [ ] Smarter ranking (learn from dismiss/act patterns)

---

## Principles

1. **Human in the loop.** Suggestions surface; the user acts. No autonomous actions (those go through action queue).
2. **Specific over generic.** "Call (555) 123-4567" not "Follow up." The phone number, link, or contact is pre-loaded.
3. **Context-aware, not noisy.** Max 2 per entity, top 5 in briefing. Quality over quantity.
4. **Stale = gone.** Suggestions expire after 24h. Re-generated fresh each cycle.
5. **Action history is memory.** Without it, the system repeats itself. Track what's been done.
