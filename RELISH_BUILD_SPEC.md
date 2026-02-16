# Relish Build Spec

Everything you need to rebuild Relish from scratch. Practical, copy-pasteable.

---

## 1. What Relish Is

A **living family assessment engine**. AI-guided diagnostic conversations across 8 research-backed domains produce a structured "manual" — then turn findings into actionable tasks, goals, and routines. Weekly check-ins detect drift. Yearbooks track progress over time.

**Core loop:** Assess → Synthesize → Act → Track → Reassess

---

## 2. The 8 Domains

| ID | Name | What It Assesses | Visual Metaphor |
|----|------|------------------|-----------------|
| `values` | Values & Identity | Lived values (not aspirational), identity statements, non-negotiables, origin stories | Compass |
| `communication` | Communication | Patterns (pursuer-distancer etc.), Four Horsemen audit, repair strategies, bids | Network threads |
| `connection` | Connection & Rituals | Daily/weekly/seasonal rituals, bonding activities, connection gaps | Seasonal wheel |
| `roles` | Roles & Responsibilities | Visible + invisible labor, mental load, decision-making, imbalances | Balance scales |
| `organization` | Organization & Spaces | Room-by-room assessment, family systems, routine consistency | Floor plan |
| `adaptability` | Adaptability & Stress | Stressor inventory, coping strategies, breakdown patterns, resilience | Wave meter |
| `problemSolving` | Problem Solving & Decisions | Actual decision process, conflict patterns, avoidance, pending backlog | Decision tree |
| `resources` | Resources & Finances | Time/money/energy per person, tensions, scarcity patterns, feelings about money | Resource pools |

**Research basis:** McMaster Model, Olson Circumplex, Walsh (resilience), Gottman (communication), Bowen (family systems), Stinnett/DeFrain (strong families), Fair Play (invisible labor)

---

## 3. Data Models (TypeScript)

### DomainAssessment (the core unit)

```typescript
interface DomainAssessment {
  headline: string                    // "Kitchen is dialed, garage is a disaster"
  summary: string                     // 2-3 sentence portrait
  harmonyScore: number                // 0-100
  assessmentDepth: 'none' | 'initial' | 'moderate' | 'deep'
  strengths: FindingItem[]
  issues: FindingItem[]
  opportunities: FindingItem[]
  actions: ActionItem[]               // suggested next steps
  data: Record<string, unknown>       // domain-specific structured data
  lastAssessedAt: string
  conversationCount: number
}

interface FindingItem {
  id: string
  title: string
  detail: string
  severity?: 'minor' | 'moderate' | 'significant'
}

interface ActionItem {
  id: string
  title: string
  description: string
  effort: 'quick_win' | 'small' | 'medium' | 'large' | 'ongoing'
  estimatedTime?: string
  type: 'task' | 'routine' | 'project' | 'goal'
  priority: 'now' | 'soon' | 'later'
  symphonyItemId?: string             // set when pushed to Symphony
  status: 'suggested' | 'accepted' | 'dismissed' | 'in_progress' | 'completed'
}
```

### Harmony Scoring

```typescript
type HarmonyStatus = 'resonating' | 'adjusting' | 'discordant' | 'uncharted'

// resonating: 75-100, adjusting: 40-74, discordant: 10-39, uncharted: 0-9
```

### Manual

```typescript
interface Manual {
  id: string
  household_id: string
  user_id: string
  type: 'household' | 'individual'
  person_id?: string                  // for individual manuals (children)
  title: string
  domains: Record<DomainId, DomainAssessment>  // 8 domains
  individual_domains?: IndividualManualDomains  // 6 per-person domains
  domain_meta: Record<string, { updated_at: string; updated_by: string }>
}
```

### Individual Domains (6 per-person domains for "How to understand [Name]")

```typescript
type IndividualDomainId =
  | 'communicationStyle'    // How they prefer to receive info, give feedback
  | 'stressConflict'        // Triggers, response patterns, what helps
  | 'loveConnection'        // Love language, how they show care
  | 'motivationEnergy'      // Energizers, drainers, goal approach
  | 'boundariesNeeds'       // Non-negotiables, alone time, sensory
  | 'growthAreas'           // Self-identified development areas
```

### Conversation

```typescript
interface Conversation {
  id: string
  household_id: string
  user_id: string
  purpose: 'onboarding' | 'domain-assessment' | 'coaching' | 'checkin' | 'facilitation' | 'refresh'
  manual_id?: string
  phase_id?: 'foundation' | 'relationships' | 'operations' | 'strategy'
  domain_id?: DomainId
  turns: { role: 'system'|'assistant'|'user'; content: string; timestamp: string }[]
  status: 'active' | 'completed'
}
```

### Entry (9 polymorphic types)

```typescript
type EntryType = 'story' | 'activity' | 'goal' | 'task' | 'reflection' | 'discussion' | 'checklist' | 'milestone' | 'insight'

interface Entry {
  id: string
  household_id: string
  manual_id?: string
  yearbook_id?: string
  person_id?: string
  type: EntryType
  source: 'system' | 'parent' | 'child' | 'imported'
  domain: DomainId
  title: string
  content: EntryContent              // discriminated union by `kind`
  lifecycle: 'active' | 'completed' | 'archived'
  visibility: 'family' | 'parents' | 'individual'
}

// Content shapes:
// story:      { kind, body, characterName?, theme?, illustrationUrl?, readAloud? }
// activity:   { kind, instructions, ageRange?, duration?, materials?, completed? }
// goal:       { kind, description, targetDate?, progress, milestoneIds? }
// task:       { kind, description, assignee?, dueDate?, completed }
// reflection: { kind, prompt, response?, sentiment? }
// discussion: { kind, prompt, suggestedScript?, targetAudience, responses? }
// checklist:  { kind, items: {id, label, checked, time?}[], frequency? }
// milestone:  { kind, description, achievedDate?, celebrationNote? }
// insight:    { kind, body, source, actionable? }
```

### Yearbook

```typescript
interface Yearbook {
  id: string
  household_id: string
  person_id: string
  year: number
  chapters: { id: string; title: string; entryIds: string[]; weekNumber?: number; progress?: WeeklyProgress }[]
  developmental_baseline?: { age: number; proposedLevel: string; parentValidated: boolean }
}

interface WeeklyProgress {
  harmonySnapshot: Record<string, number>
  harmonyChanges: Record<string, number>
  actionsCompleted: string[]
  symphonyItemsCompleted: string[]
  domainsAssessed: string[]
  highlights: string[]
}
```

### Check-In

```typescript
interface CoherenceCheckin {
  id: string
  household_id: string
  user_id: string
  week: string                       // "2026-W07"
  responses: Record<string, {
    manualId: string
    reflectionText: string
    alignmentRating: number          // 1-5
    driftNotes?: string
  }>
  system_observations: SystemObservation[]
  drift_signals: DriftSignal[]
}

interface DriftSignal {
  id: string
  description: string
  domain: DomainId
  severity: 'gentle' | 'notable'
  acknowledged: boolean
}
```

---

## 4. Database Schema (Supabase/Postgres)

All tables use household-based RLS via `users_share_household()`.

```sql
-- MANUALS
create table manuals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'household' check (type in ('household', 'individual')),
  person_id uuid references family_members(id) on delete set null,
  title text not null,
  subtitle text,
  domains jsonb not null default '{}'::jsonb,
  individual_domains jsonb,
  domain_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- YEARBOOKS
create table yearbooks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  person_id uuid references family_members(id) on delete cascade not null,
  year integer not null,
  chapters jsonb not null default '[]'::jsonb,
  developmental_baseline jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (household_id, person_id, year)
);

-- ENTRIES (polymorphic via type + content JSONB)
create table entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  manual_id uuid references manuals(id) on delete set null,
  yearbook_id uuid references yearbooks(id) on delete set null,
  person_id uuid references family_members(id) on delete set null,
  type text not null check (type in ('insight','activity','goal','task','reflection','story','checklist','discussion','milestone')),
  source text not null default 'system',
  domain text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  linked_entry_ids uuid[] default '{}',
  lifecycle text not null default 'active',
  visibility text not null default 'family',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CONVERSATIONS (AI dialogue history)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  purpose text not null check (purpose in ('onboarding','domain-assessment','coaching','checkin','facilitation','refresh')),
  manual_id uuid references manuals(id) on delete set null,
  phase_id text,
  domain_id text,
  turns jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CHECKINS (weekly coherence)
create table checkins (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  week text not null,
  responses jsonb not null default '{}'::jsonb,
  system_observations jsonb not null default '[]'::jsonb,
  drift_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, week)
);

-- ASSESSMENT ACTIONS (bridge: assessment findings → Symphony items)
create table assessment_actions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  domain_id text not null,
  title text not null,
  description text,
  effort text check (effort in ('quick_win','small','medium','large','ongoing')),
  estimated_time text,
  action_type text not null check (action_type in ('task','routine','project','goal')),
  priority text not null default 'soon' check (priority in ('now','soon','later')),
  status text not null default 'suggested',
  symphony_item_id uuid,
  symphony_item_type text,
  source_conversation_id uuid references conversations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- user_profiles additions:
-- relish_onboarding_phases_completed text[] default '{}'
-- relish_current_phase text
-- family_manual_id uuid
-- relish_intro_completed boolean default false
```

---

## 5. AI Conversation System (The Core Engine)

### Architecture

4 phases, each covering 2 domains. 4-8 turns per phase. Produces structured JSON synthesis.

```
Phase 1: Foundation    → values + communication      (4-8 turns)
Phase 2: Relationships → connection + roles           (4-8 turns)
Phase 3: Operations    → organization + adaptability  (4-8 turns)
Phase 4: Strategy      → problemSolving + resources   (3-6 turns)
```

### AI Personality

**Role:** Expert family systems coach. Diagnostic, not mirroring.

**Key behaviors:**
- Names patterns families can't see: "That's a classic pursuer-distancer dynamic"
- Challenges surface answers: "You say you communicate well — walk me through the last real disagreement blow by blow"
- Probes invisible labor: "Who remembers the dentist appointment is Thursday?"
- ONE question at a time with diagnostic observations
- Warm but direct — trusted expert, not cheerleader

### Phase 1 Opening Prompt (Foundation)

```
"I'd love to understand what holds your family together at the core. When you think about
the values your family actually lives by — not the ones on a Pinterest board, but the ones
that show up in how you spend your time and make hard choices — what comes to mind?"
```

### Phase 2 Opening (Relationships)

```
"Let's talk about emotional connection in your family. If I followed you around for a week
with a camera, where would I see real moments of connection — not just being in the same
room, but actually connecting?"
```

### Phase 3 Opening (Operations)

```
"Let's do a walkthrough of your home — not the Instagram version, the real one. If I walked
in right now, what would I see? Start with the space that causes the most daily friction."
```

### Phase 4 Opening (Strategy)

```
"Let's talk about how your family handles the hard stuff. Think of the last real disagreement
you had — not about what to have for dinner, but something that mattered. How did it start,
and how did it resolve?"
```

### Synthesis Output Schema (per phase)

After each phase, AI synthesizes conversation into structured JSON. Example for Phase 1:

```json
{
  "values": {
    "values": [{ "id": "v1", "name": "string", "description": "string", "rank": 1 }],
    "identityStatements": ["We're the family that..."],
    "nonNegotiables": ["string"],
    "narratives": ["string"]
  },
  "communication": {
    "strengths": ["string"],
    "patterns": ["pursuer-distancer — name the dynamic"],
    "challenges": ["string"],
    "repairStrategies": ["string"],
    "goals": ["string"]
  }
}
```

### Foreshadowing (subtle, 1-2 per conversation)

During assessment, naturally reference what's coming:
- "That's powerful — imagine a family discussion prompt built around that exact tension."
- "This ritual is beautiful — it'll become one of the first activities in your family's yearbook."
- "Once we capture this, we can build specific check-ins around these responsibilities."

### Domain Refresh (re-assess existing domain)

Same conversation engine but:
- References previous assessment data
- 2-4 turns (shorter)
- Asks what's changed
- Merges new data (doesn't replace)
- Updates harmony score

### Deep Domain Assessment (standalone, per-domain)

Each domain gets its own focused 3-6 turn conversation producing a full `DomainAssessment`:
- Headline, summary, harmony score
- Strengths, issues, opportunities
- Actions with effort/priority
- Domain-specific structured data

---

## 6. Edge Functions (4 total)

### conduct-onboarding-conversation
- **Input:** user message, phase, conversation history, previous phase data
- **Output:** AI response (or synthesis JSON at phase end)
- **Model:** GPT-4o (temp 0.8) or Claude Sonnet
- **Turn limits:** min 4, max 8 per phase (3-6 for strategy)

### generate-yearbook-content
- **Input:** householdId, personId, yearbookId, manualId, count, weekNumber
- **Output:** Array of Entry objects
- **Model:** Claude Sonnet or GPT-4o (temp 0.6)
- **Process:** Multi-phase — gather weekly context → extract themes → plan content mix → generate entries → validate
- **Developmental levels:** early-childhood (0-5), middle-childhood (6-9), pre-teen (10-12), teen (13-17), adult

### generate-coherence-observations
- **Input:** checkinId, householdId
- **Output:** { observations: SystemObservation[], driftSignals: DriftSignal[] }
- **Model:** GPT-4o
- **Logic:** Analyzes check-in responses + manual domains + past 4 weeks trend data

### generate-cascading-goals
- **Input:** householdId, manualId, year, focusDomains?
- **Output:** { goals: Array<{ areaName, goalName, domain, rationale, notes, actions: {quarter, description}[] }> }
- **Model:** GPT-4o (temp 0.7)
- **Logic:** Extracts challenges/painpoints/goals from manual → generates 3-5 annual goals with Q1-Q4 actions

---

## 7. UI Components (what to build)

### Manual System
- **ManualView** — Dashboard: HarmonyMap (8 domains at a glance) + DomainCards
- **DomainCard** — Headline, summary, harmony badge, expandable sections (strengths/issues/opportunities/actions)
- **HarmonyMap** — All 8 domains color-coded by status
- **HarmonyBadge** — Resonating (green) / Adjusting (amber) / Discordant (red) / Uncharted (gray)
- **ActionQueue** — List of suggested actions with effort badges + "Push to Symphony" button
- **EditableDomainView** — Manual editing alternative to AI conversation
- **DomainRefreshFlow** — Re-assessment conversation UI
- **AssessmentDepthMeter** — none → initial → moderate → deep
- **8 DomainVisual components** — ValuesCompass, CommunicationNetwork, ConnectionWheel, RolesBalance, OrganizationFloorplan, AdaptabilityWave, ProblemSolvingTree, ResourcesPools

### Onboarding
- **RelishOnboardingWizard** — Intro → Phase 1-4 conversations → Synthesis review → Entry previews
- **ConversationView** — Chat interface (bubbles, input, turn tracking)
- **PhaseProgress** — 4-phase progress indicator
- **SynthesisReview** — Review AI findings before saving to manual
- **DomainPicker** — Select domain for standalone assessment

### Yearbook
- **YearbookView** — Cover + chapter nav + weekly sections + entry cards
- **YearbookCover** — Person photo, year, developmental baseline
- **WeekSection** — Entries grouped by week with progress summary
- **GenerateButton** — Trigger AI entry generation
- **9 Entry Renderers** — Type-specific display (StoryRenderer, ActivityRenderer, etc.)

### Check-In
- **CheckinFlow** — Weekly form: reflection per manual + alignment rating + drift notes
- **CheckinHistory** — Timeline of past reflections
- **DriftSignalBanner** — Active warnings with acknowledge button
- **CoherencePulse** — Dashboard widget: current alignment + trend

### Goals (Relish-enhanced)
- **CascadingGoalWizard** — Select domain → AI generates goals → review → save
- **GoalTreeView** — Hierarchical: Annual goals → Q1-Q4 actions

---

## 8. Hooks (React state management)

| Hook | Purpose |
|------|---------|
| `useManual` | Fetch/CRUD manuals, save domain assessments, real-time subscription |
| `useRelishOnboarding` | Track phase progress, save phase data, get next phase |
| `useConversation` | Start/send/receive AI messages, save turns, restore from server |
| `useYearbook` | Fetch/create yearbooks, CRUD entries |
| `useYearbookGeneration` | Trigger AI generation, track progress |
| `useCheckin` | Fetch/create check-ins, generate observations, get drift signals |
| `useActionSynthesis` | Push actions to Symphony (create task/project/routine/goal) |
| `useAssessmentActions` | CRUD for action queue items |
| `useEntries` | Fetch/CRUD entries by yearbook/manual/domain/type |

---

## 9. Key Design Decisions

1. **Diagnostic, not mirroring** — AI names dynamics, doesn't just reflect
2. **Harmony, not completion** — Continuous 0-100 spectrum, no "done"
3. **Individual-first** — Your data is private; household manual is collaborative
4. **Action-oriented** — Everything flows to tasks/goals/routines
5. **Developmentally appropriate** — Yearbook entries adapt to age
6. **Research-grounded** — 8 domains mapped to academic frameworks
7. **Foreshadowing** — Assessment conversations hint at what outputs will look like

---

## 10. What to Change in a Rebuild

### Validated
- Living assessment engine concept genuinely novel
- Diagnostic AI conversations effective at surfacing hidden patterns
- Action synthesis bridges the insight→execution gap
- Harmony scoring better than binary complete/incomplete

### Fix These
1. **Onboarding too heavy** — 16-32 turns before first value. Start with 1 domain, show immediate output
2. **Product confusion** — Keep Relish standalone or clearly separate module
3. **Too many domains** — Consider 4-5 instead of 8 for v1
4. **Quick wins first** — Generate an actionable task within the first conversation, not after all 4 phases
5. **Mobile-first check-ins** — Push notification → quick 1-minute reflection
6. **Therapist channel** — Built-in distribution: therapists use for client families

---

## 11. Recovery

- **Git tag:** `relish-archive-point` — full codebase at commit `ddfd565`
- **DB tables:** all preserved in Supabase with COMMENT markers (migration 055)
- **Checkout full code:** `git checkout relish-archive-point`
- **Cherry-pick specific files:** `git show relish-archive-point:src/types/manual.ts`
