# Calendar Event Local Enrichment

## Overview

Add the ability to attach local Symphony metadata to any Google Calendar event, regardless of whether it was created in Symphony. This enrichment is stored locally in Supabase and doesn't modify the Google event itself.

**Key principle:** Google Calendar stays the source of truth for event details (title, time, location). Symphony enriches events with actionable context (notes, tasks, attachments, links).

---

## What Gets Added

| Feature | Description | Stored In |
|---------|-------------|-----------|
| **Notes** | Free-form text about the event | `calendar_events.notes` |
| **Prep tasks** | Tasks to complete before the event | `tasks` table (linked) |
| **Follow-up tasks** | Tasks to complete after the event | `tasks` table (linked) |
| **Attachments** | Files relevant to the event | `event_attachments` table |
| **Project link** | Associate event with a project | `calendar_events.project_id` |
| **Contact link** | Associate event with a contact | `calendar_events.contact_id` |
| **Subtasks** | Checklist of items for the event | `event_subtasks` table |

---

## Current State

**Existing:**
- `calendar_events` table caches Google events
- `event_notes` table exists (migration 003) but only stores notes separately
- Prep/follow-up task linking pattern exists via `linked_activity_type = 'calendar_event'`

**Problem:**
- `event_notes` is a separate table (should consolidate)
- No project/contact linking
- No attachments
- No subtasks
- Detail panel doesn't show these features for calendar events

---

## Database Schema

**File:** `supabase/migrations/XXX_calendar_event_enrichment.sql`

```sql
-- ============================================
-- Calendar Event Enrichment Schema
-- ============================================

-- 1. Add enrichment columns to calendar_events
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

-- 2. Migrate existing event_notes data to calendar_events.notes
UPDATE calendar_events ce
SET notes = en.content
FROM event_notes en
WHERE ce.google_event_id = en.google_event_id
  AND ce.user_id = en.user_id
  AND ce.notes IS NULL;

-- 3. Create event_attachments table
CREATE TABLE IF NOT EXISTS event_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  storage_path text NOT NULL,  -- Supabase storage path
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Composite unique to prevent duplicates
  UNIQUE(user_id, google_event_id, storage_path)
);

-- RLS for event_attachments
ALTER TABLE event_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event attachments"
  ON event_attachments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event attachments"
  ON event_attachments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own event attachments"
  ON event_attachments FOR DELETE
  USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX idx_event_attachments_event 
  ON event_attachments(user_id, google_event_id);

-- 4. Create event_subtasks table
CREATE TABLE IF NOT EXISTS event_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  title text NOT NULL,
  completed boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for event_subtasks
ALTER TABLE event_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event subtasks"
  ON event_subtasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own event subtasks"
  ON event_subtasks FOR ALL
  USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX idx_event_subtasks_event 
  ON event_subtasks(user_id, google_event_id);

-- 5. Indexes for calendar_events enrichment columns
CREATE INDEX IF NOT EXISTS idx_calendar_events_project 
  ON calendar_events(project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_contact 
  ON calendar_events(contact_id) WHERE contact_id IS NOT NULL;
```

---

## TypeScript Types

**File:** `src/types/calendar.ts` (new or extend existing)

```typescript
export interface CalendarEvent {
  id: string
  user_id: string
  google_event_id: string
  title: string
  description?: string | null
  start_time: string
  end_time: string
  all_day: boolean
  location?: string | null
  calendar_id?: string
  
  // Symphony enrichment
  notes?: string | null
  project_id?: string | null
  contact_id?: string | null
  symphony_origin?: boolean
  symphony_task_id?: string | null
  symphony_routine_id?: string | null
  
  created_at?: string
  updated_at?: string
}

export interface EventAttachment {
  id: string
  user_id: string
  google_event_id: string
  file_name: string
  file_type?: string
  file_size?: number
  storage_path: string
  created_at: string
  updated_at: string
}

export interface EventSubtask {
  id: string
  user_id: string
  google_event_id: string
  title: string
  completed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// For prep/follow-up tasks linked to events
export interface LinkedEventTask {
  id: string
  title: string
  completed: boolean
  scheduled_for?: string | null
  link_type: 'prep' | 'followup'
  linked_activity_type: 'calendar_event'
  linked_activity_id: string  // google_event_id
}
```

---

## New Hook: useCalendarEventEnrichment

**File:** `src/hooks/useCalendarEventEnrichment.ts`

```typescript
import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EventAttachment, EventSubtask } from '@/types/calendar'

interface EnrichmentData {
  notes: string | null
  projectId: string | null
  contactId: string | null
  subtasks: EventSubtask[]
  attachments: EventAttachment[]
  prepTasks: LinkedEventTask[]
  followupTasks: LinkedEventTask[]
}

export function useCalendarEventEnrichment(googleEventId: string) {
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch all enrichment data for an event
  const fetchEnrichment = useCallback(async () => {
    if (!googleEventId) return
    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Parallel fetch all enrichment data
      const [
        eventRes,
        subtasksRes,
        attachmentsRes,
        linkedTasksRes,
      ] = await Promise.all([
        // Event with notes, project, contact
        supabase
          .from('calendar_events')
          .select('notes, project_id, contact_id')
          .eq('user_id', user.id)
          .eq('google_event_id', googleEventId)
          .single(),
        
        // Subtasks
        supabase
          .from('event_subtasks')
          .select('*')
          .eq('user_id', user.id)
          .eq('google_event_id', googleEventId)
          .order('sort_order'),
        
        // Attachments
        supabase
          .from('event_attachments')
          .select('*')
          .eq('user_id', user.id)
          .eq('google_event_id', googleEventId)
          .order('created_at'),
        
        // Prep and follow-up tasks
        supabase
          .from('tasks')
          .select('id, title, completed, scheduled_for, link_type')
          .eq('user_id', user.id)
          .eq('linked_activity_type', 'calendar_event')
          .eq('linked_activity_id', googleEventId),
      ])

      const linkedTasks = linkedTasksRes.data || []

      setEnrichment({
        notes: eventRes.data?.notes || null,
        projectId: eventRes.data?.project_id || null,
        contactId: eventRes.data?.contact_id || null,
        subtasks: subtasksRes.data || [],
        attachments: attachmentsRes.data || [],
        prepTasks: linkedTasks.filter(t => t.link_type === 'prep'),
        followupTasks: linkedTasks.filter(t => t.link_type === 'followup'),
      })
    } catch (err) {
      console.error('Failed to fetch enrichment:', err)
    } finally {
      setIsLoading(false)
    }
  }, [googleEventId])

  // Update notes
  const updateNotes = useCallback(async (notes: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('calendar_events')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('google_event_id', googleEventId)

    setEnrichment(prev => prev ? { ...prev, notes } : null)
  }, [googleEventId])

  // Update project link
  const updateProject = useCallback(async (projectId: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('calendar_events')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('google_event_id', googleEventId)

    setEnrichment(prev => prev ? { ...prev, projectId } : null)
  }, [googleEventId])

  // Update contact link
  const updateContact = useCallback(async (contactId: string | null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('calendar_events')
      .update({ contact_id: contactId, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('google_event_id', googleEventId)

    setEnrichment(prev => prev ? { ...prev, contactId } : null)
  }, [googleEventId])

  // Add subtask
  const addSubtask = useCallback(async (title: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const maxOrder = enrichment?.subtasks.reduce((max, s) => Math.max(max, s.sort_order), -1) ?? -1

    const { data, error } = await supabase
      .from('event_subtasks')
      .insert({
        user_id: user.id,
        google_event_id: googleEventId,
        title,
        sort_order: maxOrder + 1,
      })
      .select()
      .single()

    if (!error && data) {
      setEnrichment(prev => prev ? {
        ...prev,
        subtasks: [...prev.subtasks, data],
      } : null)
    }
  }, [googleEventId, enrichment])

  // Toggle subtask completion
  const toggleSubtask = useCallback(async (subtaskId: string) => {
    const subtask = enrichment?.subtasks.find(s => s.id === subtaskId)
    if (!subtask) return

    await supabase
      .from('event_subtasks')
      .update({ completed: !subtask.completed, updated_at: new Date().toISOString() })
      .eq('id', subtaskId)

    setEnrichment(prev => prev ? {
      ...prev,
      subtasks: prev.subtasks.map(s => 
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      ),
    } : null)
  }, [enrichment])

  // Delete subtask
  const deleteSubtask = useCallback(async (subtaskId: string) => {
    await supabase
      .from('event_subtasks')
      .delete()
      .eq('id', subtaskId)

    setEnrichment(prev => prev ? {
      ...prev,
      subtasks: prev.subtasks.filter(s => s.id !== subtaskId),
    } : null)
  }, [])

  // Add attachment
  const addAttachment = useCallback(async (file: File) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Upload to Supabase Storage
    const filePath = `${user.id}/events/${googleEventId}/${Date.now()}_${file.name}`
    
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Upload failed:', uploadError)
      throw uploadError
    }

    // Create attachment record
    const { data, error } = await supabase
      .from('event_attachments')
      .insert({
        user_id: user.id,
        google_event_id: googleEventId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: filePath,
      })
      .select()
      .single()

    if (!error && data) {
      setEnrichment(prev => prev ? {
        ...prev,
        attachments: [...prev.attachments, data],
      } : null)
    }
  }, [googleEventId])

  // Delete attachment
  const deleteAttachment = useCallback(async (attachmentId: string) => {
    const attachment = enrichment?.attachments.find(a => a.id === attachmentId)
    if (!attachment) return

    // Delete from storage
    await supabase.storage
      .from('attachments')
      .remove([attachment.storage_path])

    // Delete record
    await supabase
      .from('event_attachments')
      .delete()
      .eq('id', attachmentId)

    setEnrichment(prev => prev ? {
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attachmentId),
    } : null)
  }, [enrichment])

  // Add prep task
  const addPrepTask = useCallback(async (title: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        link_type: 'prep',
        linked_activity_type: 'calendar_event',
        linked_activity_id: googleEventId,
      })
      .select()
      .single()

    if (!error && data) {
      setEnrichment(prev => prev ? {
        ...prev,
        prepTasks: [...prev.prepTasks, data],
      } : null)
    }
  }, [googleEventId])

  // Add follow-up task
  const addFollowupTask = useCallback(async (title: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        link_type: 'followup',
        linked_activity_type: 'calendar_event',
        linked_activity_id: googleEventId,
      })
      .select()
      .single()

    if (!error && data) {
      setEnrichment(prev => prev ? {
        ...prev,
        followupTasks: [...prev.followupTasks, data],
      } : null)
    }
  }, [googleEventId])

  return {
    enrichment,
    isLoading,
    fetchEnrichment,
    updateNotes,
    updateProject,
    updateContact,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addAttachment,
    deleteAttachment,
    addPrepTask,
    addFollowupTask,
  }
}
```

---

## UI: Calendar Event Detail Panel

The detail panel for calendar events should look similar to the task detail panel but with event-specific info at the top.

**File:** `src/components/detail/CalendarEventDetailPanel.tsx`

```tsx
import { useEffect } from 'react'
import { useCalendarEventEnrichment } from '@/hooks/useCalendarEventEnrichment'
import { useProjects } from '@/hooks/useProjects'
import { useContacts } from '@/hooks/useContacts'
import type { CalendarEvent } from '@/types/calendar'

interface Props {
  event: CalendarEvent
  onClose: () => void
}

export function CalendarEventDetailPanel({ event, onClose }: Props) {
  const {
    enrichment,
    isLoading,
    fetchEnrichment,
    updateNotes,
    updateProject,
    updateContact,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    addAttachment,
    deleteAttachment,
    addPrepTask,
    addFollowupTask,
  } = useCalendarEventEnrichment(event.google_event_id)

  const { projects } = useProjects()
  const { contacts } = useContacts()

  useEffect(() => {
    fetchEnrichment()
  }, [fetchEnrichment])

  const project = projects.find(p => p.id === enrichment?.projectId)
  const contact = contacts.find(c => c.id === enrichment?.contactId)

  return (
    <div className="w-96 bg-white border-l border-neutral-200 h-full overflow-y-auto">
      {/* Zone 1: Header (Event Info from Google - Read Only) */}
      <div className="p-6 border-b border-neutral-100">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4 pr-8">
          <div className="mt-1 w-6 h-6 rounded bg-primary-100 flex items-center justify-center">
            <Calendar size={14} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-neutral-900 leading-tight">
              {event.title}
            </h2>

            {/* Event metadata pills */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                              bg-neutral-100 text-neutral-600 text-sm rounded-full">
                <Clock size={14} />
                {formatEventTime(event)}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                                bg-neutral-100 text-neutral-600 text-sm rounded-full">
                  <MapPin size={14} />
                  {event.location}
                </span>
              )}
              {event.symphony_origin && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 
                                bg-green-50 text-green-700 text-xs rounded-full">
                  Symphony
                </span>
              )}
            </div>

            {event.description && (
              <p className="mt-3 text-sm text-neutral-600">
                {event.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2: Subtasks (Checklist for the event) */}
      <div className="p-6 border-b border-neutral-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
            Checklist {enrichment?.subtasks.length ? `(${enrichment.subtasks.length})` : ''}
          </h3>
          <button className="text-sm text-primary-600 hover:text-primary-700">
            + Add item
          </button>
        </div>
        
        {enrichment?.subtasks.length ? (
          <div className="space-y-2">
            {enrichment.subtasks.map(subtask => (
              <div key={subtask.id} className="flex items-center gap-3 p-2 -mx-2 
                                               rounded-lg hover:bg-neutral-50 group">
                <button 
                  onClick={() => toggleSubtask(subtask.id)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${subtask.completed 
                      ? 'bg-primary-500 border-primary-500' 
                      : 'border-neutral-300'}`}
                >
                  {subtask.completed && <Check size={12} className="text-white" />}
                </button>
                <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
                  {subtask.title}
                </span>
                <button 
                  onClick={() => deleteSubtask(subtask.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-400"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 italic">No checklist items</p>
        )}
      </div>

      {/* Zone 3: Notes */}
      <div className="p-6 border-b border-neutral-100">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Notes
        </h3>
        <textarea
          value={enrichment?.notes || ''}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Add notes about this event..."
          className="w-full p-3 text-sm border border-neutral-200 rounded-lg 
                     focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     resize-none min-h-[80px]"
        />
      </div>

      {/* Zone 4: Details (Project, Contact) */}
      <div className="p-6 border-b border-neutral-100 space-y-1">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Links
        </h3>
        
        <DetailRow 
          icon={<Folder size={16} />}
          label="Project"
          value={project?.name}
          onClick={() => openProjectPicker()}
        />
        <DetailRow 
          icon={<User size={16} />}
          label="Contact"
          value={contact?.name}
          onClick={() => openContactPicker()}
        />
      </div>

      {/* Zone 5: Prep & Follow-up Tasks */}
      <div className="p-6 border-b border-neutral-100 space-y-4">
        {/* Prep Tasks */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
              Prep Tasks {enrichment?.prepTasks.length ? (
                <span className="ml-1 text-primary-600">({enrichment.prepTasks.length})</span>
              ) : null}
            </h3>
            <button 
              onClick={() => {/* open input */}}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              + Add
            </button>
          </div>
          
          {enrichment?.prepTasks.length ? (
            <div className="mt-3 space-y-2">
              {enrichment.prepTasks.map(task => (
                <LinkedTaskRow key={task.id} task={task} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Follow-up Tasks */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
              Follow-up Tasks {enrichment?.followupTasks.length ? (
                <span className="ml-1 text-primary-600">({enrichment.followupTasks.length})</span>
              ) : null}
            </h3>
            <button 
              onClick={() => {/* open input */}}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              + Add
            </button>
          </div>
          
          {enrichment?.followupTasks.length ? (
            <div className="mt-3 space-y-2">
              {enrichment.followupTasks.map(task => (
                <LinkedTaskRow key={task.id} task={task} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Zone 6: Attachments */}
      <div className="p-6 border-b border-neutral-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
            Attachments {enrichment?.attachments.length ? `(${enrichment.attachments.length})` : ''}
          </h3>
          <button className="text-sm text-primary-600 hover:text-primary-700">
            + Add file
          </button>
        </div>
        
        {enrichment?.attachments.length ? (
          <div className="space-y-2">
            {enrichment.attachments.map(file => (
              <div key={file.id} className="flex items-center gap-3 p-2 rounded-lg 
                                            bg-neutral-50 group">
                <FileIcon type={file.file_type} />
                <span className="flex-1 text-sm truncate">{file.file_name}</span>
                <span className="text-xs text-neutral-400">{formatFileSize(file.file_size)}</span>
                <button 
                  onClick={() => deleteAttachment(file.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-400"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div 
            className="border-2 border-dashed border-neutral-200 rounded-lg p-6 
                       text-center hover:border-primary-300 hover:bg-primary-50/30 
                       transition-colors cursor-pointer"
            onDrop={handleDrop}
          >
            <Upload size={24} className="mx-auto text-neutral-400 mb-2" />
            <p className="text-sm text-neutral-500">Drop files or click to upload</p>
            <p className="text-xs text-neutral-400 mt-1">Max 10 MB</p>
          </div>
        )}
      </div>

      {/* Zone 7: Actions (only for Symphony-originated events) */}
      {event.symphony_origin && (
        <div className="p-6">
          <button 
            onClick={handleDelete}
            className="w-full p-3 text-sm text-red-600 hover:bg-red-50 
                       rounded-lg transition-colors text-center"
          >
            Delete from Calendar
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Integration Points

### 1. Timeline/Home View

When clicking a calendar event on the timeline, open `CalendarEventDetailPanel`:

```tsx
// In timeline or home component
const handleEventClick = (event: CalendarEvent) => {
  setSelectedEvent(event)
  setDetailPanelType('calendar_event')
}

// In detail panel container
{detailPanelType === 'calendar_event' && selectedEvent && (
  <CalendarEventDetailPanel 
    event={selectedEvent} 
    onClose={() => setSelectedEvent(null)} 
  />
)}
```

### 2. Prep Task Surfacing

Prep tasks linked to calendar events should surface on the Today view before the event time:

```tsx
// In Today view, when building the timeline
const prepTasksForEvents = tasks.filter(t => 
  t.link_type === 'prep' && 
  t.linked_activity_type === 'calendar_event' &&
  !t.completed
)

// Display prep tasks under their parent event or in a "Prepare" section
```

### 3. Follow-up Auto-scheduling

When an event passes (or is marked done in Symphony), auto-schedule follow-up tasks:

```tsx
// In useEffect or background job
const passedEvents = events.filter(e => new Date(e.end_time) < new Date())

for (const event of passedEvents) {
  const followups = tasks.filter(t => 
    t.link_type === 'followup' &&
    t.linked_activity_id === event.google_event_id &&
    !t.scheduled_for &&
    !t.completed
  )
  
  for (const task of followups) {
    await updateTask(task.id, { scheduled_for: new Date().toISOString() })
  }
}
```

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/XXX_calendar_event_enrichment.sql` | **NEW** |
| `src/types/calendar.ts` | **NEW** or extend |
| `src/hooks/useCalendarEventEnrichment.ts` | **NEW** |
| `src/components/detail/CalendarEventDetailPanel.tsx` | **NEW** |
| Timeline/Home components | Wire up event click → detail panel |

---

## Acceptance Criteria

- [ ] Can add/edit notes on any calendar event
- [ ] Can link event to a project
- [ ] Can link event to a contact
- [ ] Can add checklist items (subtasks) to event
- [ ] Can add/remove attachments to event
- [ ] Can add prep tasks linked to event
- [ ] Can add follow-up tasks linked to event
- [ ] Prep tasks surface on Today view before event time
- [ ] Follow-up tasks auto-schedule when event passes
- [ ] All enrichment persists locally (doesn't modify Google event)
- [ ] Works for both Symphony-created and external events
- [ ] Build compiles, all tests pass

---

## Notes

- All enrichment is **local to Symphony** - doesn't touch Google Calendar API
- Pattern mirrors task detail panel for consistency
- Subtasks on events = checklist (different from subtasks on tasks which are child tasks)
- Consider debouncing notes updates to avoid excessive DB writes
- Attachment storage uses existing Supabase Storage bucket pattern
