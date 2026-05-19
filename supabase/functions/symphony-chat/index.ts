import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mealHandoffRule } from './mealHandoff.ts'
export { mealHandoffRule }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface EntityContext {
  type: 'task' | 'contact' | 'project' | 'event' | 'routine'
  id: string
  name: string
}

interface ChatRequest {
  messages: ChatMessage[]
  entityContext?: EntityContext
  mode?: 'chat' | 'guided_reflection'
}

/**
 * Get today's date boundaries in UTC, adjusted for US Eastern time.
 * The user is in America/New_York (ET). Tasks scheduled for "today" in ET
 * are stored as timestamps like "2026-03-24 04:00:00+00" (midnight ET = 4am UTC during EDT)
 * or "2026-03-24 05:00:00+00" (midnight ET = 5am UTC during EST).
 *
 * We compute "today" in ET, then return UTC boundaries for that ET day.
 * ET day start = midnight ET = 4am or 5am UTC
 * ET day end   = next midnight ET = next day 4am or 5am UTC
 */
function getTodayBoundsUTC(): { todayStart: string; todayEnd: string; todayLabel: string } {
  const now = new Date()

  // Format in America/New_York to get the actual local date
  const etDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // yields YYYY-MM-DD
  const etParts = etDateStr.split('-')
  const year = parseInt(etParts[0])
  const month = parseInt(etParts[1]) - 1 // 0-indexed
  const day = parseInt(etParts[2])

  // Build midnight ET for today and tomorrow using a trick:
  // Create date at noon UTC on that day, then adjust.
  // Instead, we use the ET offset. During EDT (Mar-Nov): UTC-4, during EST (Nov-Mar): UTC-5.
  // We can determine this by checking the offset for the current moment.
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utcNow = now.getTime()
  const etNowTime = etNow.getTime()
  // This gives approximate offset; let's just use a reliable method.
  // Use Intl to get the timezone offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(now)
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5'
  // tzPart is like "GMT-4" or "GMT-5"
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/)
  const etOffsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -5

  // Midnight ET today in UTC = today's date at 00:00 ET = today's date at (-etOffsetHours):00 UTC
  // e.g., EDT (offset -4): midnight ET = 04:00 UTC
  //       EST (offset -5): midnight ET = 05:00 UTC
  const midnightETasUTCHour = -etOffsetHours // 4 for EDT, 5 for EST

  // Build the UTC timestamps for start/end of today in ET
  const todayStartUTC = new Date(Date.UTC(year, month, day, midnightETasUTCHour, 0, 0))
  const todayEndUTC = new Date(Date.UTC(year, month, day + 1, midnightETasUTCHour, 0, 0))

  return {
    todayStart: todayStartUTC.toISOString(),
    todayEnd: todayEndUTC.toISOString(),
    todayLabel: etDateStr,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User-scoped client for RLS
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service client for reading entity details
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await serviceSupabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { messages, entityContext, mode }: ChatRequest = await req.json()
    const isGuidedReflection = mode === 'guided_reflection'

    if (!messages?.length) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ================================================================
    // 1. Gather context — run independent queries in parallel
    // ================================================================
    const contextParts: string[] = []
    const sourceNotes: { id: string; title: string; vaultPath?: string }[] = []

    const { todayStart, todayEnd, todayLabel } = getTodayBoundsUTC()

    // Fire off all independent data fetches in parallel
    const [
      todayTasksResult,
      contactsResult,
      projectsResult,
      entityDetailsResult,
      linkedNotesResult,
    ] = await Promise.all([
      // Today's tasks (using proper UTC bounds for ET timezone)
      serviceSupabase
        .from('tasks')
        .select('id, title, completed, scheduled_for, context, notes, phone_number, location, project_id, contact_id')
        .eq('user_id', user.id)
        .gte('scheduled_for', todayStart)
        .lt('scheduled_for', todayEnd)
        .order('scheduled_for', { ascending: true })
        .limit(50),

      // All contacts (summary)
      serviceSupabase
        .from('contacts')
        .select('id, name, category, relationship, phone, email')
        .eq('user_id', user.id)
        .order('name', { ascending: true })
        .limit(100),

      // Active projects (summary)
      serviceSupabase
        .from('projects')
        .select('id, name, status, context, notes')
        .eq('user_id', user.id)
        .in('status', ['not_started', 'in_progress', 'on_hold'])
        .order('name', { ascending: true })
        .limit(50),

      // Entity details if viewing something specific
      entityContext
        ? fetchEntityDetails(serviceSupabase, user.id, entityContext)
        : Promise.resolve(null),

      // Linked notes if viewing an entity
      entityContext
        ? userSupabase
            .from('note_entity_links')
            .select('note_id')
            .eq('entity_type', entityContext.type)
            .eq('entity_id', entityContext.id)
        : Promise.resolve({ data: null }),
    ])

    // Process today's tasks
    const todayTasks = todayTasksResult.data
    console.log(`Tasks query for ${todayLabel} (${todayStart} to ${todayEnd}): found ${todayTasks?.length ?? 0}, error: ${todayTasksResult.error?.message ?? 'none'}`)

    if (todayTasks?.length) {
      contextParts.push("## Today's Tasks (" + todayLabel + ")\n" + todayTasks.map(t => {
        const status = t.completed ? '[done]' : '[todo]'
        const extra = [
          t.context && `(${t.context})`,
          t.notes && `Notes: ${t.notes.slice(0, 200)}`,
          t.phone_number && `Phone: ${t.phone_number}`,
          t.location && `Location: ${t.location}`,
        ].filter(Boolean).join(' | ')
        return `- ${status} ${t.title}${extra ? ' -- ' + extra : ''}`
      }).join('\n'))
    }

    // Fallback: if no tasks found for today, fetch recent incomplete tasks
    if (!todayTasks?.length) {
      const { data: incompleteTasks } = await serviceSupabase
        .from('tasks')
        .select('id, title, completed, scheduled_for, context, notes, phone_number, location, project_id, contact_id')
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('scheduled_for', { ascending: false, nullsFirst: false })
        .limit(20)

      if (incompleteTasks?.length) {
        contextParts.push("## Incomplete Tasks (no tasks found for today, showing recent incomplete)\n" + incompleteTasks.map(t => {
          const when = t.scheduled_for ? `[${new Date(t.scheduled_for).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}]` : '[inbox]'
          const extra = [
            t.context && `(${t.context})`,
            t.notes && `Notes: ${t.notes.slice(0, 150)}`,
            t.phone_number && `Phone: ${t.phone_number}`,
          ].filter(Boolean).join(' | ')
          return `- ${when} ${t.title}${extra ? ' -- ' + extra : ''}`
        }).join('\n'))
      }
    }

    // Process contacts summary
    const contacts = contactsResult.data
    if (contacts?.length) {
      contextParts.push("## Contacts\n" + contacts.map(c => {
        const details = [
          c.category && `(${c.category})`,
          c.relationship && c.relationship,
          c.phone && `Phone: ${c.phone}`,
          c.email && `Email: ${c.email}`,
        ].filter(Boolean).join(' | ')
        return `- **${c.name}**${details ? ' -- ' + details : ''}`
      }).join('\n'))
    }

    // Process projects summary
    const projects = projectsResult.data
    if (projects?.length) {
      contextParts.push("## Active Projects\n" + projects.map(p => {
        const details = [
          p.status && `Status: ${p.status}`,
          p.context && `(${p.context})`,
          p.notes && `Notes: ${p.notes.slice(0, 150)}`,
        ].filter(Boolean).join(' | ')
        return `- **${p.name}**${details ? ' -- ' + details : ''}`
      }).join('\n'))
    }

    // Process entity context
    if (entityContext && entityDetailsResult) {
      contextParts.push(`## Currently Viewing: ${entityContext.type}\n${entityDetailsResult}`)
    }

    // Process linked notes
    const linkedLinks = linkedNotesResult?.data as { note_id: string }[] | null
    if (linkedLinks?.length) {
      const noteIds = linkedLinks.map(l => l.note_id)
      const { data: linkedNotes } = await userSupabase
        .from('notes')
        .select('id, title, content, vault_path, vault_domain')
        .in('id', noteIds)
        .limit(10)

      if (linkedNotes?.length) {
        contextParts.push('## Linked Notes\n' + linkedNotes.map(n => {
          sourceNotes.push({ id: n.id, title: n.title || 'Untitled', vaultPath: n.vault_path })
          return `### ${n.title || 'Untitled'}${n.vault_domain ? ` [${n.vault_domain}]` : ''}\n${n.content?.slice(0, 1500) || '(empty)'}`
        }).join('\n\n'))
      }
    }

    // Semantic search for the latest user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content
    if (lastUserMessage) {
      // Generate embedding for user's question
      const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: lastUserMessage,
        }),
      })

      if (embResponse.ok) {
        const embResult = await embResponse.json()
        const queryEmbedding = embResult.data?.[0]?.embedding

        if (queryEmbedding) {
          // Use lower threshold (0.25) for better recall
          const { data: semanticResults, error: searchErr } = await userSupabase.rpc('search_notes_semantic', {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: 0.25,
            match_count: 8,
            filter_vault_domain: null,
          })
          console.log(`Semantic search for "${lastUserMessage.slice(0, 80)}": ${semanticResults?.length ?? 0} results, error: ${searchErr?.message ?? 'none'}`)

          if (semanticResults?.length) {
            // Deduplicate against already-linked notes
            const existingIds = new Set(sourceNotes.map(n => n.id))
            const newResults = semanticResults.filter((r: { id: string }) => !existingIds.has(r.id))

            if (newResults.length) {
              contextParts.push('## Related Notes (semantic search)\n' + newResults.map((r: { id: string; title: string; content: string; vault_path: string; vault_domain: string; similarity: number }) => {
                sourceNotes.push({ id: r.id, title: r.title || 'Untitled', vaultPath: r.vault_path })
                return `### ${r.title || 'Untitled'}${r.vault_domain ? ` [${r.vault_domain}]` : ''} (relevance: ${Math.round(r.similarity * 100)}%)\n${r.content?.slice(0, 1500) || '(empty)'}`
              }).join('\n\n'))
            }
          }
        }
      }
    }

    // ================================================================
    // 2. Build prompt and call Haiku
    // ================================================================
    const contextBlock = contextParts.length > 0
      ? '---\n\n# Available Context\n\n' + contextParts.join('\n\n---\n\n')
      : 'No additional context available for this query.'

    const systemPrompt = isGuidedReflection
      ? `You are a thinking partner inside Symphony, a personal OS for work, life, and family.

Your role is to help the user think through a topic by asking good questions. You are the interviewer — the user is the author. Draw out THEIR thinking, don't generate ideas for them.

## How it works:

1. START by asking one clear, open-ended question related to the topic. Keep it warm and specific.
2. LISTEN to their response, then ask a follow-up that goes deeper. Ask about feelings, motivations, or tensions — not just logistics.
3. After 3-4 exchanges (when you feel you have enough substance), SYNTHESIZE their thinking into a clean note draft.
4. The draft should read like THEY wrote it — distilling their own words and insights, not AI-generated filler.

## When you synthesize, format the draft inside a special fence:

\`\`\`
:::vault-draft
## [Title that captures the essence]
[Their thinking, organized and distilled. Use first person. Keep their voice. No AI slop — no "journey", no "tapestry", no "in conclusion". Just their honest thinking, structured clearly.]
:::
\`\`\`

Include a brief message before the fence like "Here's what I heard — take a look and save it if it's worth keeping."

## Rules:
- Ask ONE question at a time. Never rapid-fire multiple questions.
- Keep your questions short (1-2 sentences).
- Do not offer advice unless asked. You are a mirror, not a coach.
- The vault draft is a PROPOSAL. The user will review, edit, and choose whether to save it. Make it worth saving.
- Reference context from their tasks/notes/projects if it adds depth, but don't force it.
- The user has Parkinson's disease. Keep interactions focused and easy to engage with.
- Today's date is ${todayLabel} (US Eastern time).

${contextBlock}`
      : `${mealHandoffRule}

You are Symphony's contextual AI assistant. You help the user manage work, life, and family by surfacing the right information at the right moment.

You have access to the user's vault notes (personal knowledge base) and Symphony data (tasks, contacts, projects, calendar events). When answering:

- Be concise and actionable. No filler.
- Reference specific information from the context provided.
- If you cite a vault note, mention its title so the user can find it.
- If you don't have enough context to answer, say so plainly.
- Never make up information that isn't in the provided context.
- The user has Parkinson's disease. Keep responses focused and easy to act on.
- Today's date is ${todayLabel} (US Eastern time).

${contextBlock}`

    const anthropicMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    })

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text()
      console.error('Anthropic API error:', errText)
      return new Response(JSON.stringify({ error: 'AI response failed', details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicResult = await anthropicResponse.json()
    const assistantMessage = anthropicResult.content?.[0]?.text ?? 'No response generated.'

    return new Response(JSON.stringify({
      message: assistantMessage,
      sources: sourceNotes,
      usage: anthropicResult.usage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in symphony-chat:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', stack: error instanceof Error ? error.stack : undefined }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function fetchEntityDetails(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  entity: EntityContext,
): Promise<string | null> {
  switch (entity.type) {
    case 'task': {
      const { data } = await supabase
        .from('tasks')
        .select('title, notes, scheduled_for, context, completed, phone_number, location')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.title}**`]
      if (data.scheduled_for) parts.push(`Scheduled: ${data.scheduled_for}`)
      if (data.context) parts.push(`Context: ${data.context}`)
      if (data.completed) parts.push('Status: Completed')
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      if (data.phone_number) parts.push(`Phone: ${data.phone_number}`)
      if (data.location) parts.push(`Location: ${data.location}`)
      return parts.join('\n')
    }
    case 'contact': {
      const { data } = await supabase
        .from('contacts')
        .select('name, phone, email, notes, category, relationship, preferences')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.name}**`]
      if (data.category) parts.push(`Category: ${data.category}`)
      if (data.relationship) parts.push(`Relationship: ${data.relationship}`)
      if (data.phone) parts.push(`Phone: ${data.phone}`)
      if (data.email) parts.push(`Email: ${data.email}`)
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      if (data.preferences) parts.push(`Preferences: ${data.preferences}`)
      return parts.join('\n')
    }
    case 'project': {
      const { data } = await supabase
        .from('projects')
        .select('name, notes, status, context')
        .eq('id', entity.id)
        .eq('user_id', userId)
        .single()
      if (!data) return null
      const parts = [`**${data.name}**`]
      if (data.status) parts.push(`Status: ${data.status}`)
      if (data.context) parts.push(`Context: ${data.context}`)
      if (data.notes) parts.push(`Notes: ${data.notes}`)
      return parts.join('\n')
    }
    default:
      return null
  }
}
