# Google Calendar Full CRUD Implementation

## Overview

Add the ability to create, update, and delete Google Calendar events from Symphony OS. Currently the integration is read-only. This upgrade enables two-way sync while maintaining safety by tracking which events originated in Symphony.

---

## Current State

| Component | Status |
|-----------|--------|
| OAuth scopes | `calendar.readonly`, `calendar.events.readonly` |
| Edge functions | `google-calendar-auth-url`, `google-calendar-callback`, `google-calendar-events` (read only) |
| Hook | `useGoogleCalendar` with `fetchEvents`, `connect`, `disconnect` |
| Local cache | `calendar_events` table in Supabase |

---

## Implementation Plan

### Phase 1: OAuth Scope Upgrade

**File:** `supabase/functions/google-calendar-auth-url/index.ts`

Change scopes from read-only to read/write:

```typescript
// BEFORE
const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

// AFTER
const scopes = [
  'https://www.googleapis.com/auth/calendar.events',  // Read/write events on all calendars
]
```

**Note:** `calendar.events` scope allows read AND write to events. No need for separate read scope.

**User Impact:** Existing users will need to **reconnect** their calendar to grant the new permissions. Add UI messaging for this.

---

### Phase 2: Database Schema Update

**File:** `supabase/migrations/XXX_calendar_symphony_origin.sql`

Add columns to track Symphony-originated events:

```sql
-- Track which events Symphony created (so we only modify our own)
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS symphony_origin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS symphony_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS symphony_routine_id uuid REFERENCES routines(id) ON DELETE SET NULL;

-- Index for finding Symphony-created events
CREATE INDEX IF NOT EXISTS idx_calendar_events_symphony_origin 
ON calendar_events(user_id, symphony_origin) 
WHERE symphony_origin = true;

-- Track the target calendar for new events (user's primary by default)
ALTER TABLE calendar_connections
ADD COLUMN IF NOT EXISTS default_calendar_id text DEFAULT 'primary';
```

---

### Phase 3: New Edge Functions

#### 3a. Create Event

**File:** `supabase/functions/google-calendar-create-event/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Reuse token refresh logic from google-calendar-events
async function getValidAccessToken(supabaseAdmin, userId, connection) {
  let accessToken = connection.access_token
  const expiresAt = new Date(connection.token_expires_at)
  const now = new Date()
  const fiveMinutes = 5 * 60 * 1000

  if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
    // Refresh token logic (same as google-calendar-events)
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await tokenResponse.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    accessToken = tokenData.access_token
    await supabaseAdmin
      .from('calendar_connections')
      .update({
        access_token: tokenData.access_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google')
  }

  return accessToken
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { 
      title, 
      description, 
      startTime, 
      endTime, 
      allDay, 
      location,
      calendarId = 'primary',
      taskId,      // Optional: link to Symphony task
      routineId,   // Optional: link to Symphony routine
    } = await req.json()

    if (!title || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, startTime, endTime' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get calendar connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'No calendar connection found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getValidAccessToken(supabaseAdmin, user.id, connection)

    // Build Google Calendar event
    const googleEvent: Record<string, unknown> = {
      summary: title,
      description: description || undefined,
      location: location || undefined,
      // Add Symphony metadata in extended properties
      extendedProperties: {
        private: {
          symphonyOrigin: 'true',
          symphonyTaskId: taskId || '',
          symphonyRoutineId: routineId || '',
        }
      }
    }

    if (allDay) {
      // All-day events use date (not dateTime)
      googleEvent.start = { date: startTime.split('T')[0] }
      googleEvent.end = { date: endTime.split('T')[0] }
    } else {
      googleEvent.start = { dateTime: startTime, timeZone: 'America/New_York' }
      googleEvent.end = { dateTime: endTime, timeZone: 'America/New_York' }
    }

    // Create event in Google Calendar
    const createResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(googleEvent),
      }
    )

    const createdEvent = await createResponse.json()

    if (createdEvent.error) {
      console.error('Google Calendar API error:', createdEvent.error)
      return new Response(JSON.stringify({ error: createdEvent.error.message }), {
        status: createResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cache in local database with Symphony origin flag
    const { error: cacheError } = await supabaseAdmin
      .from('calendar_events')
      .upsert({
        user_id: user.id,
        google_event_id: createdEvent.id,
        title: createdEvent.summary,
        description: createdEvent.description || null,
        start_time: allDay 
          ? `${createdEvent.start.date}T12:00:00.000Z`
          : new Date(createdEvent.start.dateTime).toISOString(),
        end_time: allDay
          ? `${createdEvent.end.date}T12:00:00.000Z`
          : new Date(createdEvent.end.dateTime).toISOString(),
        all_day: allDay || false,
        location: createdEvent.location || null,
        calendar_id: calendarId,
        symphony_origin: true,
        symphony_task_id: taskId || null,
        symphony_routine_id: routineId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,google_event_id' })

    if (cacheError) {
      console.error('Failed to cache event:', cacheError)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      event: {
        id: createdEvent.id,
        google_event_id: createdEvent.id,
        title: createdEvent.summary,
        start_time: allDay ? createdEvent.start.date : createdEvent.start.dateTime,
        end_time: allDay ? createdEvent.end.date : createdEvent.end.dateTime,
        all_day: allDay || false,
        symphony_origin: true,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error creating event:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

#### 3b. Update Event

**File:** `supabase/functions/google-calendar-update-event/index.ts`

```typescript
serve(async (req) => {
  // ... auth check same as create ...

  const {
    eventId,        // Google event ID
    calendarId = 'primary',
    title,
    description,
    startTime,
    endTime,
    allDay,
    location,
  } = await req.json()

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing eventId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify this is a Symphony-originated event (safety check)
  const { data: cachedEvent } = await supabaseAdmin
    .from('calendar_events')
    .select('symphony_origin')
    .eq('user_id', user.id)
    .eq('google_event_id', eventId)
    .single()

  if (!cachedEvent?.symphony_origin) {
    return new Response(JSON.stringify({ 
      error: 'Cannot modify events not created by Symphony' 
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build patch object (only include changed fields)
  const patch: Record<string, unknown> = {}
  if (title !== undefined) patch.summary = title
  if (description !== undefined) patch.description = description
  if (location !== undefined) patch.location = location

  if (startTime && endTime) {
    if (allDay) {
      patch.start = { date: startTime.split('T')[0] }
      patch.end = { date: endTime.split('T')[0] }
    } else {
      patch.start = { dateTime: startTime, timeZone: 'America/New_York' }
      patch.end = { dateTime: endTime, timeZone: 'America/New_York' }
    }
  }

  // PATCH to Google Calendar
  const updateResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    }
  )

  const updatedEvent = await updateResponse.json()

  if (updatedEvent.error) {
    return new Response(JSON.stringify({ error: updatedEvent.error.message }), {
      status: updateResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Update local cache
  await supabaseAdmin
    .from('calendar_events')
    .update({
      title: updatedEvent.summary,
      description: updatedEvent.description || null,
      start_time: allDay 
        ? `${updatedEvent.start.date}T12:00:00.000Z`
        : new Date(updatedEvent.start.dateTime).toISOString(),
      end_time: allDay
        ? `${updatedEvent.end.date}T12:00:00.000Z`
        : new Date(updatedEvent.end.dateTime).toISOString(),
      all_day: allDay || false,
      location: updatedEvent.location || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('google_event_id', eventId)

  return new Response(JSON.stringify({ success: true, event: updatedEvent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

#### 3c. Delete Event

**File:** `supabase/functions/google-calendar-delete-event/index.ts`

```typescript
serve(async (req) => {
  // ... auth check same as create ...

  const { eventId, calendarId = 'primary' } = await req.json()

  if (!eventId) {
    return new Response(JSON.stringify({ error: 'Missing eventId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify this is a Symphony-originated event (safety check)
  const { data: cachedEvent } = await supabaseAdmin
    .from('calendar_events')
    .select('symphony_origin')
    .eq('user_id', user.id)
    .eq('google_event_id', eventId)
    .single()

  if (!cachedEvent?.symphony_origin) {
    return new Response(JSON.stringify({ 
      error: 'Cannot delete events not created by Symphony' 
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // DELETE from Google Calendar
  const deleteResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const error = await deleteResponse.json()
    return new Response(JSON.stringify({ error: error.error?.message || 'Delete failed' }), {
      status: deleteResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Remove from local cache
  await supabaseAdmin
    .from('calendar_events')
    .delete()
    .eq('user_id', user.id)
    .eq('google_event_id', eventId)

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

---

### Phase 4: Update Hook

**File:** `src/hooks/useGoogleCalendar.ts`

Add new methods to the hook:

```typescript
export interface CreateEventParams {
  title: string
  description?: string
  startTime: string  // ISO string
  endTime: string    // ISO string
  allDay?: boolean
  location?: string
  calendarId?: string
  taskId?: string    // Optional Symphony task link
  routineId?: string // Optional Symphony routine link
}

export interface UpdateEventParams {
  eventId: string
  calendarId?: string
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  allDay?: boolean
  location?: string
}

export function useGoogleCalendar() {
  // ... existing state and methods ...

  // Create a new calendar event
  const createEvent = useCallback(async (params: CreateEventParams) => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-create-event', {
        body: params,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      // Refresh events to show the new one
      // (or optimistically add to local state)
      return data.event
    } catch (err) {
      console.error('Failed to create event:', err)
      throw err
    }
  }, [])

  // Update an existing calendar event (Symphony-originated only)
  const updateEvent = useCallback(async (params: UpdateEventParams) => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-update-event', {
        body: params,
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      return data.event
    } catch (err) {
      console.error('Failed to update event:', err)
      throw err
    }
  }, [])

  // Delete a calendar event (Symphony-originated only)
  const deleteEvent = useCallback(async (eventId: string, calendarId = 'primary') => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-delete-event', {
        body: { eventId, calendarId },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      // Remove from local state
      setEvents(prev => prev.filter(e => e.google_event_id !== eventId))
      
      return true
    } catch (err) {
      console.error('Failed to delete event:', err)
      throw err
    }
  }, [])

  // Check if an event can be modified (is Symphony-originated)
  const canModifyEvent = useCallback((event: CalendarEvent) => {
    return event.symphony_origin === true
  }, [])

  return {
    // ... existing returns ...
    createEvent,
    updateEvent,
    deleteEvent,
    canModifyEvent,
  }
}
```

---

### Phase 5: Update CalendarEvent Type

**File:** `src/hooks/useGoogleCalendar.ts` (or `src/types/calendar.ts`)

```typescript
export interface CalendarEvent {
  id: string
  google_event_id?: string
  title: string
  description?: string | null
  start_time?: string
  end_time?: string
  all_day?: boolean
  startTime?: string  // Alias
  endTime?: string    // Alias
  allDay?: boolean    // Alias
  location?: string | null
  calendar_id?: string
  // New fields for Symphony origin tracking
  symphony_origin?: boolean
  symphony_task_id?: string | null
  symphony_routine_id?: string | null
}
```

---

### Phase 6: UI Integration Points

#### 6a. Task Detail Panel - "Add to Calendar" Button

When a task has a scheduled time and duration, show option to push to Google Calendar:

```tsx
// In DetailPanelRedesign.tsx or similar

{task.scheduledFor && task.duration && !task.calendarEventId && (
  <button
    onClick={async () => {
      const startTime = new Date(task.scheduledFor!)
      const endTime = new Date(startTime.getTime() + (task.duration! * 60 * 1000))
      
      const event = await createEvent({
        title: task.title,
        description: task.notes || undefined,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: task.location?.address,
        taskId: task.id,
      })
      
      // Update task with calendar event link
      await updateTask(task.id, { calendarEventId: event.id })
    }}
    className="text-sm text-primary-600 hover:text-primary-700"
  >
    Add to Calendar
  </button>
)}
```

#### 6b. Calendar Event Detail - Edit/Delete for Symphony Events

```tsx
// In event detail view

{event.symphony_origin && (
  <div className="flex gap-2">
    <button onClick={() => openEditModal(event)}>
      Edit
    </button>
    <button 
      onClick={async () => {
        if (confirm('Delete this event from Google Calendar?')) {
          await deleteEvent(event.google_event_id!)
        }
      }}
      className="text-red-600"
    >
      Delete
    </button>
  </div>
)}

{!event.symphony_origin && (
  <p className="text-xs text-neutral-400 italic">
    Created outside Symphony (read-only)
  </p>
)}
```

#### 6c. Quick Capture / Planning Session

When creating events from planning:

```tsx
// In planning session flow
const handleCreateCalendarBlock = async (block: TimeBlock) => {
  await createEvent({
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    allDay: false,
  })
}
```

---

### Phase 7: Re-authorization Flow

Since OAuth scopes changed, existing users need to reconnect.

**Option A: Automatic detection**

In `useGoogleCalendar`, check if write operations fail with 403:

```typescript
const createEvent = useCallback(async (params) => {
  try {
    // ... create logic ...
  } catch (err) {
    if (err.message?.includes('insufficient permission') || 
        err.message?.includes('403')) {
      // Prompt user to reconnect
      setNeedsReauthorization(true)
      throw new Error('Calendar permissions need to be updated. Please reconnect your calendar.')
    }
    throw err
  }
}, [])
```

**Option B: Proactive UI**

Add a banner in Settings when new permissions are available:

```tsx
{isConnected && !hasWritePermissions && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
    <p className="text-sm text-amber-800">
      New feature available! Reconnect your calendar to create and edit events from Symphony.
    </p>
    <button onClick={handleReconnect} className="text-primary-600 text-sm mt-2">
      Upgrade Permissions
    </button>
  </div>
)}
```

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/google-calendar-auth-url/index.ts` | Modify scopes |
| `supabase/functions/google-calendar-create-event/index.ts` | **NEW** |
| `supabase/functions/google-calendar-update-event/index.ts` | **NEW** |
| `supabase/functions/google-calendar-delete-event/index.ts` | **NEW** |
| `supabase/migrations/XXX_calendar_symphony_origin.sql` | **NEW** |
| `src/hooks/useGoogleCalendar.ts` | Add CRUD methods |
| `src/components/detail/DetailPanelRedesign.tsx` | Add "Add to Calendar" button |
| Settings page | Add re-authorization UI |

---

## Safety Guardrails

1. **Symphony origin tracking** - Only modify events we created (check `symphony_origin` flag)
2. **Extended properties** - Store Symphony metadata in Google event's private extended properties
3. **403 on external events** - Return clear error if trying to modify non-Symphony events
4. **Audit logging** - Log all write operations (create, update, delete) for debugging
5. **Confirmation dialogs** - Require confirmation before delete operations

---

## Testing Checklist

- [ ] Create event from task detail panel
- [ ] Create event from planning session
- [ ] Update Symphony-created event (title, time, location)
- [ ] Delete Symphony-created event
- [ ] Verify cannot modify externally-created events
- [ ] Re-authorization flow works for existing users
- [ ] Events sync correctly after create/update/delete
- [ ] All-day events work correctly
- [ ] Timezone handling is correct
- [ ] Error handling for API failures
- [ ] Token refresh works during write operations

---

## Acceptance Criteria

- [ ] OAuth scopes upgraded to `calendar.events`
- [ ] Create event from Symphony → appears in Google Calendar
- [ ] Update event from Symphony → reflects in Google Calendar
- [ ] Delete event from Symphony → removed from Google Calendar
- [ ] Cannot modify events created outside Symphony
- [ ] Symphony origin tracked via `extendedProperties` and local DB
- [ ] Existing read functionality still works
- [ ] Re-authorization flow for existing users
- [ ] Build compiles, all existing tests pass

---

## Future Enhancements (Not in Scope)

- Drag-drop events on calendar view to reschedule
- Recurring event support (complex Google API)
- Multiple calendar selection (which calendar to create in)
- Conflict detection when scheduling
- Two-way sync (changes in Google reflect in Symphony tasks)
