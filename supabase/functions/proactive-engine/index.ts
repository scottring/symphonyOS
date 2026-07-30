import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assembleContext } from '../_shared/context-graph/assemble.ts'
import { facetsToFacts, renderBundleForPrompt } from '../_shared/context-graph/build.ts'
import { facetRuleSuggestions } from './lib/facetRules.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// PROACTIVE ENGINE — Rule-based + AI suggestions for tasks & events
// Analyzes tasks, contacts, calendar, email actions, and action
// history to surface the single best next action for each item.
// ════════════════════════════════════════════════════════════════

interface TaskRow {
  id: string
  title: string
  completed: boolean
  bucket: string | null
  scheduled_for: string | null
  context: string | null
  notes: string | null
  links: { url: string; title?: string }[] | null
  phone_number: string | null
  contact_id: string | null
  assigned_to: string | null
  project_id: string | null
  is_waiting: boolean | null
  waiting_since: string | null
  defer_count: number | null
  location: string | null
  location_place_id: string | null
  created_at: string
  updated_at: string
}

interface ContactRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  category: string | null
  relationship: string | null
}

interface ActionHistoryRow {
  entity_type: string
  entity_id: string
  action_type: string
  detail: string | null
  outcome: string | null
  created_at: string
}

interface CalendarEventRow {
  id: string
  title: string
  description?: string | null
  start_time: string
  end_time: string
  all_day: boolean
  location?: string | null
  attendees?: { email: string; displayName?: string }[]
}

interface EmailActionRow {
  id: string
  title: string
  description: string | null
  category: string
  urgency: string
  due_date: string | null
  email_subject: string | null
  email_from: string | null
  relevant_member_id: string | null
  status: string
}

interface Suggestion {
  entity_type: string
  entity_id: string
  suggestion_type: string
  title: string
  detail?: string
  confidence: number
  action_type?: string
  action_payload: Record<string, unknown>
  suggestion_key: string
}

interface LLMSuggestion {
  entity_type: string
  entity_id: string
  suggestion_type: string
  title: string
  detail?: string
  confidence: number
  action_type?: string
  action_payload: Record<string, unknown>
}

function generateTaskSuggestions(
  task: TaskRow,
  contactsMap: Map<string, ContactRow>,
  recentActions: ActionHistoryRow[],
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const taskActions = recentActions.filter(
    a => a.entity_type === 'task' && a.entity_id === task.id
  )

  const now = Date.now()
  const scheduledTime = task.scheduled_for ? new Date(task.scheduled_for).getTime() : null
  const daysOverdue = scheduledTime ? Math.floor((now - scheduledTime) / 86400000) : 0
  const isOverdue = scheduledTime !== null && scheduledTime < now

  const contact = task.contact_id ? contactsMap.get(task.contact_id) : null
  const contactName = contact?.name

  // Resolve phone number: task's own, or from linked contact
  const phoneNumber = task.phone_number || contact?.phone
  const contactEmail = contact?.email

  // Check if action was taken recently (last 3 days)
  // Accept both past-tense ('called') and present-tense ('call') action_type values
  const recentlyCalled = taskActions.some(
    a => (a.action_type === 'called' || a.action_type === 'call') && (now - new Date(a.created_at).getTime()) < 3 * 86400000
  )
  const recentlyEmailed = taskActions.some(
    a => (a.action_type === 'emailed' || a.action_type === 'email') && (now - new Date(a.created_at).getTime()) < 3 * 86400000
  )
  const recentlyOpenedLink = taskActions.some(
    a => (a.action_type === 'opened_link' || a.action_type === 'open_link') && (now - new Date(a.created_at).getTime()) < 1 * 86400000
  )

  // ── Rule 1: Has phone number → suggest calling (with outcome-aware follow-ups) ──
  if (phoneNumber && !recentlyCalled) {
    const label = contactName ? `Call ${contactName}` : 'Make the call'
    const waitingDetail = task.is_waiting && task.waiting_since
      ? `Waiting since ${new Date(task.waiting_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : undefined

    // Check recent call outcomes for smarter follow-ups
    const recentCallActions = taskActions
      .filter(a => (a.action_type === 'called' || a.action_type === 'call'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const lastCall = recentCallActions[0]
    const noAnswerCount = recentCallActions.filter(a => a.outcome === 'no_answer').length
    const leftVoicemail = recentCallActions.find(a => a.outcome === 'voicemail')

    if (leftVoicemail) {
      const daysAgo = Math.floor((now - new Date(leftVoicemail.created_at).getTime()) / 86400000)
      if (daysAgo >= 2) {
        suggestions.push({
          entity_type: 'task',
          entity_id: task.id,
          suggestion_type: 'followup',
          title: contactName ? `Follow up with ${contactName}` : 'Follow up — no response yet',
          detail: `Left voicemail ${daysAgo} days ago`,
          confidence: 0.9,
          action_type: 'call',
          action_payload: { phoneNumber },
          suggestion_key: `task:${task.id}:followup_call`,
        })
      }
    } else if (noAnswerCount >= 2) {
      // Multiple no-answers → suggest trying a different channel
      if (contactEmail) {
        suggestions.push({
          entity_type: 'task',
          entity_id: task.id,
          suggestion_type: 'followup',
          title: contactName ? `Email ${contactName} instead` : 'Try email — calls not connecting',
          detail: `Called ${noAnswerCount}× with no answer`,
          confidence: 0.9,
          action_type: 'email',
          action_payload: { email: contactEmail, subject: task.title },
          suggestion_key: `task:${task.id}:followup_email`,
        })
      } else {
        suggestions.push({
          entity_type: 'task',
          entity_id: task.id,
          suggestion_type: 'followup',
          title: contactName ? `Try ${contactName} again` : 'Try calling again',
          detail: `${noAnswerCount} previous attempts — no answer`,
          confidence: 0.75,
          action_type: 'call',
          action_payload: { phoneNumber },
          suggestion_key: `task:${task.id}:followup_call`,
        })
      }
    } else if (lastCall && lastCall.outcome === 'no_answer') {
      const daysAgo = Math.floor((now - new Date(lastCall.created_at).getTime()) / 86400000)
      if (daysAgo >= 1) {
        suggestions.push({
          entity_type: 'task',
          entity_id: task.id,
          suggestion_type: 'followup',
          title: contactName ? `Try ${contactName} again` : 'Try calling again',
          detail: `No answer ${daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}`,
          confidence: 0.85,
          action_type: 'call',
          action_payload: { phoneNumber },
          suggestion_key: `task:${task.id}:followup_call`,
        })
      }
    } else {
      suggestions.push({
        entity_type: 'task',
        entity_id: task.id,
        suggestion_type: 'call',
        title: label,
        detail: waitingDetail,
        confidence: isOverdue ? 0.95 : 0.8,
        action_type: 'call',
        action_payload: { phoneNumber },
        suggestion_key: `task:${task.id}:call`,
      })
    }
  }

  // ── Rule 2: Has email contact, no phone → suggest emailing (with follow-up awareness) ──
  if (contactEmail && !phoneNumber && !recentlyEmailed) {
    // Check if we emailed before and are waiting for a reply
    const recentEmailActions = taskActions
      .filter(a => (a.action_type === 'emailed' || a.action_type === 'email'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const lastEmail = recentEmailActions[0]

    if (lastEmail && lastEmail.outcome === 'sent') {
      const daysAgo = Math.floor((now - new Date(lastEmail.created_at).getTime()) / 86400000)
      if (daysAgo >= 3) {
        suggestions.push({
          entity_type: 'task',
          entity_id: task.id,
          suggestion_type: 'followup',
          title: contactName ? `Follow up with ${contactName}` : 'Follow up on email',
          detail: `Emailed ${daysAgo} days ago — no reply yet`,
          confidence: 0.85,
          action_type: 'email',
          action_payload: { email: contactEmail, subject: `Re: ${task.title}` },
          suggestion_key: `task:${task.id}:followup_email`,
        })
      }
    } else {
      suggestions.push({
        entity_type: 'task',
        entity_id: task.id,
        suggestion_type: 'email',
        title: contactName ? `Email ${contactName}` : 'Send an email',
        confidence: isOverdue ? 0.85 : 0.7,
        action_type: 'email',
        action_payload: { email: contactEmail, subject: task.title },
        suggestion_key: `task:${task.id}:email`,
      })
    }
  }

  // ── Rule 3: Has links → suggest opening ──
  if (task.links?.length && !recentlyOpenedLink) {
    const link = task.links[0]
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'open_link',
      title: link.title ? `Open ${link.title}` : 'Open link',
      confidence: 0.7,
      action_type: 'open_link',
      action_payload: { url: link.url, title: link.title },
      suggestion_key: `task:${task.id}:open_link`,
    })
  }

  // ── Rule 4: Has location → suggest navigation ──
  if (task.location && isOverdue) {
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'navigate',
      title: `Navigate to ${task.location}`,
      confidence: 0.6,
      action_type: 'navigate',
      action_payload: {
        location: task.location,
        placeId: task.location_place_id,
      },
      suggestion_key: `task:${task.id}:navigate`,
    })
  }

  // ── Rule 5: Waiting + 3+ days → suggest follow-up ──
  if (task.is_waiting && task.waiting_since) {
    const waitingDays = Math.floor((now - new Date(task.waiting_since).getTime()) / 86400000)
    if (waitingDays >= 3 && contactName) {
      // Pick best follow-up channel
      const actionType = phoneNumber ? 'call' : contactEmail ? 'email' : undefined
      const payload: Record<string, unknown> = {}
      if (phoneNumber) payload.phoneNumber = phoneNumber
      if (contactEmail) payload.email = contactEmail

      suggestions.push({
        entity_type: 'task',
        entity_id: task.id,
        suggestion_type: 'followup',
        title: `Follow up with ${contactName}`,
        detail: `Waiting ${waitingDays} days`,
        confidence: 0.9,
        action_type: actionType,
        action_payload: payload,
        suggestion_key: `task:${task.id}:followup`,
      })
    }
  }

  // ── Rule 6: Deferred 3+ times → suggest someday ──
  if ((task.defer_count ?? 0) >= 3) {
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'someday',
      title: `Deferred ${task.defer_count}× — move to Someday?`,
      confidence: 0.75,
      action_payload: {},
      suggestion_key: `task:${task.id}:someday`,
    })
  }

  // ── Rule 7: 7+ days overdue, no context → stale check ──
  if (daysOverdue >= 7 && !task.phone_number && !task.links?.length && !task.notes) {
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'stale',
      title: 'Still relevant?',
      detail: `${daysOverdue} days overdue, no context`,
      confidence: 0.6,
      action_payload: {},
      suggestion_key: `task:${task.id}:stale`,
    })
  }

  // ── Rule 8: Short overdue with notes → do today ──
  if (isOverdue && daysOverdue <= 2 && task.notes && suggestions.length === 0) {
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'do_today',
      title: 'Do today — you have notes ready',
      confidence: 0.65,
      action_payload: {},
      suggestion_key: `task:${task.id}:do_today`,
    })
  }

  // Return top 2 by confidence
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2)
}

// ── Rule-based calendar event suggestions ──
function generateCalendarSuggestions(
  event: CalendarEventRow,
  contactsMap: Map<string, ContactRow>,
  tasks: TaskRow[],
): Suggestion[] {
  const suggestions: Suggestion[] = []

  // Rule: Event has location → suggest navigation
  if (event.location) {
    suggestions.push({
      entity_type: 'calendar_event',
      entity_id: event.id,
      suggestion_type: 'navigate',
      title: `Navigate to ${event.location}`,
      confidence: 0.7,
      action_type: 'navigate',
      action_payload: { location: event.location },
      suggestion_key: `event:${event.id}:navigate`,
    })
  }

  // Rule: Event has attendees with contact matches → surface contact info
  if (event.attendees?.length) {
    const contactsByEmail = new Map<string, ContactRow>()
    for (const c of contactsMap.values()) {
      if (c.email) contactsByEmail.set(c.email.toLowerCase(), c)
    }

    for (const attendee of event.attendees) {
      const contact = contactsByEmail.get(attendee.email.toLowerCase())
      if (contact?.phone) {
        suggestions.push({
          entity_type: 'calendar_event',
          entity_id: event.id,
          suggestion_type: 'call',
          title: `Call ${contact.name}`,
          detail: `Attending ${event.title}`,
          confidence: 0.5,
          action_type: 'call',
          action_payload: { phoneNumber: contact.phone },
          suggestion_key: `event:${event.id}:call:${contact.id}`,
        })
        break // One contact suggestion per event
      }
    }
  }

  return suggestions.slice(0, 2)
}

// ── Fetch today's calendar events from Google Calendar API ──
async function fetchCalendarEvents(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<CalendarEventRow[]> {
  // Get calendar connection
  const { data: connection } = await supabase
    .from('calendar_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single()

  if (!connection) return []

  // Refresh token if needed
  let accessToken = connection.access_token
  const expiresAt = new Date(connection.token_expires_at)
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) return []

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const tokenData = await tokenResponse.json()
    if (tokenData.error) return []

    accessToken = tokenData.access_token
    await supabase
      .from('calendar_connections')
      .update({
        access_token: tokenData.access_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google')
  }

  // Fetch today's events from primary calendar
  const today = new Date()
  const timeMin = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const timeMax = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const calData = await calResponse.json()
  if (calData.error || !calData.items) return []

  return calData.items.map((item: Record<string, unknown>) => ({
    id: item.id as string,
    title: (item.summary as string) || 'Untitled event',
    description: item.description as string | null,
    start_time: ((item.start as Record<string, string>)?.dateTime || (item.start as Record<string, string>)?.date) ?? '',
    end_time: ((item.end as Record<string, string>)?.dateTime || (item.end as Record<string, string>)?.date) ?? '',
    all_day: !(item.start as Record<string, string>)?.dateTime,
    location: item.location as string | null,
    attendees: item.attendees as { email: string; displayName?: string }[] | undefined,
  }))
}

// ── LLM reasoning pass ──
async function runLLMPass(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tasks: TaskRow[],
  calendarEvents: CalendarEventRow[],
  emailActions: EmailActionRow[],
  contactsMap: Map<string, ContactRow>,
  recentActions: ActionHistoryRow[],
  existingRuleSuggestions: Suggestion[],
): Promise<Suggestion[]> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    console.log('ANTHROPIC_API_KEY not set, skipping LLM pass')
    return []
  }

  // Build context for the LLM — only items that need AI reasoning
  // Skip tasks that already have good rule-based suggestions
  const ruleEntityIds = new Set(existingRuleSuggestions.map(s => s.entity_id))

  // Tasks needing AI: complex/reflective, stale with context, or no rule suggestions
  const aiTasks = tasks
    .filter(t => !ruleEntityIds.has(t.id) || (t.notes && t.notes.length > 50))
    .slice(0, 8) // Cap to control token usage (context bundles are heavier than one-liners)

  // All calendar events (they need inference for downstream needs)
  const aiEvents = calendarEvents.slice(0, 10)

  // Active email action items
  const aiEmails = emailActions.slice(0, 10)

  if (aiTasks.length === 0 && aiEvents.length === 0 && aiEmails.length === 0) {
    return []
  }

  // Assemble rich context bundles for the AI tasks (best-effort per-task; a failed
  // assembly degrades to omission rather than failing the whole pass).
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? undefined
  const bundles = await Promise.all(aiTasks.map(t =>
    assembleContext({ client: supabase, openAiKey }, { entityType: 'task', entityId: t.id, userId })
      .catch(() => null)
  ))

  // Build contacts lookup string
  const contactsList = Array.from(contactsMap.values())
    .map(c => `${c.name} (${c.relationship || c.category || 'contact'})${c.phone ? ` phone:${c.phone}` : ''}${c.email ? ` email:${c.email}` : ''}`)
    .slice(0, 20)
    .join('\n')

  // Build recent actions summary
  const actionsSummary = recentActions.slice(0, 20)
    .map(a => `${a.action_type} on ${a.entity_type}:${a.entity_id} — ${a.detail || ''} (${a.outcome || ''})`)
    .join('\n')

  const prompt = `You are a proactive personal assistant. Analyze the user's tasks, calendar events, and emails to find non-obvious connections and suggest specific next actions.

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

CONTACTS:
${contactsList || 'None'}

RECENT ACTIONS (what the user already did — do NOT suggest these again):
${actionsSummary || 'None'}

TASKS (each with its assembled context):
${bundles.filter(Boolean).map(b => renderBundleForPrompt(b!)).join('\n\n') || 'None'}

CALENDAR EVENTS TODAY:
${aiEvents.map(e => `- [${e.id}] "${e.title}" at ${e.start_time}${e.location ? ` location: ${e.location}` : ''}${e.description ? ` desc: ${e.description.substring(0, 150)}` : ''}${e.attendees?.length ? ` attendees: ${e.attendees.map(a => a.displayName || a.email).join(', ')}` : ''}`).join('\n') || 'None'}

EMAIL ACTION ITEMS:
${aiEmails.map(e => `- [${e.id}] "${e.title}" from ${e.email_from || 'unknown'} (${e.urgency}, ${e.category})${e.due_date ? ` due: ${e.due_date}` : ''}${e.description ? ` — ${e.description.substring(0, 150)}` : ''}`).join('\n') || 'None'}

For each item where you find a useful insight, return a suggestion. Focus on:
1. Calendar events that imply downstream needs (childcare, preparation, packing, travel)
2. Cross-entity connections (an email mentions something related to a task or event)
3. Tasks that are complex/reflective and would benefit from guided thinking
4. Stale tasks that need a personalized nudge based on their notes
5. Each task's NOTES and ATTACHED FACTS lines that add useful background (related notes, prior decisions, extracted phone numbers/codes)

Rules:
- Be SPECIFIC with actions. Include phone numbers, email addresses from contacts.
- Max 8 suggestions total. Skip items that need no help.
- Do NOT suggest things the user already did (check recent actions).
- Do NOT duplicate what rule-based suggestions already cover.
- For calendar events, entity_type must be "calendar_event" and entity_id is the event ID.
- For tasks, entity_type must be "task" and entity_id is the task ID.
- For email actions, entity_type must be "email_action" and entity_id is the email action ID.

Return ONLY a JSON array (no markdown, no explanation):
[{
  "entity_type": "task"|"calendar_event"|"email_action",
  "entity_id": "...",
  "suggestion_type": "call"|"text"|"email"|"open_link"|"guided_chat"|"create_task"|"navigate"|"followup",
  "title": "Short action title",
  "detail": "Brief context why",
  "confidence": 0.0-1.0,
  "action_type": "call"|"text"|"email"|"open_link"|"guided_chat"|"create_task"|"navigate"|null,
  "action_payload": { "phoneNumber": "...", "email": "...", "url": "...", "messageTemplate": "...", "subject": "..." }
}]`

  try {
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiResponse.ok) {
      console.error('LLM API error:', aiResponse.status, await aiResponse.text())
      return []
    }

    const aiData = await aiResponse.json()
    const content = aiData.content?.[0]?.text
    if (!content) return []

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed: LLMSuggestion[] = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) return []

    // Convert to Suggestion format with dedup keys
    return parsed
      .filter(s => s.entity_id && s.title && s.suggestion_type)
      .map(s => ({
        ...s,
        confidence: Math.min(Math.max(s.confidence || 0.7, 0.1), 1.0),
        action_payload: s.action_payload || {},
        suggestion_key: `${s.entity_type}:${s.entity_id}:llm:${s.suggestion_type}`,
      }))
      .slice(0, 8)
  } catch (err) {
    console.error('LLM pass failed:', err)
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    let userId: string
    if (token === supabaseServiceKey) {
      // Cron/service invocation: trusted caller names the user explicitly.
      const body = await req.json().catch(() => ({}))
      if (typeof body.user_id !== 'string') {
        return new Response(JSON.stringify({ error: 'user_id required for service invocation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = body.user_id
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = user.id
    }

    // ── GATHER DATA ──

    // Active tasks (not completed)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, completed, bucket, scheduled_for, context, notes, links, phone_number, contact_id, assigned_to, project_id, is_waiting, waiting_since, defer_count, location, location_place_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('scheduled_for', { ascending: true })

    // Attached facets for all tasks (one batch query, not per-task)
    const taskIds = (tasks || []).map(t => t.id)
    const { data: taskAttachments } = taskIds.length > 0
      ? await supabase.from('attachments').select('id, entity_id, facets')
          .eq('user_id', userId).eq('entity_type', 'task').in('entity_id', taskIds).not('facets', 'is', null)
      : { data: [] }
    const factsByTask = new Map<string, ReturnType<typeof facetsToFacts>>()
    for (const att of (taskAttachments || []) as { id: string; entity_id: string; facets: unknown }[]) {
      const facts = facetsToFacts([att])
      if (facts.length) factsByTask.set(att.entity_id, [...(factsByTask.get(att.entity_id) || []), ...facts])
    }

    // Contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, phone, email, category, relationship')
      .eq('user_id', userId)

    // Recent action history (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: actionHistory } = await supabase
      .from('action_history')
      .select('entity_type, entity_id, action_type, detail, outcome, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })

    const contactsMap = new Map<string, ContactRow>()
    for (const c of contacts || []) {
      contactsMap.set(c.id, c)
    }

    // Calendar events (today)
    let calendarEvents: CalendarEventRow[] = []
    try {
      calendarEvents = await fetchCalendarEvents(supabase, userId)
    } catch (err) {
      console.error('Failed to fetch calendar events:', err)
    }

    // Email action items (active)
    const { data: emailActions } = await supabase
      .from('email_action_items')
      .select('id, title, description, category, urgency, due_date, email_subject, email_from, relevant_member_id, status')
      .eq('user_id', userId)
      .in('status', ['new', 'acknowledged'])
      .order('urgency', { ascending: true })
      .limit(15)

    // ── GENERATE SUGGESTIONS ──

    const allSuggestions: Suggestion[] = []

    // 1. Rule-based task suggestions
    for (const task of tasks || []) {
      const taskSuggestions = generateTaskSuggestions(
        task as TaskRow,
        contactsMap,
        (actionHistory || []) as ActionHistoryRow[],
      )
      allSuggestions.push(...taskSuggestions)

      // Dedupe facet_call against the contact-phone rule above: when a task's
      // linked contact has a phone, generateTaskSuggestions already pushed a
      // `task:{id}:call` suggestion for it (line ~221) — the phone-facet rule
      // would add a second "call" chip with a different number. facet_link
      // has no such overlapping rule, so it's untouched. facetRules.ts itself
      // stays pure/unaware of sibling suggestions — this ordering-dependent
      // check belongs at the wiring site, not in the tested rule module.
      for (const facetSuggestion of facetRuleSuggestions(task as TaskRow, factsByTask.get(task.id) || [])) {
        const alreadyHasCall = facetSuggestion.suggestion_type === 'call' &&
          allSuggestions.some((s) => s.entity_id === facetSuggestion.entity_id && s.suggestion_type === 'call')
        if (alreadyHasCall) continue
        allSuggestions.push(facetSuggestion)
      }
    }

    // 2. Rule-based calendar event suggestions
    for (const event of calendarEvents) {
      const eventSuggestions = generateCalendarSuggestions(
        event,
        contactsMap,
        (tasks || []) as TaskRow[],
      )
      allSuggestions.push(...eventSuggestions)
    }

    // 3. LLM reasoning pass (calendar inference, cross-entity connections)
    try {
      const llmSuggestions = await runLLMPass(
        supabase,
        userId,
        (tasks || []) as TaskRow[],
        calendarEvents,
        (emailActions || []) as EmailActionRow[],
        contactsMap,
        (actionHistory || []) as ActionHistoryRow[],
        allSuggestions,
      )
      allSuggestions.push(...llmSuggestions)
    } catch (err) {
      console.error('LLM pass error:', err)
    }

    // ── SMART RANKING — adjust confidence based on dismiss/act history ──
    try {
      // Get historical suggestion outcomes (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: historicalSuggestions } = await supabase
        .from('proactive_suggestions')
        .select('suggestion_type, status')
        .eq('user_id', userId)
        .in('status', ['acted', 'dismissed'])
        .gte('updated_at', thirtyDaysAgo)

      if (historicalSuggestions && historicalSuggestions.length >= 5) {
        // Calculate act rate per suggestion type
        const typeStats = new Map<string, { acted: number; dismissed: number }>()
        for (const s of historicalSuggestions) {
          const stats = typeStats.get(s.suggestion_type) || { acted: 0, dismissed: 0 }
          if (s.status === 'acted') stats.acted++
          else if (s.status === 'dismissed') stats.dismissed++
          typeStats.set(s.suggestion_type, stats)
        }

        // Apply multiplier: types with high dismiss rates get dampened
        for (const suggestion of allSuggestions) {
          const stats = typeStats.get(suggestion.suggestion_type)
          if (!stats || (stats.acted + stats.dismissed) < 3) continue
          const actRate = stats.acted / (stats.acted + stats.dismissed)
          // Scale: 0% act rate → 0.5x, 50% → 1.0x, 100% → 1.2x
          const multiplier = 0.5 + actRate * 0.7
          suggestion.confidence = Math.min(Math.max(suggestion.confidence * multiplier, 0.1), 1.0)
        }
      }
    } catch (err) {
      console.error('Smart ranking error (continuing):', err)
    }

    // ── WRITE TO DB ──

    // Expire old suggestions first (>24h active with no action)
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString()
    await supabase
      .from('proactive_suggestions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
      .lt('generated_at', oneDayAgo)

    // Upsert new suggestions
    if (allSuggestions.length > 0) {
      const rows = allSuggestions.map(s => ({
        user_id: userId,
        entity_type: s.entity_type,
        entity_id: s.entity_id,
        suggestion_type: s.suggestion_type,
        title: s.title,
        detail: s.detail || null,
        confidence: s.confidence,
        action_type: s.action_type || null,
        action_payload: s.action_payload,
        status: 'active',
        suggestion_key: s.suggestion_key,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      }))

      const { error: upsertError } = await supabase
        .from('proactive_suggestions')
        .upsert(rows, {
          onConflict: 'user_id,suggestion_key',
          ignoreDuplicates: false,
        })

      if (upsertError) {
        console.error('Upsert error:', upsertError)
      }
    }

    // Remove suggestions for tasks that no longer exist or are completed
    const activeTaskIds = new Set((tasks || []).map(t => t.id))
    const { data: existingSuggestions } = await supabase
      .from('proactive_suggestions')
      .select('id, entity_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('entity_type', 'task')

    const staleIds = (existingSuggestions || [])
      .filter(s => !activeTaskIds.has(s.entity_id))
      .map(s => s.id)

    if (staleIds.length > 0) {
      await supabase
        .from('proactive_suggestions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', staleIds)
    }

    return new Response(JSON.stringify({
      success: true,
      generated: allSuggestions.length,
      tasksAnalyzed: (tasks || []).length,
      eventsAnalyzed: calendarEvents.length,
      emailsAnalyzed: (emailActions || []).length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Proactive engine error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
