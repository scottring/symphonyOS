/**
 * CopilotKit Runtime - Supabase Edge Function
 * Handles AI requests for the Symphony CopilotKit integration
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// System prompt for Symphony Copilot
const SYSTEM_PROMPT = `You are Symphony, a helpful AI assistant for a personal task management app.

## Your Capabilities
- Query tasks, calendar events, and routines
- Create, update, and complete tasks
- Help users plan their day
- Show information using rich UI components

## CRITICAL: Use Render Actions
When showing data to users, ALWAYS use the appropriate render action:
- showTasks: Display tasks as interactive cards
- showEvents: Display calendar events
- showRoutines: Display routines with status
- showDayOverview: Display a complete day schedule

## When to Use Each Action
- User asks "what's on my plate?" → Use showDayOverview
- User asks about specific tasks → Use showTasks
- User asks about calendar/events → Use showEvents
- User asks about routines/habits → Use showRoutines
- User says "complete X" → Use completeTask, then confirm with a brief message
- User says "reschedule X" → Use rescheduleTask

## Response Style
- Be concise and friendly
- Let the UI components do the heavy lifting
- Add brief context or suggestions after showing data
- Use natural language, not technical jargon

## Important Guidelines
- ALWAYS use render actions when displaying lists of items
- Don't just describe tasks in text - show them as interactive components
- After showing data, you can add a brief summary or suggestion
- When completing/rescheduling tasks, show the confirmation component

Remember: The render actions create rich, interactive UI. Use them!`

// Helper to format time for user's timezone
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
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    const body = await req.json()
    const { messages, actions } = body

    // Get user's timezone from request or default
    const timezone = body.timezone || 'America/New_York'

    // Get today's date in user timezone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

    // Fetch user's current context
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, scheduled_for, context, completed, project_id')
      .eq('user_id', user.id)
      .eq('completed', false)
      .limit(50)

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', user.id)

    const projectMap = new Map(projects?.map(p => [p.id, p.name]) || [])

    // Format tasks for context
    const taskContext = tasks?.map(t => ({
      id: t.id,
      title: t.title,
      scheduledFor: t.scheduled_for,
      context: t.context,
      projectName: t.project_id ? projectMap.get(t.project_id) : null,
    })) || []

    // Fetch today's events
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, all_day')
      .eq('user_id', user.id)
      .gte('start_time', `${today}T00:00:00Z`)
      .lte('start_time', `${today}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(20)

    // Format events with local times
    const eventContext = events?.map(e => ({
      id: e.id,
      title: e.title,
      localStartTime: formatTimeForUser(e.start_time, timezone),
      localEndTime: e.end_time ? formatTimeForUser(e.end_time, timezone) : null,
      allDay: e.all_day,
    })) || []

    // Build context message
    const contextMessage = `
## Current Context
- Today: ${today}
- Timezone: ${timezone}
- Tasks: ${taskContext.length} incomplete
- Events today: ${eventContext.length}

## Available Data
Tasks: ${JSON.stringify(taskContext.slice(0, 20))}
Events: ${JSON.stringify(eventContext)}
`

    // Build tools for Claude based on CopilotKit actions
    const tools = actions?.map((action: { name: string; description: string; parameters: unknown[] }) => ({
      name: action.name,
      description: action.description,
      input_schema: {
        type: 'object',
        properties: action.parameters?.reduce((acc: Record<string, unknown>, param: { name: string; type: string; description: string; required?: boolean }) => {
          acc[param.name] = {
            type: param.type === 'object[]' ? 'array' : param.type,
            description: param.description,
          }
          return acc
        }, {}),
        required: action.parameters?.filter((p: { required?: boolean }) => p.required).map((p: { name: string }) => p.name) || [],
      },
    })) || []

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    // Call Claude
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
        system: `${SYSTEM_PROMPT}\n\n${contextMessage}`,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        tools: tools.length > 0 ? tools : undefined,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      throw new Error(`Claude API error: ${response.status}`)
    }

    const claudeResponse = await response.json()

    // Convert Claude response to CopilotKit format
    const result: {
      messages: Array<{ role: string; content: string }>
      toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
    } = {
      messages: [],
    }

    for (const block of claudeResponse.content || []) {
      if (block.type === 'text') {
        result.messages.push({
          role: 'assistant',
          content: block.text,
        })
      } else if (block.type === 'tool_use') {
        if (!result.toolCalls) result.toolCalls = []
        result.toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input,
        })
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('copilot-runtime error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
