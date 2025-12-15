import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessageRequest {
  conversationId?: string
  message: string
  timezone?: string  // IANA timezone like "America/New_York"
}

interface ActionTaken {
  type: string
  entityId?: string
  entityIds?: string[]
  title?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  error?: string
}

interface EntityReference {
  type: string
  id: string
  title: string
}

// Tool definitions for Claude
const TOOLS = [
  {
    name: 'get_tasks',
    description: 'Get tasks, calendar events, and routines by date, context, or status. Use this to answer questions like "What\'s on my plate?", "Help me plan my afternoon", or "What are my tasks for tomorrow?"',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date filter: "today", "tomorrow", "this_week", "next_week", or ISO date',
        },
        time_of_day: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'all'],
          description: 'Filter by time of day (morning=before 12pm, afternoon=12pm-5pm, evening=after 5pm)',
        },
        context: {
          type: 'string',
          enum: ['work', 'family', 'personal'],
          description: 'Filter by task context',
        },
        status: {
          type: 'string',
          enum: ['scheduled', 'inbox', 'overdue', 'completed'],
          description: 'Filter by task status',
        },
        include_events: {
          type: 'boolean',
          description: 'Whether to include calendar events (default true for date queries)',
        },
        include_routines: {
          type: 'boolean',
          description: 'Whether to include routines (default true for date queries)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default 20)',
        },
      },
    },
  },
  {
    name: 'search_communications',
    description: 'Search past SMS and email communications. Use this to answer questions like "What did I tell Frank?" or "Show me recent messages to my plumber"',
    input_schema: {
      type: 'object',
      properties: {
        contact_name: {
          type: 'string',
          description: 'Name of the contact to search for',
        },
        date_range: {
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: 'Time range to search',
        },
        keyword: {
          type: 'string',
          description: 'Optional keyword to search in message content',
        },
      },
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task. Use this for requests like "Remind me to call mom" or "Add a task to buy groceries"',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The task title',
        },
        scheduled_for: {
          type: 'string',
          description: 'When to schedule the task: "today", "tomorrow", ISO date, or null for inbox',
        },
        context: {
          type: 'string',
          enum: ['work', 'family', 'personal'],
          description: 'Task context',
        },
        notes: {
          type: 'string',
          description: 'Optional notes for the task',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task. Use this to reschedule, change context, or modify a task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The ID of the task to update',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            title: { type: 'string' },
            scheduled_for: {
              type: 'string',
              description: 'When to schedule: "today", "tomorrow", "today at 5pm", "5:20pm", ISO datetime. Supports time formats like "5pm", "17:00", "5:20pm"'
            },
            context: { type: 'string', enum: ['work', 'family', 'personal'] },
            notes: { type: 'string' },
          },
        },
      },
      required: ['task_id', 'updates'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as complete.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The ID of the task to complete',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'bulk_update_tasks',
    description: 'Update multiple tasks at once. Use this for requests like "Move my dinner prep tasks to 5pm" or "Push my afternoon tasks to tomorrow"',
    input_schema: {
      type: 'object',
      properties: {
        task_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs to update',
        },
        updates: {
          type: 'object',
          description: 'Fields to update on all tasks',
          properties: {
            scheduled_for: {
              type: 'string',
              description: 'When to schedule: "today", "tomorrow", "today at 5pm", "5:20pm", ISO datetime. Supports time formats like "5pm", "17:00", "5:20pm"'
            },
            context: { type: 'string', enum: ['work', 'family', 'personal'] },
          },
        },
      },
      required: ['task_ids', 'updates'],
    },
  },
  {
    name: 'bulk_complete_tasks',
    description: 'Mark multiple tasks as complete. Use this for requests like "Complete all my errands" or "Mark all work tasks done"',
    input_schema: {
      type: 'object',
      properties: {
        task_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs to complete',
        },
      },
      required: ['task_ids'],
    },
  },
]

const SYSTEM_PROMPT = `You are Symphony, a helpful AI assistant for a personal task management app. You help users manage their tasks, calendar, routines, and communications.

## Your Capabilities
- Query and summarize tasks, calendar events, AND routines (by date, context, status)
- Search past communications (SMS and emails sent through the app)
- Create new tasks with scheduling
- Update existing tasks (reschedule, change context, change TIME)
- Mark tasks complete (single or bulk)
- Move multiple tasks at once (bulk operations)
- Help plan and prioritize the user's day by considering all their commitments

## CRITICAL: Query First, Create Second
ALWAYS check existing data before creating anything new. When a user asks about something:
1. First, use get_tasks to check if the information already exists in tasks, calendar events, or routines
2. Only suggest creating a new task if nothing relevant is found
3. Questions like "What's for dinner?" or "What am I doing tonight?" are QUERIES, not requests to create tasks

## Where Information Lives
- **Meals/Dinner plans**: Stored in Google Calendar events (synced to calendar_events). The family plans meals weekly in the shared calendar.
- **Appointments/Meetings**: Calendar events from Google Calendar
- **One-off todos**: Tasks table (includes prep tasks linked to events)
- **Recurring habits/chores**: Routines table

## Understanding Prep Tasks
Tasks can be **prep tasks** linked to calendar events (like dinner). When a user mentions:
- "dinner prep", "prep tasks", "prep steps" → Look for tasks with link_type="prep"
- "tonight's dinner prep", "meal prep" → Find tasks linked to a dinner/meal calendar event
- These tasks often have titles like "Prep tofu", "Prepare sauce", "Chop vegetables", etc.

To identify prep tasks for a meal:
1. Query get_tasks for today
2. Look at tasks where link_type="prep" and linked_activity_type="calendar_event"
3. Match the linked_activity_id to the dinner event
4. OR simply look for tasks with food/cooking-related titles scheduled around dinner time

## Rescheduling with Specific Times
When users say things like "move to 5pm" or "reschedule to 5:20":
- Use the scheduled_for field with time, e.g., "today at 5pm" or "17:20"
- For bulk updates, use bulk_update_tasks with all matching task IDs
- ALWAYS confirm how many tasks you're updating and to what time

## Guidelines
- Be concise but friendly
- When listing items, format them clearly with titles and times
- The get_tasks tool returns tasks, calendar events, AND routines - consider ALL of these when answering planning questions
- For bulk operations, confirm what you're doing and how many items
- Use the user's context (work/family/personal) appropriately
- If no data is found for a query, say so clearly - don't assume the user wants to create something
- Always explain what actions you took
- When helping with planning, consider routine completion status (pending/completed/skipped)

## Data Types Returned by get_tasks
- **Tasks**: Todo items with titles, scheduled dates/times, contexts, AND link_type/linked_activity info for prep tasks
- **Calendar Events**: External calendar items with specific start/end times (includes meal plans, appointments). IMPORTANT: Always use the local_start_time and local_end_time fields when presenting event times to the user - these are already converted to the user's local timezone. Never use the raw start_time/end_time fields as those are in UTC.
- **Routines**: Recurring activities (daily/weekly) with time_of_day and completion status

## Time Parsing for scheduled_for
You can use these formats when updating tasks:
- "today" → today's date at midnight
- "tomorrow" → tomorrow's date at midnight
- "today at 5pm" → today at 5:00 PM
- "5pm" or "17:00" → today at that time
- "5:20pm" or "17:20" → today at that specific time
- ISO datetime like "2025-12-15T17:20:00"

## Time of Day
- "morning" = before 12:00
- "afternoon" = 12:00 to 17:00
- "evening" = after 17:00

## Response Style
- Keep responses conversational but efficient
- Use bullet points for lists
- Group items by type (tasks, events, routines) or by time when helpful
- When showing calendar events, include the time (e.g., "9:00 AM - Team standup")
- When showing routines, indicate their scheduled time and completion status
- Bold important information
- Include counts when dealing with multiple items`

// Helper function to parse time strings into ISO datetime
function parseScheduledFor(dateTimeStr: string, today: string): string {
  const str = dateTimeStr.toLowerCase().trim()

  // Handle relative dates
  if (str === 'today') {
    return `${today}T00:00:00`
  }
  if (str === 'tomorrow') {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return `${d.toISOString().split('T')[0]}T00:00:00`
  }
  if (str === 'next_week' || str === 'next week') {
    const d = new Date(today)
    d.setDate(d.getDate() + 7)
    return `${d.toISOString().split('T')[0]}T00:00:00`
  }

  // Handle "today at TIME" or "tomorrow at TIME"
  const todayAtMatch = str.match(/^today\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (todayAtMatch) {
    const time = parseTimeComponents(todayAtMatch[1], todayAtMatch[2], todayAtMatch[3])
    return `${today}T${time}`
  }

  const tomorrowAtMatch = str.match(/^tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (tomorrowAtMatch) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    const time = parseTimeComponents(tomorrowAtMatch[1], tomorrowAtMatch[2], tomorrowAtMatch[3])
    return `${d.toISOString().split('T')[0]}T${time}`
  }

  // Handle standalone time (assumes today): "5pm", "5:20pm", "17:00", "17:20"
  const timeOnlyMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (timeOnlyMatch) {
    const time = parseTimeComponents(timeOnlyMatch[1], timeOnlyMatch[2], timeOnlyMatch[3])
    return `${today}T${time}`
  }

  // Handle 24-hour time: "17:00", "17:20"
  const time24Match = str.match(/^(\d{2}):(\d{2})$/)
  if (time24Match) {
    return `${today}T${time24Match[1]}:${time24Match[2]}:00`
  }

  // If it looks like an ISO date/datetime, return as-is
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str
  }

  // Default: return the original string (let DB handle it)
  return dateTimeStr
}

// Helper to convert time components to HH:MM:SS
function parseTimeComponents(hours: string, minutes: string | undefined, ampm: string | undefined): string {
  let h = parseInt(hours, 10)
  const m = minutes ? parseInt(minutes, 10) : 0

  if (ampm) {
    const isPM = ampm.toLowerCase() === 'pm'
    if (isPM && h !== 12) h += 12
    if (!isPM && h === 12) h = 0
  }

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`
}

// Helper to format a UTC timestamp to a human-readable local time string
function formatTimeForUser(isoString: string, timezone: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    // Fallback if timezone is invalid
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }
}

// Helper to format a UTC timestamp to a local date string
function formatDateForUser(isoString: string, timezone: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return new Date(isoString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }
}

// Tool execution functions
async function executeTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  today: string,
  timezone: string
): Promise<{ result: unknown; actions: ActionTaken[]; entities: EntityReference[] }> {
  const actions: ActionTaken[] = []
  const entities: EntityReference[] = []

  switch (toolName) {
    case 'get_tasks': {
      let query = supabase
        .from('tasks')
        .select('id, title, scheduled_for, context, completed, notes, created_at, link_type, linked_activity_type, linked_activity_id')
        .eq('user_id', userId)

      // Parse date filter and compute date range
      let targetDate: string | undefined
      let dateRangeStart: string | undefined
      let dateRangeEnd: string | undefined

      if (input.date) {
        const dateStr = input.date as string

        if (dateStr === 'today') {
          targetDate = today
        } else if (dateStr === 'tomorrow') {
          const d = new Date(today)
          d.setDate(d.getDate() + 1)
          targetDate = d.toISOString().split('T')[0]
        } else if (dateStr === 'this_week') {
          dateRangeStart = today
          const weekEnd = new Date(today)
          weekEnd.setDate(weekEnd.getDate() + 7)
          dateRangeEnd = weekEnd.toISOString().split('T')[0]
        } else if (dateStr === 'next_week') {
          const weekStart = new Date(today)
          weekStart.setDate(weekStart.getDate() + 7)
          const weekEnd = new Date(today)
          weekEnd.setDate(weekEnd.getDate() + 14)
          dateRangeStart = weekStart.toISOString().split('T')[0]
          dateRangeEnd = weekEnd.toISOString().split('T')[0]
        } else {
          targetDate = dateStr
        }

        // Use date range query since scheduled_for is timestamptz
        // Tasks scheduled for a date are stored as timestamps within that day
        if (targetDate) {
          query = query.gte('scheduled_for', `${targetDate}T00:00:00`).lt('scheduled_for', `${targetDate}T23:59:59.999`)
        } else if (dateRangeStart && dateRangeEnd) {
          query = query.gte('scheduled_for', `${dateRangeStart}T00:00:00`).lt('scheduled_for', `${dateRangeEnd}T23:59:59.999`)
        }
      }

      // Apply status filter
      if (input.status) {
        if (input.status === 'completed') {
          query = query.eq('completed', true)
        } else if (input.status === 'inbox') {
          query = query.is('scheduled_for', null).eq('completed', false)
        } else if (input.status === 'overdue') {
          query = query.lt('scheduled_for', today).eq('completed', false)
        } else if (input.status === 'scheduled') {
          query = query.not('scheduled_for', 'is', null).eq('completed', false)
        }
      } else {
        query = query.eq('completed', false)
      }

      // Apply context filter
      if (input.context) {
        query = query.eq('context', input.context)
      }

      query = query.order('scheduled_for', { ascending: true, nullsFirst: true })
      query = query.limit((input.limit as number) || 20)

      const { data: tasks, error } = await query

      if (error) throw error

      // Add tasks to entities
      for (const task of tasks || []) {
        entities.push({ type: 'task', id: task.id, title: task.title })
      }

      // Fetch calendar events if date is specified and include_events is not explicitly false
      const shouldIncludeEvents = input.date && input.include_events !== false
      let events: Array<{
        id: string
        title: string
        start_time: string
        end_time: string
        description: string | null
        all_day: boolean
        local_start_time?: string
        local_end_time?: string | null
        local_date?: string
      }> = []

      if (shouldIncludeEvents) {
        // Build date range for events query
        // Use full day range in UTC to catch all-day events (which are stored at 12:00 UTC)
        let eventStart: string
        let eventEnd: string

        if (targetDate) {
          eventStart = `${targetDate}T00:00:00Z`
          eventEnd = `${targetDate}T23:59:59Z`
        } else if (dateRangeStart && dateRangeEnd) {
          eventStart = `${dateRangeStart}T00:00:00Z`
          eventEnd = `${dateRangeEnd}T23:59:59Z`
        } else {
          eventStart = `${today}T00:00:00Z`
          eventEnd = `${today}T23:59:59Z`
        }

        const { data: calEvents, error: eventsError } = await supabase
          .from('calendar_events')
          .select('id, title, start_time, end_time, description, all_day')
          .eq('user_id', userId)
          .gte('start_time', eventStart)
          .lte('start_time', eventEnd)
          .order('start_time', { ascending: true })
          .limit(20)

        if (!eventsError && calEvents) {
          // Format event times in user's local timezone for Claude to present correctly
          events = calEvents.map(event => ({
            ...event,
            // Add formatted local time strings for Claude to use
            local_start_time: formatTimeForUser(event.start_time, timezone),
            local_end_time: event.end_time ? formatTimeForUser(event.end_time, timezone) : null,
            local_date: formatDateForUser(event.start_time, timezone),
          }))
          for (const event of calEvents) {
            entities.push({ type: 'event', id: event.id, title: event.title })
          }
        }
      }

      // Fetch routines if date is specified and include_routines is not explicitly false
      const shouldIncludeRoutines = input.date && input.include_routines !== false
      let routines: Array<{
        id: string
        name: string
        time_of_day: string | null
        recurrence_pattern: Record<string, unknown>
        instance_status: string | null
      }> = []

      if (shouldIncludeRoutines) {
        // Determine the target date for routines
        const routineDate = targetDate || dateRangeStart || today

        // Fetch active routines
        const { data: userRoutines, error: routinesError } = await supabase
          .from('routines')
          .select('id, name, time_of_day, recurrence_pattern')
          .eq('user_id', userId)
          .eq('visibility', 'active')

        if (!routinesError && userRoutines && userRoutines.length > 0) {
          // Fetch actionable instances for these routines on the target date
          const routineIds = userRoutines.map(r => r.id)
          const { data: instances } = await supabase
            .from('actionable_instances')
            .select('entity_id, status')
            .eq('user_id', userId)
            .eq('entity_type', 'routine')
            .eq('date', routineDate)
            .in('entity_id', routineIds)

          const instanceMap = new Map(instances?.map(i => [i.entity_id, i.status]) || [])

          // Filter routines that apply to this date based on recurrence pattern
          // Day names: abbreviated (sun, mon, tue, wed, thu, fri, sat) to match DB format
          const dayAbbreviations = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
          for (const routine of userRoutines) {
            const pattern = routine.recurrence_pattern as { type: string; days?: string[] }
            const dateObj = new Date(routineDate + 'T12:00:00')
            const dayOfWeek = dayAbbreviations[dateObj.getDay()]

            // Check if routine applies to this day
            let appliesToday = false
            if (pattern.type === 'daily') {
              appliesToday = true
            } else if (pattern.type === 'weekly' && pattern.days) {
              appliesToday = pattern.days.includes(dayOfWeek)
            }

            if (appliesToday) {
              routines.push({
                id: routine.id,
                name: routine.name,
                time_of_day: routine.time_of_day,
                recurrence_pattern: routine.recurrence_pattern,
                instance_status: instanceMap.get(routine.id) || 'pending',
              })
              entities.push({ type: 'routine', id: routine.id, title: routine.name })
            }
          }
        }
      }

      return { result: { tasks: tasks || [], events, routines }, actions, entities }
    }

    case 'search_communications': {
      let query = supabase
        .from('action_logs')
        .select('id, action_type, recipient_name, message, sent_at, original_input')
        .eq('user_id', userId)
        .eq('status', 'sent')

      // Apply contact filter
      if (input.contact_name) {
        query = query.ilike('recipient_name', `%${input.contact_name}%`)
      }

      // Apply date range
      if (input.date_range) {
        const now = new Date()
        let fromDate: Date

        switch (input.date_range) {
          case 'today':
            fromDate = new Date(today)
            break
          case 'week':
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case 'month':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          default:
            fromDate = new Date(0) // All time
        }

        query = query.gte('sent_at', fromDate.toISOString())
      }

      // Apply keyword search
      if (input.keyword) {
        query = query.ilike('message', `%${input.keyword}%`)
      }

      query = query.order('sent_at', { ascending: false }).limit(10)

      const { data: logs, error } = await query

      if (error) throw error

      return { result: logs || [], actions, entities }
    }

    case 'create_task': {
      let scheduledFor: string | null = null

      if (input.scheduled_for) {
        const dateStr = input.scheduled_for as string
        if (dateStr === 'today') {
          scheduledFor = today
        } else if (dateStr === 'tomorrow') {
          const d = new Date(today)
          d.setDate(d.getDate() + 1)
          scheduledFor = d.toISOString().split('T')[0]
        } else if (dateStr === 'next_week') {
          const d = new Date(today)
          d.setDate(d.getDate() + 7)
          scheduledFor = d.toISOString().split('T')[0]
        } else {
          scheduledFor = dateStr
        }
      }

      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: input.title,
          scheduled_for: scheduledFor,
          context: input.context || null,
          notes: input.notes || null,
          completed: false,
        })
        .select()
        .single()

      if (error) throw error

      actions.push({
        type: 'task_created',
        entityId: task.id,
        title: task.title,
      })
      entities.push({ type: 'task', id: task.id, title: task.title })

      return { result: task, actions, entities }
    }

    case 'update_task': {
      // Get current state for before snapshot
      const { data: currentTask, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', input.task_id)
        .eq('user_id', userId)
        .single()

      if (fetchError) throw fetchError
      if (!currentTask) throw new Error('Task not found')

      const updates = input.updates as Record<string, unknown>

      // Parse scheduled_for if present (supports times like "5pm", "today at 5:20pm")
      if (updates.scheduled_for) {
        updates.scheduled_for = parseScheduledFor(updates.scheduled_for as string, today)
      }

      const { data: task, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', input.task_id)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw error

      actions.push({
        type: 'task_updated',
        entityId: task.id,
        title: task.title,
        before: currentTask,
        after: task,
      })
      entities.push({ type: 'task', id: task.id, title: task.title })

      return { result: task, actions, entities }
    }

    case 'complete_task': {
      const { data: task, error } = await supabase
        .from('tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', input.task_id)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw error

      actions.push({
        type: 'task_completed',
        entityId: task.id,
        title: task.title,
      })
      entities.push({ type: 'task', id: task.id, title: task.title })

      return { result: task, actions, entities }
    }

    case 'bulk_update_tasks': {
      const taskIds = input.task_ids as string[]
      const updates = input.updates as Record<string, unknown>

      // Parse scheduled_for if present (supports times like "5pm", "today at 5:20pm")
      if (updates.scheduled_for) {
        updates.scheduled_for = parseScheduledFor(updates.scheduled_for as string, today)
      }

      const { data: tasks, error } = await supabase
        .from('tasks')
        .update(updates)
        .in('id', taskIds)
        .eq('user_id', userId)
        .select()

      if (error) throw error

      actions.push({
        type: 'tasks_bulk_updated',
        entityIds: taskIds,
        after: updates,
      })

      for (const task of tasks || []) {
        entities.push({ type: 'task', id: task.id, title: task.title })
      }

      return { result: { count: tasks?.length || 0, tasks }, actions, entities }
    }

    case 'bulk_complete_tasks': {
      const taskIds = input.task_ids as string[]

      const { data: tasks, error } = await supabase
        .from('tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .in('id', taskIds)
        .eq('user_id', userId)
        .select()

      if (error) throw error

      actions.push({
        type: 'tasks_bulk_completed',
        entityIds: taskIds,
      })

      for (const task of tasks || []) {
        entities.push({ type: 'task', id: task.id, title: task.title })
      }

      return { result: { count: tasks?.length || 0, tasks }, actions, entities }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Authenticate user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { conversationId, message, timezone }: ChatMessageRequest = await req.json()

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use provided timezone or default to America/New_York
    const userTimezone = timezone || 'America/New_York'

    // Get today's date in the user's timezone (not UTC)
    const now = new Date()
    const todayInUserTz = now.toLocaleDateString('en-CA', { timeZone: userTimezone }) // YYYY-MM-DD format
    const today = todayInUserTz

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          status: 'active',
        })
        .select()
        .single()

      if (convError) throw convError
      convId = conv.id
    }

    // Insert user message
    const { error: userMsgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'user',
        content: message,
      })

    if (userMsgError) throw userMsgError

    // Load conversation history (last 10 messages)
    const { data: history } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(10)

    // Build messages array for Claude
    const messages = (history || []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    // Fetch context snapshot for system context
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, scheduled_for, context, completed')
      .eq('user_id', user.id)
      .eq('completed', false)
      .limit(50)

    const taskSummary = `Today is ${today}. User timezone: ${userTimezone}. User has ${tasks?.length || 0} incomplete tasks.`

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    // Call Claude with tools
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        system: `${SYSTEM_PROMPT}\n\n## Current Context\n${taskSummary}`,
        messages,
        tools: TOOLS,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      throw new Error(`Claude API error: ${response.status}`)
    }

    let claudeResponse = await response.json()
    const allActions: ActionTaken[] = []
    const allEntities: EntityReference[] = []

    // Handle tool calls in a loop
    while (claudeResponse.stop_reason === 'tool_use') {
      const toolUseBlocks = claudeResponse.content.filter(
        (block: { type: string }) => block.type === 'tool_use'
      )

      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        try {
          const { result, actions, entities } = await executeTool(
            supabase,
            user.id,
            toolUse.name,
            toolUse.input,
            today,
            userTimezone
          )
          allActions.push(...actions)
          allEntities.push(...entities)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          })
        } catch (error) {
          allActions.push({
            type: toolUse.name,
            error: error.message,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: error.message }),
            is_error: true,
          })
        }
      }

      // Continue conversation with tool results
      const nextResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 2048,
          system: `${SYSTEM_PROMPT}\n\n## Current Context\n${taskSummary}`,
          messages: [
            ...messages,
            { role: 'assistant', content: claudeResponse.content },
            { role: 'user', content: toolResults },
          ],
          tools: TOOLS,
        }),
      })

      if (!nextResponse.ok) {
        throw new Error(`Claude API error: ${nextResponse.status}`)
      }

      claudeResponse = await nextResponse.json()
    }

    // Extract final text response
    const textContent = claudeResponse.content?.find(
      (block: { type: string }) => block.type === 'text'
    )
    const assistantMessage = textContent?.text || 'I processed your request.'

    const latencyMs = Date.now() - startTime

    // Store assistant message
    const { data: assistantMsgData, error: assistantMsgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'assistant',
        content: assistantMessage,
        actions_taken: allActions,
        entity_references: allEntities,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_latency_ms: latencyMs,
        input_tokens: claudeResponse.usage?.input_tokens,
        output_tokens: claudeResponse.usage?.output_tokens,
      })
      .select()
      .single()

    if (assistantMsgError) throw assistantMsgError

    console.log('Chat message processed:', {
      conversationId: convId,
      actionsCount: allActions.length,
      latencyMs,
    })

    return new Response(
      JSON.stringify({
        conversationId: convId,
        message: {
          id: assistantMsgData.id,
          role: 'assistant',
          content: assistantMessage,
          actionsTaken: allActions,
          entityReferences: allEntities,
          createdAt: assistantMsgData.created_at,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('chat-message error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
