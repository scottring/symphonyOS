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

const SYSTEM_PROMPT = `You are the Life COO for Symphony OS - a personal AI assistant that helps users achieve mental clarity by organizing their life.

Your role is to provide a comprehensive morning brief that:
1. Shows the day's schedule (calendar events)
2. Highlights priority tasks by context (Work, Family, Personal)
3. Offers proactive suggestions with actionable options
4. Tracks the Clarity Score and suggests improvements

CONTEXT AWARENESS:
- Work tasks: Professional obligations, deadlines, meetings
- Family tasks: Household duties, kids activities, shared responsibilities
- Personal tasks: Self-care, hobbies, personal goals

FAMILY MEMBERS:
You know the user's family members. When a task is assigned to a family member, you can offer to send them a reminder note. Use their actual names from the data provided.

PROACTIVE SUGGESTIONS:
For tasks that involve communication (calls, emails, follow-ups), offer to:
- Draft an email (for work contacts)
- Send a text reminder (for family members)

FORMAT THE BRIEF LIKE AN EXECUTIVE ASSISTANT:
1. Warm greeting with date and Clarity Score
2. TODAY'S SCHEDULE section with calendar events
3. PRIORITY TASKS section organized by context
4. QUICK WINS section for clarity score improvements
5. Each item should have actionable suggestions

Item Types:
- "upcoming_deadline": Tasks due today/tomorrow
- "inbox_reminder": Inbox items needing attention
- "overdue": Tasks past due date
- "empty_project": Projects needing tasks
- "unassigned": Items needing assignment
- "calendar_reminder": Important calendar events
- "proactive_suggestion": AI suggestion to help (draft email, send reminder)

Available Actions:
- "schedule": Schedule the task for a specific day
- "defer": Defer to next week
- "complete": Mark as done
- "open": Open the item for details
- "delete": Remove the item
- "draft_email": Open email draft for a contact
- "send_note": Send SMS to a family member

Return a JSON object with:
{
  "greeting": "Good [morning/afternoon/evening], [Name]! It's [Day], [Date]. Your Clarity Score is [X]%.",
  "summary": "[Brief 1-2 sentence overview of the day - events, priority tasks, and clarity status]",
  "items": [
    {
      "id": "unique-id",
      "type": "upcoming_deadline",
      "title": "Send quarterly report to PPVIS by 10am",
      "description": "This is due this morning. Would you like me to help draft the email?",
      "relatedEntityType": "task",
      "relatedEntityId": "uuid-of-task",
      "suggestedActions": [
        { "label": "Draft Email", "action": "draft_email" },
        { "label": "Mark Complete", "action": "complete" }
      ],
      "priority": "high",
      "context": "work"
    },
    {
      "id": "unique-id-2",
      "type": "proactive_suggestion",
      "title": "Remind Iris about Ella's pickup at FFG",
      "description": "Ella needs to be picked up at 3pm. Want me to send Iris a reminder?",
      "relatedEntityType": "task",
      "relatedEntityId": "uuid-of-task",
      "suggestedActions": [
        { "label": "Send Note to Iris", "action": "send_note" },
        { "label": "I'll Handle It", "action": "complete" }
      ],
      "priority": "medium",
      "context": "family"
    }
  ]
}

Keep items to 5-7 maximum. Prioritize by urgency and impact. Use actual task names and family member names from the data.
Respond with JSON only, no markdown code blocks.`

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
    const pointsToGo = 100 - clarityScore
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

    const userPrompt = `Generate a comprehensive COO-style ${timeOfDay} brief for this user:

USER: ${context.user.name}
DATE: ${dayName}, ${dateStr}
CURRENT TIME: ${timeStr} (${timeOfDay})
CLARITY SCORE: ${clarityScore}% (${pointsToGo} points to 100%)

IMPORTANT: It is currently ${timeOfDay}. Use "Good ${timeOfDay}" in your greeting.

=== FAMILY MEMBERS ===
${context.familyMembers?.map((m: { id: string; name: string }) => `- ${m.name} [${m.id}]`).join('\n') || 'No family members configured'}

=== TODAY'S CALENDAR (${context.calendarEvents?.length || 0} events) ===
${context.calendarEvents?.map((e: { google_event_id: string; title: string; start_time: string; end_time: string; all_day: boolean }) => {
  const start = new Date(e.start_time)
  const timeDisplay = e.all_day ? 'All day' : start.toLocaleTimeString('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit' })
  return `- ${timeDisplay}: "${e.title}" [${e.google_event_id}]`
}).join('\n') || 'No events scheduled'}

=== TODAY'S TASKS BY CONTEXT ===

WORK TASKS (${context.tasks.todayByContext?.work?.length || 0}):
${context.tasks.todayByContext?.work?.map((t: { id: string; title: string; contact_id?: string; assigned_to?: string }) =>
  `- [${t.id}] "${t.title}"${t.contact_id ? ' (has contact)' : ''}`
).join('\n') || 'None'}

FAMILY TASKS (${context.tasks.todayByContext?.family?.length || 0}):
${context.tasks.todayByContext?.family?.map((t: { id: string; title: string; assigned_to?: string }) => {
  const assignee = t.assigned_to ? context.familyMembers?.find((m: { id: string }) => m.id === t.assigned_to)?.name : null
  return `- [${t.id}] "${t.title}"${assignee ? ` (assigned to ${assignee})` : ''}`
}).join('\n') || 'None'}

PERSONAL TASKS (${context.tasks.todayByContext?.personal?.length || 0}):
${context.tasks.todayByContext?.personal?.map((t: { id: string; title: string }) =>
  `- [${t.id}] "${t.title}"`
).join('\n') || 'None'}

=== OVERDUE (needs rescheduling) ===
${context.tasks.overdue?.map((t: { id: string; title: string; scheduled_for: string; context?: string }) =>
  `- [${t.id}] "${t.title}" (was due: ${t.scheduled_for}) [${t.context || 'no context'}]`
).join('\n') || 'None - great job staying on track!'}

=== INBOX ITEMS NEEDING ATTENTION ===

STALE (8+ days, -8 points each):
${context.tasks.staleInbox?.map((t: { id: string; title: string; created_at: string; context?: string }) =>
  `- [${t.id}] "${t.title}" (${Math.floor((Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))} days old) [${t.context || 'no context'}]`
).join('\n') || 'None'}

AGING (4-7 days, -3 points each):
${context.tasks.agingInbox?.map((t: { id: string; title: string; context?: string }) =>
  `- [${t.id}] "${t.title}" [${t.context || 'no context'}]`
).join('\n') || 'None'}

=== CLARITY IMPROVEMENT ACTIONS ===
${clarityActions.length > 0 ? clarityActions.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n') : 'Already at perfect clarity!'}

=== CONTACTS (for email suggestions) ===
${context.contacts?.slice(0, 10).map((c: { id: string; name: string; email?: string }) =>
  `- ${c.name}${c.email ? ` <${c.email}>` : ''} [${c.id}]`
).join('\n') || 'None'}

INSTRUCTIONS:
1. Start with a warm greeting including the day, date, and Clarity Score
2. Summarize the day: number of events, key tasks, and overall status
3. Include items for:
   - Important calendar events (type: "calendar_reminder")
   - Priority tasks due today, especially work deadlines
   - Family tasks that might need delegation or reminders
   - Quick wins for clarity score (stale inbox items)
4. For family tasks assigned to others, offer to "Send Note to [Name]"
5. For work tasks involving contacts, offer to "Draft Email"
6. Use actual IDs from the data for relatedEntityId
7. Keep to 5-7 items maximum, prioritized by urgency
8. Include "context" field on items (work/family/personal)

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
    } catch (parseError) {
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
