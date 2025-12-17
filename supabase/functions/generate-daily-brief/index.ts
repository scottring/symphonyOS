import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DailyBriefItem {
  id: string
  type: 'stale_followup' | 'conflict' | 'deferred_reminder' | 'upcoming_deadline' | 'inbox_reminder' | 'routine_check' | 'ai_suggestion' | 'overdue' | 'empty_project' | 'unassigned' | 'calendar_reminder' | 'proactive_suggestion'
  title: string
  description: string
  relatedEntityType?: 'task' | 'contact' | 'event' | 'action_log' | 'project'
  relatedEntityId?: string
  suggestedActions: Array<{
    label: string
    action: 'follow_up' | 'mark_resolved' | 'snooze' | 'schedule' | 'defer' | 'delete' | 'open' | 'complete' | 'draft_email' | 'send_note'
  }>
  priority: 'high' | 'medium' | 'low'
  context?: 'work' | 'family' | 'personal'
}

interface GeneratedBrief {
  greeting: string
  summary: string
  items: DailyBriefItem[]
}

const SYSTEM_PROMPT = `You are the Life COO for Symphony OS - a personal AI assistant that helps families achieve mental clarity by organizing their life together.

Your role is to provide a family-friendly morning brief that:
1. Summarizes the day's schedule for the whole family
2. Shows what each family member is responsible for
3. Highlights unassigned items that need an owner
4. Identifies overdue or stale items needing attention
5. Reports the Clarity Score and how to improve it

FAMILY COLLABORATION:
This brief is meant to be reviewed together by family members. Focus on:
- Clear ownership: Who is doing what today
- Gaps: What tasks need to be assigned
- Blockers: Overdue items or stale inbox items hurting clarity
- Calendar coordination: Events that affect the family

ITEM TYPES (use these):
- "calendar_reminder": Important event today (include time and who's involved)
- "upcoming_deadline": Task due today or tomorrow
- "overdue": Task past its scheduled date
- "inbox_reminder": Stale inbox items hurting clarity score (8+ days old)
- "unassigned": Task with no owner assigned

AVAILABLE ACTIONS (only use these - they work):
- "schedule": Open date picker to schedule the task
- "defer": Open date picker to defer to later
- "complete": Mark as done
- "open": Open task for details/editing

FORMAT:
1. Greeting with day, date, and Clarity Score
2. Summary sentence about the day (events count, tasks per person, clarity status)
3. Items list (5-7 max, prioritized by urgency)

IMPORTANT RULES:
- ALWAYS include relatedEntityId with the exact task ID from the data
- Use family member names from the provided list
- For family tasks assigned to someone, mention their name: "Iris: Pick up kids"
- For unassigned tasks, make that the focus: "Needs owner: [task name]"
- Prioritize high-impact items that affect clarity score

Return JSON only (no markdown):
{
  "greeting": "Good [morning/afternoon/evening], [Name]! It's [Day], [Date]. Clarity Score: [X]%.",
  "summary": "[1-2 sentences: X events today. Y tasks for you, Z for [spouse]. N items need attention.]",
  "items": [
    {
      "id": "unique-id",
      "type": "overdue",
      "title": "[Task title from data]",
      "description": "This was scheduled for [date]. Reschedule or complete?",
      "relatedEntityType": "task",
      "relatedEntityId": "[exact-task-uuid-from-data]",
      "suggestedActions": [
        { "label": "Reschedule", "action": "schedule" },
        { "label": "Complete", "action": "complete" }
      ],
      "priority": "high",
      "context": "family"
    }
  ]
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body for force flag
    let force = false
    try {
      const body = await req.json()
      force = body?.force === true
    } catch {
      // No body or invalid JSON - that's fine, force defaults to false
    }

    // Get context snapshot
    const contextResponse = await fetch(
      `${supabaseUrl}/functions/v1/get-context-snapshot`,
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!contextResponse.ok) {
      throw new Error('Failed to fetch context snapshot')
    }

    const context = await contextResponse.json()

    // Check if we already have a brief for today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingBrief } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('user_id', user.id)
      .eq('brief_date', today)
      .single()

    if (existingBrief && !force) {
      // Return existing brief (unless force regeneration requested)
      return new Response(
        JSON.stringify(existingBrief),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If force regeneration, delete the existing brief first
    if (existingBrief && force) {
      await supabase
        .from('daily_briefs')
        .delete()
        .eq('id', existingBrief.id)
    }

    // Get Anthropic API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the prompt with context
    const clarityScore = context.clarity?.score ?? 100
    const clarityActions = context.clarity?.actions || []

    // User's timezone - default to America/New_York (EST/EDT)
    const userTimezone = 'America/New_York'
    const dateFormatOptions = { timeZone: userTimezone }

    // Format time nicely in user's timezone
    const dateObj = new Date(context.currentTime)
    const dayName = dateObj.toLocaleDateString('en-US', { ...dateFormatOptions, weekday: 'long' })
    const dateStr = dateObj.toLocaleDateString('en-US', { ...dateFormatOptions, month: 'long', day: 'numeric' })
    const timeStr = dateObj.toLocaleTimeString('en-US', { ...dateFormatOptions, hour: 'numeric', minute: '2-digit' })

    // Determine time of day for appropriate greeting
    const hour = parseInt(dateObj.toLocaleTimeString('en-US', { ...dateFormatOptions, hour: 'numeric', hour12: false }))
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

    const userPrompt = `Generate a family ${timeOfDay} brief for:

USER: ${context.user.name}
DATE: ${dayName}, ${dateStr}
TIME: ${timeStr}
CLARITY: ${clarityScore}%

=== FAMILY MEMBERS ===
${context.familyMembers?.map((m: { id: string; name: string }) => `- ${m.name} [ID: ${m.id}]`).join('\n') || 'No family members'}

=== TODAY'S CALENDAR (${context.calendarEvents?.length || 0} events) ===
${context.calendarEvents?.map((e: { google_event_id: string; title: string; start_time: string; end_time: string; all_day: boolean }) => {
  const start = new Date(e.start_time)
  const timeDisplay = e.all_day ? 'All day' : start.toLocaleTimeString('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit' })
  return `- ${timeDisplay}: "${e.title}"`
}).join('\n') || 'No events'}

=== TODAY'S TASKS (by assignment) ===
${(() => {
  const allTodayTasks = [
    ...(context.tasks.todayByContext?.work || []),
    ...(context.tasks.todayByContext?.family || []),
    ...(context.tasks.todayByContext?.personal || [])
  ]
  const byAssignee = new Map<string, { id: string; title: string; context?: string }[]>()

  for (const t of allTodayTasks as { id: string; title: string; assigned_to?: string; context?: string }[]) {
    const assignee = t.assigned_to
      ? context.familyMembers?.find((m: { id: string }) => m.id === t.assigned_to)?.name || 'Unknown'
      : 'UNASSIGNED'
    if (!byAssignee.has(assignee)) byAssignee.set(assignee, [])
    byAssignee.get(assignee)!.push(t)
  }

  let output = ''
  for (const [assignee, tasks] of byAssignee.entries()) {
    output += `\n${assignee}:\n`
    for (const t of tasks) {
      output += `  - [${t.id}] "${t.title}" (${t.context || 'no context'})\n`
    }
  }
  return output || 'No tasks scheduled for today'
})()}

=== OVERDUE TASKS (${context.tasks.overdue?.length || 0}) ===
${context.tasks.overdue?.map((t: { id: string; title: string; scheduled_for: string; context?: string; assigned_to?: string }) => {
  const assignee = t.assigned_to
    ? context.familyMembers?.find((m: { id: string }) => m.id === t.assigned_to)?.name
    : 'unassigned'
  return `- [${t.id}] "${t.title}" (was due: ${t.scheduled_for}, ${assignee})`
}).join('\n') || 'None'}

=== UNASSIGNED TASKS (${context.tasks.unassigned?.length || 0}) ===
${context.tasks.unassigned?.slice(0, 5).map((t: { id: string; title: string; scheduled_for?: string; context?: string }) =>
  `- [${t.id}] "${t.title}" (${t.scheduled_for ? 'scheduled ' + t.scheduled_for : 'inbox'})`
).join('\n') || 'All tasks have owners!'}

=== STALE INBOX (hurting clarity, 8+ days old) ===
${context.tasks.staleInbox?.map((t: { id: string; title: string; created_at: string }) => {
  const daysOld = Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))
  return `- [${t.id}] "${t.title}" (${daysOld} days old, -8 points)`
}).join('\n') || 'None'}

=== CLARITY ACTIONS ===
${clarityActions.length > 0 ? clarityActions.join('\n') : 'At 100% clarity!'}

GENERATE THE BRIEF:
- Greeting: "Good ${timeOfDay}, ${context.user.name}! It's ${dayName}, ${dateStr}. Clarity: ${clarityScore}%."
- Summary: Mention events count, tasks per person, any urgent issues
- Items (5-7 max): Prioritize overdue, unassigned, then stale inbox items
- CRITICAL: Use exact task IDs from brackets [uuid] for relatedEntityId
- Only use actions: schedule, defer, complete, open

Return JSON only.`

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      }),
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errorText)
      throw new Error(`Claude API error: ${claudeResponse.status}`)
    }

    const claudeResult = await claudeResponse.json()
    const textContent = claudeResult.content?.find((c: { type: string }) => c.type === 'text')

    if (!textContent?.text) {
      throw new Error('No text in Claude response')
    }

    // Parse the JSON response
    let generatedBrief: GeneratedBrief
    try {
      let jsonText = textContent.text.trim()
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7)
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3)
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3)
      }
      generatedBrief = JSON.parse(jsonText.trim())
    } catch {
      console.error('Failed to parse Claude response:', textContent.text)
      // Fallback brief
      generatedBrief = {
        greeting: `Good morning, ${context.user.name}!`,
        summary: `You have ${context.stats.scheduledTodayCount} tasks scheduled for today${context.stats.overdueCount > 0 ? ` and ${context.stats.overdueCount} overdue` : ''}.`,
        items: [],
      }
    }

    // Store the brief in the database
    const { data: newBrief, error: insertError } = await supabase
      .from('daily_briefs')
      .insert({
        user_id: user.id,
        brief_date: today,
        greeting: generatedBrief.greeting,
        summary: generatedBrief.summary,
        items: generatedBrief.items,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to store brief:', insertError)
      // Return the generated brief anyway
      return new Response(
        JSON.stringify({
          id: crypto.randomUUID(),
          user_id: user.id,
          brief_date: today,
          greeting: generatedBrief.greeting,
          summary: generatedBrief.summary,
          items: generatedBrief.items,
          generated_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Daily brief generated:', {
      userId: user.id,
      briefId: newBrief.id,
      itemCount: generatedBrief.items.length,
    })

    return new Response(
      JSON.stringify(newBrief),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('generate-daily-brief error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
