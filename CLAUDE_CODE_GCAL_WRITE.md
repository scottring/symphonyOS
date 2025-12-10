# Google Calendar Write Implementation

## Objective
Add the ability to create Google Calendar events from Symphony. Currently read-only.

## Context
- Symphony is a family coordination app
- Google Calendar integration exists (read-only)
- OAuth flow already works via Supabase Edge Functions
- Users can view GCal events alongside tasks

## Files to Modify

### 1. Update OAuth Scopes
**File:** `supabase/functions/google-calendar-auth-url/index.ts`

Change scopes from read-only to read-write:
```typescript
// BEFORE (around line 56)
const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

// AFTER
const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
]
```

### 2. Create New Edge Function
**File:** `supabase/functions/google-calendar-create-event/index.ts`

Create new edge function that:
- Accepts event data (title, description, start, end, location, allDay)
- Gets user's access token from `calendar_connections` table
- Refreshes token if expired (copy pattern from `google-calendar-events/index.ts`)
- Calls Google Calendar API to create event
- Returns created event ID

**API endpoint:** `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`

**Request body shape:**
```typescript
interface CreateEventRequest {
  title: string
  description?: string
  startTime: string  // ISO 8601
  endTime: string    // ISO 8601
  location?: string
  allDay?: boolean
}
```

**Google Calendar API body:**
```typescript
// For timed events
{
  summary: title,
  description: description,
  location: location,
  start: { dateTime: startTime, timeZone: 'America/New_York' },
  end: { dateTime: endTime, timeZone: 'America/New_York' }
}

// For all-day events
{
  summary: title,
  description: description,
  location: location,
  start: { date: '2024-12-15' },  // YYYY-MM-DD only
  end: { date: '2024-12-16' }     // Next day for single all-day
}
```

Reference `google-calendar-events/index.ts` for:
- CORS headers pattern
- Auth/user validation pattern
- Token refresh logic
- Error handling pattern

### 3. Update useGoogleCalendar Hook
**File:** `src/hooks/useGoogleCalendar.ts`

Add `createEvent` function:
```typescript
interface CreateEventParams {
  title: string
  description?: string
  startTime: Date
  endTime: Date
  location?: string
  allDay?: boolean
}

const createEvent = useCallback(async (params: CreateEventParams): Promise<{ id: string } | null> => {
  if (!isConnected) return null
  
  try {
    const { data, error } = await supabase.functions.invoke('google-calendar-create-event', {
      body: {
        title: params.title,
        description: params.description,
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        location: params.location,
        allDay: params.allDay,
      },
    })
    
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    
    return { id: data.eventId }
  } catch (err) {
    console.error('Failed to create calendar event:', err)
    return null
  }
}, [isConnected])
```

Add to return object:
```typescript
return {
  // ... existing
  createEvent,
}
```

### 4. Export CalendarEvent Type
Ensure `CreateEventParams` or similar is exported from the hook for use elsewhere.

## Testing

1. **Disconnect/Reconnect Required:** Existing calendar connections must reconnect to grant new write permissions.

2. **Test via console first:**
```typescript
// In browser console after connecting
const { createEvent } = useGoogleCalendar()
await createEvent({
  title: 'Test from Symphony',
  startTime: new Date('2024-12-15T14:00:00'),
  endTime: new Date('2024-12-15T15:00:00'),
})
```

3. Check Google Calendar to verify event created.

## Edge Function Deployment
After creating `google-calendar-create-event/index.ts`:
```bash
supabase functions deploy google-calendar-create-event
```

## NOT in Scope (Future Work)
- Calendar picker (which calendar to write to) - use 'primary' for now
- Update/delete events
- Two-way sync (edits in GCal reflecting in Symphony)
- Attendees/invites
- Recurring events

## Reference Files
- `supabase/functions/google-calendar-events/index.ts` - Token refresh pattern
- `supabase/functions/google-calendar-callback/index.ts` - Token storage
- `src/hooks/useGoogleCalendar.ts` - Hook patterns

## Success Criteria
1. OAuth requests write scope
2. Edge function creates events on primary calendar
3. Hook exposes `createEvent()` function
4. TypeScript compiles without errors
5. Can create test event that appears in Google Calendar
