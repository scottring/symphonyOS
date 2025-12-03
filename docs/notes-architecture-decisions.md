# Notes Architecture Decisions
**Date:** December 3, 2025
**Status:** Approved concept, not yet implemented
**Prerequisite:** Stabilize V1.5 first

---

## Core Concept: Notes + Topics

**Note** = An individual piece of captured content (timestamped)

**Topic** = A container that groups related notes across time (like a thread)

This solves the "chronologically separate but conceptually unified" problem - e.g., budget discussions across multiple meetings over weeks.

---

## Database Schema

```sql
-- Topics: Optional grouping for related notes
CREATE TABLE note_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Notes: The core content entity
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Content
  title TEXT,
  content TEXT, -- markdown
  
  -- Type & Source
  type TEXT NOT NULL DEFAULT 'general' 
    CHECK (type IN ('quick_capture', 'meeting_note', 'transcript', 'voice_memo', 'general')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'fathom', 'voice', 'import')),
  
  -- Topic grouping
  topic_id UUID REFERENCES note_topics(id) ON DELETE SET NULL,
  
  -- Media (for voice memos)
  audio_url TEXT,
  audio_duration_seconds INTEGER,
  
  -- External references (for imported content)
  external_id TEXT,
  external_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Entity Links: Connect notes to Symphony entities
CREATE TABLE note_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE NOT NULL,
  
  entity_type TEXT NOT NULL 
    CHECK (entity_type IN ('event', 'project', 'contact', 'task', 'routine')),
  entity_id TEXT NOT NULL,
  
  link_type TEXT DEFAULT 'related'
    CHECK (link_type IN ('related', 'primary', 'mentioned')),
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(note_id, entity_type, entity_id)
);
```

---

## Note Types

| Type | Description | Source |
|------|-------------|--------|
| `quick_capture` | Brain dump, inbox items | Manual |
| `meeting_note` | Notes from/about meetings | Manual |
| `transcript` | Imported meeting transcripts | Fathom |
| `voice_memo` | Audio recording + optional transcription | Voice |
| `general` | Everything else | Manual |

---

## Key Design Decisions

1. **Topics are optional** - Notes can exist standalone
2. **Topics ≠ Projects** - Topics are thematic threads, projects have tasks/status
3. **Entity links are additive** - A note can link to multiple entities
4. **Chronological is default** - Notes home shows everything by date

---

## Timeline Integration: Option B+C Hybrid

**Decision:** Hybrid approach combining inline display with filter toggle

### Default Behavior:
1. Notes linked to entities show inline (collapsed) on those entities
2. Quick captures section appears at bottom of timeline if any exist today
3. Filter toggle "Show all notes" interleaves everything chronologically

### Rationale:
- Home page answers "what do I need to do" (action-focused)
- Meeting notes stay contextual to meetings
- Quick captures visible but contained
- Full interleaved view available when wanted
- Dedicated Notes home for browsing/searching

---

## Notes Home Page

Chronological listing of all notes with filters:
- [All] [Quick Captures] [Meeting Notes] [Voice] [Topics ▼]

Each note card shows:
- Type icon
- Title/preview
- Timestamp
- Topic badge (if assigned)
- Entity links (calendar event, contact, project)

---

## Fathom Integration Path

1. Fathom handles recording + transcription automatically
2. Symphony pulls transcripts via Fathom API
3. Match to calendar events by meeting time/title
4. Create note with type='transcript', source='fathom'
5. Auto-link to event
6. User can assign to topic later

**Selected provider:** Fathom (free tier, public API, auto-joins calls)

---

## Migration Path from Current State

Current notes in Symphony:
- `event_notes` table → Migrate to `notes` with type='meeting_note', link to event
- `projects.notes` column → Keep as-is OR migrate to `notes` linked to project
- `instance_notes` table → Keep separate (these are actionable-specific)
- Task notes field → Keep as-is (simple field on task)

---

## Next Steps

1. **Stabilize V1.5 first** - Audit, test, bug bash before building notes
2. **V1.6 = Notes MVP** - Basic notes + topics, no voice/transcripts yet
3. **V1.7 = Fathom integration** - Import transcripts, auto-link to events
4. **Future** - Voice memos, full-text search, AI summarization
